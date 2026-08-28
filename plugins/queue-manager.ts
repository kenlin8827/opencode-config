/// <reference types="bun" />
import type {
  TuiPlugin,
  TuiPluginApi,
  TuiPluginModule,
} from "@opencode-ai/plugin/tui"
import type { Message, Part } from "@opencode-ai/sdk/v2"
import { tr, initI18n, languageOption, toggleLocale, localeName, SWITCH_LANG, withBookends } from "./i18n"

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

const PLUGIN_ID = "opencode-prime.queue-manager"
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
  if (!flat) return tr("queue.attachmentOnly")
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
      toast(api, tr("queue.loadMessagesFailed", { status: res.response.status }), "error")
      return undefined
    }
    return res.data as WithParts[]
  } catch (err) {
    toast(api, tr("queue.loadMessagesError", { err: (err as Error).message }), "error")
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
  api.ui.toast({ title: tr("queue.toastTitle"), message, variant })
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
      toast(api, tr("queue.deleteFailedHttp", { status: res.response.status }), "error")
      return false
    }
  } catch (err) {
    toast(api, tr("queue.deleteFailed", { err: (err as Error).message }), "error")
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
      tr("queue.busyStripWarning"),
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
      tr("queue.busyStripResult"),
      "warning",
    )
    return true
  } catch (err) {
    toast(api, tr("queue.busyStripFailed", { err: (err as Error).message }), "error")
    return false
  }
}

function editEntry(api: TuiPluginApi, sessionID: string, entry: QueuedEntry): void {
  if (entry.textParts.length === 0) {
    toast(api, tr("queue.noTextParts"), "warning")
    openEntryMenu(api, sessionID)
    return
  }

  api.ui.dialog.replace(() =>
    api.ui.DialogPrompt({
      title: tr("queue.editTitle"),
      placeholder: tr("queue.editPlaceholder"),
      value: entry.text,
      onConfirm: async (value) => {
        const text = value.trim()
        if (!text) {
          toast(api, tr("queue.emptyText"), "error")
          editEntry(api, sessionID, entry)
          return
        }
        if (text === entry.text) {
          toast(api, tr("queue.unchanged"), "info")
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
            tr("queue.editSaved"),
            "success",
          )
        } catch (err) {
          toast(api, tr("queue.editFailed", { err: (err as Error).message }), "error")
        }
        openQueueList(api, sessionID)
      },
      onCancel: () => setTimeout(() => openEntryMenu(api, sessionID), 0),
    }),
  )
}

function confirmCancel(api: TuiPluginApi, sessionID: string, entry: QueuedEntry): void {
  const busy = isBusy(api, sessionID)
  api.ui.dialog.replace(() =>
    api.ui.DialogConfirm({
      title: tr("queue.cancelTitle"),
      message: busy
        ? tr("queue.confirmCancelBusy", { preview: entry.preview })
        : tr("queue.confirmCancelIdle", { preview: entry.preview }),
      onConfirm: async () => {
        await cancelEntry(api, sessionID, entry)
        openQueueList(api, sessionID)
      },
      onCancel: () => setTimeout(() => openEntryMenu(api, sessionID), 0),
    }),
  )
}

