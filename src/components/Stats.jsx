import { parseLocal } from '../lib/date'
import { useState } from 'react'
import { useMissions } from '../store/missions'
import { aggregate } from '../lib/aggregate'

const PERIODS = [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']]
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

function fmtEur(n) { return Number(n || 0).toFixed(2).replace('.', ',') }

function bucketLabel(key, granularity) {
  if (granularity === 'day') {
    return parseLocal(key).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  if (granularity === 'week') { const [y, w] = key.split('-S'); return `Semaine ${w} · ${y}` }
  if (granularity === 'month') { const [y, mo] = key.split('-'); return `${MONTHS[+mo - 1]} ${y}` }
  return `Année ${key}`
}

export default function Stats() {
  const missions = useMissions(s => s.missions)
  const shifts = useMissions(s => s.shifts)
  const [period, setPeriod] = useState('month')
  const buckets = aggregate(missions, shifts, period)
  const maxTips = Math.max(...buckets.map(b => b.tips), 1)

  return (
    <div className="px-5 py-4">
      <div className="flex gap-1 mb-5 bg-surface rounded-xl p-1">
        {PERIODS.map(([k, lbl]) => (
          <button key={k} onClick={() => setPeriod(k)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${period === k ? 'bg-amber text-night' : 'text-muted'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {buckets.length === 0 && <p className="text-muted text-sm text-center py-12">Aucune donnée.</p>}

      <div className="space-y-2.5">
        {buckets.map(b => {
          const pct = Math.round((b.tips / maxTips) * 100)
          return (
            <article key={b.key} className="bg-surface rounded-2xl p-4">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-medium text-sm capitalize">{bucketLabel(b.key, period)}</h3>
                <span className="tnum font-display font-semibold text-amber text-2xl">
                  {fmtEur(b.tips)}<span className="text-amber/50 text-sm"> €</span>
                </span>
              </div>
              <div className="h-1 rounded-full bg-night overflow-hidden mb-3.5">
                <div className="h-full rounded-full bg-amber" style={{ width: `${pct}%` }} />
              </div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <Metric label="Miss." value={b.count} />
                <Metric label="Pax" value={b.pax} />
                <Metric label="€/pax" value={fmtEur(b.tipPerPax)} />
                <Metric label="€/h" value={b.hours > 0 ? fmtEur(b.tipPerHour) : '—'} />
              </div>
              {(b.noShows > 0 || b.issues > 0 || b.hours > 0) && (
                <p className="text-muted/70 text-xs mt-3 flex gap-3 justify-center">
                  {b.hours > 0 && <span>{b.hours}h travaillées</span>}
                  {b.noShows > 0 && <span>{b.noShows} no-show</span>}
                  {b.issues > 0 && <span className="text-error/70">{b.issues} pb</span>}
                </p>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="bg-night rounded-lg py-2">
      <p className="tnum font-display font-medium text-base">{value}</p>
      <p className="text-muted text-[0.6rem] uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  )
}
