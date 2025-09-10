import { NextResponse } from "next/server"
import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from "fs"
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
          description: "first 8 charaters of the Agent ID",
        },
      ],
      preview: "remove <id>",
      parser: "generic",
      help:
        "Removes the agent from the listing and databse. DOES NOT FORCE EAT!",
    },
  ],
}

export async function GET() {
  try {
    // Ensure commands directory exists
    if (!existsSync(COMMANDS_DIR)) mkdirSync(COMMANDS_DIR, { recursive: true })

    // Read agent folders
    const names: string[] = []
    if (existsSync(AGENTS_DIR)) {
      for (const entry of readdirSync(AGENTS_DIR)) {
        const full = join(AGENTS_DIR, entry)
        try { if (statSync(full).isDirectory()) names.push(entry) } catch {}
      }
    }

    // Ensure a .json exists for each agent folder; create with defaults if missing
    const items = names.map((name) => {
      const jsonPath = join(COMMANDS_DIR, `${name}.json`)
      const exists = existsSync(jsonPath)
      if (!exists) {
        try { writeFileSync(jsonPath, JSON.stringify(DEFAULT_COMMANDS, null, 2), "utf8") } catch {}
      }
      return { name, commandsFile: `public/data/commands/${name}.json`, exists: exists || existsSync(jsonPath) }
    })

    return NextResponse.json({ agents: items })
  } catch (e) {
    return NextResponse.json(
      { error: (e as any)?.message || String(e) },
      { status: 500 },
    )
  }
}

export const dynamic = "force-dynamic"

