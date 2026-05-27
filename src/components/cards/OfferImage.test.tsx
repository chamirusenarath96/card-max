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
const mockBuildClearbitUrl = vi.hoisted(() =>
  vi.fn<[], string | null>(() => "https://logo.clearbit.com/keells.com")
);

vi.mock("../../../crawler/utils/logo", () => ({
  buildClearbitUrl: mockBuildClearbitUrl,
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
    mockBuildClearbitUrl.mockReturnValueOnce(null);
    const offerNoLogo = { ...BASE_OFFER, merchantLogoUrl: undefined };
    render(<OfferImage offer={offerNoLogo} bankColor="#1B3A6B" />);
    // Icon fallback renders a div (not an <img>) with the merchant name as text
    expect(screen.getByText("Keells Super")).toBeInTheDocument();
  });
});
