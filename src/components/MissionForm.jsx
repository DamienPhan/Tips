import { useState } from 'react'
import { useMissions } from '../store/missions'

const EMPTY = {
  intervention_date: new Date().toISOString().slice(0, 10),
  booking_ref: '', client_name: '', service_type: 'ARR',
  flight_code: '', terminal: '', pax_count: 1,
  bags_standard: 0, bags_oversized: 0, animal_crates: 0,
  meeting_point: '', drop_point: '',
  has_issue: false, issue_description: '',
  satisfaction: 5, tip_amount: ''
}

const field = 'w-full bg-surface-2 rounded-xl px-3.5 py-3 text-base placeholder:text-muted/50 outline-none focus:ring-2 focus:ring-amber/40'
const label = 'text-muted text-xs uppercase tracking-wider mb-1.5 block'

export default function MissionForm({ initial, onClose }) {
  const add = useMissions(s => s.add)
  const update = useMissions(s => s.update)
  const [f, setF] = useState(initial ?? EMPTY)
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))

  const submit = async () => {
    const payload = {
      ...f,
      pax_count: Number(f.pax_count) || 1,
      bags_standard: Number(f.bags_standard) || 0,
      bags_oversized: Number(f.bags_oversized) || 0,
      animal_crates: Number(f.animal_crates) || 0,
      satisfaction: Number(f.satisfaction) || null,
      tip_amount: Number(String(f.tip_amount).replace(',', '.')) || 0
    }
    if (initial?.id) await update({ ...initial, ...payload })
    else await add(payload)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-30 bg-night overflow-y-auto">
      <div className="sticky top-0 bg-night px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between border-b border-white/5">
        <button onClick={onClose} className="text-muted text-sm">Annuler</button>
        <h2 className="font-medium">{initial?.id ? 'Modifier' : 'Nouvelle mission'}</h2>
        <button onClick={submit} className="text-amber font-medium text-sm">Enregistrer</button>
      </div>

      <div className="p-5 space-y-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div>
          <label className={label}>Pourboire</label>
          <div className="relative">
            <input
              inputMode="decimal" type="text" value={f.tip_amount}
              onChange={e => set('tip_amount', e.target.value)}
              placeholder="0,00"
              className={`${field} tnum font-display text-3xl text-amber pr-10`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-amber/60 text-xl">€</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Date</label>
            <input type="date" value={f.intervention_date}
              onChange={e => set('intervention_date', e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Type</label>
            <select value={f.service_type} onChange={e => set('service_type', e.target.value)} className={field}>
              <option value="ARR">Arrivée</option>
              <option value="DEP">Départ</option>
              <option value="TRANSIT">Transit</option>
            </select>
          </div>
        </div>

        <div>
          <label className={label}>Client</label>
          <input type="text" value={f.client_name} onChange={e => set('client_name', e.target.value)}
            placeholder="Nom du client" className={field} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Réf. réservation</label>
            <input type="text" value={f.booking_ref} onChange={e => set('booking_ref', e.target.value)}
              placeholder="Booking #" className={field} />
          </div>
          <div>
            <label className={label}>Vol (IATA)</label>
            <input type="text" value={f.flight_code} onChange={e => set('flight_code', e.target.value.toUpperCase())}
              placeholder="AF1234" className={field} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Terminal</label>
            <input type="text" value={f.terminal} onChange={e => set('terminal', e.target.value)}
              placeholder="T1 / T2" className={field} />
          </div>
          <div>
            <label className={label}>Passagers</label>
            <input inputMode="numeric" type="text" value={f.pax_count}
              onChange={e => set('pax_count', e.target.value.replace(/\D/g, ''))} className={`${field} tnum`} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[['bags_standard', 'Bagages'], ['bags_oversized', 'Hors format'], ['animal_crates', 'Cages']].map(([k, lbl]) => (
            <div key={k}>
              <label className={label}>{lbl}</label>
              <input inputMode="numeric" type="text" value={f[k]}
                onChange={e => set(k, e.target.value.replace(/\D/g, ''))} className={`${field} tnum`} />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Lieu rencontre</label>
            <input type="text" value={f.meeting_point} onChange={e => set('meeting_point', e.target.value)}
              placeholder="Porte / hall" className={field} />
          </div>
          <div>
            <label className={label}>Lieu dépose</label>
            <input type="text" value={f.drop_point} onChange={e => set('drop_point', e.target.value)}
              placeholder="Parking / gate" className={field} />
          </div>
        </div>

        <div>
          <label className={label}>Satisfaction</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => set('satisfaction', n)}
                className={`flex-1 py-2.5 rounded-xl text-sm ${Number(f.satisfaction) === n ? 'bg-amber text-night font-medium' : 'bg-surface-2 text-muted'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <button onClick={() => set('has_issue', !f.has_issue)}
            className={`w-full py-3 rounded-xl text-sm ${f.has_issue ? 'bg-error/15 text-error' : 'bg-surface-2 text-muted'}`}>
            {f.has_issue ? '⚠ Problème signalé' : 'Aucun problème'}
          </button>
          {f.has_issue && (
            <textarea value={f.issue_description} onChange={e => set('issue_description', e.target.value)}
              placeholder="Décrire le problème" rows={2} className={`${field} mt-2 resize-none`} />
          )}
        </div>
      </div>
    </div>
  )
}
