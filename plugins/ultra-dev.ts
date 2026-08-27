/**
 * Barrel entry — re-exports the Ultra-Dev plugin from the subdirectory.
 *
 * OpenCode auto-discovers plugins by scanning the `plugins/` root directory
 * for `.ts` files. Each file is loaded as a module and its exported plugin
 * functions are registered.
 *
 * See: plugins/ultra-dev/ultra-dev.ts
 */
export { UltraDevPlugin } from "./ultra-dev/ultra-dev"
