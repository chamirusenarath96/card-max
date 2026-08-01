import type { Page } from "@playwright/test";

/**
 * Ensures a FilterDrawer accordion section is expanded before interacting with
 * its contents. Sections default open on desktop and collapsed on mobile
 * (spec 043), so tests that click chips inside a section must expand it first
 * — this is a no-op when the section is already open.
 */
export async function expandFilterSection(page: Page, sectionId: string): Promise<void> {
  const toggle = page.getByTestId(`filter-section-toggle-${sectionId}`);
  const expanded = await toggle.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await toggle.click();
  }
}
