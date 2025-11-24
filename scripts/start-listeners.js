// Lightweight local listener launcher for development
// Reads active listeners from c2.db and starts simple servers on localhost
/* eslint-disable @typescript-eslint/no-var-requires */
const Database = require('better-sqlite3')
const { readFileSync } = require('fs')
const { join } = require('path')

const db = new Database('c2.db')
const http = require('http')

const CONTROL_PORT = 47791 // localhost-only control channel

function initializeDatabase() {
  try {
    const schema = readFileSync(join(__dirname, 'init-database.sql'), 'utf8')
    db.exec(schema)
  } catch (err) {
    console.error('[listeners] Failed to initialize database schema', err)
  }
}

function getActiveListeners() {
  const stmt = db.prepare("SELECT * FROM listeners WHERE status = 'active'")
  return stmt.all()
}

async function main() {
  const servers = new Map() // id -> { server, key }

  const startOne = async (l) => {
    const proto = String(l.protocol).toLowerCase()
    const host = l.bind_address || '0.0.0.0'
    const port = Number(l.port)
    let cfg = {}
    try { cfg = JSON.parse(l.config || '{}') } catch {}
    const sigObj = proto === 'http' || proto === 'https' ? { http: cfg.http || {}, agent_key: l.base_agent_key || '' } : {}
    const sig = `${proto}:${host}:${port}:${JSON.stringify(sigObj)}`
    const privileged = port > 0 && port < 1024
    if (privileged) {
      console.log(`[listeners] preflight: ${l.name} wants privileged port ${port} on ${process.platform}`)
      if (process.platform === 'win32') {
        console.log(`[listeners] hint: run PowerShell as Administrator or use a non-privileged port for dev`)
      } else {
        console.log(`[listeners] hint: may require sudo or capabilities to bind ${port}`)
      }
    }

    try {
      if (proto === 'http' || proto === 'https') {
        const { startHttpListener } = require('./http-listener')
        console.log(`[listeners] attempt bind http://${host}:${port} name=${l.name}`)
        const server = await startHttpListener({ id: l.id, host, port, name: l.name, config: cfg, agentKey: l.base_agent_key || '' })
        servers.set(l.id, { server, key: sig })
        console.log(`[listeners] started ${l.name} (${sig}) and listening`)
      } else if (proto === 'tcp') {
        const { startTcpListener } = require('./tcp-listener')
        console.log(`[listeners] attempt bind tcp://${host}:${port} name=${l.name}`)
        const server = await startTcpListener({ id: l.id, host, port, name: l.name })
        servers.set(l.id, { server, key: sig })
        console.log(`[listeners] started ${l.name} (${sig}) and listening`)
      } else {
        console.log(`[listeners] Skipping unsupported protocol: ${proto} (${l.name})`)
      }
    } catch (err) {
      const code = err && err.code ? ` code=${err.code}` : ''
      console.error(`[listeners] Failed to start ${l.name} on ${host}:${port}:${code}`)
      if (err && err.stack) console.error(err.stack)
      try {
        const stmt = db.prepare("UPDATE listeners SET status = 'error', errors_count = errors_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        stmt.run(l.id)
      } catch {}
    }
  }

  const stopOne = (id) => {
    const entry = servers.get(id)
    if (!entry) return
    try {
      entry.server.close && entry.server.close()
      console.log(`[listeners] stopped ${id}`)
    } catch {}
    servers.delete(id)
  }

  // initial load
  let lastActiveSig = ""
  const sync = async () => {
    const active = getActiveListeners()
    const sig = active.map((l) => `${l.id}:${l.protocol}:${l.port}`).sort().join(",")
    if (sig !== lastActiveSig) {
      console.log(`[listeners] active=${active.length} -> ${active.map((l) => l.name).join(', ') || '<none>'}`)
      lastActiveSig = sig
    }
    // stop removed
    const activeIds = new Set(active.map((l) => l.id))
    for (const id of Array.from(servers.keys())) {
      if (!activeIds.has(id)) stopOne(id)
    }
    // start new or changed
    const byId = new Map(active.map((l) => [l.id, l]))
    for (const l of active) {
      const current = servers.get(l.id)
      const proto = String(l.protocol).toLowerCase()
      const host = l.bind_address || '0.0.0.0'
      const port = Number(l.port)
      let cfg = {}
      try { cfg = JSON.parse(l.config || '{}') } catch {}
      const sigObj = proto === 'http' || proto === 'https' ? { http: cfg.http || {}, agent_key: l.base_agent_key || '' } : {}
      const key = `${proto}:${host}:${port}:${JSON.stringify(sigObj)}`
      if (!current || current.key !== key) {
        if (current) stopOne(l.id)
        await startOne(l)
      }
    }
    lastActive = active
  }

  initializeDatabase()

  await sync()
  console.log('[listeners] Watching database for changes ...')
  setInterval(sync, 500)

  // Lightweight local control server to trigger immediate actions
  const controlServer = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || req.url !== '/control') {
        res.statusCode = 404
        return res.end('not found')
      }
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', async () => {
        try {
          const cmd = JSON.parse(body || '{}')
          const op = cmd.op
          const id = cmd.id
          if (!op) {
            res.statusCode = 400
            return res.end('missing op')
          }
          if (op === 'sync') {
            await sync()
            res.statusCode = 200
            return res.end(JSON.stringify({ ok: true }))
          }
          if (!id) {
            res.statusCode = 400
            return res.end('missing id')
          }
          if (op === 'stop') {
            stopOne(id)
            res.statusCode = 200
            return res.end(JSON.stringify({ ok: true }))
          }
          if (op === 'start' || op === 'reload') {
            const rowStmt = db.prepare('SELECT * FROM listeners WHERE id = ?')
            const l = rowStmt.get(id)
            if (!l) {
              res.statusCode = 404
              return res.end(JSON.stringify({ ok: false, error: 'not_found' }))
            }
            if (op === 'reload') stopOne(id)
            await startOne(l)
            res.statusCode = 200
            return res.end(JSON.stringify({ ok: true }))
          }
          res.statusCode = 400
          res.end('bad op')
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ ok: false, error: e.message || String(e) }))
        }
      })
    } catch (e) {
      res.statusCode = 500
      res.end(JSON.stringify({ ok: false, error: e.message || String(e) }))
    }
  })
  controlServer.listen(CONTROL_PORT, '127.0.0.1', () => {
    console.log(`[listeners] control server on http://127.0.0.1:${CONTROL_PORT}/control`)
  })

  const shutdown = () => {
    console.log('\n[listeners] Shutting down listeners ...')
    for (const { server } of servers.values()) {
      try { server.close && server.close() } catch {}
    }
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((e) => {
  console.error('[listeners] Fatal error', e)
  process.exit(1)
})
