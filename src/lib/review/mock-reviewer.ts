export type Severity = "low" | "medium" | "high";

export interface ReviewFinding {
  file: string;
  line: number;
  category: "security" | "bug-risk" | "code-smell" | "architecture";
  severity: Severity;
  title: string;
  explanation: string;
  suggestion: string;
}

export interface ReviewResult {
  riskScore: number;
  summary: string;
  findings: ReviewFinding[];
  features: {
    tone: string;
    estimatedMonthlyCostImpact: string;
    falsePositiveLearningHint: string;
  };
}

export function generateMockReview(prTitle: string): ReviewResult {
  const findings: ReviewFinding[] = [
    {
      file: "src/api/reviews/handler.ts",
      line: 42,
      category: "security",
      severity: "high",
      title: "Potential unsanitized input used in query",
      explanation: "The request payload appears to be passed into DB access logic without strict validation.",
      suggestion: "Add schema validation and parameterized queries before persistence.",
    },
    {
      file: "src/components/ReviewList.tsx",
      line: 88,
      category: "code-smell",
      severity: "medium",
      title: "Repeated transform logic",
      explanation: "The same mapping and filtering logic is repeated across rendering branches.",
      suggestion: "Extract a shared helper to reduce future drift and review noise.",
    },
    {
      file: "src/lib/analysis/scoring.ts",
      line: 27,
      category: "architecture",
      severity: "medium",
      title: "Business logic leaking into UI-oriented module",
      explanation: "Cross-layer imports can cause tight coupling and make refactors risky.",
      suggestion: "Move scoring utilities into a domain/service layer and import from there.",
    },
  ];

  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  const riskScore = Math.min(100, 35 + high * 25 + medium * 12);

  return {
    riskScore,
    summary: `AI review completed for "${prTitle}". ${findings.length} actionable findings detected with ${high} high-severity risk(s).`,
    findings,
    features: {
      tone: "Direct and concise",
      estimatedMonthlyCostImpact: "Approx. +$22/month if current polling strategy scales 10x.",
      falsePositiveLearningHint:
        'Reply "ignore-intentional: <reason>" in PR comments to train future suppression rules.',
    },
  };
}
