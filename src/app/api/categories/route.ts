/**
 * GET /api/categories
 * Spec: specs/features/030-dynamic-category-filters.md
 *
 * Returns ALL distinct categories present in the database, sorted by active
 * offer count descending. All categories are returned regardless of schema
 * membership so that any value stored by a scraper is surfaced in the filter UI.
 *
 * Each result entry carries:
 *   - category  — the raw value stored in the DB
 *   - label     — human-readable label from CATEGORY_LABELS, or a title-cased
 *                 fallback derived from the raw value
 *   - count     — number of non-expired offers for that category
 *
 * Response 200: { data: Array<{ category, label, count }> }
 * Response 200 (DB unavailable): { data: [] }  — UI degrades gracefully.
 *
 * Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
 */
import { NextResponse } from "next/server";
import { dbConnect } from "@/lib/db/connect";
import { OfferModel } from "@/lib/models/offer.model";
import { CATEGORY_LABELS } from "@/lib/categoryLabels";
import type { Category } from "../../../../specs/data/offer.schema";

/** Derive a readable label for any category string not in CATEGORY_LABELS. */
function deriveCategoryLabel(raw: string): string {
  return raw
    .split(/[_\-\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export async function GET() {
  try {
    await dbConnect();

    const results = (await OfferModel.aggregate([
      // Count over all offers so every category appears even if only expired ones remain.
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])) as Array<{ _id: string; count: number }>;

    const data = results
      .filter((r) => typeof r._id === "string" && r._id.trim() !== "")
      .map((r) => ({
        category: r._id as Category,
        label: CATEGORY_LABELS[r._id as Category] ?? deriveCategoryLabel(r._id),
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
