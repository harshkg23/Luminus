// ============================================================================
// POST /api/agent/courier
//
// Called by agents-orchestration courier_execute after local git work (optional).
// Creates a GitHub issue or pull request via TollGate Courier + GitHub MCP.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { CourierAgent } from "@/lib/mcp/courier";

export const dynamic = "force-dynamic";

/**
 * Resolve owner/repo from dispatch_payload: repo_url, repo_owner+repo_name, or first
 * `Repository: ...` line in the markdown body (agents-orchestration always embeds it).
 */
function resolveOwnerRepoFromPayload(p: Record<string, unknown>): {
    owner: string;
    repo: string;
} | null {
    const fromUrl = parseRepoRef(String(p.repo_url ?? "").trim());
    if (fromUrl) return fromUrl;

    const o = String(p.repo_owner ?? "").trim();
    const r = String(p.repo_name ?? "").trim();
    if (o && r) return { owner: o, repo: r.replace(/\.git$/i, "") };

    const body = String(p.body ?? "");
    const line = body
        .split(/\r?\n/)
        .find((l) => /^\s*repository\s*:/i.test(l));
    if (line) {
        const rest = line.replace(/^\s*repository\s*:\s*/i, "").trim();
        if (rest && rest !== "unknown") {
            const parsed = parseRepoRef(rest);
            if (parsed) return parsed;
        }
    }
    return null;
}

function parseRepoRef(repoUrl: string): { owner: string; repo: string } | null {
    const t = repoUrl.trim();
    if (!t) return null;
    if (t.includes("://")) {
        try {
            const u = new URL(t);
            const path = u.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
            const parts = path.split("/").filter(Boolean);
            if (parts.length >= 2) {
                return { owner: parts[0]!, repo: parts[1]! };
            }
        } catch {
            return null;
        }
        return null;
    }
    const slash = t.indexOf("/");
    if (slash <= 0 || slash === t.length - 1) return null;
    const owner = t.slice(0, slash);
    const repo = t.slice(slash + 1).replace(/\.git$/i, "");
    if (!owner || !repo) return null;
    return { owner, repo };
}

export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const rec = body as Record<string, unknown>;
    const dispatch_action = String(rec.dispatch_action ?? "").trim();
    const dispatch_payload = rec.dispatch_payload;

    if (
        !dispatch_action ||
        !dispatch_payload ||
        typeof dispatch_payload !== "object" ||
        dispatch_payload === null
    ) {
        return NextResponse.json(
            { error: "dispatch_action and dispatch_payload (object) are required" },
            { status: 400 }
        );
    }

    const p = dispatch_payload as Record<string, unknown>;
    const parsed = resolveOwnerRepoFromPayload(p);
    if (!parsed) {
        return NextResponse.json(
            {
                error:
                    "Could not resolve GitHub owner/repo: set dispatch_payload.repo_url (e.g. owner/repo), or repo_owner + repo_name, or a Repository: line in dispatch_payload.body",
            },
            { status: 400 }
        );
    }

    const title = String(p.title ?? "").trim() || "TollGate dispatch";
    const bodyMd = String(p.body ?? "");
    const sessionId = String(p.session_id ?? "unknown");
    const confidenceRaw = p.confidence_score;
    const confidence =
        typeof confidenceRaw === "number"
            ? confidenceRaw
            : Number.parseFloat(String(confidenceRaw ?? "0")) || 0;

    const token =
        process.env.GITHUB_PERSONAL_ACCESS_TOKEN?.trim() ||
        process.env.GITHUB_PAT?.trim() ||
        "";

    const courier = new CourierAgent(token || undefined);

    const fail = async (status: number, err: string) => {
        await courier.stop().catch(() => {});
        return NextResponse.json(
            { type: "error", url: "", number: 0, error: err },
            { status }
        );
    };

    try {
        if (dispatch_action === "create_issue") {
            const result = await courier.createIssueReport({
                session_id: sessionId,
                owner: parsed.owner,
                repo: parsed.repo,
                title,
                body: bodyMd,
                labels: ["tollgate", "bug"],
            });
            await courier.stop();
            if (!result.success) {
                return fail(502, result.error ?? "Failed to create issue");
            }
            return NextResponse.json({
                type: "issue",
                url: result.url ?? "",
                number: result.number ?? 0,
            });
        }

        if (dispatch_action === "create_pr") {
            const headBranch = String(p.head_branch ?? "").trim();
            const baseBranch = String(p.base_branch ?? "main").trim() || "main";
            if (!headBranch) {
                return await fail(400, "head_branch is required for create_pr");
            }
            const result = await courier.createFixPR({
                session_id: sessionId,
                owner: parsed.owner,
                repo: parsed.repo,
                base_branch: baseBranch,
                head_branch: headBranch,
                title: `[TollGate] ${title}`,
                body: bodyMd,
                confidence_score: confidence,
            });
            await courier.stop();
            if (!result.success) {
                return fail(502, result.error ?? "Failed to create pull request");
            }
            return NextResponse.json({
                type: "pr",
                url: result.url ?? "",
                number: result.number ?? 0,
            });
        }

        await courier.stop();
        return NextResponse.json(
            { error: `Unknown dispatch_action: ${dispatch_action}` },
            { status: 400 }
        );
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return await fail(500, message);
    }
}
