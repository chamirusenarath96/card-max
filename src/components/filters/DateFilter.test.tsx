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
  beforeEach(() => { mockPush.mockClear(); });

  it("renders from and to date trigger buttons", () => {
    render(<DateFilter />);
    expect(screen.getByTestId("date-from-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("date-to-trigger")).toBeInTheDocument();
  });

  it("renders the Date Filter heading", () => {
    render(<DateFilter />);
    expect(screen.getByText("Date Filter")).toBeInTheDocument();
  });

  it("shows formatted activeFrom date on from trigger", () => {
    render(<DateFilter activeFrom="2026-06-01" />);
    expect(screen.getByTestId("date-from-trigger")).toHaveTextContent("01 Jun 2026");
  });

  it("shows formatted activeTo date on to trigger", () => {
    render(<DateFilter activeTo="2026-12-31" />);
    expect(screen.getByTestId("date-to-trigger")).toHaveTextContent("31 Dec 2026");
  });

  it("shows 'Pick a date' placeholder when no date set", () => {
    render(<DateFilter />);
    expect(screen.getAllByText("Pick a date")).toHaveLength(2);
  });

  it("does not show clear button when no dates are set", () => {
    render(<DateFilter />);
    expect(screen.queryByTestId("date-clear")).not.toBeInTheDocument();
  });

  it("shows clear button when activeFrom is set", () => {
    render(<DateFilter activeFrom="2026-03-01" />);
    expect(screen.getByTestId("date-clear")).toBeInTheDocument();
  });

  it("shows clear button when activeTo is set", () => {
    render(<DateFilter activeTo="2026-06-30" />);
    expect(screen.getByTestId("date-clear")).toBeInTheDocument();
  });

  it("clears both date params when clear button is clicked", () => {
    render(<DateFilter activeFrom="2026-03-01" activeTo="2026-12-31" />);
    fireEvent.click(screen.getByTestId("date-clear"));
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});
