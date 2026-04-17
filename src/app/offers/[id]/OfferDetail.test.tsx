/**
 * Component tests for OfferDetail
 * Spec: specs/features/005-offer-detail.md
 */
import { render, screen } from "@/test-utils";
import { describe, it, expect, vi } from "vitest";
import { OfferDetail } from "./OfferDetail";
import type { Offer } from "../../../../specs/data/offer.schema";

// Mock OfferImage — avoid dealing with Image / canvas in JSDOM
vi.mock("@/components/cards/OfferImage", () => ({
  OfferImage: () => <div data-testid="offer-image-mock" />,
}));

const BASE_OFFER: Offer = {
  _id: "64f1a2b3c4d5e6f7a8b9c0d1",
  bank: "commercial_bank",
  bankDisplayName: "Commercial Bank",
  title: "Up to 30% off on dining at select restaurants",
  merchant: "The Grill House",
  category: "dining",
  offerType: "percentage",
  discountPercentage: 30,
  discountLabel: "30% off",
  validFrom: new Date("2026-01-01T00:00:00.000Z"),
  validUntil: new Date("2026-12-31T00:00:00.000Z"),
  sourceUrl: "https://www.combank.lk/offers/grill-house",
  scrapedAt: new Date("2026-04-01T00:00:00.000Z"),
  isExpired: false,
};

describe("OfferDetail", () => {
  it("renders the offer detail container", () => {
    render(<OfferDetail offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-detail")).toBeInTheDocument();
  });

  it("renders merchant name as heading", () => {
    render(<OfferDetail offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-merchant")).toHaveTextContent("The Grill House");
  });

  it("renders offer title", () => {
    render(<OfferDetail offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-title")).toHaveTextContent(
      "Up to 30% off on dining at select restaurants",
    );
  });

  it("renders discount label prominently", () => {
    render(<OfferDetail offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-discount")).toHaveTextContent("30% off");
  });

  it("renders bank display name", () => {
    render(<OfferDetail offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-bank-label")).toHaveTextContent("Commercial Bank");
  });

  it("renders category label", () => {
    render(<OfferDetail offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-category-label")).toHaveTextContent("Dining");
  });

  it("renders validity dates", () => {
    render(<OfferDetail offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-validity")).toBeInTheDocument();
    expect(screen.getByTestId("offer-expiry")).toBeInTheDocument();
  });

  it("View Original Offer button links to sourceUrl in new tab", () => {
    render(<OfferDetail offer={BASE_OFFER} />);
    const cta = screen.getByTestId("view-original-offer");
    expect(cta.closest("a")).toHaveAttribute("href", "https://www.combank.lk/offers/grill-house");
    expect(cta.closest("a")).toHaveAttribute("target", "_blank");
  });

  it("All Offers back link points to /", () => {
    render(<OfferDetail offer={BASE_OFFER} />);
    const backLink = screen.getByTestId("back-to-all-offers");
    expect(backLink).toHaveAttribute("href", "/");
  });

  it("does not render discount section when discountLabel is absent", () => {
    const offer: Offer = { ...BASE_OFFER, discountLabel: undefined };
    render(<OfferDetail offer={offer} />);
    expect(screen.queryByTestId("offer-discount")).not.toBeInTheDocument();
  });

  it("does not render description section when description is absent", () => {
    render(<OfferDetail offer={BASE_OFFER} />);
    expect(screen.queryByTestId("offer-description")).not.toBeInTheDocument();
  });

  it("renders description when present", () => {
    const offer: Offer = {
      ...BASE_OFFER,
      description: "Valid at all branches island-wide. T&Cs apply.",
    };
    render(<OfferDetail offer={offer} />);
    expect(screen.getByTestId("offer-description")).toHaveTextContent("Valid at all branches");
  });

  it("renders badge label derived from offerType + percentage", () => {
    render(<OfferDetail offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-type-badge")).toHaveTextContent("30% SAVINGS");
  });
});
