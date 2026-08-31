/**
 * Barrel entry — re-exports the Lite-Mode plugin from the subdirectory.
 *
 * OpenCode auto-discovers plugins by scanning the `plugins/` root directory
 * for `.ts` files. Each file is loaded as a module and its exported plugin
 * functions are registered.
 *
 * See: plugins/lite-mode/lite-mode.ts
 */
export { LiteModePlugin, stripLiteOverhead, isInstructionPath, SENTINEL } from "./lite-mode/lite-mode"
