import { NextRequest } from "next/server"
import { readFileSync } from "fs"
import { basename } from "path"

const g = globalThis as any
g.__capeDownloads = g.__capeDownloads || new Map<string, { path: string; expiresAt: number }>()

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token
  try {
    const entry = g.__capeDownloads.get(token)
    if (!entry || entry.expiresAt < Date.now()) {
      try { g.__capeDownloads.delete(token) } catch {}
      return new Response("Not found", { status: 404 })
    }
    // one-time or time-bound access; we will allow one-time then delete
    g.__capeDownloads.delete(token)
    const data = readFileSync(entry.path)
    const filename = basename(entry.path)
    return new Response(data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}

export const dynamic = "force-dynamic"

