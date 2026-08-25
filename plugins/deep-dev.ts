/**
 * Barrel entry — re-exports the Deep-Dev plugin from the subdirectory.
 *
 * OpenCode auto-discovers plugins by scanning the `plugins/` root directory
 * for `.ts` files. Each file is loaded as a module and its exported plugin
 * functions are registered.
 *
 * See: plugins/deep-dev/deep-dev.ts
 */
export { DeepDevPlugin } from "./deep-dev/deep-dev"
