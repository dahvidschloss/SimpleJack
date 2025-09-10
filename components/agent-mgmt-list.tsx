"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type AgentItem = { name: string; commandsFile: string; exists: boolean }

export function AgentMgmtList({ selected, onSelect }: { selected: string | null; onSelect: (name: string) => void }) {
  const [agents, setAgents] = useState<AgentItem[]>([])
  const [filter, setFilter] = useState("")
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newLang, setNewLang] = useState("")
  const [error, setError] = useState<string | null>(null)

  const loadList = async () => {
    try {
      const res = await fetch("/api/agent-mgmt")
      if (res.ok) {
        const data = await res.json()
        setAgents(data.agents || [])
      }
    } catch {}
  }

  useEffect(() => { loadList() }, [])

  const visible = agents.filter(a => a.name.toLowerCase().includes(filter.toLowerCase()))
  const selectedInfo = useMemo(() => agents.find(a => a.name === selected) || null, [agents, selected])

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="p-3 flex-1 flex flex-col min-h-0">
        <div className="mb-2">
          <Input placeholder="Filter agents..." value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="mb-2 flex items-center gap-2">
          {!creating ? (
            <Button size="sm" onClick={() => { setCreating(true); setError(null) }}>Add Agent</Button>
          ) : (
            <>
              <Input placeholder="name" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-7 w-32" />
              <Input placeholder="language" value={newLang} onChange={(e) => setNewLang(e.target.value)} className="h-7 w-32" />
              <Button size="sm" variant="outline" onClick={async () => {
                try {
                  setError(null)
                  const res = await fetch('/api/agent-mgmt/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim(), language: newLang.trim(), capes: [] }) })
                  if (!res.ok) throw new Error('create failed')
                  setCreating(false); setNewName(""); setNewLang("")
                  await loadList(); onSelect(newName.trim())
                } catch { setError('Failed to create agent') }
              }}>Create</Button>
              <Button size="sm" variant="destructive" onClick={() => { setCreating(false); setNewName(""); setNewLang("") }}>Cancel</Button>
            </>
          )}
          {selected && (
            <Button size="sm" variant="destructive" onClick={async () => {
              try { await fetch(`/api/agent-mgmt/agents/${encodeURIComponent(selected)}`, { method: 'DELETE' }); await loadList(); onSelect("") } catch {}
            }}>Delete Selected</Button>
          )}
          {error && <span className="text-xs text-destructive ml-auto">{error}</span>}
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {visible.map((a) => (
            <div
              key={a.name}
              className={`px-2 py-1 rounded cursor-pointer text-sm flex items-center justify-between ${selected === a.name ? "bg-accent" : "hover:bg-accent/50"}`}
              onClick={() => onSelect(a.name)}
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

        {selectedInfo && (
          <div className="mt-3 text-xs space-y-1 border-t border-border pt-2">
            <div className="font-medium">Agent Info</div>
            <div><span className="text-muted-foreground">Name:</span> {selectedInfo.name}</div>
            <div className="truncate" title={selectedInfo.commandsFile}><span className="text-muted-foreground">Commands file:</span> {selectedInfo.commandsFile}</div>
            <div><span className="text-muted-foreground">Commands:</span> {/* Count shown in editor */}</div>
            <div><span className="text-muted-foreground">Parser:</span> generic</div>
            <div className="text-muted-foreground">Edit commands on the right panel.</div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
