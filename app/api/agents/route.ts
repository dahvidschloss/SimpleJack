import { type NextRequest, NextResponse } from "next/server"
import { agentDb, type Agent } from "@/lib/database"

export async function GET() {
  try {
    const agents = agentDb.getAll()

    // Helper: parse "work_hours". Supports:
    // - "24/7" => always in hours
    // - "HH:MM-HH:MM" (e.g., "09:00-17:30") local time
    // - "HH-HH" (e.g., "9-17") local time
    const isWithinWorkHours = (workHours: string, now: Date) => {
      if (!workHours || workHours.trim().toLowerCase() === "24/7") return true
      const m = workHours.match(/^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?$/)
      if (!m) return true // unknown format => treat as always-on
      const [ , sh, sm, eh, em ] = m
      const startH = Math.max(0, Math.min(23, Number(sh)))
      const startM = Math.max(0, Math.min(59, sm ? Number(sm) : 0))
      const endH = Math.max(0, Math.min(23, Number(eh)))
      const endM = Math.max(0, Math.min(59, em ? Number(em) : 0))

      const minsNow = now.getHours() * 60 + now.getMinutes()
      const minsStart = startH * 60 + startM
      const minsEnd = endH * 60 + endM

      if (minsStart === minsEnd) return false // degenerate window => off
      if (minsStart < minsEnd) {
        // Simple same-day window
        return minsNow >= minsStart && minsNow < minsEnd
      }
      // Overnight window (e.g., 22:00-06:00)
      return minsNow >= minsStart || minsNow < minsEnd
    }

    // Compute and persist status on-the-fly based on callback + jitter + work hours
    const nowMs = Date.now()
    const updatedStatuses: Record<string, Agent["status"]> = {}
    for (const a of agents) {
      let status: Agent["status"] = a.status
      const withinHours = isWithinWorkHours(String(a.work_hours || "24/7"), new Date())

      if (!withinHours) {
        status = "hibernation"
      } else {
        const lastSeen = Number(a.last_seen_timestamp || 0) || (a.last_callback ? Date.parse(a.last_callback) : 0)
        const intervalSec = Math.max(1, Number(a.callback_interval || 60))
        const jitterPct = Math.max(0, Number(a.jitter_value || 0))
        const windowMs = intervalSec * 1000
        const jitterMs = Math.round(windowMs * (jitterPct / 100))

        const threshold1 = lastSeen + windowMs + jitterMs
        const threshold3 = lastSeen + 3 * (windowMs + jitterMs)

        if (nowMs <= threshold1) status = "online"
        else if (nowMs <= threshold3) status = "possibly-dead"
        else status = "offline"
      }

      if (status !== a.status) {
        try { agentDb.updateStatus(a.id, status) } catch {}
        updatedStatuses[a.id] = status
      }
    }

    // Transform database format to frontend format with robust parsing
    const transformedAgents = agents.map((agent) => {
      const parseJson = (val: any, fallback: any) => {
        try {
          if (val === null || val === undefined || val === "") return fallback
          const parsed = typeof val === "string" ? JSON.parse(val) : val
          return parsed
        } catch {
          return fallback
        }
      }

      const ipAddr = Array.isArray(agent.ip_addr)
        ? agent.ip_addr
        : parseJson(agent.ip_addr, typeof agent.ip_addr === "string" ? [agent.ip_addr] : [])

      const edr = Array.isArray(agent.edr) ? agent.edr : parseJson(agent.edr, [])
      const loadedCommands = Array.isArray(agent.loaded_commands)
        ? agent.loaded_commands
        : parseJson(agent.loaded_commands, [])

      return {
        ...agent,
        ipAddr,
        edr,
        loadedCommands,
        user: agent.user_context,
        IntegrityLevel: agent.integrity_level,
        terminalHistory: agent.terminal_history,
        // Ensure returned status matches any on-the-fly computation
        status: updatedStatuses[agent.id] ?? agent.status,
      }
    })

    return NextResponse.json(transformedAgents)
  } catch (error) {
    console.error("Failed to fetch agents:", error)
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Transform frontend format to database format
    const agentData = {
      ...body,
      ip_addr: JSON.stringify(body.ipAddr || body.ip_addr),
      edr: JSON.stringify(body.edr || []),
      loaded_commands: JSON.stringify(body.loadedCommands || []),
      user_context: body.user || body.user_context,
      integrity_level: body.IntegrityLevel || body.integrity_level,
      terminal_history: body.terminalHistory || body.terminal_history || "",
      last_seen_timestamp: Date.now(),
    }

    const agent = agentDb.create(agentData)
    return NextResponse.json(agent, { status: 201 })
  } catch (error) {
    console.error("Failed to create agent:", error)
    return NextResponse.json({ error: "Failed to create agent" }, { status: 500 })
  }
}
