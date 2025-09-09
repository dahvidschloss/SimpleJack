import { type NextRequest, NextResponse } from "next/server"
import { listenerDb } from "@/lib/database"
import net from "net"
import { exec } from "child_process"

async function checkTcp(host: string, port: number, timeoutMs = 2000): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const onError = () => {
      try {
        socket.destroy()
      } catch {}
      resolve({ ok: false, error: 'connect_error' })
    }
    socket.setTimeout(timeoutMs)
    socket.once("error", onError)
    socket.once("timeout", onError)
    socket.connect(port, host, () => {
      socket.end()
      resolve({ ok: true })
    })
  })
}

function checkPortSystemBinding(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const platform = process.platform
    if (platform === "win32") {
      // Use PowerShell to avoid partial matches like :8081 when checking :80
      const ps = `powershell -NoProfile -Command "try { $c=Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction Stop; if ($c) { 'LISTEN' } } catch { }"`
      exec(ps, { timeout: 3000 }, (_err, stdout) => {
        resolve((stdout || "").toString().includes("LISTEN"))
      })
      return
    }
    if (platform === "darwin" || platform === "linux") {
      const cmd = `ss -lnt '( sport = :${port} )' || lsof -i :${port} -sTCP:LISTEN`
      exec(cmd, { timeout: 2000 }, (err, stdout) => {
        if (err) return resolve(false)
        resolve(Boolean(stdout && stdout.trim().length > 0))
      })
      return
    }
    resolve(false)
  })
}

