import { NextRequest, NextResponse } from "next/server"
import { readdirSync, statSync } from "fs"
import { join, relative } from "path"

const AGENTS_DIR = join(process.cwd(), "Agents")

function listFilesRecursive(dir: string, base: string, out: string[]) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    try {
      const st = statSync(full)
      if (st.isDirectory()) listFilesRecursive(full, base, out)
      else out.push(relative(base, full))
    } catch {}
  }
}

export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  try {
    const name = params.name
    const base = join(AGENTS_DIR, name)
    const out: string[] = []
    try { listFilesRecursive(base, base, out) } catch {}
    return NextResponse.json({ files: out })
  } catch (e) {
    return NextResponse.json({ error: (e as any)?.message || String(e) }, { status: 500 })
  }
}

export const dynamic = "force-dynamic"

