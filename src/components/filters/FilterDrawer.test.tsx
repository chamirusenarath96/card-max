import { render, screen, fireEvent, waitFor } from "@/test-utils";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FilterDrawer } from "./FilterDrawer";
import type { UseCategoriesResult } from "@/hooks/useCategories";

/** Stub matchMedia so `isDesktop` resolves to a known value for the "(min-width: 640px)" query. */
function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

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
    // Default to a desktop viewport so sections start expanded, matching
    // pre-redesign behaviour that most existing tests rely on.
    mockMatchMedia(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  // ── "All" pills always present ────────────────────────────────────────────

  it("'All' category chip is always present regardless of API state", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    expect(await screen.findByTestId("category-chip-all")).toBeInTheDocument();
  });

  it("'All' chip is present even when API returns empty data", async () => {
    mockUseCategories.mockReturnValue({ data: [], isLoading: false, error: false });

    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    expect(await screen.findByTestId("category-chip-all")).toBeInTheDocument();
    expect(screen.queryByTestId("category-chip-dining")).not.toBeInTheDocument();
  });

  it("'All' chip is present even when API errors", async () => {
    mockUseCategories.mockReturnValue({ data: [], isLoading: false, error: true });

    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    expect(await screen.findByTestId("category-chip-all")).toBeInTheDocument();
  });

  // ── Multi-select: chips toggle, Apply navigates ───────────────────────────

  it("clicking a bank chip highlights it without navigating", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    const chip = await screen.findByTestId("bank-filter-commercial_bank");
    fireEvent.click(chip);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("clicking Apply after selecting one bank navigates with bank param", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    fireEvent.click(await screen.findByTestId("bank-filter-commercial_bank"));
    fireEvent.click(screen.getByTestId("apply-filters"));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("bank=commercial_bank"));
  });

  it("AC1 — clicking two bank chips then Apply includes both banks in the URL", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    fireEvent.click(await screen.findByTestId("bank-filter-hnb"));
    fireEvent.click(await screen.findByTestId("bank-filter-sampath_bank"));
    fireEvent.click(screen.getByTestId("apply-filters"));
    const url = mockNavigate.mock.calls[0]![0] as string;
    expect(url).toContain("bank=hnb");
    expect(url).toContain("bank=sampath_bank");
  });

  it("AC2 — clicking a selected bank chip again deselects it", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    const chip = await screen.findByTestId("bank-filter-hnb");
    fireEvent.click(chip); // select
    fireEvent.click(chip); // deselect
    fireEvent.click(screen.getByTestId("apply-filters"));
    expect(mockNavigate).toHaveBeenCalledWith(expect.not.stringContaining("bank=hnb"));
  });

  it("AC3 — 'All Banks' button clears multi-bank selection", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    fireEvent.click(await screen.findByTestId("bank-filter-hnb"));
    fireEvent.click(await screen.findByTestId("bank-filter-sampath_bank"));
    fireEvent.click(await screen.findByTestId("bank-filter-all"));
    fireEvent.click(screen.getByTestId("apply-filters"));
    const url = mockNavigate.mock.calls[0]![0] as string;
    expect(url).not.toContain("bank=");
  });

  // ── Category multi-select ─────────────────────────────────────────────────

  it("AC7 — clicking a dynamic category chip then Apply sets the category filter", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    fireEvent.click(await screen.findByTestId("category-chip-dining"));
    fireEvent.click(screen.getByTestId("apply-filters"));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("category=dining"));
  });

  it("clicking two categories then Apply includes both in the URL", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    fireEvent.click(await screen.findByTestId("category-chip-dining"));
    fireEvent.click(await screen.findByTestId("category-chip-groceries"));
    fireEvent.click(screen.getByTestId("apply-filters"));
    const url = mockNavigate.mock.calls[0]![0] as string;
    expect(url).toContain("category=dining");
    expect(url).toContain("category=groceries");
  });

  it("clicking 'All' category chip clears all category selections", async () => {
    mockSearchParams.params = new URLSearchParams("category=dining");
    render(<FilterDrawer activeCategories={["dining"]} />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    fireEvent.click(await screen.findByTestId("category-chip-all"));
    fireEvent.click(screen.getByTestId("apply-filters"));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(expect.not.stringContaining("category=")),
    );
  });

  // ── Active count badge ────────────────────────────────────────────────────

  it("AC6 — active count badge reflects total number of selections", () => {
    render(<FilterDrawer activeBanks={["hnb", "sampath_bank"]} activeCategories={["dining"]} />);
    // 2 banks + 1 category = 3 active filters
    const trigger = screen.getByTestId("filter-drawer-trigger");
    expect(trigger.textContent).toContain("3");
  });

  // ── Apply clears freetext search query ───────────────────────────────────

  it("applying filters clears the 'q' search param from the URL", async () => {
    mockSearchParams.params = new URLSearchParams("q=pizza&category=dining");

    render(<FilterDrawer activeCategories={["dining"]} />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    fireEvent.click(await screen.findByTestId("bank-filter-commercial_bank"));
    fireEvent.click(screen.getByTestId("apply-filters"));

    expect(mockNavigate).toHaveBeenCalledWith(expect.not.stringContaining("q="));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("bank=commercial_bank"));
  });

  // ── Clear all: immediate navigation without Apply ─────────────────────────

  it("Clear all navigates immediately to pathname without any params", async () => {
    render(<FilterDrawer activeBanks={["hnb"]} activeCategories={["dining"]} />);
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
    render(<FilterDrawer activeBanks={["hnb"]} />);
    expect(screen.getByTestId("filter-drawer-trigger")).not.toHaveClass("animate-filter-glow");
  });

  // ── Collapsible sections (spec 043) ───────────────────────────────────────

  it("AC1 — clicking a section header toggles its collapsed/expanded state", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    const toggle = await screen.findByTestId("filter-section-toggle-sort");

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("AC3 — Date Range section renders after Include Expired in DOM order", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    await screen.findByTestId("filter-drawer");

    // Sheet content is portaled to document.body, so query from there.
    const toggleIds = Array.from(
      document.body.querySelectorAll('[data-testid^="filter-section-toggle-"]'),
    ).map((el) => el.getAttribute("data-testid"));

    expect(toggleIds[toggleIds.length - 1]).toBe("filter-section-toggle-dateRange");
    expect(toggleIds[toggleIds.length - 2]).toBe("filter-section-toggle-includeExpired");
  });

  it("AC2 — sections render collapsed by default on a mobile viewport", async () => {
    mockMatchMedia(false); // below the sm breakpoint
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    const sortToggle = await screen.findByTestId("filter-section-toggle-sort");
    const bankToggle = await screen.findByTestId("filter-section-toggle-bank");

    expect(sortToggle).toHaveAttribute("aria-expanded", "false");
    expect(bankToggle).toHaveAttribute("aria-expanded", "false");
  });

  it("sections render expanded by default on a desktop viewport", async () => {
    mockMatchMedia(true);
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    const sortToggle = await screen.findByTestId("filter-section-toggle-sort");

    expect(sortToggle).toHaveAttribute("aria-expanded", "true");
  });

  it("AC7 — filter-drawer retains bank-filter-*, category-chip-*, apply-filters testids", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));

    expect(await screen.findByTestId("bank-filter-commercial_bank")).toBeInTheDocument();
    expect(await screen.findByTestId("category-chip-dining")).toBeInTheDocument();
    expect(screen.getByTestId("apply-filters")).toBeInTheDocument();
    expect(screen.getByTestId("include-expired-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("offer-type-percentage")).toBeInTheDocument();
  });

  it("AC5 — desktop viewport keeps the sm:max-w-md side panel sizing class", async () => {
    mockMatchMedia(true);
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    const drawer = await screen.findByTestId("filter-drawer");
    expect(drawer).toHaveClass("sm:max-w-md");
  });

  it("AC4 — mobile viewport applies full-viewport sizing classes", async () => {
    mockMatchMedia(false);
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    const drawer = await screen.findByTestId("filter-drawer");
    expect(drawer.className).toContain("h-dvh");
    expect(drawer.className).toContain("w-full");
  });

  it("expanding a collapsed section, selecting a filter, and applying it still navigates correctly", async () => {
    mockMatchMedia(false); // sections start collapsed
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));

    const bankToggle = await screen.findByTestId("filter-section-toggle-bank");
    fireEvent.click(bankToggle); // expand Bank section
    fireEvent.click(await screen.findByTestId("bank-filter-commercial_bank"));
    fireEvent.click(screen.getByTestId("apply-filters"));

    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("bank=commercial_bank"));
  });
});
