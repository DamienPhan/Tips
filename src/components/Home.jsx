import { useState, useMemo } from 'react'
import { useMissions } from '../store/missions'
import { summary } from '../lib/summary'
import { revenueBars, serviceBreakdown, dailyAverage, barLabel } from '../lib/charts'
import { currentMonthTips, DISPATCH_RATE } from '../lib/dispatch'
import { fmtHours } from '../lib/parseShift'
import { parseLocal } from '../lib/date'
import { eur, MONTHS } from '../lib/format'

const PERIODS = [['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']]
const SERVICE = [['ARR', 'Arrivée', '#E8B14C'], ['DEP', 'Départ', '#5DCAA5'], ['TRANSIT', 'Transit', '#7C8499']]

function Amt({ revealed, onToggle, blur = 6, className = '', children }) {
  const activate = () => onToggle()
  const onKeyDown = e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() }
  }
  return (
    <span onClick={activate} onKeyDown={onKeyDown} role="button" tabIndex={0}
      className={`transition-[filter] duration-200 cursor-pointer ${revealed ? '' : 'select-none'} ${className}`}
      style={{ filter: revealed ? 'none' : `blur(${blur}px)` }}>
      {children}
    </span>
  )
}

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
  return { year: date.getUTCFullYear(), week }
}

function periodKey(period, d) {
  if (period === 'year') return String(d.getFullYear())
  if (period === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const { year, week } = isoWeek(d)
  return `${year}-S${String(week).padStart(2, '0')}`
}

function periodLabel(period, d) {
  if (period === 'year') return String(d.getFullYear())
  if (period === 'month') return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  const { year, week } = isoWeek(d)
  return `Semaine ${week} · ${year}`
}

function shiftRefDate(period, d, delta) {
  if (period === 'week') {
    const next = new Date(d)
    next.setDate(next.getDate() + delta * 7)
    return next
  }
  const day = d.getDate()
  const year = d.getFullYear() + (period === 'year' ? delta : 0)
  const month = d.getMonth() + (period === 'month' ? delta : 0)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, daysInMonth))
}

