"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

type AgentItem = { name: string; commandsFile: string; exists: boolean }

type Param = {
  name: string
  type: "string" | "boolean"
  default: any
  required: boolean
  description: string
}

type Command = {
  id: string
  name: string
  synopsis: string
  min_integrity: "low" | "medium" | "high"
  opsec: string // we will map boolean UI to safe/unsafe
  parameters: Param[]
  preview: string
  parser: string
  help?: string // stored in file; shown as Description
}

export function AgentMgmt() {
  const [agents, setAgents] = useState<AgentItem[]>([])
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [commands, setCommands] = useState<Command[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)

  const loadList = async () => {
    try {
      const res = await fetch("/api/agent-mgmt")
      if (res.ok) {
        const data = await res.json()
        setAgents(data.agents || [])
      }
    } catch {}
  }

  const loadCommands = async (name: string) => {
    try {
      setError(null)
      setSavedOk(false)
      const res = await fetch(`/api/agent-mgmt/${encodeURIComponent(name)}`)
      if (res.ok) {
        const data = await res.json()
        const cmds: Command[] = Array.isArray(data.commands) ? data.commands : []
        setCommands(cmds as any)
      } else {
        setCommands([])
      }
    } catch (e) {
      setError("Failed to load commands")
    }
  }

  const saveCommands = async () => {
    if (!selected) return
    setSaving(true)
    setError(null)
    setSavedOk(false)
    try {
      // Map UI opsec toggle to safe/unsafe strings already stored in commands
      const payload = { commands: commands.map(c => ({ ...c, parser: "generic" })) }
      const res = await fetch(`/api/agent-mgmt/${encodeURIComponent(selected)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("Save failed")
      setSavedOk(true)
      loadList()
    } catch (e) {
      setError("Failed to save commands")
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => { loadList() }, [])
  useEffect(() => { if (selected) loadCommands(selected) }, [selected])

  const visible = agents.filter(a => a.name.toLowerCase().includes(filter.toLowerCase()))

  const selectedInfo = useMemo(() => {
    const item = agents.find(a => a.name === selected)
    return {
      name: selected || "",
      commandsFile: item?.commandsFile || "",
      exists: !!item?.exists,
      count: commands.length,
    }
  }, [agents, selected, commands])

  const addCommand = () => {
    setCommands(prev => ([
      ...prev,
      {
        id: "new_command",
        name: "New Command",
        synopsis: "",
        min_integrity: "low",
        opsec: "safe",
        parameters: [],
        preview: "",
        parser: "generic",
        help: "",
      },
    ]))
  }

  const removeCommand = (idx: number) => {
    setCommands(prev => prev.filter((_, i) => i !== idx))
  }

  const updateCommand = (idx: number, patch: Partial<Command>) => {
    setCommands(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
  }

  const addParam = (idx: number) => {
    setCommands(prev => prev.map((c, i) => i === idx ? {
      ...c,
      parameters: [...(c.parameters || []), { name: "param", type: "string", default: "", required: false, description: "" }],
    } : c))
  }

  const updateParam = (cmdIdx: number, pIdx: number, patch: Partial<Param>) => {
    setCommands(prev => prev.map((c, i) => {
      if (i !== cmdIdx) return c
      const params = [...(c.parameters || [])]
      params[pIdx] = { ...params[pIdx], ...patch }
      // adjust default on type change
      if (patch.hasOwnProperty('type')) {
        const t = (patch as any).type
        if (t === 'boolean') params[pIdx].default = false
        if (t === 'string' && typeof params[pIdx].default !== 'string') params[pIdx].default = ""
      }
      return { ...c, parameters: params }
    }))
  }

  const removeParam = (cmdIdx: number, pIdx: number) => {
    setCommands(prev => prev.map((c, i) => i !== cmdIdx ? c : { ...c, parameters: c.parameters.filter((_, j) => j !== pIdx) }))
  }

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/* Left: Agent list + info */}
      <Card className="w-64 flex-shrink-0 h-full flex flex-col">
        <CardContent className="p-3 flex-1 flex flex-col min-h-0">
          <div className="mb-2">
            <Input placeholder="Filter agents..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {visible.map((a) => (
              <div
                key={a.name}
                className={`px-2 py-1 rounded cursor-pointer text-sm flex items-center justify-between ${selected === a.name ? "bg-accent" : "hover:bg-accent/50"}`}
                onClick={() => setSelected(a.name)}
                title={a.commandsFile}
              >
                <span className="truncate">{a.name}</span>
                <Badge variant={a.exists ? "outline" : "destructive"} className="text-[10px] px-1 py-0">{a.exists ? "commands" : "missing"}</Badge>
              </div>
            ))}
            {visible.length === 0 && (
              <div className="text-xs text-muted-foreground px-2">No agents found in /Agents</div>
            )}
          </div>
          {selected && (
            <div className="mt-3 text-xs space-y-1">
              <div className="font-medium">Agent Info</div>
              <div><span className="text-muted-foreground">Name:</span> {selectedInfo.name}</div>
              <div className="truncate" title={selectedInfo.commandsFile}><span className="text-muted-foreground">Commands file:</span> {selectedInfo.commandsFile}</div>
              <div><span className="text-muted-foreground">Commands:</span> {selectedInfo.count}</div>
              <div><span className="text-muted-foreground">Parser:</span> generic</div>
              <div className="text-muted-foreground">Use the right pane to edit commands.</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Right: Commands editor */}
      <Card className="flex-1 h-full flex flex-col">
        <CardContent className="p-3 flex-1 flex flex-col min-h-0">
          {!selected ? (
            <div className="text-sm text-muted-foreground h-full flex items-center justify-center">
              Select an agent to manage its commands
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Commands for {selected}</div>
                <div className="flex items-center gap-2">
                  {error && <span className="text-destructive text-xs">{error}</span>}
                  {savedOk && <span className="text-green-600 text-xs">Saved</span>}
                  <Button size="sm" variant="outline" onClick={addCommand}>Add Command</Button>
                  <Button size="sm" onClick={saveCommands} disabled={saving}>Save</Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2">
                {commands.map((cmd, idx) => (
                  <div key={idx} className="border border-border rounded-md p-3 bg-card/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">Command</Badge>
                        <Input value={cmd.id} onChange={(e) => updateCommand(idx, { id: e.target.value })} className="h-7 w-40" placeholder="id" />
                        <Input value={cmd.name} onChange={(e) => updateCommand(idx, { name: e.target.value })} className="h-7 w-48" placeholder="name" />
                        <Input value={cmd.synopsis} onChange={(e) => updateCommand(idx, { synopsis: e.target.value })} className="h-7 flex-1" placeholder="synopsis" />
                      </div>
                      <Button size="sm" variant="destructive" onClick={() => removeCommand(idx)}>Remove</Button>
                    </div>

                    <div className="flex items-center gap-4 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Min Integrity</span>
                        <Select value={cmd.min_integrity} onValueChange={(v) => updateCommand(idx, { min_integrity: v as any })}>
                          <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">low</SelectItem>
                            <SelectItem value="medium">medium</SelectItem>
                            <SelectItem value="high">high</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Opsec</span>
                        <Switch checked={cmd.opsec === 'safe'} onCheckedChange={(val) => updateCommand(idx, { opsec: val ? 'safe' : 'unsafe' })} />
                        <span className="text-xs">{cmd.opsec === 'safe' ? 'safe' : 'unsafe'}</span>
                      </div>
                    </div>

                    <div className="mb-2">
                      <div className="text-xs font-medium mb-1">Parameters</div>
                      {(cmd.parameters || []).map((p, pIdx) => (
                        <div key={pIdx} className="grid grid-cols-12 gap-2 items-center mb-1">
                          <Input value={p.name} onChange={(e) => updateParam(idx, pIdx, { name: e.target.value })} className="h-7 col-span-2" placeholder="name" />
                          <Select value={p.type} onValueChange={(v) => updateParam(idx, pIdx, { type: v as any })}>
                            <SelectTrigger className="h-7 col-span-2"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="string">string</SelectItem>
                              <SelectItem value="boolean">boolean</SelectItem>
                            </SelectContent>
                          </Select>
                          {p.type === 'boolean' ? (
                            <div className="col-span-2 flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">default</span>
                              <Switch checked={!!p.default} onCheckedChange={(v) => updateParam(idx, pIdx, { default: v })} />
                            </div>
                          ) : (
                            <Input value={String(p.default ?? '')} onChange={(e) => updateParam(idx, pIdx, { default: e.target.value })} className="h-7 col-span-2" placeholder="default" />
                          )}
                          <div className="col-span-2 flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">required</span>
                            <Switch checked={!!p.required} onCheckedChange={(v) => updateParam(idx, pIdx, { required: v })} />
                          </div>
                          <Input value={p.description} onChange={(e) => updateParam(idx, pIdx, { description: e.target.value })} className="h-7 col-span-3" placeholder="description" />
                          <Button size="sm" variant="destructive" className="h-7 px-2 col-span-1" onClick={() => removeParam(idx, pIdx)}>X</Button>
                        </div>
                      ))}
                      <Button size="sm" variant="outline" onClick={() => addParam(idx)}>Add Parameter</Button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 items-center">
                      <Input value={cmd.preview} onChange={(e) => updateCommand(idx, { preview: e.target.value })} className="h-7 col-span-1" placeholder="preview" />
                      <Input value={cmd.parser || 'generic'} onChange={(e) => updateCommand(idx, { parser: e.target.value })} className="h-7 col-span-1" placeholder="parser (generic)" />
                      <Input value={cmd.help || ''} onChange={(e) => updateCommand(idx, { help: e.target.value })} className="h-7 col-span-1" placeholder="description" />
                    </div>
                  </div>
                ))}
                {commands.length === 0 && (
                  <div className="text-xs text-muted-foreground">No commands. Click "Add Command" to begin.</div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
