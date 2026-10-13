// Tool-output formatting shared by noninteractive run and ACP.
import os from "os"
import type { SessionMessageAssistantTool } from "@opencode/client/promise"
import { Locale } from "./locale"
import {
  canonicalToolName,
  finiteNumber,
  primitiveInputSummary,
  toolDisplayContent,
  toolDisplayMetadata,
  webSearchProviderLabel,
} from "./tool-display"
import { formatPath } from "./path-format"
import { isRecord } from "./record"

type ToolDict = Record<string, unknown>

type PatchFile = {
  status?: string
  file?: string
  from?: string
  patch?: string
  deletions?: number
}

type ToolInput = ToolDict & {
  id?: string
  path?: string
  pattern?: string
  url?: string
  query?: string
  agent?: string
  description?: string
  operation?: string
  line?: number
  character?: number
  command?: string
}

type ToolMetadata = ToolDict & {
  name?: string
  count?: number
  matches?: number
  diff?: string
  provider?: unknown
  files?: PatchFile[]
}

type ToolFrame = {
  directory?: string
  name: string
  input: ToolDict
  meta: ToolDict
  status: string
  output: string
}

type ToolInline = {
  icon: string
  title: string
  description?: string
  mode?: "inline" | "block"
  body?: string
}

type ToolProps = {
  input: ToolInput
  metadata: ToolMetadata
  frame: ToolFrame
}

function dict(v: unknown): ToolDict {
  return isRecord(v) ? { ...v } : {}
}

function text(v: unknown): string {
  return typeof v === "string" ? v : ""
}

export function toolOutputText(name: string, content: ReadonlyArray<{ type: string; text?: string }> | undefined) {
  if (!content) return ""
  // V2 shell content appends model-only status after the user-visible command output.
  if (canonicalToolName(name) === "shell") return content.find((item) => item.type === "text")?.text ?? ""
  const joined = content.flatMap((item) => (item.type === "text" && item.text ? [item.text] : [])).join("\n")
  if (canonicalToolName(name) === "read") return readDisplayText(joined) ?? joined
  return joined
}

/** Read's model content is a JSON page envelope; unwrap the human-facing text. */
export function readDisplayText(text: string): string | undefined {
  if (!text.startsWith("{")) return undefined
  const parsed = (() => {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return undefined
    }
  })()
  const envelope = dict(parsed)
  if (typeof envelope.content === "string" && (envelope.type === "text-page" || envelope.encoding === "utf8"))
    return envelope.content
  if (!Array.isArray(envelope.entries)) return undefined
  return envelope.entries
    .flatMap((entry): string[] => {
      if (typeof entry === "string") return [entry]
      const path = dict(entry).path
      return typeof path === "string" ? [path] : []
    })
    .join("\n")
}

function normalizeInput(name: string, value: unknown) {
  const input = dict(value)
  const path = typeof input.path === "string" ? input.path : text(input.filePath)
  const agent = typeof input.agent === "string" ? input.agent : text(input.subagent_type)
  return {
    ...input,
    ...(["read", "write", "edit", "lsp"].includes(name) && path ? { path } : {}),
    ...(name === "subagent" && agent ? { agent } : {}),
  }
}

function normalizeFile(value: unknown): PatchFile | undefined {
  const file = dict(value)
  const name = text(file.file) || text(file.relativePath) || text(file.filePath)
  if (!name) return
  const legacy = text(file.type)
  const status =
    text(file.status) ||
    (legacy === "add"
      ? "added"
      : legacy === "delete"
        ? "deleted"
        : legacy === "update"
          ? "modified"
          : legacy === "move"
            ? "moved"
            : legacy)
  const patch = typeof file.patch === "string" ? file.patch : undefined
  const deletions = finiteNumber(file.deletions)
  return {
    ...file,
    file: name,
    ...(status === "moved" && text(file.filePath) ? { from: text(file.filePath) } : {}),
    ...(status ? { status } : {}),
    ...(patch === undefined ? {} : { patch }),
    ...(deletions === undefined ? {} : { deletions }),
  }
}