function viewEntry(api: TuiPluginApi, sessionID: string, entry: QueuedEntry): void {
  api.ui.dialog.replace(() =>
    api.ui.DialogAlert({
      title: tr("queue.fullTextTitle"),
      message: entry.text || tr("queue.noTextAttachmentsOnly"),
      onConfirm: () => setTimeout(() => openEntryMenu(api, sessionID), 0),
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
  let navigated = false
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: tr("queue.entryTitle", { age: age(entry.created) }),
      placeholder: entry.preview,
      options: [
        ...(entry.textParts.length > 0
          ? [
              {
                title: tr("queue.editAction"),
                value: "edit",
                description: tr("queue.editActionDesc"),
              },
            ]
          : []),
        {
          title: tr("queue.cancelAction"),
          value: "cancel",
          description: isBusy(api, sessionID)
            ? tr("queue.sessionBusy")
            : tr("queue.sessionIdle"),
        },
        {
          title: tr("queue.viewAction"),
          value: "view",
          description: tr("queue.viewActionDesc"),
        },
        {
          title: tr("queue.backToQueue"),
          value: "back",
          description: undefined,
        },
      ],
      onSelect: (option) => {
        navigated = true
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
    () => {
      if (!navigated) setTimeout(() => void openQueueList(api, sessionID), 0)
    },
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
    toast(api, tr("queue.noQueuedMessages"), "info")
    return
  }

  const busy = isBusy(api, sessionID)
  let navigated = false
  api.ui.dialog.replace(() =>
    api.ui.DialogSelect<string>({
      title: tr("queue.listTitle", { count: entries.length, busy: busy ? tr("queue.sessionBusy") : tr("queue.sessionIdle") }),
      placeholder: tr("queue.listPlaceholder"),
      options: [
        ...withBookends(
          entries.map((entry, i) => ({
            title: `#${i + 1} ${entry.preview}`,
            value: entry.messageID,
            description: `${age(entry.created)} · ${tr("queue.textPartCount", { count: entry.textParts.length })}${
              entry.nonTextParts.length ? ` · ${tr("queue.attachmentCount", { count: entry.nonTextParts.length })}` : ""
            }`,
          })),
          entries.length > 1
            ? [
                {
                  title: tr("queue.cancelAll"),
                  value: "__cancel_all__",
                  description: tr("queue.stripAllCount", { count: entries.length }),
                },
              ]
            : [],
        ),
        languageOption(api),
      ],
      onSelect: async (option) => {
        navigated = true
        if (option.value === SWITCH_LANG) {
          const next = toggleLocale(api)
          toast(api, tr("common.langSwitched", { lang: localeName(next) }), "info")
          void openQueueList(api, sessionID)
          return
        }
        if (option.value === "__cancel_all__") {
          confirmCancelAll(api, sessionID, entries)
          return
        }
        currentEntry = entries.find((e) => e.messageID === option.value)
        openEntryMenu(api, sessionID)
      },
    }),
    () => {
      // Esc on queue list = close
      if (!navigated) api.ui.dialog.clear()
    },
  )
}

function confirmCancelAll(api: TuiPluginApi, sessionID: string, entries: QueuedEntry[]): void {
  const busy = isBusy(api, sessionID)
  api.ui.dialog.replace(() =>
    api.ui.DialogConfirm({
      title: tr("queue.cancelAllTitle"),
      message: busy
        ? tr("queue.confirmCancelAllBusy", { count: entries.length })
        : tr("queue.confirmCancelAllIdle", { count: entries.length }),
      onConfirm: async () => {
        let ok = 0
        for (const entry of entries) {
          if (await cancelEntry(api, sessionID, entry)) ok++
        }
        toast(api, tr("queue.cancelResult", { ok, total: entries.length }), ok === entries.length ? "success" : "warning")
        api.ui.dialog.clear()
      },
      onCancel: () => {
        setTimeout(() => void openQueueList(api, sessionID), 0)
      },
    }),
  )
}

// ─── Plugin entry ────────────────────────────────────────────────────

const tui: TuiPlugin = async (api) => {
  initI18n(api)
  api.keymap.registerLayer({
    commands: [
      {
        name: "queue.manager",
        title: tr("queue.cmdTitle"),
        desc: tr("queue.cmdDesc"),
        category: "Session",
        namespace: "palette",
        slashName: SLASH_NAME,
        run() {
          const route = api.route.current
          if (route.name !== "session") {
            toast(api, tr("queue.openSessionFirst"), "warning")
            return
          }
          const sessionID = (route.params as { sessionID?: string } | undefined)?.sessionID
          if (!sessionID) {
            toast(api, tr("queue.noCurrentSession"), "error")
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
