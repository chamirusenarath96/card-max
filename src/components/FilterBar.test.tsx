import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FilterBar } from "./FilterBar";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

describe("FilterBar", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders all four bank filter chips", () => {
    render(<FilterBar />);
    expect(screen.getByTestId("bank-filter-commercial_bank")).toBeInTheDocument();
    expect(screen.getByTestId("bank-filter-sampath_bank")).toBeInTheDocument();
    expect(screen.getByTestId("bank-filter-hnb")).toBeInTheDocument();
    expect(screen.getByTestId("bank-filter-nations_trust_bank")).toBeInTheDocument();
  });

  it("renders the category dropdown", () => {
    render(<FilterBar />);
    expect(screen.getByTestId("category-filter")).toBeInTheDocument();
  });

  it("clicking a bank chip calls router.push with bank param", () => {
    render(<FilterBar />);
    fireEvent.click(screen.getByTestId("bank-filter-commercial_bank"));
    expect(mockPush).toHaveBeenCalledWith("/?bank=commercial_bank");
  });

  it("clicking active bank chip deselects it (removes param)", () => {
    render(<FilterBar activeBank="commercial_bank" />);
    fireEvent.click(screen.getByTestId("bank-filter-commercial_bank"));
    // Should navigate without bank param
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("marks active bank chip with aria-pressed=true", () => {
    render(<FilterBar activeBank="hnb" />);
    expect(screen.getByTestId("bank-filter-hnb")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("bank-filter-commercial_bank")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("changing category dropdown calls router.push with category param", () => {
    render(<FilterBar />);
    fireEvent.change(screen.getByTestId("category-filter"), {
      target: { value: "dining" },
    });
    expect(mockPush).toHaveBeenCalledWith("/?category=dining");
  });

  it("selecting 'All Categories' removes category param", () => {
    render(<FilterBar activeCategory="dining" />);
    fireEvent.change(screen.getByTestId("category-filter"), {
      target: { value: "" },
    });
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});
