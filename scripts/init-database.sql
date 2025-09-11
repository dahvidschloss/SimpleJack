-- Initialize SQLite database for Command & Control Interface
-- This script creates all necessary tables for agents, listeners, and commands

-- Agents table with comprehensive tracking
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    hostname TEXT NOT NULL,
    ip_addr TEXT NOT NULL,
    os TEXT NOT NULL,
    build TEXT,
    last_callback DATETIME NOT NULL,
    created_time DATETIME NOT NULL,
    session_key TEXT,
    callback_interval INTEGER NOT NULL DEFAULT 60,
    jitter_value INTEGER NOT NULL DEFAULT 15,
    jitter_translate INTEGER NOT NULL,
    pid INTEGER NOT NULL,
    user_context TEXT NOT NULL,
    base_agent TEXT NOT NULL,
    terminal_history TEXT DEFAULT '',
    loaded_commands TEXT DEFAULT '[]',
    cwd TEXT DEFAULT '/',
    last_queued_task TEXT DEFAULT '',
    current_running_task TEXT DEFAULT '',
    last_error_task TEXT DEFAULT '',
    listener TEXT NOT NULL,
    work_hours TEXT DEFAULT '24/7',
    kill_date DATETIME,
    edr TEXT DEFAULT '[]',
    target_domain TEXT DEFAULT '',
    last_error TEXT DEFAULT '',
    default_shell TEXT DEFAULT 'bash',
    integrity_level TEXT DEFAULT 'user',
    status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'connecting', 'possibly-dead', 'hibernation')),
    last_seen_timestamp INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Listeners table for C2 infrastructure
CREATE TABLE IF NOT EXISTS listeners (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    protocol TEXT NOT NULL CHECK (protocol IN ('http', 'https', 'dns', 'icmp', 'tcp')),
    port INTEGER NOT NULL,
    bind_address TEXT DEFAULT '0.0.0.0',
    public_dns TEXT DEFAULT '',
    ip_addresses TEXT DEFAULT '[]',
    base_agent_key TEXT DEFAULT '',
    base_agent_name TEXT DEFAULT '',
    status TEXT DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
    last_activity INTEGER DEFAULT 0,
    requests_count INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    config TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Commands table for tracking agent command history
CREATE TABLE IF NOT EXISTS commands (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    command TEXT NOT NULL,
    command_args TEXT DEFAULT '',
    command_result TEXT DEFAULT '',
    success BOOLEAN DEFAULT FALSE,
    error TEXT DEFAULT '',
    time_tasked DATETIME NOT NULL,
    time_completed DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE
);

-- Simple per-agent task queue (FIFO by enqueued_at)
CREATE TABLE IF NOT EXISTS queued_tasks (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    command TEXT NOT NULL,
    args TEXT DEFAULT '',
    parser TEXT DEFAULT 'generic',
    enqueued_at DATETIME NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE
);

-- Sessions table for tracking active agent sessions
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    listener_id TEXT NOT NULL,
    session_key TEXT,
    last_checkin DATETIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE CASCADE,
    FOREIGN KEY (listener_id) REFERENCES listeners (id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents (status);
CREATE INDEX IF NOT EXISTS idx_agents_last_callback ON agents (last_callback);
CREATE INDEX IF NOT EXISTS idx_agents_session_key ON agents (session_key);
CREATE INDEX IF NOT EXISTS idx_commands_agent_id ON commands (agent_id);
CREATE INDEX IF NOT EXISTS idx_commands_time_tasked ON commands (time_tasked);
CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions (agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions (is_active);

-- No sample agents or listeners are seeded; UI/API will create them
