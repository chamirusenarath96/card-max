import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFilterPresets } from "./useFilterPresets";

// ── localStorage mock ────────────────────────────────────────────────────────

const store: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// crypto.randomUUID shim (jsdom may not have it)
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID: vi.fn(() => "test-uuid-" + Math.random()) },
    writable: true,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFilters(overrides: Record<string, string> = {}) {
  return { bank: "hnb", ...overrides };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useFilterPresets", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("returns empty array initially before mount reads storage", () => {
    const { result } = renderHook(() => useFilterPresets());
    expect(result.current.presets).toEqual([]);
  });

  it("reads presets from localStorage on mount", () => {
    const existing = [
      { id: "1", name: "HNB Dining", createdAt: new Date().toISOString(), filters: makeFilters() },
    ];
    store["card-max:filter-presets"] = JSON.stringify(existing);

    const { result } = renderHook(() => useFilterPresets());
    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0]!.name).toBe("HNB Dining");
  });

  it("savePreset writes to localStorage and renders chip (AC2)", () => {
    const { result } = renderHook(() => useFilterPresets());

    act(() => {
      result.current.savePreset("My preset", makeFilters());
    });

    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0]!.name).toBe("My preset");
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "card-max:filter-presets",
      expect.stringContaining("My preset"),
    );
  });

  it("deletePreset removes from localStorage (AC5)", () => {
    const { result } = renderHook(() => useFilterPresets());

    act(() => {
      result.current.savePreset("To delete", makeFilters());
    });
    const id = result.current.presets[0]!.id;

    act(() => {
      result.current.deletePreset(id);
    });

    expect(result.current.presets).toHaveLength(0);
    const stored = JSON.parse(localStorageMock.setItem.mock.calls.at(-1)![1] as string);
    expect(stored).toHaveLength(0);
  });

  it("11th preset removes oldest (AC6)", () => {
    const { result } = renderHook(() => useFilterPresets());

    for (let i = 1; i <= 11; i++) {
      act(() => {
        result.current.savePreset(`Preset ${i}`, makeFilters());
      });
    }

    expect(result.current.presets).toHaveLength(10);
    // Newest is first (index 0), oldest is last
    expect(result.current.presets[0]!.name).toBe("Preset 11");
    expect(result.current.presets.find((p) => p.name === "Preset 1")).toBeUndefined();
  });

  it("preset name is capped at 32 characters (AC7)", () => {
    const { result } = renderHook(() => useFilterPresets());
    const longName = "A".repeat(50);

    act(() => {
      result.current.savePreset(longName, makeFilters());
    });

    expect(result.current.presets[0]!.name).toHaveLength(32);
  });

  it("localStorage unavailable — no crash (AC8)", () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error("SecurityError: localStorage unavailable");
    });

    expect(() => renderHook(() => useFilterPresets())).not.toThrow();
  });

  it("corrupted JSON in localStorage falls back to empty array", () => {
    store["card-max:filter-presets"] = "{ invalid json {{{";
    const { result } = renderHook(() => useFilterPresets());
    expect(result.current.presets).toEqual([]);
  });

  it("non-array JSON in localStorage falls back to empty array", () => {
    store["card-max:filter-presets"] = JSON.stringify({ not: "an array" });
    const { result } = renderHook(() => useFilterPresets());
    expect(result.current.presets).toEqual([]);
  });
});
