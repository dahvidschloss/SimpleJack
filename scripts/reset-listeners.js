/* eslint-disable @typescript-eslint/no-var-requires */
const Database = require('better-sqlite3')

try {
  const db = new Database('c2.db')
  const count = db.prepare('SELECT COUNT(*) as c FROM listeners').get().c
  db.prepare('DELETE FROM listeners').run()
  console.log(`[reset-listeners] Removed ${count} listener(s) from DB`)
} catch (e) {
  console.error('[reset-listeners] Failed:', e.message || e)
  process.exit(1)
}

