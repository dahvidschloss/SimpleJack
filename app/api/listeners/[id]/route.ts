import { type NextRequest, NextResponse } from "next/server"
import { listenerDb } from "@/lib/database"
const CONTROL_URL = "http://127.0.0.1:47791/control"
import { randomBytes } from "crypto"

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const listener = listenerDb.getById(params.id)
    if (!listener) return NextResponse.json({ error: "Listener not found" }, { status: 404 })

    const transformed = {
      ...listener,
      ip_addresses: JSON.parse(listener.ip_addresses || "[]"),
      config: JSON.parse(listener.config || "{}"),
    }
    return NextResponse.json(transformed)
  } catch (error) {
    console.error("Failed to fetch listener:", error)
    return NextResponse.json({ error: "Failed to fetch listener" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()

    const updates: Record<string, any> = {}

    const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

    if (has("name")) updates.name = body.name
    if (has("protocol")) updates.protocol = body.protocol
    if (has("port")) updates.port = body.port
    if (has("public_dns")) updates.public_dns = body.public_dns
    if (has("requests_count")) updates.requests_count = body.requests_count
    if (has("errors_count")) updates.errors_count = body.errors_count
    if (has("status")) updates.status = body.status

    // bind_address may be provided as bind_addr
    if (has("bind_address") || has("bind_addr")) {
      updates.bind_address = body.bind_address ?? body.bind_addr
    }

    // Structured fields
    if (has("ip_addresses")) updates.ip_addresses = JSON.stringify(body.ip_addresses || [])
    if (has("config")) {
      updates.config = JSON.stringify(body.config || {})
    } else {
      // Build config from top-level if provided individually
      const cfg = {
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
      // Only set if any key present
      if (Object.values(cfg).some((v) => v !== undefined)) {
        // ensure defaults for http endpoints when protocol is http/https
        if ((body.protocol === "http" || body.protocol === "https") && (!cfg.http || (!cfg.http.get_endpoints && !cfg.http.post_endpoints))) {
          cfg.http = cfg.http || {}
          cfg.http.get_endpoints = cfg.http.get_endpoints || ["/api/health"]
          cfg.http.post_endpoints = cfg.http.post_endpoints || ["/api/telemetry"]
        }
        updates.config = JSON.stringify(cfg)
      }
    }

    // Base agent key/name may come as object or separate fields; ensure key exists
    const ensureAgentKey = (key?: string) => (key && String(key).length > 0 ? key : randomBytes(32).toString("hex"))
    if (typeof body.base_agent_key === "object" && body.base_agent_key !== null) {
      updates.base_agent_key = ensureAgentKey(body.base_agent_key.key)
      updates.base_agent_name = body.base_agent_key.name ?? body.base_agent_name ?? ""
    } else {
      if (has("base_agent_key")) updates.base_agent_key = ensureAgentKey(body.base_agent_key)
      if (has("base_agent_name")) updates.base_agent_name = body.base_agent_name
    }

    // Always bump last_activity if provided or when saving
    updates.last_activity = body.last_activity ?? Date.now()

    const updated = listenerDb.update(params.id, updates)
    if (!updated) return NextResponse.json({ error: "Listener not found" }, { status: 404 })

    const transformed = {
      ...updated,
      ip_addresses: JSON.parse(updated.ip_addresses || "[]"),
      config: JSON.parse(updated.config || "{}"),
    }
    // Trigger immediate runner action: stop when inactive, reload/start on active or config changes
    try {
      const op = transformed.status === 'inactive' ? 'stop' : 'reload'
      await fetch(CONTROL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, id: params.id }) })
    } catch {}
    return NextResponse.json(transformed)
  } catch (error) {
    console.error("Failed to update listener:", error)
    return NextResponse.json({ error: "Failed to update listener" }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const deleted = listenerDb.delete(params.id)
    if (!deleted) return NextResponse.json({ error: "Listener not found" }, { status: 404 })
    try {
      await fetch(CONTROL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'stop', id: params.id }) })
    } catch {}
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete listener:", error)
    return NextResponse.json({ error: "Failed to delete listener" }, { status: 500 })
  }
}
