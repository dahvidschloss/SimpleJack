/* eslint-disable @typescript-eslint/no-var-requires */
const Database = require('better-sqlite3')

const db = new Database('c2.db')

function upsertHttpListener() {
  const id = 'lst-dev-http'
  const exists = db.prepare('SELECT id FROM listeners WHERE id = ?').get(id)
  if (exists) {
    db.prepare(
      `UPDATE listeners SET name = ?, protocol = ?, port = ?, bind_address = ?, public_dns = ?, ip_addresses = ?, base_agent_key = ?, base_agent_name = ?, status = ?, last_activity = ?, requests_count = ?, errors_count = ?, config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(
      'Dev-HTTP',
      'http',
      8080,
      '0.0.0.0',
      '',
      '[]',
      '',
      '',
      'active',
      Date.now(),
      0,
      0,
      '{}',
      id
    )
  } else {
    db.prepare(
      `INSERT INTO listeners (id, name, protocol, port, bind_address, public_dns, ip_addresses, base_agent_key, base_agent_name, status, last_activity, requests_count, errors_count, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      'Dev-HTTP',
      'http',
      8080,
      '0.0.0.0',
      '',
      '[]',
      '',
      '',
      'active',
      Date.now(),
      0,
      0,
      '{}'
    )
  }
  console.log('[seed] Active HTTP listener ready: http://0.0.0.0:8080')
}

upsertHttpListener()

