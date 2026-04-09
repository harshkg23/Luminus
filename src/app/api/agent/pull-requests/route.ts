import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface PullRequestSummary {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  headRef: string;
  baseRef: string;
}

function mapPullRequests(raw: unknown[]): PullRequestSummary[] {
  return raw
    .map((item) => {
      const pr = item as Record<string, unknown>;
      const user = (pr.user ?? {}) as Record<string, unknown>;
      const head = (pr.head ?? {}) as Record<string, unknown>;
      const base = (pr.base ?? {}) as Record<string, unknown>;
      return {
        number: Number(pr.number ?? 0),
        title: String(pr.title ?? ""),
        state: String(pr.state ?? "open"),
        url: String(pr.html_url ?? ""),
        author: String(user.login ?? "unknown"),
        headRef: String(head.ref ?? ""),
        baseRef: String(base.ref ?? ""),
      };
    })
    .filter((pr) => pr.number > 0 && pr.url.length > 0 && pr.title.length > 0);
}

const GH_PER_PAGE = 100;
/** Safety cap: 100 pages × 100 = 10k PRs */
const GH_MAX_PAGES = 100;

/**
 * Paginate GitHub REST pulls API so we return every PR (MCP list_pull_requests often returns one page only).
 */
async function fetchAllPullsRest(
  owner: string,
  repo: string,
  state: "open" | "closed" | "all",
): Promise<unknown[]> {
  const token =
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN?.trim() ??
    process.env.GITHUB_PAT?.trim() ??
    "";
  if (!token) {
    throw new Error("Missing GitHub token: set GITHUB_PERSONAL_ACCESS_TOKEN.");
  }

  const all: unknown[] = [];
  for (let page = 1; page <= GH_MAX_PAGES; page++) {
    const url = new URL(`https://api.github.com/repos/${owner}/${repo}/pulls`);
    url.searchParams.set("state", state);
    url.searchParams.set("per_page", String(GH_PER_PAGE));
    url.searchParams.set("page", String(page));

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub API ${res.status}: ${text.slice(0, 200)}`);
    }

    const batch = (await res.json()) as unknown[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < GH_PER_PAGE) break;
  }

  return all;
}

export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner")?.trim() ?? "";
  const repo = request.nextUrl.searchParams.get("repo")?.trim() ?? "";
  const query = request.nextUrl.searchParams.get("query")?.trim().toLowerCase() ?? "";
  const stateRaw = request.nextUrl.searchParams.get("state")?.trim() || "open";
  const state =
    stateRaw === "closed" || stateRaw === "all" || stateRaw === "open" ? stateRaw : "open";

  if (!owner || !repo) {
    return NextResponse.json({ error: "Missing owner or repo query parameter." }, { status: 400 });
  }

  try {
    const raw = await fetchAllPullsRest(owner, repo, state);
    const prs = mapPullRequests(raw);
    const filtered = query
      ? prs.filter((pr) =>
          `${pr.number} ${pr.title} ${pr.author} ${pr.headRef} ${pr.baseRef}`
            .toLowerCase()
            .includes(query),
        )
      : prs;

    return NextResponse.json({
      owner,
      repo,
      state,
      count: filtered.length,
      pullRequests: filtered,
      pull_requests: filtered,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch pull requests.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
