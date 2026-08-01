import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Nested git worktrees (created by Claude Code's EnterWorktree tool) have
    // their own .next/node_modules trees; "**" patterns above don't match at
    // arbitrary depth, so scan them explicitly.
    "**/.next/**",
    "**/node_modules/**",
    ".claude/worktrees/**",
  ]),
  // Allow CJS require() in plain Node.js scripts
  {
    files: ["scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
