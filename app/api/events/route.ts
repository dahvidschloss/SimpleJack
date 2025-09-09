import { NextRequest, NextResponse } from "next/server"

const g = globalThis as any
g.__sseSubscribers = g.__sseSubscribers || new Set<{ id: number; send: (data: string) => void }>()

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const type = String(body.type || "message")
    const payload = body.payload ?? {}
    const json = JSON.stringify(payload)
    const msg = `event: ${type}\ndata: ${json}\n\n`
    for (const sub of g.__sseSubscribers as Set<{ id: number; send: (data: string) => void }>) {
      try { sub.send(msg) } catch {}
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as any).message || String(e) }, { status: 400 })
  }
}

export const dynamic = "force-dynamic"

