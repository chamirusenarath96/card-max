import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDismissedAnnouncement } from "./useDismissedAnnouncement";

describe("useDismissedAnnouncement", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null initially when nothing is stored", () => {
    const { result } = renderHook(() => useDismissedAnnouncement());
    expect(result.current.dismissedId).toBeNull();
  });

  it("reads a previously dismissed id from localStorage on mount", () => {
    localStorage.setItem("card-max:dismissed-announcement", "ann-1");
    const { result } = renderHook(() => useDismissedAnnouncement());
    expect(result.current.dismissedId).toBe("ann-1");
  });

  it("dismiss writes the id to localStorage and updates state", () => {
    const { result } = renderHook(() => useDismissedAnnouncement());

    act(() => {
      result.current.dismiss("ann-2");
    });

    expect(result.current.dismissedId).toBe("ann-2");
    expect(localStorage.getItem("card-max:dismissed-announcement")).toBe("ann-2");
  });

  it("fails open (returns null) when localStorage throws", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("SecurityError: localStorage unavailable");
    };

    const { result } = renderHook(() => useDismissedAnnouncement());
    expect(result.current.dismissedId).toBeNull();

    Storage.prototype.getItem = original;
  });
});
