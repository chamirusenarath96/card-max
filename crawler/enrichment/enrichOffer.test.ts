/**
 * enrichOffer — unit tests
 * Spec: specs/features/044-ai-offer-enrichment.md (AC3, AC4, AC5, AC6)
 */
import { describe, it, expect, vi } from "vitest";
import { enrichOffer } from "./enrichOffer";

const BASE_OFFER = {
  title: "20% off at Pizza Hut",
  merchant: "Pizza Hut",
  category: "dining",
  sourceUrl: "https://bank.lk/offers/pizza-hut",
  validFrom: new Date(2026, 0, 1),
  validUntil: new Date(2026, 11, 31),
};

describe("enrichOffer", () => {
  it("produces a semanticSummary and applicableDates from text conditions, status done (AC1, AC3)", async () => {
    const result = await enrichOffer(
      { ...BASE_OFFER, description: "Every Thursday from 1st to 21st of August 2026." },
      {
        fetchSourceHtml: vi.fn().mockResolvedValue("<div>no images</div>"),
        generateSummary: vi.fn().mockResolvedValue("20% off dining at Pizza Hut."),
        extractImagesText: vi.fn(),
      }
    );

    expect(result.enrichmentStatus).toBe("done");
    expect(result.semanticSummary).toBe("20% off dining at Pizza Hut.");
    expect(result.applicableDates).toEqual(["2026-08-06", "2026-08-13", "2026-08-20"]);
  });

  it("leaves applicableDates undefined when no conditions pattern is found (AC2)", async () => {
    const result = await enrichOffer(
      { ...BASE_OFFER, description: "Standard terms apply." },
      {
        fetchSourceHtml: vi.fn().mockResolvedValue("<div>no images</div>"),
        generateSummary: vi.fn().mockResolvedValue("A dining discount."),
        extractImagesText: vi.fn(),
      }
    );

    expect(result.enrichmentStatus).toBe("done");
    expect(result.applicableDates).toBeUndefined();
  });

  it("sets enrichmentStatus to failed and does not throw when the AI provider errors (AC4)", async () => {
    const result = await enrichOffer(
      { ...BASE_OFFER, description: "Every Thursday." },
      {
        fetchSourceHtml: vi.fn().mockResolvedValue("<div></div>"),
        generateSummary: vi.fn().mockRejectedValue(new Error("AI provider unavailable")),
        extractImagesText: vi.fn(),
      }
    );

    expect(result).toEqual({ enrichmentStatus: "failed" });
  });

  it("sets enrichmentStatus to failed when enrichment exceeds its time budget (AC4)", async () => {
    const result = await enrichOffer(
      { ...BASE_OFFER, description: "Every Thursday." },
      {
        fetchSourceHtml: vi.fn().mockResolvedValue("<div></div>"),
        generateSummary: vi.fn(() => new Promise<string | undefined>(() => {})), // never resolves
        extractImagesText: vi.fn(),
        timeoutMs: 10,
      }
    );

    expect(result).toEqual({ enrichmentStatus: "failed" });
  });

  it("extracts conditions from source-page images when present and feeds them into date resolution (AC5)", async () => {
    const extractImagesText = vi.fn().mockResolvedValue("Every Thursday from 1st to 21st of August 2026.");
    const result = await enrichOffer(
      { ...BASE_OFFER, description: undefined }, // no usable text — image is the only source
      {
        fetchSourceHtml: vi.fn().mockResolvedValue('<img src="/promo.jpg">'),
        generateSummary: vi.fn().mockResolvedValue("A dining discount."),
        extractImagesText,
      }
    );

    expect(extractImagesText).toHaveBeenCalledWith(["https://bank.lk/promo.jpg"]);
    expect(result.enrichmentStatus).toBe("done");
    expect(result.applicableDates).toEqual(["2026-08-06", "2026-08-13", "2026-08-20"]);
  });

  it("does not invoke image extraction when the source page has no images", async () => {
    const extractImagesText = vi.fn();
    await enrichOffer(
      { ...BASE_OFFER, description: "Every Thursday from 1st to 21st of August 2026." },
      {
        fetchSourceHtml: vi.fn().mockResolvedValue("<div>plain text, no img tags</div>"),
        generateSummary: vi.fn().mockResolvedValue("A dining discount."),
        extractImagesText,
      }
    );

    expect(extractImagesText).not.toHaveBeenCalled();
  });

  it("degrades to text-only enrichment when the source page fetch fails, without failing the whole run", async () => {
    const result = await enrichOffer(
      { ...BASE_OFFER, description: "Every Thursday from 1st to 21st of August 2026." },
      {
        fetchSourceHtml: vi.fn().mockRejectedValue(new Error("404")),
        generateSummary: vi.fn().mockResolvedValue("A dining discount."),
        extractImagesText: vi.fn(),
      }
    );

    expect(result.enrichmentStatus).toBe("done");
    expect(result.applicableDates).toEqual(["2026-08-06", "2026-08-13", "2026-08-20"]);
  });

  it("does not require a fresh scrape — only reads offer fields already stored on the document (AC6)", async () => {
    const fetchSourceHtml = vi.fn().mockResolvedValue("<div></div>");
    await enrichOffer(
      { ...BASE_OFFER, description: "Every Thursday." },
      { fetchSourceHtml, generateSummary: vi.fn().mockResolvedValue("x"), extractImagesText: vi.fn() }
    );

    // the only network call made is against the already-stored sourceUrl —
    // no scraper module is imported or invoked by enrichOffer
    expect(fetchSourceHtml).toHaveBeenCalledWith(BASE_OFFER.sourceUrl);
  });
});
