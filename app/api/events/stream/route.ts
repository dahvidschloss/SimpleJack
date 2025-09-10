import { NextRequest } from "next/server"
import { agentDb, type Agent } from "@/lib/database"

type Subscriber = {
  id: number
  send: (data: string) => void
}

const g = globalThis as any
g.__sseSubscribers = g.__sseSubscribers || new Set<Subscriber>()
let nextId = g.__sseNextId || 1

// Helper: parse work hours: "24/7" or "HH:MM-HH:MM" or "H-H"
function isWithinWorkHours(workHours: string, now: Date) {
  if (!workHours || String(workHours).trim().toLowerCase() === "24/7") return true
  const m = String(workHours).match(/^(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?$/)
  if (!m) return true
  const [ , sh, sm, eh, em ] = m
  const startH = Math.max(0, Math.min(23, Number(sh)))
  const startM = Math.max(0, Math.min(59, sm ? Number(sm) : 0))
  const endH = Math.max(0, Math.min(23, Number(eh)))
  const endM = Math.max(0, Math.min(59, em ? Number(em) : 0))
  const minsNow = now.getHours() * 60 + now.getMinutes()
  const minsStart = startH * 60 + startM
  const minsEnd = endH * 60 + endM
  if (minsStart === minsEnd) return false
  if (minsStart < minsEnd) return minsNow >= minsStart && minsNow < minsEnd
  return minsNow >= minsStart || minsNow < minsEnd
}

function broadcast(type: string, payload: any) {
  try {
    const json = JSON.stringify(payload ?? {})
    const msg = `event: ${type}\ndata: ${json}\n\n`
    for (const sub of g.__sseSubscribers as Set<Subscriber>) {
      try { sub.send(msg) } catch {}
    }
  } catch {}
}

// Ensure a single global 30s status reconciliation interval
if (!g.__agentStatusInterval) {
  g.__agentStatusInterval = setInterval(() => {
    try {
      const agents = agentDb.getAll()
      const nowMs = Date.now()
      const changed: string[] = []
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
          changed.push(a.id)
        }
      }
      if (changed.length > 0) broadcast('agents:refresh', { ids: changed })
    } catch {}
  }, 30_000)
}

export async function GET(req: NextRequest) {
  let closed = false
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      const send = (data: string) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(data)) } catch { /* stream closed */ }
      }
      const sub: Subscriber = { id: nextId++, send }
      g.__sseSubscribers.add(sub)
      send(`event: ping\ndata: ok\n\n`)
      const interval = setInterval(() => send(`event: ping\ndata: ok\n\n`), 15000)
      const close = () => {
        if (closed) return
        closed = true
        clearInterval(interval)
        g.__sseSubscribers.delete(sub)
        // If no subscribers remain, keep the global status interval running for backend consistency.
        try { controller.close() } catch {}
      }
      try { req.signal.addEventListener("abort", close) } catch {}
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

export const dynamic = "force-dynamic"
