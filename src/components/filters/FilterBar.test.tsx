import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FilterBar } from "./FilterBar";

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

  it("renders the 'All Banks' chip", () => {
    render(<FilterBar />);
    expect(screen.getByTestId("bank-filter-all")).toBeInTheDocument();
  });

  it("renders category chips including Other", () => {
    render(<FilterBar />);
    expect(screen.getByTestId("category-chip-dining")).toBeInTheDocument();
    expect(screen.getByTestId("category-chip-other")).toBeInTheDocument();
  });

  it("renders offer type chips", () => {
    render(<FilterBar />);
    expect(screen.getByTestId("offer-type-all")).toBeInTheDocument();
    expect(screen.getByTestId("offer-type-percentage")).toBeInTheDocument();
    expect(screen.getByTestId("offer-type-cashback")).toBeInTheDocument();
  });

  it("renders the date filter section", () => {
    render(<FilterBar />);
    expect(screen.getByTestId("date-filter")).toBeInTheDocument();
  });

  it("renders section titles", () => {
    render(<FilterBar />);
    expect(screen.getByText("Quick Filters")).toBeInTheDocument();
    expect(screen.getByText("Filter by Bank")).toBeInTheDocument();
    expect(screen.getByText("Date Filter")).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByText("Offer Type")).toBeInTheDocument();
  });

  it("renders Latest and Expiring Soon quick-filter chips", () => {
    render(<FilterBar />);
    expect(screen.getByTestId("sort-latest")).toBeInTheDocument();
    expect(screen.getByTestId("sort-expiringSoon")).toBeInTheDocument();
  });

  it("Latest is active by default when no sort prop", () => {
    render(<FilterBar />);
    expect(screen.getByTestId("sort-latest").className).toContain("bg-primary");
  });

  it("clicking Expiring Soon pushes sort param", () => {
    render(<FilterBar />);
    fireEvent.click(screen.getByTestId("sort-expiringSoon"));
    expect(mockPush).toHaveBeenCalledWith("/?sort=expiringSoon");
  });

  it("clicking active sort chip deselects it", () => {
    render(<FilterBar activeSort="expiringSoon" />);
    fireEvent.click(screen.getByTestId("sort-expiringSoon"));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("clicking a bank chip calls router.push with bank param", () => {
    render(<FilterBar />);
    fireEvent.click(screen.getByTestId("bank-filter-commercial_bank"));
    expect(mockPush).toHaveBeenCalledWith("/?bank=commercial_bank");
  });

  it("clicking active bank chip deselects it", () => {
    render(<FilterBar activeBank="commercial_bank" />);
    fireEvent.click(screen.getByTestId("bank-filter-commercial_bank"));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("marks active bank chip with aria-pressed=true", () => {
    render(<FilterBar activeBank="hnb" />);
    expect(screen.getByTestId("bank-filter-hnb")).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking a category chip navigates with category param", () => {
    render(<FilterBar />);
    fireEvent.click(screen.getByTestId("category-chip-dining"));
    expect(mockPush).toHaveBeenCalledWith("/?category=dining");
  });

  it("clicking an offer type chip navigates with offerType param", () => {
    render(<FilterBar />);
    fireEvent.click(screen.getByTestId("offer-type-cashback"));
    expect(mockPush).toHaveBeenCalledWith("/?offerType=cashback");
  });

  it("passes activeFrom and activeTo to DateFilter", () => {
    render(<FilterBar activeFrom="2026-03-01" activeTo="2026-06-30" />);
    expect(screen.getByTestId("date-from")).toHaveValue("2026-03-01");
    expect(screen.getByTestId("date-to")).toHaveValue("2026-06-30");
  });
});
