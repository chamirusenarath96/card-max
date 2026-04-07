"use client";

import type { Offer } from "../../../specs/data/offer.schema";
import type { CardSize } from "./offer-card-shared";
import { OfferCardCompact } from "./OfferCardCompact";
import { OfferCardDefault } from "./OfferCardDefault";
import { OfferCardExpanded } from "./OfferCardExpanded";

interface Props {
  offer: Offer;
  size?: CardSize;
}

export function OfferCard({ offer, size = "default" }: Props) {
  switch (size) {
    case "compact":
      return <OfferCardCompact offer={offer} />;
    case "expanded":
      return <OfferCardExpanded offer={offer} />;
    default:
      return <OfferCardDefault offer={offer} />;
  }
}
