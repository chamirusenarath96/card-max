/**
 * Shared category label map — single source of truth for category display names.
 * Used by the /api/categories route, FilterDrawer, FilterBar, and SearchDrawer.
 * Derived from specs/data/offer.schema.ts CategorySchema enum values.
 */
import type { Category } from "../../specs/data/offer.schema";

export const CATEGORY_LABELS: Record<Category, string> = {
  dining: "Dining",
  groceries: "Groceries",
  travel: "Travel",
  lodging: "Lodging",
  shopping: "Shopping",
  clothing: "Clothing",
  homecare: "Home Care",
  online: "Online",
  wellness: "Wellness",
  healthcare: "Healthcare",
  fuel: "Fuel",
  entertainment: "Entertainment",
  installments: "Installments",
  other: "Other",
};
