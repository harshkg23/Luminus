// ============================================================================
// TollGate — Apply patch to target repo and push branch
//
// Uses the GitHub REST API (get file → patch → commit) to avoid the slow
// git clone/push approach that causes 502 timeouts in the HTTP chain.
// ============================================================================

export interface ApplyPatchOptions {
  owner: string;
  repo: string;
  baseBranch: string;
  headBranch: string;
  proposedPatch: string;
  sessionId: string;
  githubToken: string;
}

export interface ApplyPatchResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Parse a unified diff and apply it to file contents via string replacement.
// Tries exact match first, then falls back to whitespace-normalized matching.
// ---------------------------------------------------------------------------

function trimTrailingPerLine(s: string): string {
  return s.split("\n").map((l) => l.trimEnd()).join("\n");
}

function collapseWhitespace(s: string): string {
  return s.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).join("\n");
}

function fuzzyIndexOf(haystack: string, needle: string): { idx: number; matchLen: number } | null {
  // 1. Exact match
  const exact = haystack.indexOf(needle);
  if (exact !== -1) return { idx: exact, matchLen: needle.length };

  // 2. Trailing-whitespace-trimmed match
  const hTrimmed = trimTrailingPerLine(haystack);
  const nTrimmed = trimTrailingPerLine(needle);
  const trimIdx = hTrimmed.indexOf(nTrimmed);
  if (trimIdx !== -1) {
    const beforeLines = hTrimmed.substring(0, trimIdx).split("\n").length - 1;
    const needleLines = nTrimmed.split("\n").length;
    const origLines = haystack.split("\n");
    const startOffset = origLines.slice(0, beforeLines).join("\n").length + (beforeLines > 0 ? 1 : 0);
    const matchChunk = origLines.slice(beforeLines, beforeLines + needleLines).join("\n");
    return { idx: startOffset, matchLen: matchChunk.length };
  }

  // 3. Collapsed-whitespace match (last resort)
  const hCollapsed = collapseWhitespace(haystack);
  const nCollapsed = collapseWhitespace(needle);
  const collIdx = hCollapsed.indexOf(nCollapsed);
  if (collIdx !== -1) {
    const beforeLines = hCollapsed.substring(0, collIdx).split("\n").length - 1;
    const needleLines = nCollapsed.split("\n").length;
    const origLines = haystack.split("\n");
    const startOffset = origLines.slice(0, beforeLines).join("\n").length + (beforeLines > 0 ? 1 : 0);
    const matchChunk = origLines.slice(beforeLines, beforeLines + needleLines).join("\n");
    return { idx: startOffset, matchLen: matchChunk.length };
  }

  return null;
}

function applyUnifiedDiff(original: string, patch: string): string | null {
  let result = original.replace(/\r\n/g, "\n");

  const hunkRe = /^@@[^@@]*@@[^\n]*\n([\s\S]*?)(?=\n@@|\ndiff |$)/gm;
  let hunk: RegExpExecArray | null;
  let appliedCount = 0;

  while ((hunk = hunkRe.exec(patch)) !== null) {
    const hunkBody = hunk[1];
    const removedLines: string[] = [];
    const addedLines: string[] = [];

    for (const line of hunkBody.split("\n")) {
      if (line.startsWith("-") && !line.startsWith("---")) {
        removedLines.push(line.slice(1));
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        addedLines.push(line.slice(1));
      }
    }

    if (removedLines.length === 0) continue;

    const needle = removedLines.join("\n");
    const replacement = addedLines.join("\n");
    const match = fuzzyIndexOf(result, needle);

    if (!match) {
      console.warn(`[PatchApply] Hunk lines not found in file (even with fuzzy):\n${needle.substring(0, 200)}`);
      continue;
    }

    result = result.slice(0, match.idx) + replacement + result.slice(match.idx + match.matchLen);
    appliedCount++;
    console.log(`[PatchApply] Applied hunk ${appliedCount}`);
  }

  return appliedCount > 0 ? result : null;
}

