import { render, screen, fireEvent, waitFor } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FilterDrawer } from "./FilterDrawer";
import type { UseCategoriesResult } from "@/hooks/useCategories";

const mockNavigate = vi.fn();

const mockSearchParams = { params: new URLSearchParams() };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => mockSearchParams.params,
}));

vi.mock("@/components/layout/NavigationProgressContext", () => ({
  useNavigationProgress: () => ({
    navigate: mockNavigate,
    isPending: false,
    lastNavMs: null,
  }),
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
    mockNavigate.mockClear();
    mockSearchParams.params = new URLSearchParams();
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

  it("shows Apply Filters button when drawer is open", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    expect(await screen.findByTestId("apply-filters")).toBeInTheDocument();
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

  // ── Multi-select: filter chips update pending state, Apply navigates ─────

  it("clicking a bank chip highlights it without navigating", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    const chip = await screen.findByTestId("bank-filter-commercial_bank");
    fireEvent.click(chip);
    // Navigate should NOT be called yet (pending state only)
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("clicking Apply after selecting bank navigates with bank param", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    const chip = await screen.findByTestId("bank-filter-commercial_bank");
    fireEvent.click(chip);
    fireEvent.click(screen.getByTestId("apply-filters"));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("bank=commercial_bank"));
  });

  // ── AC7: clicking a chip and applying sets the URL param ─────────────────

  it("AC7 — clicking a dynamic category chip then Apply sets the category filter", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    const chip = await screen.findByTestId("category-chip-dining");
    fireEvent.click(chip);
    fireEvent.click(screen.getByTestId("apply-filters"));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("category=dining"));
  });

  it("clicking 'All' category then Apply clears the category filter", async () => {
    render(<FilterDrawer activeCategory="dining" />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    fireEvent.click(await screen.findByTestId("category-chip-all"));
    fireEvent.click(screen.getByTestId("apply-filters"));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(expect.not.stringContaining("category=")),
    );
  });

  // ── Apply clears freetext search query ───────────────────────────────────

  it("applying filters clears the 'q' search param from the URL", async () => {
    mockSearchParams.params = new URLSearchParams("q=pizza&category=dining");

    render(<FilterDrawer activeCategory="dining" />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    // Pick a bank then apply
    const chip = await screen.findByTestId("bank-filter-commercial_bank");
    fireEvent.click(chip);
    fireEvent.click(screen.getByTestId("apply-filters"));

    expect(mockNavigate).toHaveBeenCalledWith(expect.not.stringContaining("q="));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("bank=commercial_bank"));
  });

  // ── Clear all: immediate navigation without Apply ─────────────────────────

  it("Clear all navigates immediately to pathname without any params", async () => {
    render(<FilterDrawer activeBank="hnb" activeCategory="dining" />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    await screen.findByTestId("filter-drawer");
    fireEvent.click(screen.getByTestId("clear-all-filters"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  // ── Glow animation ────────────────────────────────────────────────────────

  it("trigger button has glow animation class when no filters are active", () => {
    render(<FilterDrawer />);
    expect(screen.getByTestId("filter-drawer-trigger")).toHaveClass("animate-filter-glow");
  });

  it("trigger button does not have glow animation when filters are active", () => {
    render(<FilterDrawer activeBank="hnb" />);
    expect(screen.getByTestId("filter-drawer-trigger")).not.toHaveClass("animate-filter-glow");
  });
});
