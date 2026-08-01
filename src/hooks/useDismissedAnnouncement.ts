"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "card-max:dismissed-announcement";

function readDismissedId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeDismissedId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // localStorage unavailable — fail open, dismissal just won't persist across reloads
  }
}

export function useDismissedAnnouncement() {
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissedId(readDismissedId());
  }, []);

  const dismiss = useCallback((id: string) => {
    writeDismissedId(id);
    setDismissedId(id);
  }, []);

  return { dismissedId, dismiss };
}
