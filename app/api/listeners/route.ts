import { type NextRequest, NextResponse } from "next/server"
import { listenerDb } from "@/lib/database"

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
    const listenerData = {
      ...body,
      ip_addresses: JSON.stringify(body.ip_addresses || []),
      config: JSON.stringify(body.config || {}),
      bind_address: body.bind_address || "0.0.0.0",
      base_agent_key: body.base_agent_key || "",
      base_agent_name: body.base_agent_name || "",
      last_activity: Date.now(),
    }

    const listener = listenerDb.create(listenerData)
    return NextResponse.json(listener, { status: 201 })
  } catch (error) {
    console.error("Failed to create listener:", error)
    return NextResponse.json({ error: "Failed to create listener" }, { status: 500 })
  }
}