export default function Home() {
  const missions = useMissions(s => s.missions)
  const shifts = useMissions(s => s.shifts)
  const [period, setPeriod] = useState('month')
  const [sel, setSel] = useState(null)
  const [refDate, setRefDate] = useState(new Date())
  const [revealed, setRevealed] = useState(false)

  const sum = summary(missions, shifts, period, refDate)
  const bars = revenueBars(missions, period)
  const svc = serviceBreakdown(missions)
  const monthMissions = useMemo(() => missions.filter(m => {
    const d = parseLocal(m.intervention_date)
    return d.getFullYear() === refDate.getFullYear() && d.getMonth() === refDate.getMonth()
  }), [missions, refDate])
  const avg = dailyAverage(monthMissions)
  const [whole, cents] = eur(sum.tips).split(',')
  const canGoNext = periodKey(period, refDate) !== periodKey(period, new Date())

  const changePeriod = (k) => { setPeriod(k); setSel(null); setRefDate(new Date()) }
  const goPrev = () => setRefDate(d => shiftRefDate(period, d, -1))
  const goNext = () => canGoNext && setRefDate(d => shiftRefDate(period, d, 1))
  const toggleRevealed = () => setRevealed(r => !r)

  return (
    <div className="px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-36">
      <div className="flex gap-1 mb-5 bg-surface rounded-xl p-1">
        {PERIODS.map(([k, lbl]) => (
          <button key={k} onClick={() => changePeriod(k)} aria-current={period === k ? 'true' : undefined}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${period === k ? 'bg-amber text-night' : 'text-muted'}`}>
            {lbl}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-1">
        <p className="text-muted text-[0.7rem] uppercase tracking-[0.2em]">Gains totaux</p>
        <div className="flex items-center gap-1">
          <button onClick={goPrev} aria-label="Période précédente" className="text-muted active:text-amber px-1.5 py-0.5 text-sm">‹</button>
          <span className="text-muted text-[0.7rem] tnum min-w-[6rem] text-center">{periodLabel(period, refDate)}</span>
          <button onClick={goNext} disabled={!canGoNext} aria-label="Période suivante"
            className="text-muted active:text-amber px-1.5 py-0.5 text-sm disabled:opacity-30">›</button>
        </div>
      </div>
      <button onClick={toggleRevealed} aria-label={revealed ? 'Masquer le montant' : 'Afficher le montant'}
        className={`flex items-baseline gap-1 text-left ${revealed ? '' : 'select-none'}`}>
        <span className="tnum font-display font-bold text-amber leading-none transition-[filter] duration-200"
          style={{ fontSize: 'clamp(2.75rem,16vw,4rem)', filter: revealed ? 'none' : 'blur(14px)' }}>{whole}</span>
        <span className="tnum font-display font-bold text-amber/80 text-3xl transition-[filter] duration-200"
          style={{ filter: revealed ? 'none' : 'blur(10px)' }}>,{cents}</span>
        <span className="font-display text-amber/40 text-2xl ml-1">€</span>
      </button>
      <p className={`text-muted/60 text-[0.65rem] mb-4 transition-opacity ${revealed ? 'opacity-0' : 'opacity-100'}`}>
        Touche le montant pour l'afficher
      </p>

      <div className="grid grid-cols-3 gap-2 mb-2">
        <Stat label="Missions" value={sum.missionCount} />
        <Stat label="Heures" value={fmtHours(sum.hours)} />
        <Stat label="Sup" value={fmtHours(sum.overtime)} accent={sum.overtime > 0} />
      </div>
      {sum.offWorked > 0 && (
        <div className="grid grid-cols-1 gap-2 mb-2">
          <Stat label="Heures travaillées (OFF)" value={fmtHours(sum.offWorked)} accent />
        </div>
      )}
      {sum.night > 0 && (
        <div className="grid grid-cols-1 gap-2 mb-6">
          <Stat label="Heures de nuit" value={fmtHours(sum.night)} />
        </div>
      )}
      {!(sum.night > 0) && <div className="mb-6" />}

      <section className="bg-surface rounded-2xl p-4 mb-4">
        <h3 className="font-medium text-sm mb-3">Revenus</h3>
        <BarChart bars={bars} period={period} sel={sel} onSel={setSel} revealed={revealed} />
        {sel != null && bars[sel] && (
          <div className="mt-3 bg-night rounded-xl px-3 py-2.5 flex justify-between items-center">
            <span className="text-sm text-muted">{barLabel(bars[sel].key, period)}</span>
            <span className="text-sm">
              <Amt revealed={revealed} onToggle={toggleRevealed} className="tnum font-display text-amber font-semibold">{eur(bars[sel].tips, 0)} €</Amt>
              {' '}· {bars[sel].count} mission{bars[sel].count > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </section>

      <section className="bg-surface rounded-2xl p-4 mb-4">
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="font-medium text-sm">Moyenne par jour travaillé</h3>
          <span className="text-muted text-xs">{MONTHS[refDate.getMonth()]} {refDate.getFullYear()}</span>
        </div>
        <div className="flex items-baseline gap-1 mb-2">
          <Amt revealed={revealed} onToggle={toggleRevealed} blur={8} className="tnum font-display font-bold text-amber text-3xl">{eur(avg.avg)}</Amt>
          <span className="font-display text-amber/40 text-lg ml-0.5">€</span>
        </div>
        {avg.days > 0 && (
          <div className="flex gap-4 text-xs text-muted">
            <span>{avg.days} jour{avg.days > 1 ? 's' : ''}</span>
            <span className="text-synced">Max <Amt revealed={revealed} onToggle={toggleRevealed}>{eur(avg.max, 0)} €</Amt></span>
            <span className="text-error/80">Min <Amt revealed={revealed} onToggle={toggleRevealed}>{eur(avg.min, 0)} €</Amt></span>
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

      <DispatchSection missions={missions} revealed={revealed} onToggle={toggleRevealed} />

      <RecalcShiftsSection />
    </div>
  )
}

// Outil de réparation ponctuel : recalcule les heures (hours/overtime_hours/night_hours) de tous
// les shifts dont les champs dérivés ne correspondent plus à recompute() — typiquement des jours
// OFF travaillés enregistrés avant la pause 1h à partir de la 7e heure, ou avant la séparation du
// pool d'heures sup. À retirer une fois que l'app n'a plus de shifts concernés (même convention que
// l'outil équivalent utilisé une fois pour les heures de nuit, voir CLAUDE.md).
function RecalcShiftsSection() {
  const recalcAllShifts = useMissions(s => s.recalcAllShifts)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  const run = async () => {
    setBusy(true)
    try {
      const n = await recalcAllShifts()
      setDone(n)
    } catch (e) {
      console.error('Recalcul des heures échoué', e)
      setDone(`erreur : ${e.message || e}`)
    }
    setBusy(false)
  }

  return (
    <section className="bg-surface rounded-2xl p-4 mt-4">
      <h3 className="font-medium text-sm mb-1">Réparation : recalcul des heures</h3>
      <p className="text-muted text-xs mb-3">Recalcule les heures (dont la pause des jours OFF travaillés) de tous les shifts si un calcul a changé depuis leur saisie.</p>
      <button onClick={run} disabled={busy}
        className="w-full bg-surface-2 text-[#E6E9EF] rounded-xl py-3 text-sm font-medium active:bg-white/10 disabled:opacity-50">
        {busy ? '…' : 'Recalculer les heures'}
      </button>
      {done != null && <p className="text-synced text-xs mt-2">{done} shift(s) corrigé(s).</p>}
    </section>
  )
}

function DispatchSection({ missions, revealed, onToggle }) {
  const r = currentMonthTips(missions)
  return (
    <section className="bg-surface rounded-2xl p-4 mt-4">
      <h3 className="font-medium text-sm mb-1">Partage dispatch</h3>
      <p className="text-muted text-xs mb-3">Total des pourboires du mois en cours et part de {Math.round(DISPATCH_RATE * 100)}% à reverser.</p>
      {r.total === 0 ? (
        <p className="text-muted text-sm text-center py-4">Aucun pourboire enregistré en {r.label.toLowerCase()}.</p>
      ) : (
        <div className="bg-night rounded-xl px-4 py-3">
          <div className="flex items-baseline justify-between mb-2">
            <span className="font-medium text-sm capitalize">{r.label}</span>
            <Amt revealed={revealed} onToggle={onToggle} className="tnum font-display text-amber font-semibold text-lg">
              {eur(r.total)}<span className="text-amber/50 text-sm"> €</span>
            </Amt>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 bg-surface rounded-lg px-3 py-2 text-center">
              <Amt revealed={revealed} onToggle={onToggle} className="tnum font-display text-error text-base block">−{eur(r.dispatch)}</Amt>
              <p className="text-muted text-[0.6rem] uppercase tracking-wide mt-0.5">Dispatch 10%</p>
            </div>
            <div className="flex-1 bg-surface rounded-lg px-3 py-2 text-center">
              <Amt revealed={revealed} onToggle={onToggle} className="tnum font-display text-synced text-base block">{eur(r.net)}</Amt>
              <p className="text-muted text-[0.6rem] uppercase tracking-wide mt-0.5">Net (90%)</p>
            </div>
          </div>
        </div>
      )}
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

function BarChart({ bars, period, sel, onSel, revealed }) {
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
        const toggle = () => onSel(active ? null : i)
        const onKeyDown = e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() }
        }
        return (
          <g key={b.key} onClick={toggle} onKeyDown={onKeyDown} role="button" tabIndex={0}
            aria-label={barLabel(b.key, period)} style={{ cursor: 'pointer' }}>
            <rect x={x} y={0} width={bw} height={H - PB} fill="transparent" />
            <rect x={x} y={y} width={bw} height={Math.max(bh, 1)} rx="3"
              fill={active ? '#E8B14C' : 'rgba(232,177,76,0.55)'} />
            {b.tips > 0 && (
              <text x={x + bw / 2} y={y - 4} textAnchor="middle" fill="#E8B14C" fontSize="8"
                style={{ filter: revealed ? 'none' : 'blur(3px)' }}>{Math.round(b.tips)}</text>
            )}
            <text x={x + bw / 2} y={H - 5} textAnchor="middle" fill="#7C8499" fontSize="8">{barLabel(b.key, period)}</text>
          </g>
        )
      })}
    </svg>
  )
}