async function checkHttp(url: string, expectStatus?: number, timeoutMs = 5000): Promise<boolean> {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { method: "GET", signal: controller.signal })
    clearTimeout(t)
    if (expectStatus) return res.status === expectStatus
    return res.ok || res.status === 204
  } catch {
    return false
  }
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const l = listenerDb.getById(params.id)
    if (!l) return NextResponse.json({ error: "Listener not found" }, { status: 404 })

    const ip_addresses: string[] = (() => {
      try {
        return JSON.parse(l.ip_addresses || "[]")
      } catch {
        return []
      }
    })()
    const config: any = (() => {
      try {
        return JSON.parse(l.config || "{}")
      } catch {
        return {}
      }
    })()

    const protocol = String(l.protocol).toLowerCase()
    const port = Number(l.port)
    const bindHost = l.bind_address || "0.0.0.0"
    const publicHost = (l.public_dns && l.public_dns.trim()) || ip_addresses[0]
    const getEndpoints: string[] = config?.http?.get_endpoints || ["/"]
    const postEndpoints: string[] = config?.http?.post_endpoints || ["/"]
    const successStatus = config?.http?.success_status || 204
    console.log(`[probe] cfg name=${l.name} proto=${protocol} bind=${bindHost}:${port} public=${publicHost || '<none>'} get=${JSON.stringify(getEndpoints)} post=${JSON.stringify(postEndpoints)} expect=${successStatus}`)

    const checks: any = {
      localPort: { success: false, message: "" },
      publicDns: { success: false, message: "" },
    }

    // Wait for runner to (re)bind after a recent config change
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const localHost = bindHost === "0.0.0.0" ? "127.0.0.1" : bindHost
    let localConn = { ok: false as boolean, error: undefined as string | undefined }
    let systemOk = false
    for (let i = 0; i < 10; i++) {
      systemOk = await checkPortSystemBinding(port)
      localConn = await checkTcp(localHost, port)
      console.log(`[probe] bind-wait attempt ${i + 1}/10 -> tcp=${localConn.ok} system=${systemOk}`)
      if (systemOk && localConn.ok) break
      await sleep(500)
    }
    const localOk = localConn.ok
    checks.localPort = {
      success: localOk && systemOk,
      message: localOk && systemOk
        ? `Port ${port} is listening on ${bindHost}`
        : `Port ${port} not listening on ${bindHost} (local tcp: ${localOk}${localConn.error ? ' err=' + localConn.error : ''}, system: ${systemOk})`,
    }
    console.log(`[probe] local check for ${l.name} -> tcp=${localOk} system=${systemOk} host=${localHost}:${port}`)

    if (protocol === "http" || protocol === "https") {
      const scheme = protocol
      const basePublic = publicHost ? `${scheme}://${publicHost}:${port}` : null

      const baseLocal = `${scheme}://127.0.0.1:${port}`
      const decoyStatus = config?.http?.decoy_status ?? 200

      let expectSuccessOk = true
      let expectDecoyOk = true

      // 1) Expect SUCCESS locally with probe headers (authorized)
      for (const ep of getEndpoints) {
        try {
          const res = await fetch(`${baseLocal}${ep}`, { method: "GET", headers: { Probe: "1", Key: String(l.base_agent_key || "") } })
          const ok = res.status === successStatus
          console.log(`[Probe] expect-success GET ${baseLocal}${ep} -> ${ok ? 'OK' : 'FAIL'} (status=${res.status})`)
          if (!ok) expectSuccessOk = false
        } catch (e) {
          console.log(`[Probe] expect-success GET ${baseLocal}${ep} error: ${(e as any).message || e}`)
          expectSuccessOk = false
        }
      }
      for (const ep of postEndpoints) {
        try {
          const controller = new AbortController()
          const t = setTimeout(() => controller.abort(), 5000)
          const res = await fetch(`${baseLocal}${ep}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Probe: "1", Key: String(l.base_agent_key || "") },
            body: JSON.stringify({ ping: true, agent_key: l.base_agent_key || undefined }),
            signal: controller.signal,
          })
          clearTimeout(t)
          const ok = res.status === successStatus
          console.log(`[Probe] expect-success POST ${baseLocal}${ep} -> ${ok ? 'OK' : 'FAIL'} (status=${res.status})`)
          if (!ok) expectSuccessOk = false
        } catch (e) {
          console.log(`[Probe] expect-success POST ${baseLocal}${ep} error: ${(e as any).message || e}`)
          expectSuccessOk = false
        }
      }

      // 2) Public connectivity and expectation (should not time out)
      //    Success if we can reach and we get either successStatus or decoyStatus
      let publicConnectivityOk = true
      if (basePublic) {
        // quick connectivity ping against base
        try {
          const resBase = await fetch(`${basePublic}/`, { method: "GET" })
          console.log(`[Probe] connectivity ${basePublic}/ -> status=${resBase.status}`)
        } catch (e) {
          console.log(`[Probe] connectivity ${basePublic}/ error: ${(e as any).message || e}`)
          publicConnectivityOk = false
        }
        for (const ep of getEndpoints) {
          try {
            const res = await fetch(`${basePublic}${ep}`, { method: "GET" })
            const ok = res.status === decoyStatus || res.status === successStatus
            console.log(`[Probe] expect-(decoy|success) GET ${basePublic}${ep} -> ${ok ? 'OK' : 'FAIL'} (status=${res.status})`)
            if (!ok) expectDecoyOk = false
          } catch (e) {
            console.log(`[Probe] expect-decoy GET ${basePublic}${ep} error: ${(e as any).message || e}`)
            expectDecoyOk = false
          }
        }
        for (const ep of postEndpoints) {
          try {
            const res = await fetch(`${basePublic}${ep}`, { method: "POST", headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ping: true }) })
            const ok = res.status === decoyStatus || res.status === successStatus
            console.log(`[Probe] expect-(decoy|success) POST ${basePublic}${ep} -> ${ok ? 'OK' : 'FAIL'} (status=${res.status})`)
            if (!ok) expectDecoyOk = false
          } catch (e) {
            console.log(`[Probe] expect-decoy POST ${basePublic}${ep} error: ${(e as any).message || e}`)
            expectDecoyOk = false
          }
        }
      } else {
        console.log(`[probe] no public host available for ${l.name}`)
      }

      checks.publicDns = {
        success: publicConnectivityOk,
        message: publicConnectivityOk ? `${basePublic} reachable` : `${basePublic || '<no host>'} not reachable`,
      }
      checks.getEndpoints = {
        success: expectSuccessOk && expectDecoyOk,
        message: expectSuccessOk && expectDecoyOk ? `GET/POST expectations satisfied` : `Endpoint expectations failed`,
      }
      checks.postEndpoints = checks.getEndpoints
    }

    const overallSuccess = Object.values(checks).every((c: any) => c?.success)

    return NextResponse.json({
      success: overallSuccess,
      message: overallSuccess ? `Listener ${l.name} passed probe check` : `Listener ${l.name} failed probe check`,
      checks,
    })
  } catch (error) {
    console.error("Failed to probe listener:", error)
    return NextResponse.json({ error: "Failed to probe listener" }, { status: 500 })
  }
}
