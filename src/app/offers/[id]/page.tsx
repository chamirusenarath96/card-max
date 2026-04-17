/**
 * /offers/[id] — Offer Detail Page
 * Spec: specs/features/005-offer-detail.md
 */
import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { OfferDetail } from "./OfferDetail";
import { OfferDetailSkeleton } from "./loading";
import type { Offer } from "../../../../specs/data/offer.schema";

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ id: string }>;
}

function getBaseUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

async function fetchOffer(id: string): Promise<Offer | null> {
  const res = await fetch(`${getBaseUrl()}/api/offers/${id}`, {
    cache: "no-store",
  });

  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Failed to fetch offer: ${res.status}`);

  const json = await res.json();
  return json.data as Offer;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const offer = await fetchOffer(id);
  if (!offer) return { title: "Offer Not Found — CardMax" };

  return {
    title: `${offer.merchant} — ${offer.discountLabel ?? offer.title} | CardMax`,
    description: offer.description ?? offer.title,
  };
}

export default async function OfferDetailPage({ params }: PageProps) {
  const { id } = await params;
  const offer = await fetchOffer(id);

  if (!offer) notFound();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between px-6 py-3">
          <a href="/" className="text-xl font-bold tracking-tight hover:opacity-80 transition-opacity">
            CardMax
          </a>

          <NavigationMenu className="hidden md:flex">
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink
                  href="#"
                  className={navigationMenuTriggerStyle()}
                  aria-disabled="true"
                >
                  Cards
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink href="/" className={navigationMenuTriggerStyle()}>
                  Offers
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </header>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <main>
        <Suspense fallback={<OfferDetailSkeleton />}>
          <OfferDetail offer={offer} />
        </Suspense>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-muted">
        <div className="mx-auto flex max-w-screen-2xl flex-col items-center justify-between gap-6 px-12 py-12 md:flex-row">
          <div className="flex flex-col items-center gap-1 md:items-start">
            <div className="text-lg font-bold tracking-tight">CardMax</div>
            <p className="text-center text-sm text-muted-foreground md:text-left">
              Sri Lanka&apos;s Credit Card Offers Aggregator
            </p>
          </div>
          <div className="flex gap-8 text-sm text-muted-foreground">
            <span>Privacy</span>
            <span>Terms</span>
            <span>Support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
