import { render, screen, fireEvent } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchDrawer } from "./SearchDrawer";
import type { SuggestionItem } from "./useSearchSuggestions";
import type { UseCategoriesResult } from "@/hooks/useCategories";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const mockUseSearchSuggestions = vi.fn((_query: string) => ({
  results: [] as SuggestionItem[],
  total: 0,
  isLoading: false,
  isActive: false,
}));

vi.mock("./useSearchSuggestions", () => ({
  useSearchSuggestions: (query: string) => mockUseSearchSuggestions(query),
}));

const mockUseCategories = vi.fn<() => UseCategoriesResult>();

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => mockUseCategories(),
}));

const MOCK_CATEGORIES: UseCategoriesResult["data"] = [
  { category: "dining", label: "Dining", count: 42 },
  { category: "groceries", label: "Groceries", count: 31 },
  { category: "online", label: "Online", count: 18 },
  { category: "shopping", label: "Shopping", count: 14 },
  { category: "travel", label: "Travel", count: 10 },
  { category: "fuel", label: "Fuel", count: 8 },
  { category: "wellness", label: "Wellness", count: 5 }, // 7th — should be capped
];

const MOCK_RESULTS = [
  {
    _id: "1",
    title: "20% off at Keells",
    merchant: "Keells",
    bank: "commercial_bank",
    bankDisplayName: "Commercial Bank",
    discountLabel: "20% off",
    category: "groceries",
    offerType: "percentage",
    sourceUrl: "https://www.combank.lk/offers/keells",
  },
  {
    _id: "2",
    title: "10% cashback on dining",
    merchant: "Various",
    bank: "sampath",
    bankDisplayName: "Sampath Bank",
    discountLabel: "10% cashback",
    category: "dining",
    offerType: "cashback",
    sourceUrl: "https://www.sampath.lk/offers/dining",
  },
];

