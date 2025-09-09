"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus, Play, Pause, Trash2 } from "lucide-react"

interface Listener {
  id: string
  name: string
  protocol: "http" | "https" | "dns" | "icmp" | "tcp"
  port: number
  public_dns: string
  ip_addresses?: string[]
  status: "active" | "inactive" | "error"
  last_activity: number
  requests_count: number
  errors_count: number
}

interface ListenerDashboardProps {
  onListenerSelect: (listenerId: string | null) => void
  selectedListener: string | null
  listeners: Listener[]
  onListenerStatusUpdate: (listenerId: string, status: Listener["status"]) => void
  onNewListener: () => void // Added callback for new listener wizard
  onListenerDelete?: (listenerId: string) => void
}

export function ListenerDashboard({
  onListenerSelect,
  selectedListener,
  listeners,
  onListenerStatusUpdate,
  onNewListener, // Added onNewListener prop
  onListenerDelete,
}: ListenerDashboardProps) {
  const [searchTerm, setSearchTerm] = useState("")

  const filteredListeners = listeners.filter(
    (listener) =>
      listener.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      listener.public_dns.toLowerCase().includes(searchTerm.toLowerCase()) ||
      listener.protocol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (listener.ip_addresses &&
        listener.ip_addresses.some((ip) => ip.toLowerCase().includes(searchTerm.toLowerCase()))),
  )

  const getStatusColor = (status: Listener["status"]) => {
    switch (status) {
      case "active":
        return "bg-green-500/20 text-green-100 border-green-500/30"
      case "inactive":
        return "bg-gray-500/20 text-white border-gray-500/30"
      case "error":
        return "bg-red-500/20 text-red-100 border-red-500/30"
      default:
        return "bg-gray-500/20 text-gray-100 border-gray-500/30"
    }
  }

  const getProtocolColor = (protocol: string) => {
    switch (protocol) {
      case "https":
        return "bg-blue-500/20 text-blue-100 border-blue-500/30"
      case "http":
        return "bg-cyan-500/20 text-cyan-100 border-cyan-500/30"
      case "dns":
        return "bg-purple-500/20 text-purple-100 border-purple-500/30"
      case "tcp":
        return "bg-orange-500/20 text-orange-100 border-orange-500/30"
      case "icmp":
        return "bg-pink-500/20 text-pink-100 border-pink-500/30"
      default:
        return "bg-gray-500/20 text-gray-100 border-gray-500/30"
    }
  }

  const formatLastActivity = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (seconds < 60) return `${seconds}s ago`
    if (minutes < 60) return `${minutes}m ago`
    return `${hours}h ago`
  }

  const handlePlayPause = async (e: React.MouseEvent, listener: Listener) => {
    e.stopPropagation() // Prevent row selection when clicking button

    if (listener.status === "active") {
      // Pause/Stop the listener
      onListenerStatusUpdate(listener.id, "inactive")
    } else {
      // Start/Deploy the listener
      onListenerStatusUpdate(listener.id, "active")

      // Simulate probe check after deployment
      setTimeout(() => {
        // Simulate random probe success/failure for demo
        const probeSuccess = Math.random() > 0.2 // 80% success rate
        if (!probeSuccess) {
          onListenerStatusUpdate(listener.id, "error")
        }
      }, 2000)
    }
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Listeners</CardTitle>
          <Button size="sm" className="gap-2" onClick={onNewListener}>
            <Plus className="h-4 w-4" />
            New Listener
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search listeners..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        {/* Header Row */}
        <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border">
          <div className="col-span-3">Name</div>
          <div className="col-span-2">Protocol</div>
          <div className="col-span-1">Port</div>
          <div className="col-span-3">Public DNS/IP</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1">Activity</div>
          <div className="col-span-1">Actions</div>
        </div>

        {/* Listener Rows */}
        <div className="flex-1 overflow-y-auto">
          {filteredListeners.map((listener) => (
            <div
              key={listener.id}
              className={`grid grid-cols-12 gap-2 px-4 py-2 cursor-pointer transition-all hover:bg-accent/5 border-b border-border/50 ${
                selectedListener === listener.id ? "ring-1 ring-primary bg-primary/5" : ""
              }`}
              onClick={() => onListenerSelect(listener.id)}
            >
              <div className="col-span-3 flex items-center">
                <span className="font-medium text-sm truncate">{listener.name}</span>
              </div>

              <div className="col-span-2 flex items-center">
                <Badge className={`text-xs px-2 py-1 ${getProtocolColor(listener.protocol)}`}>
                  {listener.protocol.toUpperCase()}
                </Badge>
              </div>

              <div className="col-span-1 flex items-center">
                <span className="text-sm text-muted-foreground">{listener.port}</span>
              </div>

              <div className="col-span-3 flex items-center">
                <span className="text-sm text-muted-foreground truncate">
                  {listener.public_dns ||
                    (listener.ip_addresses && listener.ip_addresses.length > 0
                      ? listener.ip_addresses.join(", ")
                      : "No DNS/IP configured")}
                </span>
              </div>

              <div className="col-span-1 flex items-center">
                <Badge className={`text-xs px-2 py-1 ${getStatusColor(listener.status)}`}>{listener.status}</Badge>
              </div>

              <div className="col-span-1 flex items-center">
                <span className="text-xs text-muted-foreground">{formatLastActivity(listener.last_activity)}</span>
              </div>

              <div className="col-span-1 flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => handlePlayPause(e, listener)}>
                  {listener.status === "active" ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    onListenerDelete?.(listener.id)
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
