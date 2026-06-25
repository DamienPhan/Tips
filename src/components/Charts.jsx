import { useState } from 'react'
import { useMissions } from '../store/missions'
import { tipTrend, serviceBreakdown, weeklyOvertime, calendarData, dailyAverage } from '../lib/charts'
import { fmtHours } from '../lib/parseShift'
import { parseLocal } from '../lib/date'

const TREND_PERIODS = [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']]
const SERVICE = [['ARR', 'Arrivée', '#E8B14C'], ['DEP', 'Départ', '#5DCAA5'], ['TRANSIT', 'Transit', '#7C8499']]

function fmtEur(n, dec = 0) {
  return Number(n || 0).toFixed(dec).replace('.', ',')
}

export default function Charts() {
  const missions = useMissions(s => s.missions)
  const shifts = useMissions(s => s.shifts)
  const [trendP, setTrendP] = useState('week')
  const avg = dailyAverage(missions)

  return (
    <div className="px-5 py-4 space-y-4">

      {/* Carte moyenne */}
      <section className="bg-surface rounded-2xl p-4">
        <p className="text-muted text-[0.7rem] uppercase tracking-wider mb-2">Moyenne tips / jour travaillé</p>
        <div className="flex items-baseline gap-1">
          <span className="tnum font-display font-bold text-amber text-4xl">{fmtEur(avg.avg, 2).split(',')[0]}</span>
          <span className="tnum font-display font-bold text-amber/80 text-2xl">,{fmtEur(avg.avg, 2).split(',')[1]}</span>
          <span className="font-display text-amber/40 text-xl ml-1">€</span>
        </div>
        {avg.days > 0 && (
          <div className="flex gap-4 mt-2 text-xs text-muted">
            <span>Sur {avg.days} jour{avg.days > 1 ? 's' : ''}</span>
            <span className="text-synced">Max {fmtEur(avg.max, 2)} €</span>
            <span className="text-error/80">Min {fmtEur(avg.min, 2)} €</span>
          </div>
        )}
      </section>

      {/* Courbe tips */}
      <section className="bg-surface rounded-2xl p-4">
        <h3 className="font-medium text-sm mb-3">Évolution des pourboires</h3>
        <div className="flex gap-1 mb-3 bg-night rounded-lg p-1">
          {TREND_PERIODS.map(([k, lbl]) => (
            <button key={k} onClick={() => setTrendP(k)}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium ${trendP === k ? 'bg-amber text-night' : 'text-muted'}`}>
              {lbl}
            </button>
          ))}
        </div>
        <TrendChart data={tipTrend(missions, trendP)} />
      </section>

      {/* Répartition service */}
      <section className="bg-surface rounded-2xl p-4">
        <h3 className="font-medium text-sm mb-3">Répartition par service</h3>
        <ServiceChart data={serviceBreakdown(missions)} />
      </section>

      {/* Heures sup */}
      <section className="bg-surface rounded-2xl p-4">
        <h3 className="font-medium text-sm mb-3">Heures & supplémentaires</h3>
        <OvertimeChart data={weeklyOvertime(shifts)} />
      </section>

      {/* Calendrier */}
      <section className="bg-surface rounded-2xl p-4">
        <h3 className="font-medium text-sm mb-3">Calendrier des shifts</h3>
        <Calendar data={calendarData(shifts)} />
      </section>
    </div>
  )
}

function TrendChart({ data }) {
  if (data.length === 0) return <Empty />
  const W = 300, H = 130, PL = 36, PR = 8, PT = 8, PB = 20
  const innerW = W - PL - PR
  const innerH = H - PT - PB
  const maxVal = Math.max(...data.map(d => d.value), 1)
  const step = data.length > 1 ? innerW / (data.length - 1) : 0

  const pts = data.map((d, i) => ({
    x: PL + i * step,
    y: PT + innerH - (d.value / maxVal) * innerH,
    d
  }))

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length-1].x.toFixed(1)},${H - PB} L${PL},${H - PB} Z`

  // Grille Y : 0, 50%, 100%
  const yTicks = [0, 0.5, 1].map(r => ({ y: PT + innerH - r * innerH, val: maxVal * r }))

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 130 }}>
        {/* Grille */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PL} y1={t.y} x2={W - PR} y2={t.y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={PL - 4} y={t.y + 4} textAnchor="end" fill="#7C8499" fontSize="9">
              {fmtEur(t.val)}
            </text>
          </g>
        ))}
        {/* Aire + courbe */}
        <path d={area} fill="#E8B14C" opacity="0.1" />
        <path d={line} fill="none" stroke="#E8B14C" strokeWidth="2" strokeLinejoin="round" />
        {/* Points + valeurs */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="#E8B14C" />
            {/* Valeur au-dessus du point */}
            <text
              x={p.x} y={p.y - 6}
              textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}
              fill="#E8B14C" fontSize="9" opacity="0.9"
            >
              {fmtEur(p.d.value)}
            </text>
          </g>
        ))}
        {/* Axe X labels */}
        {pts.map((p, i) => (
          <text key={i} x={p.x} y={H - 4}
            textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}
            fill="#7C8499" fontSize="9">
            {shortLabel(p.d.key)}
          </text>
        ))}
      </svg>
      {/* Légende count */}
      <div className="flex justify-between flex-wrap gap-x-3 gap-y-1 mt-1">
        {data.map((d, i) => (
          <span key={i} className="text-muted text-[0.65rem] tnum">
            {shortLabel(d.key)} · {d.count} miss · {fmtEur(d.avg, 2)} €/miss
          </span>
        ))}
      </div>
    </div>
  )
}