function normalizeMetadata(name: string, value: unknown) {
  const metadata = dict(value)
  const files = list(metadata.files).flatMap((item) => {
    const file = normalizeFile(item)
    return file ? [file] : []
  })
  const sessionID = text(metadata.sessionID) || text(metadata.sessionId)
  return {
    ...metadata,
    ...(["edit", "patch"].includes(name) && Array.isArray(metadata.files) ? { files } : {}),
    ...(name === "subagent" && sessionID ? { sessionID } : {}),
  }
}

export function normalizeTool(tool: SessionMessageAssistantTool): SessionMessageAssistantTool {
  const name = canonicalToolName(tool.name)
  if (tool.state.status === "streaming") return { ...tool, name }
  return {
    ...tool,
    name,
    state: {
      ...tool.state,
      input: normalizeInput(name, tool.state.input),
      metadata: normalizeMetadata(name, toolDisplayMetadata(tool.state)),
    },
  } as SessionMessageAssistantTool
}

function list<T>(v: unknown): T[] {
  if (!Array.isArray(v)) return []
  return v
}

export function toolPath(input?: string, opts: { home?: boolean; directory?: string } = {}): string {
  return formatPath(input, {
    base: opts.directory ?? process.cwd(),
    home: opts.home ? os.homedir() : undefined,
    forwardSlashes: true,
  })
}

function displayPath(p: ToolProps, input?: string) {
  return toolPath(input, { directory: p.frame.directory })
}

function fallbackInline(ctx: ToolFrame): ToolInline {
  const title = Object.keys(ctx.input).length > 0 ? JSON.stringify(ctx.input) : "Unknown"
  return { icon: "⚙", title: `${ctx.name} ${title}` }
}

function count(n: number, label: string): string {
  return `${n} ${label}${n === 1 ? "" : "es"}`
}

function runGlob(p: ToolProps): ToolInline {
  const root = p.input.path ?? ""
  const title = `Glob "${p.input.pattern ?? ""}"`
  const suffix = root ? `in ${displayPath(p, root)}` : ""
  const matches = p.metadata.count
  const description = matches === undefined ? suffix : `${suffix}${suffix ? " · " : ""}${count(matches, "match")}`
  return { icon: "✱", title, ...(description && { description }) }
}

function runGrep(p: ToolProps): ToolInline {
  const root = p.input.path ?? ""
  const title = `Grep "${p.input.pattern ?? ""}"`
  const suffix = root ? `in ${displayPath(p, root)}` : ""
  const matches = p.metadata.matches
  const description = matches === undefined ? suffix : `${suffix}${suffix ? " · " : ""}${count(matches, "match")}`
  return { icon: "✱", title, ...(description && { description }) }
}

function runList(p: ToolProps): ToolInline {
  const dir = text(dict(p.input).path)
  return { icon: "→", title: dir ? `List ${displayPath(p, dir)}` : "List" }
}

function runRead(p: ToolProps): ToolInline {
  const file = displayPath(p, p.input.path)
  const description = primitiveInputSummary(p.frame.input, ["path"]) || undefined
  return { icon: "→", title: `Read ${file}`, ...(description && { description }) }
}

function runWrite(p: ToolProps): ToolInline {
  return {
    icon: "←",
    title: `Write ${displayPath(p, p.input.path)}`,
    mode: "block",
    body: p.frame.status === "completed" ? p.frame.output : undefined,
  }
}

function runWebfetch(p: ToolProps): ToolInline {
  const url = p.input.url ?? ""
  return { icon: "%", title: url ? `WebFetch ${url}` : "WebFetch" }
}

function runEdit(p: ToolProps): ToolInline {
  const file = list<PatchFile>(p.metadata.files)[0]
  return {
    icon: "←",
    title: `Edit ${displayPath(p, p.input.path)}`,
    mode: "block",
    body: file?.patch ?? p.metadata.diff,
  }
}

