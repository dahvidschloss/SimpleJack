"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Monitor, Wifi, WifiOff, Activity, AlertTriangle } from "lucide-react"

interface Agent {
  agentId: string // UUID
  hostname: string // name of the host the agent is deployed on
  ipAddr: string // First IP of the Host
  os: string // OS of the host
  lastCallback: string // UTC of last time the agent connected
  createdTime: string // When did the agent first call into our c2
  callbackInterval: number // in seconds
  jitterValue: number // percentage
  pid: number // What is the current pid the agent is deployed into
  user: string // What user the agent is currently using or deployed as
  base_agent: string // What is the base of the agent
  commandHistory: string[] // history of the agent commands
  loadedCommands: string[] // list of loaded commands
  cwd: string // current working directory
  lastQueuedTask: string // what was the last task queued
  currentRunningTask: string // if the implant is assigned a task
  lastErrorTask: string // last error task
  listener: string // What listener its calling back to
  workHours: string // date time range of when the agent should be calling back
  killDate: string // the date/time in which the agent should eat itself
  edr: string[] // EDR(s) deployed on the host
  targetDomain: string // if this is set then the agent should know where its allowed to deploy
  lastError: string // historical record keeping
  defaultShell: string // default code execution shell
  status: "online" | "offline" | "connecting" | "possibly-dead" | "hibernation"
  lastSeenTimestamp: number // Unix timestamp for UI calculations
}

interface AgentDashboardProps {
  onAgentSelect: (agentId: string) => void
  selectedAgent: string | null
}

