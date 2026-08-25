/**
 * Barrel entry — re-exports the SDD plugin from the subdirectory.
 *
 * OpenCode auto-discovers plugins by scanning the `plugins/` root directory
 * for `.ts` files. Each file is loaded as a module and its exported plugin
 * functions are registered.
 *
 * See: plugins/sdd/sdd.ts
 */
export { SddPlugin } from "./sdd/sdd"
