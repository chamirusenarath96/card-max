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
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("does not render when only one page", () => {
    const pagination = { page: 1, limit: 20, total: 5, totalPages: 1 };
    const { container } = render(<PaginationControls pagination={pagination} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders prev and next buttons when multiple pages", () => {
    const pagination = { page: 2, limit: 20, total: 60, totalPages: 3 };
    render(<PaginationControls pagination={pagination} />);
    expect(screen.getByTestId("pagination-prev")).toBeInTheDocument();
    expect(screen.getByTestId("pagination-next")).toBeInTheDocument();
  });

  it("disables prev button on first page", () => {
    const pagination = { page: 1, limit: 20, total: 60, totalPages: 3 };
    render(<PaginationControls pagination={pagination} />);
    expect(screen.getByTestId("pagination-prev")).toBeDisabled();
    expect(screen.getByTestId("pagination-next")).not.toBeDisabled();
  });

  it("disables next button on last page", () => {
    const pagination = { page: 3, limit: 20, total: 60, totalPages: 3 };
    render(<PaginationControls pagination={pagination} />);
    expect(screen.getByTestId("pagination-prev")).not.toBeDisabled();
    expect(screen.getByTestId("pagination-next")).toBeDisabled();
  });

  it("navigates to previous page on prev click", () => {
    const pagination = { page: 2, limit: 20, total: 60, totalPages: 3 };
    render(<PaginationControls pagination={pagination} />);
    fireEvent.click(screen.getByTestId("pagination-prev"));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("navigates to next page on next click", () => {
    const pagination = { page: 1, limit: 20, total: 60, totalPages: 3 };
    render(<PaginationControls pagination={pagination} />);
    fireEvent.click(screen.getByTestId("pagination-next"));
    expect(mockPush).toHaveBeenCalledWith("/?page=2");
  });

  it("displays page count info", () => {
    const pagination = { page: 2, limit: 20, total: 60, totalPages: 3 };
    render(<PaginationControls pagination={pagination} />);
    expect(screen.getByTestId("pagination-controls")).toHaveTextContent("Page 2 of 3");
  });
});
