import { useState } from 'react'
import { useMissions } from '../store/missions'
import { summary } from '../lib/summary'
import { revenueBars, serviceBreakdown, dailyAverage, barLabel } from '../lib/charts'
import { fmtHours } from '../lib/parseShift'

const PERIODS = [['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']]
const SERVICE = [['ARR', 'Arrivée', '#E8B14C'], ['DEP', 'Départ', '#5DCAA5'], ['TRANSIT', 'Transit', '#7C8499']]

function eur(n, dec = 2) { return Number(n || 0).toFixed(dec).replace('.', ',') }

export default function Home() {
  const missions = useMissions(s => s.missions)
  const shifts = useMissions(s => s.shifts)
  const [period, setPeriod] = useState('month')
  const [sel, setSel] = useState(null)

  const sum = summary(missions, shifts, period)
  const bars = revenueBars(missions, period)
  const svc = serviceBreakdown(missions)
  const avg = dailyAverage(missions)
  const [whole, cents] = eur(sum.tips).split(',')

  return (
    <div className="px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-36">
      <div className="flex gap-1 mb-5 bg-surface rounded-xl p-1">
        {PERIODS.map(([k, lbl]) => (
          <button key={k} onClick={() => { setPeriod(k); setSel(null) }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${period === k ? 'bg-amber text-night' : 'text-muted'}`}>
            {lbl}
          </button>
        ))}
      </div>

      <p className="text-muted text-[0.7rem] uppercase tracking-[0.2em] mb-1">Gains totaux</p>
      <div className="flex items-baseline gap-1 mb-4">
        <span className="tnum font-display font-bold text-amber leading-none" style={{ fontSize: 'clamp(2.75rem,16vw,4rem)' }}>{whole}</span>
        <span className="tnum font-display font-bold text-amber/80 text-3xl">,{cents}</span>
        <span className="font-display text-amber/40 text-2xl ml-1">€</span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2">
        <Stat label="Missions" value={sum.missionCount} />
        <Stat label="Heures" value={fmtHours(sum.hours)} />
        <Stat label="Sup" value={fmtHours(sum.overtime)} accent={sum.overtime > 0} />
      </div>
      {(sum.night > 0 || sum.nightOvertime > 0) && (
        <div className="grid grid-cols-2 gap-2 mb-6">
          <Stat label="Heures de nuit" value={fmtHours(sum.night)} />
          <Stat label="Sup de nuit" value={fmtHours(sum.nightOvertime)} accent={sum.nightOvertime > 0} />
        </div>
      )}
      {!(sum.night > 0 || sum.nightOvertime > 0) && <div className="mb-6" />}

      <section className="bg-surface rounded-2xl p-4 mb-4">
        <h3 className="font-medium text-sm mb-3">Revenus</h3>
        <BarChart bars={bars} period={period} sel={sel} onSel={setSel} />
        {sel != null && bars[sel] && (
          <div className="mt-3 bg-night rounded-xl px-3 py-2.5 flex justify-between items-center">
            <span className="text-sm text-muted">{barLabel(bars[sel].key, period)}</span>
            <span className="text-sm"><span className="tnum font-display text-amber font-semibold">{eur(bars[sel].tips, 0)} €</span> · {bars[sel].count} mission{bars[sel].count > 1 ? 's' : ''}</span>
          </div>
        )}
      </section>

      <section className="bg-surface rounded-2xl p-4 mb-4">
        <h3 className="font-medium text-sm mb-1">Moyenne par jour travaillé</h3>
        <div className="flex items-baseline gap-1 mb-2">
          <span className="tnum font-display font-bold text-amber text-3xl">{eur(avg.avg)}</span>
          <span className="font-display text-amber/40 text-lg ml-0.5">€</span>
        </div>
        {avg.days > 0 && (
          <div className="flex gap-4 text-xs text-muted">
            <span>{avg.days} jour{avg.days > 1 ? 's' : ''}</span>
            <span className="text-synced">Max {eur(avg.max, 0)} €</span>
            <span className="text-error/80">Min {eur(avg.min, 0)} €</span>
          </div>
        )}
      </section>

      <section className="bg-surface rounded-2xl p-4">
        <h3 className="font-medium text-sm mb-3">Répartition par service</h3>
        {svc.total === 0 ? <p className="text-muted text-sm text-center py-4">Aucune donnée.</p> : (
          <div className="space-y-3">
            {SERVICE.map(([k, lbl, color]) => {
              const pct = Math.round((svc[k] / svc.total) * 100)
              return (
                <div key={k}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-[#E6E9EF]">{lbl}</span>
                    <span className="tnum text-muted">{svc[k]} · <span style={{ color }}>{pct}%</span></span>
                  </div>
                  <div className="h-2 rounded-full bg-night overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <ExportSection shifts={shifts} />
    </div>
  )
}

function ExportSection({ shifts }) {
  const [busy, setBusy] = useState(null)
  const run = async (kind) => {
    setBusy(kind)
    try {
      const mod = await import('../lib/exportData')
      if (kind === 'xlsx') await mod.exportXlsx(shifts)
      else await mod.exportPdf(shifts)
    } catch (e) {
      console.error('Export échoué', e)
      alert("L'export a échoué. Réessaie.")
    }
    setBusy(null)
  }
  return (
    <section className="bg-surface rounded-2xl p-4 mt-4">
      <h3 className="font-medium text-sm mb-1">Relevé d'heures</h3>
      <p className="text-muted text-xs mb-3">Récapitulatif mensuel : jours travaillés, heures, sup, jours OFF.</p>
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
    </section>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div className="bg-surface rounded-xl py-3 text-center">
      <p className={`tnum font-display font-medium text-lg ${accent ? 'text-error' : 'text-[#E6E9EF]'}`}>{value}</p>
      <p className="text-muted text-[0.6rem] uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  )
}

function BarChart({ bars, period, sel, onSel }) {
  if (bars.length === 0) return <p className="text-muted text-sm text-center py-6">Aucune donnée.</p>
  const max = Math.max(...bars.map(b => b.tips), 1)
  const W = 300, H = 130, PB = 18
  const gap = 6
  const bw = (W - gap * (bars.length - 1)) / bars.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 130 }}>
      {bars.map((b, i) => {
        const bh = (b.tips / max) * (H - PB - 14)
        const x = i * (bw + gap)
        const y = H - PB - bh
        const active = sel === i
        return (
          <g key={b.key} onClick={() => onSel(active ? null : i)} style={{ cursor: 'pointer' }}>
            <rect x={x} y={0} width={bw} height={H - PB} fill="transparent" />
            <rect x={x} y={y} width={bw} height={Math.max(bh, 1)} rx="3"
              fill={active ? '#E8B14C' : 'rgba(232,177,76,0.55)'} />
            {b.tips > 0 && <text x={x + bw / 2} y={y - 4} textAnchor="middle" fill="#E8B14C" fontSize="8">{Math.round(b.tips)}</text>}
            <text x={x + bw / 2} y={H - 5} textAnchor="middle" fill="#7C8499" fontSize="8">{barLabel(b.key, period)}</text>
          </g>
        )
      })}
    </svg>
  )
}
