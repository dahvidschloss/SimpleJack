import { NextRequest, NextResponse } from "next/server"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

const COMMANDS_DIR = join(process.cwd(), "public", "data", "commands")

const DEFAULT_COMMANDS = {
  commands: [
    {
      id: "load",
      name: "load",
      synopsis: "Load new capabilities into the agent",
      min_integrity: "medium",
      opsec: "medium",
      parameters: [
        {
          name: "capability",
          type: "string",
          default: "",
          required: true,
          description:
            "Name of the capability to load (e.g., Token_Impersonation, Cred_Harvesting)",
        },
      ],
      preview: "load <capability>",
      parser: "generic",
      help:
        "Loads a new capability module into the agent. Available capabilities include Token_Impersonation, Cred_Harvesting, Process_Injection, and others.",
    },
    {
      id: "capes",
      name: "capes",
      synopsis: "Show loaded capabilities",
      min_integrity: "low",
      opsec: "safe",
      parameters: [],
      preview: "capes",
      parser: "generic",
      help:
        "Displays all capabilities currently loaded into the agent. Default capabilities include Loader, Console Execution, and Exit/Eat.",
    },
    {
      id: "agent_info",
      name: "agent_info",
      synopsis: "Display detailed agent information",
      min_integrity: "low",
      opsec: "safe",
      parameters: [],
      preview: "agent_info",
      parser: "generic",
      help:
        "Shows comprehensive information about the agent including status, configuration, capabilities, and system details.",
    },
    {
      id: "remove",
      name: "remove",
      synopsis:
        "removes the agent from the listing and databse. DOES NOT FORCE EAT!",
      min_integrity: "low",
      opsec: "safe",
      parameters: [
        {
          name: "id",
          type: "string",
          default: "",
          required: true,
          description: "first 8 charaters of the Agent ID, or 'dead' to purge offline agents",
        },
      ],
      preview: "remove <id|dead>",
      parser: "generic",
      help:
        "Removes the agent from the listing and databse. Use 'dead' to clear all offline agents. DOES NOT FORCE EAT!",
    },
  ],
}

export async function GET(_req: NextRequest, { params }: { params: { name: string } }) {
  try {
    const name = params.name
    if (!existsSync(COMMANDS_DIR)) mkdirSync(COMMANDS_DIR, { recursive: true })
    const filePath = join(COMMANDS_DIR, `${name}.json`)
    if (!existsSync(filePath)) {
      writeFileSync(filePath, JSON.stringify(DEFAULT_COMMANDS, null, 2), "utf8")
    }
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
    if (!body || typeof body !== "object" || !Array.isArray(body.commands)) {
      return NextResponse.json({ error: "Payload must have a commands array" }, { status: 400 })
    }
    if (!existsSync(COMMANDS_DIR)) mkdirSync(COMMANDS_DIR, { recursive: true })
    const filePath = join(COMMANDS_DIR, `${name}.json`)
    writeFileSync(filePath, JSON.stringify(body, null, 2), "utf8")
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as any)?.message || String(e) }, { status: 500 })
  }
}

export const dynamic = "force-dynamic"
