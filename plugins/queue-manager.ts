/// <reference types="bun" />
import type {
  TuiPlugin,
  TuiPluginApi,
  TuiPluginModule,
} from "@opencode-ai/plugin/tui"
import type { Message, Part } from "@opencode-ai/sdk/v2"

/**
 * Queue Manager — TUI dialog-based management of queued user messages.
 *
 * When you submit prompts while the session is busy, OpenCode persists them
 * immediately as user messages (the TUI renders a QUEUED badge on them) and
 * the processing loop works through them afterwards. Messages that never get
 * answered (e.g. after an interrupt) stay stranded the same way. This plugin
 * gives that pile a management UI.
 *
 * Registered via `tui.json` → `plugin` array (TUI plugins have no directory
 * auto-discovery — they must be listed there).
 *
 * Entry points:
 *   /queued                — slash command (opens the manager)
 *   command palette (ctrl+p) — "Manage queued messages"
 *
 * The "queue" = every user message of the current session that has no
 * assistant reply yet, minus internal/feedback messages (compaction, subtask,
 * and messages whose text parts are all `ignored`).
 *
 * Flow (each step is a host dialog):
 *   1. DialogSelect — queued messages (preview + age), plus bulk actions
 *   2. per message: DialogSelect — Edit text / Cancel message / View full text
 *
 * Operations and their server-side mechanics:
 *   - Edit   → PATCH part (updatePart has no busy-assert); the processing
 *              loop re-reads messages from storage every step, so an edit
 *              takes effect whenever that message's turn arrives.
 *   - Cancel → DELETE message when the session is idle (clean removal).
 *              While busy, message deletion is rejected (409 SessionBusy);
 *              the fallback strips the message: first text part becomes a
 *              tombstone note, remaining text parts are emptied, non-text
 *              parts (attachments) are deleted — deletePart/updatePart have
 *              no busy-assert either. The stripped message stays visible in
 *              the transcript but contributes no instructions; if the loop
 *              still reaches it, the model only sees the tombstone.
 *
 * Note: this is a TUI-only module — a single module cannot export both
 * `server` and `tui`. It only runs inside the TUI; headless sessions have
 * no /queued equivalent.
 */

const PLUGIN_ID = "opencode-config.queue-manager"
const SLASH_NAME = "queued"
const PREVIEW_MAX = 90
// Shown to both the user (transcript) and the model when the processing
// loop still reaches a busy-cancelled message — keep it harmless. Messages
// carrying this note are filtered out of the queue list (isCancelled).
const TOMBSTONE =
  "[This queued message was cancelled via /queued — take no action and reply briefly.]"

// ─── Types ───────────────────────────────────────────────────────────

export interface WithParts {
  info: Message
  parts: Part[]
}

export interface QueuedEntry {
  messageID: string
  created: number
  preview: string
  /** Concatenated non-ignored text parts ("" for attachment-only messages). */
  text: string
  textParts: Array<Part & { type: "text" }>
  nonTextParts: Array<Part>
}

// ─── Pure helpers (unit-testable) ────────────────────────────────────

function isTextPart(part: Part): part is Part & { type: "text" } {
  return part.type === "text"
}

/** Join non-ignored text parts of a user message. */
export function visibleText(parts: Part[]): string {
  return parts
    .filter(isTextPart)
    .filter((part) => !part.ignored)
    .map((part) => part.text)
    .join("\n")
    .trim()
}

/** Single-line truncated preview for dialog options. */
export function preview(text: string, max = PREVIEW_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (!flat) return "[attachment only — no text]"
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat
}

/**
 * The queue: user messages without an assistant reply, minus internal
 * (compaction/subtask) messages, messages whose text parts are all
 * ignored (plugin feedback), and messages already cancelled via the
 * busy-strip fallback (tombstone note).
 */
export function computeQueued(messages: WithParts[]): QueuedEntry[] {
  const replied = new Set(
    messages
      .filter((m): m is { info: Extract<Message, { role: "assistant" }>; parts: Part[] } => m.info.role === "assistant")
      .map((m) => m.info.parentID),
  )

  const entries: QueuedEntry[] = []
  for (const msg of messages) {
    const info = msg.info
    if (info.role !== "user") continue
    if (replied.has(info.id)) continue
    if (msg.parts.some((p) => p.type === "compaction" || p.type === "subtask")) continue

    const textParts = msg.parts.filter(isTextPart)
    // All text parts ignored → plugin feedback message.
    if (textParts.length > 0 && textParts.every((p) => p.ignored)) continue
    // Tombstone note → already cancelled via the busy-strip fallback.
    if (isCancelled(msg.parts)) continue

    const text = visibleText(msg.parts)
    entries.push({
      messageID: info.id,
      created: info.time.created,
      preview: preview(text),
      text,
      textParts,
      nonTextParts: msg.parts.filter((p) => !isTextPart(p)),
    })
  }
  return entries.sort((a, b) => a.created - b.created)
}

/** True when a message carries the busy-cancel tombstone note. */
export function isCancelled(parts: Part[]): boolean {
  return parts.some((p) => isTextPart(p) && p.text.startsWith(TOMBSTONE))
}

