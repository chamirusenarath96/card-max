"use client";

import { useState } from "react";
import { MessageSquarePlus, Send, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type FeedbackType = "suggestion" | "bug" | "other";

const TYPE_LABELS: Record<FeedbackType, string> = {
  suggestion: "Suggestion",
  bug: "Bug / Wrong info",
  other: "Other",
};

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("suggestion");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function reset() {
    setType("suggestion");
    setMessage("");
    setEmail("");
    setStatus("idle");
    setErrorMsg("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 10) {
      setErrorMsg("Please write at least 10 characters.");
      return;
    }
    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message: message.trim(), email: email.trim() || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Submission failed");
      }
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <section
      data-testid="feedback-section"
      className="border-t border-border bg-muted/40 py-10"
    >
      <div className="mx-auto flex max-w-screen-xl flex-col items-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Spotted a missing offer or wrong info? Let us know.
        </p>
        <Dialog
          open={open}
          onOpenChange={(v: boolean) => {
            setOpen(v);
            if (!v) reset();
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="outline"
              data-testid="feedback-trigger"
              className="gap-2"
            >
              <MessageSquarePlus className="size-4" aria-hidden />
              Send feedback
            </Button>
          </DialogTrigger>

          <DialogContent className="sm:max-w-md" data-testid="feedback-dialog">
            <DialogHeader>
              <DialogTitle>Send feedback</DialogTitle>
            </DialogHeader>

            {status === "done" ? (
              <div
                data-testid="feedback-success"
                className="flex flex-col items-center gap-3 py-6 text-center"
              >
                <CheckCircle className="size-10 text-green-500" aria-hidden />
                <p className="font-medium text-foreground">Thanks for your feedback!</p>
                <p className="text-sm text-muted-foreground">
                  We review every submission and will fix issues as soon as possible.
                </p>
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                {/* Type selector */}
                <div className="flex gap-2" role="group" aria-label="Feedback type">
                  {(Object.keys(TYPE_LABELS) as FeedbackType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      data-testid={`feedback-type-${t}`}
                      onClick={() => setType(t)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        type === t
                          ? "border-primary bg-primary/10 font-medium text-primary"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>

                {/* Message */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="feedback-message"
                    className="text-sm font-medium text-foreground"
                  >
                    Message <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    id="feedback-message"
                    data-testid="feedback-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={
                      type === "bug"
                        ? "Describe the issue — which bank, offer title, what's wrong…"
                        : "What would make CardMax more useful to you?"
                    }
                    rows={4}
                    maxLength={1000}
                    className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="self-end text-xs text-muted-foreground">
                    {message.length}/1000
                  </p>
                </div>

                {/* Email (optional) */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="feedback-email"
                    className="text-sm font-medium text-foreground"
                  >
                    Email{" "}
                    <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <Input
                    id="feedback-email"
                    data-testid="feedback-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="we'll only use this to follow up"
                  />
                </div>

                {errorMsg && (
                  <p data-testid="feedback-error" className="text-sm text-destructive">
                    {errorMsg}
                  </p>
                )}

                <Button
                  type="submit"
                  data-testid="feedback-submit"
                  disabled={status === "submitting"}
                  className="gap-2 self-end"
                >
                  <Send className="size-4" aria-hidden />
                  {status === "submitting" ? "Sending…" : "Send"}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
