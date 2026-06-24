import { supabase } from './supabase'
import { db } from './db'

const COLUMNS = [
  'id', 'intervention_date', 'booking_ref', 'client_name', 'service_type',
  'flight_code', 'terminal', 'pax_count', 'bags_standard', 'bags_oversized',
  'animal_crates', 'meeting_point', 'drop_point', 'has_issue',
  'issue_description', 'satisfaction', 'tip_amount', 'created_at', 'updated_at'
]

function toPayload(m) {
  const p = {}
  for (const k of COLUMNS) if (m[k] !== undefined) p[k] = m[k]
  return p
}

export async function saveMission(mission) {
  const now = new Date().toISOString()
  const record = {
    ...mission,
    created_at: mission.created_at ?? now,
    updated_at: now,
    syncStatus: 'pending'
  }
  await db.missions.put(record)
  flush()
  return record
}

export async function deleteMission(id) {
  await db.missions.delete(id)
  if (navigator.onLine) await supabase.from('missions').delete().eq('id', id)
}

export async function flush() {
  if (!navigator.onLine) return
  const pending = await db.missions.where('syncStatus').equals('pending').toArray()
  for (const m of pending) {
    const { error } = await supabase.from('missions').upsert(toPayload(m))
    if (!error) await db.missions.update(m.id, { syncStatus: 'synced' })
  }
}

export async function pullFromServer() {
  if (!navigator.onLine) return
  const { data, error } = await supabase.from('missions').select('*')
  if (error || !data) return
  await db.transaction('rw', db.missions, async () => {
    for (const row of data) {
      const local = await db.missions.get(row.id)
      if (local?.syncStatus === 'pending') continue // ne pas écraser un write local non synchronisé
      await db.missions.put({ ...row, syncStatus: 'synced' })
    }
  })
}

export async function loadAll() {
  return db.missions.orderBy('intervention_date').reverse().toArray()
}

export function initSync() {
  window.addEventListener('online', flush)
  flush()
  pullFromServer()
}