/** Human-friendly age for dialog descriptions. */
export function age(created: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - created) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return `${h}h ago`
}

// ─── SDK plumbing ────────────────────────────────────────────────────

type SdkResult = { data?: unknown; error?: unknown; response: { ok: boolean; status: number } }

async function fetchMessages(api: TuiPluginApi, sessionID: string): Promise<WithParts[] | undefined> {
  try {
    const res = (await api.client.session.messages({ sessionID })) as SdkResult
    if (!res.response.ok) {
      toast(api, `Failed to load messages (HTTP ${res.response.status}).`, "error")
      return undefined
    }
    return res.data as WithParts[]
  } catch (err) {
    toast(api, `Failed to load messages: ${(err as Error).message}`, "error")
    return undefined
  }
}

function isBusy(api: TuiPluginApi, sessionID: string): boolean {
  const status = api.state.session.status(sessionID)
  return status !== undefined && status.type !== "idle"
}

function toast(
  api: TuiPluginApi,
  message: string,
  variant: "info" | "success" | "warning" | "error" = "info",
) {
  api.ui.toast({ title: "Queue manager", message, variant })
}

// ─── Actions ─────────────────────────────────────────────────────────

async function cancelEntry(api: TuiPluginApi, sessionID: string, entry: QueuedEntry): Promise<boolean> {
  // Clean removal when the session is not busy.
  try {
    const res = (await api.client.session.deleteMessage({
      sessionID,
      messageID: entry.messageID,
    })) as SdkResult
    if (res.response.ok) return true
    if (res.response.status !== 409) {
      toast(api, `Delete failed (HTTP ${res.response.status}).`, "error")
      return false
    }
  } catch (err) {
    toast(api, `Delete failed: ${(err as Error).message}`, "error")
    return false
  }

  // Busy fallback: strip the message (updatePart/deletePart have no
  // busy-assert). Tombstone first text part, empty the rest, drop
  // attachments. Attachment-only messages cannot be stripped safely
  // (the SDK has no part-create; an empty message risks an empty LLM
  // call) — refuse and ask the user to retry when idle.
  if (entry.textParts.length === 0) {
    toast(
      api,
      "Session busy — attachment-only messages can't be stripped safely. Wait for idle, then cancel again.",
      "warning",
    )
    return false
  }
  try {
    for (let i = 0; i < entry.textParts.length; i++) {
      const part = entry.textParts[i]
      await api.client.part.update({
        sessionID,
        messageID: entry.messageID,
        partID: part.id,
        part: { ...part, text: i === 0 ? TOMBSTONE : "", ignored: false },
      })
    }
    for (const part of entry.nonTextParts) {
      await api.client.part.delete({
        sessionID,
        messageID: entry.messageID,
        partID: part.id,
      })
    }
    toast(
      api,
      "Session busy — message content stripped (tombstone kept). It will not send instructions.",
      "warning",
    )
    return true
  } catch (err) {
    toast(api, `Busy-strip failed: ${(err as Error).message}`, "error")
    return false
  }
}

function editEntry(api: TuiPluginApi, sessionID: string, entry: QueuedEntry): void {
  if (entry.textParts.length === 0) {
    toast(api, "This message has no editable text parts.", "warning")
    openEntryMenu(api, sessionID)
    return
  }

  api.ui.dialog.replace(() =>
    api.ui.DialogPrompt({
      title: "Edit queued message",
      placeholder: "New text for this queued message (replaces all text parts)",
      value: entry.text,
      onConfirm: async (value) => {
        const text = value.trim()
        if (!text) {
          toast(api, "Empty text — use Cancel instead.", "error")
          editEntry(api, sessionID, entry)
          return
        }
        if (text === entry.text) {
          toast(api, "Unchanged.", "info")
          openQueueList(api, sessionID)
          return
        }
        try {
          const [first, ...rest] = entry.textParts
          await api.client.part.update({
            sessionID,
            messageID: entry.messageID,
            partID: first.id,
            part: { ...first, text, ignored: false },
          })
          for (const part of rest) {
            await api.client.part.delete({
              sessionID,
              messageID: entry.messageID,
              partID: part.id,
            })
          }
          toast(
            api,
            "Edit saved — takes effect when this message's turn arrives.",
            "success",
          )
        } catch (err) {
          toast(api, `Edit failed: ${(err as Error).message}`, "error")
        }
        openQueueList(api, sessionID)
      },
      onCancel: () => openEntryMenu(api, sessionID),
    }),
  )
}

function confirmCancel(api: TuiPluginApi, sessionID: string, entry: QueuedEntry): void {
  const busy = isBusy(api, sessionID)
  api.ui.dialog.replace(() =>
    api.ui.DialogConfirm({
      title: "Cancel queued message",
      message: busy
        ? `Cancel this queued message?\n\n"${entry.preview}"\n\nThe session is BUSY: the message cannot be deleted right now — its content will be stripped (tombstone kept) instead.`
        : `Cancel this queued message?\n\n"${entry.preview}"\n\nThe session is idle: the message will be deleted permanently.`,
      onConfirm: async () => {
        await cancelEntry(api, sessionID, entry)
        openQueueList(api, sessionID)
      },
      onCancel: () => openEntryMenu(api, sessionID),
    }),
  )
}

