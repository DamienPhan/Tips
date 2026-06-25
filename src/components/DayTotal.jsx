import { useMissions } from '../store/missions'
import { useSyncStatus } from '../lib/useOnline'
import { supabase } from '../lib/supabase'

export default function DayTotal({ onShifts }) {
  const missions = useMissions(s => s.missions)
  const total = useMissions(s => s.todayTotal())
  const count = useMissions(s => s.todayMissions().length)
  const { online, pending } = useSyncStatus(missions)
  const [whole, cents] = total.toFixed(2).split('.')

  const logout = () => { if (confirm('Se déconnecter ?')) supabase.auth.signOut() }

  return (
    <header className="px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-5">
      <div className="flex items-center justify-between mb-3">
        <button onClick={logout} className="text-muted text-[0.7rem] uppercase tracking-[0.2em] active:text-amber">Pourboires du jour</button>
        <div className="flex items-center gap-2">
          <SyncBadge online={online} pending={pending} />
          <button onClick={onShifts} className="text-muted text-xs bg-surface rounded-full px-3 py-1 active:bg-surface-2">
            Horaires
          </button>
        </div>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="tnum font-display font-bold text-amber leading-none" style={{ fontSize: 'clamp(3rem, 18vw, 4.5rem)' }}>
          {whole}
        </span>
        <span className="tnum font-display font-bold text-amber/80 leading-none text-3xl">,{cents}</span>
        <span className="font-display text-amber/40 text-2xl ml-1">€</span>
      </div>

      <p className="text-muted text-sm mt-2">
        {count === 0 ? 'Aucune mission' : `${count} mission${count > 1 ? 's' : ''}`} aujourd'hui
      </p>
    </header>
  )
}

function SyncBadge({ online, pending }) {
  if (!online) {
    return <Badge color="pending" pulse={false}>Hors ligne{pending > 0 ? ` · ${pending}` : ''}</Badge>
  }
  if (pending > 0) return <Badge color="pending" pulse>{pending} en attente</Badge>
  return <Badge color="synced" pulse={false}>Synchronisé</Badge>
}

function Badge({ color, pulse, children }) {
  const c = color === 'synced' ? 'text-synced bg-synced/10' : 'text-pending bg-pending/10'
  const dot = color === 'synced' ? 'bg-synced' : 'bg-pending'
  return (
    <span className={`flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 ${c}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} ${pulse ? 'animate-pulse' : ''}`} />
      {children}
    </span>
  )
}
