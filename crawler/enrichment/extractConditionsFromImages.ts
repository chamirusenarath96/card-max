/**
 * Finds candidate offer images on a source page and extracts any visible
 * terms/dates/conditions text from them via Gemini's vision capability.
 * Spec: specs/features/044-ai-offer-enrichment.md (AC5, Edge Cases)
 *
 * Bounded per-offer cost/time budget: at most MAX_IMAGES images, each capped
 * at MAX_IMAGE_BYTES — an offer with excessive/oversized images degrades to
 * skipping the extras rather than stalling the pipeline.
 */
import { createPartFromBase64, createUserContent } from "@google/genai";
import { getGeminiClient, ENRICHMENT_MODEL } from "./geminiClient";

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SKIP_URL_PATTERN = /logo|icon|sprite|favicon|placeholder|pixel\.(gif|png)|\.svg(\?|$)/i;

const VISION_PROMPT =
  "Extract any text visible in this image that describes offer terms, redemption " +
  "conditions, or applicable dates (e.g. specific weekdays or date ranges). " +
  "Respond with ONLY the extracted text, or the single word NONE if there is no such text.";

type SupportedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const SUPPORTED_MEDIA_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

/**
 * Extracts up to MAX_IMAGES absolute, non-decorative image URLs from a page's
 * HTML. Pure and independently testable — no network access.
 */
export function findImageUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null && urls.length < MAX_IMAGES) {
    const raw = match[1];
    if (!raw || SKIP_URL_PATTERN.test(raw)) continue;

    let absolute: string;
    try {
      absolute = new URL(raw, baseUrl).toString();
    } catch {
      continue;
    }

    if (seen.has(absolute)) continue;
    seen.add(absolute);
    urls.push(absolute);
  }

  return urls;
}

/**
 * Downloads and vision-extracts conditions text from each image URL.
 * A single image failing (bad URL, oversized, non-image content-type, AI
 * error) is skipped rather than aborting the rest — fail-open per offer.
 */
export async function extractTextFromImages(imageUrls: string[]): Promise<string | undefined> {
  const texts: string[] = [];

  for (const url of imageUrls.slice(0, MAX_IMAGES)) {
    try {
      const image = await downloadImage(url);
      if (!image) continue;

      const text = await describeImage(image);
      if (text && text.trim().toUpperCase() !== "NONE") {
        texts.push(text.trim());
      }
    } catch (err) {
      console.warn(
        `[enrichment] Vision extraction failed for ${url}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return texts.length > 0 ? texts.join(" ") : undefined;
}

async function downloadImage(
  url: string
): Promise<{ data: string; mediaType: SupportedMediaType } | undefined> {
  const response = await fetch(url);
  if (!response.ok) return undefined;

  const contentType = response.headers.get("content-type") ?? "";
  const mediaType = normalizeMediaType(contentType);
  if (!mediaType) return undefined;

  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) return undefined;

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_BYTES) return undefined;

  return { data: Buffer.from(buffer).toString("base64"), mediaType };
}

function normalizeMediaType(contentType: string): SupportedMediaType | undefined {
  const base = contentType.split(";")[0]?.trim().toLowerCase();
  return base && SUPPORTED_MEDIA_TYPES.includes(base) ? (base as SupportedMediaType) : undefined;
}

async function describeImage(image: {
  data: string;
  mediaType: SupportedMediaType;
}): Promise<string | undefined> {
  const client = getGeminiClient();

  const response = await client.models.generateContent({
    model: ENRICHMENT_MODEL,
    contents: createUserContent([
      createPartFromBase64(image.data, image.mediaType),
      VISION_PROMPT,
    ]),
    // See semanticSummary.ts — disables thinking so the token budget goes
    // entirely to the extracted text, not an internal reasoning pass (#116).
    config: { maxOutputTokens: 300, thinkingConfig: { thinkingBudget: 0 } },
  });

  return response.text?.trim();
}
