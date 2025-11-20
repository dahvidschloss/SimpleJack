"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AgentDashboard } from "@/components/agent-dashboard"
import { AgentMgmtList } from "@/components/agent-mgmt-list"
import { AgentMgmtEditor } from "@/components/agent-mgmt-editor"
import { TerminalInterface } from "@/components/terminal-interface"
import { ListenerDashboard } from "@/components/listener-dashboard"
import { ListenerEditor } from "@/components/listener-editor"
import { NewListenerWizard } from "@/components/new-listener-wizard"

interface Agent {
  id: string // UUID
  hostname: string // name of the host the agent is deployed on
  ipAddr: string | string[] // First IP of the Host or multiple IPs
  os: string // OS of the host
  build: string // OS build version
  lastCallback: string // UTC of last time the agent connected
  createdTime: string // When did the agent first call into our c2
  callbackInterval: number // in seconds
  jitterValue: number // percentage
  jitterTranslate: number // calculated jitter time in seconds
  pid: number // What is the current pid the agent is deployed into
  user: string // What user the agent is currently using or deployed as
  base_agent: string // What is the base of the agent
  terminalHistory: string // history of terminal output
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
  IntegrityLevel: string // integrity/permission level of the agent
  status: "online" | "offline" | "connecting" | "possibly-dead" | "hibernation"
  lastSeenTimestamp: number // Unix timestamp for UI calculations
}

interface Listener {
  id: string
  name: string
  protocol: "http" | "https" | "dns" | "icmp" | "tcp"
  port: number
  public_dns: string
  ip_addresses?: string[] 
  status: "active" | "inactive" | "error"
  last_activity: number
  requests_count: number
  errors_count: number
  agent_key: string
  agent_id: string
}

