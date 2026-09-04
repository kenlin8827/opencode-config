/**
 * Barrel entry — re-exports the Context-Watch plugin from the subdirectory.
 *
 * OpenCode auto-discovers plugins by scanning the `plugins/` root
 * directory for `.ts` files. Each file is loaded as a module and its
 * exported plugin functions are registered.
 *
 * MUST export plugin functions ONLY: opencode's legacy plugin loader
 * throws "Plugin export is not a function" and drops the ENTIRE file if
 * any export is not a function. See the lite-mode barrel for the long-form
 * rationale.
 */
export { ContextWatchPlugin } from "./context-watch/context-watch"
