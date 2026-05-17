import { render, screen, fireEvent, waitFor } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FilterDrawer } from "./FilterDrawer";
import type { UseCategoriesResult } from "@/hooks/useCategories";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const mockUseCategories = vi.fn<() => UseCategoriesResult>();

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => mockUseCategories(),
}));

const MOCK_CATEGORIES: UseCategoriesResult["data"] = [
  { category: "dining", label: "Dining", count: 42 },
  { category: "groceries", label: "Groceries", count: 31 },
  { category: "online", label: "Online", count: 18 },
];

describe("FilterDrawer", () => {
  beforeEach(() => {
    mockUseCategories.mockReturnValue({
      data: MOCK_CATEGORIES,
      isLoading: false,
      error: false,
    });
  });

  it("renders the filter drawer trigger button", () => {
    render(<FilterDrawer />);
    expect(screen.getByTestId("filter-drawer-trigger")).toBeInTheDocument();
  });

  it("opens the filter drawer and shows filter-drawer testid", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    const drawer = await screen.findByTestId("filter-drawer");
    expect(drawer).toBeInTheDocument();
  });

  it("shows bank filter options when drawer is open", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    expect(await screen.findByTestId("bank-filter-commercial_bank")).toBeInTheDocument();
  });

  // ── AC3: dynamic category pills ──────────────────────────────────────────

  it("AC3 — renders dynamic category pills from API when drawer opens", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    expect(await screen.findByTestId("category-chip-dining")).toBeInTheDocument();
    expect(await screen.findByTestId("category-chip-groceries")).toBeInTheDocument();
    expect(await screen.findByTestId("category-chip-online")).toBeInTheDocument();
  });

  it("AC3 — shows correct label text on dynamic category pills", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    expect(await screen.findByTestId("category-chip-dining")).toHaveTextContent("Dining");
    expect(await screen.findByTestId("category-chip-groceries")).toHaveTextContent("Groceries");
  });

  // ── AC4: skeleton loading state ───────────────────────────────────────────

  it("AC4 — shows skeleton pills while categories are loading", async () => {
    mockUseCategories.mockReturnValue({ data: [], isLoading: true, error: false });

    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    await screen.findByTestId("category-section");
    const skeletons = screen.getAllByTestId("category-skeleton");
    expect(skeletons.length).toBe(6);
  });

  it("AC4 — hides skeletons after loading completes", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    await screen.findByTestId("category-chip-dining");
    expect(screen.queryByTestId("category-skeleton")).not.toBeInTheDocument();
  });

  // ── AC8: "All" pill always present ───────────────────────────────────────

  it("AC8 — 'All' category chip is always present regardless of API state", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    expect(await screen.findByTestId("category-chip-all")).toBeInTheDocument();
  });

  it("AC8 — 'All' chip is present even when API returns empty data", async () => {
    mockUseCategories.mockReturnValue({ data: [], isLoading: false, error: false });

    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    expect(await screen.findByTestId("category-chip-all")).toBeInTheDocument();
    expect(screen.queryByTestId("category-chip-dining")).not.toBeInTheDocument();
  });

  it("AC8 — 'All' chip is present even when API errors", async () => {
    mockUseCategories.mockReturnValue({ data: [], isLoading: false, error: true });

    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    expect(await screen.findByTestId("category-chip-all")).toBeInTheDocument();
  });

  // ── AC7: clicking a chip sets the URL param ───────────────────────────────

  it("AC7 — clicking a dynamic category chip sets the category filter", async () => {
    mockPush.mockClear();
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    const chip = await screen.findByTestId("category-chip-dining");
    fireEvent.click(chip);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("category=dining"));
  });

  it("clicking 'All' clears the category filter", async () => {
    mockPush.mockClear();
    render(<FilterDrawer activeCategory="dining" />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    fireEvent.click(await screen.findByTestId("category-chip-all"));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(expect.not.stringContaining("category="))
    );
  });
});
