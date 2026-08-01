import Link from "next/link";
import { Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function OfferNotFound() {
  return (
    <div className="mx-auto max-w-screen-lg px-6 py-10">
      <Card data-testid="offer-not-found" className="border-dashed py-16 text-center shadow-none">
        <CardContent className="flex flex-col items-center gap-4 px-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-muted">
            <Search className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Offer not found</h1>
          <p className="max-w-sm text-muted-foreground">
            This offer may have expired or the link is invalid.
          </p>
          <Link
            href="/"
            data-testid="offer-not-found-back-link"
            className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to all offers
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
