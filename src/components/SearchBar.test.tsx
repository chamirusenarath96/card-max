import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SearchBar } from "./SearchBar";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

describe("SearchBar", () => {
  beforeEach(() => {
    mockPush.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the search input", () => {
    render(<SearchBar />);
    expect(screen.getByTestId("search-input")).toBeInTheDocument();
  });

  it("shows initial query value", () => {
    render(<SearchBar initialQuery="pizza" />);
    expect(screen.getByTestId("search-input")).toHaveValue("pizza");
  });

  it("debounces input and pushes URL after 300ms", () => {
    render(<SearchBar />);
    fireEvent.change(screen.getByTestId("search-input"), {
      target: { value: "keells" },
    });
    expect(mockPush).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(mockPush).toHaveBeenCalledWith("/?q=keells");
  });

  it("shows clear button when query is non-empty", () => {
    render(<SearchBar initialQuery="test" />);
    expect(screen.getByTestId("search-clear")).toBeInTheDocument();
  });

  it("does not show clear button when query is empty", () => {
    render(<SearchBar />);
    expect(screen.queryByTestId("search-clear")).not.toBeInTheDocument();
  });

  it("clears search and navigates on clear click", () => {
    render(<SearchBar initialQuery="test" />);
    fireEvent.click(screen.getByTestId("search-clear"));
    expect(mockPush).toHaveBeenCalledWith("/");
    expect(screen.getByTestId("search-input")).toHaveValue("");
  });

  it("pushes immediately on Enter key", () => {
    render(<SearchBar />);
    const input = screen.getByTestId("search-input");
    fireEvent.change(input, { target: { value: "pizza" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/?q=pizza");
  });
});
