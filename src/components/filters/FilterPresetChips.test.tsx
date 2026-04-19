import { render, screen, fireEvent } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FilterPresetChips } from "./FilterPresetChips";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams("bank=hnb"),
}));

// Default: one preset stored
const mockDeletePreset = vi.fn();
const mockSavePreset = vi.fn();
vi.mock("@/hooks/useFilterPresets", () => ({
  useFilterPresets: () => ({
    presets: [
      {
        id: "preset-1",
        name: "HNB Dining",
        createdAt: "2026-01-01T00:00:00.000Z",
        filters: { bank: "hnb", category: "dining" },
      },
    ],
    savePreset: mockSavePreset,
    deletePreset: mockDeletePreset,
  }),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("FilterPresetChips", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockDeletePreset.mockClear();
    mockSavePreset.mockClear();
  });

  it("renders chips after mount (client-side only)", () => {
    render(<FilterPresetChips />);
    expect(screen.getByTestId("filter-preset-chips")).toBeInTheDocument();
  });

  it("renders a chip for each preset", () => {
    render(<FilterPresetChips />);
    expect(screen.getByText("HNB Dining")).toBeInTheDocument();
  });

  it("chip click pushes preset filters to URL (AC4)", () => {
    render(<FilterPresetChips />);
    fireEvent.click(screen.getByTestId("preset-apply-preset-1"));
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("bank=hnb"),
    );
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("category=dining"),
    );
  });

  it("delete button calls deletePreset (AC5)", () => {
    render(<FilterPresetChips />);
    fireEvent.click(screen.getByTestId("preset-delete-preset-1"));
    expect(mockDeletePreset).toHaveBeenCalledWith("preset-1");
  });
});