describe("SearchDrawer", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseSearchSuggestions.mockReturnValue({
      results: [],
      total: 0,
      isLoading: false,
      isActive: false,
    });
    mockUseCategories.mockReturnValue({
      data: MOCK_CATEGORIES,
      isLoading: false,
      error: false,
    });
  });

  it("renders the search drawer trigger button", () => {
    render(<SearchDrawer />);
    expect(screen.getByTestId("search-drawer-trigger")).toBeInTheDocument();
  });

  it("trigger button has aria-label 'Open search'", () => {
    render(<SearchDrawer />);
    expect(screen.getByLabelText("Open search")).toBeInTheDocument();
  });

  it("shows the Ctrl+K keyboard hint", () => {
    render(<SearchDrawer />);
    expect(screen.getByText("Ctrl+K")).toBeInTheDocument();
  });

  it("drawer is closed by default — input not visible", () => {
    render(<SearchDrawer />);
    expect(screen.queryByTestId("search-drawer-input")).not.toBeInTheDocument();
  });

  it("opening the drawer reveals the search input", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("search-drawer-input")).toBeInTheDocument();
  });

  it("opening the drawer reveals popular search chips", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("quick-search-dining-deals")).toBeInTheDocument();
    expect(screen.getByTestId("quick-search-cashback")).toBeInTheDocument();
  });

  // ── AC5: dynamic category chips (top 6) ──────────────────────────────────

  it("AC5 — opening the drawer reveals dynamic category jump chips", async () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("jump-dining")).toBeInTheDocument();
    expect(screen.getByTestId("jump-shopping")).toBeInTheDocument();
    expect(screen.getByTestId("jump-fuel")).toBeInTheDocument();
  });

  it("AC5 — shows at most 6 category chips (top 6 by count)", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    // MOCK_CATEGORIES has 7 items; only first 6 should appear
    expect(screen.queryByTestId("jump-wellness")).not.toBeInTheDocument();
    expect(screen.getByTestId("jump-fuel")).toBeInTheDocument(); // 6th
  });

  it("AC5 — category chips set correct URL params on click", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    fireEvent.click(screen.getByTestId("jump-dining"));
    expect(mockPush).toHaveBeenCalledWith("/?category=dining");
  });

  // ── AC6: hide section when API returns empty ──────────────────────────────

  it("AC6 — hides the jump-category-section when API returns empty", () => {
    mockUseCategories.mockReturnValue({ data: [], isLoading: false, error: false });

    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.queryByTestId("jump-category-section")).not.toBeInTheDocument();
  });

  it("AC6 — hides jump section when API errors (data is empty)", () => {
    mockUseCategories.mockReturnValue({ data: [], isLoading: false, error: true });

    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.queryByTestId("jump-category-section")).not.toBeInTheDocument();
  });

  // ── Skeleton loading state ─────────────────────────────────────────────────

  it("shows skeleton chips while categories are loading", () => {
    mockUseCategories.mockReturnValue({ data: [], isLoading: true, error: false });

    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("jump-category-section")).toBeInTheDocument();
    expect(screen.getAllByTestId("jump-category-skeleton").length).toBe(6);
  });

  // ── Other existing behaviour ───────────────────────────────────────────────

  it("shows initialQuery in the input when drawer opens", () => {
    render(<SearchDrawer initialQuery="pizza" />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("search-drawer-input")).toHaveValue("pizza");
  });

  it("pressing Enter on the input navigates and closes drawer", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    const input = screen.getByTestId("search-drawer-input");
    fireEvent.change(input, { target: { value: "pizza" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/?q=pizza");
  });

  it("clicking a popular search navigates with that query", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    fireEvent.click(screen.getByTestId("quick-search-cashback"));
    expect(mockPush).toHaveBeenCalledWith("/?q=cashback");
  });

  it("hides popular searches and shows results section when isActive", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: MOCK_RESULTS,
      total: 2,
      isLoading: false,
      isActive: true,
    });
    render(<SearchDrawer initialQuery="ke" />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("drawer-results")).toBeInTheDocument();
    expect(screen.queryByTestId("quick-search-cashback")).not.toBeInTheDocument();
  });

  it("shows result items inside the drawer when results are available", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: MOCK_RESULTS,
      total: 2,
      isLoading: false,
      isActive: true,
    });
    render(<SearchDrawer initialQuery="ke" />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    const items = screen.getAllByTestId("drawer-result-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("20% off at Keells");
  });

  it("shows loading state inside drawer while fetching", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: [],
      total: 0,
      isLoading: true,
      isActive: true,
    });
    render(<SearchDrawer initialQuery="ke" />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("drawer-loading")).toBeInTheDocument();
  });

  it("shows no-results message inside drawer when results are empty", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: [],
      total: 0,
      isLoading: false,
      isActive: true,
    });
    render(<SearchDrawer initialQuery="xyznotfound" />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("drawer-no-results")).toBeInTheDocument();
  });

  it("shows 'See all' link when total > results shown", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: MOCK_RESULTS,
      total: 100,
      isLoading: false,
      isActive: true,
    });
    render(<SearchDrawer initialQuery="ke" />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("drawer-see-all")).toBeInTheDocument();
    expect(screen.getByTestId("drawer-see-all")).toHaveTextContent("100");
  });

  it("clicking a drawer result navigates and closes drawer", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: MOCK_RESULTS,
      total: 2,
      isLoading: false,
      isActive: true,
    });
    render(<SearchDrawer initialQuery="ke" />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    const items = screen.getAllByTestId("drawer-result-item");
    fireEvent.click(items[0]);
    expect(mockPush).toHaveBeenCalledWith("/?q=20%25+off+at+Keells");
    expect(screen.queryByTestId("search-drawer-input")).not.toBeInTheDocument();
  });

  it("jump chips are still visible while showing results", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: MOCK_RESULTS,
      total: 2,
      isLoading: false,
      isActive: true,
    });
    render(<SearchDrawer initialQuery="ke" />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("jump-dining")).toBeInTheDocument();
  });
});
