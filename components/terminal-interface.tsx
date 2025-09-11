"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Terminal,
  Send,
  History,
  Settings,
  Folder,
  File,
  FolderOpen,
  Lock,
  User,
  Calendar,
  AlertTriangle,
} from "lucide-react"

interface CommandHistory {
  commandId: string
  forAgent: string
  timeTasked: string
  success: boolean
  command: string
  command_args: string
  command_result: string
  error?: string
}

interface Agent {
  id: string
  hostname: string
  ip: string
  os: string
  status: "online" | "offline" | "connecting" | "possibly-dead"
  lastSeenTimestamp: number
  callbackInterval: number
  jitterPercent: number
  pid: number
  user: string
  base_agent: string
  loadedCommands?: string[]
  cwd?: string
  lastQueuedTask?: string
  currentRunningTask?: string
  lastErrorTask?: string
  commandHistory?: string[]
  createdTime?: number
  build?: string
  defaultShell?: string
  IntegrityLevel?: string
  edr?: string[]
  listener?: string
  listenerProtocol?: string
  listenerPort?: string
  terminalHistory?: CommandHistory[]
}

interface TerminalInterfaceProps {
  selectedAgent: string | null
  agents: Agent[]
}

enum TaskStatus {
  TASKED = "tasked",
  ACCEPTED = "accepted",
  COMPLETED = "completed",
}

interface TerminalLine {
  id: string
  type: "command" | "output" | "error" | "system" | "task"
  content: string
  timestamp: string
  formatted?: React.ReactNode
  taskStatus?: TaskStatus
  command?: string
  result?: string
  status?: "tasked" | "accepted" | "completed"
  date?: string
}

interface FileSystemItem {
  name: string
  type: "file" | "directory"
  permissions: string
  owner: string
  group: string
  size: string
  modified: string
  path: string
  children?: FileSystemItem[]
  expanded?: boolean
}

interface FileSystemState {
  [path: string]: FileSystemItem[]
}

interface CommandParam {
  name: string
  type: "string" | "boolean"
  default?: any
  required?: boolean
  description?: string
}

interface CommandDefinition {
  id: string
  name: string
  synopsis: string
  min_integrity: string
  opsec: string
  parameters: CommandParam[]
  preview: string
  parser: string
  help: string
  cape?: string
}

interface CommandSet {
  commands: CommandDefinition[]
}

const loadCommandDefinitions = async (baseAgent: string): Promise<CommandDefinition[]> => {
  try {
    console.log("[v0] Loading commands for base_agent:", baseAgent)
    const response = await fetch(`/data/commands/${baseAgent}.json`)

    if (!response.ok) {
      console.log("[v0] Failed to fetch commands, response status:", response.status)
      throw new Error(`Failed to load commands for ${baseAgent}`)
    }

    const commandSet: CommandSet = await response.json()
    console.log("[v0] Successfully loaded commands:", commandSet.commands.length)

    const helpCommand: CommandDefinition = {
      id: "help",
      name: "help",
      synopsis: "Show available commands",
      min_integrity: "low",
      opsec: "safe",
      parameters: [],
      preview: "help",
      parser: "generic",
      help: "Displays all available commands and their usage.",
    }

    const hasHelpCommand = commandSet.commands.some((cmd) => cmd.name === "help")
    if (!hasHelpCommand) {
      return [helpCommand, ...commandSet.commands]
    }

    return commandSet.commands
  } catch (error) {
    console.error(`[v0] Failed to load command definitions for ${baseAgent}:`, error)
    return [
      {
        id: "help",
        name: "help",
        synopsis: "Show available commands",
        min_integrity: "low",
        opsec: "safe",
        parameters: [],
        preview: "help",
        parser: "generic",
        help: "Displays all available commands and their usage.",
      },
      {
        id: "load",
        name: "load",
        synopsis: "Load additional command modules",
        min_integrity: "medium",
        opsec: "safe",
        parameters: [{ name: "module", type: "string", required: true, description: "Module name to load" }],
        preview: "load <module>",
        parser: "generic",
        help: "Loads additional command modules into the agent.",
      },
      {
        id: "capes",
        name: "capes",
        synopsis: "Show loaded capabilities",
        min_integrity: "low",
        opsec: "safe",
        parameters: [],
        preview: "capes",
        parser: "generic",
        help: "Displays all currently loaded capabilities and modules.",
      },
      {
        id: "agent_info",
        name: "agent_info",
        synopsis: "Display agent information",
        min_integrity: "low",
        opsec: "safe",
        parameters: [],
        preview: "agent_info",
        parser: "generic",
        help: "Shows detailed information about the current agent.",
      },
    ]
  }
}

