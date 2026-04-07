import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PaginationControls } from "./PaginationControls";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

describe("PaginationControls", () => {
  it("does not render when only one page", () => {
    const { container } = render(<PaginationControls pagination={{ page: 1, limit: 20, total: 5, totalPages: 1 }} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders prev and next buttons when multiple pages", () => {
    render(<PaginationControls pagination={{ page: 2, limit: 20, total: 60, totalPages: 3 }} />);
    expect(screen.getByTestId("pagination-prev")).toBeInTheDocument();
    expect(screen.getByTestId("pagination-next")).toBeInTheDocument();
  });

  it("marks prev button as aria-disabled on first page", () => {
    render(<PaginationControls pagination={{ page: 1, limit: 20, total: 60, totalPages: 3 }} />);
    expect(screen.getByTestId("pagination-prev")).toHaveAttribute("aria-disabled", "true");
  });

  it("marks next button as aria-disabled on last page", () => {
    render(<PaginationControls pagination={{ page: 3, limit: 20, total: 60, totalPages: 3 }} />);
    expect(screen.getByTestId("pagination-next")).toHaveAttribute("aria-disabled", "true");
  });

  it("next link points to page 2 when on page 1", () => {
    render(<PaginationControls pagination={{ page: 1, limit: 20, total: 60, totalPages: 3 }} />);
    expect(screen.getByTestId("pagination-next")).toHaveAttribute("href", "/?page=2");
  });

  it("prev link points to page 1 (no param) when on page 2", () => {
    render(<PaginationControls pagination={{ page: 2, limit: 20, total: 60, totalPages: 3 }} />);
    expect(screen.getByTestId("pagination-prev")).toHaveAttribute("href", "/");
  });

  it("displays total offer count in sr-only", () => {
    render(<PaginationControls pagination={{ page: 2, limit: 20, total: 60, totalPages: 3 }} />);
    expect(screen.getByTestId("pagination-controls")).toHaveTextContent("60 offers");
  });
});
