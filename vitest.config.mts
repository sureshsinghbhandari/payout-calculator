import { fileURLToPath } from "node:url";
import { defaultExclude, defineConfig } from "vitest/config";

// No dedicated test directory: *.test.ts files sit next to the code they test.
// Exclude .claude/ too, so a Workflow agent's worktree (a full repo checkout
// under .claude/worktrees/) is never scanned alongside this one.
export default defineConfig({
  // Mirrors tsconfig.json's "@/*" -> "./src/*" path so modules that import
  // through the alias (e.g. src/app/**) resolve under Vitest too.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    exclude: [...defaultExclude, ".claude/**"],
  },
});
