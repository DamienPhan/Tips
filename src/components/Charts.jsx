import { parseLocal } from '../lib/date'
import { useState } from 'react'
import { useMissions } from '../store/missions'
import { tipTrend, serviceBreakdown, weeklyOvertime, calendarData } from '../lib/charts'
import { fmtHours } from '../lib/parseShift'

const TREND_PERIODS = [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']]
const SERVICE = [['ARR', 'Arrivée', '#E8B14C'], ['DEP', 'Départ', '#5DCAA5'], ['TRANSIT', 'Transit', '#7C8499']]

function fmtEur(n) { return Number(n || 0).toFixed(0) }

export default function Charts() {
  const missions = useMissions(s => s.missions)
  const shifts = useMissions(s => s.shifts)
  const [trendP, setTrendP] = useState('week')

  return (
    <div className="px-5 py-4 space-y-4">
      <Panel title="Évolution des pourboires">
        <div className="flex gap-1 mb-3 bg-night rounded-lg p-1">
          {TREND_PERIODS.map(([k, lbl]) => (
            <button key={k} onClick={() => setTrendP(k)}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium ${trendP === k ? 'bg-amber text-night' : 'text-muted'}`}>
              {lbl}
            </button>
          ))}
        </div>
        <TrendChart data={tipTrend(missions, trendP)} />
      </Panel>

      <Panel title="Répartition par service">
        <ServiceChart data={serviceBreakdown(missions)} />
      </Panel>

      <Panel title="Heures & supplémentaires">
        <OvertimeChart data={weeklyOvertime(shifts)} />
      </Panel>

      <Panel title="Calendrier des shifts">
        <Calendar data={calendarData(shifts)} />
      </Panel>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <section className="bg-surface rounded-2xl p-4">
      <h3 className="font-medium text-sm mb-3">{title}</h3>
      {children}
    </section>
  )
}

function TrendChart({ data }) {
  if (data.length === 0) return <Empty />
  const w = 300, h = 120, pad = 8
  const max = Math.max(...data.map(d => d.value), 1)
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0
  const pts = data.map((d, i) => {
    const x = pad + i * step
    const y = h - pad - (d.value / max) * (h - pad * 2)
    return [x, y]
  })
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - pad} L${pad},${h - pad} Z`
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 120 }}>
        <path d={area} fill="#E8B14C" opacity="0.12" />
        <path d={line} fill="none" stroke="#E8B14C" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="#E8B14C" />)}
      </svg>
      <div className="flex justify-between text-muted text-[0.65rem] mt-1">
        <span>{label(data[0].key)}</span>
        <span className="text-amber">{fmtEur(max)} € max</span>
        <span>{label(data[data.length - 1].key)}</span>
      </div>
    </div>
  )
}

function label(key) {
  if (key.includes('-S')) return key.split('-S')[1]
  if (key.length === 7) return key.slice(5)
  return key.slice(8)
}

function ServiceChart({ data }) {
  if (data.total === 0) return <Empty />
  return (
    <div className="space-y-2.5">
      {SERVICE.map(([k, lbl, color]) => {
        const pct = Math.round((data[k] / data.total) * 100)
        return (
          <div key={k}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#E6E9EF]">{lbl}</span>
              <span className="text-muted">{data[k]} · {pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-night overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OvertimeChart({ data }) {
  if (data.length === 0) return <Empty />
  const max = Math.max(...data.map(d => d.worked), 1)
  return (
    <div className="space-y-3">
      {data.map(d => (
        <div key={d.key}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[#E6E9EF]">Semaine {d.key.split('-S')[1]}</span>
            <span className="text-muted">{fmtHours(d.worked)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-night overflow-hidden flex">
            <div className="h-full bg-amber" style={{ width: `${Math.min(35, d.worked) / max * 100}%` }} />
            {d.weeklyOt > 0 && <div className="h-full bg-error" style={{ width: `${d.weeklyOt / max * 100}%` }} />}
          </div>
          <div className="flex gap-3 text-[0.65rem] mt-1">
            {d.weeklyOt > 0 && <span className="text-error">+{fmtHours(d.weeklyOt)} hebdo (&gt;35h)</span>}
            {d.dailyOt > 0 && <span className="text-amber/80">+{fmtHours(d.dailyOt)} journalières (&gt;8h30)</span>}
            {d.weeklyOt === 0 && d.dailyOt === 0 && <span className="text-muted">Pas de sup</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function Calendar({ data }) {
  if (data.length === 0) return <Empty />
  return (
    <div className="space-y-2">
      {data.map(d => (
        <div key={d.date} className="flex items-center justify-between bg-night rounded-lg px-3 py-2">
          <span className="text-sm">{parseLocal(d.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          <div className="flex items-center gap-3">
            <span className="tnum text-sm text-[#E6E9EF]">{fmtHours(d.hours)}</span>
            {d.overtime > 0 && <span className="tnum text-xs text-error">+{fmtHours(d.overtime)}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function Empty() {
  return <p className="text-muted text-sm text-center py-6">Pas encore de données.</p>
}
