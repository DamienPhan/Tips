import { useEffect, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { supabase } from './lib/supabase'
import { initSync } from './lib/sync'
import { useMissions } from './store/missions'
import { useSyncStatus } from './lib/useOnline'
import Auth from './components/Auth'
import Home from './components/Home'
import Calendar from './components/Calendar'
import MissionsList from './components/MissionsList'
import MissionForm from './components/MissionForm'
import ImportModal from './components/ImportModal'
import PayrollSimulator from './components/PayrollSimulator'
import SyncDetails from './components/SyncDetails'

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState('home')
  const [importing, setImporting] = useState(false)
  const [editing, setEditing] = useState(null)
  const [syncDetails, setSyncDetails] = useState(false)
  const missions = useMissions(s => s.missions)
  const shifts = useMissions(s => s.shifts)
  const init = useMissions(s => s.init)
  const loading = useMissions(s => s.loading)
  const { online, pending } = useSyncStatus(missions, shifts)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (session) { initSync(); init() } }, [session, init])

  // Filet de sécurité pour un refresh/fermeture juste après une saisie pas encore synchronisée
  // (ex. Safari en navigation privée, où l'écriture locale peut ne pas survivre au rechargement) :
  // avertit avant de quitter la page tant qu'il reste des lignes pending/error/pending-delete.
  useEffect(() => {
    const handler = (e) => { if (pending > 0) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [pending])

  if (!ready) return <div className="min-h-full" />
  if (!session) return <Auth />
  if (loading) return <div className="min-h-full" />

  return (
    <div className="mx-auto max-w-[480px] min-h-full">
      <SyncBar online={online} pending={pending} onPendingClick={() => setSyncDetails(true)} />

      {tab === 'home' && <Home />}
      {tab === 'calendar' && <Calendar />}
      {tab === 'missions' && <MissionsList onEdit={setEditing} />}
      {tab === 'paie' && <PayrollSimulator />}

      <div className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-5 bottom-[calc(3.75rem+max(0.5rem,env(safe-area-inset-bottom)))] flex justify-end pointer-events-none">
        <button onClick={() => setImporting(true)}
          className="pointer-events-auto bg-amber text-night w-14 h-14 rounded-full text-3xl font-light shadow-lg shadow-amber/25 active:scale-95 transition-transform flex items-center justify-center"
          aria-label="Ajouter">+</button>
      </div>

      <TabBar tab={tab} setTab={setTab} />

      {importing && <ImportModal onClose={() => setImporting(false)} onManual={() => { setImporting(false); setEditing({}) }} />}
      {editing !== null && <MissionForm initial={editing.id ? editing : undefined} onClose={() => setEditing(null)} />}
      {syncDetails && <SyncDetails onClose={() => setSyncDetails(false)} />}
      <Analytics />
    </div>
  )
}

function SyncBar({ online, pending, onPendingClick }) {
  const logout = () => { if (confirm('Se déconnecter ?')) supabase.auth.signOut() }
  let txt = 'En ligne', cls = 'text-synced'
  if (!online) { txt = 'Hors ligne'; cls = 'text-pending' }
  else if (pending > 0) { txt = `${pending} en attente`; cls = 'text-pending' }
  const StatusTag = pending > 0 ? 'button' : 'span'
  return (
    <div className="sticky top-0 z-20 bg-night/90 backdrop-blur-md px-5 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] flex items-center justify-between border-b border-white/[0.04]">
      <span className="text-muted text-[0.65rem] uppercase tracking-wider">Rapports de mission</span>
      <div className="flex items-center gap-3">
        <StatusTag {...(pending > 0 ? { onClick: onPendingClick } : {})} className={`flex items-center gap-1.5 text-xs ${cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${online && pending === 0 ? 'bg-synced' : 'bg-pending'} ${pending > 0 ? 'animate-pulse' : ''}`} />
          {txt}
        </StatusTag>
        <button onClick={logout} aria-label="Se déconnecter"
          className="text-muted text-[0.65rem] uppercase tracking-wider active:text-amber">
          Déconnexion
        </button>
      </div>
    </div>
  )
}

function TabBar({ tab, setTab }) {
  const items = [['home', 'Accueil'], ['calendar', 'Calendrier'], ['missions', 'Missions'], ['paie', 'Paie']]
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 mx-auto max-w-[480px] bg-night/90 backdrop-blur-md border-t border-white/[0.06] flex pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      {items.map(([k, lbl]) => (
        <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}
          className={`flex-1 py-3.5 text-sm font-medium transition-colors ${tab === k ? 'text-amber' : 'text-muted'}`}>
          {lbl}
        </button>
      ))}
    </nav>
  )
}