function runWebSearch(p: ToolProps): ToolInline {
  const title = webSearchProviderLabel(p.metadata.provider)
  return { icon: "◈", title: p.input.query ? `${title} "${p.input.query}"` : title }
}

function runTask(p: ToolProps): ToolInline {
  const kind = Locale.titlecase(p.input.agent || "unknown")
  const desc = p.input.description
  const icon = p.frame.status === "error" ? "✗" : p.frame.status === "running" ? "•" : "✓"
  return { icon, title: desc || `${kind} Subagent`, description: desc ? `${kind} Agent` : undefined }
}

function runSkill(p: ToolProps): ToolInline {
  const name = p.metadata.name ?? p.input.id ?? ""
  return { icon: "→", title: `Skill "${name}"` }
}

function runPatch(p: ToolProps): ToolInline {
  const files = p.metadata.files?.length ?? 0
  if (files === 0) return { icon: "%", title: "Patch" }
  return { icon: "%", title: `Patch ${files} file${files === 1 ? "" : "s"}` }
}

function runQuestion(p: ToolProps): ToolInline {
  const total = list(p.frame.input.questions).length
  return { icon: "→", title: `Asked ${total} question${total === 1 ? "" : "s"}` }
}

function runInvalid(p: ToolProps): ToolInline {
  return {
    icon: "✗",
    title: "Invalid Tool",
    mode: "block",
    body: p.frame.status === "completed" ? p.frame.output : undefined,
  }
}

function runBatch(p: ToolProps): ToolInline {
  const calls = list(dict(p.input).tool_calls).length
  return {
    icon: "#",
    title: calls > 0 ? `Batch ${calls} tool${calls === 1 ? "" : "s"}` : "Batch",
    mode: "block",
    body: p.frame.status === "completed" ? p.frame.output : undefined,
  }
}

function runLsp(p: ToolProps): ToolInline {
  const op = p.input.operation || "request"
  const file = p.input.path ? toolPath(p.input.path, { directory: p.frame.directory }) : ""
  const line = typeof p.input.line === "number" ? p.input.line : undefined
  const char = typeof p.input.character === "number" ? p.input.character : undefined
  const pos = line !== undefined && char !== undefined ? `:${line}:${char}` : ""
  return { icon: "→", title: file ? `LSP ${op} ${file}${pos}` : `LSP ${op}` }
}

function frame(part: SessionMessageAssistantTool, directory?: string): ToolFrame {
  const tool = normalizeTool(part)
  if (tool.state.status === "streaming")
    return { directory, name: tool.name, input: {}, meta: {}, status: tool.state.status, output: "" }
  return {
    directory,
    name: tool.name,
    input: tool.state.input,
    meta: tool.state.metadata ?? {},
    status: tool.state.status,
    output: toolOutputText(tool.name, toolDisplayContent(tool.state)),
  }
}

function runShell(p: ToolProps): ToolInline {
  return {
    icon: "$",
    title: p.input.command || "",
    mode: "block",
    body: p.frame.status === "completed" ? p.frame.output.trim() : undefined,
  }
}

export function toolInlineInfo(part: SessionMessageAssistantTool, directory?: string): ToolInline {
  const ctx = frame(part, directory)
  const draw = Object.hasOwn(TOOL_RULES, ctx.name) ? TOOL_RULES[ctx.name as keyof typeof TOOL_RULES] : undefined
  try {
    if (draw) return draw({ input: ctx.input, metadata: ctx.meta, frame: ctx })
  } catch {
    return fallbackInline(ctx)
  }
  return fallbackInline(ctx)
}

const TOOL_RULES = {
  invalid: runInvalid,
  shell: runShell,
  write: runWrite,
  edit: runEdit,
  patch: runPatch,
  batch: runBatch,
  subagent: runTask,
  question: runQuestion,
  read: runRead,
  glob: runGlob,
  grep: runGrep,
  list: runList,
  lsp: runLsp,
  webfetch: runWebfetch,
  websearch: runWebSearch,
  skill: runSkill,
}
