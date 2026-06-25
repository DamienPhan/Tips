import { supabase } from './supabase'
import { db } from './db'

const COLUMNS = [
  'id', 'intervention_date', 'booking_ref', 'client_name', 'greeter',
  'booking_mode', 'service_type', 'flight_code', 'terminal', 'pax_count',
  'bags_standard', 'bags_oversized', 'animal_crates', 'tax_refund',
  'meeting_point', 'drop_point', 'has_issue', 'issue_description',
  'is_no_show', 'porter_count', 'satisfaction', 'tip_amount',
  'created_at', 'updated_at'
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
  window.addEventListener('online', () => { flush(); flushShifts() })
  flush()
  flushShifts()
  pullFromServer()
  pullShifts()
}

const SHIFT_COLUMNS = ['id', 'shift_date', 'start_min', 'end_min', 'hours', 'overtime_hours', 'is_day_off', 'created_at']

function toShiftPayload(s) {
  const p = {}
  for (const k of SHIFT_COLUMNS) if (s[k] !== undefined) p[k] = s[k]
  return p
}

export async function saveShift(shift) {
  const record = { ...shift, created_at: shift.created_at ?? new Date().toISOString(), syncStatus: 'pending' }
  await db.shifts.put(record)
  flushShifts()
  return record
}

export async function deleteShift(id) {
  await db.shifts.delete(id)
  if (navigator.onLine) await supabase.from('work_shifts').delete().eq('id', id)
}

export async function flushShifts() {
  if (!navigator.onLine) return
  const pending = await db.shifts.where('syncStatus').equals('pending').toArray()
  for (const s of pending) {
    const { error } = await supabase.from('work_shifts').upsert(toShiftPayload(s))
    if (!error) await db.shifts.update(s.id, { syncStatus: 'synced' })
  }
}

export async function pullShifts() {
  if (!navigator.onLine) return
  const { data, error } = await supabase.from('work_shifts').select('*')
  if (error || !data) return
  await db.transaction('rw', db.shifts, async () => {
    for (const row of data) {
      const local = await db.shifts.get(row.id)
      if (local?.syncStatus === 'pending') continue
      await db.shifts.put({ ...row, syncStatus: 'synced' })
    }
  })
}

export async function loadShifts() {
  return db.shifts.orderBy('shift_date').reverse().toArray()
}
