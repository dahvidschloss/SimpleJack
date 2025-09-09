"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Minus, TestTube, AlertTriangle, CheckCircle, XCircle, Loader2, Search } from "lucide-react"

interface ListenerConfig {
  id: string
  name: string
  protocol: "http" | "https" | "dns" | "icmp" | "tcp"
  port: number
  bind_addr: string
  public_dns: string
  ip_addresses: string[]
  use_ip_instead_of_dns: boolean
  base_agent_key: {
    key: string
    name: string
  }
  target_domain: {
    enabled: boolean
    expected: string
  }
  http?: {
    get_endpoints: string[]
    post_endpoints: string[]
    success_status: number
    decoy_status: number
    decoy_body: string
    respond_via_get: boolean
  }
  tls?: {
    min_version: string
    max_version: string
    alpn: string[]
    cert_source: "acme" | "upload" | "ref"
    cert_ref: string | null
    sni: string[]
  }
  dns?: {
    base_name: string
    mode: "pure" | "hybrid"
    https_fallback: string
  }
  icmp?: {
    max_payload: number
    echo_id_strategy: "auto" | "fixed"
  }
  tcp?: {
    framing: "length_prefix" | "line"
    idle_timeout_sec: number
  }
  crypto: {
    profile: string
    mode: string
    key_id: string
    psk_write_only: string | null
    iv_policy: string
  }
  endpoints: {
    get: string[]
    post: string[]
  }
  connection: {
    max_connections: number
    idle_timeout_sec: number
  }
}

interface Listener {
  id: string
  name: string
  protocol: "http" | "https" | "dns" | "icmp" | "tcp"
  port: number
  public_dns: string
  status: "active" | "inactive" | "error"
  last_activity: number
  requests_count: number
  errors_count: number
}

interface ListenerEditorProps {
  selectedListener: string | null
  listeners: Listener[]
  onListenerStatusUpdate: (listenerId: string, status: "active" | "inactive" | "error") => void
  onListenerUpdate: (listenerId: string, listener: Listener) => void
}

const sampleListenerConfigs: Record<string, ListenerConfig> = {
  "lst-001": {
    id: "lst-001",
    name: "Edge-Listener",
    protocol: "https",
    port: 443,
    bind_addr: "0.0.0.0",
    public_dns: "updates.example.com",
    ip_addresses: [],
    use_ip_instead_of_dns: false,
    base_agent_key: {
      key: "",
      name: "",
    },
    target_domain: { enabled: true, expected: "corp.example.com" },
    http: {
      get_endpoints: ["/api/health", "/assets/ping", "/v1/checkin"],
      post_endpoints: ["/api/telemetry", "/collect"],
      success_status: 204,
      decoy_status: 200,
      decoy_body: '{"status":"ok"}',
      respond_via_get: false,
    },
    tls: {
      min_version: "TLS1.2",
      max_version: "TLS1.3",
      alpn: ["h2", "http/1.1"],
      cert_source: "acme",
      cert_ref: null,
      sni: ["updates.example.com"],
    },
    crypto: {
      profile: "agent-default",
      mode: "ecdh_aesgcm",
      key_id: "k-2025-09",
      psk_write_only: null,
      iv_policy: "auto_per_message",
    },
    endpoints: {
      get: [],
      post: [],
    },
    connection: {
      max_connections: 100,
      idle_timeout_sec: 300,
    },
  },
  "lst-002": {
    id: "lst-002",
    name: "DNS-Beacon",
    protocol: "dns",
    port: 53,
    bind_addr: "0.0.0.0",
    public_dns: "stage.updates.example.com",
    ip_addresses: [],
    use_ip_instead_of_dns: false,
    base_agent_key: {
      key: "",
      name: "",
    },
    target_domain: { enabled: false, expected: "" },
    dns: {
      base_name: "stage.updates.example.com",
      mode: "pure",
      https_fallback: "",
    },
    crypto: {
      profile: "agent-default",
      mode: "ecdh_aesgcm",
      key_id: "k-2025-09",
      psk_write_only: null,
      iv_policy: "auto_per_message",
    },
    endpoints: {
      get: [],
      post: [],
    },
    connection: {
      max_connections: 100,
      idle_timeout_sec: 300,
    },
  },
  "lst-003": {
    id: "lst-003",
    name: "TCP-Channel",
    protocol: "tcp",
    port: 8080,
    bind_addr: "0.0.0.0",
    public_dns: "api.example.com",
    ip_addresses: [],
    use_ip_instead_of_dns: false,
    base_agent_key: {
      key: "",
      name: "",
    },
    target_domain: { enabled: false, expected: "" },
    tcp: {
      framing: "length_prefix",
      idle_timeout_sec: 300,
    },
    crypto: {
      profile: "agent-default",
      mode: "ecdh_aesgcm",
      key_id: "k-2025-09",
      psk_write_only: null,
      iv_policy: "auto_per_message",
    },
    endpoints: {
      get: [],
      post: [],
    },
    connection: {
      max_connections: 100,
      idle_timeout_sec: 300,
    },
  },
}