function viewEntry(api: TuiPluginApi, sessionID: string, entry: QueuedEntry): void {
  api.ui.dialog.replace(() =>
    api.ui.DialogAlert({
      title: "Queued message — full text",
      message: entry.text || "(no text — attachments only)",
      onConfirm: () => openEntryMenu(api, sessionID),
    }),
  )
}

// ─── Dialog flow ─────────────────────────────────────────────────────

let currentEntry: QueuedEntry | undefined

function openEntryMenu(api: TuiPluginApi, sessionID: string): void {
  const entry = currentEntry
  if (!entry) {
    openQueueList(api, sessionID)
    return
  }
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: `Queued message (${age(entry.created)})`,
      placeholder: entry.preview,
      options: [
        ...(entry.textParts.length > 0
          ? [
              {
                title: "( Edit text… )",
                value: "edit",
                description: "Rewrite this message before it is processed",
              },
            ]
          : []),
        {
          title: "( Cancel message )",
          value: "cancel",
          description: isBusy(api, sessionID)
            ? "Busy: strip content, keep tombstone"
            : "Idle: delete the message permanently",
        },
        {
          title: "( View full text )",
          value: "view",
          description: "Show the complete message text",
        },
        {
          title: "( ← Back to queue )",
          value: "back",
          description: undefined,
        },
      ],
      onSelect: (option) => {
        switch (option.value) {
          case "edit":
            editEntry(api, sessionID, entry)
            break
          case "cancel":
            confirmCancel(api, sessionID, entry)
            break
          case "view":
            viewEntry(api, sessionID, entry)
            break
          default:
            openQueueList(api, sessionID)
        }
      },
    }),
  )
}

async function openQueueList(api: TuiPluginApi, sessionID: string): Promise<void> {
  currentEntry = undefined
  const messages = await fetchMessages(api, sessionID)
  if (!messages) {
    api.ui.dialog.clear()
    return
  }

  const entries = computeQueued(messages)
  if (entries.length === 0) {
    api.ui.dialog.clear()
    toast(api, "No queued messages in this session.", "info")
    return
  }

  const busy = isBusy(api, sessionID)
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: `Message queue — ${entries.length} queued${busy ? " (session busy)" : " (session idle)"}`,
      placeholder: "Pick a queued message to edit or cancel (Esc closes)",
      options: [
        ...(entries.length > 1
          ? [
              {
                title: "( Cancel ALL queued messages )",
                value: "__cancel_all__",
                description: `Strip/delete all ${entries.length} queued messages`,
              },
            ]
          : []),
        ...entries.map((entry, i) => ({
          title: `#${i + 1} ${entry.preview}`,
          value: entry.messageID,
          description: `${age(entry.created)} · ${entry.textParts.length} text part(s)${
            entry.nonTextParts.length ? ` · ${entry.nonTextParts.length} attachment(s)` : ""
          }`,
        })),
      ],
      onSelect: async (option) => {
        if (option.value === "__cancel_all__") {
          confirmCancelAll(api, sessionID, entries)
          return
        }
        currentEntry = entries.find((e) => e.messageID === option.value)
        openEntryMenu(api, sessionID)
      },
    }),
  )
}

function confirmCancelAll(api: TuiPluginApi, sessionID: string, entries: QueuedEntry[]): void {
  const busy = isBusy(api, sessionID)
  api.ui.dialog.replace(() =>
    api.ui.DialogConfirm({
      title: "Cancel ALL queued messages",
      message: busy
        ? `Strip all ${entries.length} queued messages? The session is BUSY — contents are replaced with tombstones (messages stay visible but send no instructions).`
        : `Delete all ${entries.length} queued messages permanently?`,
      onConfirm: async () => {
        let ok = 0
        for (const entry of entries) {
          if (await cancelEntry(api, sessionID, entry)) ok++
        }
        toast(api, `Cancelled ${ok}/${entries.length} queued messages.`, ok === entries.length ? "success" : "warning")
        api.ui.dialog.clear()
      },
      onCancel: () => {
        void openQueueList(api, sessionID)
      },
    }),
  )
}

// ─── Plugin entry ────────────────────────────────────────────────────

const tui: TuiPlugin = async (api) => {
  api.keymap.registerLayer({
    commands: [
      {
        name: "queue.manager",
        title: "Manage queued messages",
        desc: "List, edit or cancel user messages queued while the session is busy",
        category: "Session",
        namespace: "palette",
        slashName: SLASH_NAME,
        run() {
          const route = api.route.current
          if (route.name !== "session") {
            toast(api, "Open a session first — the queue is per-session.", "warning")
            return
          }
          const sessionID = (route.params as { sessionID?: string } | undefined)?.sessionID
          if (!sessionID) {
            toast(api, "No current session.", "error")
            return
          }
          void openQueueList(api, sessionID)
        },
      },
    ],
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: PLUGIN_ID,
  tui,
}

export default plugin
