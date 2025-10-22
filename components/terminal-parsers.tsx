"use client"

import type React from "react"

// Minimal payload shape we expect from SSE/commands API
export type CommandPayload = {
  id?: string
  agent_id?: string
  command: string
  command_args?: string
  command_result?: string
  success?: boolean
  error?: string
  time_tasked?: string
  time_completed?: string
}

export type TerminalParsed = {
  type: "output" | "error" | "system"
  content: string
  formatted?: React.ReactNode
  fileItems?: Array<{
    name: string
    type: "file" | "directory"
    permissions: string
    owner: string
    group: string
    size: string
    modified: string
  }>
}

export type TerminalParserContext = {
  currentAgent: any | null
  defaultCapes: string[]
  edrClassifications: Record<string, any> | null
}

// Utilities for file output parsing/formatting
function parseLsLikeOutput(raw: string) {
  const lines = String(raw || "").split("\n").filter(Boolean)
  const items = [] as TerminalParsed["fileItems"]
  if (lines.length === 0) return items
  // Accept leading "total X" line
  const body = lines[0].startsWith("total") ? lines.slice(1) : lines
  for (const line of body) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 9) continue
    items!.push({
      name: parts.slice(8).join(" "),
      type: parts[0].startsWith("d") ? "directory" : "file",
      permissions: parts[0],
      owner: parts[2],
      group: parts[3],
      size: parts[4],
      modified: parts.slice(5, 8).join(" "),
    })
  }
  return items
}

function formatLsLikeOutput(raw: string): React.ReactNode {
  const lines = String(raw || "").split("\n")
  if (lines.length === 0) return raw
  return (
    <div className="space-y-1">
      {lines[0].startsWith("total") && (
        <div className="text-muted-foreground">{lines[0]}</div>
      )}
      {(lines[0].startsWith("total") ? lines.slice(1) : lines).map((line, index) => {
        if (!line.trim()) return null
        const parts = line.split(/\s+/)
        const permissions = parts[0]
        const owner = parts[2]
        const group = parts[3]
        const size = parts[4]
        const date = parts.slice(5, 8).join(" ")
        const name = parts.slice(8).join(" ")
        const isDirectory = permissions.startsWith("d")
        const isHidden = name.startsWith(".")
        return (
          <div key={index} className="flex items-center gap-2 hover:bg-accent/20 px-1 rounded text-sm">
            <span className="h-4 w-4 inline-block text-center">
              {isDirectory ? "📁" : "📄"}
            </span>
            <span
              className={`font-mono text-xs ${isDirectory ? "text-blue-400 font-semibold" : "text-foreground"} ${isHidden ? "opacity-60" : ""}`}
            >
              {name}
            </span>
            <span className="text-xs text-muted-foreground font-mono">{permissions}</span>
            <span className="text-xs text-muted-foreground font-mono">{owner}</span>
            <span className="text-xs text-muted-foreground font-mono">{size.padStart(6)}</span>
            <span className="text-xs text-muted-foreground font-mono">{date}</span>
          </div>
        )
      })}
    </div>
  )
}

