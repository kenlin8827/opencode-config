/**
 * Barrel entry — re-exports the Fast-Dev plugin from the subdirectory.
 *
 * OpenCode auto-discovers plugins by scanning the `plugins/` root directory
 * for `.ts` files. Each file is loaded as a module and its exported plugin
 * functions are registered.
 *
 * See: plugins/fast-dev/fast-dev.ts
 */
export { FastDevPlugin } from "./fast-dev/fast-dev"
