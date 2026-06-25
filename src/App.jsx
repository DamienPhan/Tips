import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { initSync } from './lib/sync'
import { useMissions } from './store/missions'
import Auth from './components/Auth'
import DayTotal from './components/DayTotal'
import MissionCard from './components/MissionCard'
import MissionForm from './components/MissionForm'
import ImportReport from './components/ImportReport'
import Shifts from './components/Shifts'
import Stats from './components/Stats'
import Charts from './components/Charts'

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [editing, setEditing] = useState(null)
  const [importing, setImporting] = useState(false)
  const [shiftsOpen, setShiftsOpen] = useState(false)
  const [tab, setTab] = useState('feed')
  const missions = useMissions(s => s.missions)
  const loading = useMissions(s => s.loading)
  const init = useMissions(s => s.init)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) { initSync(); init() }
  }, [session, init])

  if (!ready) return <div className="min-h-full" />
  if (!session) return <Auth />

  return (
    <div className="mx-auto max-w-[480px]">
      <DayTotal onShifts={() => setShiftsOpen(true)} />

      <main className="px-5 pt-3 pb-40">
        {tab === 'feed' && (
          <>
            {loading && missions.length === 0 && (
              <p className="text-muted text-sm text-center py-12">Chargement…</p>
            )}
            {!loading && missions.length === 0 && (
              <EmptyState onAdd={() => setEditing({})} onImport={() => setImporting(true)} />
            )}
            {missions.map(m => <MissionCard key={m.id} mission={m} onEdit={setEditing} />)}
          </>
        )}
        {tab === 'stats' && <Stats />}
        {tab === 'charts' && <Charts />}
      </main>

      {tab === 'feed' && (
        <div className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-5 bottom-[calc(3.75rem+max(0.5rem,env(safe-area-inset-bottom)))] flex justify-end gap-3 pointer-events-none">
          <button onClick={() => setImporting(true)}
            className="pointer-events-auto bg-surface-2 text-amber h-12 px-5 rounded-full text-sm font-medium active:scale-95 transition-transform">
            Importer
          </button>
          <button onClick={() => setEditing({})}
            className="pointer-events-auto bg-amber text-night w-12 h-12 rounded-full text-2xl font-light active:scale-95 transition-transform flex items-center justify-center"
            aria-label="Nouvelle mission">
            +
          </button>
        </div>
      )}

      <TabBar tab={tab} setTab={setTab} />

      {editing !== null && <MissionForm initial={editing.id ? editing : undefined} onClose={() => setEditing(null)} />}
      {importing && <ImportReport onClose={() => setImporting(false)} />}
      {shiftsOpen && <Shifts onClose={() => setShiftsOpen(false)} />}
    </div>
  )
}

function EmptyState({ onAdd, onImport }) {
  return (
    <div className="flex flex-col items-center text-center px-8 py-16">
      <h2 className="font-medium mb-1.5">Aucune mission</h2>
      <p className="text-muted text-sm mb-6 max-w-[16rem]">
        Colle tes rapports de la journée ou saisis une intervention.
      </p>
      <div className="flex gap-2.5">
        <button onClick={onImport} className="bg-amber text-night font-medium px-5 py-2.5 rounded-xl active:bg-amber/80">
          Importer
        </button>
        <button onClick={onAdd} className="bg-surface text-muted font-medium px-5 py-2.5 rounded-xl active:bg-surface-2">
          Saisie manuelle
        </button>
      </div>
    </div>
  )
}

function TabBar({ tab, setTab }) {
  const base = 'flex-1 py-3.5 text-sm font-medium transition-colors'
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 mx-auto max-w-[480px] bg-night/90 backdrop-blur-md border-t border-white/[0.06] flex pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      <button onClick={() => setTab('feed')} className={`${base} ${tab === 'feed' ? 'text-amber' : 'text-muted'}`}>Missions</button>
      <button onClick={() => setTab('stats')} className={`${base} ${tab === 'stats' ? 'text-amber' : 'text-muted'}`}>Stats</button>
      <button onClick={() => setTab('charts')} className={`${base} ${tab === 'charts' ? 'text-amber' : 'text-muted'}`}>Graphes</button>
    </nav>
  )
}