// ---------------------------------------------------------------------------
// GitHub REST API helpers
// ---------------------------------------------------------------------------
async function ghGet(url: string, token: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function ghPut(url: string, token: string, body: object) {
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${url} → ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Create (or update) a branch ref via GitHub API.
 */
async function ensureBranch(
  owner: string,
  repo: string,
  headBranch: string,
  baseBranch: string,
  token: string
): Promise<void> {
  // Get the SHA of the base branch HEAD
  const baseData = await ghGet(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${baseBranch}`,
    token
  );
  const baseSha: string = baseData.object.sha;

  // Try to create the new branch
  const createRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: `refs/heads/${headBranch}`, sha: baseSha }),
    }
  );

  if (createRes.status === 422) {
    // Branch already exists — force-update it
    await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${headBranch}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ sha: baseSha, force: true }),
      }
    );
  } else if (!createRes.ok) {
    throw new Error(`Failed to create branch: ${createRes.status} ${await createRes.text()}`);
  }
}

export interface FileEditInput {
  file: string;
  search: string;
  replace: string;
}

/**
 * Apply search/replace edits to files on an existing branch via GitHub API.
 * Much more reliable than unified diff patching — LLMs generate these accurately.
 */
export async function applyFileEdits(options: {
  owner: string;
  repo: string;
  branch: string;
  edits: FileEditInput[];
  sessionId: string;
  githubToken: string;
}): Promise<ApplyPatchResult> {
  const { owner, repo, branch, edits, sessionId, githubToken } = options;

  if (!githubToken?.trim()) {
    return { success: false, error: "GITHUB_PERSONAL_ACCESS_TOKEN required" };
  }
  if (!edits?.length) {
    return { success: false, error: "No file edits provided" };
  }

  let appliedCount = 0;

  // Group edits by file so we batch multiple edits to the same file
  const editsByFile = new Map<string, FileEditInput[]>();
  for (const edit of edits) {
    const existing = editsByFile.get(edit.file) ?? [];
    existing.push(edit);
    editsByFile.set(edit.file, existing);
  }

  for (const [filePath, fileEdits] of editsByFile) {
    let fileData: { content: string; sha: string };
    try {
      fileData = await ghGet(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
        githubToken
      );
    } catch (err) {
      console.warn(`[FileEdits] Could not fetch ${filePath}: ${err}`);
      continue;
    }

    let content = Buffer.from(fileData.content, "base64").toString("utf-8");
    let fileChanged = false;

    for (const edit of fileEdits) {
      const searchStr = edit.search;
      const replaceStr = edit.replace;

      // Try exact match first
      if (content.includes(searchStr)) {
        content = content.replace(searchStr, replaceStr);
        console.log(`[FileEdits] ✅ Applied edit to ${filePath} (exact match)`);
        fileChanged = true;
        continue;
      }

      // Try with normalized line endings
      const normalizedContent = content.replace(/\r\n/g, "\n");
      const normalizedSearch = searchStr.replace(/\r\n/g, "\n");
      if (normalizedContent.includes(normalizedSearch)) {
        content = normalizedContent.replace(normalizedSearch, replaceStr.replace(/\r\n/g, "\n"));
        console.log(`[FileEdits] ✅ Applied edit to ${filePath} (normalized line endings)`);
        fileChanged = true;
        continue;
      }

      // Try with trimmed trailing whitespace per line
      const trimmedContent = normalizedContent.split("\n").map(l => l.trimEnd()).join("\n");
      const trimmedSearch = normalizedSearch.split("\n").map(l => l.trimEnd()).join("\n");
      if (trimmedContent.includes(trimmedSearch)) {
        const lines = normalizedContent.split("\n");
        const searchLines = trimmedSearch.split("\n");
        const replaceLines = replaceStr.replace(/\r\n/g, "\n").split("\n");

        // Find the starting line
        for (let i = 0; i <= lines.length - searchLines.length; i++) {
          const match = searchLines.every((sl, j) => lines[i + j].trimEnd() === sl);
          if (match) {
            lines.splice(i, searchLines.length, ...replaceLines);
            content = lines.join("\n");
            console.log(`[FileEdits] ✅ Applied edit to ${filePath} (trimmed whitespace match)`);
            fileChanged = true;
            break;
          }
        }
        continue;
      }

      console.warn(`[FileEdits] ⚠️ Search text not found in ${filePath}: "${searchStr.substring(0, 80)}..."`);
    }

    if (!fileChanged) continue;

    try {
      await ghPut(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
        githubToken,
        {
          message: `fix: TollGate healer auto-fix (${sessionId})`,
          content: Buffer.from(content, "utf-8").toString("base64"),
          sha: fileData.sha,
          branch,
        }
      );
      console.log(`[FileEdits] ✅ Committed fix for ${filePath}`);
      appliedCount++;
    } catch (err) {
      console.warn(`[FileEdits] Commit failed for ${filePath}: ${err}`);
    }
  }

  if (appliedCount === 0) {
    return { success: false, error: "No file edits could be applied (search text not found)" };
  }

  return { success: true };
}

/**
 * Apply the Healer's patch to an already-existing branch (no branch creation).
 * Used by the orchestrator to push code fixes into the same branch as test files.
 */
export async function applyPatchToExistingBranch(options: {
  owner: string;
  repo: string;
  branch: string;
  proposedPatch: string;
  sessionId: string;
  githubToken: string;
}): Promise<ApplyPatchResult> {
  const { owner, repo, branch, proposedPatch, sessionId, githubToken } = options;

  if (!githubToken?.trim()) {
    return { success: false, error: "GITHUB_PERSONAL_ACCESS_TOKEN required" };
  }
  if (!proposedPatch?.trim()) {
    return { success: false, error: "proposed_patch is empty" };
  }

  const normalizedPatch = proposedPatch.replace(/\\\"/g, '"').replace(/\\\\n/g, "\n");
  const fileHeaderRe = /^diff --git a\/(.*?) b\/(.*?)$/gm;
  const fileSections = normalizedPatch.split(/(?=^diff --git )/m);
  let patchedFiles = 0;

  for (const section of fileSections) {
    fileHeaderRe.lastIndex = 0;
    const fileMatch = fileHeaderRe.exec(section);
    if (!fileMatch) continue;

    const filePath = fileMatch[2];

    let fileData: { content: string; sha: string };
    try {
      fileData = await ghGet(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
        githubToken
      );
    } catch (err) {
      console.warn(`[PatchApply] Could not fetch ${filePath}: ${err}`);
      continue;
    }

    const original = Buffer.from(fileData.content, "base64").toString("utf-8");
    const patched = applyUnifiedDiff(original, section);

    if (patched === null) {
      console.warn(`[PatchApply] String-replace failed for ${filePath}`);
      continue;
    }

    try {
      await ghPut(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
        githubToken,
        {
          message: `fix: TollGate healer auto-fix (${sessionId})`,
          content: Buffer.from(patched, "utf-8").toString("base64"),
          sha: fileData.sha,
          branch,
        }
      );
      console.log(`[PatchApply] ✅ Applied fix: ${filePath}`);
      patchedFiles++;
    } catch (err) {
      console.warn(`[PatchApply] Commit failed for ${filePath}: ${err}`);
    }
  }

  if (patchedFiles === 0) {
    return {
      success: false,
      error: "No files could be patched (context lines not found in current file)",
    };
  }

  return { success: true };
}

/**
 * Apply the Healer's patch directly via GitHub API.
 * No git clone required — fast and reliable.
 */
export async function applyPatchAndPush(options: ApplyPatchOptions): Promise<ApplyPatchResult> {
  const { owner, repo, baseBranch, headBranch, proposedPatch, sessionId, githubToken } = options;

  if (!githubToken?.trim()) {
    return { success: false, error: "GITHUB_PERSONAL_ACCESS_TOKEN required for PR creation" };
  }
  if (!proposedPatch?.trim()) {
    return { success: false, error: "proposed_patch is empty" };
  }

  const normalizedPatch = proposedPatch.replace(/\\\"/g, '"').replace(/\\\\n/g, "\n");

  // Find all files that the patch touches
  const fileHeaderRe = /^diff --git a\/(.*?) b\/(.*?)$/gm;
  const fileSections = normalizedPatch.split(/(?=^diff --git )/m);
  let patchedFiles = 0;

  // Ensure the fix branch exists (based on the base branch)
  try {
    await ensureBranch(owner, repo, headBranch, baseBranch, githubToken);
  } catch (err) {
    return { success: false, error: `Failed to create/update branch: ${String(err)}` };
  }

  for (const section of fileSections) {
    fileHeaderRe.lastIndex = 0;
    const fileMatch = fileHeaderRe.exec(section);
    if (!fileMatch) continue;

    const filePath = fileMatch[2];

    // 1. Fetch current file content + SHA from the HEAD branch
    let fileData: { content: string; sha: string };
    try {
      fileData = await ghGet(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${headBranch}`,
        githubToken
      );
    } catch (err) {
      console.warn(`[PatchApply] Could not fetch ${filePath}: ${err}`);
      continue;
    }

    // GitHub returns content as base64
    const original = Buffer.from(fileData.content, "base64").toString("utf-8");
    const patched = applyUnifiedDiff(original, section);

    if (patched === null) {
      console.warn(`[PatchApply] String-replace failed for ${filePath}`);
      continue;
    }

    // 2. Commit the patched file directly via GitHub API
    try {
      await ghPut(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
        githubToken,
        {
          message: `[TollGate] Auto-fix: ${sessionId}`,
          content: Buffer.from(patched, "utf-8").toString("base64"),
          sha: fileData.sha,
          branch: headBranch,
        }
      );
      console.log(`[PatchApply] ✅ Committed via API: ${filePath}`);
      patchedFiles++;
    } catch (err) {
      console.warn(`[PatchApply] Commit failed for ${filePath}: ${err}`);
    }
  }

  if (patchedFiles === 0) {
    return {
      success: false,
      error: "No files could be patched (context lines not found in current file)",
    };
  }

  return { success: true };
}
