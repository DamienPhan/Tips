import { useState } from 'react'
import { parseShifts, fmtMinutes } from '../lib/parseShift'
import { useMissions } from '../store/missions'

const field = 'w-full bg-surface rounded-xl px-3.5 py-3 text-base placeholder:text-muted/50 outline-none focus:ring-2 focus:ring-amber/40'

export default function Shifts({ onClose }) {
  const shifts = useMissions(s => s.shifts)
  const addShifts = useMissions(s => s.addShifts)
  const removeShift = useMissions(s => s.removeShift)
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState(null)

  const analyze = () => {
    const r = parseShifts(raw)
    setParsed(r)
  }
  const confirm = async () => {
    await addShifts(parsed)
    setRaw(''); setParsed(null)
  }

  return (
    <div className="fixed inset-0 z-30 bg-night overflow-y-auto mx-auto max-w-[480px]">
      <div className="sticky top-0 bg-night px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between border-b border-white/[0.06]">
        <button onClick={onClose} className="text-muted text-sm">Fermer</button>
        <h2 className="font-medium">Horaires</h2>
        {parsed && parsed.length > 0
          ? <button onClick={confirm} className="text-amber font-medium text-sm">Ajouter {parsed.length}</button>
          : <button onClick={analyze} className="text-amber font-medium text-sm">Analyser</button>}
      </div>

      <div className="p-5 space-y-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div>
          <textarea
            value={raw} onChange={e => { setRaw(e.target.value); setParsed(null) }} rows={4}
            placeholder={'21/06 : 6h45 - 18h45\n22/06 : 7h - 15h30'}
            className={`${field} resize-none font-mono text-sm`}
          />
          <p className="text-muted/60 text-xs mt-1.5">Format : JJ/MM : HHhMM - HHhMM. Une ligne par jour.</p>
        </div>

        {parsed && parsed.length > 0 && (
          <div className="space-y-2">
            {parsed.map((s, i) => (
              <div key={i} className="bg-surface rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm">{s.shift_date}</span>
                <span className="text-muted text-sm">{fmtMinutes(s.start_min)} – {fmtMinutes(s.end_min)}</span>
                <span className="tnum font-display text-amber">
                  {s.hours}h{s.overtime_hours > 0 && <span className="text-error text-sm"> +{s.overtime_hours}</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {parsed && parsed.length === 0 && (
          <p className="text-muted text-sm">Aucun horaire reconnu. Vérifie le format.</p>
        )}

        {shifts.length > 0 && (
          <div className="pt-2">
            <p className="text-muted text-xs uppercase tracking-wider mb-2">Enregistrés</p>
            <div className="space-y-2">
              {shifts.map(s => (
                <div key={s.id} className="bg-surface rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <span className="text-sm">{s.shift_date}</span>
                  <span className="text-muted text-sm flex-1 text-center">{fmtMinutes(s.start_min)} – {fmtMinutes(s.end_min)}</span>
                  <span className="tnum font-display text-amber">{s.hours}h</span>
                  <button onClick={() => removeShift(s.id)} className="text-error/70 text-xs px-1">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
