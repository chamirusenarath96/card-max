/**
 * GET /api/offers/[id]
 * Spec: specs/api/openapi.yaml
 */
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db/connect";
import { OfferModel } from "@/lib/models/offer.model";
import mongoose from "mongoose";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid offer ID" }, { status: 400 });
  }

  try {
    await dbConnect();
    const offer = await OfferModel.findById(id).lean();

    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    return NextResponse.json(offer);
  } catch (err) {
    console.error("[api/offers/id] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
