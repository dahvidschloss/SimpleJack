import Database from "better-sqlite3"
import { readFileSync } from "fs"
import { join } from "path"

// Initialize SQLite database
const db = new Database("c2.db")

// Initialize database schema
export function initializeDatabase() {
  try {
    const schema = readFileSync(join(process.cwd(), "scripts", "init-database.sql"), "utf8")
    db.exec(schema)
    console.log("Database initialized successfully")
  } catch (error) {
    console.error("Failed to initialize database:", error)
  }
}

// Agent operations
export interface Agent {
  id: string
  hostname: string
  ip_addr: string
  os: string
  build?: string
  last_callback: string
  created_time: string
  callback_interval: number
  jitter_value: number
  jitter_translate: number
  pid: number
  user_context: string
  base_agent: string
  terminal_history: string
  loaded_commands: string
  cwd: string
  last_queued_task: string
  current_running_task: string
  last_error_task: string
  listener: string
  work_hours: string
  kill_date?: string
  edr: string
  target_domain: string
  last_error: string
  default_shell: string
  integrity_level: string
  status: "online" | "offline" | "connecting" | "possibly-dead" | "hibernation"
  last_seen_timestamp: number
}

export interface Listener {
  id: string
  name: string
  protocol: "http" | "https" | "dns" | "icmp" | "tcp"
  port: number
  bind_address: string
  public_dns: string
  ip_addresses: string
  base_agent_key: string
  base_agent_name: string
  status: "active" | "inactive" | "error"
  last_activity: number
  requests_count: number
  errors_count: number
  config: string
}

export interface Command {
  id: string
  agent_id: string
  command: string
  command_args: string
  command_result: string
  success: boolean
  error: string
  time_tasked: string
  time_completed?: string
}

// Agent database operations
export const agentDb = {
  getAll: (): Agent[] => {
    const stmt = db.prepare("SELECT * FROM agents ORDER BY last_callback DESC")
    return stmt.all() as Agent[]
  },

  getById: (id: string): Agent | null => {
    const stmt = db.prepare("SELECT * FROM agents WHERE id = ?")
    return stmt.get(id) as Agent | null
  },

  create: (agent: Omit<Agent, "created_at" | "updated_at">): Agent => {
    const stmt = db.prepare(`
      INSERT INTO agents (
        id, hostname, ip_addr, os, build, last_callback, created_time,
        callback_interval, jitter_value, jitter_translate, pid, user_context,
        base_agent, terminal_history, loaded_commands, cwd, last_queued_task,
        current_running_task, last_error_task, listener, work_hours, kill_date,
        edr, target_domain, last_error, default_shell, integrity_level,
        status, last_seen_timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      agent.id,
      agent.hostname,
      agent.ip_addr,
      agent.os,
      agent.build,
      agent.last_callback,
      agent.created_time,
      agent.callback_interval,
      agent.jitter_value,
      agent.jitter_translate,
      agent.pid,
      agent.user_context,
      agent.base_agent,
      agent.terminal_history,
      agent.loaded_commands,
      agent.cwd,
      agent.last_queued_task,
      agent.current_running_task,
      agent.last_error_task,
      agent.listener,
      agent.work_hours,
      agent.kill_date,
      agent.edr,
      agent.target_domain,
      agent.last_error,
      agent.default_shell,
      agent.integrity_level,
      agent.status,
      agent.last_seen_timestamp,
    )

    return agentDb.getById(agent.id)!
  },

  update: (id: string, updates: Partial<Agent>): Agent | null => {
    const fields = Object.keys(updates).filter((key) => key !== "id")
    const setClause = fields.map((field) => `${field} = ?`).join(", ")
    const values = fields.map((field) => updates[field as keyof Agent])

    const stmt = db.prepare(`UPDATE agents SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    stmt.run(...values, id)

    return agentDb.getById(id)
  },

  updateStatus: (id: string, status: Agent["status"]): void => {
    const stmt = db.prepare(
      "UPDATE agents SET status = ?, last_seen_timestamp = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    stmt.run(status, Date.now(), id)
  },
}

// Listener database operations
export const listenerDb = {
  getAll: (): Listener[] => {
    const stmt = db.prepare("SELECT * FROM listeners ORDER BY created_at DESC")
    return stmt.all() as Listener[]
  },

  getById: (id: string): Listener | null => {
    const stmt = db.prepare("SELECT * FROM listeners WHERE id = ?")
    return stmt.get(id) as Listener | null
  },

  create: (listener: Omit<Listener, "created_at" | "updated_at">): Listener => {
    const stmt = db.prepare(`
      INSERT INTO listeners (
        id, name, protocol, port, bind_address, public_dns, ip_addresses,
        base_agent_key, base_agent_name, status, last_activity,
        requests_count, errors_count, config
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      listener.id,
      listener.name,
      listener.protocol,
      listener.port,
      listener.bind_address,
      listener.public_dns,
      listener.ip_addresses,
      listener.base_agent_key,
      listener.base_agent_name,
      listener.status,
      listener.last_activity,
      listener.requests_count,
      listener.errors_count,
      listener.config,
    )

    return listenerDb.getById(listener.id)!
  },

  update: (id: string, updates: Partial<Listener>): Listener | null => {
    const fields = Object.keys(updates).filter((key) => key !== "id")
    const setClause = fields.map((field) => `${field} = ?`).join(", ")
    const values = fields.map((field) => updates[field as keyof Listener])

    const stmt = db.prepare(`UPDATE listeners SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    stmt.run(...values, id)

    return listenerDb.getById(id)
  },
}

// Command database operations
export const commandDb = {
  getByAgentId: (agentId: string): Command[] => {
    const stmt = db.prepare("SELECT * FROM commands WHERE agent_id = ? ORDER BY time_tasked DESC")
    return stmt.all(agentId) as Command[]
  },

  create: (command: Omit<Command, "created_at">): Command => {
    const stmt = db.prepare(`
      INSERT INTO commands (
        id, agent_id, command, command_args, command_result,
        success, error, time_tasked, time_completed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      command.id,
      command.agent_id,
      command.command,
      command.command_args,
      command.command_result,
      command.success,
      command.error,
      command.time_tasked,
      command.time_completed,
    )

    const getStmt = db.prepare("SELECT * FROM commands WHERE id = ?")
    return getStmt.get(command.id) as Command
  },
}

// Initialize database on import
initializeDatabase()

export default db
