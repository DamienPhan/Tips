import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { initSync } from './lib/sync'
import { useMissions } from './store/missions'
import Auth from './components/Auth'
import DayTotal from './components/DayTotal'
import MissionCard from './components/MissionCard'
import MissionForm from './components/MissionForm'

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [editing, setEditing] = useState(null) // null = fermé, {} = nouveau, {id...} = édition
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
    <div className="min-h-full">
      <DayTotal />

      <main className="px-5 py-4 pb-28">
        {loading && missions.length === 0 && (
          <p className="text-muted text-sm text-center py-12">Chargement…</p>
        )}
        {!loading && missions.length === 0 && (
          <p className="text-muted text-sm text-center py-12">
            Aucune mission. Ajoute ta première intervention.
          </p>
        )}
        {missions.map(m => (
          <MissionCard key={m.id} mission={m} onEdit={setEditing} />
        ))}
      </main>

      <button
        onClick={() => setEditing({})}
        className="fixed right-5 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-20 bg-amber text-night w-14 h-14 rounded-full text-3xl font-light shadow-lg shadow-amber/20 active:scale-95 transition-transform flex items-center justify-center"
        aria-label="Nouvelle mission"
      >
        +
      </button>

      {editing !== null && (
        <MissionForm
          initial={editing.id ? editing : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
