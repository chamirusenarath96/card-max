/**
 * GET /offers/[id]
 * Spec: specs/features/046-offer-detail-page.md
 *
 * Server-rendered offer detail page — fetches the offer via the existing
 * GET /api/offers/[id] endpoint and its similar offers via the new
 * GET /api/offers/[id]/similar endpoint.
 */
import { notFound } from "next/navigation";
import { OfferDetailView } from "@/components/offers/OfferDetailView";
import type { Offer } from "../../../../specs/data/offer.schema";

export const revalidate = 3600;

function getBaseUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

async function fetchOffer(id: string): Promise<Offer | null> {
  const res = await fetch(`${getBaseUrl()}/api/offers/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? null;
}

async function fetchSimilarOffers(id: string): Promise<Offer[]> {
  const res = await fetch(`${getBaseUrl()}/api/offers/${id}/similar`, { cache: "no-store" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OfferDetailPage({ params }: PageProps) {
  const { id } = await params;

  const offer = await fetchOffer(id);
  if (!offer) notFound();

  const similarOffers = await fetchSimilarOffers(id);

  return <OfferDetailView offer={offer} similarOffers={similarOffers} />;
}
