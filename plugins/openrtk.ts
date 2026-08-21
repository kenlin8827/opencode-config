/**
 * Barrel entry — re-exports the openrtk plugin from the subdirectory.
 *
 * OpenCode auto-discovers plugins by scanning the `plugins/` root directory
 * for `.ts` files. Each file is loaded as a module and its exported plugin
 * functions are registered. This thin file ensures OpenCode picks it up.
 *
 * See: plugins/openrtk/index.ts
 */
export { OpenRtkPlugin } from "./openrtk/index"
