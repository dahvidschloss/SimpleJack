import { type NextRequest, NextResponse } from "next/server"
import { commandDb, agentDb } from "@/lib/database"
import { v4 as uuidv4 } from "uuid"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agentId, command, args = "", result = "", success = false, error = "" } = body

    // Verify agent exists
    const agent = agentDb.getById(agentId)
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    // Create command record
    const commandRecord = commandDb.create({
      id: uuidv4(),
      agent_id: agentId,
      command,
      command_args: args,
      command_result: result,
      success,
      error,
      time_tasked: new Date().toISOString(),
      time_completed: success ? new Date().toISOString() : undefined,
    })

    // Update agent's terminal history if result provided
    if (result) {
      const timestamp = new Date().toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })

      const newHistoryEntry = `${timestamp}\nAgent returned ${command} results at ${timestamp}:\n${result}\n\n`
      const currentHistory = agent.terminal_history || ""
      const updatedHistory = currentHistory + newHistoryEntry

      agentDb.update(agentId, {
        terminal_history: updatedHistory,
        last_queued_task: command,
        current_running_task: success ? "" : command,
        last_error_task: success ? "" : command,
        last_error: success ? "" : error,
      })
    }

    return NextResponse.json(commandRecord, { status: 201 })
  } catch (error) {
    console.error("Failed to create command:", error)
    return NextResponse.json({ error: "Failed to create command" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get("agentId")

    if (!agentId) {
      return NextResponse.json({ error: "Agent ID required" }, { status: 400 })
    }

    const commands = commandDb.getByAgentId(agentId)
    return NextResponse.json(commands)
  } catch (error) {
    console.error("Failed to fetch commands:", error)
    return NextResponse.json({ error: "Failed to fetch commands" }, { status: 500 })
  }
}
