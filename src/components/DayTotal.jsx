import { useMissions } from '../store/missions'

export default function DayTotal() {
  const total = useMissions(s => s.todayTotal())
  const count = useMissions(s => s.todayMissions().length)
  const formatted = total.toFixed(2).replace('.', ',')

  return (
    <div className="px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-5 bg-night sticky top-0 z-10 border-b border-white/5">
      <p className="text-muted text-xs uppercase tracking-[0.2em] mb-1">Pourboires du jour</p>
      <div className="flex items-baseline gap-2">
        <span
          className="tnum font-display font-bold text-amber leading-none"
          style={{ fontSize: 'clamp(2.75rem, 14vw, 4rem)' }}
        >
          {formatted}
        </span>
        <span className="font-display text-amber/70 text-2xl">€</span>
      </div>
      <p className="text-muted text-sm mt-1">
        {count} mission{count > 1 ? 's' : ''} aujourd'hui
      </p>
    </div>
  )
}
