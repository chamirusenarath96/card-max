"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  id: string;
  token: string;
  initialStatus: string;
  initialIssueUrl?: string;
}

export function FeedbackActions({ id, token, initialStatus, initialIssueUrl }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [issueUrl, setIssueUrl] = useState(initialIssueUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function createIssue() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/feedback/${id}/to-issue?token=${encodeURIComponent(token)}`, {
        method: "POST",
      });
      const data = (await res.json()) as { issueUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setStatus("converted");
      setIssueUrl(data.issueUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  if (status === "converted" && issueUrl) {
    return (
      <a
        href={issueUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ExternalLink className="size-3.5" />
        View issue
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" variant="outline" onClick={createIssue} disabled={loading}>
        {loading ? "Creating…" : "Create GitHub Issue"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
