import { render, screen } from "@/test-utils";
import { describe, it, expect, vi } from "vitest";
import { FilterBar } from "./FilterBar";

// FilterBar now lazy-loads FilterDrawer via next/dynamic.
// Mock next/dynamic to show the loading skeleton synchronously so unit tests
// stay fast and predictable. FilterDrawer interactions are covered by
// FilterDrawer.test.tsx and the E2E bundle-optimisation spec.
vi.mock("next/dynamic", () => ({
  default: (_fn: unknown, opts?: { loading?: () => React.ReactElement }) =>
    opts?.loading ?? (() => null),
}));

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({ data: [], isLoading: false, error: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/layout/NavigationProgressContext", () => ({
  useNavigationProgress: () => ({
    navigate: vi.fn(),
    isPending: false,
    lastNavMs: null,
  }),
}));

describe("FilterBar", () => {
  it("renders the filter bar container", () => {
    render(<FilterBar />);
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
  });

  it("shows the loading skeleton while FilterDrawer is loading", () => {
    render(<FilterBar />);
    expect(screen.getByTestId("filter-drawer-skeleton")).toBeInTheDocument();
  });

  it("renders without props (no active filters)", () => {
    render(<FilterBar />);
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove /i })).not.toBeInTheDocument();
  });

  it("renders with active filter props without errors", () => {
    render(<FilterBar activeBanks={["commercial_bank"]} activeCategories={["dining"]} />);
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
  });
});
