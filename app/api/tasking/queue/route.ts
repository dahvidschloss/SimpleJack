import { type NextRequest, NextResponse } from "next/server"
import { agentDb, taskQueueDb } from "@/lib/database"
import { v4 as uuidv4 } from "uuid"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agentId, command, args = "", parser = "generic" } = body || {}

    if (!agentId || !command) {
      return NextResponse.json({ error: "agentId and command are required" }, { status: 400 })
    }

    const agent = agentDb.getById(agentId)
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    const task = taskQueueDb.enqueue({
      id: uuidv4(),
      agent_id: agentId,
      command: String(command),
      args: String(args || ""),
      parser: String(parser || "generic"),
      enqueued_at: new Date().toISOString(),
    })

    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    console.error("Failed to queue task:", error)
    return NextResponse.json({ error: "Failed to queue task" }, { status: 500 })
  }
}

