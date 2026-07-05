import { useState } from 'react'
import { parseImport } from '../lib/parseImport'
import { recompute, fmtMinutes } from '../lib/parseShift'
import { useMissions } from '../store/missions'

const SERVICE_LABEL = { ARR: 'Arrivée', DEP: 'Départ', TRANSIT: 'Transit' }
const field = 'w-full bg-surface rounded-xl px-3.5 py-3 text-base placeholder:text-muted/50 outline-none focus:ring-2 focus:ring-amber/40'

export default function ImportModal({ onClose, onManual }) {
  const addMany = useMissions(s => s.addMany)
  const addShifts = useMissions(s => s.addShifts)
  const [raw, setRaw] = useState('')
  const [result, setResult] = useState(null)
  const [offFlags, setOffFlags] = useState({})
  const [saving, setSaving] = useState(false)

  const analyze = () => {
    const r = parseImport(raw)
    setResult(r)
    if (r.type === 'shifts') {
      const init = {}
      r.items.forEach((s, i) => { init[i] = s.is_day_off })
      setOffFlags(init)
    }
  }

  const confirm = async () => {
    setSaving(true)
    try {
      if (result.type === 'missions') {
        await addMany(result.items)
      } else if (result.type === 'shifts') {
        const items = result.items.map((s, i) => {
          const isOff = !!offFlags[i]
          return { ...s, ...recompute(s, isOff) }
        })
        await addShifts(items)
      }
      onClose()
    } catch (e) {
      console.error('Import échoué', e)
      alert(`L'enregistrement a échoué : ${e.message || e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-night overflow-y-auto mx-auto max-w-[480px]">
      <div className="sticky top-0 bg-night px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between border-b border-white/[0.06]">
        <button onClick={onClose} className="text-muted text-sm">Fermer</button>
        <h2 className="font-medium">Importer</h2>
        {result && result.items.length > 0
          ? <button onClick={confirm} disabled={saving} className="text-amber font-medium text-sm disabled:opacity-50">{saving ? '…' : `Sauvegarder ${result.items.length}`}</button>
          : <button onClick={analyze} className="text-amber font-medium text-sm">Analyser</button>}
      </div>

      <div className="p-5 space-y-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {!result && (
          <>
            <p className="text-muted text-sm">
              Colle un bloc de missions (rapports WhatsApp) ou un relevé d'heures. Le type est détecté automatiquement.
            </p>
            <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={14}
              placeholder={'Missions :  Booking # : ...\n\nou Horaires :  21/06 : 6h45 - 18h45'}
              className={`${field} resize-none font-mono text-sm`} />
            <button onClick={onManual} className="w-full bg-surface text-muted rounded-xl py-3 text-sm active:bg-surface-2">
              Saisie manuelle
            </button>
          </>
        )}

        {result && result.type === 'unknown' && (
          <p className="text-muted text-sm text-center py-8">Format non reconnu. Vérifie le texte collé.</p>
        )}

        {result && result.type === 'missions' && (
          <>
            <p className="text-muted text-sm">{result.items.length} mission{result.items.length > 1 ? 's' : ''} détectée{result.items.length > 1 ? 's' : ''}.</p>
            <div className="space-y-2">
              {result.items.map((m, i) => (
                <div key={i} className="bg-surface rounded-xl px-4 py-3 flex justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-medium truncate block">{m.client_name || 'Client inconnu'}</span>
                    <p className="text-muted text-xs mt-0.5 truncate">{m.intervention_date} · {SERVICE_LABEL[m.service_type]}{m.flight_code ? ` · ${m.flight_code}` : ''} · {m.pax_count} pax</p>
                  </div>
                  <span className="text-muted/60 text-xs shrink-0">#{m.booking_ref || '—'}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {result && result.type === 'shifts' && (
          <>
            <p className="text-muted text-sm">{result.items.length} shift{result.items.length > 1 ? 's' : ''} détecté{result.items.length > 1 ? 's' : ''}. Coche les jours OFF travaillés.</p>
            <div className="space-y-2">
              {result.items.map((s, i) => (
                <button key={i} onClick={() => setOffFlags({ ...offFlags, [i]: !offFlags[i] })}
                  className="w-full bg-surface rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-left">
                  <div>
                    <span className="text-sm">{s.shift_date}</span>
                    <p className="text-muted text-xs mt-0.5">{fmtMinutes(s.start_min)} – {fmtMinutes(s.end_min)} · {s.hours}h</p>
                  </div>
                  <span className={`text-xs rounded-full px-3 py-1 ${offFlags[i] ? 'bg-error/15 text-error' : 'bg-surface-2 text-muted'}`}>
                    {offFlags[i] ? 'OFF' : 'Normal'}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {result && result.items.length > 0 && (
          <button onClick={() => setResult(null)} className="w-full bg-surface text-muted rounded-xl py-3 text-sm active:bg-surface-2">
            Modifier le texte
          </button>
        )}
      </div>
    </div>
  )
}
