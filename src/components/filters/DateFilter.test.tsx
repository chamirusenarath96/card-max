import { render, screen, fireEvent } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DateFilter } from "./DateFilter";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

describe("DateFilter", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders the date range trigger button", () => {
    render(<DateFilter />);
    expect(screen.getByTestId("date-range-trigger")).toBeInTheDocument();
  });

  it("renders the Date Range section label", () => {
    render(<DateFilter />);
    expect(screen.getByText("Date Range")).toBeInTheDocument();
  });

  it("shows placeholder text when no dates are set", () => {
    render(<DateFilter />);
    expect(screen.getByTestId("date-range-trigger")).toHaveTextContent("Select date range");
  });

  it("shows 'From ...' label when only activeFrom is set", () => {
    render(<DateFilter activeFrom="2026-06-01" />);
    expect(screen.getByTestId("date-range-trigger")).toHaveTextContent("From 01 Jun 2026");
  });

  it("shows 'Until ...' label when only activeTo is set", () => {
    render(<DateFilter activeTo="2026-12-31" />);
    expect(screen.getByTestId("date-range-trigger")).toHaveTextContent("Until 31 Dec 2026");
  });

  it("shows formatted range when both dates are set", () => {
    render(<DateFilter activeFrom="2026-03-01" activeTo="2026-06-30" />);
    expect(screen.getByTestId("date-range-trigger")).toHaveTextContent("01 Mar");
    expect(screen.getByTestId("date-range-trigger")).toHaveTextContent("30 Jun 2026");
  });

  it("does not show clear button when no dates are set", () => {
    render(<DateFilter />);
    expect(screen.queryByTestId("date-clear")).not.toBeInTheDocument();
  });

  it("shows clear button when activeFrom is set", () => {
    render(<DateFilter activeFrom="2026-06-01" />);
    expect(screen.getByTestId("date-clear")).toBeInTheDocument();
  });

  it("shows clear button when activeTo is set", () => {
    render(<DateFilter activeTo="2026-12-31" />);
    expect(screen.getByTestId("date-clear")).toBeInTheDocument();
  });

  it("clears both date params when clear button is clicked", () => {
    render(<DateFilter activeFrom="2026-06-01" activeTo="2026-12-31" />);
    fireEvent.click(screen.getByTestId("date-clear"));
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});
