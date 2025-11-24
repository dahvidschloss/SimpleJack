"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Param = {
  name: string
  flag?: string
  input_type?: "string" | "boolean" | "integer" | "path" | "enum" | "json"
  choices?: string[]
  type?: "string" | "boolean" // legacy fallback
  default?: any
  required?: boolean
  description?: string
}

type Command = {
  id: string
  name: string
  synopsis: string
  min_integrity: "low" | "medium" | "high"
  opsec: string // safe/unsafe
  parameters: Param[]
  preview: string
  parser: string
  help?: string
}

export function AgentMgmtEditor({ selected }: { selected: string | null }) {
  const [commands, setCommands] = useState<Command[]>([])
  const [error, setError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)
  const [saving, setSaving] = useState(false)
  const [agentLanguage, setAgentLanguage] = useState("")
  const [capes, setCapes] = useState<Array<{ name: string; file?: string; default?: boolean; description?: string }>>([])
  const [files, setFiles] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState("info")

  const loadCommands = async (name: string) => {
    try {
      setError(null)
      setSavedOk(false)
      const res = await fetch(`/api/agent-mgmt/${encodeURIComponent(name)}`)
      if (res.ok) {
        const data = await res.json()
        const cmds: Command[] = Array.isArray(data.commands) ? data.commands : []
        setCommands(cmds)
      } else {
        setCommands([])
      }
    } catch {
      setError("Failed to load commands")
    }
  }
  const loadAgentInfo = async (name: string) => {
    try {
      const res = await fetch(`/api/agent-mgmt/agents/${encodeURIComponent(name)}`)
      if (res.ok) {
        const info = await res.json()
        setAgentLanguage(String(info.language || ""))
        setCapes(Array.isArray(info.capes) ? info.capes : [])
      } else {
        setAgentLanguage("")
        setCapes([])
      }
    } catch {}
  }
  const loadFiles = async (name: string) => {
    try {
      const res = await fetch(`/api/agent-mgmt/${encodeURIComponent(name)}/files`)
      if (res.ok) {
        const data = await res.json()
        setFiles(Array.isArray(data.files) ? data.files : [])
      } else {
        setFiles([])
      }
    } catch { setFiles([]) }
  }

  useEffect(() => { if (selected) { loadCommands(selected); loadAgentInfo(selected); loadFiles(selected) } }, [selected])

  const addCommand = () => {
    setCommands(prev => ([
      ...prev,
      { id: "", name: "new_command", synopsis: "", min_integrity: "low", opsec: "safe", parameters: [], preview: "", parser: "generic", help: "" },
    ]))
  }
  const removeCommand = (idx: number) => setCommands(prev => prev.filter((_, i) => i !== idx))
  const updateCommand = (idx: number, patch: Partial<Command>) => setCommands(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
  const addParam = (idx: number) => setCommands(prev => prev.map((c, i) => i === idx ? { ...c, parameters: [...(c.parameters || []), { name: "param", flag: "", input_type: "string", default: "", required: false, description: "" }] } : c))
  const updateParam = (cmdIdx: number, pIdx: number, patch: Partial<Param>) => setCommands(prev => prev.map((c, i) => {
    if (i !== cmdIdx) return c
    const params = [...(c.parameters || [])]
    params[pIdx] = { ...params[pIdx], ...patch }
    if (patch.name !== undefined) {
      params[pIdx].label = patch.name // keep label in sync with name for display
    }
    const t = (patch as any).input_type ?? (patch as any).type
    if (t) {
      if (t === 'boolean') params[pIdx].default = false
      if (t === 'string' && typeof params[pIdx].default !== 'string') params[pIdx].default = ""
      if (t === 'integer') params[pIdx].default = Number.isFinite(params[pIdx].default) ? params[pIdx].default : 0
    }
    return { ...c, parameters: params }
  }))
  const removeParam = (cmdIdx: number, pIdx: number) => setCommands(prev => prev.map((c, i) => i !== cmdIdx ? c : { ...c, parameters: c.parameters.filter((_, j) => j !== pIdx) }))

  const save = async () => {
    if (!selected) return
    setSaving(true)
    setError(null)
    setSavedOk(false)
    try {
      // Preserve the parser field as edited instead of forcing 'generic'
      const payload = {
        commands: commands.map((c) => {
          const id = c.id && c.id.trim().length > 0 ? c.id : c.name
          return { ...c, id }
        }),
      }
      const res = await fetch(`/api/agent-mgmt/${encodeURIComponent(selected)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error("Save failed (commands)")
      const infoRes = await fetch(`/api/agent-mgmt/agents/${encodeURIComponent(selected)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: agentLanguage, capes }) })
      if (!infoRes.ok) throw new Error("Save failed (agent info)")
      setSavedOk(true)
      try { window.dispatchEvent(new CustomEvent('commands:updated', { detail: { name: selected } })) } catch {}
    } catch {
      setError("Failed to save commands")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="p-3 flex-1 flex flex-col min-h-0">
        {!selected ? (
          <div className="text-sm text-muted-foreground h-full flex items-center justify-center">Select an agent from the left to manage its commands</div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Base Agent: {selected}</div>
              <div className="flex items-center gap-2">
                {error && <span className="text-destructive text-xs">{error}</span>}
                {savedOk && <span className="text-green-600 text-xs">Saved</span>}
                <Button size="sm" onClick={save} disabled={saving}>Save</Button>
              </div>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
              <TabsList className="w-fit">
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="commands">Commands</TabsTrigger>
                <TabsTrigger value="capes">Capabilities</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="flex-1 mt-2">
                <div className="border rounded-md border-border p-3 bg-card/30">
                  <div className="text-xs font-medium mb-2">Agent Info</div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs text-muted-foreground w-16">Name:</span>
                    <Input value={selected} readOnly className="h-7 w-60 border border-border bg-muted/30" />
                    <span className="text-xs text-muted-foreground w-20">Language:</span>
                    <Input value={agentLanguage} onChange={(e) => setAgentLanguage(e.target.value)} className="h-7 w-60 border border-border" placeholder="e.g. powershell, python, go" />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="commands" className="flex-1 mt-2 min-h-0 flex flex-col">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">Assign commands to capabilities to control availability.</div>
                  <Button size="sm" variant="outline" onClick={addCommand}>Add Command</Button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                {commands.map((cmd, idx) => (
                  <div key={idx} className="border border-border rounded-md p-3 bg-card/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-[10px]">Command</Badge>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground w-12">ID:</span>
                          <Input value={cmd.id || cmd.name} readOnly className="h-7 w-36 border border-muted text-muted-foreground" placeholder="auto (uses name)" />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground w-14">Name:</span>
                          <Input value={cmd.name} onChange={(e) => {
                            const val = e.target.value
                            updateCommand(idx, { name: val, id: cmd.id ? cmd.id : val })
                          }} className="h-7 w-44 border border-primary" placeholder="command word" />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground w-20">Capability:</span>
                          <select value={(cmd as any).cape || ''} onChange={(e) => updateCommand(idx, { ...(cmd as any), cape: e.target.value } as any)} className="h-7 w-44 border border-primary bg-background text-foreground text-sm rounded-md px-2">
                            <option value="">(none)</option>
                            {capes.map((c, i) => (<option key={i} value={c.name}>{c.name}</option>))}
                          </select>
                        </div>
                      </div>
                      <Button size="sm" variant="destructive" onClick={() => removeCommand(idx)}>Remove</Button>
                    </div>

                  {/* Synopsis on its own line */}
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Synopsis:</span>
                    <Input value={cmd.synopsis} onChange={(e) => updateCommand(idx, { synopsis: e.target.value })} className="h-7 flex-1 border border-primary" placeholder="synopsis" />
                  </div>

                  <div className="flex items-center gap-6 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Min Integrity:</span>
                      <Select value={cmd.min_integrity} onValueChange={(v) => updateCommand(idx, { min_integrity: v as any })}>
                        <SelectTrigger className="h-7 w-28 border border-primary"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">low</SelectItem>
                          <SelectItem value="medium">medium</SelectItem>
                          <SelectItem value="high">high</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Opsec:</span>
                      <Switch className="border border-border rounded-full" checked={cmd.opsec === 'safe'} onCheckedChange={(val) => updateCommand(idx, { opsec: val ? 'safe' : 'unsafe' })} />
                      <span className="text-xs">{cmd.opsec === 'safe' ? 'safe' : 'unsafe'}</span>
                    </div>
                  </div>

                  <div className="mb-3 border rounded-md border-[#f42c44] p-2">
                    <div className="text-xs font-medium mb-2">Parameters</div>
                    {(cmd.parameters || []).map((p, pIdx) => {
                      const inputType = p.input_type || p.type || "string"
                      const isBoolean = inputType === "boolean"
                      const isEnum = inputType === "enum"
                      const isInteger = inputType === "integer"
                      const choicesText = (p.choices || []).join(",")
                      return (
                      <div key={pIdx} className="mb-2 pb-2 border-b border-border last:border-b-0 last:pb-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">Parameter:</span>
                            <Input value={p.name} onChange={(e) => updateParam(idx, pIdx, { name: e.target.value })} className="h-7 w-40 border border-primary" placeholder="e.g. command, file" />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">Flag:</span>
                            <Input value={p.flag || ""} onChange={(e) => updateParam(idx, pIdx, { flag: e.target.value })} className="h-7 w-28 border border-primary" placeholder="-i or --input" />
                            <span className="text-[10px] text-muted-foreground ml-1">Leave blank for positional value</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">Type:</span>
                            <Select value={inputType} onValueChange={(v) => updateParam(idx, pIdx, { input_type: v as any, type: v as any })}>
                              <SelectTrigger className="h-7 w-28 border border-primary"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="string">string</SelectItem>
                                <SelectItem value="boolean">boolean</SelectItem>
                                <SelectItem value="integer">integer</SelectItem>
                                <SelectItem value="path">path</SelectItem>
                                <SelectItem value="enum">enum</SelectItem>
                                <SelectItem value="json">json</SelectItem>
                              </SelectContent>
                            </Select>
                            <span className="text-[10px] text-muted-foreground ml-1">{isBoolean ? "Flag only (no value)" : "Expects a value"}</span>
                          </div>
                          {isBoolean ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">Default:</span>
                              <Switch className="border border-border rounded-full" checked={!!p.default} onCheckedChange={(v) => updateParam(idx, pIdx, { default: v })} />
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">Default:</span>
                              <Input
                                value={
                                  isInteger
                                    ? String(Number.isFinite(p.default) ? p.default : "")
                                    : isEnum
                                      ? String(p.default ?? "")
                                      : String(p.default ?? "")
                                }
                                onChange={(e) => {
                                  const val = e.target.value
                                  updateParam(idx, pIdx, { default: isInteger ? (val === "" ? "" : Number(val)) : val })
                                }}
                                className="h-7 w-40 border border-primary"
                                placeholder={isInteger ? "0" : "default"}
                              />
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">Req:</span>
                            <Switch className="border border-border rounded-full" checked={!!p.required} onCheckedChange={(v) => updateParam(idx, pIdx, { required: v })} />
                          </div>
                          <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => removeParam(idx, pIdx)}>X</Button>
                        </div>
                        {isEnum && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-20">Choices (comma):</span>
                            <Input value={choicesText} onChange={(e) => updateParam(idx, pIdx, { choices: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className="h-7 flex-1 border border-primary" placeholder="foo,bar,baz" />
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-20">Description:</span>
                          <Input value={p.description} onChange={(e) => updateParam(idx, pIdx, { description: e.target.value })} className="h-7 flex-1 border border-primary" placeholder="description" />
                        </div>
                      </div>
                    )})}
                    <Button size="sm" variant="outline" onClick={() => addParam(idx)}>Add Parameter</Button>
                  </div>

                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs text-muted-foreground w-16">Preview:</span>
                    <Input value={cmd.preview} onChange={(e) => updateCommand(idx, { preview: e.target.value })} className="h-7 flex-1 border border-primary" placeholder="preview" />
                    <span className="text-xs text-muted-foreground w-16">Parser:</span>
                    <Select value={cmd.parser || "generic"} onValueChange={(v) => updateCommand(idx, { parser: v as any })}>
                      <SelectTrigger className="h-7 w-40 border border-primary"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="generic">generic</SelectItem>
                        <SelectItem value="boolean">boolean</SelectItem>
                        <SelectItem value="file">file</SelectItem>
                        <SelectItem value="process">process</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-20">Description:</span>
                    <Input value={cmd.help || ''} onChange={(e) => updateCommand(idx, { help: e.target.value })} className="h-7 flex-1 border border-primary" placeholder="description" />
                  </div>
                </div>
              ))}
              {commands.length === 0 && (
                <div className="text-xs text-muted-foreground">No commands. Click "Add Command" to begin.</div>
              )}
              </div>
              </TabsContent>

              <TabsContent value="capes" className="flex-1 mt-2 min-h-0">
                <div className="border rounded-md border-primary p-3 bg-card/30">
                  <div className="text-xs font-medium mb-1">Capabilities</div>
                  {capes.map((c, i) => (
                    <div key={i} className="mb-2 pb-2 border-b border-border last:border-b-0 last:pb-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Name:</span>
                        <Input value={c.name} onChange={(e) => setCapes(prev => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} className="h-7 w-52 border border-border" placeholder="Capability name" />
                        <span className="text-xs text-muted-foreground">Default:</span>
                        <Switch className="border border-border rounded-full" checked={!!c.default} onCheckedChange={(v) => setCapes(prev => prev.map((x, idx) => idx === i ? { ...x, default: v, file: v ? '' : x.file } : x))} />
                        <span className="text-xs text-muted-foreground">File:</span>
                        <select disabled={!!c.default} value={c.file || ''} onChange={(e) => setCapes(prev => prev.map((x, idx) => idx === i ? { ...x, file: e.target.value } : x))} className="h-7 w-72 border border-border bg-background text-foreground text-sm rounded-md px-2 disabled:opacity-50">
                          <option value="">Select file…</option>
                          {files.map(f => (<option key={f} value={f}>{f}</option>))}
                        </select>
                        <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => setCapes(prev => prev.filter((_, idx) => idx !== i))}>X</Button>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-24">Description:</span>
                        <Input value={c.description || ''} onChange={(e) => setCapes(prev => prev.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} className="h-7 flex-1 border border-border" placeholder="What this capability does" />
                      </div>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setCapes(prev => [...prev, { name: "", file: "", default: false, description: "" }])}>Add Capability</Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
