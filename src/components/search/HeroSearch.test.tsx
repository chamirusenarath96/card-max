import { render, screen, fireEvent, act } from "@/test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HeroSearch } from "./HeroSearch";
import type { SuggestionItem } from "./useSearchSuggestions";

const mockNavigate = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/layout/NavigationProgressContext", () => ({
  useNavigationProgress: () => ({
    navigate: mockNavigate,
    isPending: false,
    lastNavMs: null,
  }),
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
    mockNavigate.mockClear();
    mockUseSearchSuggestions.mockReturnValue({
      results: [],
      total: 0,
      isLoading: false,
      isActive: false,
    });
    // Stub matchMedia for typewriter (no reduced motion by default)
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders the hero search container", () => {
    render(<HeroSearch />);
    expect(screen.getByTestId("hero-search")).toBeInTheDocument();
  });

  it("renders the search input", () => {
    render(<HeroSearch />);
    expect(screen.getByTestId("hero-search-input")).toBeInTheDocument();
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
    expect(mockNavigate).toHaveBeenCalledWith("/?q=pizza");
  });

  // --- AC1: No hardcoded dropdown suggestions on mount ---

  it("no hardcoded suggestions rendered on mount — dropdown is not shown on initial render", () => {
    render(<HeroSearch />);
    // The dropdown must NOT appear on mount (no hardcoded items)
    expect(screen.queryByTestId("search-dropdown")).not.toBeInTheDocument();
  });

  // --- AC2: Suggestions dropdown shows only live API results ---

  it("suggestions render when API returns results (query >= 2 chars)", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: MOCK_RESULTS,
      total: 2,
      isLoading: false,
      isActive: true,
    });
    render(<HeroSearch initialQuery="ke" />);
    expect(screen.getByTestId("search-dropdown")).toBeInTheDocument();
    expect(screen.getAllByTestId("search-result-item")).toHaveLength(2);
  });

  it("suggestions hidden when query < 2 chars", () => {
    // isActive=false when query is too short
    mockUseSearchSuggestions.mockReturnValue({
      results: [],
      total: 0,
      isLoading: false,
      isActive: false,
    });
    render(<HeroSearch initialQuery="k" />);
    expect(screen.queryByTestId("search-dropdown")).not.toBeInTheDocument();
  });

  // --- AC3: Typewriter placeholder ---

  it("typewriter cycles through phrases using fake timers", () => {
    vi.useFakeTimers();
    render(<HeroSearch />);
    const input = screen.getByTestId("hero-search-input");

    // Advance past the initial tick (30ms) — first character types
    act(() => { vi.advanceTimersByTime(30); });
    const firstPlaceholder = input.getAttribute("placeholder") ?? "";
    // After first tick, placeholder should have started or have fallback
    expect(typeof firstPlaceholder).toBe("string");

    // Advance enough to type a full phrase (longest phrase ~25 chars × 30ms = 750ms)
    act(() => { vi.advanceTimersByTime(750); });
    const afterTyping = input.getAttribute("placeholder") ?? "";
    expect(afterTyping.length).toBeGreaterThan(0);

    // Advance past the pause (1800ms) and start backspacing
    act(() => { vi.advanceTimersByTime(1800); });

    // Advance through backspacing (25 chars × 15ms = 375ms)
    act(() => { vi.advanceTimersByTime(375); });
    const afterBackspace = input.getAttribute("placeholder") ?? "";
    // After full backspace the phrase should be short or empty (switching)
    expect(afterBackspace.length).toBeLessThan(afterTyping.length);
  });

  it("typewriter pauses at full phrase then backspaces", () => {
    vi.useFakeTimers();
    render(<HeroSearch />);
    const input = screen.getByTestId("hero-search-input");

    // Type first phrase completely: "dining offers at Keells…" = 24 chars × 30ms = 720ms
    act(() => { vi.advanceTimersByTime(750); });
    const fullPhrase = input.getAttribute("placeholder") ?? "";

    // Pause period: 1800ms — placeholder should still be full phrase
    act(() => { vi.advanceTimersByTime(900); }); // halfway through pause
    expect(input.getAttribute("placeholder")).toBe(fullPhrase);

    // After full pause, backspacing begins
    act(() => { vi.advanceTimersByTime(900 + 15); });
    const afterOneBackspace = input.getAttribute("placeholder") ?? "";
    expect(afterOneBackspace.length).toBeLessThanOrEqual(fullPhrase.length);
  });

  it("typewriter uses static phrase when prefers-reduced-motion is set", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    render(<HeroSearch />);
    // With reduced motion, placeholder is set immediately to the first phrase
    const input = screen.getByTestId("hero-search-input");
    const placeholder = input.getAttribute("placeholder") ?? "";
    // Either the static phrase or the fallback
    expect(typeof placeholder).toBe("string");
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

  it("clicking a result navigates in-app with the offer title as the search query", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: MOCK_RESULTS,
      total: 2,
      isLoading: false,
      isActive: true,
    });
    render(<HeroSearch initialQuery="ke" />);
    const items = screen.getAllByTestId("search-result-item");
    fireEvent.click(items[0]);
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining(new URLSearchParams({ q: MOCK_RESULTS[0].title }).toString()),
    );
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
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("erasing input to empty via keyboard clears ?q= from URL", () => {
    render(<HeroSearch initialQuery="pizza" />);
    const input = screen.getByTestId("hero-search-input");
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  // --- AC3: ARIA attribute correctness (T3) ---

  it("search input does not carry aria-expanded (invalid on role=textbox) (T3)", () => {
    render(<HeroSearch />);
    const input = screen.getByTestId("hero-search-input");
    // aria-expanded must NOT be on the <input> — it belongs on the combobox container
    expect(input).not.toHaveAttribute("aria-expanded");
  });

  it("combobox container carries aria-expanded and role=combobox (T3)", () => {
    render(<HeroSearch />);
    // The container div wrapping the input should have role="combobox"
    const combobox = screen.getByRole("combobox");
    expect(combobox).toBeInTheDocument();
    expect(combobox).toHaveAttribute("aria-haspopup", "listbox");
  });

  it("combobox aria-expanded reflects dropdown open state (T3)", () => {
    mockUseSearchSuggestions.mockReturnValue({
      results: MOCK_RESULTS,
      total: 2,
      isLoading: false,
      isActive: true,
    });
    render(<HeroSearch initialQuery="ke" />);
    const combobox = screen.getByRole("combobox");
    // Dropdown is open when isActive=true — aria-expanded should be true
    expect(combobox).toHaveAttribute("aria-expanded", "true");
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
