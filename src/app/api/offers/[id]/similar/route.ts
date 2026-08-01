/**
 * GET /api/offers/[id]/similar
 * Spec: specs/features/046-offer-detail-page.md
 *
 * Returns offers sharing the source offer's category, whose validity window
 * overlaps the source offer's window, excluding the source offer itself and
 * excluding expired offers.
 *
 * Response 200: { data: Offer[] }
 * Response 400: { error: "Invalid id" }        — malformed ObjectId
 * Response 404: { error: "Offer not found" }   — valid id but source offer doesn't exist
 */
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db/connect";
import { OfferModel } from "@/lib/models/offer.model";
import mongoose from "mongoose";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(n), MAX_LIMIT);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  try {
    await dbConnect();

    const source = await OfferModel.findById(id)
      .select("category validFrom validUntil")
      .lean();

    if (!source) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {
      _id: { $ne: id },
      category: source.category,
      isExpired: false,
    };

    // Overlap-window pattern mirrors activeFrom/activeTo in /api/offers/route.ts.
    // Falls back to category-only matching when the source offer has no validity dates.
    if (source.validFrom || source.validUntil) {
      filter.validFrom = { $lte: source.validUntil ?? new Date(8640000000000000) };
      filter.$or = [
        { validUntil: { $gte: source.validFrom ?? new Date(0) } },
        { validUntil: { $exists: false } },
      ];
    }

    const raw = await OfferModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("-__v")
      .lean();

    const data = raw.map((doc) => ({
      ...doc,
      _id: String(doc._id),
      scrapedAt: (doc.scrapedAt as Date | undefined)?.toISOString() ?? null,
      validFrom: (doc.validFrom as Date | undefined)?.toISOString() ?? null,
      validUntil: (doc.validUntil as Date | undefined)?.toISOString() ?? null,
      createdAt: (doc.createdAt as Date | undefined)?.toISOString() ?? null,
      updatedAt: (doc.updatedAt as Date | undefined)?.toISOString() ?? null,
    }));

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[api/offers/[id]/similar] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
