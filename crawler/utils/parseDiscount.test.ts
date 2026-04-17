import { describe, it, expect } from "vitest";
import { parseDiscount, extractMaxPercentage } from "./parseDiscount";

describe("extractMaxPercentage", () => {
  it("extracts a simple percentage", () => {
    expect(extractMaxPercentage("15% off")).toBe(15);
  });

  it("extracts the highest when multiple percentages", () => {
    expect(extractMaxPercentage("15% – 20% off")).toBe(20);
  });

  it("handles decimal percentages", () => {
    expect(extractMaxPercentage("12.5% discount")).toBe(12.5);
  });

  it("returns undefined when no percentage", () => {
    expect(extractMaxPercentage("Buy 1 Get 1 Free")).toBeUndefined();
  });
});

describe("parseDiscount", () => {
  it("returns other for null/undefined input", () => {
    expect(parseDiscount(null)).toEqual({ offerType: "other" });
    expect(parseDiscount(undefined)).toEqual({ offerType: "other" });
    expect(parseDiscount("")).toEqual({ offerType: "other" });
  });

  it("classifies percentage discounts", () => {
    expect(parseDiscount("15% off")).toEqual({
      offerType: "percentage",
      discountPercentage: 15,
      discountLabel: "15% off",
    });
    expect(parseDiscount("Up to 45% discount")).toEqual({
      offerType: "percentage",
      discountPercentage: 45,
      discountLabel: "Up to 45% discount",
    });
  });

  it("classifies cashback offers and extracts percentage", () => {
    expect(parseDiscount("10% cashback on all spends")).toEqual({
      offerType: "cashback",
      discountPercentage: 10,
      discountLabel: "10% cashback on all spends",
    });
  });

  it("classifies cashback without percentage", () => {
    const result = parseDiscount("Rs. 500 cashback");
    expect(result.offerType).toBe("cashback");
    expect(result.discountPercentage).toBeUndefined();
  });

  it("classifies BOGO offers", () => {
    expect(parseDiscount("Buy 1 Get 1 Free").offerType).toBe("bogo");
    expect(parseDiscount("B1G1 offer at KFC").offerType).toBe("bogo");
    expect(parseDiscount("Buy 2 Get 1").offerType).toBe("bogo");
  });

  it("classifies installment offers — 0% interest variants", () => {
    const result = parseDiscount("0% interest – 12 months");
    expect(result.offerType).toBe("installment");
    expect(result.discountPercentage).toBe(0);

    expect(parseDiscount("0% p.a. for 24 months").offerType).toBe("installment");
    expect(parseDiscount("0% APR over 36 months").offerType).toBe("installment");
    expect(parseDiscount("0% financing for 6 months").offerType).toBe("installment");
    expect(parseDiscount("0% per annum for 12 months").offerType).toBe("installment");
    expect(parseDiscount("0 % interest for 60 months").offerType).toBe("installment");
  });

  it("classifies interest-free phrasings as installment", () => {
    expect(parseDiscount("Interest-free for 12 months").offerType).toBe("installment");
    expect(parseDiscount("Interest free installments").offerType).toBe("installment");
    expect(parseDiscount("Get interest free 24-month plan").offerType).toBe("installment");
  });

  it("classifies EasyPay / easy payment variants as installment", () => {
    expect(parseDiscount("Easy Pay 24 months").offerType).toBe("installment");
    expect(parseDiscount("EasyPay plan available").offerType).toBe("installment");
    expect(parseDiscount("Easy Payment Plan up to 36 months").offerType).toBe("installment");
    expect(parseDiscount("Easy payment over 12 months").offerType).toBe("installment");
  });

  it("classifies UK-spelling 'instalment' variants as installment", () => {
    expect(parseDiscount("Instalment plan – 12 months").offerType).toBe("installment");
    expect(parseDiscount("0% instalment scheme").offerType).toBe("installment");
    expect(parseDiscount("Monthly instalment facility").offerType).toBe("installment");
  });

  it("classifies equal monthly / monthly instalment patterns", () => {
    expect(parseDiscount("Equal monthly instalments for 24 months").offerType).toBe("installment");
    expect(parseDiscount("Monthly installment available").offerType).toBe("installment");
  });

  it("classifies loyalty points offers", () => {
    expect(parseDiscount("Double Points every Tuesday").offerType).toBe("points");
    expect(parseDiscount("5x Miles on international spend").offerType).toBe("points");
  });

  it("classifies free item offers", () => {
    expect(parseDiscount("Complimentary dessert with main course").offerType).toBe("free_item");
    expect(parseDiscount("Free drink with any meal").offerType).toBe("free_item");
  });

  it("classifies fixed cash amount offers", () => {
    expect(parseDiscount("Rs. 1,000 off on bills above Rs. 5,000").offerType).toBe("fixed_amount");
    expect(parseDiscount("LKR 500 discount").offerType).toBe("fixed_amount");
  });

  it("preserves the original label in discountLabel", () => {
    const raw = "Up to 45% off at selected outlets";
    expect(parseDiscount(raw).discountLabel).toBe(raw);
  });

  it("trims whitespace from the label", () => {
    expect(parseDiscount("  20% off  ").discountLabel).toBe("20% off");
  });

  it("returns other for unrecognised formats", () => {
    expect(parseDiscount("Special Ramadan offer").offerType).toBe("other");
  });
});
