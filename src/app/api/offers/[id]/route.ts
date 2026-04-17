/**
 * GET /api/offers/[id]
 * Spec: specs/features/005-offer-detail.md
 *
 * Returns a single offer document by its MongoDB _id.
 * Response 200: { data: Offer }
 * Response 400: { error: "Invalid id" }        — malformed ObjectId
 * Response 404: { error: "Offer not found" }   — valid id but no document
 */
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db/connect";
import { OfferModel } from "@/lib/models/offer.model";
import mongoose from "mongoose";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    await dbConnect();
    const doc = await OfferModel.findById(id).select("-__v").lean();

    if (!doc) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    const data = {
      ...doc,
      _id: String(doc._id),
      scrapedAt: (doc.scrapedAt as Date | undefined)?.toISOString() ?? null,
      validFrom: (doc.validFrom as Date | undefined)?.toISOString() ?? null,
      validUntil: (doc.validUntil as Date | undefined)?.toISOString() ?? null,
      createdAt: (doc.createdAt as Date | undefined)?.toISOString() ?? null,
      updatedAt: (doc.updatedAt as Date | undefined)?.toISOString() ?? null,
    };

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[api/offers/[id]] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
