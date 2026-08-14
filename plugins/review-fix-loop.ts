/**
 * Barrel entry — re-exports the actual plugin from the subdirectory.
 *
 * OpenCode auto-discovers plugins by scanning the `plugins/` root directory
 * for `.ts` files. The real implementation + protocol markdown live in
 * `plugins/review-fix-loop/` (same pattern as `advisor/` helpers). This
 * thin file ensures OpenCode picks it up.
 *
 * See: plugins/review-fix-loop/review-fix-loop.ts
 */
export { ReviewFixLoopPlugin } from "./review-fix-loop/review-fix-loop"
