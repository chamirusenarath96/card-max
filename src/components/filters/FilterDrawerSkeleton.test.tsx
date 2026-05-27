import { render, screen } from "@/test-utils";
import { describe, it, expect } from "vitest";
import { FilterDrawerSkeleton } from "./FilterDrawerSkeleton";

describe("FilterDrawerSkeleton", () => {
  it("renders a skeleton with the correct data-testid (dynamic fallback)", () => {
    render(<FilterDrawerSkeleton />);
    expect(screen.getByTestId("filter-drawer-skeleton")).toBeInTheDocument();
  });

  it("renders a single skeleton element visible during dynamic load", () => {
    const { container } = render(<FilterDrawerSkeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
