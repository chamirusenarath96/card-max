import { render, screen, fireEvent } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";

// next-themes is mocked — the real one needs a DOM + localStorage
const mockSetTheme = vi.fn();
let mockTheme = "system";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// useSyncExternalStore returns the client snapshot synchronously in jsdom,
// so ThemeToggle is always "mounted" in tests — no extra stubbing needed.
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
    mockTheme = "system";
  });

  it("renders after mount with data-testid='theme-toggle'", () => {
    render(<ThemeToggle />);
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });

  it("cycles from system → light on first click", () => {
    mockTheme = "system";
    render(<ThemeToggle />);
    fireEvent.click(screen.getByTestId("theme-toggle"));
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  it("cycles from light → dark on click", () => {
    mockTheme = "light";
    render(<ThemeToggle />);
    fireEvent.click(screen.getByTestId("theme-toggle"));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("cycles from dark → system on click", () => {
    mockTheme = "dark";
    render(<ThemeToggle />);
    fireEvent.click(screen.getByTestId("theme-toggle"));
    expect(mockSetTheme).toHaveBeenCalledWith("system");
  });

  it("has an accessible aria-label describing the next theme", () => {
    mockTheme = "light";
    render(<ThemeToggle />);
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("aria-label", "Switch to dark mode");
  });
});
