/**
 * Barrel entry — re-exports the project-manager plugin from the subdirectory.
 *
 * OpenCode auto-discovers plugins by scanning the `plugins/` root directory
 * for `.ts` files. Each file is loaded as a module and its exported plugin
 * functions are registered. This thin file ensures OpenCode picks it up.
 *
 * See: plugins/project-manager/project-manager.ts
 */
export { ProjectManagerPlugin } from "./project-manager/project-manager"
