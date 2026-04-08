import { NextRequest, NextResponse } from "next/server";
import { GitHubMCPClient } from "@/lib/integrations/github-mcp";

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

export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner")?.trim() ?? "";
  const repo = request.nextUrl.searchParams.get("repo")?.trim() ?? "";
  const query = request.nextUrl.searchParams.get("query")?.trim().toLowerCase() ?? "";
  // Hack-nocturne / TollGate uses `github_mcp_mode`; Luminus UI uses `mode`.
  const modeParam =
    request.nextUrl.searchParams.get("mode")?.trim() ??
    request.nextUrl.searchParams.get("github_mcp_mode")?.trim() ??
    "";
  const mode = (modeParam || "npx") as "docker" | "npx";
  const state = request.nextUrl.searchParams.get("state")?.trim() || "open";

  if (!owner || !repo) {
    return NextResponse.json({ error: "Missing owner or repo query parameter." }, { status: 400 });
  }

  const client = new GitHubMCPClient();

  try {
    await client.start(mode);
    const prs = mapPullRequests(await client.listPullRequests(owner, repo, state));
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
      count: filtered.length,
      pullRequests: filtered,
      pull_requests: filtered,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch pull requests.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await client.stop();
  }
}
