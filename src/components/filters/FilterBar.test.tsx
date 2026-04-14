import { render, screen, fireEvent } from "@/test-utils";
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

  it("renders the filter bar container", () => {
    render(<FilterBar />);
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
  });

  it("renders the filter drawer trigger button", () => {
    render(<FilterBar />);
    expect(screen.getByTestId("filter-drawer-trigger")).toBeInTheDocument();
  });

  it("shows no active-filter chips when no props are set", () => {
    render(<FilterBar />);
    expect(screen.queryByRole("button", { name: /Remove/i })).not.toBeInTheDocument();
  });

  it("shows a bank chip when activeBank is set", () => {
    render(<FilterBar activeBank="commercial_bank" />);
    expect(screen.getByText("Commercial Bank")).toBeInTheDocument();
  });

  it("shows a category chip when activeCategory is set", () => {
    render(<FilterBar activeCategory="dining" />);
    expect(screen.getByText("Dining")).toBeInTheDocument();
  });

  it("shows an offerType chip when activeOfferType is set", () => {
    render(<FilterBar activeOfferType="cashback" />);
    expect(screen.getByText("Cashback")).toBeInTheDocument();
  });

  it("shows a sort chip when activeSort is 'expiringSoon'", () => {
    render(<FilterBar activeSort="expiringSoon" />);
    expect(screen.getByText("Expiring Soon")).toBeInTheDocument();
  });

  it("does not show a sort chip when activeSort is 'latest'", () => {
    render(<FilterBar activeSort="latest" />);
    expect(screen.queryByText("Latest")).not.toBeInTheDocument();
  });

  it("shows a date chip when both activeFrom and activeTo are set", () => {
    render(<FilterBar activeFrom="2026-03-01" activeTo="2026-06-30" />);
    expect(screen.getByText(/01 Mar/)).toBeInTheDocument();
  });

  it("shows a date chip with 'From ...' when only activeFrom is set", () => {
    render(<FilterBar activeFrom="2026-03-01" />);
    expect(screen.getByText(/From 01 Mar/)).toBeInTheDocument();
  });

  it("clicking remove on bank chip navigates without bank param", () => {
    render(<FilterBar activeBank="commercial_bank" />);
    fireEvent.click(screen.getByRole("button", { name: /Remove Commercial Bank filter/i }));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("clicking remove on category chip navigates without category param", () => {
    render(<FilterBar activeCategory="dining" />);
    fireEvent.click(screen.getByRole("button", { name: /Remove Dining filter/i }));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("clicking remove on offerType chip navigates without offerType param", () => {
    render(<FilterBar activeOfferType="cashback" />);
    fireEvent.click(screen.getByRole("button", { name: /Remove Cashback filter/i }));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("clicking remove on date chip navigates without date params", () => {
    render(<FilterBar activeFrom="2026-03-01" activeTo="2026-06-30" />);
    const removeBtn = screen.getAllByRole("button", { name: /Remove/i })[0]!;
    fireEvent.click(removeBtn);
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("shows multiple chips when multiple filters are active", () => {
    render(
      <FilterBar
        activeBank="commercial_bank"
        activeCategory="dining"
        activeOfferType="cashback"
      />,
    );
    expect(screen.getByText("Commercial Bank")).toBeInTheDocument();
    expect(screen.getByText("Dining")).toBeInTheDocument();
    expect(screen.getByText("Cashback")).toBeInTheDocument();
  });
});
