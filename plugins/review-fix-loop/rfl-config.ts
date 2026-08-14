/**
 * Shared review-fix-loop config — command name + session arming.
 *
 * The system-transform hook checks the armed Set to decide whether
 * to inject the protocol (only when the user ran /review-fix-loop).
 */

export const COMMAND_NAME = "review-fix-loop"

const armedSessions = new Set<string>()

export function armSession(sessionID: string): void {
  armedSessions.add(sessionID)
}

export function isSessionArmed(sessionID: string): boolean {
  return armedSessions.has(sessionID)
}

export function disarmSession(sessionID: string): void {
  armedSessions.delete(sessionID)
}
