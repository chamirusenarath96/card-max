/**
 * GET /api/offers
 * Spec: specs/features/001-offer-listing.md + specs/api/openapi.yaml
 * Search: Atlas Search ($search aggregation) — spec 013
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
 *   q              – full-text search (Atlas Search when available, $text fallback)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbName = (conn as any)?.connection?.db?.databaseName ?? "unknown";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const collName = (OfferModel as any)?.collection?.name ?? "unknown";
    console.log(`[api/offers] using database: "${dbName}", collection: "${collName}"`);

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

    // Sort order: "expiringSoon" = validUntil asc, "latest" = createdAt desc
    const sortOrder: Record<string, 1 | -1> = sort === "expiringSoon"
      ? { validUntil: 1 }
      : { createdAt: -1 };

    const skip = (page - 1) * limit;

    const tQuery = Date.now();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let raw: any[];
    let total: number;

    if (q && q.trim()) {
      const term = q.trim();
      // Apply fuzzy matching only for terms long enough that typos are plausible
      const fuzzy = term.length >= 4 ? { maxEdits: 1 as const } : undefined;

      // Atlas Search compound query with weighted field boosting (spec 013)
      const searchStage = {
        $search: {
          index: "offers_search",
          compound: {
            should: [
              {
                text: {
                  query: term,
                  path: "title",
                  ...(fuzzy ? { fuzzy } : {}),
                  score: { boost: { value: 3 } },
                },
              },
              {
                text: {
                  query: term,
                  path: "merchant",
                  ...(fuzzy ? { fuzzy } : {}),
                  score: { boost: { value: 2 } },
                },
              },
              {
                text: {
                  query: term,
                  path: "description",
                  ...(fuzzy ? { fuzzy } : {}),
                  score: { boost: { value: 1 } },
                },
              },
            ],
            minimumShouldMatch: 1,
          },
        },
      };

      // Sort: Atlas Search score first (relevance), then tiebreak by sort preference.
      // Cast required: Mongoose's Meta type predates Atlas Search ("textScore"|"indexKey" only).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const searchSort = { score: { $meta: "searchScore" }, ...sortOrder } as any;

      try {
        const [searchRaw, countResult] = await Promise.all([
          OfferModel.aggregate([
            searchStage,
            { $match: filter },
            { $sort: searchSort },
            { $skip: skip },
            { $limit: limit },
            { $project: { __v: 0 } },
          ]),
          OfferModel.aggregate([
            searchStage,
            { $match: filter },
            { $count: "total" },
          ]),
        ]);
        raw = searchRaw;
        total = (countResult as Array<{ total?: number }>)[0]?.total ?? 0;
      } catch (err) {
        // Atlas Search unavailable (index not built, non-Atlas cluster, network error, etc.)
        // Fall back to a case-insensitive regex search — works without any special index.
        // Previously only caught "index not found" errors which missed many real-world
        // failure modes (unsupported operator, wrong index name, cold-start errors).
        console.warn(
          "[api/offers] Atlas Search unavailable, falling back to regex search:",
          (err as Error).message,
        );
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "i");
        const textClause = {
          $or: [{ title: regex }, { merchant: regex }, { description: regex }],
        };

        // Merge with existing filter, safely handling a pre-existing $or (e.g. from
        // date-range filters) by combining both conditions under $and.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { $or: existingOr, ...baseFilter } = filter as any;
        const fallbackFilter = existingOr
          ? { ...baseFilter, $and: [{ $or: existingOr }, textClause] }
          : { ...baseFilter, ...textClause };

        const [fallbackRaw, fallbackTotal] = await Promise.all([
          OfferModel.find(fallbackFilter).sort(sortOrder).skip(skip).limit(limit).select("-__v").lean(),
          OfferModel.countDocuments(fallbackFilter),
        ]);
        raw = fallbackRaw;
        total = fallbackTotal;
      }
    } else {
      const [findRaw, findTotal] = await Promise.all([
        OfferModel.find(filter)
          .sort(sortOrder)
          .skip(skip)
          .limit(limit)
          .select("-__v")
          .lean(),
        OfferModel.countDocuments(filter),
      ]);
      raw = findRaw;
      total = findTotal;
    }

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
    // Return 503 for DB configuration/connection errors so E2E tests can distinguish
    // "not available" (503) from genuine programming errors (500).
    const msg = String((err as Error).message ?? "");
    // 503 for known DB unavailability signals (missing config, Mongoose buffer timeout).
    // All other errors remain 500 so unit-test mocks like "DB connection failed" still
    // produce 500 as the tests expect.
    const isDbUnavailable =
      msg.includes("MONGODB_URI") ||
      msg.includes("buffering timed out") ||
      msg.includes("Server selection timed out");
    return NextResponse.json(
      { error: isDbUnavailable ? "Service unavailable" : "Internal server error" },
      { status: isDbUnavailable ? 503 : 500 },
    );
  }
}
