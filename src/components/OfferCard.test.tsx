import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { OfferCard } from "./OfferCard";
import type { Offer } from "../../specs/data/offer.schema";

const BASE_OFFER: Offer = {
  bank: "commercial_bank",
  bankDisplayName: "Commercial Bank",
  title: "Enjoy 15% off at Keells",
  merchant: "Keells Super",
  offerType: "percentage",
  discountPercentage: 15,
  discountLabel: "15% off",
  category: "groceries",
  isExpired: false,
  sourceUrl: "https://www.combank.lk/rewards-promotions/test",
  scrapedAt: new Date("2026-01-01"),
};

describe("OfferCard", () => {
  it("renders bank name", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-bank")).toHaveTextContent("Commercial Bank");
  });

  it("renders merchant name", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-merchant")).toHaveTextContent("Keells Super");
  });

  it("renders discountLabel", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-discount")).toHaveTextContent("15% off");
  });

  it("renders category", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-category")).toHaveTextContent("Groceries");
  });

  it("renders title", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-title")).toHaveTextContent("Enjoy 15% off at Keells");
  });

  it("links to sourceUrl in a new tab", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    const link = screen.getByTestId("offer-card");
    expect(link).toHaveAttribute("href", BASE_OFFER.sourceUrl);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows expiry date when validUntil is set", () => {
    const offer: Offer = {
      ...BASE_OFFER,
      validUntil: new Date("2026-12-31"),
    };
    render(<OfferCard offer={offer} />);
    expect(screen.getByTestId("offer-expiry")).toBeInTheDocument();
  });

  it("does not show expiry when validUntil is absent", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    expect(screen.queryByTestId("offer-expiry")).not.toBeInTheDocument();
  });

  it("shows 'Expires soon' badge when offer expires within 7 days", () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    const offer: Offer = { ...BASE_OFFER, validUntil: soon };
    render(<OfferCard offer={offer} />);
    expect(screen.getByTestId("offer-expiry-badge")).toHaveTextContent("Expires soon");
  });

  it("shows 'Expired' badge for past validUntil date", () => {
    const past = new Date("2020-01-01");
    const offer: Offer = { ...BASE_OFFER, validUntil: past };
    render(<OfferCard offer={offer} />);
    expect(screen.getByTestId("offer-expiry-badge")).toHaveTextContent("Expired");
  });

  it("shows merchant initial avatar when no logo URL", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    // The avatar div contains the first letter of the merchant
    expect(screen.getByText("K")).toBeInTheDocument();
  });
});
