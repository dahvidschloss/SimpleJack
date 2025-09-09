import { type NextRequest, NextResponse } from "next/server"
import { listenerDb } from "@/lib/database"
const CONTROL_URL = "http://127.0.0.1:47791/control"
import { randomBytes } from "crypto"

export async function GET() {
  try {
    const listeners = listenerDb.getAll()

    // Transform database format to frontend format
    const transformedListeners = listeners.map((listener) => ({
      ...listener,
      ip_addresses: JSON.parse(listener.ip_addresses),
      config: JSON.parse(listener.config),
    }))

    return NextResponse.json(transformedListeners)
  } catch (error) {
    console.error("Failed to fetch listeners:", error)
    return NextResponse.json({ error: "Failed to fetch listeners" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Transform frontend format to database format
    const ensureAgentKey = (key?: string) => (key && String(key).length > 0 ? key : randomBytes(32).toString("hex"))

    // Compose config from top-level fields if missing
    const cfg = body.config ?? {
      target_domain: body.target_domain,
      http: body.http,
      tls: body.tls,
      dns: body.dns,
      icmp: body.icmp,
      tcp: body.tcp,
      crypto: body.crypto,
      endpoints: body.endpoints,
      connection: body.connection,
    }
    if ((body.protocol === "http" || body.protocol === "https") && (!cfg?.http || (!cfg.http.get_endpoints && !cfg.http.post_endpoints))) {
      cfg.http = cfg.http || {}
      cfg.http.get_endpoints = cfg.http.get_endpoints || ["/api/health"]
      cfg.http.post_endpoints = cfg.http.post_endpoints || ["/api/telemetry"]
    }

    const listenerData = {
      ...body,
      ip_addresses: JSON.stringify(body.ip_addresses || []),
      config: JSON.stringify(cfg || {}),
      bind_address: body.bind_address || body.bind_addr || "0.0.0.0",
      base_agent_key:
        typeof body.base_agent_key === "object" && body.base_agent_key !== null
          ? ensureAgentKey(body.base_agent_key.key)
          : ensureAgentKey(body.base_agent_key),
      base_agent_name:
        typeof body.base_agent_key === "object" && body.base_agent_key !== null
          ? body.base_agent_key.name || body.base_agent_name || ""
          : body.base_agent_name || "",
      last_activity: Date.now(),
    }

    const listener = listenerDb.create(listenerData)
    // Return transformed format for frontend consumption
    const transformed = {
      ...listener,
      ip_addresses: JSON.parse(listener.ip_addresses || "[]"),
      config: JSON.parse(listener.config || "{}"),
    }
    try {
      if (transformed.status === 'active') {
        await fetch(CONTROL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'start', id: transformed.id }) })
      }
    } catch {}
    return NextResponse.json(transformed, { status: 201 })
  } catch (error) {
    console.error("Failed to create listener:", error)
    return NextResponse.json({ error: "Failed to create listener" }, { status: 500 })
  }
}
