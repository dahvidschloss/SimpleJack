import Database from "better-sqlite3"
import { readFileSync } from "fs"
import { join } from "path"

// Initialize SQLite database (singleton in dev to avoid re-init noise)
const g = globalThis as any
const db: Database.Database = g.__c2db || new Database("c2.db")
g.__c2db = db

// Initialize database schema
export function initializeDatabase() {
  try {
    const schema = readFileSync(join(process.cwd(), "scripts", "init-database.sql"), "utf8")
    db.exec(schema)
    // Suppress noisy dev logs across route workers
  } catch (error) {
    console.error("Failed to initialize database:", error)
  }

  // Best-effort, idempotent schema migrations for existing DBs
  try { db.exec("ALTER TABLE agents ADD COLUMN session_key TEXT") } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_agents_session_key ON agents (session_key)") } catch {}
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
  session_key?: string
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

export interface QueuedTask {
  id: string
  agent_id: string
  command: string
  args: string
  parser: string
  enqueued_at: string
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
        id, hostname, ip_addr, os, build, last_callback, created_time, session_key,
        callback_interval, jitter_value, jitter_translate, pid, user_context,
        base_agent, terminal_history, loaded_commands, cwd, last_queued_task,
        current_running_task, last_error_task, listener, work_hours, kill_date,
        edr, target_domain, last_error, default_shell, integrity_level,
        status, last_seen_timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      agent.id,
      agent.hostname,
      agent.ip_addr,
      agent.os,
      agent.build,
      agent.last_callback,
      agent.created_time,
      (agent as any).session_key || null,
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
    // Only update status; do NOT mutate last_seen_timestamp here.
    const stmt = db.prepare(
      "UPDATE agents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    stmt.run(status, id)
  },

  delete: (id: string): boolean => {
    const stmt = db.prepare("DELETE FROM agents WHERE id = ?")
    const info = stmt.run(id)
    return info.changes > 0
  },

  deleteByStatus: (status: Agent["status"]): number => {
    const stmt = db.prepare("DELETE FROM agents WHERE status = ?")
    const info = stmt.run(status)
    return info.changes
  },

  getBySessionKey: (sessionKey: string): Agent | null => {
    const stmt = db.prepare("SELECT * FROM agents WHERE session_key = ?")
    return stmt.get(sessionKey) as Agent | null
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

  delete: (id: string): boolean => {
    const stmt = db.prepare("DELETE FROM listeners WHERE id = ?")
    const info = stmt.run(id)
    return info.changes > 0
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

// Task queue operations
export const taskQueueDb = {
  enqueue: (task: Omit<QueuedTask, "created_at">): QueuedTask => {
    const stmt = db.prepare(`
      INSERT INTO queued_tasks (
        id, agent_id, command, args, parser, enqueued_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(task.id, task.agent_id, task.command, task.args, task.parser, task.enqueued_at)
    const getStmt = db.prepare("SELECT * FROM queued_tasks WHERE id = ?")
    return getStmt.get(task.id) as QueuedTask
  },

  getNextForAgent: (agentId: string): QueuedTask | null => {
    const stmt = db.prepare(
      "SELECT * FROM queued_tasks WHERE agent_id = ? ORDER BY enqueued_at ASC LIMIT 1",
    )
    return (stmt.get(agentId) as QueuedTask) || null
  },

  getAllForAgent: (agentId: string): QueuedTask[] => {
    const stmt = db.prepare("SELECT * FROM queued_tasks WHERE agent_id = ? ORDER BY enqueued_at ASC")
    return stmt.all(agentId) as QueuedTask[]
  },

  deleteById: (id: string): boolean => {
    const stmt = db.prepare("DELETE FROM queued_tasks WHERE id = ?")
    const info = stmt.run(id)
    return info.changes > 0
  },

  deleteByIds: (ids: string[]): boolean => {
    if (!ids || ids.length === 0) return false
    const placeholders = ids.map(() => "?").join(", ")
    const stmt = db.prepare(`DELETE FROM queued_tasks WHERE id IN (${placeholders})`)
    const info = stmt.run(...ids)
    return info.changes > 0
  },
}

// Initialize database on import (once per process)
if (!g.__dbInitialized) {
  initializeDatabase()
  g.__dbInitialized = true
}

export default db
