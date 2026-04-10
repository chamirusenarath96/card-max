/**
 * On-demand ISR cache revalidation endpoint.
 *
 * Called by the GitHub Actions crawler workflow after a successful scrape so
 * users see fresh offers immediately instead of waiting up to 1 hour.
 *
 * Secured by a Bearer token stored as VERCEL_REVALIDATION_SECRET.
 *
 * Usage (from crawler.yml):
 *   curl -X POST \
 *     -H "Authorization: Bearer $VERCEL_REVALIDATION_SECRET" \
 *     https://your-app.vercel.app/api/revalidate
 */
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.VERCEL_REVALIDATION_SECRET}`;

  if (!process.env.VERCEL_REVALIDATION_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Revalidate the home page and all offer list variants
    revalidatePath("/");
    revalidatePath("/", "layout");
    revalidateTag("offers");

    return NextResponse.json({
      revalidated: true,
      revalidatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[api/revalidate] Error:", err);
    return NextResponse.json({ error: "Revalidation failed" }, { status: 500 });
  }
}
