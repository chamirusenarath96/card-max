import { render, screen, fireEvent } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HeroSearch } from "./HeroSearch";
import type { SuggestionItem } from "./useSearchSuggestions";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Default: hook returns no results (query too short or empty)
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

describe("HeroSearch", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseSearchSuggestions.mockReturnValue({
      results: [],
      total: 0,
      isLoading: false,
      isActive: false,
    });
  });

  it("renders the hero search container", () => {
    render(<HeroSearch />);
    expect(screen.getByTestId("hero-search")).toBeInTheDocument();
  });

  it("renders the search input", () => {
    render(<HeroSearch />);
    expect(screen.getByTestId("hero-search-input")).toBeInTheDocument();
  });

  it("renders the example hint text", () => {
    render(<HeroSearch />);
    expect(screen.getByTestId("hero-search-hint")).toBeInTheDocument();
  });

  it("renders suggestion chips", () => {
    render(<HeroSearch />);
    expect(screen.getByTestId("search-suggestions")).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-dining")).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-cashback")).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-expiring-soon")).toBeInTheDocument();
  });

  it("shows initialQuery in the input", () => {
    render(<HeroSearch initialQuery="pizza" />);
    expect(screen.getByTestId("hero-search-input")).toHaveValue("pizza");
  });

  it("pressing Enter on the input navigates with q param", () => {
    render(<HeroSearch />);
    const input = screen.getByTestId("hero-search-input");
    fireEvent.change(input, { target: { value: "pizza" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/?q=pizza");
  });

  it("clicking 'Dining' chip navigates with category=dining", () => {
    render(<HeroSearch />);
    fireEvent.click(screen.getByTestId("suggestion-dining"));
    expect(mockPush).toHaveBeenCalledWith("/?category=dining");
  });

  it("clicking 'Cashback' chip navigates with offerType=cashback", () => {
    render(<HeroSearch />);
    fireEvent.click(screen.getByTestId("suggestion-cashback"));
    expect(mockPush).toHaveBeenCalledWith("/?offerType=cashback");
  });

  it("clicking 'Expiring Soon' chip navigates with sort=expiringSoon", () => {
    render(<HeroSearch />);
    fireEvent.click(screen.getByTestId("suggestion-expiring-soon"));
    expect(mockPush).toHaveBeenCalledWith("/?sort=expiringSoon");
  });

  it("clicking 'Hotels' chip navigates with q=hotel", () => {
    render(<HeroSearch />);
    fireEvent.click(screen.getByTestId("suggestion-hotels"));
    expect(mockPush).toHaveBeenCalledWith("/?q=hotel");
  });

  // --- Dropdown / live results ---

  it("dropdown is not shown when query is too short", () => {
    render(<HeroSearch />);
    expect(screen.queryByTestId("search-dropdown")).not.toBeInTheDocument();
  });

  it("shows dropdown with results when hook returns isActive=true", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: MOCK_RESULTS,
      total: 2,
      isLoading: false,
      isActive: true,
    });
    render(<HeroSearch initialQuery="ke" />);
    expect(screen.getByTestId("search-dropdown")).toBeInTheDocument();
    const items = screen.getAllByTestId("search-result-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("20% off at Keells");
    expect(items[1]).toHaveTextContent("10% cashback on dining");
  });

  it("shows loading spinner while fetching", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: [],
      total: 0,
      isLoading: true,
      isActive: true,
    });
    render(<HeroSearch initialQuery="ke" />);
    expect(screen.getByTestId("search-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("search-result-item")).not.toBeInTheDocument();
  });

  it("shows no-results message when results are empty", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: [],
      total: 0,
      isLoading: false,
      isActive: true,
    });
    render(<HeroSearch initialQuery="xyznotfound" />);
    expect(screen.getByTestId("search-no-results")).toBeInTheDocument();
  });

  it("shows discount label badge on result items", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: MOCK_RESULTS,
      total: 2,
      isLoading: false,
      isActive: true,
    });
    render(<HeroSearch initialQuery="ke" />);
    expect(screen.getByText("20% off")).toBeInTheDocument();
  });

  it("shows 'See all' link when total > 0", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: MOCK_RESULTS,
      total: 42,
      isLoading: false,
      isActive: true,
    });
    render(<HeroSearch initialQuery="ke" />);
    expect(screen.getByTestId("search-see-all")).toBeInTheDocument();
    expect(screen.getByTestId("search-see-all")).toHaveTextContent("42");
  });

  it("clicking a result opens the original offer URL in a new tab", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    mockUseSearchSuggestions.mockReturnValue({
      results: MOCK_RESULTS,
      total: 2,
      isLoading: false,
      isActive: true,
    });
    render(<HeroSearch initialQuery="ke" />);
    const items = screen.getAllByTestId("search-result-item");
    fireEvent.click(items[0]);
    expect(openSpy).toHaveBeenCalledWith(
      MOCK_RESULTS[0].sourceUrl,
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });

  // --- Clear button ---

  it("clear button is not visible when input is empty", () => {
    render(<HeroSearch />);
    expect(screen.queryByTestId("hero-search-clear")).not.toBeInTheDocument();
  });

  it("clear button is visible when input has text", () => {
    render(<HeroSearch initialQuery="pizza" />);
    expect(screen.getByTestId("hero-search-clear")).toBeInTheDocument();
  });

  it("clicking clear button empties the input", () => {
    render(<HeroSearch initialQuery="pizza" />);
    fireEvent.click(screen.getByTestId("hero-search-clear"));
    expect(screen.getByTestId("hero-search-input")).toHaveValue("");
  });

  it("clicking clear button removes ?q= from URL while keeping other params", () => {
    render(<HeroSearch initialQuery="pizza" />);
    fireEvent.click(screen.getByTestId("hero-search-clear"));
    // pushes pathname with no q param (other params preserved via searchParams)
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("erasing input to empty via keyboard clears ?q= from URL", () => {
    render(<HeroSearch initialQuery="pizza" />);
    const input = screen.getByTestId("hero-search-input");
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("pressing Escape closes the dropdown", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: MOCK_RESULTS,
      total: 2,
      isLoading: false,
      isActive: true,
    });
    render(<HeroSearch initialQuery="ke" />);
    expect(screen.getByTestId("search-dropdown")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId("hero-search-input"), { key: "Escape" });
    expect(screen.queryByTestId("search-dropdown")).not.toBeInTheDocument();
  });
});
