import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Footer } from "./Footer";

describe("Footer", () => {
  it("renders the site name", () => {
    render(<Footer />);
    expect(screen.getByText("CardMax")).toBeInTheDocument();
  });

  it("renders the tagline with text-foreground/70 class for WCAG contrast (T1)", () => {
    render(<Footer />);
    const tagline = screen.getByTestId("footer-tagline");
    expect(tagline).toHaveClass("text-foreground/70");
    // Must NOT use text-muted-foreground which fails 4.5:1 contrast on bg-muted
    expect(tagline).not.toHaveClass("text-muted-foreground");
  });

  it("renders footer links with text-foreground/70 class for WCAG contrast (T1)", () => {
    render(<Footer />);
    const links = screen.getByTestId("footer-links");
    expect(links).toHaveClass("text-foreground/70");
    expect(links).not.toHaveClass("text-muted-foreground");
  });

  it("renders Privacy, Terms, and Support links", () => {
    render(<Footer />);
    expect(screen.getByText("Privacy")).toBeInTheDocument();
    expect(screen.getByText("Terms")).toBeInTheDocument();
    expect(screen.getByText("Support")).toBeInTheDocument();
  });

  it("has data-testid on the footer element", () => {
    render(<Footer />);
    expect(screen.getByTestId("site-footer")).toBeInTheDocument();
  });
});
