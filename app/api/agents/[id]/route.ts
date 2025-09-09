import { type NextRequest, NextResponse } from "next/server"
import { agentDb } from "@/lib/database"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const agent = agentDb.getById(params.id)

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    // Transform database format to frontend format
    const transformedAgent = {
      ...agent,
      ipAddr: JSON.parse(agent.ip_addr),
      edr: JSON.parse(agent.edr),
      loadedCommands: JSON.parse(agent.loaded_commands),
      user: agent.user_context,
      IntegrityLevel: agent.integrity_level,
      terminalHistory: agent.terminal_history,
    }

    return NextResponse.json(transformedAgent)
  } catch (error) {
    console.error("Failed to fetch agent:", error)
    return NextResponse.json({ error: "Failed to fetch agent" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()

    // Transform frontend format to database format
    const updates = {
      ...body,
      ip_addr: body.ipAddr ? JSON.stringify(body.ipAddr) : undefined,
      edr: body.edr ? JSON.stringify(body.edr) : undefined,
      loaded_commands: body.loadedCommands ? JSON.stringify(body.loadedCommands) : undefined,
      user_context: body.user || undefined,
      integrity_level: body.IntegrityLevel || undefined,
      terminal_history: body.terminalHistory || undefined,
    }

    // Remove undefined values
    Object.keys(updates).forEach((key) => {
      if (updates[key as keyof typeof updates] === undefined) {
        delete updates[key as keyof typeof updates]
      }
    })

    const agent = agentDb.update(params.id, updates)

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    return NextResponse.json(agent)
  } catch (error) {
    console.error("Failed to update agent:", error)
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ok = agentDb.delete(params.id)
    if (!ok) return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete agent:", error)
    return NextResponse.json({ error: "Failed to delete agent" }, { status: 500 })
  }
}
