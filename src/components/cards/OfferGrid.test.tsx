import { render, screen } from "@/test-utils";
import { describe, it, expect, vi } from "vitest";
import { OfferGrid } from "./OfferGrid";
import type { Offer } from "../../../specs/data/offer.schema";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const MOCK_OFFER: Offer = {
  _id: "abc123",
  bank: "hnb",
  bankDisplayName: "Hatton National Bank",
  title: "20% off at Pizza Hut",
  merchant: "Pizza Hut",
  offerType: "percentage",
  discountPercentage: 20,
  discountLabel: "20% off",
  category: "dining",
  isExpired: false,
  sourceUrl: "https://www.hnb.lk/offers/pizza-hut",
  scrapedAt: new Date("2026-01-01"),
};

describe("OfferGrid", () => {
  it("renders the offer grid when offers are present", () => {
    render(<OfferGrid offers={[MOCK_OFFER]} />);
    expect(screen.getByTestId("offer-grid")).toBeInTheDocument();
  });

  it("renders one card per offer", () => {
    const offers: Offer[] = [
      MOCK_OFFER,
      { ...MOCK_OFFER, _id: "def456", merchant: "KFC", title: "10% off at KFC" },
    ];
    render(<OfferGrid offers={offers} />);
    expect(screen.getAllByTestId("offer-card")).toHaveLength(2);
  });

  it("shows empty state when no offers", () => {
    render(<OfferGrid offers={[]} />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("renders card size toggle", () => {
    render(<OfferGrid offers={[MOCK_OFFER]} />);
    expect(screen.getByTestId("card-size-toggle")).toBeInTheDocument();
  });

  it("renders pagination controls when totalPages > 1", () => {
    const pagination = { page: 1, limit: 20, total: 45, totalPages: 3 };
    render(<OfferGrid offers={[MOCK_OFFER]} pagination={pagination} />);
    expect(screen.getByTestId("pagination-controls")).toBeInTheDocument();
  });
});
