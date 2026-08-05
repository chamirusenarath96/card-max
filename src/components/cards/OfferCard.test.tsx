import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { OfferCard } from "./OfferCard";
import type { Offer } from "../../../specs/data/offer.schema";

const BASE_OFFER: Offer = {
  _id: "64f1a2b3c4d5e6f7a8b9c0d1",
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

  it("shows offer type badge with percentage for percentage offers", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-type-badge")).toHaveTextContent("15% OFF");
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

  it("shows expiry badge when offer expires within 7 days", () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    render(<OfferCard offer={{ ...BASE_OFFER, validUntil: soon }} />);
    expect(screen.getByTestId("offer-expiry-badge")).toHaveTextContent("Expires soon");
  });

  it("shows a category icon fallback when no logo URL", () => {
    // OfferImage cycles: primary (none) → Clearbit → icon fallback.
    // We verify the card still renders without crashing.
    render(<OfferCard offer={BASE_OFFER} />);
    expect(screen.getByTestId("offer-card")).toBeInTheDocument();
  });

  it("shows description when offer has one", () => {
    const offerWithDesc: Offer = {
      ...BASE_OFFER,
      description: "Get 15% off on all groceries every Tuesday with your Commercial Bank card.",
    };
    render(<OfferCard offer={offerWithDesc} />);
    expect(screen.getByTestId("offer-description")).toBeInTheDocument();
    expect(screen.getByTestId("offer-description")).toHaveTextContent("Get 15% off");
  });

  it("does not render description when offer has none", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    expect(screen.queryByTestId("offer-description")).not.toBeInTheDocument();
  });

  it("shows Show more button for long descriptions", () => {
    const longDesc = "A".repeat(200); // exceeds 120-char default limit
    const offerWithLongDesc: Offer = {
      ...BASE_OFFER,
      description: longDesc,
    };
    render(<OfferCard offer={offerWithLongDesc} />);
    expect(screen.getByTestId("desc-toggle")).toHaveTextContent("Show more");
  });

  it("applies grayscale styling to expired offers", () => {
    render(<OfferCard offer={{ ...BASE_OFFER, isExpired: true }} />);
    const card = screen.getByTestId("offer-card");
    expect(card.className).toMatch(/grayscale/);
  });

  it("bank badge uses full bank color without alpha reduction for WCAG contrast (T2)", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    const bankBadge = screen.getByTestId("offer-bank");
    expect(bankBadge).toBeInTheDocument();
    // The hex color should not contain 'dd' appended to it
    expect(bankBadge.getAttribute("style") ?? "").not.toMatch(/dd['";\s]|dddd/i);
  });

  it('shows INSTALLMENT badge for percentage offer with 0% discount (legacy mis-classification)', () => {
    // Old scraper data stored "0% installments for 6 months" as offerType="percentage",
    // discountPercentage=0 before the generalised installment regex was added.
    // getBadgeLabel must return "INSTALLMENT" instead of "OFF" for these offers.
    const installmentOffer: Offer = {
      ...BASE_OFFER,
      title: "Up to 06 months 0% installments at MAHK Premium Store",
      offerType: "percentage",
      discountPercentage: 0,
      discountLabel: "0% installments for 06 months",
    };
    render(<OfferCard offer={installmentOffer} />);
    expect(screen.getByTestId("offer-type-badge")).toHaveTextContent("INSTALLMENT");
    expect(screen.getByTestId("offer-type-badge")).not.toHaveTextContent("OFF");
  });

  // Spec 049 supersedes spec 046 AC6: cards now link internally to
  // /offers/<id> instead of rendering no CTA at all (external sourceUrl link
  // was removed earlier by commit caf5c85fd and is not reintroduced here).
  it("links to the internal /offers/<id> detail page on every card variant (spec 049 AC1-AC3)", () => {
    const { rerender } = render(<OfferCard offer={BASE_OFFER} size="default" />);
    expect(screen.getByTestId("offer-card")).toHaveAttribute("href", `/offers/${BASE_OFFER._id}`);
    rerender(<OfferCard offer={BASE_OFFER} size="compact" />);
    expect(screen.getByTestId("offer-card")).toHaveAttribute("href", `/offers/${BASE_OFFER._id}`);
    rerender(<OfferCard offer={BASE_OFFER} size="expanded" />);
    expect(screen.getByTestId("offer-card")).toHaveAttribute("href", `/offers/${BASE_OFFER._id}`);
  });

  it("card link does not open in a new tab (internal navigation, spec 049 AC7)", () => {
    render(<OfferCard offer={BASE_OFFER} />);
    const card = screen.getByTestId("offer-card");
    expect(card).not.toHaveAttribute("target", "_blank");
    expect(card).not.toHaveAttribute("rel", "noopener noreferrer");
  });

  it("clicking desc-toggle does not navigate to the detail page (spec 049 AC5)", () => {
    const offerWithLongDesc: Offer = {
      ...BASE_OFFER,
      description: "A".repeat(200),
    };
    render(<OfferCard offer={offerWithLongDesc} />);
    const toggle = screen.getByTestId("desc-toggle");
    const eventNotPrevented = fireEvent.click(toggle);
    expect(eventNotPrevented).toBe(false);
    expect(toggle).toHaveTextContent("Show less");
  });
});
