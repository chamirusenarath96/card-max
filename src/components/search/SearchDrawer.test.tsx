import { render, screen, fireEvent } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SearchDrawer } from "./SearchDrawer";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

describe("SearchDrawer", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders the search drawer trigger button", () => {
    render(<SearchDrawer />);
    expect(screen.getByTestId("search-drawer-trigger")).toBeInTheDocument();
  });

  it("trigger button has aria-label 'Open search'", () => {
    render(<SearchDrawer />);
    expect(screen.getByLabelText("Open search")).toBeInTheDocument();
  });

  it("shows the Ctrl+S keyboard hint", () => {
    render(<SearchDrawer />);
    expect(screen.getByText("Ctrl+S")).toBeInTheDocument();
  });

  it("drawer is closed by default — input not visible", () => {
    render(<SearchDrawer />);
    expect(screen.queryByTestId("search-drawer-input")).not.toBeInTheDocument();
  });

  it("opening the drawer reveals the search input", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("search-drawer-input")).toBeInTheDocument();
  });

  it("opening the drawer reveals popular search chips", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("quick-search-dining-deals")).toBeInTheDocument();
    expect(screen.getByTestId("quick-search-cashback")).toBeInTheDocument();
  });

  it("opening the drawer reveals category jump chips", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("jump-dining")).toBeInTheDocument();
    expect(screen.getByTestId("jump-shopping")).toBeInTheDocument();
    expect(screen.getByTestId("jump-expiring-soon")).toBeInTheDocument();
  });

  it("shows initialQuery in the input when drawer opens", () => {
    render(<SearchDrawer initialQuery="pizza" />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    expect(screen.getByTestId("search-drawer-input")).toHaveValue("pizza");
  });

  it("clicking Search button navigates with q param and closes drawer", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    fireEvent.change(screen.getByTestId("search-drawer-input"), {
      target: { value: "keells" },
    });
    fireEvent.click(screen.getByTestId("search-drawer-submit"));
    expect(mockPush).toHaveBeenCalledWith("/?q=keells");
    expect(screen.queryByTestId("search-drawer-input")).not.toBeInTheDocument();
  });

  it("pressing Enter on the input navigates and closes drawer", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    const input = screen.getByTestId("search-drawer-input");
    fireEvent.change(input, { target: { value: "pizza" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockPush).toHaveBeenCalledWith("/?q=pizza");
  });

  it("clicking a popular search navigates with that query", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    fireEvent.click(screen.getByTestId("quick-search-cashback"));
    expect(mockPush).toHaveBeenCalledWith("/?q=cashback");
  });

  it("clicking 'Dining' jump navigates with category=dining", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    fireEvent.click(screen.getByTestId("jump-dining"));
    expect(mockPush).toHaveBeenCalledWith("/?category=dining");
  });

  it("clicking 'Expiring Soon' jump navigates with sort=expiringSoon", () => {
    render(<SearchDrawer />);
    fireEvent.click(screen.getByTestId("search-drawer-trigger"));
    fireEvent.click(screen.getByTestId("jump-expiring-soon"));
    expect(mockPush).toHaveBeenCalledWith("/?sort=expiringSoon");
  });
});
