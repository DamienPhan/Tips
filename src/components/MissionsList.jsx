import { useState, useMemo } from 'react'
import { useMissions } from '../store/missions'
import { todayLocal, parseLocal } from '../lib/date'
import { eur } from '../lib/format'
import { compareMissionsForDisplay } from '../lib/sync'
import MissionCard from './MissionCard'

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

  // Groupe par date, trié décroissant. Chaque groupe est aussi re-trié (même comparateur que
  // loadAll() dans sync.js, voir son commentaire) plutôt que de garder l'ordre d'apparition dans
  // `filtered` tel quel — celui-ci reflète fidèlement l'ordre du tableau `missions` du store juste
  // après un ajout (add()/addMany() préfixent la nouvelle mission en tête), mais peut diverger après
  // un rechargement (loadAll()) si son propre tri venait à changer ; re-trier ici garantit un ordre
  // d'affichage stable et correct indépendamment de l'ordre exact du tableau source. Les lignes sans
  // intervention_date (ne devrait plus arriver, loadAll() les filtre désormais, mais gardé en
  // défense) sont ignorées plutôt que de faire planter parseLocal() plus bas sur une clé `undefined`.
  const groups = useMemo(() => {
    const map = new Map()
    for (const m of filtered) {
      if (!m.intervention_date) continue
      if (!map.has(m.intervention_date)) map.set(m.intervention_date, [])
      map.get(m.intervention_date).push(m)
    }
    for (const items of map.values()) {
      items.sort(compareMissionsForDisplay)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  return (
    <div className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-36">
      <div className="relative mb-4">
        {/* Sans ça, Safari associe ce champ texte au trousseau/Face ID de l'origine (qui a un vrai
            formulaire de connexion ailleurs dans l'app, voir Auth.jsx) et propose une suggestion
            d'identifiants au lieu de simplement permettre de taper une recherche. `autoComplete="off"`
            seul ne suffit pas : iOS Safari ignore volontairement cette valeur précise pour les champs
            qu'il soupçonne d'être liés à une connexion (comportement documenté, pas un bug de l'app) —
            une valeur non standard ("search-missions", que le navigateur ne reconnaît pas comme mot-clé
            d'autofill) le contourne plus fiablement. `name`/`id` explicites et neutres évitent aussi
            que Safari ne retombe sur une heuristique de position/contexte en l'absence de ces attributs. */}
        <input
          type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher client, vol, greeteur…"
          name="mission-search" id="mission-search"
          autoComplete="search-missions" autoCorrect="off" autoCapitalize="off" spellCheck="false"
          data-lpignore="true" data-1p-ignore="true"
          className="w-full bg-surface rounded-xl pl-10 pr-3 py-3 text-base placeholder:text-muted/50 outline-none focus:ring-2 focus:ring-amber/40 appearance-none [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
        />
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">⌕</span>
        {query && (
          <button onClick={() => setQuery('')} aria-label="Effacer la recherche" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm">✕</button>
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