function shortLabel(key) {
  if (key.includes('-S')) return `S${key.split('-S')[1]}`
  if (key.length === 7) return key.slice(5)
  return key.slice(8)
}

function ServiceChart({ data }) {
  if (data.total === 0) return <Empty />
  return (
    <div className="space-y-3">
      {SERVICE.map(([k, lbl, color]) => {
        const pct = Math.round((data[k] / data.total) * 100)
        return (
          <div key={k}>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-[#E6E9EF]">{lbl}</span>
              <span className="tnum text-muted">{data[k]} mission{data[k] > 1 ? 's' : ''} · <span style={{ color }}>{pct}%</span></span>
            </div>
            <div className="h-2 rounded-full bg-night overflow-hidden relative">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
            </div>
          </div>
        )
      })}
      <p className="text-muted text-xs text-right">{data.total} missions au total</p>
    </div>
  )
}

function OvertimeChart({ data }) {
  if (data.length === 0) return <Empty />
  const maxH = Math.max(...data.map(d => d.worked), 1)
  return (
    <div className="space-y-4">
      {data.map(d => (
        <div key={d.key}>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-[#E6E9EF]">Semaine {d.key.split('-S')[1]}</span>
            <span className="tnum text-muted">{fmtHours(d.worked)} travaillées</span>
          </div>
          <div className="h-2.5 rounded-full bg-night overflow-hidden flex">
            <div className="h-full bg-amber" style={{ width: `${Math.min(35, d.worked) / maxH * 100}%` }} />
            {d.weeklyOt > 0 && <div className="h-full bg-error" style={{ width: `${d.weeklyOt / maxH * 100}%` }} />}
          </div>
          <div className="flex gap-3 flex-wrap text-[0.65rem] mt-1.5">
            <span className="text-muted">Base 35h</span>
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
    <div className="space-y-1.5">
      {data.map(d => (
        <div key={d.date} className="flex items-center justify-between bg-night rounded-lg px-3 py-2.5">
          <span className="text-sm">
            {parseLocal(d.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
          <div className="flex items-center gap-3">
            <span className="tnum text-sm text-[#E6E9EF]">{fmtHours(d.hours)}</span>
            {d.overtime > 0
              ? <span className="tnum text-xs text-error font-medium">+{fmtHours(d.overtime)} sup</span>
              : <span className="tnum text-xs text-muted">normal</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function Empty() {
  return <p className="text-muted text-sm text-center py-6">Pas encore de données.</p>
}
