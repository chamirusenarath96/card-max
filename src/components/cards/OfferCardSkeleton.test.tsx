import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { OfferCardSkeleton } from "./OfferCardSkeleton";

describe("OfferCardSkeleton", () => {
  it("renders the skeleton container", () => {
    render(<OfferCardSkeleton />);
    expect(screen.getByTestId("offer-skeleton")).toBeInTheDocument();
  });

  it("renders 6 skeleton cards by default", () => {
    render(<OfferCardSkeleton />);
    const container = screen.getByTestId("offer-skeleton");
    expect(container.children).toHaveLength(6);
  });

  it("renders custom number of skeleton cards", () => {
    render(<OfferCardSkeleton count={3} />);
    const container = screen.getByTestId("offer-skeleton");
    expect(container.children).toHaveLength(3);
  });

  it("renders compact skeleton variant", () => {
    render(<OfferCardSkeleton size="compact" count={2} />);
    const container = screen.getByTestId("offer-skeleton");
    expect(container.children).toHaveLength(2);
  });

  it("renders expanded skeleton variant", () => {
    render(<OfferCardSkeleton size="expanded" count={2} />);
    const container = screen.getByTestId("offer-skeleton");
    expect(container.children).toHaveLength(2);
  });
});