interface ProbeResult {
  success: boolean
  message: string
  checks: {
    localPort: { success: boolean; message: string }
    publicDns: { success: boolean; message: string }
    getEndpoints?: { success: boolean; message: string }
    postEndpoints?: { success: boolean; message: string }
  }
}

function ListenerEditor({
  selectedListener,
  listeners,
  onListenerStatusUpdate,
  onListenerUpdate,
}: ListenerEditorProps) {
  const [config, setConfig] = useState<ListenerConfig>({
    id: "",
    name: "",
    protocol: "http",
    port: 8080,
    bind_addr: "0.0.0.0",
    public_dns: "",
    ip_addresses: [],
    use_ip_instead_of_dns: false,
    base_agent_key: {
      key: "",
      name: "",
    },
    target_domain: {
      enabled: false,
      expected: "",
    },
    crypto: {
      profile: "agent-default",
      mode: "psk_aesgcm",
      key_id: "",
      psk_write_only: null,
      iv_policy: "random",
    },
    endpoints: {
      get: [],
      post: [],
    },
    connection: {
      max_connections: 100,
      idle_timeout_sec: 300,
    },
  })
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [isProbing, setIsProbing] = useState(false)
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null)
  const [showProbePopup, setShowProbePopup] = useState(false)
  const [tabErrors, setTabErrors] = useState<Record<string, boolean>>({})
  const [isDeployed, setIsDeployed] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)

  useEffect(() => {
    if (selectedListener && sampleListenerConfigs[selectedListener]) {
      setConfig(sampleListenerConfigs[selectedListener])

      // Find the listener in the dashboard data and sync deployment status
      const listener = listeners.find((l) => l.id === selectedListener)
      if (listener) {
        setIsDeployed(listener.status === "active")
      }
    } else {
      setConfig({
        id: "",
        name: "",
        protocol: "http",
        port: 8080,
        bind_addr: "0.0.0.0",
        public_dns: "",
        ip_addresses: [],
        use_ip_instead_of_dns: false,
        base_agent_key: {
          key: "",
          name: "",
        },
        target_domain: {
          enabled: false,
          expected: "",
        },
        crypto: {
          profile: "agent-default",
          mode: "psk_aesgcm",
          key_id: "",
          psk_write_only: null,
          iv_policy: "random",
        },
        endpoints: {
          get: [],
          post: [],
        },
        connection: {
          max_connections: 100,
          idle_timeout_sec: 300,
        },
      })
      setIsDeployed(false)
    }
  }, [selectedListener, listeners])

  const validateConfig = () => {
    if (!config) return false

    const errors: string[] = []

    if (!config.name.trim()) errors.push("Listener name is required")

    if (config.use_ip_instead_of_dns) {
      if (config.ip_addresses.length === 0 || config.ip_addresses.every((ip) => !ip.trim())) {
        errors.push("At least one IP address is required when not using DNS")
      }
    } else {
      if (!config.public_dns.trim()) errors.push("Public DNS name is required")
    }

    if (config.target_domain.enabled && !config.target_domain.expected.trim()) {
      errors.push("Target domain is enabled but empty")
    }

    if (config.protocol === "https" && config.tls?.cert_source === "upload" && !config.tls.cert_ref) {
      errors.push("HTTPS requires a certificate")
    }

    if (config.protocol === "dns" && config.dns?.mode === "hybrid" && !config.dns.https_fallback) {
      errors.push("DNS hybrid mode requires HTTPS fallback endpoint")
    }

    setValidationErrors(errors)
    return errors.length === 0
  }

  const performProbe = async () => {
    if (!config) return { success: false, message: "No configuration selected", checks: {} }

    setIsProbing(true)
    setProbeResult(null)
    setTabErrors({})

    // Simulate probe checks with realistic delays
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const checks = {
      localPort: { success: false, message: "" },
      publicDns: { success: false, message: "" },
      getEndpoints: { success: false, message: "" },
      postEndpoints: { success: false, message: "" },
    }

    // Check local port binding
    const localPortSuccess = Math.random() > 0.1 // 90% success rate
    checks.localPort = {
      success: localPortSuccess,
      message: localPortSuccess
        ? `Port ${config.port} is listening on ${config.bind_addr}`
        : `Failed to bind to port ${config.port} on ${config.bind_addr} - port may be in use`,
    }

    // Check public DNS/IP accessibility
    const publicDnsSuccess = localPortSuccess && Math.random() > 0.2 // 80% success rate if local port works
    checks.publicDns = {
      success: publicDnsSuccess,
      message: publicDnsSuccess
        ? `Port ${config.port} is accessible via ${config.use_ip_instead_of_dns ? config.ip_addresses.join(", ") : config.public_dns}`
        : `Port ${config.port} is not accessible via ${config.use_ip_instead_of_dns ? config.ip_addresses.join(", ") : config.public_dns} - check firewall/NAT settings`,
    }

    // Check HTTP/HTTPS endpoints if applicable
    if (config.protocol === "http" || config.protocol === "https") {
      const getEndpointsSuccess = publicDnsSuccess && Math.random() > 0.15 // 85% success rate
      checks.getEndpoints = {
        success: getEndpointsSuccess,
        message: getEndpointsSuccess
          ? `All GET endpoints returned status ${config.http?.success_status || 204}`
          : `GET endpoint ${config.http?.get_endpoints[0] || "/api/health"} returned unexpected status code`,
      }

      const postEndpointsSuccess = getEndpointsSuccess && Math.random() > 0.15 // 85% success rate
      checks.postEndpoints = {
        success: postEndpointsSuccess,
        message: postEndpointsSuccess
          ? `All POST endpoints returned status ${config.http?.success_status || 204}`
          : `POST endpoint ${config.http?.post_endpoints[0] || "/api/telemetry"} returned unexpected status code`,
      }
    }

    const overallSuccess = Object.values(checks).every((check) => check.success)

    const result: ProbeResult = {
      success: overallSuccess,
      message: overallSuccess
        ? `Listener ${config.name} successfully passed probe check`
        : `Listener ${config.name} failed probe check`,
      checks,
    }

    // Set tab errors for failed checks
    const newTabErrors: Record<string, boolean> = {}
    if (!checks.localPort.success || !checks.publicDns.success) {
      newTabErrors.basic = true
    }
    if (config.protocol === "https" && !checks.publicDns.success) {
      newTabErrors.tls = true
    }
    if (
      (config.protocol === "http" || config.protocol === "https") &&
      (!checks.getEndpoints?.success || !checks.postEndpoints?.success)
    ) {
      newTabErrors.http = true
    }

    setTabErrors(newTabErrors)
    setProbeResult(result)
    setShowProbePopup(true)
    setIsProbing(false)

    // Auto-hide popup after 5 seconds
    setTimeout(() => setShowProbePopup(false), 5000)

    return result
  }

  const deployListener = async () => {
    if (!config || !selectedListener) return

    setIsDeploying(true)

    // Simulate deployment process
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // After deployment, automatically probe
    setIsProbing(true)
    const result = await performProbe()
    setIsProbing(false)

    if (result.success) {
      setIsDeployed(true)
      setProbeResult(result)
      // Update dashboard status to active
      onListenerStatusUpdate(selectedListener, "active")
    } else {
      // If probe fails, revert deployment status
      setIsDeployed(false)
      setProbeResult(result)
      // Update dashboard status to error
      onListenerStatusUpdate(selectedListener, "error")
    }

    setIsDeploying(false)
  }

  const stopListener = async () => {
    if (!selectedListener) return

    setIsDeploying(true)

    // Simulate stopping process
    await new Promise((resolve) => setTimeout(resolve, 1000))

    setIsDeployed(false)
    setProbeResult(null)
    // Update dashboard status to inactive
    onListenerStatusUpdate(selectedListener, "inactive")

    setIsDeploying(false)
  }

  const handleSaveOrDeploy = async () => {
    if (isDeployed) {
      if (!config || !selectedListener) return

      setIsDeploying(true)

      // Update the listener in the dashboard with new configuration
      const updatedListener = {
        id: selectedListener,
        protocol: config.protocol,
        port: config.port,
        public_dns: config.public_dns,
        bind_addr: config.bind_addr,
        name: config.name,
        status: "active",
        last_activity: Date.now(),
        requests_count: 0,
        errors_count: 0,
      }

      // Update dashboard with new configuration
      onListenerUpdate(selectedListener, updatedListener)

      // Simulate save process
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // After saving, redeploy with new configuration
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Automatically probe after redeployment
      setIsProbing(true)
      const result = await performProbe()
      setIsProbing(false)

      if (result.success) {
        setProbeResult(result)
        onListenerStatusUpdate(selectedListener, "active")
      } else {
        setProbeResult(result)
        onListenerStatusUpdate(selectedListener, "error")
      }

      setIsDeploying(false)
    } else {
      // Deploy if not deployed
      deployListener()
    }
  }

  const addEndpoint = (type: "get" | "post") => {
    if (!config) return

    const newEndpoints =
      type === "get" ? [...(config.http?.get_endpoints || []), ""] : [...(config.http?.post_endpoints || []), ""]

    setConfig({
      ...config,
      http: {
        ...config.http,
        [type === "get" ? "get_endpoints" : "post_endpoints"]: newEndpoints,
      },
    })
  }

  const removeEndpoint = (type: "get" | "post", index: number) => {
    if (!config) return

    const endpoints = type === "get" ? config.http?.get_endpoints : config.http?.post_endpoints
    const newEndpoints = endpoints?.filter((_, i) => i !== index)

    setConfig({
      ...config,
      http: {
        ...config.http,
        [type === "get" ? "get_endpoints" : "post_endpoints"]: newEndpoints,
      },
    })
  }

  const updateEndpoint = (type: "get" | "post", index: number, value: string) => {
    if (!config) return

    const endpoints = type === "get" ? config.http?.get_endpoints : config.http?.post_endpoints
    const newEndpoints = [...(endpoints || [])]
    newEndpoints[index] = value

    setConfig({
      ...config,
      http: {
        ...config.http!,
        [type === "get" ? "get_endpoints" : "post_endpoints"]: newEndpoints,
      },
    })
  }

  const getAvailableTabs = () => {
    const tabs = ["basic", "crypto", "status"]

    if (config?.protocol === "http" || config?.protocol === "https") {
      tabs.splice(1, 0, "http")
    }
    if (config?.protocol === "https") {
      tabs.splice(2, 0, "tls")
    }
    if (config?.protocol === "dns") {
      tabs.splice(1, 0, "dns")
    }
    if (config?.protocol === "icmp") {
      tabs.splice(1, 0, "icmp")
    }
    if (config?.protocol === "tcp") {
      tabs.splice(1, 0, "tcp")
    }

    return tabs
  }

  if (!selectedListener || !config) {
    return (
      <Card className="h-full flex items-center justify-center bg-gradient-to-br from-card to-card/50 border-border/50 shadow-lg">
        <CardContent className="bg-gradient-to-b from-card/30 to-background/50">
          <div className="text-center text-muted-foreground">
            <TestTube className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Select a listener to view configuration</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="h-full flex flex-col bg-gradient-to-br from-card to-card/50 border-border/50 shadow-lg">
        <CardHeader className="pb-6 px-8 py-6 border-b border-border/50 bg-card/80 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-8 bg-gradient-to-b from-primary to-primary/60 rounded-full"></div>
              <CardTitle className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Listener Configuration
              </CardTitle>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 bg-transparent"
                onClick={performProbe}
                disabled={isProbing || !config}
              >
                {isProbing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {isProbing ? "Probing..." : "Probe"}
              </Button>

              <Button
                onClick={handleSaveOrDeploy}
                disabled={validationErrors.length > 0 || isDeploying}
                className="flex-1"
              >
                {isDeploying ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {isDeployed ? "Saving..." : "Deploying..."}
                  </>
                ) : (
                  <>{isDeployed ? "Save" : "Deploy"}</>
                )}
              </Button>

              {isDeployed && (
                <Button onClick={stopListener} disabled={isDeploying} variant="destructive" className="px-4">
                  {isDeploying ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    "Stop"
                  )}
                </Button>
              )}
            </div>
          </div>

          {validationErrors.length > 0 && (
            <div className="bg-gradient-to-r from-destructive/10 to-destructive/5 border border-destructive/20 rounded-lg p-4 mt-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-destructive text-sm font-semibold mb-3">
                <AlertTriangle className="h-4 w-4" />
                Configuration Errors
              </div>
              <ul className="text-sm text-destructive/90 space-y-1.5">
                {validationErrors.map((error, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="w-1 h-1 bg-destructive rounded-full mt-2 flex-shrink-0"></span>
                    {error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-0 bg-gradient-to-b from-card/30 to-background/50">
          <Tabs defaultValue="basic" className="h-full flex flex-col">
            <TabsList className="mx-8 mt-6 mb-6 bg-muted/50 backdrop-blur-sm border border-border/30 shadow-sm">
              {getAvailableTabs().map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className={`capitalize data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/50 transition-all duration-200 relative ${
                    tabErrors[tab] ? "text-destructive" : ""
                  }`}
                >
                  {tab === "status" ? "Status & OPSEC" : tab}
                  {tabErrors[tab] && <AlertTriangle className="h-3 w-3 ml-1 text-destructive" />}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex-1 overflow-y-auto px-8 pb-8">
              <TabsContent value="basic" className="space-y-8 mt-0">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Listener Name</Label>
                      <Input
                        id="name"
                        value={config.name}
                        onChange={(e) => setConfig({ ...config, name: e.target.value })}
                        className="bg-background/50 border-border/50"
                        placeholder="Enter listener name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="protocol">Protocol</Label>
                      <Select
                        value={config.protocol}
                        onValueChange={(value: any) => setConfig({ ...config, protocol: value })}
                      >
                        <SelectTrigger className="bg-background/50 border-border/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="http">HTTP</SelectItem>
                          <SelectItem value="https">HTTPS</SelectItem>
                          <SelectItem value="dns">DNS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-4 p-4 bg-background/30 rounded-lg border border-border/30">
                    <h4 className="text-sm font-medium text-foreground/90">Agent Key Configuration</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="agent_key">Agent Key</Label>
                        <Input
                          id="agent_key"
                          value={config.base_agent_key.key}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              base_agent_key: { ...config.base_agent_key, key: e.target.value },
                            })
                          }
                          className="bg-background/50 border-border/50"
                          placeholder="Enter agent key"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="agent_name">Agent Name</Label>
                        <Input
                          id="agent_name"
                          value={config.base_agent_key.name}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              base_agent_key: { ...config.base_agent_key, name: e.target.value },
                            })
                          }
                          className="bg-background/50 border-border/50"
                          placeholder="Enter agent name"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label htmlFor="port" className="text-sm font-semibold text-foreground/90">
                        Port
                      </Label>
                      <Input
                        id="port"
                        type="number"
                        value={config.port}
                        onChange={(e) => setConfig({ ...config, port: Number.parseInt(e.target.value) || 0 })}
                        className="bg-card/80 border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-200 backdrop-blur-sm"
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="bind_addr" className="text-sm font-semibold text-foreground/90">
                        Local Bind Address
                      </Label>
                      <Input
                        id="bind_addr"
                        value={config.bind_addr}
                        onChange={(e) => setConfig({ ...config, bind_addr: e.target.value })}
                        className="bg-card/80 border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-200 backdrop-blur-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center space-x-3 mb-4">
                      <Switch
                        id="use_ip_mode"
                        checked={config.use_ip_instead_of_dns}
                        onCheckedChange={(checked) => setConfig({ ...config, use_ip_instead_of_dns: checked })}
                      />
                      <Label htmlFor="use_ip_mode" className="text-sm font-semibold text-foreground/90">
                        Use IP addresses instead of DNS
                      </Label>
                    </div>

                    {config.use_ip_instead_of_dns ? (
                      <div className="space-y-3">
                        <Label className="text-sm font-semibold text-foreground/90">IP Addresses</Label>
                        {config.ip_addresses.map((ip, index) => (
                          <div key={index} className="flex gap-2">
                            <Input
                              value={ip}
                              onChange={(e) => {
                                const newIps = [...config.ip_addresses]
                                newIps[index] = e.target.value
                                setConfig({ ...config, ip_addresses: newIps })
                              }}
                              placeholder="Enter IP address"
                              className="bg-card/80 border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-200 backdrop-blur-sm"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const newIps = config.ip_addresses.filter((_, i) => i !== index)
                                setConfig({ ...config, ip_addresses: newIps })
                              }}
                              className="px-3"
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setConfig({ ...config, ip_addresses: [...config.ip_addresses, ""] })}
                          className="w-full"
                        >
                          Add IP Address
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <Label htmlFor="public_dns" className="text-sm font-semibold text-foreground/90">
                          Public DNS Name
                        </Label>
                        <Input
                          id="public_dns"
                          value={config.public_dns}
                          onChange={(e) => setConfig({ ...config, public_dns: e.target.value })}
                          className="bg-card/80 border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-200 backdrop-blur-sm"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 p-6 bg-gradient-to-r from-muted/40 to-muted/20 rounded-xl border border-border/30 backdrop-blur-sm">
                    <div className="flex items-center space-x-3">
                      <Switch
                        id="target_domain"
                        checked={config.target_domain.enabled}
                        onCheckedChange={(checked) =>
                          setConfig({
                            ...config,
                            target_domain: { ...config.target_domain, enabled: checked },
                          })
                        }
                        className="data-[state=checked]:bg-primary"
                      />
                      <Label htmlFor="target_domain" className="text-sm font-semibold text-foreground/90">
                        Target Domain Verification
                      </Label>
                    </div>
                    {config.target_domain.enabled && (
                      <Input
                        placeholder="Expected domain (e.g., corp.example.com)"
                        value={config.target_domain.expected}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            target_domain: { ...config.target_domain, expected: e.target.value },
                          })
                        }
                        className="bg-card/80 border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-200 backdrop-blur-sm"
                      />
                    )}
                  </div>
                </div>
              </TabsContent>

              {(config.protocol === "http" || config.protocol === "https") && (
                <TabsContent value="http" className="space-y-6 mt-0">
                  <div className="p-4 bg-muted/30 rounded-md border border-border">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-medium">GET Endpoints (Agent Polling)</Label>
                      <Button size="sm" variant="outline" onClick={() => addEndpoint("get")} className="bg-card">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {config.http?.get_endpoints.map((endpoint, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={endpoint}
                            onChange={(e) => updateEndpoint("get", index, e.target.value)}
                            placeholder="/api/health"
                            className="bg-card border-border"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeEndpoint("get", index)}
                            className="bg-card"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 bg-muted/30 rounded-md border border-border">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-medium">POST Endpoints (Agent Responses)</Label>
                      <Button size="sm" variant="outline" onClick={() => addEndpoint("post")} className="bg-card">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {config.http?.post_endpoints.map((endpoint, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={endpoint}
                            onChange={(e) => updateEndpoint("post", index, e.target.value)}
                            placeholder="/api/telemetry"
                            className="bg-card border-border"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeEndpoint("post", index)}
                            className="bg-card"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="success_status">Success Status Code</Label>
                      <Input
                        id="success_status"
                        type="number"
                        value={config.http?.success_status || 204}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            http: { ...config.http!, success_status: Number.parseInt(e.target.value) || 204 },
                          })
                        }
                        className="bg-card border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="decoy_status">Decoy Status Code</Label>
                      <Input
                        id="decoy_status"
                        type="number"
                        value={config.http?.decoy_status || 200}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            http: { ...config.http!, decoy_status: Number.parseInt(e.target.value) || 200 },
                          })
                        }
                        className="bg-card border-border"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="decoy_body">Decoy Response Body</Label>
                    <Textarea
                      id="decoy_body"
                      value={config.http?.decoy_body || ""}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          http: { ...config.http!, decoy_body: e.target.value },
                        })
                      }
                      placeholder='{"status":"ok"}'
                      className="bg-card border-border"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="respond_via_get"
                      checked={config.http?.respond_via_get || false}
                      onCheckedChange={(checked) =>
                        setConfig({
                          ...config,
                          http: { ...config.http!, respond_via_get: checked },
                        })
                      }
                    />
                    <Label htmlFor="respond_via_get">Respond via GET (small data only)</Label>
                  </div>
                </TabsContent>
              )}

              {config.protocol === "https" && (
                <TabsContent value="tls" className="space-y-6 mt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="min_version">Min TLS Version</Label>
                      <Select
                        value={config.tls?.min_version || "TLS1.2"}
                        onValueChange={(value) =>
                          setConfig({
                            ...config,
                            tls: { ...config.tls!, min_version: value },
                          })
                        }
                      >
                        <SelectTrigger className="bg-card border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TLS1.2">TLS 1.2</SelectItem>
                          <SelectItem value="TLS1.3">TLS 1.3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="max_version">Max TLS Version</Label>
                      <Select
                        value={config.tls?.max_version || "TLS1.3"}
                        onValueChange={(value) =>
                          setConfig({
                            ...config,
                            tls: { ...config.tls!, max_version: value },
                          })
                        }
                      >
                        <SelectTrigger className="bg-card border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TLS1.2">TLS 1.2</SelectItem>
                          <SelectItem value="TLS1.3">TLS 1.3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cert_source">Certificate Source</Label>
                    <Select
                      value={config.tls?.cert_source || "acme"}
                      onValueChange={(value: any) =>
                        setConfig({
                          ...config,
                          tls: { ...config.tls!, cert_source: value },
                        })
                      }
                    >
                      <SelectTrigger className="bg-card border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="acme">ACME (Let's Encrypt)</SelectItem>
                        <SelectItem value="upload">Upload PEM</SelectItem>
                        <SelectItem value="ref">Reference Existing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {config.tls?.cert_source === "ref" && (
                    <div className="space-y-2">
                      <Label htmlFor="cert_ref">Certificate Reference ID</Label>
                      <Input
                        id="cert_ref"
                        value={config.tls?.cert_ref || ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            tls: { ...config.tls!, cert_ref: e.target.value },
                          })
                        }
                        className="bg-card border-border"
                      />
                    </div>
                  )}
                </TabsContent>
              )}

              {config.protocol === "dns" && (
                <TabsContent value="dns" className="space-y-6 mt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="base_name">Base Name</Label>
                      <Input
                        id="base_name"
                        value={config.dns?.base_name || ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            dns: { ...config.dns!, base_name: e.target.value },
                          })
                        }
                        className="bg-card border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dns_mode">Mode</Label>
                      <Select
                        value={config.dns?.mode || "pure"}
                        onValueChange={(value) =>
                          setConfig({
                            ...config,
                            dns: { ...config.dns!, mode: value },
                          })
                        }
                      >
                        <SelectTrigger className="bg-card border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pure">Pure DNS</SelectItem>
                          <SelectItem value="hybrid">Hybrid DNS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {config.dns?.mode === "hybrid" && (
                    <div className="space-y-2">
                      <Label htmlFor="https_fallback">HTTPS Fallback Endpoint</Label>
                      <Input
                        id="https_fallback"
                        value={config.dns?.https_fallback || ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            dns: { ...config.dns!, https_fallback: e.target.value },
                          })
                        }
                        className="bg-card border-border"
                      />
                    </div>
                  )}
                </TabsContent>
              )}

              {config.protocol === "icmp" && (
                <TabsContent value="icmp" className="space-y-6 mt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="max_payload">Max Payload Size</Label>
                      <Input
                        id="max_payload"
                        type="number"
                        value={config.icmp?.max_payload || 0}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            icmp: { ...config.icmp!, max_payload: Number.parseInt(e.target.value) || 0 },
                          })
                        }
                        className="bg-card border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="echo_id_strategy">Echo ID Strategy</Label>
                      <Select
                        value={config.icmp?.echo_id_strategy || "auto"}
                        onValueChange={(value) =>
                          setConfig({
                            ...config,
                            icmp: { ...config.icmp!, echo_id_strategy: value },
                          })
                        }
                      >
                        <SelectTrigger className="bg-card border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="fixed">Fixed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>
              )}

              {config.protocol === "tcp" && (
                <TabsContent value="tcp" className="space-y-6 mt-0">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="framing">Framing</Label>
                      <Select
                        value={config.tcp?.framing || "length_prefix"}
                        onValueChange={(value) =>
                          setConfig({
                            ...config,
                            tcp: { ...config.tcp!, framing: value },
                          })
                        }
                      >
                        <SelectTrigger className="bg-card border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="length_prefix">Length Prefix</SelectItem>
                          <SelectItem value="line">Line</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="idle_timeout_sec">Idle Timeout (seconds)</Label>
                      <Input
                        id="idle_timeout_sec"
                        type="number"
                        value={config.tcp?.idle_timeout_sec || 0}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            tcp: { ...config.tcp!, idle_timeout_sec: Number.parseInt(e.target.value) || 0 },
                          })
                        }
                        className="bg-card border-border"
                      />
                    </div>
                  </div>
                </TabsContent>
              )}

              <TabsContent value="crypto" className="space-y-6 mt-0">
                <div className="space-y-2">
                  <Label htmlFor="crypto_profile">Crypto Profile</Label>
                  <Select
                    value={config.crypto.profile}
                    onValueChange={(value) =>
                      setConfig({
                        ...config,
                        crypto: { ...config.crypto, profile: value },
                      })
                    }
                  >
                    <SelectTrigger className="bg-card border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent-default">Agent Default</SelectItem>
                      <SelectItem value="manual">Manual Configuration</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {config.crypto.profile === "manual" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="crypto_mode">Algorithm</Label>
                      <Select
                        value={config.crypto.mode}
                        onValueChange={(value) =>
                          setConfig({
                            ...config,
                            crypto: { ...config.crypto, mode: value },
                          })
                        }
                      >
                        <SelectTrigger className="bg-card border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="psk_aesgcm">PSK-AES-GCM</SelectItem>
                          <SelectItem value="ecdh_aesgcm">ECDH(X25519)+AES-GCM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="key_id">Key ID</Label>
                      <Input
                        id="key_id"
                        value={config.crypto.key_id}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            crypto: { ...config.crypto, key_id: e.target.value },
                          })
                        }
                        className="bg-card border-border"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="iv_policy">IV/Nonce Policy</Label>
                      <Select
                        value={config.crypto.iv_policy}
                        onValueChange={(value) =>
                          setConfig({
                            ...config,
                            crypto: { ...config.crypto, iv_policy: value },
                          })
                        }
                      >
                        <SelectTrigger className="bg-card border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto_per_message">Auto-rotate per message</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="status" className="space-y-6 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Badge className="bg-green-500/20 text-green-100 border-green-500/30">Active</Badge>
                  </div>
                  <div className="space-y-2">
                    <Label>Last Activity</Label>
                    <p className="text-sm text-muted-foreground">2 minutes ago</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Total Requests</Label>
                    <p className="text-2xl font-bold text-primary">1,247</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Errors</Label>
                    <p className="text-2xl font-bold text-destructive">3</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>OPSEC Warnings</Label>
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-3">
                    <div className="flex items-center gap-2 text-yellow-600 text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      Single hard-coded endpoint detected - consider adding more endpoints for better OPSEC
                    </div>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {showProbePopup && probeResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <Card
            className={`border-2 shadow-xl max-w-md mx-4 ${
              probeResult.success ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"
            }`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                {probeResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <CardTitle className={`text-sm ${probeResult.success ? "text-green-700" : "text-red-700"}`}>
                  {probeResult.message}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2 text-xs">
                {Object.entries(probeResult.checks).map(([key, check]) => (
                  <div key={key} className="flex items-start gap-2">
                    {check.success ? (
                      <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                    )}
                    <span className={check.success ? "text-green-700" : "text-red-700"}>{check.message}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-4">
                <Button variant="outline" size="sm" onClick={() => setShowProbePopup(false)} className="text-xs">
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}

export { ListenerEditor }
export default ListenerEditor
