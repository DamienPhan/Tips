import { useState, useMemo, useEffect } from 'react'
import { useMissions } from '../store/missions'
import { computePayroll, payrollRows, DEFAULT_RATES } from '../lib/payroll'
import { fmtHours } from '../lib/parseShift'
import { exportPayrollPdf, exportPayrollXlsx } from '../lib/exportPayroll'
import { todayLocal } from '../lib/date'

const RATE_KEY = 'payroll:hourlyRate'
const PAY_MODE_KEY = 'payroll:payMode'
const WEEKLY_BASE_HOURS_KEY = 'payroll:weeklyBaseHours'
const ABSENCE_DAYS_KEY = 'payroll:absenceDays'
const COTISATION_RATE_KEY = 'payroll:cotisationRate'

function readAbsenceDays() {
  try { return JSON.parse(localStorage.getItem(ABSENCE_DAYS_KEY)) || {} } catch { return {} }
}

function draftFromMap(map) {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, String(v).replace('.', ',')]))
}

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
  const [monthKey, setMonthKey] = useState(() => todayLocal().slice(0, 7))
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  // 'hourly' (défaut) : base payée sur les heures réellement pointées. 'monthly' : reproduit le
  // mécanisme "salarié mensualisé" d'un vrai bulletin (base légale fixe + prorata d'absence en
  // jours) — voir la doc de computeMonthPayroll dans payroll.js pour le détail du calcul.
  const [payMode, setPayMode] = useState(() => localStorage.getItem(PAY_MODE_KEY) === 'monthly' ? 'monthly' : 'hourly')
  const [weeklyBaseHours, setWeeklyBaseHours] = useState(() => Number(localStorage.getItem(WEEKLY_BASE_HOURS_KEY)) || DEFAULT_RATES.weeklyBaseHours)
  const [weeklyBaseHoursDraft, setWeeklyBaseHoursDraft] = useState(() => String(Number(localStorage.getItem(WEEKLY_BASE_HOURS_KEY)) || DEFAULT_RATES.weeklyBaseHours).replace('.', ','))
  const [absenceDaysByMonth, setAbsenceDaysByMonth] = useState(readAbsenceDays)
  const [absenceDraftByMonth, setAbsenceDraftByMonth] = useState(() => draftFromMap(readAbsenceDays()))
  const absenceDraft = absenceDraftByMonth[monthKey] ?? ''

  // Taux forfaitaire de cotisations salariales (voir DEFAULT_RATES.employeeCotisationRate dans
  // payroll.js) — saisi/affiché en % dans l'UI, stocké en fraction (÷100) côté calcul.
  const defaultCotisationPct = DEFAULT_RATES.employeeCotisationRate * 100
  const [cotisationRate, setCotisationRate] = useState(() => (Number(localStorage.getItem(COTISATION_RATE_KEY)) || defaultCotisationPct) / 100)
  const [cotisationRateDraft, setCotisationRateDraft] = useState(() => String(Number(localStorage.getItem(COTISATION_RATE_KEY)) || defaultCotisationPct).replace('.', ','))

  // Précharge jsPDF/xlsx dès l'ouverture de l'onglet : sur Safari iOS / PWA installée, un
  // téléchargement déclenché après un `await import(...)` réseau perd le "geste utilisateur"
  // du clic et échoue silencieusement. En préchargeant ici, l'import est déjà en cache au
  // moment du clic et le déclenchement du fichier reste dans la même activation.
  useEffect(() => { import('jspdf'); import('xlsx') }, [])

  const rates = useMemo(() => ({ ...DEFAULT_RATES, weeklyBaseHours, employeeCotisationRate: cotisationRate }), [weeklyBaseHours, cotisationRate])
  const results = useMemo(() => computePayroll(shifts, hourlyRate, rates, { payMode, absenceDaysByMonth }),
    [shifts, hourlyRate, rates, payMode, absenceDaysByMonth])
  const current = results.find(r => r.key === monthKey) || results[results.length - 1]

  function updateRate(v) {
    setRateDraft(v)
    const n = Number(String(v).replace(',', '.')) || 0
    setHourlyRate(n)
    localStorage.setItem(RATE_KEY, String(n))
  }

  function updatePayMode(mode) {
    setPayMode(mode)
    localStorage.setItem(PAY_MODE_KEY, mode)
  }

  function updateWeeklyBaseHours(v) {
    setWeeklyBaseHoursDraft(v)
    const n = Number(String(v).replace(',', '.')) || 0
    setWeeklyBaseHours(n)
    localStorage.setItem(WEEKLY_BASE_HOURS_KEY, String(n))
  }

  function updateCotisationRate(v) {
    setCotisationRateDraft(v)
    const pct = Number(String(v).replace(',', '.')) || 0
    setCotisationRate(pct / 100)
    localStorage.setItem(COTISATION_RATE_KEY, String(pct))
  }

  function updateAbsenceDays(v) {
    setAbsenceDraftByMonth({ ...absenceDraftByMonth, [monthKey]: v })
    const n = Math.max(0, Number(String(v).replace(',', '.')) || 0)
    const next = { ...absenceDaysByMonth, [monthKey]: n }
    setAbsenceDaysByMonth(next)
    localStorage.setItem(ABSENCE_DAYS_KEY, JSON.stringify(next))
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
        <label className="text-muted text-xs uppercase tracking-wider mb-1.5 block">Mode de calcul</label>
        <div className="flex gap-2 mb-3">
          <button onClick={() => updatePayMode('hourly')} aria-pressed={payMode === 'hourly'}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${payMode === 'hourly' ? 'bg-amber text-night' : 'bg-surface-2 text-muted'}`}>
            Heures réelles
          </button>
          <button onClick={() => updatePayMode('monthly')} aria-pressed={payMode === 'monthly'}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${payMode === 'monthly' ? 'bg-amber text-night' : 'bg-surface-2 text-muted'}`}>
            Mensualisé
          </button>
        </div>

        <label className="text-muted text-xs uppercase tracking-wider mb-1.5 block">Taux horaire (€/h)</label>
        <input inputMode="decimal" type="text" value={rateDraft}
          onChange={e => updateRate(e.target.value)}
          className="w-full bg-surface-2 rounded-xl px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-amber/40 mb-3" />

        <label className="text-muted text-xs uppercase tracking-wider mb-1.5 block">Cotisations salariales (%, estimation)</label>
        <input inputMode="decimal" type="text" value={cotisationRateDraft}
          onChange={e => updateCotisationRate(e.target.value)}
          className="w-full bg-surface-2 rounded-xl px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-amber/40 mb-3" />

        {payMode === 'monthly' && (
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label className="text-muted text-xs uppercase tracking-wider mb-1.5 block">Base légale (h/semaine)</label>
              <input inputMode="decimal" type="text" value={weeklyBaseHoursDraft}
                onChange={e => updateWeeklyBaseHours(e.target.value)}
                className="w-full bg-surface-2 rounded-xl px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-amber/40" />
            </div>
            <div className="flex-1">
              <label className="text-muted text-xs uppercase tracking-wider mb-1.5 block">Absence (j, prorata)</label>
              <input inputMode="decimal" type="text" value={absenceDraft} placeholder="0"
                onChange={e => updateAbsenceDays(e.target.value)}
                className="w-full bg-surface-2 rounded-xl px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-amber/40" />
            </div>
          </div>
        )}

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
            <div className="flex items-center justify-between py-3 text-sm">
              <span className="text-muted">Cotisations salariales (est., {(current.payroll.cotisationRate * 100).toFixed(1)}%)</span>
              <span className="tnum text-error">−{current.payroll.cotisationAmount.toFixed(2)} €</span>
            </div>
            <div className="flex items-baseline justify-between pt-3">
              <span className="font-medium text-sm">Net estimé</span>
              <span className="tnum font-display font-bold text-synced text-xl">{current.payroll.netTotal.toFixed(2)} €</span>
            </div>
          </section>

          <p className="text-muted text-xs mb-3">Simulation indicative — cotisations salariales estimées à taux forfaitaire, hors prélèvement à la source.</p>

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
