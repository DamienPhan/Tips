import { useEffect, useState } from 'react'
import { db } from './db'

export function useSyncStatus(missions, shifts) {
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  useEffect(() => {
    Promise.all([
      db.missions.where('syncStatus').anyOf('pending', 'error', 'pending-delete').count(),
      db.shifts.where('syncStatus').anyOf('pending', 'error', 'pending-delete').count()
    ]).then(([m, s]) => setPending(m + s))
  }, [missions, shifts])

  return { online, pending }
}
