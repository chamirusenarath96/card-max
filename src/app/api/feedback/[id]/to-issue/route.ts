import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import { dbConnect } from "@/lib/db/connect";
import { FeedbackModel } from "@/lib/models/feedback.model";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await dbConnect();
    const feedback = await FeedbackModel.findById(id);
    if (!feedback) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (feedback.status === "converted") {
      return NextResponse.json(
        { error: "Already converted", issueUrl: feedback.githubIssueUrl },
        { status: 409 },
      );
    }

    const githubToken = process.env.GITHUB_FEEDBACK_TOKEN;
    const repoOwner = process.env.GITHUB_REPO_OWNER ?? "chamirusenarath96";
    const repoName = process.env.GITHUB_REPO_NAME ?? "card-max";

    if (!githubToken) {
      return NextResponse.json({ error: "GITHUB_FEEDBACK_TOKEN not configured" }, { status: 503 });
    }

    const typeLabel = feedback.type === "bug" ? "bug" : "enhancement";
    const title = `[${feedback.type}] ${feedback.message.slice(0, 60)}${feedback.message.length > 60 ? "…" : ""}`;
    const body = [
      `**Type:** ${feedback.type}`,
      feedback.email ? `**From:** ${feedback.email}` : null,
      `**Submitted:** ${feedback.createdAt.toISOString().split("T")[0]}`,
      "",
      "---",
      "",
      feedback.message,
      "",
      "_Created from CardMax user feedback._",
    ]
      .filter((line) => line !== null)
      .join("\n");

    const ghRes = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ title, body, labels: [typeLabel, "user-feedback"] }),
      },
    );

    if (!ghRes.ok) {
      const err: unknown = await ghRes.json();
      return NextResponse.json(
        { error: "GitHub API error", details: err },
        { status: 502 },
      );
    }

    const issue = (await ghRes.json()) as { html_url: string; number: number };

    await FeedbackModel.findByIdAndUpdate(id, {
      status: "converted",
      githubIssueUrl: issue.html_url,
      githubIssueNumber: issue.number,
    });

    return NextResponse.json({ success: true, issueUrl: issue.html_url, issueNumber: issue.number });
  } catch {
    return NextResponse.json({ error: "Failed to create issue" }, { status: 500 });
  }
}
