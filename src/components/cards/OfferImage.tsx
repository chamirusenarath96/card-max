"use client";

/**
 * Smart offer image with three-level fallback:
 *
 *  1. Scraped / stored image URL  (merchantLogoUrl from DB)
 *  2. Clearbit Logo API           (fast, deterministic, works for known brands)
 *  3. Bank name + category icon   (Lucide icon on gradient — always works, no network)
 */
import { useState } from "react";
import Image from "next/image";
import {
  UtensilsCrossed,
  ShoppingBag,
  Plane,
  BedDouble,
  Home,
  Shirt,
  Fuel,
  ShoppingCart,
  Tv,
  Sparkles,
  HeartPulse,
  CreditCard,
  Globe,
  Tag,
} from "lucide-react";
import type { Offer } from "../../../specs/data/offer.schema";
import { buildClearbitUrl } from "../../../crawler/utils/logo";

// ── Category metadata ─────────────────────────────────────────────────────────

type CategoryMeta = { Icon: React.ElementType; gradient: string };

const CATEGORY_META: Record<string, CategoryMeta> = {
  dining:        { Icon: UtensilsCrossed, gradient: "from-orange-400 to-red-500" },
  shopping:      { Icon: ShoppingBag,     gradient: "from-pink-400 to-purple-500" },
  travel:        { Icon: Plane,           gradient: "from-sky-400 to-blue-600" },
  lodging:       { Icon: BedDouble,       gradient: "from-indigo-400 to-blue-600" },
  homecare:      { Icon: Home,            gradient: "from-amber-400 to-orange-500" },
  clothing:      { Icon: Shirt,           gradient: "from-fuchsia-400 to-pink-600" },
  fuel:          { Icon: Fuel,            gradient: "from-yellow-400 to-orange-500" },
  groceries:     { Icon: ShoppingCart,    gradient: "from-green-400 to-emerald-600" },
  entertainment: { Icon: Tv,              gradient: "from-violet-400 to-purple-600" },
  wellness:      { Icon: Sparkles,        gradient: "from-lime-400 to-green-500" },
  healthcare:    { Icon: HeartPulse,      gradient: "from-rose-400 to-red-600" },
  installments:  { Icon: CreditCard,      gradient: "from-cyan-400 to-teal-600" },
  online:        { Icon: Globe,           gradient: "from-teal-400 to-cyan-600" },
  other:         { Icon: Tag,             gradient: "from-slate-400 to-gray-600" },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  offer: Pick<Offer, "merchantLogoUrl" | "merchant" | "category" | "title" | "bankDisplayName">;
  bankColor: string;
  sizes?: string;
  imgClassName?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

type Stage = "primary" | "clearbit" | "icon";

export function OfferImage({ offer, sizes, imgClassName }: Props) {
  const [stage, setStage] = useState<Stage>(offer.merchantLogoUrl ? "primary" : "clearbit");

  const clearbitUrl = buildClearbitUrl(offer.merchant);

  function advanceStage() {
    setStage((s) => {
      if (s === "primary")  return "clearbit";
      if (s === "clearbit") return "icon";
      return "icon";
    });
  }

  // Stage 3 — bank name + category icon (no network, always renders)
  if (stage === "icon") {
    const meta = CATEGORY_META[offer.category] ?? CATEGORY_META.other!;
    const { Icon, gradient } = meta;
    return (
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br ${gradient}`}
      >
        <Icon className="mb-2 size-10 text-white/80" strokeWidth={1.5} aria-hidden />
        <span className="px-3 text-center text-xs font-bold text-white leading-snug">
          {offer.merchant}
        </span>
        <span className="mt-0.5 px-2 text-center text-[10px] font-semibold text-white/70">
          {offer.bankDisplayName}
        </span>
      </div>
    );
  }

  const src = stage === "primary" ? offer.merchantLogoUrl! : clearbitUrl;

  return (
    <Image
      src={src}
      alt={offer.merchant}
      fill
      sizes={sizes ?? "(max-width: 768px) 100vw, 33vw"}
      className={imgClassName ?? "object-contain p-3"}
      onError={advanceStage}
      // Skip Next.js image optimisation for all external URLs:
      // - "primary" (bank CDN images) — bank servers often block Vercel's optimisation
      //   server IPs, so let the browser fetch directly instead.
      // - "clearbit" — Clearbit redirects; optimisation breaks redirect following.
      unoptimized
    />
  );
}
