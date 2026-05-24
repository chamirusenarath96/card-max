import { render, screen } from "@/test-utils";
import { describe, it, expect, vi } from "vitest";
import { LoadTimeBadge } from "./LoadTimeBadge";

const mockUseNavigationProgress = vi.fn();
vi.mock("./NavigationProgressContext", () => ({
  useNavigationProgress: () => mockUseNavigationProgress(),
}));

describe("LoadTimeBadge", () => {
  it("does not render when lastNavMs is null", () => {
    mockUseNavigationProgress.mockReturnValue({ isPending: false, lastNavMs: null, navigate: vi.fn() });
    const { container } = render(<LoadTimeBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not render while navigation is in progress", () => {
    mockUseNavigationProgress.mockReturnValue({ isPending: true, lastNavMs: 350, navigate: vi.fn() });
    const { container } = render(<LoadTimeBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the timing badge after navigation completes", () => {
    mockUseNavigationProgress.mockReturnValue({ isPending: false, lastNavMs: 342, navigate: vi.fn() });
    render(<LoadTimeBadge />);
    expect(screen.getByTestId("load-time-badge")).toBeInTheDocument();
    expect(screen.getByTestId("load-time-badge")).toHaveTextContent("342ms");
  });

  it("displays the correct millisecond value", () => {
    mockUseNavigationProgress.mockReturnValue({ isPending: false, lastNavMs: 88, navigate: vi.fn() });
    render(<LoadTimeBadge />);
    expect(screen.getByTestId("load-time-badge")).toHaveTextContent("88ms");
  });
});