function renderAgentInfoPanel(ctx: TerminalParserContext): React.ReactNode {
  const a = ctx.currentAgent
  const edrClassifications = ctx.edrClassifications
  const getEdrColor = (edr: string) => {
    if (!edrClassifications) return "text-foreground"
    const classification = edrClassifications[edr]
    if (!classification) return "text-foreground"
    switch (classification.status) {
      case "danger":
        return "text-red-400 border border-red-400 px-1 rounded"
      case "warning":
        return "text-yellow-400 border border-yellow-400 px-1 rounded"
      case "good":
        return "text-green-400 border border-green-400 px-1 rounded"
      default:
        return "text-foreground"
    }
  }
  const loaded = Array.isArray(a?.loadedCommands) ? a!.loadedCommands : []
  const prettyDefaults = ctx.defaultCapes.map((n) => (n ? n.charAt(0).toUpperCase() + n.slice(1) : n)).filter(Boolean)
  const combined = Array.from(new Map([...loaded, ...prettyDefaults].map((s) => [String(s).toLowerCase(), String(s)])).values())

  return (
    <div className="space-y-4">
      <div className="text-accent font-semibold text-lg">Agent Information</div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-blue-400 font-semibold text-sm">Basic Information</div>
            <div className="text-xs space-y-1 pl-2">
              <div><span className="text-muted-foreground">Agent ID:</span> <span className="text-primary font-mono">{a?.id}</span></div>
              <div><span className="text-muted-foreground">Hostname:</span> <span className="text-foreground">{a?.hostname}</span></div>
              <div>
                <span className="text-muted-foreground">IP Address:</span>{" "}
                <div className="text-foreground">
                  {Array.isArray(a?.ip) ? a!.ip.map((ip: string, idx: number) => <div key={idx}>{ip}</div>) : (a as any)?.ip}
                </div>
              </div>
              <div><span className="text-muted-foreground">Operating System:</span> <span className="text-foreground">{a?.os}</span></div>
              <div><span className="text-muted-foreground">Build Version:</span> <span className="text-foreground">{a?.build || "Unknown"}</span></div>
              <div><span className="text-muted-foreground">Default Shell:</span> <span className="text-foreground">{a?.defaultShell || "Unknown"}</span></div>
              <div><span className="text-muted-foreground">Base Agent:</span> <span className="text-yellow-400">{a?.base_agent}</span></div>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-blue-400 font-semibold text-sm">Process Information</div>
            <div className="text-xs space-y-1 pl-2">
              <div><span className="text-muted-foreground">Process ID:</span> <span className="text-foreground">{a?.pid}</span></div>
              <div><span className="text-muted-foreground">User Context:</span> <span className="text-foreground">{a?.user}</span></div>
              <div><span className="text-muted-foreground">Integrity Level:</span> <span className="text-foreground">{a?.IntegrityLevel || "Unknown"}</span></div>
              <div><span className="text-muted-foreground">Current Directory:</span> <span className="text-foreground">{a?.cwd || "Unknown"}</span></div>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-blue-400 font-semibold text-sm">Security Products</div>
            <div className="text-xs space-y-1 pl-2">
              <div>
                <span className="text-muted-foreground">EDR/AV:</span>
                {a?.edr ? (
                  <div className="ml-2 space-y-1">
                    {(Array.isArray(a.edr) ? a.edr : [a.edr]).map((edr: any, index: number) => (
                      <div key={index}><span className={getEdrColor(String(edr).trim())}>{String(edr).trim()}</span></div>
                    ))}
                  </div>
                ) : (
                  <span className="text-foreground ml-1">None detected</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-blue-400 font-semibold text-sm">Listener Information</div>
            <div className="text-xs space-y-1 pl-2">
              <div><span className="text-muted-foreground">Listener:</span> <span className="text-foreground">{a?.listener || "Unknown"}</span></div>
              <div><span className="text-muted-foreground">Protocol:</span> <span className="text-foreground">{a?.listenerProtocol || "Unknown"}</span></div>
              <div><span className="text-muted-foreground">Port:</span> <span className="text-foreground">{a?.listenerPort || "Unknown"}</span></div>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-blue-400 font-semibold text-sm">Loaded Capabilities</div>
            <div className="text-xs space-y-1 pl-2">
              {combined.length > 0 ? (
                combined.map((cape: string, index: number) => (
                  <div key={index}><span className="text-green-400">• {cape}</span></div>
                ))
              ) : (
                <div><span className="text-muted-foreground">No capabilities loaded</span></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function parseCommandResult(
  parserName: string,
  cmd: CommandPayload,
  ctx: TerminalParserContext,
): TerminalParsed {
  const parser = String(parserName || "generic").toLowerCase()
  const raw = String(cmd.command_result ?? "")
  const err = String(cmd.error ?? "")
  const success = !!cmd.success

  switch (parser) {
    case "boolean": {
      const low = raw.trim().toLowerCase()
      const val = low === "true" || low === "1" || success
      return {
        type: val ? "output" : "error",
        content: val ? "This command executed successfully." : "This command failed to execute.",
      }
    }
    case "file": {
      const items = parseLsLikeOutput(raw)
      return {
        type: success ? "output" : "error",
        content: raw, // show raw in pre as well
        formatted: formatLsLikeOutput(raw),
        fileItems: items,
      }
    }
    case "agent_info": {
      return {
        type: "output",
        content: "Agent information",
        formatted: renderAgentInfoPanel(ctx),
      }
    }
    case "generic":
    default: {
      // No edits — display exactly as returned from server
      return { type: success ? "output" : "error", content: raw }
    }
  }
}

