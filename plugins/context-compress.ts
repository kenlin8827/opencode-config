/**
 * Barrel entry — re-exports the Context-Compress plugin from the subdirectory.
 *
 * OpenCode auto-discovers plugins by scanning the `plugins/` root directory
 * for `.ts` files. Each file is loaded as a module and its exported plugin
 * functions are registered.
 *
 * MUST export plugin functions ONLY: opencode's legacy plugin loader
 * (getLegacyPlugins, v1.18.25) throws "Plugin export is not a function" and
 * drops the ENTIRE file if any export is not a function. Tests and other
 * modules import helpers from the submodule path directly.
 *
 * See: plugins/context-compress/context-compress.ts
 */
export { ContextCompressPlugin } from "./context-compress/context-compress"
