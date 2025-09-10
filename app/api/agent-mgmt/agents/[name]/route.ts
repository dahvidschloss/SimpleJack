import { NextRequest, NextResponse } from "next/server"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"

const AGENTS_DIR = join(process.cwd(), "Agents")
const COMMANDS_DIR = join(process.cwd(), "public", "data", "commands")

export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  try {
    const name = params.name
    const filePath = join(AGENTS_DIR, name, "agent.json")
    if (!existsSync(filePath)) return NextResponse.json({ error: "not found" }, { status: 404 })
    const text = readFileSync(filePath, "utf8")
    const json = JSON.parse(text)
    return NextResponse.json(json)
  } catch (e) {
    return NextResponse.json({ error: (e as any)?.message || String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { name: string } }) {
  try {
    const name = params.name
    const body = await req.json()
    if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid body" }, { status: 400 })
    const folder = join(AGENTS_DIR, name)
    if (!existsSync(folder)) mkdirSync(folder, { recursive: true })
    const filePath = join(folder, "agent.json")
    const payload = {
      name,
      language: String(body.language || ""),
      capes: Array.isArray(body.capes) ? body.capes : [],
    }
    writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8")
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as any)?.message || String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { name: string } }) {
  try {
    const name = params.name
    const folder = join(AGENTS_DIR, name)
    const cmdFile = join(COMMANDS_DIR, `${name}.json`)
    // Remove agent folder and commands file if present
    try { rmSync(folder, { recursive: true, force: true }) } catch {}
    try { rmSync(cmdFile, { force: true }) } catch {}
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as any)?.message || String(e) }, { status: 500 })
  }
}

export const dynamic = "force-dynamic"

