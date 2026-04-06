/**
 * GET /api/offers
 * Spec: specs/features/001-offer-listing.md + specs/api/openapi.yaml
 *
 * Supported query params (all optional):
 *   bank           – filter by bank enum
 *   category       – filter by category enum
 *   offerType      – filter by offer type enum (percentage|cashback|bogo|...)
 *   minDiscount    – minimum discountPercentage (0-100)
 *   maxDiscount    – maximum discountPercentage (0-100)
 *   activeOn       – ISO date; only offers valid on this day
 *   activeFrom     – ISO date; start of validity overlap window
 *   activeTo       – ISO date; end of validity overlap window
 *   includeExpired – "true" to include expired offers
 *   q              – full-text search
 *   page / limit   – pagination (default 1 / 20)
 */
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/lib/db/connect";
import { OfferModel } from "@/lib/models/offer.model";
import { OfferQuerySchema } from "../../../../specs/data/offer.schema";

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = OfferQuerySchema.safeParse(searchParams);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      bank,
      category,
      offerType,
      minDiscount,
      maxDiscount,
      activeOn,
      activeFrom,
      activeTo,
      includeExpired,
      q,
      page,
      limit,
    } = parsed.data;

    const t0 = Date.now();
    await dbConnect();
    const tConnect = Date.now() - t0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {};

    // Expired filter (default: hide expired)
    if (!includeExpired) {
      filter.isExpired = false;
    }

    // Standard dimension filters
    if (bank) filter.bank = bank;
    if (category) filter.category = category;
    if (offerType) filter.offerType = offerType;

    // Discount percentage range
    if (minDiscount !== undefined || maxDiscount !== undefined) {
      filter.discountPercentage = {};
      if (minDiscount !== undefined) filter.discountPercentage.$gte = minDiscount;
      if (maxDiscount !== undefined) filter.discountPercentage.$lte = maxDiscount;
    }

    // Date filtering: activeOn (single date — offer must span it)
    if (activeOn) {
      filter.validFrom = { $lte: activeOn };
      filter.$or = [
        { validUntil: { $gte: activeOn } },
        { validUntil: { $exists: false } },
      ];
    }

    // Date filtering: activeFrom / activeTo (overlap with window)
    if (activeFrom || activeTo) {
      if (activeTo) {
        filter.validFrom = { ...(filter.validFrom ?? {}), $lte: activeTo };
      }
      if (activeFrom) {
        filter.$or = [
          { validUntil: { $gte: activeFrom } },
          { validUntil: { $exists: false } },
        ];
      }
    }

    // Full-text search
    if (q && q.trim()) {
      filter.$text = { $search: q.trim() };
    }

    const skip = (page - 1) * limit;

    const tQuery = Date.now();
    const [raw, total] = await Promise.all([
      OfferModel.find(filter)
        .sort({ scrapedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-__v") // strip internal Mongoose field
        .lean(),
      OfferModel.countDocuments(filter),
    ]);

    // Explicitly serialize BSON types → plain JSON-safe values.
    // MongoDB ObjectId and Date instances cause Next.js serialization errors
    // when passed as props in Server Components.
    const data = raw.map((doc) => ({
      ...doc,
      _id: String(doc._id),
      scrapedAt: (doc.scrapedAt as Date | undefined)?.toISOString() ?? null,
      validFrom: (doc.validFrom as Date | undefined)?.toISOString() ?? null,
      validUntil: (doc.validUntil as Date | undefined)?.toISOString() ?? null,
      createdAt: (doc.createdAt as Date | undefined)?.toISOString() ?? null,
      updatedAt: (doc.updatedAt as Date | undefined)?.toISOString() ?? null,
    }));

    const tQueryMs = Date.now() - tQuery;
    const tTotalMs = Date.now() - t0;

    // Log timing on slow requests (>500ms) so we can track and optimise
    if (tTotalMs > 500) {
      console.warn(
        `[api/offers] SLOW ${tTotalMs}ms — connect:${tConnect}ms query:${tQueryMs}ms` +
        ` filter:${JSON.stringify(filter)} results:${raw.length}`
      );
    } else {
      console.log(`[api/offers] ${tTotalMs}ms (connect:${tConnect}ms query:${tQueryMs}ms) → ${raw.length} results`);
    }

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      _timing: { totalMs: tTotalMs, connectMs: tConnect, queryMs: tQueryMs },
    });
  } catch (err) {
    console.error("[api/offers] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
