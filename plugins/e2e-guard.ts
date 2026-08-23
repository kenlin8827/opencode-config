/**
 * Barrel entry — re-exports the E2E gate plugin from the subdirectory.
 *
 * OpenCode auto-discovers plugins by scanning the `plugins/` root directory
 * for `.ts` files. Each file is loaded as a module and its exported plugin
 * functions are registered. This thin file ensures OpenCode picks it up.
 *
 * See: plugins/e2e-guard/e2e-guard.ts
 */
export { E2eGuardPlugin } from "./e2e-guard/e2e-guard"
