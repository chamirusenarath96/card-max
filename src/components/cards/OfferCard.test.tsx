import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { OfferCard } from "./OfferCard";
import type { Offer } from "../../../specs/data/offer.schema";

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

  it("renders title", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-title")).toHaveTextContent("Enjoy 15% off at Keells");
  });

  it("renders category", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-category")).toHaveTextContent("Groceries");
  });

  it("links to sourceUrl in a new tab", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    const link = screen.getByTestId("offer-card");
    expect(link).toHaveAttribute("href", BASE_OFFER.sourceUrl);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows offer type badge with percentage for percentage offers", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-type-badge")).toHaveTextContent("15% SAVINGS");
  });

  it("renders compact variant", () => {
    render(<OfferCard offer={BASE_OFFER} size="compact" />);
    expect(screen.getByTestId("offer-card")).toBeInTheDocument();
    expect(screen.getByTestId("offer-merchant")).toHaveTextContent("Keells Super");
  });

  it("renders expanded variant", () => {
    render(<OfferCard offer={BASE_OFFER} size="expanded" />);
    expect(screen.getByTestId("offer-card")).toBeInTheDocument();
    expect(screen.getByTestId("offer-merchant")).toHaveTextContent("Keells Super");
  });

  it("shows View Card Details button in default size", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    expect(screen.getByText(/View Card Details/)).toBeInTheDocument();
  });

  it("shows expiry badge when offer expires within 7 days", () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    render(<OfferCard offer={{ ...BASE_OFFER, validUntil: soon }} />);
    expect(screen.getByTestId("offer-expiry-badge")).toHaveTextContent("Expires soon");
  });

  it("shows merchant initial avatar when no logo URL", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    expect(screen.getByText("K")).toBeInTheDocument();
  });
});
