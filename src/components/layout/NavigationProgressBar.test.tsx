import { render, screen } from "@/test-utils";
import { describe, it, expect, vi } from "vitest";
import { NavigationProgressBar } from "./NavigationProgressBar";

const mockUseNavigationProgress = vi.fn();
vi.mock("./NavigationProgressContext", () => ({
  useNavigationProgress: () => mockUseNavigationProgress(),
}));

describe("NavigationProgressBar", () => {
  it("renders the progress bar container", () => {
    mockUseNavigationProgress.mockReturnValue({ isPending: false, lastNavMs: null, navigate: vi.fn() });
    render(<NavigationProgressBar />);
    expect(screen.getByTestId("nav-progress-bar")).toBeInTheDocument();
  });

  it("is invisible (opacity-0) when not pending", () => {
    mockUseNavigationProgress.mockReturnValue({ isPending: false, lastNavMs: null, navigate: vi.fn() });
    render(<NavigationProgressBar />);
    expect(screen.getByTestId("nav-progress-bar")).toHaveClass("opacity-0");
  });

  it("is visible (opacity-100) when pending", () => {
    mockUseNavigationProgress.mockReturnValue({ isPending: true, lastNavMs: null, navigate: vi.fn() });
    render(<NavigationProgressBar />);
    expect(screen.getByTestId("nav-progress-bar")).toHaveClass("opacity-100");
  });
});
