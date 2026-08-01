/**
 * Resolves free-text redemption conditions (e.g. "every Thursday from 1st to
 * 21st of August") into a concrete list of ISO calendar dates within the
 * offer's outer [validFrom, validUntil] window.
 *
 * Deterministic on purpose: AI (Claude) is used elsewhere in the enrichment
 * pipeline for semantic summaries and image OCR, but the actual weekday/date
 * arithmetic here needs to be exact and independently testable, so it is
 * *not* delegated to a model. Vision-extracted conditions text is fed back
 * into this same function (see enrichOffer.ts), fulfilling spec 044's
 * "same date-resolution pipeline" requirement without making date math
 * non-deterministic.
 *
 * Spec: specs/features/044-ai-offer-enrichment.md (AC1, AC2, Edge Cases)
 */
import { eachDayOfInterval } from "date-fns";

const WEEKDAY_NAMES: Array<[string, number]> = [
  ["sunday", 0],
  ["sun", 0],
  ["monday", 1],
  ["mon", 1],
  ["tuesday", 2],
  ["tue", 2],
  ["tues", 2],
  ["wednesday", 3],
  ["wed", 3],
  ["thursday", 4],
  ["thu", 4],
  ["thur", 4],
  ["thurs", 4],
  ["friday", 5],
  ["fri", 5],
  ["saturday", 6],
  ["sat", 6],
];

const MONTH_MAP: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

const DATE_RANGE_RE =
  /(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|-|–|through)\s*(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(\w+)(?:\s+(\d{4}))?/i;

/**
 * Returns the sorted, deduped ISO ("YYYY-MM-DD") dates on which the offer is
 * actually redeemable, or `undefined` when no recognizable weekday/date-range
 * pattern is found, the conditions are self-contradictory, or the outer
 * validity window is missing/invalid — fails open rather than guessing.
 */
export function resolveApplicableDates(
  conditionsText: string | undefined,
  validFrom: Date | undefined,
  validUntil: Date | undefined
): string[] | undefined {
  if (!conditionsText || !conditionsText.trim()) return undefined;
  if (!validFrom || !validUntil) return undefined;
  if (validUntil < validFrom) return undefined;

  const text = conditionsText.toLowerCase();

  const weekdays = extractWeekdays(text);
  if (weekdays.length === 0) return undefined;
  if (isContradictory(text)) return undefined;

  const explicitRange = extractDateRange(text, validFrom.getFullYear());
  const rangeStart = explicitRange && explicitRange.start > validFrom ? explicitRange.start : validFrom;
  const rangeEnd = explicitRange && explicitRange.end < validUntil ? explicitRange.end : validUntil;
  if (rangeStart > rangeEnd) return undefined;

  const matchingDates = eachDayOfInterval({ start: rangeStart, end: rangeEnd })
    .filter((d) => weekdays.includes(d.getDay()))
    .map((d) => toIsoDate(d));

  return matchingDates.length > 0 ? matchingDates : undefined;
}

function extractWeekdays(text: string): number[] {
  const found = new Set<number>();

  if (/\bweekends?\b/.test(text)) {
    found.add(0);
    found.add(6);
  }
  if (/\bweekdays?\b/.test(text)) {
    [1, 2, 3, 4, 5].forEach((d) => found.add(d));
  }
  for (const [name, num] of WEEKDAY_NAMES) {
    if (new RegExp(`\\b${name}s?\\b`, "i").test(text)) {
      found.add(num);
    }
  }

  return [...found];
}

/**
 * Fails open when the text asserts and negates the same weekday
 * (e.g. "every day except Thursdays, valid only on Thursdays").
 */
function isContradictory(text: string): boolean {
  const exceptMatch = text.match(/except\s+(\w+)/i);
  const onlyMatch = text.match(/only\s+(?:on\s+)?(\w+)/i);
  if (!exceptMatch || !onlyMatch) return false;

  const exceptDay = normalizeWeekdayWord(exceptMatch[1]!);
  const onlyDay = normalizeWeekdayWord(onlyMatch[1]!);
  return exceptDay !== undefined && exceptDay === onlyDay;
}

function normalizeWeekdayWord(word: string): number | undefined {
  const stripped = word.toLowerCase().replace(/s$/, "");
  const match = WEEKDAY_NAMES.find(([name]) => name === stripped);
  return match?.[1];
}

function extractDateRange(
  text: string,
  fallbackYear: number
): { start: Date; end: Date } | undefined {
  const match = text.match(DATE_RANGE_RE);
  if (!match) return undefined;

  const [, startDay, endDay, monthName, yearStr] = match;
  const month = MONTH_MAP[monthName!.toLowerCase()];
  if (month === undefined) return undefined;

  const year = yearStr ? parseInt(yearStr, 10) : fallbackYear;
  const start = new Date(year, month, parseInt(startDay!, 10));
  const end = new Date(year, month, parseInt(endDay!, 10));
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return undefined;

  return { start, end };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
