import { render, screen } from "@/test-utils";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OfferGrid } from "./OfferGrid";
import type { Offer } from "../../../specs/data/offer.schema";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  vi.unstubAllEnvs();
});

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

  it("shows skeleton while loading", () => {
    render(<OfferGrid offers={[]} isLoading />);
    expect(screen.getByTestId("offer-skeleton")).toBeInTheDocument();
  });

  it("injects grid ad unit after the 8th card when ADSENSE_ENABLED is true", () => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_PUBLISHER_ID", "ca-pub-1234567890");
    const nineOffers: Offer[] = Array.from({ length: 9 }, (_, i) => ({
      ...MOCK_OFFER,
      _id: `id-${i}`,
      merchant: `Merchant ${i}`,
      title: `Offer ${i}`,
    }));
    render(<OfferGrid offers={nineOffers} />);
    expect(screen.getByTestId("grid-ad-unit")).toBeInTheDocument();
  });

  it("does not inject grid ad unit when ADSENSE_ENABLED is false", () => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_ENABLED", "false");
    const nineOffers: Offer[] = Array.from({ length: 9 }, (_, i) => ({
      ...MOCK_OFFER,
      _id: `id-${i}`,
      merchant: `Merchant ${i}`,
      title: `Offer ${i}`,
    }));
    render(<OfferGrid offers={nineOffers} />);
    expect(screen.queryByTestId("grid-ad-unit")).not.toBeInTheDocument();
  });

  it("does not inject grid ad unit when there are fewer than 9 cards", () => {
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_ADSENSE_PUBLISHER_ID", "ca-pub-1234567890");
    const fewOffers: Offer[] = Array.from({ length: 5 }, (_, i) => ({
      ...MOCK_OFFER,
      _id: `id-${i}`,
      merchant: `Merchant ${i}`,
      title: `Offer ${i}`,
    }));
    render(<OfferGrid offers={fewOffers} />);
    expect(screen.queryByTestId("grid-ad-unit")).not.toBeInTheDocument();
  });

  // AC4: offer grid re-renders without remounting surrounding header
  it("offer grid re-renders without remounting header (AC4)", () => {
    const { rerender } = render(
      <div>
        <header data-testid="page-header">Header</header>
        <OfferGrid offers={[]} />
      </div>,
    );

    const headerNode = screen.getByTestId("page-header");

    rerender(
      <div>
        <header data-testid="page-header">Header</header>
        <OfferGrid offers={[MOCK_OFFER]} pagination={{ page: 1, limit: 20, total: 1, totalPages: 1 }} />
      </div>,
    );

    // The header DOM node must be the exact same element — not remounted
    expect(screen.getByTestId("page-header")).toBe(headerNode);
    expect(screen.getByTestId("offer-grid")).toBeInTheDocument();
  });

  // 047 regression: last page of a multi-page result set (a partial page, not
  // a full one) must render every offer the API returned — no client-side
  // truncation or off-by-one causes them to be dropped after a correct API response.
  it("renders all offers on a partial last page (047 regression)", () => {
    const lastPageOffers: Offer[] = Array.from({ length: 5 }, (_, i) => ({
      ...MOCK_OFFER,
      _id: `last-page-${i}`,
      merchant: `Merchant ${i}`,
      title: `Offer ${i}`,
    }));
    const pagination = { page: 3, limit: 20, total: 45, totalPages: 3 };
    render(<OfferGrid offers={lastPageOffers} pagination={pagination} />);
    expect(screen.getAllByTestId("offer-card")).toHaveLength(5);
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
  });

  // T4 (spec 034): OfferGrid accepts pre-fetched offers and renders without async fetching.
  // The Suspense-compatible pattern: async data is resolved by the parent server component
  // (OfferGridContent in page.tsx); OfferGrid itself is a pure render-from-props component.
  it("renders pre-fetched offers synchronously (Suspense-compatible pattern, T4)", () => {
    const offers: Offer[] = [
      MOCK_OFFER,
      { ...MOCK_OFFER, _id: "synth-002", merchant: "Burger King", title: "15% off at Burger King" },
    ];
    render(<OfferGrid offers={offers} />);
    // All cards must be present immediately — no async fetch initiated by OfferGrid itself.
    expect(screen.getAllByTestId("offer-card")).toHaveLength(2);
    expect(screen.getByTestId("offer-grid")).toBeInTheDocument();
  });
});
