/**
 * Zero-dependency ANSI color helpers for installer console output.
 *
 * Each wrapper is a no-op when stdout is not a TTY (piped / redirected to a
 * file) so log captures stay clean. Callers decide the level at the call site
 * — this module only maps level → escape sequence.
 *
 * Usage:
 *   import { colorize } from './color';
 *   console.log(colorize.green('✓ all good'));
 *   console.warn(colorize.yellow('⚠ check this'));
 */

const ESC = '\x1b[';
const RESET = `${ESC}0m`;

/** True when the process can emit ANSI sequences (interactive terminal). */
const ansiEnabled = (): boolean =>
  process.stdout.isTTY === true && process.env.NO_COLOR === undefined;

export const colorize = {
  green: (s: string) => (ansiEnabled() ? `${ESC}32m${s}${RESET}` : s),
  yellow: (s: string) => (ansiEnabled() ? `${ESC}33m${s}${RESET}` : s),
  red: (s: string) => (ansiEnabled() ? `${ESC}31m${s}${RESET}` : s),
  gray: (s: string) => (ansiEnabled() ? `${ESC}90m${s}${RESET}` : s),
  cyan: (s: string) => (ansiEnabled() ? `${ESC}36m${s}${RESET}` : s),
};
