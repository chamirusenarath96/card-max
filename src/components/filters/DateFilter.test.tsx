import { render, screen, fireEvent } from "@testing-library/react";
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

  it("renders from and to date inputs", () => {
    render(<DateFilter />);
    expect(screen.getByTestId("date-from")).toBeInTheDocument();
    expect(screen.getByTestId("date-to")).toBeInTheDocument();
  });

  it("renders the Date Filter heading", () => {
    render(<DateFilter />);
    expect(screen.getByText("Date Filter")).toBeInTheDocument();
  });

  it("sets activeFrom as initial value on from input", () => {
    render(<DateFilter activeFrom="2026-06-01" />);
    expect(screen.getByTestId("date-from")).toHaveValue("2026-06-01");
  });

  it("sets activeTo as initial value on to input", () => {
    render(<DateFilter activeTo="2026-12-31" />);
    expect(screen.getByTestId("date-to")).toHaveValue("2026-12-31");
  });

  it("pushes activeFrom param when from date changes", () => {
    render(<DateFilter />);
    fireEvent.change(screen.getByTestId("date-from"), { target: { value: "2026-03-01" } });
    expect(mockPush).toHaveBeenCalledWith("/?activeFrom=2026-03-01");
  });

  it("pushes activeTo param when to date changes", () => {
    render(<DateFilter />);
    fireEvent.change(screen.getByTestId("date-to"), { target: { value: "2026-06-30" } });
    expect(mockPush).toHaveBeenCalledWith("/?activeTo=2026-06-30");
  });

  it("does not show clear button when no dates are set", () => {
    render(<DateFilter />);
    expect(screen.queryByTestId("date-clear")).not.toBeInTheDocument();
  });

  it("shows clear button when activeFrom is set", () => {
    render(<DateFilter activeFrom="2026-03-01" />);
    expect(screen.getByTestId("date-clear")).toBeInTheDocument();
  });

  it("clears both date params when clear button is clicked", () => {
    render(<DateFilter activeFrom="2026-03-01" activeTo="2026-12-31" />);
    fireEvent.click(screen.getByTestId("date-clear"));
    expect(mockPush).toHaveBeenCalledWith("/");
  });
});
