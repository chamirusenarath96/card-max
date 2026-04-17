/**
 * 404 page for /offers/[id] — shown when _id is invalid or offer doesn't exist.
 */
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfferNotFound() {
  return (
    <div
      data-testid="offer-not-found"
      className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center"
    >
      <SearchX className="mb-6 size-16 text-muted-foreground/40" strokeWidth={1} aria-hidden />
      <h1 className="mb-3 text-3xl font-bold tracking-tight">Offer not found</h1>
      <p className="mb-8 max-w-sm text-muted-foreground">
        This offer may have expired or been removed. Browse current deals below.
      </p>
      <Button asChild size="lg">
        <Link href="/">Browse All Offers</Link>
      </Button>
    </div>
  );
}
