import { render, screen } from "@/test-utils";
import { describe, it, expect } from "vitest";
import { OfferDetailView } from "./OfferDetailView";
import type { Offer } from "../../../specs/data/offer.schema";

const BASE_OFFER: Offer = {
  _id: "64f1a2b3c4d5e6f7a8b9c0d1",
  bank: "commercial_bank",
  bankDisplayName: "Commercial Bank",
  title: "Enjoy 15% off at Keells",
  description: "Valid on all purchases above Rs. 2,000.",
  merchant: "Keells Super",
  offerType: "percentage",
  discountPercentage: 15,
  discountLabel: "15% off",
  category: "groceries",
  isExpired: false,
  sourceUrl: "https://www.combank.lk/rewards-promotions/keells",
  scrapedAt: new Date("2026-01-01"),
  // Constructed from local components (not an ISO string) so the rendered
  // date text is stable regardless of the test runner's timezone.
  validFrom: new Date(2026, 0, 1),
  validUntil: new Date(2026, 11, 31),
};

const SIMILAR_OFFER: Offer = {
  _id: "64f1a2b3c4d5e6f7a8b9c0d2",
  bank: "hnb",
  bankDisplayName: "Hatton National Bank",
  title: "10% off at Cargills",
  merchant: "Cargills",
  offerType: "percentage",
  discountPercentage: 10,
  discountLabel: "10% off",
  category: "groceries",
  isExpired: false,
  sourceUrl: "https://www.hnb.lk/offers/cargills",
  scrapedAt: new Date("2026-01-01"),
};

describe("OfferDetailView", () => {
  // AC1: renders merchant, discount, validity, category, bank

  it("renders the merchant name", () => {
    render(<OfferDetailView offer={BASE_OFFER} similarOffers={[]} />);
    expect(screen.getByTestId("offer-detail-merchant")).toHaveTextContent("Keells Super");
  });

  it("renders the discount/offer-type badge", () => {
    render(<OfferDetailView offer={BASE_OFFER} similarOffers={[]} />);
    expect(screen.getByTestId("offer-detail-badge")).toHaveTextContent("15% OFF");
  });

  it("renders the validity period", () => {
    render(<OfferDetailView offer={BASE_OFFER} similarOffers={[]} />);
    expect(screen.getByTestId("offer-detail-validity")).toHaveTextContent("31 Dec 2026");
  });

  it("renders the category badge", () => {
    render(<OfferDetailView offer={BASE_OFFER} similarOffers={[]} />);
    expect(screen.getByTestId("offer-detail-category")).toHaveTextContent("Groceries");
  });

  it("renders the bank badge", () => {
    render(<OfferDetailView offer={BASE_OFFER} similarOffers={[]} />);
    expect(screen.getByTestId("offer-detail-bank")).toHaveTextContent("Commercial Bank");
  });

  it("renders the description when present", () => {
    render(<OfferDetailView offer={BASE_OFFER} similarOffers={[]} />);
    expect(screen.getByTestId("offer-detail-description")).toHaveTextContent(
      "Valid on all purchases above Rs. 2,000.",
    );
  });

  // Edge case: no description → section hidden (matches spec 005)

  it("hides the description section when the offer has no description", () => {
    const { description, ...rest } = BASE_OFFER;
    void description;
    render(<OfferDetailView offer={rest as Offer} similarOffers={[]} />);
    expect(screen.queryByTestId("offer-detail-description")).not.toBeInTheDocument();
  });

  // Edge case: no validUntil → "No expiry date"

  it("shows 'No expiry date' when validUntil is missing", () => {
    const offer = { ...BASE_OFFER, validUntil: undefined };
    render(<OfferDetailView offer={offer} similarOffers={[]} />);
    expect(screen.getByTestId("offer-detail-validity")).toHaveTextContent("No expiry date");
  });

  it("shows 'No expiry date' with no validity dates at all", () => {
    const offer = { ...BASE_OFFER, validFrom: undefined, validUntil: undefined };
    render(<OfferDetailView offer={offer} similarOffers={[]} />);
    expect(screen.getByTestId("offer-detail-validity")).toHaveTextContent("No expiry date");
  });

  // AC3: View Original Offer link

  it("View Original Offer links to sourceUrl, opens in a new tab, with rel=noopener noreferrer", () => {
    render(<OfferDetailView offer={BASE_OFFER} similarOffers={[]} />);
    const link = screen.getByTestId("offer-detail-source-link");
    expect(link).toHaveAttribute("href", BASE_OFFER.sourceUrl);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  // AC4: back link

  it("'Back to search' link navigates to /", () => {
    render(<OfferDetailView offer={BASE_OFFER} similarOffers={[]} />);
    expect(screen.getByTestId("offer-detail-back-link")).toHaveAttribute("href", "/");
  });

  // AC10: similar offers section hidden when empty

  it("hides the Similar Offers section when there are no similar offers", () => {
    render(<OfferDetailView offer={BASE_OFFER} similarOffers={[]} />);
    expect(screen.queryByTestId("similar-offers-section")).not.toBeInTheDocument();
  });

  it("shows the Similar Offers section with offer cards when similar offers exist", () => {
    render(<OfferDetailView offer={BASE_OFFER} similarOffers={[SIMILAR_OFFER]} />);
    expect(screen.getByTestId("similar-offers-section")).toBeInTheDocument();
    expect(screen.getByText("Cargills")).toBeInTheDocument();
  });
});
