import { NextRequest, NextResponse } from "next/server";
import { generateMockReview } from "@/lib/review/mock-reviewer";
import { sendSlackReviewSummary } from "@/lib/integrations/slack";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      owner?: string;
      repo?: string;
      selectedPr?: { number?: number; title?: string; url?: string };
      slackChannel?: string;
      tone?: string;
    };

    const owner = body.owner?.trim() ?? "";
    const repo = body.repo?.trim() ?? "";
    const prNumber = body.selectedPr?.number ?? 0;
    const prTitle = body.selectedPr?.title?.trim() ?? "Untitled PR";

    if (!owner || !repo || !prNumber) {
      return NextResponse.json(
        { error: "owner, repo, and selectedPr.number are required." },
        { status: 400 },
      );
    }

    if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN && !process.env.GITHUB_PAT) {
      return NextResponse.json(
        { error: "Missing GitHub token in .env (GITHUB_PERSONAL_ACCESS_TOKEN)." },
        { status: 500 },
      );
    }

    const review = generateMockReview(prTitle);
    const response = {
      status: "completed",
      repo: `${owner}/${repo}`,
      pr: {
        number: prNumber,
        title: prTitle,
        url: body.selectedPr?.url ?? "",
      },
      review: {
        ...review,
        features: {
          ...review.features,
          tone: body.tone?.trim() || review.features.tone,
        },
      },
      nextActions: [
        "Post inline comments to GitHub.",
        "Enable false-positive learning with PR comment webhook.",
        "Switch mock reviewer to your LLM + policy engine.",
      ],
    };

    const highSeverity = review.findings.filter((f) => f.severity === "high").length;
    void sendSlackReviewSummary({
      owner,
      repo,
      prNumber,
      score: review.riskScore,
      findings: review.findings.length,
      highSeverity,
      channel: body.slackChannel,
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pipeline request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
