import { NextRequest, NextResponse } from "next/server"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

const g = globalThis as any
g.__capeDownloads = g.__capeDownloads || new Map<string, { path: string; expiresAt: number }>()

const AGENTS_DIR = join(process.cwd(), "Agents")

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const agent = String(body.agent || "")
    const cape = String(body.cape || "")
    if (!agent || !cape) return NextResponse.json({ error: "agent and cape required" }, { status: 400 })

    const infoPath = join(AGENTS_DIR, agent, "agent.json")
    if (!existsSync(infoPath)) return NextResponse.json({ error: "agent not found" }, { status: 404 })
    const info = JSON.parse(readFileSync(infoPath, "utf8"))
    const capes = Array.isArray(info.capes) ? info.capes : []
    const entry = capes.find((c: any) => String(c.name) === cape)
    if (!entry || !entry.file) return NextResponse.json({ error: "cape file not configured" }, { status: 404 })
    const filePath = join(AGENTS_DIR, agent, String(entry.file))
    if (!existsSync(filePath)) return NextResponse.json({ error: "cape file missing" }, { status: 404 })

    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    g.__capeDownloads.set(token, { path: filePath, expiresAt: Date.now() + 5 * 60_000 })
    return NextResponse.json({ url: `/api/capes/${token}` })
  } catch (e) {
    return NextResponse.json({ error: (e as any)?.message || String(e) }, { status: 500 })
  }
}

export const dynamic = "force-dynamic"

