import { useState, useMemo } from 'react'
import { useMissions } from '../store/missions'
import { todayLocal, parseLocal } from '../lib/date'
import MissionCard from './MissionCard'

function eur(n) { return Number(n || 0).toFixed(2).replace('.', ',') }

export default function MissionsList({ onEdit }) {
  const missions = useMissions(s => s.missions)
  const [query, setQuery] = useState('')
  const today = todayLocal()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return missions
    return missions.filter(m =>
      (m.client_name || '').toLowerCase().includes(q) ||
      (m.flight_code || '').toLowerCase().includes(q) ||
      (m.greeter || '').toLowerCase().includes(q)
    )
  }, [missions, query])

  // Groupe par date, trié décroissant
  const groups = useMemo(() => {
    const map = new Map()
    for (const m of filtered) {
      if (!map.has(m.intervention_date)) map.set(m.intervention_date, [])
      map.get(m.intervention_date).push(m)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  return (
    <div className="px-4 pt-3 pb-32">
      <div className="relative mb-4">
        <input
          type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher client, vol, greeteur…"
          className="w-full bg-surface rounded-xl pl-10 pr-3 py-3 text-base placeholder:text-muted/50 outline-none focus:ring-2 focus:ring-amber/40"
        />
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">⌕</span>
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm">✕</button>
        )}
      </div>

      {groups.length === 0 && (
        <p className="text-muted text-sm text-center py-12">
          {query ? 'Aucun résultat.' : 'Aucune mission. Importe tes rapports ou ajoute-en une.'}
        </p>
      )}

      {groups.map(([date, items]) => {
        const dayTotal = items.reduce((s, m) => s + Number(m.tip_amount || 0), 0)
        const isToday = date === today
        const d = parseLocal(date)
        return (
          <section key={date} className="mb-5">
            <div className="flex items-baseline justify-between mb-2 px-1">
              <h2 className="text-sm font-medium">
                {isToday ? "Aujourd'hui" : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                <span className="text-muted font-normal"> · {items.length}</span>
              </h2>
              {dayTotal > 0 && (
                <span className="tnum font-display text-amber font-semibold">{eur(dayTotal)} <span className="text-amber/50 text-sm">€</span></span>
              )}
            </div>
            {items.map(m => <MissionCard key={m.id} mission={m} onEdit={onEdit} />)}
          </section>
        )
      })}
    </div>
  )
}
