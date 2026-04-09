"use client";

/**
 * Smart offer image with three-level fallback:
 *
 *  1. Scraped / stored image URL  (merchantLogoUrl from DB)
 *  2. AI-generated image          (Pollinations.ai — deterministic, free)
 *  3. Category icon               (Lucide icon on gradient background)
 *
 * The AI fallback is generated client-side only when the primary image
 * fails to load, so there is zero extra latency on the happy path.
 */
import { useState } from "react";
import Image from "next/image";
import {
  UtensilsCrossed,
  ShoppingBag,
  Plane,
  Fuel,
  ShoppingCart,
  Tv,
  Heart,
  Globe,
  Tag,
} from "lucide-react";
import type { Offer } from "../../../specs/data/offer.schema";
import { buildPollinationsUrl } from "../../../crawler/utils/logo";

// ── Category metadata ─────────────────────────────────────────────────────────

type CategoryMeta = {
  Icon: React.ElementType;
  gradient: string;
};

const CATEGORY_META: Record<string, CategoryMeta> = {
  dining:        { Icon: UtensilsCrossed, gradient: "from-orange-400 to-red-500" },
  shopping:      { Icon: ShoppingBag,     gradient: "from-pink-400 to-purple-500" },
  travel:        { Icon: Plane,           gradient: "from-sky-400 to-blue-600" },
  fuel:          { Icon: Fuel,            gradient: "from-yellow-400 to-orange-500" },
  groceries:     { Icon: ShoppingCart,    gradient: "from-green-400 to-emerald-600" },
  entertainment: { Icon: Tv,              gradient: "from-violet-400 to-purple-600" },
  health:        { Icon: Heart,           gradient: "from-rose-400 to-red-600" },
  online:        { Icon: Globe,           gradient: "from-teal-400 to-cyan-600" },
  other:         { Icon: Tag,             gradient: "from-slate-400 to-gray-600" },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  offer: Pick<Offer, "merchantLogoUrl" | "merchant" | "category" | "title" | "bankDisplayName">;
  bankColor: string;
  sizes?: string;
  /** CSS class applied to the <img> element — use for object-fit, etc. */
  imgClassName?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

type Stage = "primary" | "ai" | "icon";

export function OfferImage({ offer, bankColor, sizes, imgClassName }: Props) {
  const [stage, setStage] = useState<Stage>(offer.merchantLogoUrl ? "primary" : "ai");

  const aiUrl = buildPollinationsUrl(offer.merchant, offer.category);

  function advanceStage() {
    setStage((s) => {
      if (s === "primary") return "ai";
      if (s === "ai") return "icon";
      return "icon";
    });
  }

  // Stage 3 — category icon fallback (always works, no network request)
  if (stage === "icon") {
    const meta = CATEGORY_META[offer.category] ?? CATEGORY_META.other!;
    const { Icon, gradient } = meta;
    return (
      <div className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br ${gradient}`}>
        <Icon className="mb-2 size-12 text-white/90" strokeWidth={1.5} aria-hidden />
        <span className="px-2 text-center text-xs font-semibold text-white/80">
          {offer.bankDisplayName}
        </span>
      </div>
    );
  }

  // Stage 1 + 2 — try primary scraped URL, then Pollinations.ai
  const src = stage === "primary" ? offer.merchantLogoUrl! : aiUrl;

  return (
    <Image
      src={src}
      alt={offer.merchant}
      fill
      sizes={sizes ?? "(max-width: 768px) 100vw, 33vw"}
      className={imgClassName ?? "object-cover"}
      onError={advanceStage}
      // Pollinations.ai takes a few seconds on first load — show a gentle
      // placeholder colour while the AI image generates
      style={stage === "ai" ? { backgroundColor: `${bankColor}18` } : undefined}
    />
  );
}
