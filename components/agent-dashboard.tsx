"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Monitor, Wifi, WifiOff, Activity, AlertTriangle } from "lucide-react"

interface Agent {
  agentId: string
  hostname: string
  ipAddr: string
  os: string
  lastCallback: string
  createdTime: string
  callbackInterval: number
  jitterValue: number
  pid: number
  user: string
  base_agent: string
  commandHistory: string[]
  loadedCommands: string[]
  cwd: string
  lastQueuedTask: string
  currentRunningTask: string
  lastErrorTask: string
  listener: string
  workHours: string
  killDate: string
  edr: string[]
  targetDomain: string
  lastError: string
  defaultShell: string
  status: "online" | "offline" | "connecting" | "possibly-dead" | "hibernation"
  lastSeenTimestamp: number
}

interface AgentDashboardProps {
  onAgentSelect: (agentId: string) => void
  selectedAgent: string | null
  agentsData?: Array<{
    id: string
    hostname: string
    ipAddr: string | string[]
    os: string
    lastCallback?: string
    createdTime?: string
    callbackInterval: number
    jitterValue: number
    pid: number
    user: string
    base_agent: string
    loadedCommands?: string[]
    cwd?: string
    lastQueuedTask?: string
    currentRunningTask?: string
    lastErrorTask?: string
    listener?: string
    workHours?: string
    killDate?: string
    edr?: string[]
    targetDomain?: string
    lastError?: string
    defaultShell?: string
    status: "online" | "offline" | "connecting" | "possibly-dead" | "hibernation"
    lastSeenTimestamp: number
  }>
}

