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
 *   sort           – "latest" (default, createdAt desc) | "expiringSoon" (validUntil asc, within 3 days)
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
      sort,
      page,
      limit,
    } = parsed.data;

    const t0 = Date.now();
    const conn = await dbConnect();
    const tConnect = Date.now() - t0;
    const dbName = conn.connection.db?.databaseName ?? "unknown";
    console.log(`[api/offers] using database: "${dbName}", collection: "${OfferModel.collection.name}"`);

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

    // "Expiring Soon" sort: restrict to offers expiring within 3 days
    if (sort === "expiringSoon") {
      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      filter.validUntil = {
        ...(filter.validUntil ?? {}),
        $gte: now,
        $lte: threeDaysFromNow,
      };
    }

    // Full-text search
    if (q && q.trim()) {
      filter.$text = { $search: q.trim() };
    }

    // Sort order: "expiringSoon" = validUntil asc, "latest" = createdAt desc
    const sortOrder: Record<string, 1 | -1> = sort === "expiringSoon"
      ? { validUntil: 1 }
      : { createdAt: -1 };

    const skip = (page - 1) * limit;

    const tQuery = Date.now();
    const [raw, total] = await Promise.all([
      OfferModel.find(filter)
        .sort(sortOrder)
        .skip(skip)
        .limit(limit)
        .select("-__v")
        .lean(),
      OfferModel.countDocuments(filter),
    ]);

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