export function AgentDashboard({ onAgentSelect, selectedAgent }: AgentDashboardProps) {
  const [currentTime, setCurrentTime] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const [agents, setAgents] = useState<Agent[]>([
    {
      agentId: "a7f9e-4d2c-8b1a-3e5f-9c8d7b6a5e4f",
      hostname: "WS-ADMIN-01",
      ipAddr: "192.168.1.100",
      os: "Microsoft Windows 11 Pro",
      lastCallback: new Date(Date.now() - 45000).toISOString(),
      createdTime: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      callbackInterval: 60,
      jitterValue: 15,
      pid: 4892,
      user: "ACME\\administrator",
      base_agent: "Selfish_Cowboy",
      commandHistory: ["whoami", "pwd", "ls"],
      loadedCommands: ["Loader", "Console Execution", "Exit/Eat"],
      cwd: "C:\\Windows\\System32",
      lastQueuedTask: "whoami",
      currentRunningTask: "",
      lastErrorTask: "",
      listener: "edge-listener",
      workHours: "08:00-18:00",
      killDate: new Date(Date.now() + 15552000000).toISOString(), // 6 months from now
      edr: ["Windows Defender", "CrowdStrike"],
      targetDomain: "acme.corp",
      lastError: "",
      defaultShell: "powershell",
      status: "online",
      lastSeenTimestamp: Date.now() - 45000,
    },
    {
      agentId: "b8e7d-5c3b-9a2f-4e6d-8c7b6a5f4e3d",
      hostname: "SRV-DB-01",
      ipAddr: "192.168.1.50",
      os: "Ubuntu 22.04.3 LTS",
      lastCallback: new Date(Date.now() - 30000).toISOString(),
      createdTime: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
      callbackInterval: 120,
      jitterValue: 10,
      pid: 1337,
      user: "root",
      base_agent: "Silent_Penguin",
      commandHistory: ["id", "pwd", "ps aux"],
      loadedCommands: ["Loader", "Console Execution", "Exit/Eat", "Token_Impersonation"],
      cwd: "/home/admin",
      lastQueuedTask: "ps aux",
      currentRunningTask: "",
      lastErrorTask: "",
      listener: "http-listener",
      workHours: "24/7",
      killDate: new Date(Date.now() + 15552000000).toISOString(),
      edr: ["ClamAV"],
      targetDomain: "internal.lab",
      lastError: "",
      defaultShell: "bash",
      status: "online",
      lastSeenTimestamp: Date.now() - 30000,
    },
    {
      agentId: "c9f8e-6d4c-0b3a-5f7e-9d8c7b6a5f4e",
      hostname: "WS-DEV-02",
      ipAddr: "192.168.1.105",
      os: "macOS Sonoma 14.1",
      lastCallback: new Date(Date.now() - 300000).toISOString(),
      createdTime: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
      callbackInterval: 180,
      jitterValue: 20,
      pid: 2048,
      user: "admin",
      base_agent: "Golden_Apple",
      commandHistory: ["whoami", "pwd", "ls -la"],
      loadedCommands: ["Loader", "Console Execution", "Exit/Eat", "Cred_Harvesting"],
      cwd: "/Users/admin/Desktop",
      lastQueuedTask: "ls -la",
      currentRunningTask: "",
      lastErrorTask: "failed network connection",
      listener: "https-listener",
      workHours: "09:00-17:00",
      killDate: new Date(Date.now() + 15552000000).toISOString(),
      edr: ["XProtect"],
      targetDomain: "dev.acme.corp",
      lastError: "Connection timeout after 30s",
      defaultShell: "zsh",
      status: "possibly-dead",
      lastSeenTimestamp: Date.now() - 300000,
    },
    {
      agentId: "d0a9f-7e5d-1c4b-6g8f-0e9d8c7b6a5f",
      hostname: "SRV-WEB-01",
      ipAddr: "192.168.1.75",
      os: "CentOS 8.5.2111",
      lastCallback: new Date(Date.now() - 3600000).toISOString(),
      createdTime: new Date(Date.now() - 604800000).toISOString(), // 1 week ago
      callbackInterval: 300,
      jitterValue: 25,
      pid: 9876,
      user: "apache",
      base_agent: "Silent_Penguin",
      commandHistory: ["id", "pwd", "netstat -tulpn"],
      loadedCommands: ["Loader", "Console Execution", "Exit/Eat"],
      cwd: "/var/www/html",
      lastQueuedTask: "netstat -tulpn",
      currentRunningTask: "",
      lastErrorTask: "",
      listener: "dns-listener",
      workHours: "24/7",
      killDate: new Date(Date.now() + 15552000000).toISOString(),
      edr: ["SELinux"],
      targetDomain: "web.acme.corp",
      lastError: "",
      defaultShell: "bash",
      status: "offline",
      lastSeenTimestamp: Date.now() - 3600000,
    },
  ])

  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const calculateAgentStatus = (agent: Agent): Agent["status"] => {
    const timeSinceLastSeen = (currentTime - agent.lastSeenTimestamp) / 1000 // in seconds
    const maxJitterTime = (agent.callbackInterval * agent.jitterValue) / 100
    const possiblyDeadThreshold = agent.callbackInterval + maxJitterTime
    const offlineThreshold = 3 * agent.callbackInterval + maxJitterTime

    // Check work hours for hibernation status
    const now = new Date()
    const currentHour = now.getHours()
    if (agent.workHours !== "24/7") {
      const [startHour, endHour] = agent.workHours.split("-").map((h) => Number.parseInt(h.split(":")[0]))
      if (currentHour < startHour || currentHour >= endHour) {
        return "hibernation"
      }
    }

    if (timeSinceLastSeen <= possiblyDeadThreshold) {
      return "online"
    } else if (timeSinceLastSeen <= offlineThreshold) {
      return "possibly-dead"
    } else {
      return "offline"
    }
  }

  useEffect(() => {
    setAgents((prevAgents) =>
      prevAgents.map((agent) => ({
        ...agent,
        status: calculateAgentStatus(agent),
      })),
    )
  }, [currentTime])

  const filteredAgents = agents.filter((agent) => {
    const matchesSearch =
      agent.hostname.toLowerCase().includes(searchTerm.toLowerCase()) || agent.ipAddr.includes(searchTerm)

    let matchesStatus = false
    if (statusFilter === "all") {
      matchesStatus = true
    } else if (statusFilter === "online") {
      matchesStatus = agent.status === "online" || agent.status === "possibly-dead" || agent.status === "connecting"
    } else {
      matchesStatus = agent.status === statusFilter
    }

    return matchesSearch && matchesStatus
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "online":
        return <Wifi className="h-3 w-3 text-primary" />
      case "offline":
        return <WifiOff className="h-3 w-3 text-destructive" />
      case "possibly-dead":
        return <AlertTriangle className="h-3 w-3 text-yellow-500" />
      case "connecting":
        return <Activity className="h-3 w-3 text-accent animate-pulse" />
      case "hibernation":
        return <Monitor className="h-3 w-3 text-blue-500" />
      default:
        return <Monitor className="h-3 w-3 text-muted-foreground" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      online: "bg-primary/20 text-primary-foreground border-primary/30",
      offline: "bg-destructive/20 text-destructive-foreground border-destructive/30",
      "possibly-dead": "bg-yellow-500/20 text-yellow-900 border-yellow-500/30",
      connecting: "bg-accent/20 text-accent-foreground border-accent/30",
      hibernation: "bg-blue-500/20 text-blue-900 border-blue-500/30",
    }
    return variants[status as keyof typeof variants] || "bg-muted/20 text-muted-foreground"
  }

  const formatTimeSince = (timestamp: number) => {
    const secondsAgo = Math.floor((currentTime - timestamp) / 1000)

    if (secondsAgo < 180) {
      // Under 3 minutes, show seconds
      return `${secondsAgo}s ago`
    } else if (secondsAgo < 3600) {
      // Under 1 hour, show minutes
      const minutesAgo = Math.floor(secondsAgo / 60)
      return `${minutesAgo}m ago`
    } else {
      // Show hours
      const hoursAgo = Math.floor(secondsAgo / 3600)
      return `${hoursAgo}h ago`
    }
  }

  const formatCallbackInterval = (intervalSeconds: number, jitterPercent: number) => {
    if (intervalSeconds < 60) {
      return `${intervalSeconds}s ±${jitterPercent}%`
    } else if (intervalSeconds < 3600) {
      const minutes = Math.floor(intervalSeconds / 60)
      return `${minutes}m ±${jitterPercent}%`
    } else {
      const hours = Math.floor(intervalSeconds / 3600)
      return `${hours}h ±${jitterPercent}%`
    }
  }

  const getOSIcon = (os: string) => {
    if (os.toLowerCase().includes("windows")) {
      return (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.351" />
        </svg>
      )
    } else if (
      os.toLowerCase().includes("ubuntu") ||
      os.toLowerCase().includes("centos") ||
      os.toLowerCase().includes("linux")
    ) {
      return (
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c-.391.778-1.113 1.132-1.884 1.071-.771-.06-1.592-.536-2.257-1.306-.631-.765-1.683-1.084-2.378-1.503-.348-.199-.629-.469-.649-.853-.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 01-.088.069c-.104.105-.259.158-.436.158-.177 0-.33-.053-.435-.158-.105-.104-.258-.158-.435-.158h.002zm-2.962 7.28c-.209 0-.31.105-.31.315 0 .209.101.313.31.313.209 0 .313-.104.313-.313 0-.21-.104-.315-.313-.315zm5.805.717c-.209 0-.312.105-.312.315 0 .209.103.313.312.313.209 0 .314-.104.314-.313 0-.21-.105-.315-.314-.315z" />
        </svg>
      )
    } else if (os.toLowerCase().includes("macos") || os.toLowerCase().includes("mac")) {
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
            {agents.filter((a) => a.status === "online").length} / {agents.length} Online
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
          <div className="w-40">Hostname</div>
          <div className="w-28">IP Address</div>
          <div className="w-24">OS</div>
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
                <div className="flex items-center gap-2 w-40 min-w-0">
                  {getOSIcon(agent.os)}
                  <span className="font-medium text-foreground truncate text-xs">{agent.hostname}</span>
                </div>

                <div className="w-28 font-mono text-muted-foreground">{agent.ipAddr}</div>

                <div className="w-24 text-muted-foreground truncate">{agent.os}</div>

                <div className="w-16 text-muted-foreground">{formatTimeSince(agent.lastSeenTimestamp)}</div>

                <div className="w-20 font-mono text-muted-foreground">
                  {formatCallbackInterval(agent.callbackInterval, agent.jitterValue)}
                </div>

                <div className="w-16 font-mono text-muted-foreground">{agent.pid}</div>

                <div className="w-20 text-muted-foreground truncate">{agent.user}</div>

                <div className="flex items-center gap-2 ml-auto">
                  {getStatusIcon(agent.status)}
                  <Badge className={`${getStatusBadge(agent.status)} text-xs px-2 py-0`}>
                    {agent.status === "possibly-dead" ? "dead?" : agent.status}
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
