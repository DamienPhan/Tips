import { useState, useMemo } from 'react'
import { useMissions } from '../store/missions'
import { computePayroll } from '../lib/payroll'
import { exportPayrollPdf } from '../lib/exportPayrollPdf'

const RATE_KEY = 'payroll:hourlyRate'

export default function PayrollSimulator() {
  const shifts = useMissions(s => s.shifts)
  const [hourlyRate, setHourlyRate] = useState(() => Number(localStorage.getItem(RATE_KEY)) || 12.5)
  const [monthKey, setMonthKey] = useState(() => new Date().toISOString().slice(0, 7))

  const results = useMemo(() => computePayroll(shifts, hourlyRate), [shifts, hourlyRate])
  const current = results.find(r => r.key === monthKey) || results[results.length - 1]

  function updateRate(v) {
    const n = Number(v) || 0
    setHourlyRate(n)
    localStorage.setItem(RATE_KEY, String(n))
  }

  if (!current) return <p className="text-muted p-4">Aucune donnée d'heures disponible.</p>

  const p = current.payroll

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm">Taux horaire (€/h)</label>
        <input
          type="number" step="0.01" min="0" value={hourlyRate}
          onChange={e => updateRate(e.target.value)}
          className="w-24 rounded border px-2 py-1"
        />
        <select value={monthKey} onChange={e => setMonthKey(e.target.value)} className="rounded border px-2 py-1">
          {results.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>

      <div className="rounded-lg border divide-y">
        <Row label="Heures normales" hours={p.baseHours} amount={p.baseAmount} />
        <Row label="Heures sup (≤ 34h, +25%)" hours={p.overtimeLowHours} amount={p.overtimeLowHours * hourlyRate * 1.25} />
        <Row label="Heures sup (> 34h, +50%)" hours={p.overtimeHighHours} amount={p.overtimeHighHours * hourlyRate * 1.5} />
        {p.offWorkedHours > 0 && (
          <div className="flex justify-between p-3 text-xs text-muted">
            <span>dont jours OFF travaillés</span>
            <span>{p.offWorkedHours.toFixed(2)} h (incluses ci-dessus)</span>
          </div>
        )}
        <Row label="Prime de nuit (+25%)" hours={p.nightHours} amount={p.nightBonus} />
        <div className="flex justify-between p-3 font-bold text-lg">
          <span>Total brut estimé</span>
          <span>{p.grossTotal.toFixed(2)} €</span>
        </div>
      </div>

      <button
        onClick={() => exportPayrollPdf([current], hourlyRate)}
        className="w-full rounded-lg bg-primary text-white py-2"
      >
        Exporter en PDF
      </button>
    </div>
  )
}

function Row({ label, hours, amount }) {
  return (
    <div className="flex justify-between p-3 text-sm">
      <span>{label}</span>
      <span className="text-muted">{hours.toFixed(2)} h</span>
      <span className="font-medium">{amount.toFixed(2)} €</span>
    </div>
  )
}
