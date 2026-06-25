import { useState } from 'react'
import { useMissions } from '../store/missions'
import { todayLocal, parseLocal } from '../lib/date'
import MissionCard from './MissionCard'

export default function MissionsList({ onEdit }) {
  const missions = useMissions(s => s.missions)
  const [filterDate, setFilterDate] = useState('')

  const today = todayLocal()
  const todayMissions = missions.filter(m => m.intervention_date === today)
  const past = missions.filter(m => m.intervention_date !== today)
  const shown = filterDate ? past.filter(m => m.intervention_date === filterDate) : past

  return (
    <div className="px-5 pt-3 pb-32">
      <section className="mb-6">
        <h2 className="font-medium mb-3">Aujourd'hui · {parseLocal(today).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</h2>
        {todayMissions.length === 0
          ? <p className="text-muted text-sm">Aucune mission aujourd'hui.</p>
          : todayMissions.map(m => <MissionCard key={m.id} mission={m} onEdit={onEdit} />)}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Historique</h2>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className="bg-surface rounded-lg px-3 py-1.5 text-sm text-muted outline-none focus:ring-2 focus:ring-amber/40" />
        </div>
        {shown.length === 0
          ? <p className="text-muted text-sm">{filterDate ? 'Aucune mission à cette date.' : 'Aucune mission passée.'}</p>
          : shown.map(m => <MissionCard key={m.id} mission={m} onEdit={onEdit} />)}
      </section>
    </div>
  )
}
