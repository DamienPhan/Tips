import { useState } from 'react'
import { parseReports } from '../lib/parseReport'
import { useMissions } from '../store/missions'

const SERVICE_LABEL = { ARR: 'Arrivée', DEP: 'Départ', TRANSIT: 'Transit' }
const field = 'w-full bg-surface rounded-xl px-3.5 py-3 text-base placeholder:text-muted/50 outline-none focus:ring-2 focus:ring-amber/40'

export default function ImportReport({ onClose }) {
  const addMany = useMissions(s => s.addMany)
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState(null)
  const [saving, setSaving] = useState(false)

  const analyze = () => {
    if (!raw.trim()) return
    setParsed(parseReports(raw))
  }

  const confirm = async () => {
    setSaving(true)
    await addMany(parsed)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-30 bg-night overflow-y-auto mx-auto max-w-[480px]">
      <div className="sticky top-0 bg-night px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between border-b border-white/[0.06]">
        <button onClick={onClose} className="text-muted text-sm">Annuler</button>
        <h2 className="font-medium">Importer</h2>
        {parsed
          ? <button onClick={confirm} disabled={saving} className="text-amber font-medium text-sm disabled:opacity-50">{saving ? '…' : `Enregistrer ${parsed.length}`}</button>
          : <button onClick={analyze} className="text-amber font-medium text-sm">Analyser</button>}
      </div>

      <div className="p-5 space-y-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {!parsed && (
          <>
            <p className="text-muted text-sm">Colle un ou plusieurs rapports à la suite. Ils sont séparés automatiquement.</p>
            <textarea
              value={raw} onChange={e => setRaw(e.target.value)} rows={16}
              placeholder={'Booking # : ...\nDate : ...\nClient : ...\n\nBooking # : ...'}
              className={`${field} resize-none font-mono text-sm`}
            />
          </>
        )}

        {parsed && parsed.length === 0 && (
          <p className="text-muted text-sm text-center py-8">Aucun rapport détecté. Vérifie le texte.</p>
        )}

        {parsed && parsed.length > 0 && (
          <>
            <p className="text-muted text-sm">
              {parsed.length} mission{parsed.length > 1 ? 's' : ''} détectée{parsed.length > 1 ? 's' : ''}. Vérifie puis enregistre.
            </p>
            <div className="space-y-2">
              {parsed.map((m, i) => (
                <div key={i} className="bg-surface rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{m.client_name || 'Client inconnu'}</span>
                      {m.is_no_show && <span className="text-error text-[0.6rem] uppercase bg-error/10 rounded px-1.5 py-0.5 shrink-0">No show</span>}
                    </div>
                    <p className="text-muted text-xs mt-0.5 truncate">
                      {m.intervention_date} · {SERVICE_LABEL[m.service_type]}
                      {m.flight_code ? ` · ${m.flight_code}` : ''} · {m.pax_count} pax
                    </p>
                  </div>
                  <span className="text-muted/60 text-xs shrink-0">#{m.booking_ref || '—'}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setParsed(null)} className="w-full bg-surface text-muted rounded-xl py-3 text-sm active:bg-surface-2">
              Modifier le texte
            </button>
            <p className="text-muted/60 text-xs">Les pourboires restent à 0. Tu les saisiras sur chaque carte.</p>
          </>
        )}
      </div>
    </div>
  )
}
