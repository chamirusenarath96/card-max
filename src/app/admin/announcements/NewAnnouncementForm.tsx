"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewAnnouncementForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          linkUrl: linkUrl || undefined,
          linkLabel: linkLabel || undefined,
          active,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create announcement");
      setMessage("");
      setLinkUrl("");
      setLinkLabel("");
      setActive(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      data-testid="announcement-admin-form"
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="announcement-message">Message</Label>
        <Input
          id="announcement-message"
          data-testid="announcement-admin-message-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={280}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="announcement-link-url">Link URL (optional)</Label>
        <Input
          id="announcement-link-url"
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="announcement-link-label">Link label (optional)</Label>
        <Input
          id="announcement-link-label"
          value={linkLabel}
          onChange={(e) => setLinkLabel(e.target.value)}
          maxLength={40}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Make active immediately
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        type="submit"
        data-testid="announcement-admin-submit"
        disabled={loading || !message.trim()}
        className="self-start"
      >
        {loading ? "Creating…" : "Create announcement"}
      </Button>
    </form>
  );
}
