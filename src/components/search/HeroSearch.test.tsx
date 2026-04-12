import { render, screen, fireEvent } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HeroSearch } from "./HeroSearch";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

describe("HeroSearch", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders the hero search container", () => {
    render(<HeroSearch />);
    expect(screen.getByTestId("hero-search")).toBeInTheDocument();
  });

  it("renders the search input", () => {
    render(<HeroSearch />);
    expect(screen.getByTestId("hero-search-input")).toBeInTheDocument();
  });

  it("renders the Search Now button", () => {
    render(<HeroSearch />);
    expect(screen.getByTestId("hero-search-button")).toBeInTheDocument();
  });

  it("renders the example hint text", () => {
    render(<HeroSearch />);
    expect(screen.getByTestId("hero-search-hint")).toBeInTheDocument();
  });

  it("renders suggestion chips", () => {
    render(<HeroSearch />);
    expect(screen.getByTestId("search-suggestions")).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-dining")).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-cashback")).toBeInTheDocument();
    expect(screen.getByTestId("suggestion-expiring-soon")).toBeInTheDocument();
  });

  it("shows initialQuery in the input", () => {
    render(<HeroSearch initialQuery="pizza" />);
    expect(screen.getByTestId("hero-search-input")).toHaveValue("pizza");
  });

  it("clicking Search Now navigates with q param", () => {
    render(<HeroSearch />);
    fireEvent.change(screen.getByTestId("hero-search-input"), {
      target: { value: "keells" },
    });
    fireEvent.click(screen.getByTestId("hero-search-button"));
    expect(mockPush).toHaveBeenCalledWith("/?q=keells");
  });

  it("pressing Enter on the input navigates with q param", () => {
    render(<HeroSearch />);
    const input = screen.getByTestId("hero-search-input");
    fireEvent.change(input, { target: { value: "pizza" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/?q=pizza");
  });

  it("clicking 'Dining' chip navigates with category=dining", () => {
    render(<HeroSearch />);
    fireEvent.click(screen.getByTestId("suggestion-dining"));
    expect(mockPush).toHaveBeenCalledWith("/?category=dining");
  });

  it("clicking 'Cashback' chip navigates with offerType=cashback", () => {
    render(<HeroSearch />);
    fireEvent.click(screen.getByTestId("suggestion-cashback"));
    expect(mockPush).toHaveBeenCalledWith("/?offerType=cashback");
  });

  it("clicking 'Expiring Soon' chip navigates with sort=expiringSoon", () => {
    render(<HeroSearch />);
    fireEvent.click(screen.getByTestId("suggestion-expiring-soon"));
    expect(mockPush).toHaveBeenCalledWith("/?sort=expiringSoon");
  });

  it("clicking 'Hotels' chip navigates with q=hotel", () => {
    render(<HeroSearch />);
    fireEvent.click(screen.getByTestId("suggestion-hotels"));
    expect(mockPush).toHaveBeenCalledWith("/?q=hotel");
  });

  it("Search Now with empty query navigates to root path", () => {
    render(<HeroSearch />);
    fireEvent.click(screen.getByTestId("hero-search-button"));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("Search Now with whitespace-only query navigates to root path", () => {
    render(<HeroSearch />);
    fireEvent.change(screen.getByTestId("hero-search-input"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByTestId("hero-search-button"));
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});
