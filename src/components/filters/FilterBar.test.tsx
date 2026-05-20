import { render, screen, fireEvent, waitFor } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FilterBar } from "./FilterBar";

// FilterBar renders FilterDrawer which calls useCategories.
vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({ data: [], isLoading: false, error: false }),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

describe("FilterBar", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders the filter bar container", () => {
    render(<FilterBar />);
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
  });

  it("renders the filter drawer trigger button", () => {
    render(<FilterBar />);
    expect(screen.getByTestId("filter-drawer-trigger")).toBeInTheDocument();
  });

  it("shows no active-filter chips when no props are set", () => {
    render(<FilterBar />);
    // Active filter chips have been removed from FilterBar — only the Filters
    // trigger button is rendered.
    expect(screen.queryByRole("button", { name: /^Remove /i })).not.toBeInTheDocument();
  });

  it("shows no active-filter chips even when filters are active", () => {
    render(<FilterBar activeBank="commercial_bank" activeCategory="dining" />);
    // Chips removed — filter state is managed inside the FilterDrawer only.
    expect(screen.queryByRole("button", { name: /^Remove /i })).not.toBeInTheDocument();
  });

  it("filter by bank calls router with correct bank param", async () => {
    render(<FilterBar />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    const bankBtn = await screen.findByTestId("bank-filter-commercial_bank");
    fireEvent.click(bankBtn);
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("bank=commercial_bank"))
    );
  });
});
