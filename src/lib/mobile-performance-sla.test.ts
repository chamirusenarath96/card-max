/**
 * Unit tests for Mobile Performance & SLA Enforcement (spec 018)
 *
 * These tests verify that the configuration files and CI workflow
 * meet the acceptance criteria defined in the spec.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../..");

describe("Mobile Performance SLA — spec 018", () => {
  describe(".lighthouserc.json (AC1)", () => {
    it("exists at repo root", () => {
      expect(existsSync(resolve(ROOT, ".lighthouserc.json"))).toBe(true);
    });

    it("is valid JSON", () => {
      const content = readFileSync(resolve(ROOT, ".lighthouserc.json"), "utf-8");
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it("has LCP assertion with maxNumericValue: 2500 (AC1, AC3)", () => {
      const config = JSON.parse(
        readFileSync(resolve(ROOT, ".lighthouserc.json"), "utf-8"),
      );
      const assertions = config.ci.assert.assertions;
      expect(assertions["largest-contentful-paint"]).toBeDefined();
      const lcpRule = assertions["largest-contentful-paint"];
      expect(lcpRule[0]).toBe("error");
      expect(lcpRule[1].maxNumericValue).toBe(2500);
    });

    it("has Performance score assertion with minScore: 0.70 (AC1, AC3)", () => {
      const config = JSON.parse(
        readFileSync(resolve(ROOT, ".lighthouserc.json"), "utf-8"),
      );
      const assertions = config.ci.assert.assertions;
      expect(assertions["categories:performance"]).toBeDefined();
      const perfRule = assertions["categories:performance"];
      expect(perfRule[0]).toBe("error");
      expect(perfRule[1].minScore).toBe(0.70);
    });

    it("uses mobile simulation settings", () => {
      const config = JSON.parse(
        readFileSync(resolve(ROOT, ".lighthouserc.json"), "utf-8"),
      );
      const settings = config.ci.collect.settings;
      expect(settings.emulatedFormFactor).toBe("mobile");
      expect(settings.throttlingMethod).toBe("simulate");
    });

    it("uploads to temporary-public-storage target", () => {
      const config = JSON.parse(
        readFileSync(resolve(ROOT, ".lighthouserc.json"), "utf-8"),
      );
      // temporary-public-storage prints a public URL in the CI log so reports
      // are viewable without a self-hosted LHCI server.
      expect(config.ci.upload.target).toBe("temporary-public-storage");
    });
  });

  describe("ci.yml — Lighthouse CI step (AC2)", () => {
    const ciYml = readFileSync(
      resolve(ROOT, ".github/workflows/ci.yml"),
      "utf-8",
    );

    it("contains lhci autorun command", () => {
      expect(ciYml).toContain("lhci autorun");
    });

    it("Lighthouse step appears before Promote to production step", () => {
      const lhciPos = ciYml.indexOf("lhci autorun");
      const promotePos = ciYml.indexOf("Promote to production");
      expect(lhciPos).toBeGreaterThan(-1);
      expect(promotePos).toBeGreaterThan(-1);
      expect(lhciPos).toBeLessThan(promotePos);
    });

    it("Lighthouse step appears after Deploy to Vercel step (AC2)", () => {
      const deployPos = ciYml.indexOf("Deploy to Vercel");
      const lhciPos = ciYml.indexOf("lhci autorun");
      expect(deployPos).toBeGreaterThan(-1);
      expect(lhciPos).toBeGreaterThan(-1);
      expect(lhciPos).toBeGreaterThan(deployPos);
    });

    it("upload artifact step uses if: always() (AC4)", () => {
      expect(ciYml).toContain("lighthouse-report");
      // The "Upload Lighthouse report" step must have "if: always()"
      const uploadStepIdx = ciYml.indexOf("Upload Lighthouse report");
      expect(uploadStepIdx).toBeGreaterThan(-1);
      // The "if: always()" must appear between "Upload Lighthouse report" and "Promote to production"
      const promoteIdx = ciYml.indexOf("Promote to production");
      const uploadSection = ciYml.slice(uploadStepIdx, promoteIdx);
      expect(uploadSection).toContain("if: always()");
    });

    it("artifact has 14-day retention (AC4)", () => {
      expect(ciYml).toContain("retention-days: 14");
    });
  });

  describe("layout.tsx — preconnect resource hints (AC5)", () => {
    const layoutContent = readFileSync(
      resolve(ROOT, "src/app/layout.tsx"),
      "utf-8",
    );

    it("has preconnect hint for logo.clearbit.com", () => {
      expect(layoutContent).toContain(
        'rel="preconnect" href="https://logo.clearbit.com"',
      );
    });

    it("has dns-prefetch hint for logo.clearbit.com", () => {
      expect(layoutContent).toContain(
        'rel="dns-prefetch" href="//logo.clearbit.com"',
      );
    });

    it("has dns-prefetch hint for s3.amazonaws.com", () => {
      expect(layoutContent).toContain(
        'rel="dns-prefetch" href="//s3.amazonaws.com"',
      );
    });
  });
});