export default function CommandControlPage() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [selectedListener, setSelectedListener] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("agents")
  const [listeners, setListeners] = useState<Listener[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [showNewListenerWizard, setShowNewListenerWizard] = useState(false)
  const [selectedMgmtAgent, setSelectedMgmtAgent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true) // initial page load only
  const [fetching, setFetching] = useState(false) // background fetch state
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false) // disable periodic polling for now

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setFetching(true)
        const agentsResponse = await fetch("/api/agents")
        if (agentsResponse.ok) {
          const agentsData = await agentsResponse.json()
          const normalized = agentsData.map((a: any) => ({
            id: a.id,
            hostname: a.hostname,
            ipAddr: Array.isArray(a.ipAddr) ? a.ipAddr : (() => {
              try {
                const parsed = JSON.parse(a.ip_addr || "[]")
                return Array.isArray(parsed) ? parsed : [String(a.ip_addr || "")]
              } catch {
                return [String(a.ip_addr || "")]
              }
            })(),
            os: a.os,
            build: a.build,
            lastCallback: a.last_callback,
            createdTime: a.created_time,
            callbackInterval: a.callback_interval,
            jitterValue: a.jitter_value,
            jitterTranslate: a.jitter_translate,
            pid: a.pid,
            user: a.user ?? a.user_context,
            base_agent: a.base_agent,
            terminalHistory: a.terminalHistory ?? a.terminal_history ?? "",
            loadedCommands: a.loadedCommands ?? (() => { try { return JSON.parse(a.loaded_commands || "[]") } catch { return [] } })(),
            cwd: a.cwd,
            lastQueuedTask: a.last_queued_task,
            currentRunningTask: a.current_running_task,
            lastErrorTask: a.last_error_task,
            listener: a.listener,
            workHours: a.work_hours,
            killDate: a.kill_date,
            edr: a.edr ?? (() => { try { return JSON.parse(a.edr || "[]") } catch { return [] } })(),
            targetDomain: a.target_domain,
            lastError: a.last_error,
            defaultShell: a.default_shell,
            IntegrityLevel: a.IntegrityLevel ?? a.integrity_level,
            status: a.status,
            lastSeenTimestamp: a.lastSeenTimestamp ?? a.last_seen_timestamp,
          }))
          setAgents(normalized)
        } else {
          console.error("Failed to fetch agents")
          setAgents([])
        }
      } catch (error) {
        console.error("Error fetching agents:", error)
        setAgents([])
      } finally {
        setFetching(false)
      }
    }

    const fetchListeners = async () => {
      try {
        setFetching(true)
        const listenersResponse = await fetch("/api/listeners")
        if (listenersResponse.ok) {
          const listenersData = await listenersResponse.json()
          const normalizedListeners = listenersData.map((l: any) => ({
            id: l.id,
            name: l.name,
            protocol: l.protocol,
            port: l.port,
            public_dns: l.public_dns,
            ip_addresses: l.ip_addresses ?? (() => { try { return JSON.parse(l.ip_addresses || "[]") } catch { return [] } })(),
            status: l.status,
            last_activity: l.last_activity,
            requests_count: l.requests_count,
            errors_count: l.errors_count,
          }))
          setListeners(normalizedListeners)
        } else {
          console.error("Failed to fetch listeners")
          setListeners([])
        }
      } catch (error) {
        console.error("Error fetching listeners:", error)
        setListeners([])
      } finally {
        setFetching(false)
      }
    }

    const fetchData = async () => {
      // Initial blocking spinner only the first time
      setLoading((prev) => prev && true)
      if (activeTab === "agents") await fetchAgents()
      if (activeTab === "listeners") await fetchListeners()
      setLoading(false)
    }

    fetchData()
    // No background polling to avoid input disruption; manual refresh via button can be added
  }, [activeTab])

  // Lightweight periodic refresh for agents only, preserves terminal input
  useEffect(() => {
    let cancelled = false
    const fetchAgentsOnly = async () => {
      try {
        const res = await fetch('/api/agents')
        if (res.ok) {
          const agentsData = await res.json()
          const normalized = agentsData.map((a: any) => ({
            id: a.id,
            hostname: a.hostname,
            ipAddr: Array.isArray(a.ipAddr) ? a.ipAddr : (() => { try { const parsed = JSON.parse(a.ip_addr || "[]"); return Array.isArray(parsed) ? parsed : [String(a.ip_addr || "")] } catch { return [String(a.ip_addr || "")] } })(),
            os: a.os,
            build: a.build,
            lastCallback: a.last_callback,
            createdTime: a.created_time,
            callbackInterval: a.callback_interval,
            jitterValue: a.jitter_value,
            jitterTranslate: a.jitter_translate,
            pid: a.pid,
            user: a.user ?? a.user_context,
            base_agent: a.base_agent,
            terminalHistory: a.terminalHistory ?? a.terminal_history ?? "",
            loadedCommands: a.loadedCommands ?? (() => { try { return JSON.parse(a.loaded_commands || "[]") } catch { return [] } })(),
            cwd: a.cwd,
            lastQueuedTask: a.last_queued_task,
            currentRunningTask: a.current_running_task,
            lastErrorTask: a.last_error_task,
            listener: a.listener,
            workHours: a.work_hours,
            killDate: a.kill_date,
            edr: a.edr ?? (() => { try { return JSON.parse(a.edr || "[]") } catch { return [] } })(),
            targetDomain: a.target_domain,
            lastError: a.last_error,
            defaultShell: a.default_shell,
            IntegrityLevel: a.IntegrityLevel ?? a.integrity_level,
            status: a.status,
            lastSeenTimestamp: a.lastSeenTimestamp ?? a.last_seen_timestamp,
          }))
          if (!cancelled) setAgents(normalized)
        }
      } catch {}
    }
    const onRefresh = () => fetchAgentsOnly()
    window.addEventListener('agents:refresh', onRefresh)
    // SSE subscription (singleton) for push events to avoid multiple stream connections
    try {
      const w = window as any
      if (!w.__sse) {
        w.__sse = new EventSource('/api/events/stream')
      }
      const es: EventSource = w.__sse
      const onAgents = () => fetchAgentsOnly()
      const onCommand = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data)
          window.dispatchEvent(new CustomEvent('command:result', { detail: data }))
        } catch {}
      }
      const onTaskDispatch = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data)
          window.dispatchEvent(new CustomEvent('task:dispatched', { detail: data }))
        } catch {}
      }
      es.addEventListener('agents:refresh', onAgents as any)
      es.addEventListener('command:result', onCommand as any)
      es.addEventListener('task:dispatched', onTaskDispatch as any)
      return () => {
        cancelled = true
        window.removeEventListener('agents:refresh', onRefresh)
        es.removeEventListener('agents:refresh', onAgents as any)
        es.removeEventListener('command:result', onCommand as any)
        es.removeEventListener('task:dispatched', onTaskDispatch as any)
      }
    } catch {
      return () => { cancelled = true; window.removeEventListener('agents:refresh', onRefresh) }
    }
  }, [])

  const updateListenerStatus = async (listenerId: string, status: "active" | "inactive" | "error") => {
    try {
      const response = await fetch(`/api/listeners/${listenerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, last_activity: Date.now() }),
      })

      if (response.ok) {
        const updatedListener = await response.json()
        setListeners((prev) => prev.map((listener) => (listener.id === listenerId ? updatedListener : listener)))
      }
    } catch (error) {
      console.error("Failed to update listener status:", error)
      // Fallback to local state update
      setListeners((prev) =>
        prev.map((listener) =>
          listener.id === listenerId ? { ...listener, status, last_activity: Date.now() } : listener,
        ),
      )
    }
  }

  const deleteListener = async (listenerId: string) => {
    try {
      const res = await fetch(`/api/listeners/${listenerId}`, { method: "DELETE" })
      if (res.ok || res.status === 404) {
        // Consider 404 as already-deleted; remove from UI
        setListeners((prev) => prev.filter((l) => l.id !== listenerId))
        if (selectedListener === listenerId) setSelectedListener(null)
      }
    } catch (e) {
      // Optimistic removal on network errors
      setListeners((prev) => prev.filter((l) => l.id !== listenerId))
      if (selectedListener === listenerId) setSelectedListener(null)
    }
  }

  const updateListener = async (listenerId: string, updatedListener: Listener) => {
    try {
      const response = await fetch(`/api/listeners/${listenerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedListener),
      })

      if (response.ok) {
        const savedListener = await response.json()
        setListeners((prev) => prev.map((listener) => (listener.id === listenerId ? savedListener : listener)))
      }
    } catch (error) {
      console.error("Failed to update listener:", error)
      // Fallback to local state update
      setListeners((prev) =>
        prev.map((listener) =>
          listener.id === listenerId ? { ...updatedListener, last_activity: Date.now() } : listener,
        ),
      )
    }
  }

  const handleWizardComplete = async (newListener: any) => {
    try {
      const response = await fetch("/api/listeners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newListener),
      })

      if (response.ok) {
        const listener = await response.json()
        setListeners((prev) => [...prev, listener])
        setSelectedListener(listener.id)
      }
    } catch (error) {
      console.error("Failed to create listener:", error)
      // Fallback to local state update
      const listener: Listener = {
        id: newListener.id,
        name: newListener.name,
        protocol: newListener.protocol,
        port: newListener.port,
        public_dns: newListener.public_dns || "",
        ip_addresses: newListener.ip_addresses || [],
        status: "active",
        last_activity: Date.now(),
        requests_count: 0,
        errors_count: 0,
      }
      setListeners((prev) => [...prev, listener])
      setSelectedListener(listener.id)
    }

    setShowNewListenerWizard(false)
  }

  const handleWizardCancel = () => {
    setShowNewListenerWizard(false)
  }

  // No static agents; all data comes from DB

  // No static listeners; all data comes from DB

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 rounded-full bg-primary animate-pulse mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading Command & Control Interface...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/simpleJack.png" alt="Simple Jack" className="h-10 w-10" />
            <h1 className="text-2xl font-bold text-foreground">Simple Jack C2</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
              <span className="text-sm text-muted-foreground">System Active</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Left Panel - Agents/Listeners */}
        <div className="w-1/2 border-r border-border">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="mx-4 mt-4">
              <TabsTrigger value="agents">Agents</TabsTrigger>
              <TabsTrigger value="listeners">Listeners</TabsTrigger>
              <TabsTrigger value="agent-mgmt">Agent Mgmt</TabsTrigger>
            </TabsList>

            <TabsContent value="agents" className="flex-1 mt-4 mx-4">
              <AgentDashboard onAgentSelect={setSelectedAgent} selectedAgent={selectedAgent} agentsData={agents} />
            </TabsContent>

            <TabsContent value="listeners" className="flex-1 mt-4 mx-4">
              <ListenerDashboard
                onListenerSelect={setSelectedListener}
                selectedListener={selectedListener}
                listeners={listeners}
                onListenerStatusUpdate={updateListenerStatus}
                onListenerDelete={deleteListener}
                onNewListener={() => setShowNewListenerWizard(true)}
              />
            </TabsContent>

            <TabsContent value="agent-mgmt" className="flex-1 mt-4 mx-4">
              <AgentMgmtList selected={selectedMgmtAgent} onSelect={setSelectedMgmtAgent} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Panel - Terminal/Listener Editor/Wizard */}
        <div className="w-1/2">
          {activeTab === "agents" ? (
            <TerminalInterface
              selectedAgent={selectedAgent}
              agents={agents.map((a) => ({
                id: a.id,
                hostname: a.hostname,
                ip: Array.isArray(a.ipAddr) ? a.ipAddr : a.ipAddr ? [a.ipAddr as any] : [],
                os: a.os,
                status: a.status,
                lastSeenTimestamp: a.lastSeenTimestamp,
                callbackInterval: a.callbackInterval,
                jitterPercent: a.jitterValue,
                pid: a.pid,
                user: a.user,
                base_agent: a.base_agent,
                loadedCommands: a.loadedCommands,
                cwd: a.cwd,
                lastQueuedTask: a.lastQueuedTask,
                currentRunningTask: a.currentRunningTask,
                lastErrorTask: a.lastErrorTask,
                commandHistory: [],
                build: a.build,
                defaultShell: a.defaultShell,
                IntegrityLevel: a.IntegrityLevel,
                edr: a.edr,
                listener: a.listener,
              }))}
            />
          ) : activeTab === "agent-mgmt" ? (
            <AgentMgmtEditor selected={selectedMgmtAgent} />
          ) : showNewListenerWizard ? (
            <NewListenerWizard onComplete={handleWizardComplete} onCancel={handleWizardCancel} />
          ) : (
            <ListenerEditor
              selectedListener={selectedListener}
              listeners={listeners}
              onListenerStatusUpdate={updateListenerStatus}
              onListenerUpdate={updateListener}
              agents={agents}
            />
          )}
        </div>
      </div>
    </div>
  )
}
