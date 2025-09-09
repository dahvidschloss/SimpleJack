import { NextRequest } from "next/server"

type Subscriber = {
  id: number
  send: (data: string) => void
}

const g = globalThis as any
g.__sseSubscribers = g.__sseSubscribers || new Set<Subscriber>()
let nextId = g.__sseNextId || 1

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
