import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OfferImage } from "./OfferImage";

// Mock next/image to a simple <img> element so tests can inspect props
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    onError,
    ...rest
  }: {
    src: string;
    alt: string;
    onError?: () => void;
    [key: string]: unknown;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} data-has-onerror={!!onError} {...rest} />
  ),
}));

// vi.hoisted makes the fn available inside the vi.mock factory (hoisted to top of file)
const mockBuildFaviconFallbackUrl = vi.hoisted(() =>
  vi.fn(() => "https://www.google.com/s2/favicons?domain=keells.com&sz=128" as string | null)
);

vi.mock("../../../crawler/utils/logo", () => ({
  buildFaviconFallbackUrl: mockBuildFaviconFallbackUrl,
}));

const BASE_OFFER = {
  merchantLogoUrl: "https://example.com/logo.png",
  merchant: "Keells Super",
  category: "groceries" as const,
  title: "15% off at Keells",
  bankDisplayName: "Commercial Bank",
};

describe("OfferImage", () => {
  it("renders with the primary merchantLogoUrl when available", () => {
    render(<OfferImage offer={BASE_OFFER} bankColor="#1B3A6B" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", BASE_OFFER.merchantLogoUrl);
  });

  it("logo <img> has onError handler defined for fallback chain (T4)", () => {
    render(<OfferImage offer={BASE_OFFER} bankColor="#1B3A6B" />);
    const img = screen.getByRole("img");
    // data-has-onerror is set to "true" by the mock when onError prop is present
    expect(img.getAttribute("data-has-onerror")).toBe("true");
  });

  it("renders the category icon fallback when no logo URL and no clearbit match", () => {
    mockBuildFaviconFallbackUrl.mockReturnValueOnce(null);
    const offerNoLogo = { ...BASE_OFFER, merchantLogoUrl: undefined };
    render(<OfferImage offer={offerNoLogo} bankColor="#1B3A6B" />);
    // Icon fallback renders a div (not an <img>) with the merchant name as text
    expect(screen.getByText("Keells Super")).toBeInTheDocument();
  });

  it("primary-stage Image has referrerPolicy=\"no-referrer\" (AC1)", () => {
    render(<OfferImage offer={BASE_OFFER} bankColor="#1B3A6B" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("favicon-fallback stage Image has no referrer-policy change (AC2)", () => {
    const offerNoLogo = { ...BASE_OFFER, merchantLogoUrl: undefined };
    render(<OfferImage offer={offerNoLogo} bankColor="#1B3A6B" />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute(
      "src",
      "https://www.google.com/s2/favicons?domain=keells.com&sz=128"
    );
    expect(img).not.toHaveAttribute("referrerpolicy");
  });
});
