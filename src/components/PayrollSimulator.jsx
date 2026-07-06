import { useState, useMemo, useEffect } from 'react'
import { useMissions } from '../store/missions'
import { computePayroll, payrollRows } from '../lib/payroll'
import { fmtHours } from '../lib/parseShift'
import { exportPayrollPdf, exportPayrollXlsx } from '../lib/exportPayroll'

const RATE_KEY = 'payroll:hourlyRate'

// Erreur typique d'un chunk (jspdf/xlsx) devenu introuvable après un déploiement : le service
// worker (registerType 'autoUpdate') a basculé en silence sur une nouvelle version sans recharger
// l'onglet déjà ouvert, qui continue de référencer les anciens noms de fichiers hashés. Les
// navigateurs formulent l'erreur différemment (Chromium/Firefox/Safari) d'où plusieurs motifs.
function isStaleChunkError(e) {
  const msg = String(e?.message || e)
  return /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(msg)
}

export default function PayrollSimulator() {
  const shifts = useMissions(s => s.shifts)
  const [hourlyRate, setHourlyRate] = useState(() => Number(localStorage.getItem(RATE_KEY)) || 12.5)
  const [rateDraft, setRateDraft] = useState(() => String(Number(localStorage.getItem(RATE_KEY)) || 12.5).replace('.', ','))
  const [monthKey, setMonthKey] = useState(() => new Date().toISOString().slice(0, 7))
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  // Précharge jsPDF/xlsx dès l'ouverture de l'onglet : sur Safari iOS / PWA installée, un
  // téléchargement déclenché après un `await import(...)` réseau perd le "geste utilisateur"
  // du clic et échoue silencieusement. En préchargeant ici, l'import est déjà en cache au
  // moment du clic et le déclenchement du fichier reste dans la même activation.
  useEffect(() => { import('jspdf'); import('xlsx') }, [])

  const results = useMemo(() => computePayroll(shifts, hourlyRate), [shifts, hourlyRate])
  const current = results.find(r => r.key === monthKey) || results[results.length - 1]

  function updateRate(v) {
    setRateDraft(v)
    const n = Number(String(v).replace(',', '.')) || 0
    setHourlyRate(n)
    localStorage.setItem(RATE_KEY, String(n))
  }

  const run = async (kind) => {
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'pdf') await exportPayrollPdf([current], hourlyRate)
      else await exportPayrollXlsx([current], hourlyRate)
    } catch (e) {
      console.error('Export paie échoué', e)
      if (isStaleChunkError(e)) {
        // La page tourne encore sur un ancien build dont les chunks ont disparu du serveur après
        // un déploiement : un rechargement récupère la version courante plutôt que de laisser
        // l'utilisateur bloqué sur une erreur qu'un simple F5 aurait réglée.
        window.location.reload()
        return
      }
      setError(e.message || String(e))
    }
    setBusy(null)
  }

  return (
    <div className="px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-36">
      <h2 className="text-lg font-semibold mb-4">Simulation de paie</h2>

      <section className="bg-surface rounded-2xl p-4 mb-4">
        <label className="text-muted text-xs uppercase tracking-wider mb-1.5 block">Taux horaire (€/h)</label>
        <input inputMode="decimal" type="text" value={rateDraft}
          onChange={e => updateRate(e.target.value)}
          className="w-full bg-surface-2 rounded-xl px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-amber/40 mb-3" />

        <label className="text-muted text-xs uppercase tracking-wider mb-1.5 block">Mois</label>
        <select value={monthKey} onChange={e => setMonthKey(e.target.value)}
          className="w-full bg-surface-2 rounded-xl px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-amber/40">
          {results.length === 0 && <option value={monthKey}>Aucune donnée</option>}
          {results.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </section>

      {!current ? (
        <p className="text-muted text-sm text-center py-8">Aucune donnée d'heures disponible.</p>
      ) : (
        <>
          <section className="bg-surface rounded-2xl p-4 mb-4 divide-y divide-white/5">
            {payrollRows(current.payroll).map(r => <Row key={r.label} label={r.label} hours={r.hours} amount={r.amount} />)}
            <div className="flex items-baseline justify-between pt-3">
              <span className="font-medium text-sm">Total brut estimé</span>
              <span className="tnum font-display font-bold text-amber text-xl">{current.payroll.grossTotal.toFixed(2)} €</span>
            </div>
          </section>

          <p className="text-muted text-xs mb-3">Simulation indicative — hors charges sociales et prélèvement à la source.</p>

          <div className="flex gap-2">
            <button onClick={() => run('xlsx')} disabled={busy}
              className="flex-1 bg-surface-2 text-[#E6E9EF] rounded-xl py-3 text-sm font-medium active:bg-white/10 disabled:opacity-50">
              {busy === 'xlsx' ? '…' : 'Excel'}
            </button>
            <button onClick={() => run('pdf')} disabled={busy}
              className="flex-1 bg-surface-2 text-[#E6E9EF] rounded-xl py-3 text-sm font-medium active:bg-white/10 disabled:opacity-50">
              {busy === 'pdf' ? '…' : 'PDF'}
            </button>
          </div>
          {error && <p className="text-error text-xs mt-2">L'export a échoué : {error}</p>}
        </>
      )}
    </div>
  )
}

function Row({ label, hours, amount }) {
  return (
    <div className="flex items-center justify-between py-3 text-sm first:pt-0">
      <span className="text-[#E6E9EF]">{label}</span>
      <span className="tnum text-muted mx-3">{fmtHours(hours)}</span>
      <span className="tnum font-medium">{amount.toFixed(2)} €</span>
    </div>
  )
}
