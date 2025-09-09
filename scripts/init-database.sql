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
CREATE INDEX IF NOT EXISTS idx_commands_agent_id ON commands (agent_id);
CREATE INDEX IF NOT EXISTS idx_commands_time_tasked ON commands (time_tasked);
CREATE INDEX IF NOT EXISTS idx_sessions_agent_id ON sessions (agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions (is_active);

-- Insert sample data
INSERT OR REPLACE INTO agents (
    id, hostname, ip_addr, os, build, last_callback, created_time,
    callback_interval, jitter_value, jitter_translate, pid, user_context,
    base_agent, terminal_history, loaded_commands, cwd, listener,
    edr, target_domain, default_shell, integrity_level, status, last_seen_timestamp
) VALUES 
(
    'a7f9e-4d2c-8b1a-3e5f-9c8d7b6a5e4f',
    'WS-ADMIN-01',
    '["192.168.1.100", "10.10.10.10"]',
    'Microsoft Windows 11 Pro',
    '10.0.26100 N/A Build 26100',
    datetime('now', '-45 seconds'),
    datetime('now', '-1 day'),
    60, 15, 9, 4892,
    'ACME\administrator',
    'Selfish_Cowboy',
    '13:44:10\nAgent returned ls results at 13:44:20:\ntotal 24\ndrwxr-xr-x  4 user user 4096 Dec  8 10:30 .',
    '["Loader", "Console Execution", "Exit/Eat"]',
    'C:\Windows\System32',
    'edge-listener',
    '["Windows Defender", "CrowdStrike"]',
    'acme.corp',
    'powershell',
    'Administrator',
    'online',
    strftime('%s', 'now') * 1000 - 45000
),
(
    'b8e7d-5c3b-9a2f-4e6d-8c7b6a5f4e3d',
    'SRV-DB-01',
    '192.168.1.50',
    'Ubuntu 22.04.3 LTS',
    '5.15.0-91-generic',
    datetime('now', '-30 seconds'),
    datetime('now', '-2 days'),
    120, 10, 12, 1337,
    'root',
    'Silent_Penguin',
    '14:22:15\nAgent returned id results at 14:22:18:\nuid=0(root) gid=0(root) groups=0(root)',
    '["Loader", "Console Execution", "Exit/Eat", "Token_Impersonation"]',
    '/home/admin',
    'http-listener',
    '["ClamAV"]',
    'internal.lab',
    'bash',
    'root',
    'online',
    strftime('%s', 'now') * 1000 - 30000
);

-- No default listeners seeded; UI/API will create them
