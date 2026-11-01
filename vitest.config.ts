import path from "node:path";
import { defaultExclude, defineConfig } from "vitest/config";

// No dedicated test directory: *.test.ts files sit next to the code they test.
// Exclude .claude/ too, so a Workflow agent's worktree (a full repo checkout
// under .claude/worktrees/) is never scanned alongside this one.
export default defineConfig({
  // Mirrors tsconfig.json's "@/*" -> "./src/*" so tests can import files
  // (like server actions) that use the "@/" alias, same as the app itself.
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    exclude: [...defaultExclude, ".claude/**"],
  },
});
