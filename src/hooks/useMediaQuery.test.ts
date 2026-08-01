import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { useMediaQuery } from "./useMediaQuery";

function createMatchMediaMock(initialMatches: boolean) {
  let changeHandler: ((event: { matches: boolean }) => void) | null = null;
  const mql = {
    matches: initialMatches,
    addEventListener: vi.fn((_event: string, handler: (event: { matches: boolean }) => void) => {
      changeHandler = handler;
    }),
    removeEventListener: vi.fn(),
  };
  return {
    matchMedia: vi.fn(() => mql),
    emitChange: (matches: boolean) => {
      mql.matches = matches;
      changeHandler?.({ matches });
    },
  };
}

describe("useMediaQuery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useMediaQuery("(min-width: 640px)"));
    expect(result.current).toBe(false);
  });

  it("returns the initial match state from matchMedia", () => {
    const { matchMedia } = createMatchMediaMock(true);
    vi.stubGlobal("matchMedia", matchMedia);
    const { result } = renderHook(() => useMediaQuery("(min-width: 640px)"));
    expect(result.current).toBe(true);
  });

  it("updates when the media query match state changes", () => {
    const { matchMedia, emitChange } = createMatchMediaMock(false);
    vi.stubGlobal("matchMedia", matchMedia);
    const { result } = renderHook(() => useMediaQuery("(min-width: 640px)"));
    expect(result.current).toBe(false);

    act(() => emitChange(true));
    expect(result.current).toBe(true);
  });

  it("removes the change listener on unmount", () => {
    const { matchMedia } = createMatchMediaMock(false);
    vi.stubGlobal("matchMedia", matchMedia);
    const { unmount } = renderHook(() => useMediaQuery("(min-width: 640px)"));
    unmount();
    const mql = matchMedia.mock.results[0]?.value;
    expect(mql.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
