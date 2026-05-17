/**
 * GET /api/categories
 * Spec: specs/features/030-dynamic-category-filters.md
 *
 * Returns distinct categories from non-expired offers, sorted by count desc.
 * Only categories matching the CategorySchema enum are returned.
 *
 * Response 200: { data: Array<{ category, label, count }> }
 * Response 200 (DB unavailable): { data: [] }  — UI degrades gracefully.
 *
 * Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
 */
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db/connect";
import { OfferModel } from "@/lib/models/offer.model";
import { CategorySchema } from "../../../../specs/data/offer.schema";
import { CATEGORY_LABELS } from "@/lib/categoryLabels";
import type { Category } from "../../../../specs/data/offer.schema";

export async function GET() {
  try {
    await dbConnect();

    const results = (await OfferModel.aggregate([
      { $match: { isExpired: false } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])) as Array<{ _id: string; count: number }>;

    const data = results
      .filter((r) => CategorySchema.safeParse(r._id).success)
      .map((r) => ({
        category: r._id as Category,
        label: CATEGORY_LABELS[r._id as Category] ?? r._id,
        count: r.count,
      }));

    return NextResponse.json(
      { data },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch {
    // DB unavailable — return empty list so the UI degrades gracefully (AC2).
    return NextResponse.json({ data: [] }, { status: 200 });
  }
}
