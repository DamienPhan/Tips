import { todayLocal } from '../lib/date'
import { useState } from 'react'
import { useMissions } from '../store/missions'

const EMPTY = {
  intervention_date: todayLocal(),
  booking_ref: '', client_name: '', greeter: '', booking_mode: 'PRE',
  service_type: 'ARR', flight_code: '', terminal: '', pax_count: 1,
  bags_standard: 0, bags_oversized: 0, animal_crates: 0, tax_refund: false,
  meeting_point: '', drop_point: '', has_issue: false, issue_description: '',
  is_no_show: false, porter_count: 1, satisfaction: 'EXCELLENTE', tip_amount: ''
}

const SAT = [['EXCELLENTE', 'Excellente'], ['BONNE', 'Bonne'], ['MOYENNE', 'Moyenne'], ['MAUVAISE', 'Mauvaise']]
const field = 'w-full bg-surface-2 rounded-xl px-3.5 py-3 text-base placeholder:text-muted/50 outline-none focus:ring-2 focus:ring-amber/40'
const label = 'text-muted text-xs uppercase tracking-wider mb-1.5 block'

export default function MissionForm({ initial, onClose }) {
  const add = useMissions(s => s.add)
  const update = useMissions(s => s.update)
  const remove = useMissions(s => s.remove)
  const [f, setF] = useState(initial ?? EMPTY)
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))

  const submit = async () => {
    const payload = {
      ...f,
      pax_count: Number(f.pax_count) || 1,
      bags_standard: Number(f.bags_standard) || 0,
      bags_oversized: Number(f.bags_oversized) || 0,
      animal_crates: Number(f.animal_crates) || 0,
      porter_count: Number(f.porter_count) || 1,
      tip_amount: Number(String(f.tip_amount).replace(',', '.')) || 0
    }
    try {
      if (initial?.id) await update({ ...initial, ...payload })
      else await add(payload)
      onClose()
    } catch (e) {
      console.error('Enregistrement échoué', e)
      alert(`L'enregistrement a échoué : ${e.message || e}`)
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-night overflow-y-auto mx-auto max-w-[480px]">
      <div className="sticky top-0 bg-night px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between border-b border-white/5">
        <button onClick={onClose} className="text-muted text-sm">Annuler</button>
        <h2 className="font-medium">{initial?.id ? 'Modifier' : 'Nouvelle mission'}</h2>
        <button onClick={submit} className="text-amber font-medium text-sm">Enregistrer</button>
      </div>

      <div className="p-5 space-y-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div>
          <label htmlFor="mf-tip" className={label}>Pourboire</label>
          <div className="relative">
            <input id="mf-tip" inputMode="decimal" type="text" value={f.tip_amount}
              onChange={e => set('tip_amount', e.target.value)} placeholder="0,00"
              className={`${field} tnum font-display text-3xl text-amber pr-10`} />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-amber/60 text-xl">€</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mf-date" className={label}>Date</label>
            <input id="mf-date" type="date" value={f.intervention_date} onChange={e => set('intervention_date', e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="mf-service" className={label}>Type</label>
            <select id="mf-service" value={f.service_type} onChange={e => set('service_type', e.target.value)} className={field}>
              <option value="ARR">Arrivée</option><option value="DEP">Départ</option><option value="TRANSIT">Transit</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="mf-client" className={label}>Client</label>
          <input id="mf-client" type="text" value={f.client_name} onChange={e => set('client_name', e.target.value)} placeholder="Nom du client" className={field} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mf-greeter" className={label}>Greeteur</label>
            <input id="mf-greeter" type="text" value={f.greeter} onChange={e => set('greeter', e.target.value)} placeholder="Nom" className={field} />
          </div>
          <div>
            <label htmlFor="mf-booking-mode" className={label}>Booking</label>
            <select id="mf-booking-mode" value={f.booking_mode} onChange={e => set('booking_mode', e.target.value)} className={field}>
              <option value="PRE">Pré-booking</option><option value="LIVE">Live</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mf-booking-ref" className={label}>Réf. réservation</label>
            <input id="mf-booking-ref" type="text" value={f.booking_ref} onChange={e => set('booking_ref', e.target.value)} placeholder="Booking #" className={field} />
          </div>
          <div>
            <label htmlFor="mf-flight" className={label}>Vol (IATA)</label>
            <input id="mf-flight" type="text" value={f.flight_code} onChange={e => set('flight_code', e.target.value.toUpperCase())} placeholder="EK0077" className={field} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mf-terminal" className={label}>Terminal</label>
            <input id="mf-terminal" inputMode="numeric" type="text" value={f.terminal} onChange={e => set('terminal', e.target.value)} placeholder="2" className={field} />
          </div>
          <div>
            <label htmlFor="mf-pax" className={label}>Passagers</label>
            <input id="mf-pax" inputMode="numeric" type="text" value={f.pax_count} onChange={e => set('pax_count', e.target.value.replace(/\D/g, ''))} className={`${field} tnum`} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[['bags_standard', 'Bagages'], ['bags_oversized', 'Hors format'], ['animal_crates', 'Cages']].map(([k, lbl]) => (
            <div key={k}>
              <label htmlFor={`mf-${k}`} className={label}>{lbl}</label>
              <input id={`mf-${k}`} inputMode="numeric" type="text" value={f[k]} onChange={e => set(k, e.target.value.replace(/\D/g, ''))} className={`${field} tnum`} />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mf-meeting" className={label}>Lieu rencontre</label>
            <input id="mf-meeting" type="text" value={f.meeting_point} onChange={e => set('meeting_point', e.target.value)} placeholder="Tapis bagage" className={field} />
          </div>
          <div>
            <label htmlFor="mf-drop" className={label}>Lieu dépose</label>
            <input id="mf-drop" type="text" value={f.drop_point} onChange={e => set('drop_point', e.target.value)} placeholder="Parking pro" className={field} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => set('tax_refund', !f.tax_refund)} aria-pressed={f.tax_refund}
            className={`py-3 rounded-xl text-sm ${f.tax_refund ? 'bg-amber/15 text-amber' : 'bg-surface-2 text-muted'}`}>
            Détaxe : {f.tax_refund ? 'Oui' : 'Non'}
          </button>
          <div>
            <label htmlFor="mf-porters" className={label}>Porteurs</label>
            <input id="mf-porters" inputMode="numeric" type="text" value={f.porter_count} onChange={e => set('porter_count', e.target.value.replace(/\D/g, ''))} className={`${field} tnum`} />
          </div>
        </div>

        <div>
          <label className={label}>Satisfaction</label>
          <div className="grid grid-cols-2 gap-2">
            {SAT.map(([v, lbl]) => (
              <button key={v} onClick={() => set('satisfaction', v)} aria-pressed={f.satisfaction === v}
                className={`py-2.5 rounded-xl text-sm ${f.satisfaction === v ? 'bg-amber text-night font-medium' : 'bg-surface-2 text-muted'}`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div>
          <button onClick={() => set('is_no_show', !f.is_no_show)} aria-pressed={f.is_no_show}
            className={`w-full py-3 rounded-xl text-sm ${f.is_no_show ? 'bg-error/15 text-error' : 'bg-surface-2 text-muted'}`}>
            {f.is_no_show ? 'NO SHOW — client absent' : 'Client présent'}
          </button>
        </div>

        <div>
          <button onClick={() => set('has_issue', !f.has_issue)} aria-pressed={f.has_issue}
            className={`w-full py-3 rounded-xl text-sm ${f.has_issue ? 'bg-error/15 text-error' : 'bg-surface-2 text-muted'}`}>
            {f.has_issue ? '⚠ Problème signalé' : 'Aucun problème'}
          </button>
          {f.has_issue && (
            <textarea value={f.issue_description} onChange={e => set('issue_description', e.target.value)}
              placeholder="Décrire le problème" rows={2} className={`${field} mt-2 resize-none`} />
          )}
        </div>

        {initial?.id && (
          <button
            onClick={async () => { if (confirm('Supprimer cette mission ?')) { await remove(initial.id); onClose() } }}
            className="w-full py-3 rounded-xl text-sm text-error active:bg-error/10">
            Supprimer la mission
          </button>
        )}
      </div>
    </div>
  )
}
