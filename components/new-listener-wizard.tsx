"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { CheckCircle, ArrowRight, ArrowLeft, X, Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react"

interface ListenerConfig {
  id: string
  name: string
  protocol: "http" | "https" | "dns" | "icmp" | "tcp"
  port: number
  bind_addr: string
  public_dns?: string
  ip_addresses: string[]
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
}

interface NewListenerWizardProps {
  onComplete: (listener: ListenerConfig) => void
  onCancel: () => void
}

export default function NewListenerWizard({ onComplete, onCancel }: NewListenerWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [config, setConfig] = useState<ListenerConfig>({
    id: `lst-${Date.now()}`,
    name: "",
    protocol: "http",
    port: 80,
    bind_addr: "0.0.0.0",
    ip_addresses: [],
    target_domain: { enabled: false, expected: "" },
    http: {
      get_endpoints: ["/api/health"],
      post_endpoints: ["/api/data"],
      success_status: 200,
      decoy_status: 404,
      decoy_body: "Not Found",
      respond_via_get: false,
    },
    crypto: {
      profile: "agent-default",
      mode: "ecdh_aesgcm",
      key_id: "k-2025-09",
      psk_write_only: null,
      iv_policy: "auto_per_message",
    },
  })

  const [isDeploying, setIsDeploying] = useState(false)
  const [deploymentResult, setDeploymentResult] = useState<{ success: boolean; message: string } | null>(null)

  const steps = [
    { id: "basic", title: "Basic Configuration", description: "Set up listener name, protocol, and network settings" },
    { id: "protocol", title: "Protocol Settings", description: "Configure protocol-specific options" },
    { id: "crypto", title: "Crypto & Security", description: "Set up encryption and security parameters" },
    { id: "review", title: "Review & Deploy", description: "Review configuration and deploy listener" },
  ]

  const getProtocolSpecificSteps = () => {
    const protocolSteps = []
    if (config.protocol === "http" || config.protocol === "https") {
      protocolSteps.push("HTTP Configuration")
    }
    if (config.protocol === "https") {
      protocolSteps.push("TLS Configuration")
    }
    if (config.protocol === "dns") {
      protocolSteps.push("DNS Configuration")
    }
    if (config.protocol === "icmp") {
      protocolSteps.push("ICMP Configuration")
    }
    if (config.protocol === "tcp") {
      protocolSteps.push("TCP Configuration")
    }
    return protocolSteps
  }

  const validateCurrentStep = () => {
    switch (currentStep) {
      case 0: // Basic
        const hasPublicDns = config.public_dns && config.public_dns.trim() !== ""
        const hasIpAddresses = config.ip_addresses.length > 0 && config.ip_addresses.some((ip) => ip.trim() !== "")
        return config.name.trim() !== "" && (hasPublicDns || hasIpAddresses) && config.port > 0
      case 1: // Protocol
        if (config.protocol === "http" || config.protocol === "https") {
          return config.http?.get_endpoints.length > 0 && config.http?.post_endpoints.length > 0
        }
        if (config.protocol === "dns") {
          return config.dns?.base_name.trim() !== ""
        }
        return true
      case 2: // Crypto
        return config.crypto.profile.trim() !== "" && config.crypto.key_id.trim() !== ""
      default:
        return true
    }
  }

  const handleNext = () => {
    if (validateCurrentStep() && currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleDeploy = async () => {
    setIsDeploying(true)
    setDeploymentResult(null)

    try {
      // Simulate deployment delay
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Simulate probe checks
      const probeSuccess = Math.random() > 0.2 // 80% success rate

      if (probeSuccess) {
        setDeploymentResult({
          success: true,
          message: `Listener "${config.name}" successfully deployed and passed all probe checks!`,
        })
        setTimeout(() => {
          onComplete({ ...config, status: "active" } as any)
        }, 1500)
      } else {
        setDeploymentResult({
          success: false,
          message: "Deployment failed: Unable to bind to specified port or probe checks failed.",
        })
      }
    } catch (error) {
      setDeploymentResult({ success: false, message: "Deployment failed: Unexpected error occurred." })
    } finally {
      setIsDeploying(false)
    }
  }

  const addEndpoint = (type: "get" | "post") => {
    if (!config.http) return
    const endpoints = type === "get" ? config.http.get_endpoints : config.http.post_endpoints
    const newEndpoints = [...endpoints, ""]
    setConfig({
      ...config,
      http: {
        ...config.http,
        [type === "get" ? "get_endpoints" : "post_endpoints"]: newEndpoints,
      },
    })
  }

  const removeEndpoint = (type: "get" | "post", index: number) => {
    if (!config.http) return
    const endpoints = type === "get" ? config.http.get_endpoints : config.http.post_endpoints
    const newEndpoints = endpoints.filter((_, i) => i !== index)
    setConfig({
      ...config,
      http: {
        ...config.http,
        [type === "get" ? "get_endpoints" : "post_endpoints"]: newEndpoints,
      },
    })
  }

  const updateEndpoint = (type: "get" | "post", index: number, value: string) => {
    if (!config.http) return
    const endpoints = type === "get" ? config.http.get_endpoints : config.http.post_endpoints
    const newEndpoints = [...endpoints]
    newEndpoints[index] = value
    setConfig({
      ...config,
      http: {
        ...config.http,
        [type === "get" ? "get_endpoints" : "post_endpoints"]: newEndpoints,
      },
    })
  }

  const addIpAddress = () => {
    setConfig({
      ...config,
      ip_addresses: [...config.ip_addresses, ""],
    })
  }

  const removeIpAddress = (index: number) => {
    const newIpAddresses = config.ip_addresses.filter((_, i) => i !== index)
    setConfig({
      ...config,
      ip_addresses: newIpAddresses,
    })
  }

  const updateIpAddress = (index: number, value: string) => {
    const newIpAddresses = [...config.ip_addresses]
    newIpAddresses[index] = value
    setConfig({
      ...config,
      ip_addresses: newIpAddresses,
    })
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Basic Configuration
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Listener Name *</Label>
                <Input
                  id="name"
                  value={config.name}
                  onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  placeholder="e.g., Edge-Listener"
                  className="bg-card/50 border-border/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="protocol">Protocol *</Label>
                <Select
                  value={config.protocol}
                  onValueChange={(value: any) => {
                    const newConfig = { ...config, protocol: value }
                    if (value === "http") newConfig.port = 80
                    else if (value === "https") newConfig.port = 443
                    else if (value === "dns") newConfig.port = 53
                    else if (value === "tcp") newConfig.port = 8080
                    else if (value === "icmp") newConfig.port = 0
                    setConfig(newConfig)
                  }}
                >
                  <SelectTrigger className="bg-card/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="https">HTTPS</SelectItem>
                    <SelectItem value="dns">DNS</SelectItem>
                    <SelectItem value="icmp">ICMP</SelectItem>
                    <SelectItem value="tcp">TCP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="port">Port *</Label>
                <Input
                  id="port"
                  type="number"
                  value={config.port}
                  onChange={(e) => setConfig({ ...config, port: Number.parseInt(e.target.value) || 0 })}
                  className="bg-card/50 border-border/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bind_addr">Local Bind Address</Label>
                <Input
                  id="bind_addr"
                  value={config.bind_addr}
                  onChange={(e) => setConfig({ ...config, bind_addr: e.target.value })}
                  className="bg-card/50 border-border/50"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="public_dns">Public DNS Name (Optional)</Label>
                <Input
                  id="public_dns"
                  value={config.public_dns || ""}
                  onChange={(e) => setConfig({ ...config, public_dns: e.target.value })}
                  placeholder="e.g., updates.example.com"
                  className="bg-card/50 border-border/50"
                />
                <p className="text-xs text-muted-foreground">Leave empty if using IP addresses only</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>IP Addresses (Alternative to DNS)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addIpAddress}
                    className="h-8 bg-transparent"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add IP
                  </Button>
                </div>
                <div className="space-y-2">
                  {config.ip_addresses.map((ip, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={ip}
                        onChange={(e) => updateIpAddress(index, e.target.value)}
                        placeholder="e.g., 192.168.1.100"
                        className="bg-card/50 border-border/50"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeIpAddress(index)}
                        className="h-10 w-10 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {config.ip_addresses.length === 0 && (
                    <p className="text-xs text-muted-foreground">Add IP addresses if not using a public DNS name</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border/30">
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
                />
                <Label htmlFor="target_domain">Enable Target Domain Validation</Label>
              </div>
              {config.target_domain.enabled && (
                <div className="space-y-2">
                  <Label htmlFor="expected_domain">Expected Target Domain</Label>
                  <Input
                    id="expected_domain"
                    value={config.target_domain.expected}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        target_domain: { ...config.target_domain, expected: e.target.value },
                      })
                    }
                    placeholder="e.g., corp.example.com"
                    className="bg-card/50 border-border/50"
                  />
                </div>
              )}
            </div>
          </div>
        )

      case 1: // Protocol Configuration
        if (config.protocol === "http" || config.protocol === "https") {
          return (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>GET Endpoints</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => addEndpoint("get")} className="h-8">
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                <div className="space-y-2">
                  {config.http?.get_endpoints.map((endpoint, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={endpoint}
                        onChange={(e) => updateEndpoint("get", index, e.target.value)}
                        placeholder="/api/endpoint"
                        className="bg-card/50 border-border/50"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeEndpoint("get", index)}
                        className="h-10 w-10 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>POST Endpoints</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => addEndpoint("post")} className="h-8">
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
                <div className="space-y-2">
                  {config.http?.post_endpoints.map((endpoint, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={endpoint}
                        onChange={(e) => updateEndpoint("post", index, e.target.value)}
                        placeholder="/api/endpoint"
                        className="bg-card/50 border-border/50"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeEndpoint("post", index)}
                        className="h-10 w-10 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Success Status Code</Label>
                  <Input
                    type="number"
                    value={config.http?.success_status}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        http: { ...config.http!, success_status: Number.parseInt(e.target.value) || 200 },
                      })
                    }
                    className="bg-card/50 border-border/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Decoy Status Code</Label>
                  <Input
                    type="number"
                    value={config.http?.decoy_status}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        http: { ...config.http!, decoy_status: Number.parseInt(e.target.value) || 404 },
                      })
                    }
                    className="bg-card/50 border-border/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Decoy Response Body</Label>
                <Textarea
                  value={config.http?.decoy_body}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      http: { ...config.http!, decoy_body: e.target.value },
                    })
                  }
                  className="bg-card/50 border-border/50"
                  rows={3}
                />
              </div>

              {config.protocol === "https" && (
                <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border/30">
                  <h4 className="font-semibold">TLS Configuration</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Certificate Source</Label>
                      <Select
                        value={config.tls?.cert_source || "acme"}
                        onValueChange={(value: any) =>
                          setConfig({
                            ...config,
                            tls: { ...config.tls!, cert_source: value },
                          })
                        }
                      >
                        <SelectTrigger className="bg-card/50 border-border/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="acme">ACME (Let's Encrypt)</SelectItem>
                          <SelectItem value="upload">Upload Certificate</SelectItem>
                          <SelectItem value="ref">Certificate Reference</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Min TLS Version</Label>
                      <Select
                        value={config.tls?.min_version || "TLS1.2"}
                        onValueChange={(value) =>
                          setConfig({
                            ...config,
                            tls: { ...config.tls!, min_version: value },
                          })
                        }
                      >
                        <SelectTrigger className="bg-card/50 border-border/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TLS1.2">TLS 1.2</SelectItem>
                          <SelectItem value="TLS1.3">TLS 1.3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        }

        if (config.protocol === "dns") {
          return (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Base Domain Name *</Label>
                <Input
                  value={config.dns?.base_name || ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      dns: { ...config.dns!, base_name: e.target.value },
                    })
                  }
                  placeholder="e.g., updates.example.com"
                  className="bg-card/50 border-border/50"
                />
              </div>
              <div className="space-y-2">
                <Label>DNS Mode</Label>
                <Select
                  value={config.dns?.mode || "pure"}
                  onValueChange={(value: any) =>
                    setConfig({
                      ...config,
                      dns: { ...config.dns!, mode: value },
                    })
                  }
                >
                  <SelectTrigger className="bg-card/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pure">Pure DNS</SelectItem>
                    <SelectItem value="hybrid">Hybrid (DNS + HTTPS)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {config.dns?.mode === "hybrid" && (
                <div className="space-y-2">
                  <Label>HTTPS Fallback URL</Label>
                  <Input
                    value={config.dns?.https_fallback || ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        dns: { ...config.dns!, https_fallback: e.target.value },
                      })
                    }
                    placeholder="https://fallback.example.com"
                    className="bg-card/50 border-border/50"
                  />
                </div>
              )}
            </div>
          )
        }

        return (
          <div className="text-center text-muted-foreground">
            No additional configuration needed for {config.protocol.toUpperCase()}
          </div>
        )

      case 2: // Crypto Configuration
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Crypto Profile *</Label>
                <Select
                  value={config.crypto.profile}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      crypto: { ...config.crypto, profile: value },
                    })
                  }
                >
                  <SelectTrigger className="bg-card/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent-default">Agent Default</SelectItem>
                    <SelectItem value="high-security">High Security</SelectItem>
                    <SelectItem value="performance">Performance Optimized</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Encryption Mode</Label>
                <Select
                  value={config.crypto.mode}
                  onValueChange={(value) =>
                    setConfig({
                      ...config,
                      crypto: { ...config.crypto, mode: value },
                    })
                  }
                >
                  <SelectTrigger className="bg-card/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ecdh_aesgcm">ECDH + AES-GCM</SelectItem>
                    <SelectItem value="rsa_aesgcm">RSA + AES-GCM</SelectItem>
                    <SelectItem value="chacha20poly1305">ChaCha20-Poly1305</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Key ID *</Label>
              <Input
                value={config.crypto.key_id}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    crypto: { ...config.crypto, key_id: e.target.value },
                  })
                }
                placeholder="e.g., k-2025-09"
                className="bg-card/50 border-border/50"
              />
            </div>

            <div className="space-y-2">
              <Label>IV Policy</Label>
              <Select
                value={config.crypto.iv_policy}
                onValueChange={(value) =>
                  setConfig({
                    ...config,
                    crypto: { ...config.crypto, iv_policy: value },
                  })
                }
              >
                <SelectTrigger className="bg-card/50 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto_per_message">Auto per Message</SelectItem>
                  <SelectItem value="counter_based">Counter Based</SelectItem>
                  <SelectItem value="random">Random</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )

      case 3: // Review & Deploy
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h4 className="font-semibold">Configuration Summary</h4>
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border border-border/30">
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <p className="font-medium">{config.name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Protocol</Label>
                  <p className="font-medium uppercase">{config.protocol}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Port</Label>
                  <p className="font-medium">{config.port}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {config.public_dns ? "Public DNS" : "IP Addresses"}
                  </Label>
                  <p className="font-medium">
                    {config.public_dns || config.ip_addresses.join(", ") || "None specified"}
                  </p>
                </div>
              </div>

              {(config.protocol === "http" || config.protocol === "https") && (
                <div className="p-4 bg-muted/30 rounded-lg border border-border/30">
                  <Label className="text-xs text-muted-foreground">HTTP Endpoints</Label>
                  <div className="mt-2 space-y-1">
                    <p className="text-sm">
                      <strong>GET:</strong> {config.http?.get_endpoints.join(", ")}
                    </p>
                    <p className="text-sm">
                      <strong>POST:</strong> {config.http?.post_endpoints.join(", ")}
                    </p>
                  </div>
                </div>
              )}

              <div className="p-4 bg-muted/30 rounded-lg border border-border/30">
                <Label className="text-xs text-muted-foreground">Crypto Configuration</Label>
                <div className="mt-2 space-y-1">
                  <p className="text-sm">
                    <strong>Profile:</strong> {config.crypto.profile}
                  </p>
                  <p className="text-sm">
                    <strong>Mode:</strong> {config.crypto.mode}
                  </p>
                  <p className="text-sm">
                    <strong>Key ID:</strong> {config.crypto.key_id}
                  </p>
                </div>
              </div>
            </div>

            {deploymentResult && (
              <div
                className={`p-4 rounded-lg border ${
                  deploymentResult.success
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                }`}
              >
                <div className="flex items-center gap-2">
                  {deploymentResult.success ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  <p className="text-sm font-medium">{deploymentResult.message}</p>
                </div>
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <Card className="h-full flex flex-col bg-gradient-to-br from-card/80 to-background/60 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-4 px-6 py-4 border-b border-border/30">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            New Listener Wizard
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onCancel} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center space-x-2 mt-4">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-200 ${
                  index < currentStep
                    ? "bg-primary border-primary text-primary-foreground"
                    : index === currentStep
                      ? "border-primary text-primary bg-primary/10"
                      : "border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                {index < currentStep ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <span className="text-xs font-medium">{index + 1}</span>
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-12 h-0.5 mx-2 transition-all duration-200 ${
                    index < currentStep ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="mt-3">
          <h3 className="font-medium">{steps[currentStep].title}</h3>
          <p className="text-sm text-muted-foreground">{steps[currentStep].description}</p>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-6">{renderStepContent()}</CardContent>

      <div className="p-6 border-t border-border/30 bg-gradient-to-r from-card/50 to-background/30">
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="bg-card/50 border-border/50"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          {currentStep < steps.length - 1 ? (
            <Button onClick={handleNext} disabled={!validateCurrentStep()} className="bg-primary/90 hover:bg-primary">
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleDeploy}
              disabled={isDeploying || deploymentResult?.success}
              className="bg-primary/90 hover:bg-primary"
            >
              {isDeploying ? "Deploying..." : deploymentResult?.success ? "Completed" : "Deploy Listener"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

export { NewListenerWizard }
