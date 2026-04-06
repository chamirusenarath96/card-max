import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { OfferGrid } from "./OfferGrid";
import type { Offer } from "../../specs/data/offer.schema";

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
    expect(screen.queryByTestId("offer-grid")).not.toBeInTheDocument();
  });

  it("does not render pagination when only one page", () => {
    const pagination = { page: 1, limit: 20, total: 5, totalPages: 1 };
    render(<OfferGrid offers={[MOCK_OFFER]} pagination={pagination} />);
    expect(screen.queryByTestId("pagination")).not.toBeInTheDocument();
  });

  it("renders pagination when totalPages > 1", () => {
    const pagination = { page: 1, limit: 20, total: 45, totalPages: 3 };
    render(<OfferGrid offers={[MOCK_OFFER]} pagination={pagination} />);
    expect(screen.getByTestId("pagination")).toBeInTheDocument();
  });
});
