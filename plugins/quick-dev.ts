/**
 * Barrel entry — re-exports the Quick-Dev plugin from the subdirectory.
 *
 * OpenCode auto-discovers plugins by scanning the `plugins/` root directory
 * for `.ts` files. Each file is loaded as a module and its exported plugin
 * functions are registered.
 *
 * See: plugins/quick-dev/quick-dev.ts
 */
export { QuickDevPlugin } from "./quick-dev/quick-dev"
