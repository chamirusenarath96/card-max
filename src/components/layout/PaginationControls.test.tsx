import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaginationControls } from "./PaginationControls";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

describe("PaginationControls", () => {
  beforeEach(() => { mockPush.mockClear(); });

  it("does not render when only one page", () => {
    const { container } = render(<PaginationControls pagination={{ page: 1, limit: 20, total: 5, totalPages: 1 }} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders prev and next buttons when multiple pages", () => {
    render(<PaginationControls pagination={{ page: 2, limit: 20, total: 60, totalPages: 3 }} />);
    expect(screen.getByTestId("pagination-prev")).toBeInTheDocument();
    expect(screen.getByTestId("pagination-next")).toBeInTheDocument();
  });

  it("disables prev button on first page", () => {
    render(<PaginationControls pagination={{ page: 1, limit: 20, total: 60, totalPages: 3 }} />);
    expect(screen.getByTestId("pagination-prev")).toBeDisabled();
  });

  it("disables next button on last page", () => {
    render(<PaginationControls pagination={{ page: 3, limit: 20, total: 60, totalPages: 3 }} />);
    expect(screen.getByTestId("pagination-next")).toBeDisabled();
  });

  it("navigates to next page on click", () => {
    render(<PaginationControls pagination={{ page: 1, limit: 20, total: 60, totalPages: 3 }} />);
    fireEvent.click(screen.getByTestId("pagination-next"));
    expect(mockPush).toHaveBeenCalledWith("/?page=2");
  });

  it("displays total offer count in sr-only", () => {
    render(<PaginationControls pagination={{ page: 2, limit: 20, total: 60, totalPages: 3 }} />);
    expect(screen.getByTestId("pagination-controls")).toHaveTextContent("60 offers");
  });
});
