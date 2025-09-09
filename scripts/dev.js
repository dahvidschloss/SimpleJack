// Orchestrates the app and local listener runner together
const { spawn } = require('child_process')

function spawnProc(cmd, args, opts) {
  const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts })
  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[dev] ${cmd} exited with code ${code}`)
    }
    process.exit(code || 0)
  })
  return child
}

// Start listeners first
const listeners = spawnProc('node', ['scripts/start-listeners.js'])

// Then start Next.js dev
const next = spawnProc('next', ['dev'])

process.on('SIGINT', () => {
  try { listeners.kill() } catch {}
  try { next.kill() } catch {}
  process.exit(0)
})