const calculateSimilarity = (str1: string, str2: string): number => {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1

  if (longer.length === 0) return 1.0

  const editDistance = (s1: string, s2: string): number => {
    const costs = []
    for (let i = 0; i <= s2.length; i++) {
      let lastValue = i
      for (let j = 0; j <= s1.length; j++) {
        if (i === 0) {
          costs[j] = j
        } else if (j > 0) {
          let newValue = costs[j - 1]
          if (s1.charAt(j - 1) !== s2.charAt(i - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
          }
          costs[j - 1] = lastValue
          lastValue = newValue
        }
      }
      if (i > 0) costs[s1.length] = lastValue
    }
    return costs[s1.length]
  }

  return (longer.length - editDistance(longer, shorter)) / longer.length
}

export function TerminalInterface({ selectedAgent, agents }: TerminalInterfaceProps) {
  const [command, setCommand] = useState("")
  const [history, setHistory] = useState<TerminalLine[]>([])
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [structuredCommandHistory, setStructuredCommandHistory] = useState<CommandHistory[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [fileSystem, setFileSystem] = useState<FileSystemState>({})
  const [currentDirectory, setCurrentDirectory] = useState("/home/user")
  const [selectedFile, setSelectedFile] = useState<FileSystemItem | null>(null)
  const [commandAlert, setCommandAlert] = useState<string | null>(null)
  const [availableCommands, setAvailableCommands] = useState<CommandDefinition[]>([])
  const [defaultCapes, setDefaultCapes] = useState<string[]>([])
  const [commandsLoaded, setCommandsLoaded] = useState(false)
  const terminalRef = useRef<HTMLDivElement>(null)
  // Note: our Input component may not forward refs; avoid passing a ref to prevent warnings
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [edrClassifications, setEdrClassifications] = useState<any>(null)
  const seenApiCommandIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    fetch("/data/edr-classifications.json")
      .then((res) => res.json())
      .then((data) => setEdrClassifications(data.classifications))
      .catch(() => console.log("[v0] Failed to load EDR classifications"))
  }, [])

  const getCurrentAgent = (): Agent | null => {
    return agents.find((agent) => agent.id === selectedAgent) || null
  }

  // Listen for command results; track seen IDs in a ref to avoid update loops
  useEffect(() => {
    seenApiCommandIdsRef.current = new Set()
    if (!selectedAgent) return
    const onResult = (ev: any) => {
      try {
        const cmd = ev.detail
        if (!cmd || cmd.agent_id !== selectedAgent) return
        const id: string = String(cmd.id || `${cmd.command}-${cmd.time_tasked}`)
        const seen = seenApiCommandIdsRef.current
        if (seen.has(id)) return
        seen.add(id)
        const time = new Date(cmd.time_completed || cmd.time_tasked || Date.now()).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
        const commandLine: TerminalLine = { id: `${id}-cmd`, type: 'command', content: `${cmd.command}${cmd.command_args ? ' ' + cmd.command_args : ''}`, timestamp: time }
        const resultLine: TerminalLine = { id: `${id}-out`, type: cmd.success ? 'output' : 'error', content: cmd.success ? (cmd.command_result || 'OK') : (cmd.error || 'Error'), timestamp: time }
        setHistory((prevH) => [...prevH, commandLine, resultLine])
      } catch {}
    }
    window.addEventListener('command:result', onResult as any)
    return () => window.removeEventListener('command:result', onResult as any)
  }, [selectedAgent])

  useEffect(() => {
    if (selectedAgent) {
      const currentAgent = getCurrentAgent()

      // Load structured command history from agent's terminalHistory (on agent switch only)
      if (currentAgent?.terminalHistory && Array.isArray(currentAgent.terminalHistory)) {
        const parsedHistory: CommandHistory[] = currentAgent.terminalHistory.map((historyItem: any) => ({
          commandId: historyItem.commandId || `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          forAgent: selectedAgent,
          timeTasked: historyItem.timeTasked || new Date().toISOString(),
          success: historyItem.success !== false,
          command: historyItem.command || "",
          command_args: historyItem.command_args || "",
          command_result: historyItem.command_result || "",
          error: historyItem.error || undefined,
        }))

        setStructuredCommandHistory(parsedHistory)

        // Convert structured history to terminal display format
        const terminalLines: TerminalLine[] = []

        // Add welcome message
        const welcomeMessage: TerminalLine = {
          id: Date.now().toString(),
          type: "system",
          content: `Connected to agent ${selectedAgent} (${currentAgent?.base_agent || "Unknown"})`,
          timestamp: new Date().toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        }
        terminalLines.push(welcomeMessage)

        // Add historical commands
        parsedHistory.forEach((histItem) => {
          const taskDate = new Date(histItem.timeTasked)
          const taskTime = taskDate.toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
          const taskDateStr = taskDate.toLocaleDateString("en-US", {
            month: "2-digit",
            day: "2-digit",
          })

          // Add command line
          const commandLine: TerminalLine = {
            id: `${histItem.commandId}-cmd`,
            type: "command",
            content: `${histItem.command} ${histItem.command_args}`.trim(),
            timestamp: taskTime,
            date: taskDateStr, // Added date field for MM/DD display
          }
          terminalLines.push(commandLine)

          // Add result line with proper formatting
          const resultContent = histItem.command_result
          let formatted: React.ReactNode | undefined

          // Format ls command results
          if (histItem.command === "ls" && histItem.success && resultContent) {
            const files = resultContent.split("\n").filter((line) => line.trim())
            formatted = (
              <div className="space-y-1">
                {files.map((file, index) => {
                  const isDirectory = file.endsWith("/")
                  const fileName = file.replace("/", "")
                  return (
                    <div key={index} className="flex items-center gap-2">
                      {isDirectory ? (
                        <>
                          <span className="text-blue-400">📁</span>
                          <span className="text-blue-300">{fileName}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-gray-400">📄</span>
                          <span className="text-gray-200">{fileName}</span>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          }

          const resultLine: TerminalLine = {
            id: `${histItem.commandId}-result`,
            type: histItem.success ? "output" : "error",
            content: histItem.error || resultContent,
            timestamp: taskTime,
          }
          terminalLines.push(resultLine)
        })

        setHistory(terminalLines)
      } else {
        // No history, just show welcome message
        const welcomeMessage: TerminalLine = {
          id: Date.now().toString(),
          type: "system",
          content: `Connected to agent ${selectedAgent} (${currentAgent?.base_agent || "Unknown"})`,
          timestamp: new Date().toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        }
        setHistory([welcomeMessage])
      }
    } else {
      // Avoid redundant state churn when no agent is selected
      if (history.length > 0) setHistory([])
      if (structuredCommandHistory.length > 0) setStructuredCommandHistory([])
    }
  }, [selectedAgent])

  useEffect(() => {
    const currentAgent = getCurrentAgent()
    console.log("[v0] Selected agent changed:", selectedAgent)
    console.log("[v0] Current agent:", currentAgent)
    console.log("[v0] Agent base_agent:", currentAgent?.base_agent)

    if (currentAgent && currentAgent.base_agent) {
      loadCommandDefinitions(currentAgent.base_agent)
        .then((commands) => {
          console.log("[v0] Commands loaded successfully:", commands.length)
          setAvailableCommands(commands)
          setCommandsLoaded(true)
        })
        .catch((error) => {
          console.error("[v0] Failed to load commands:", error)
          setCommandsLoaded(false)
        })
      // Load default capes for this base agent profile
      fetch(`/api/agent-mgmt/agents/${encodeURIComponent(currentAgent.base_agent)}`)
        .then(res => res.ok ? res.json() : Promise.reject(new Error('no agent info')))
        .then(info => {
          const list = Array.isArray(info?.capes) ? info.capes : []
          const names = list.filter((c: any) => c && c.default === true).map((c: any) => String(c.name || '').toLowerCase()).filter(Boolean)
          setDefaultCapes(names)
        })
        .catch(() => setDefaultCapes([]))
    } else {
      console.log("[v0] No agent selected or no base_agent property")
      setAvailableCommands([])
      setCommandsLoaded(false)
      setDefaultCapes([])
    }
  }, [selectedAgent])

  useEffect(() => {
    // No-op: Welcome message is set in the initial loader effect above to avoid wiping history on refresh
  }, [selectedAgent])

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [history])

  // Temporarily disable localStorage persistence/hydration to avoid update loops during debugging

  useEffect(() => {
    const savedHistory = localStorage.getItem(`terminal-history-${selectedAgent}`)
    if (savedHistory) {
      try {
        setCommandHistory(JSON.parse(savedHistory))
      } catch (error) {
        console.error("Failed to load command history:", error)
      }
    }
  }, [selectedAgent])

  useEffect(() => {
    if (selectedAgent && commandHistory.length > 0) {
      localStorage.setItem(`terminal-history-${selectedAgent}`, JSON.stringify(commandHistory))
    }
  }, [commandHistory, selectedAgent])

  const filterByLoadedCapes = (cmds: CommandDefinition[]): CommandDefinition[] => {
    const agent = getCurrentAgent()
    const loaded = new Set<string>([...defaultCapes, ...((agent?.loadedCommands || []).map((s) => String(s).toLowerCase()))])
    if (!agent || loaded.size === 0) return cmds
    return cmds.filter((c) => {
      const cape = (c as any).cape ? String((c as any).cape).toLowerCase() : ""
      if (!cape) return true
      return loaded.has(cape)
    })
  }

  const handleCommandChange = (value: string) => {
    setCommand(value)

    if (value.trim() && commandsLoaded) {
      const hasSpace = value.includes(" ")
      if (!hasSpace) {
        const filtered = filterByLoadedCapes(availableCommands)
          .filter((cmd) => cmd.name.toLowerCase().startsWith(value.toLowerCase()))
          .map((cmd) => cmd.name)
        setSuggestions(filtered)
        setShowSuggestions(filtered.length > 0)
      } else {
        setShowSuggestions(false)
      }
    } else {
      setShowSuggestions(false)
    }
  }

  const executeCommand = async () => {
    if (!command.trim() || !selectedAgent) return

    setCommandAlert(null)

    const baseCommand = command.trim().split(" ")[0].toLowerCase()
    const args = command.trim().split(" ").slice(1)
    const currentAgent = getCurrentAgent()

    try { console.log('[terminal] executeCommand', { selectedAgent, baseCommand, args }) } catch {}
    const debugEcho: TerminalLine = { id: `${Date.now()}-dbg`, type: 'system', content: `Executing: ${command}`, timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
    setHistory((prev) => [...prev, debugEcho])

    const newCommandHistory: CommandHistory = {
      commandId: `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      forAgent: selectedAgent,
      timeTasked: new Date().toISOString(),
      success: true,
      command: baseCommand,
      command_args: args.join(" "),
      command_result: "",
      error: undefined,
    }

    if (baseCommand === "remove") {
      const commandLine: TerminalLine = {
        id: Date.now().toString(),
        type: "command",
        content: `$ ${command}`,
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      }
      const current = getCurrentAgent()
      const arg = (args[0] || "").toLowerCase()
      if (!current || !arg || !current.id.toLowerCase().startsWith(arg)) {
        const out: TerminalLine = {
          id: (Date.now() + 1).toString(),
          type: "error",
          content: `Usage: remove <first8-of-agent-id>. Selected agent: ${current?.id || 'none'}`,
          timestamp: commandLine.timestamp,
        }
        setHistory((prev) => [...prev, commandLine, out])
        setCommand("")
        return
      }
      try {
        const res = await fetch(`/api/agents/${current.id}`, { method: 'DELETE' })
        if (res.ok) {
          const out: TerminalLine = {
            id: (Date.now() + 1).toString(),
            type: "output",
            content: `Agent ${current.id} removed`,
            timestamp: commandLine.timestamp,
          }
          setHistory((prev) => [...prev, commandLine, out])
          // notify page to refresh agents
          window.dispatchEvent(new CustomEvent('agents:refresh'))
        } else {
          const out: TerminalLine = {
            id: (Date.now() + 1).toString(),
            type: "error",
            content: `Failed to remove agent ${current.id}`,
            timestamp: commandLine.timestamp,
          }
          setHistory((prev) => [...prev, commandLine, out])
        }
      } catch {
        const out: TerminalLine = {
          id: (Date.now() + 1).toString(),
          type: "error",
          content: `Error removing agent ${current?.id}`,
          timestamp: commandLine.timestamp,
        }
        setHistory((prev) => [...prev, commandLine, out])
      }
      setCommand("")
      return
    }

    if (baseCommand === "capes") {
      const commandLine: TerminalLine = {
        id: Date.now().toString(),
        type: "command",
        content: `$ ${command}`,
        timestamp: new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      }

      // Capabilities mapping structure
      const capabilitiesMap: Record<string, string[]> = {
        Loader: ["load", "unload"],
        "Console Execution": ["console", "powershell", "cmd"],
        "Exit/Eat": ["exit", "eat", "destroy"],
        "File Operations": ["ls", "cat", "cd", "pwd", "mkdir", "rm"],
        Network: ["ping", "netstat", "ifconfig"],
        "System Info": ["ps", "whoami", "uname"],
        "Process Management": ["kill", "jobs"],
      }

      const loadedCaps = Array.isArray(currentAgent?.loadedCommands) ? currentAgent!.loadedCommands : []
      const prettyDefaults = defaultCapes.map((n) => n ? n.charAt(0).toUpperCase() + n.slice(1) : n).filter(Boolean)
      const combinedCaps = Array.from(new Map([...loadedCaps, ...prettyDefaults].map((s) => [String(s).toLowerCase(), String(s)])).values())

      const capesFormatted = (
        <div className="space-y-3">
          <div className="text-accent font-semibold">Loaded Capabilities:</div>
          <div className="space-y-3">
            {combinedCaps && combinedCaps.length > 0 ? (
              combinedCaps.map((capability, index) => (
                <div key={index} className="space-y-1">
                  <div className="text-primary font-semibold">{capability}</div>
                  <div className="pl-4 text-sm">
                    <span className="text-muted-foreground">Commands: </span>
                    <span className="text-foreground font-mono">
                      {capabilitiesMap[capability]?.join(", ") || "No commands defined"}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-muted-foreground">No capabilities loaded</div>
            )}
          </div>
          <div className="text-muted-foreground text-xs mt-4 pt-2 border-t border-border">
            Total loaded capabilities: {combinedCaps.length}
          </div>
        </div>
      )

      const capesLine: TerminalLine = {
        id: (Date.now() + 1).toString(),
        type: "output",
        content: "Loaded capabilities displayed",
        timestamp: new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        formatted: capesFormatted,
      }

      newCommandHistory.command_result = `Loaded capabilities: ${combinedCaps.join(", ") || "None"}`
      setStructuredCommandHistory((prev) => [newCommandHistory, ...prev.slice(0, 49)])

      setHistory((prev) => [...prev, commandLine, capesLine])
      setCommandHistory((prev) => [command, ...prev.slice(0, 49)])
      setCommand("")
      setShowSuggestions(false)
      setHistoryIndex(-1)
      return
    }

    if (baseCommand === "agent_info") {
      const commandLine: TerminalLine = {
        id: Date.now().toString(),
        type: "command",
        content: `$ ${command}`,
        timestamp: new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      }

      const formatJitterTranslate = (jitterTranslate: string) => {
        const seconds = Number.parseInt(jitterTranslate)
        if (seconds >= 3600) {
          return `${Math.round(seconds / 3600)} hours`
        } else if (seconds >= 180) {
          return `${Math.round(seconds / 60)} minutes`
        } else {
          return `${seconds} seconds`
        }
      }

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

      const agentInfoFormatted = (
        <div className="space-y-4">
          <div className="text-accent font-semibold text-lg">Agent Information</div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-blue-400 font-semibold text-sm">Basic Information</div>
                <div className="text-xs space-y-1 pl-2">
                  <div>
                    <span className="text-muted-foreground">Agent ID:</span>{" "}
                    <span className="text-primary font-mono">{currentAgent?.id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Hostname:</span>{" "}
                    <span className="text-foreground">{currentAgent?.hostname}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">IP Address:</span>{" "}
                    <div className="text-foreground">
                      {Array.isArray(currentAgent?.ip)
                        ? currentAgent.ip.map((ip: string, index: number) => <div key={index}>{ip}</div>)
                        : currentAgent?.ip}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Operating System:</span>{" "}
                    <span className="text-foreground">{currentAgent?.os}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Build Version:</span>{" "}
                    <span className="text-foreground">{currentAgent?.build || "Unknown"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Default Shell:</span>{" "}
                    <span className="text-foreground">{currentAgent?.defaultShell || "Unknown"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Base Agent:</span>{" "}
                    <span className="text-yellow-400">{currentAgent?.base_agent}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-blue-400 font-semibold text-sm">Process Information</div>
                <div className="text-xs space-y-1 pl-2">
                  <div>
                    <span className="text-muted-foreground">Process ID:</span>{" "}
                    <span className="text-foreground">{currentAgent?.pid}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">User Context:</span>{" "}
                    <span className="text-foreground">{currentAgent?.user}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Integrity Level:</span>{" "}
                    <span className="text-foreground">{currentAgent?.IntegrityLevel || "Unknown"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Current Directory:</span>{" "}
                    <span className="text-foreground">{currentAgent?.cwd || "Unknown"}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-blue-400 font-semibold text-sm">Security Products</div>
                <div className="text-xs space-y-1 pl-2">
                  <div>
                    <span className="text-muted-foreground">EDR/AV:</span>
                    {currentAgent?.edr ? (
                      <div className="ml-2 space-y-1">
                        {(Array.isArray(currentAgent.edr) ? currentAgent.edr : [currentAgent.edr]).map((edr, index) => (
                          <div key={index}>
                            <span className={getEdrColor(edr.trim())}>{edr.trim()}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-foreground ml-1">None detected</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-blue-400 font-semibold text-sm">Listener Information</div>
                <div className="text-xs space-y-1 pl-2">
                  <div>
                    <span className="text-muted-foreground">Listener:</span>{" "}
                    <span className="text-foreground">{currentAgent?.listener || "Unknown"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Protocol:</span>{" "}
                    <span className="text-foreground">{currentAgent?.listenerProtocol || "Unknown"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Port:</span>{" "}
                    <span className="text-foreground">{currentAgent?.listenerPort || "Unknown"}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-blue-400 font-semibold text-sm">Loaded Capabilities</div>
                <div className="text-xs space-y-1 pl-2">
                  {(() => {
                    const loaded = Array.isArray(currentAgent?.loadedCommands) ? currentAgent!.loadedCommands : []
                    const prettyDefaults = defaultCapes.map((n) => n ? n.charAt(0).toUpperCase() + n.slice(1) : n).filter(Boolean)
                    const combined = Array.from(new Map([...loaded, ...prettyDefaults].map((s) => [String(s).toLowerCase(), String(s)])).values())
                    return combined.length > 0 ? (
                      combined.map((cape: string, index: number) => (
                        <div key={index}>
                          <span className="text-green-400">• {cape}</span>
                        </div>
                      ))
                    ) : (
                      <div>
                        <span className="text-muted-foreground">No capabilities loaded</span>
                      </div>
                    )
                  })()}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-blue-400 font-semibold text-sm">Task Information</div>
                <div className="text-xs space-y-1 pl-2">
                  <div>
                    <span className="text-muted-foreground">Last Queued:</span>{" "}
                    <span className="text-foreground">{currentAgent?.lastQueuedTask || "None"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Currently Running:</span>{" "}
                    <span className="text-foreground">{currentAgent?.currentRunningTask || "None"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Error:</span>{" "}
                    <span className="text-red-400">{currentAgent?.lastErrorTask || "None"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-muted-foreground text-xs pt-2 border-t border-border">
            Agent created: {new Date(currentAgent?.createdTime || 0).toLocaleString()}
          </div>
        </div>
      )

      const agentInfoLine: TerminalLine = {
        id: (Date.now() + 1).toString(),
        type: "output",
        content: "Agent information displayed",
        timestamp: new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        formatted: agentInfoFormatted,
      }

      newCommandHistory.command_result = "Agent information displayed successfully"
      setStructuredCommandHistory((prev) => [newCommandHistory, ...prev.slice(0, 49)])

      setHistory((prev) => [...prev, commandLine, agentInfoLine])
      setCommandHistory((prev) => [command, ...prev.slice(0, 49)])
      setCommand("")
      setShowSuggestions(false)
      setHistoryIndex(-1)
      return
    }

    if (baseCommand === "help") {
      try { console.log('[terminal] render help') } catch {}
      if (!commandsLoaded || availableCommands.length === 0) {
        const noCommandsLine: TerminalLine = {
          id: (Date.now() + 1).toString(),
          type: "output",
          content: "No commands available - agent command set not loaded",
          timestamp: new Date().toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        }

        const commandLine: TerminalLine = {
          id: Date.now().toString(),
          type: "command",
          content: `$ ${command}`,
          timestamp: new Date().toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        }

        setHistory((prev) => [...prev, commandLine, noCommandsLine])
        setCommandHistory((prev) => [command, ...prev.slice(0, 49)])
        setCommand("")
        setShowSuggestions(false)
        setHistoryIndex(-1)
        return
      }

      const commandLine: TerminalLine = {
        id: Date.now().toString(),
        type: "command",
        content: `$ ${command}`,
        timestamp: new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      }

      const helpFormatted = (
        <div className="space-y-3">
          <div className="text-accent font-semibold">Available Commands:</div>
          <div className="space-y-2">
            <div className="flex gap-4 text-muted-foreground text-xs border-b border-border pb-2">
              <span className="w-16 font-semibold">Command</span>
              <span className="w-32 font-semibold">Parameters</span>
              <span className="w-20 font-semibold">Integrity</span>
              <span className="flex-1 font-semibold">Description</span>
            </div>
            {filterByLoadedCapes(availableCommands).map((cmd) => (
              <div key={cmd.id} className="flex gap-4 text-sm font-mono border-b border-border/30 pb-2">
                <span className="w-16 text-primary font-semibold">{cmd.name}</span>
                <span className="w-32 text-yellow-400 text-xs">
                  {cmd.parameters.length > 0
                    ? cmd.parameters.map((p) => (p.required ? `<${p.name}>` : `[${p.name}]`)).join(" ")
                    : "-"}
                </span>
                <span className="w-20 text-blue-400 text-xs">{cmd.min_integrity}</span>
                <span className="flex-1 text-foreground text-xs">{cmd.help}</span>
              </div>
            ))}
          </div>
          <div className="text-muted-foreground text-xs mt-4 pt-2 border-t border-border">
            <div className="space-y-1">
              <div>
                <span className="text-primary">&lt;param&gt;</span> = required parameter
              </div>
              <div>
                <span className="text-yellow-400">[param]</span> = optional parameter
              </div>
              <div>
                <span className="text-blue-400">Integrity</span> = minimum required access level
              </div>
            </div>
          </div>
        </div>
      )

      const helpLine: TerminalLine = {
        id: (Date.now() + 1).toString(),
        type: "output",
        content: "Help information displayed",
        timestamp: new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        formatted: helpFormatted,
      }

      newCommandHistory.command_result = "Available commands loaded successfully"
      setStructuredCommandHistory((prev) => [newCommandHistory, ...prev.slice(0, 49)])

      setHistory((prev) => [...prev, commandLine, helpLine])
      setCommandHistory((prev) => [command, ...prev.slice(0, 49)])
      setCommand("")
      setShowSuggestions(false)
      setHistoryIndex(-1)
      return
    }

    const commandExists = filterByLoadedCapes(availableCommands).some((cmd) => cmd.name === baseCommand)
    if (!commandExists) {
      const similarities = availableCommands.map((cmd) => ({ command: cmd.name, similarity: calculateSimilarity(baseCommand, cmd.name) }))
      const bestMatch = similarities.reduce((best, current) => (current.similarity > best.similarity ? current : best), { command: '', similarity: 0 })
      if (availableCommands.length > 0) {
        if (bestMatch.similarity > 0.4) setCommandAlert(`Command doesn't exist, did you mean '${bestMatch.command}'?`)
        else setCommandAlert(`Command '${baseCommand}' doesn't exist. Type 'help' to see available commands.`)
      } else {
        setCommandAlert(null)
      }
      // Continue to queue the task anyway
    }

    {
      const commandLine: TerminalLine = {
        id: Date.now().toString(),
        type: "command",
        content: `$ ${command}`,
        timestamp: new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      }

      const taskLine: TerminalLine = {
        id: (Date.now() + 1).toString(),
        type: "system",
        content: `Tasked ${baseCommand}`,
        timestamp: commandLine.timestamp,
        status: "tasked" as const,
      }

      setHistory((prev) => [...prev, commandLine, taskLine])

      // Queue the task on the server; rely on SSE for results
      try {
        console.log('[terminal] queue task', { agentId: selectedAgent, baseCommand, args })
        await fetch('/api/tasking/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: selectedAgent, command: baseCommand, args: args.join(' ') }),
        })
      } catch (e) {
        const errLine: TerminalLine = {
          id: (Date.now() + 2).toString(),
          type: 'error',
          content: `Failed to queue task: ${(e as any)?.message || 'network error'}`,
          timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        }
        setHistory((prev) => [...prev, errLine])
      }
    }

    setCommand("")
    setShowSuggestions(false)
    setHistoryIndex(-1)
  }

  const updateFileSystemFromLs = (output: string) => {
    const lines = output.split("\n")
    if (lines[0].startsWith("total")) {
      const items = lines
        .slice(1)
        .filter((line) => line.trim())
        .map((line) => {
          const parts = line.split(/\s+/)
          return {
            name: parts.slice(8).join(" "),
            type: parts[0].startsWith("d") ? ("directory" as const) : ("file" as const),
            permissions: parts[0],
            owner: parts[2],
            group: parts[3],
            size: parts[4],
            modified: parts.slice(5, 8).join(" "),
            path: `${currentDirectory}/${parts.slice(8).join(" ")}`,
          }
        })

      setFileSystem((prev) => ({
        ...prev,
        [currentDirectory]: items,
      }))
    }
  }

  const simulateCommandOutput = (cmd: string): string => {
    const command = cmd.toLowerCase().trim()

    if (command === "ls -la" || command === "ls") {
      const items = [
        {
          name: ".",
          type: "directory",
          permissions: "drwxr-xr-x",
          owner: "user",
          group: "user",
          size: "4096",
          modified: "Dec  8 10:30",
        },
        {
          name: "..",
          type: "directory",
          permissions: "drwxr-xr-x",
          owner: "root",
          group: "root",
          size: "4096",
          modified: "Dec  7 09:15",
        },
        {
          name: ".bash_logout",
          type: "file",
          permissions: "-rw-r--r--",
          owner: "user",
          group: "user",
          size: "220",
          modified: "Dec  7 09:15",
        },
        {
          name: ".bashrc",
          type: "file",
          permissions: "-rw-r--r--",
          owner: "user",
          group: "user",
          size: "3771",
          modified: "Dec  7 09:15",
        },
        {
          name: ".cache",
          type: "directory",
          permissions: "drwx------",
          owner: "user",
          group: "user",
          size: "4096",
          modified: "Dec  8 10:30",
        },
        {
          name: ".profile",
          type: "file",
          permissions: "-rw-r--r--",
          owner: "user",
          group: "user",
          size: "807",
          modified: "Dec  7 09:15",
        },
        {
          name: "Documents",
          type: "directory",
          permissions: "drwxr-xr-x",
          owner: "user",
          group: "user",
          size: "4096",
          modified: "Dec  8 09:45",
        },
        {
          name: "Downloads",
          type: "directory",
          permissions: "drwxr-xr-x",
          owner: "user",
          group: "user",
          size: "4096",
          modified: "Dec  8 11:20",
        },
      ]

      const fileSystemItems: FileSystemItem[] = items.map((item) => ({
        ...item,
        path: `${currentDirectory}/${item.name}`,
        type: item.type as "file" | "directory",
      }))

      setFileSystem((prev) => ({
        ...prev,
        [currentDirectory]: fileSystemItems,
      }))

      return `total 24\n${items
        .map(
          (item) =>
            `${item.permissions}  1 ${item.owner.padEnd(8)} ${item.group.padEnd(8)} ${item.size.padStart(4)} ${item.modified} ${item.name}`,
        )
        .join("\n")}`
    } else if (command === "pwd") {
      return "/home/user"
    } else if (command === "whoami") {
      return "user"
    } else if (command.startsWith("ps aux")) {
      return `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  0.0  0.1 168576 11584 ?        Ss   09:15   0:01 /sbin/init
root         2  0.0  0.0      0     0 ?        S    09:15   0:00 [kthreadd]
user      1234  0.1  0.5  12345  5678 pts/0    Ss   10:30   0:00 -bash`
    } else if (command.startsWith("cat ")) {
      return "File contents would appear here..."
    } else {
      return `Command executed: ${cmd}\nOutput simulation for demonstration purposes.`
    }
  }

  const formatLsOutput = (content: string): React.ReactNode => {
    const lines = content.split("\n")
    if (lines[0].startsWith("total")) {
      return (
        <div className="space-y-1">
          <div className="text-muted-foreground">{lines[0]}</div>
          {lines.slice(1).map((line, index) => {
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
                {isDirectory ? (
                  <Folder className="h-4 w-4 text-blue-400" />
                ) : (
                  <File className="h-4 w-4 text-gray-400" />
                )}
                <span
                  className={`font-mono text-xs ${isDirectory ? "text-blue-400 font-semibold" : "text-foreground"} ${isHidden ? "opacity-60" : ""}`}
                >
                  {name.padEnd(20)}
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
    return content
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      executeCommand()
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        setCommand(commandHistory[newIndex])
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setCommand(commandHistory[newIndex])
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setCommand("")
      }
    } else if (e.key === "Tab") {
      e.preventDefault()
      if (suggestions.length > 0 && !command.includes(" ")) {
        setCommand(suggestions[0])
        setShowSuggestions(false)
      }
    }
  }

  const renderFileExplorer = () => {
    const currentFiles = fileSystem[currentDirectory] || []

    const renderFileItem = (item: FileSystemItem, depth = 0) => (
      <TooltipProvider key={item.path}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="flex items-center gap-2 py-1 px-2 hover:bg-accent/20 cursor-pointer rounded text-sm"
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => setSelectedFile(item)}
            >
              {item.type === "directory" ? (
                item.expanded ? (
                  <FolderOpen className="h-4 w-4 text-blue-400" />
                ) : (
                  <Folder className="h-4 w-4 text-blue-400" />
                )
              ) : (
                <File className="h-4 w-4 text-gray-400" />
              )}
              <span className={item.type === "directory" ? "text-blue-400 font-medium" : "text-foreground"}>
                {item.name}
              </span>
              {item.permissions.includes("x") && item.type === "file" && (
                <Badge variant="outline" className="text-xs px-1 py-0">
                  exec
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <Lock className="h-3 w-3" />
                <span>Permissions: {item.permissions}</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-3 w-3" />
                <span>
                  Owner: {item.owner}:{item.group}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span>Modified: {item.modified}</span>
              </div>
              {item.type === "file" && <div>Size: {item.size} bytes</div>}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    return (
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2 mb-4">
          <Folder className="h-5 w-5 text-primary" />
          <span className="font-mono text-sm text-muted-foreground">{currentDirectory}</span>
        </div>

        {currentFiles.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Folder className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Run 'ls' command to explore files</p>
          </div>
        ) : (
          <div className="space-y-1">{currentFiles.map((item) => renderFileItem(item))}</div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-4 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Agent Interface</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <History className="h-4 w-4 mr-1" />
              History
            </Button>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1" />
              Settings
            </Button>
          </div>
        </div>

        {selectedAgent ? (
          <Badge variant="outline" className="text-xs">
            Connected to: {selectedAgent} ({getCurrentAgent()?.base_agent || "Unknown"})
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            No agent selected
          </Badge>
        )}
      </div>

      <Tabs defaultValue="terminal" className="flex-1 flex flex-col h-full">
        <TabsList className="mx-4 mt-2 w-fit">
          <TabsTrigger value="terminal" className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Terminal
          </TabsTrigger>
          <TabsTrigger value="explorer" className="flex items-center gap-2">
            <Folder className="h-4 w-4" />
            File Explorer
          </TabsTrigger>
        </TabsList>

        <TabsContent value="terminal" className="flex-1 flex flex-col mt-0 h-full min-h-0">
          {commandAlert && (
            <div className="mx-4 mt-2">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{commandAlert}</AlertDescription>
              </Alert>
            </div>
          )}

          <div
            ref={terminalRef}
            className="flex-1 overflow-y-auto p-4 bg-card font-mono text-sm space-y-1 min-h-0"
          >
            {history.map((line) => (
              <div key={line.id} className="flex gap-2 items-center">
                <div className="text-muted-foreground text-xs w-16 flex-shrink-0 flex flex-col items-center justify-center">
                  <span>{line.timestamp}</span>
                  {line.date && <span className="text-[10px] opacity-70">{line.date}</span>}
                </div>
                <div
                  className={`flex-1 ${
                    line.type === "command"
                      ? "text-primary"
                      : line.type === "error"
                        ? "text-destructive"
                        : line.type === "system"
                          ? "text-accent"
                          : line.type === "task"
                            ? line.taskStatus === TaskStatus.COMPLETED
                              ? "text-green-400"
                              : line.taskStatus === TaskStatus.ACCEPTED
                                ? "text-blue-400"
                                : "text-yellow-400"
                            : "text-foreground"
                  }`}
                >
                  {line.type === "task" && line.taskStatus === TaskStatus.COMPLETED && line.result ? (
                    <div className="space-y-1">
                      <div>{line.content}</div>
                      <div className="text-foreground pl-4 border-l-2 border-muted">
                        {line.formatted || line.result}
                      </div>
                    </div>
                  ) : (
                    line.formatted || line.content
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-border bg-card flex-shrink-0">
            <div className="relative">
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-md shadow-lg max-h-32 overflow-y-auto">
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={suggestion}
                      className="px-3 py-2 hover:bg-accent cursor-pointer text-sm font-mono"
                      onClick={() => {
                        setCommand(suggestion)
                        setShowSuggestions(false)
                        inputRef.current?.focus()
                      }}
                    >
                      {suggestion}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-primary font-mono">$</span>
                  <Input
                    ref={inputRef}
                    value={command}
                    onChange={(e) => handleCommandChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={selectedAgent ? "Enter command..." : "Select an agent first"}
                    disabled={!selectedAgent}
                    className="pl-8 font-mono bg-input border-border"
                  />
                </div>
                <Button onClick={executeCommand} disabled={!selectedAgent || !command.trim()} size="sm">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="explorer" className="flex-1 flex flex-col mt-0 h-full min-h-0">
          <div className="flex-1 overflow-y-auto bg-card min-h-0">
            {!selectedAgent ? (
              <div className="text-center text-muted-foreground py-8">
                <Folder className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select an agent to explore files</p>
              </div>
            ) : (
              renderFileExplorer()
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
