import { type NextRequest, NextResponse } from "next/server"
import { agentDb } from "@/lib/database"

export async function GET() {
  try {
    const agents = agentDb.getAll()

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
