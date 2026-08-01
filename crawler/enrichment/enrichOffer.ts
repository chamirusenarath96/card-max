/**
 * Orchestrates AI-assisted enrichment for a single offer: semantic summary +
 * applicable-date resolution from text and (when present) source-page images.
 * Spec: specs/features/044-ai-offer-enrichment.md (AC1-AC6)
 *
 * Never throws — enrichment failure/slowness must never block the crawler's
 * core scrape/upsert path, so any error or timeout resolves to
 * `enrichmentStatus: "failed"` instead of rejecting.
 */
import { fetchHtml } from "../utils/http";
import { generateSemanticSummary } from "./semanticSummary";
import { findImageUrls, extractTextFromImages } from "./extractConditionsFromImages";
import { resolveApplicableDates } from "./resolveApplicableDates";

const ENRICHMENT_TIMEOUT_MS = 30_000;

export interface OfferForEnrichment {
  title: string;
  description?: string;
  merchant: string;
  category: string;
  sourceUrl: string;
  validFrom?: Date;
  validUntil?: Date;
}

export interface EnrichmentPatch {
  semanticSummary?: string;
  applicableDates?: string[];
  enrichmentStatus: "done" | "failed";
}

export interface EnrichOfferDeps {
  fetchSourceHtml?: (url: string) => Promise<string>;
  generateSummary?: typeof generateSemanticSummary;
  extractImagesText?: typeof extractTextFromImages;
  timeoutMs?: number;
}

export async function enrichOffer(
  offer: OfferForEnrichment,
  deps: EnrichOfferDeps = {}
): Promise<EnrichmentPatch> {
  const resolvedDeps = {
    fetchSourceHtml: deps.fetchSourceHtml ?? fetchHtml,
    generateSummary: deps.generateSummary ?? generateSemanticSummary,
    extractImagesText: deps.extractImagesText ?? extractTextFromImages,
  };

  try {
    return await withTimeout(
      runEnrichment(offer, resolvedDeps),
      deps.timeoutMs ?? ENRICHMENT_TIMEOUT_MS
    );
  } catch (err) {
    console.warn(
      `[enrichment] Failed for "${offer.title}":`,
      err instanceof Error ? err.message : err
    );
    return { enrichmentStatus: "failed" };
  }
}

async function runEnrichment(
  offer: OfferForEnrichment,
  deps: Required<Omit<EnrichOfferDeps, "timeoutMs">>
): Promise<EnrichmentPatch> {
  const semanticSummary = await deps.generateSummary({
    title: offer.title,
    description: offer.description,
    merchant: offer.merchant,
    category: offer.category,
  });

  let conditionsText = offer.description ?? "";
  const imageUrls = await findImagesOnSourcePage(offer.sourceUrl, deps.fetchSourceHtml);
  if (imageUrls.length > 0) {
    const imageText = await deps.extractImagesText(imageUrls);
    if (imageText) {
      conditionsText = [conditionsText, imageText].filter(Boolean).join(" ");
    }
  }

  const applicableDates = resolveApplicableDates(
    conditionsText || undefined,
    offer.validFrom,
    offer.validUntil
  );

  return { semanticSummary, applicableDates, enrichmentStatus: "done" };
}

/** A source-page fetch failure degrades to text-only enrichment, not a hard failure. */
async function findImagesOnSourcePage(
  sourceUrl: string,
  fetchSourceHtml: (url: string) => Promise<string>
): Promise<string[]> {
  try {
    const html = await fetchSourceHtml(sourceUrl);
    return findImageUrls(html, sourceUrl);
  } catch {
    return [];
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Enrichment timed out after ${ms}ms`)), ms);
    }),
  ]);
}
