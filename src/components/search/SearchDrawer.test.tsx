import { render, screen, fireEvent } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchDrawer } from "./SearchDrawer";
import type { SuggestionItem } from "./useSearchSuggestions";

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
  });

  it("renders the search drawer trigger button", () => {
    render(<SearchDrawer />);
    expect(screen.getByTestId("search-drawer-trigger")).toBeInTheDocument();
  });

  it("trigger button has aria-label 'Open search'", () => {
    render(<SearchDrawer />);
    expect(screen.getByLabelText("Open search")).toBeInTheDocument();
  });

  it("shows the Ctrl+S keyboard hint", () => {
    render(<SearchDrawer />);
    expect(screen.getByText("Ctrl+S")).toBeInTheDocument();
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

  it("opening the drawer reveals category jump chips", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("jump-dining")).toBeInTheDocument();
    expect(screen.getByTestId("jump-shopping")).toBeInTheDocument();
    expect(screen.getByTestId("jump-expiring-soon")).toBeInTheDocument();
  });

  it("shows initialQuery in the input when drawer opens", () => {
    render(<SearchDrawer initialQuery="pizza" />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("search-drawer-input")).toHaveValue("pizza");
  });

  it("clicking Search button navigates with q param and closes drawer", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    fireEvent.change(screen.getByTestId("search-drawer-input"), {
      target: { value: "keells" },
    });
    fireEvent.click(screen.getByTestId("search-drawer-submit"));
    expect(mockPush).toHaveBeenCalledWith("/?q=keells");
    expect(screen.queryByTestId("search-drawer-input")).not.toBeInTheDocument();
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

  it("clicking 'Dining' jump navigates with category=dining", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    fireEvent.click(screen.getByTestId("jump-dining"));
    expect(mockPush).toHaveBeenCalledWith("/?category=dining");
  });

  it("clicking 'Expiring Soon' jump navigates with sort=expiringSoon", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    fireEvent.click(screen.getByTestId("jump-expiring-soon"));
    expect(mockPush).toHaveBeenCalledWith("/?sort=expiringSoon");
  });

  // --- Inline results while typing ---

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
