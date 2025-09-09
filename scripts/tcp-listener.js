/* eslint-disable @typescript-eslint/no-var-requires */
const net = require('net')
const Database = require('better-sqlite3')

const db = new Database('c2.db')

function updateActivity(id, success = true) {
  const stmt = db.prepare(
    `UPDATE listeners SET last_activity = ?, requests_count = requests_count + 1, updated_at = CURRENT_TIMESTAMP ${
      success ? '' : ', errors_count = errors_count + 1'
    } WHERE id = ?`
  )
  stmt.run(Date.now(), id)
}

async function startTcpListener({ id, host = '0.0.0.0', port, name }) {
  const server = net.createServer((socket) => {
    updateActivity(id, true)
    socket.on('data', () => updateActivity(id, true))
    socket.on('error', () => updateActivity(id, false))
    // Simple keep-alive
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve(null))
  })

  console.log(`[tcp-listener] ${name} listening on tcp://${host}:${port}`)
  return server
}

module.exports = { startTcpListener }