export function AgentDashboard({ onAgentSelect, selectedAgent, agentsData }: AgentDashboardProps) {
  const [currentTime, setCurrentTime] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setCurrentTime(Date.now()), 1000); return () => clearInterval(t) }, [])

  const [agents, setAgents] = useState<Agent[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  useEffect(() => {
    if (agentsData && agentsData.length > 0) {
      const normalized: Agent[] = agentsData.map((a) => ({
        agentId: a.id,
        hostname: a.hostname,
        ipAddr: Array.isArray(a.ipAddr) ? a.ipAddr[0] || "" : String(a.ipAddr || ""),
        os: a.os,
        lastCallback: a.lastCallback || new Date(a.lastSeenTimestamp).toISOString(),
        createdTime: a.createdTime || new Date().toISOString(),
        callbackInterval: a.callbackInterval,
        jitterValue: a.jitterValue,
        pid: a.pid,
        user: a.user,
        base_agent: a.base_agent,
        commandHistory: [],
        loadedCommands: a.loadedCommands || [],
        cwd: a.cwd || "",
        lastQueuedTask: a.lastQueuedTask || "",
        currentRunningTask: a.currentRunningTask || "",
        lastErrorTask: a.lastErrorTask || "",
        listener: a.listener || "",
        workHours: a.workHours || "24/7",
        killDate: a.killDate || "",
        edr: a.edr || [],
        targetDomain: a.targetDomain || "",
        lastError: a.lastError || "",
        defaultShell: a.defaultShell || "",
        status: a.status,
        lastSeenTimestamp: a.lastSeenTimestamp,
      }))
      setAgents(normalized)
    } else {
      setAgents([])
    }
  }, [agentsData])

  // Work-hours parser (supports "24/7", "HH:MM-HH:MM", or "H-H")
  const inWorkHours = (workHours: string) => {
    if (!workHours || workHours.trim().toLowerCase() === "24/7") return true
    const m = workHours.match(/^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?$/)
    if (!m) return true
    const [ , sh, sm, eh, em ] = m
    const startH = Math.max(0, Math.min(23, Number(sh)))
    const startM = Math.max(0, Math.min(59, sm ? Number(sm) : 0))
    const endH = Math.max(0, Math.min(23, Number(eh)))
    const endM = Math.max(0, Math.min(59, em ? Number(em) : 0))
    const now = new Date()
    const minsNow = now.getHours() * 60 + now.getMinutes()
    const minsStart = startH * 60 + startM
    const minsEnd = endH * 60 + endM
    if (minsStart === minsEnd) return false
    if (minsStart < minsEnd) return minsNow >= minsStart && minsNow < minsEnd
    return minsNow >= minsStart || minsNow < minsEnd
  }

  // Derive display status locally so icons/badges update as time passes
  const getDisplayStatus = (a: Agent): Agent["status"] => {
    if (!inWorkHours(a.workHours)) return "hibernation"
    const lastSeen = Number(a.lastSeenTimestamp || 0)
    const intervalSec = Math.max(1, Number(a.callbackInterval || 60))
    const jitterPct = Math.max(0, Number(a.jitterValue || 0))
    const windowMs = intervalSec * 1000
    const jitterMs = Math.round(windowMs * (jitterPct / 100))
    const threshold1 = lastSeen + windowMs + jitterMs
    const threshold3 = lastSeen + 3 * (windowMs + jitterMs)
    if (currentTime <= threshold1) return "online"
    if (currentTime <= threshold3) return "possibly-dead"
    return "offline"
  }

  const filteredAgents = agents.filter((agent) => {
    const matchesSearch = agent.hostname.toLowerCase().includes(searchTerm.toLowerCase()) || agent.ipAddr.includes(searchTerm)
    const displayStatus = getDisplayStatus(agent)
    let matchesStatus = false
    if (statusFilter === "all") matchesStatus = true
    else if (statusFilter === "online") matchesStatus = ["online", "possibly-dead", "connecting"].includes(displayStatus)
    else matchesStatus = displayStatus === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "online": return <Wifi className="h-3 w-3 text-primary" />
      case "offline": return <WifiOff className="h-3 w-3 text-destructive" />
      case "possibly-dead": return <AlertTriangle className="h-3 w-3 text-yellow-500" />
      case "connecting": return <Activity className="h-3 w-3 text-accent animate-pulse" />
      case "hibernation": return <Monitor className="h-3 w-3 text-blue-500" />
      default: return <Monitor className="h-3 w-3 text-muted-foreground" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: any = {
      online: "bg-primary/20 text-primary-foreground border-primary/30",
      offline: "bg-destructive/20 text-destructive-foreground border-destructive/30",
      "possibly-dead": "bg-yellow-500/20 text-yellow-900 border-yellow-500/30",
      connecting: "bg-accent/20 text-accent-foreground border-accent/30",
      hibernation: "bg-blue-500/20 text-blue-900 border-blue-500/30",
    }
    return variants[status] || "bg-muted/20 text-muted-foreground"
  }

  const formatTimeSince = (timestamp: number) => {
    const secondsAgo = Math.floor((currentTime - timestamp) / 1000)
    if (secondsAgo < 180) return `${secondsAgo}s ago`
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo/60)}m ago`
    return `${Math.floor(secondsAgo/3600)}h ago`
  }

  const formatCallbackInterval = (intervalSeconds: number, jitterPercent: number) => {
    if (intervalSeconds < 60) return `${intervalSeconds}s ±${jitterPercent}%`
    if (intervalSeconds < 3600) return `${Math.floor(intervalSeconds/60)}m ±${jitterPercent}%`
    return `${Math.floor(intervalSeconds/3600)}h ±${jitterPercent}%`
  }

  const getOSIcon = (os: string) => {
    if (os.toLowerCase().includes("windows")) {
      return (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.351" />
        </svg>
      )
    }
    if (os.toLowerCase().includes("ubuntu") || os.toLowerCase().includes("centos") || os.toLowerCase().includes("linux")) {
      return (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c-.391.778-1.113 1.132-1.884 1.071-.771-.06-1.592-.536-2.257-1.306-.631-.765-1.683-1.084-2.378-1.503-.348-.199-.629-.469-.649-.853-.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 01-.088.069c-.104.105-.259.158-.436.158-.177 0-.33-.053-.435-.158-.105-.104-.258-.158-.435-.158h.002zm-2.962 7.28c-.209 0-.31.105-.31.315 0 .209.101.313.31.313.209 0 .313-.104.313-.313 0-.21-.104-.315-.313-.315zm5.805.717c-.209 0-.312.105-.312.315 0 .209.103.313.312.313.209 0 .314-.104.314-.313 0-.21-.105-.315-.314-.315z" />
        </svg>
      )
    }
    if (os.toLowerCase().includes("macos") || os.toLowerCase().includes("mac")) {
      return (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.81.87.78 0 2.26-1.07 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
      )
    }
    return <Monitor className="h-3 w-3 text-muted-foreground" />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Agent Management</h2>
          <Badge variant="outline" className="text-xs">
            {agents.filter((a) => getDisplayStatus(a) === "online").length} / {agents.length} Online
          </Badge>
        </div>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search agents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-input border-border"
            />
          </div>
        </div>

        <div className="flex gap-2">
          {["all", "online", "offline", "hibernation"].map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className="capitalize text-xs"
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      <div className="px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
          <div className="w-40 lg:w-64">Hostname</div>
          <div className="w-28 lg:w-48">IP Address</div>
          <div className="w-24 lg:w-48">OS</div>
          <div className="w-16">Last Callback</div>
          <div className="w-20">Interval</div>
          <div className="w-16">PID</div>
          <div className="w-20">User</div>
          <div className="ml-auto">Status</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {filteredAgents.map((agent) => (
          <Card
            key={agent.agentId}
            className={`cursor-pointer transition-all hover:bg-accent/5 ${
              selectedAgent === agent.agentId ? "ring-2 ring-primary bg-primary/5" : ""
            }`}
            onClick={() => onAgentSelect(agent.agentId)}
          >
            <CardContent className="p-2">
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-2 w-40 lg:w-64 min-w-0">
                  {getOSIcon(agent.os)}
                  <span className="font-medium text-foreground truncate text-xs" title={agent.hostname}>{agent.hostname}</span>
                </div>

                <div className="w-28 lg:w-48 font-mono text-muted-foreground" title={agent.ipAddr}>{agent.ipAddr}</div>

                <div className="w-24 lg:w-48 text-muted-foreground truncate" title={agent.os}>{agent.os}</div>

                <div className="w-16 text-muted-foreground">{formatTimeSince(agent.lastSeenTimestamp)}</div>

                <div className="w-20 font-mono text-muted-foreground">
                  {formatCallbackInterval(agent.callbackInterval, agent.jitterValue)}
                </div>

                <div className="w-16 font-mono text-muted-foreground">{agent.pid}</div>

                <div className="w-20 text-muted-foreground truncate">{agent.user}</div>

                <div className="flex items-center gap-2 ml-auto">
                  {getStatusIcon(getDisplayStatus(agent))}
                  <Badge className={`${getStatusBadge(getDisplayStatus(agent))} text-xs px-2 py-0`}>
                    {getDisplayStatus(agent) === "possibly-dead" ? "dead?" : getDisplayStatus(agent)}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
