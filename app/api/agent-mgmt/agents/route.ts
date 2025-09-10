import { NextRequest, NextResponse } from "next/server"
import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"

const AGENTS_DIR = join(process.cwd(), "Agents")
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
  ],
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = String(body.name || "").trim()
    const language = String(body.language || "")
    let capes = Array.isArray(body.capes) ? body.capes : []
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })

    const agentFolder = join(AGENTS_DIR, name)
    const commandsFile = join(COMMANDS_DIR, `${name}.json`)
    if (existsSync(agentFolder)) return NextResponse.json({ error: "agent already exists" }, { status: 409 })

    mkdirSync(agentFolder, { recursive: true })
    mkdirSync(COMMANDS_DIR, { recursive: true })

    // Seed default capes when not provided
    if (!capes || capes.length === 0) {
      capes = [
        { name: "loader", default: true, description: "Function to load new capabilities" },
        { name: "exit/eat", default: true, description: "Function to exit the process and/or eat (self-delete)" },
        { name: "Basics", default: true, description: "Basic settings like set callback interval or jitter" },
      ]
    }

    // Create agent info file
    const info = { name, language, capes }
    writeFileSync(join(agentFolder, "agent.json"), JSON.stringify(info, null, 2), "utf8")

    // Create default commands file if missing
    if (!existsSync(commandsFile)) {
      writeFileSync(commandsFile, JSON.stringify(DEFAULT_COMMANDS, null, 2), "utf8")
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as any)?.message || String(e) }, { status: 500 })
  }
}

export const dynamic = "force-dynamic"
