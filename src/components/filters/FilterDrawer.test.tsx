import { render, screen, fireEvent } from "@/test-utils";
import { describe, it, expect, vi } from "vitest";
import { FilterDrawer } from "./FilterDrawer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

describe("FilterDrawer", () => {
  it("renders the filter drawer trigger button", () => {
    render(<FilterDrawer />);
    expect(screen.getByTestId("filter-drawer-trigger")).toBeInTheDocument();
  });

  it("opens the filter drawer and shows filter-drawer testid", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    const drawer = await screen.findByTestId("filter-drawer");
    expect(drawer).toBeInTheDocument();
  });

  it("shows bank filter options when drawer is open", async () => {
    render(<FilterDrawer />);
    fireEvent.click(screen.getByTestId("filter-drawer-trigger"));
    expect(await screen.findByTestId("bank-filter-commercial_bank")).toBeInTheDocument();
  });
});
