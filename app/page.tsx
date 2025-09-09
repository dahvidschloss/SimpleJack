"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AgentDashboard } from "@/components/agent-dashboard"
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
  ip_addresses?: string[] // Added IP addresses support
  status: "active" | "inactive" | "error"
  last_activity: number
  requests_count: number
  errors_count: number
}

export default function CommandControlPage() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [selectedListener, setSelectedListener] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("agents")
  const [listeners, setListeners] = useState<Listener[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [showNewListenerWizard, setShowNewListenerWizard] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)

        // Fetch agents from API
        const agentsResponse = await fetch("/api/agents")
        if (agentsResponse.ok) {
          const agentsData = await agentsResponse.json()
          setAgents(agentsData)
        } else {
          console.error("Failed to fetch agents")
          // Fallback to sample data if API fails
          setAgents(sampleAgents)
        }

        // Fetch listeners from API
        const listenersResponse = await fetch("/api/listeners")
        if (listenersResponse.ok) {
          const listenersData = await listenersResponse.json()
          setListeners(listenersData)
        } else {
          console.error("Failed to fetch listeners")
          // Fallback to sample data if API fails
          setListeners(sampleListeners)
        }
      } catch (error) {
        console.error("Error fetching data:", error)
        // Fallback to sample data on error
        setAgents(sampleAgents)
        setListeners(sampleListeners)
      } finally {
        setLoading(false)
      }
    }

    fetchData()

    // Set up polling for real-time updates
    const interval = setInterval(fetchData, 30000) // Poll every 30 seconds
    return () => clearInterval(interval)
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

  const sampleAgents: Agent[] = [
    {
      id: "a7f9e-4d2c-8b1a-3e5f-9c8d7b6a5e4f",
      hostname: "WS-ADMIN-01",
      ipAddr: ["192.168.1.100", "10.10.10.10"],
      os: "Microsoft Windows 11 Pro",
      build: "10.0.26100 N/A Build 26100",
      lastCallback: new Date(Date.now() - 45000).toISOString(),
      createdTime: new Date(Date.now() - 86400000).toISOString(),
      callbackInterval: 60,
      jitterValue: 15,
      jitterTranslate: 9,
      pid: 4892,
      user: "ACME\\administrator",
      base_agent: "Selfish_Cowboy",
      terminalHistory: `13:44:10\nAgent returned ls results at 13:44:20:\ntotal 24\ndrwxr-xr-x  4 user user 4096 Dec  8 10:30 .`,
      loadedCommands: ["Loader", "Console Execution", "Exit/Eat"],
      cwd: "C:\\Windows\\System32",
      lastQueuedTask: "whoami",
      currentRunningTask: "",
      lastErrorTask: "",
      listener: "edge-listener",
      workHours: "08:00-18:00",
      killDate: new Date(Date.now() + 15552000000).toISOString(),
      edr: ["Windows Defender", "CrowdStrike"],
      targetDomain: "acme.corp",
      lastError: "",
      defaultShell: "powershell",
      IntegrityLevel: "Administrator",
      status: "online",
      lastSeenTimestamp: Date.now() - 45000,
    },
  ]

  const sampleListeners: Listener[] = [
    {
      id: "lst-001",
      name: "Edge-Listener",
      protocol: "https",
      port: 443,
      public_dns: "updates.example.com",
      ip_addresses: [],
      status: "active",
      last_activity: Date.now() - 30000,
      requests_count: 1247,
      errors_count: 3,
    },
  ]

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
          <h1 className="text-2xl font-bold text-foreground">Command & Control Interface</h1>
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
            </TabsList>

            <TabsContent value="agents" className="flex-1 mt-4 mx-4">
              <AgentDashboard onAgentSelect={setSelectedAgent} selectedAgent={selectedAgent} />
            </TabsContent>

            <TabsContent value="listeners" className="flex-1 mt-4 mx-4">
              <ListenerDashboard
                onListenerSelect={setSelectedListener}
                selectedListener={selectedListener}
                listeners={listeners}
                onListenerStatusUpdate={updateListenerStatus}
                onNewListener={() => setShowNewListenerWizard(true)}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Panel - Terminal/Listener Editor/Wizard */}
        <div className="w-1/2">
          {activeTab === "agents" ? (
            <TerminalInterface selectedAgent={selectedAgent} agents={agents} />
          ) : showNewListenerWizard ? (
            <NewListenerWizard onComplete={handleWizardComplete} onCancel={handleWizardCancel} />
          ) : (
            <ListenerEditor
              selectedListener={selectedListener}
              listeners={listeners}
              onListenerStatusUpdate={updateListenerStatus}
              onListenerUpdate={updateListener}
            />
          )}
        </div>
      </div>
    </div>
  )
}
