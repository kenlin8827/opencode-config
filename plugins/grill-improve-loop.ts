/**
 * Barrel entry — re-exports the grill-improve-loop plugin from the subdirectory.
 *
 * OpenCode auto-discovers plugins by scanning the `plugins/` root directory
 * for `.ts` files. Each file is loaded as a module and its exported plugin
 * functions are registered. This thin file ensures OpenCode picks it up.
 *
 * See: plugins/grill-improve-loop/grill-improve-loop.ts
 */
export { GrillImproveLoopPlugin } from "./grill-improve-loop/grill-improve-loop"
