"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useDismissedAnnouncement } from "@/hooks/useDismissedAnnouncement";

interface ActiveAnnouncement {
  _id: string;
  message: string;
  linkUrl?: string;
  linkLabel?: string;
}

export function AnnouncementBanner() {
  const [mounted, setMounted] = useState(false);
  const [announcement, setAnnouncement] = useState<ActiveAnnouncement | null>(null);
  const { dismissedId, dismiss } = useDismissedAnnouncement();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/announcements/active")
      .then((res) => res.json() as Promise<{ data: ActiveAnnouncement | null }>)
      .then(({ data }) => {
        if (!cancelled) setAnnouncement(data);
      })
      .catch(() => {
        if (!cancelled) setAnnouncement(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mounted || !announcement || dismissedId === announcement._id) {
    return null;
  }

  return (
    <div
      data-testid="announcement-banner"
      className="flex items-center justify-center gap-3 border-b border-border bg-card px-4 py-2.5 text-sm text-foreground"
    >
      <p data-testid="announcement-banner-message" className="text-center">
        {announcement.message}
        {announcement.linkUrl && (
          <a
            data-testid="announcement-banner-link"
            href={announcement.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 font-medium text-primary hover:underline"
          >
            {announcement.linkLabel ?? "Learn more"}
          </a>
        )}
      </p>
      <button
        type="button"
        data-testid="announcement-banner-dismiss"
        onClick={() => dismiss(announcement._id)}
        aria-label="Dismiss announcement"
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
