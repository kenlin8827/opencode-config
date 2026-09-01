/**
 * Barrel entry — re-exports the Lite-Mode plugin from the subdirectory.
 *
 * OpenCode auto-discovers plugins by scanning the `plugins/` root directory
 * for `.ts` files. Each file is loaded as a module and its exported plugin
 * functions are registered.
 *
 * MUST export plugin functions ONLY: opencode's legacy plugin loader
 * (getLegacyPlugins, v1.18.25) throws "Plugin export is not a function" and
 * drops the ENTIRE file if any export is not a function — re-exporting a
 * constant (e.g. the lite sentinel string) here silently disabled the plugin.
 * Tests and other modules import helpers from the submodule path directly.
 *
 * See: plugins/lite-mode/lite-mode.ts
 */
export { LiteModePlugin } from "./lite-mode/lite-mode"
