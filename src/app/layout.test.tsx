import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

// next/font/google requires the Next.js SWC compiler, which isn't present
// under Vitest — stub it with the shape RootLayout actually uses.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-sans" }),
  Geist_Mono: () => ({ variable: "--font-mono" }),
}));

// NavigationProgressProvider and <Analytics /> both call into next/navigation,
// which requires an App Router context that isn't mounted under plain RTL render.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

const { default: RootLayout } = await import("./layout");

describe("RootLayout", () => {
  beforeEach(() => {
    // next-themes reads matchMedia to detect system theme preference
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders children without throwing", () => {
    expect(() =>
      render(
        <RootLayout>
          <div data-testid="child-content">hello</div>
        </RootLayout>,
      ),
    ).not.toThrow();

    expect(screen.getByTestId("child-content")).toBeInTheDocument();
  });

  it("mounts Analytics from @vercel/analytics/next exactly once in the layout source", () => {
    const source = readFileSync(join(__dirname, "layout.tsx"), "utf-8");
    const importMatches = source.match(/import\s*{\s*Analytics\s*}\s*from\s*"@vercel\/analytics\/next"/g);
    const usageMatches = source.match(/<Analytics\s*\/>/g);

    expect(importMatches).toHaveLength(1);
    expect(usageMatches).toHaveLength(1);
  });
});
