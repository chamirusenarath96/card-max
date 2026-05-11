import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { describe, it, expect } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const workflowsDir = join(ROOT, ".github", "workflows");
const actionsDir = join(ROOT, ".github", "actions");

function readWorkflow(name: string): string {
  return readFileSync(join(workflowsDir, name), "utf-8");
}

describe("composite setup action (AC1)", () => {
  it("action.yml exists at .github/actions/setup/action.yml", () => {
    const actionPath = join(actionsDir, "setup", "action.yml");
    expect(existsSync(actionPath)).toBe(true);
  });

  it("action.yml contains setup-node and npm ci steps", () => {
    const action = readFileSync(
      join(actionsDir, "setup", "action.yml"),
      "utf-8"
    );
    expect(action).toContain("actions/setup-node@v4");
    expect(action).toContain("npm ci");
    expect(action).toContain("using: composite");
  });

  it("composite run steps have explicit shell: bash", () => {
    const action = readFileSync(
      join(actionsDir, "setup", "action.yml"),
      "utf-8"
    );
    expect(action).toContain("shell: bash");
  });

  it("action.yml does not use actions/checkout as a step (checkout must precede local action call)", () => {
    const action = readFileSync(
      join(actionsDir, "setup", "action.yml"),
      "utf-8"
    );
    // Local composite actions require the repo to already be checked out on the runner.
    // Including a `uses: actions/checkout` step inside the composite action causes
    // "Can't find action.yml" errors because the runner hasn't cloned the repo yet.
    expect(action).not.toMatch(/uses:\s*actions\/checkout/);
  });
});

describe("ci.yml jobs reference composite setup action (AC2)", () => {
  it("security job uses actions/checkout then ./.github/actions/setup", () => {
    const ci = readWorkflow("ci.yml");
    const securitySection = ci.slice(
      ci.indexOf("  security:"),
      ci.indexOf("  # ── Job 1:")
    );
    expect(securitySection).toContain("actions/checkout@v4");
    expect(securitySection).toContain("uses: ./.github/actions/setup");
    expect(securitySection).not.toContain("actions/setup-node@v4");
  });

  it("ci job uses actions/checkout then ./.github/actions/setup", () => {
    const ci = readWorkflow("ci.yml");
    const ciSection = ci.slice(
      ci.indexOf("  # ── Job 1:"),
      ci.indexOf("  # ── Job 2:")
    );
    expect(ciSection).toContain("actions/checkout@v4");
    expect(ciSection).toContain("uses: ./.github/actions/setup");
    expect(ciSection).not.toContain("actions/setup-node@v4");
  });

  it("e2e job uses actions/checkout then ./.github/actions/setup", () => {
    const ci = readWorkflow("ci.yml");
    const e2eSection = ci.slice(
      ci.indexOf("  # ── Job 2:"),
      ci.indexOf("  # ── Job 3:")
    );
    expect(e2eSection).toContain("actions/checkout@v4");
    expect(e2eSection).toContain("uses: ./.github/actions/setup");
    expect(e2eSection).not.toContain("actions/setup-node@v4");
  });

  it("migrate job uses actions/checkout then ./.github/actions/setup", () => {
    const ci = readWorkflow("ci.yml");
    const migrateSection = ci.slice(
      ci.indexOf("  # ── Job 3:"),
      ci.indexOf("  # ── Job 4:")
    );
    expect(migrateSection).toContain("actions/checkout@v4");
    expect(migrateSection).toContain("uses: ./.github/actions/setup");
    expect(migrateSection).not.toContain("actions/setup-node@v4");
  });

  it("deploy job uses actions/checkout then ./.github/actions/setup", () => {
    const ci = readWorkflow("ci.yml");
    const deploySection = ci.slice(ci.indexOf("  # ── Job 4:"));
    expect(deploySection).toContain("actions/checkout@v4");
    expect(deploySection).toContain("uses: ./.github/actions/setup");
    expect(deploySection).not.toContain("actions/setup-node@v4");
  });

  it("ci.yml has at least 5 references to the composite action (one per job)", () => {
    const ci = readWorkflow("ci.yml");
    const matches = ci.match(/uses: \.\/\.github\/actions\/setup/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  it("ci.yml has no inline actions/setup-node steps outside composite action", () => {
    const ci = readWorkflow("ci.yml");
    // setup-node should only appear in each job's step sequence once (via composite),
    // but since it's in the composite action file (not ci.yml), ci.yml should have none
    expect(ci).not.toContain("actions/setup-node@v4");
  });
});

describe("ci.yml deploy job has no Atlas warmup health ping (AC3)", () => {
  it("deploy job does not contain curl to /api/health", () => {
    const ci = readWorkflow("ci.yml");
    const deploySection = ci.slice(ci.indexOf("  # ── Job 4:"));
    expect(deploySection).not.toMatch(/curl[^#]*api\/health/);
  });

  it("deploy job does not contain curl to /api/ping", () => {
    const ci = readWorkflow("ci.yml");
    const deploySection = ci.slice(ci.indexOf("  # ── Job 4:"));
    expect(deploySection).not.toMatch(/curl[^#]*api\/ping/);
  });

  it("deploy job retains the ISR cache invalidation curl to /api/revalidate", () => {
    const ci = readWorkflow("ci.yml");
    const deploySection = ci.slice(ci.indexOf("  # ── Job 4:"));
    expect(deploySection).toContain("api/revalidate");
  });
});
