import { supabase } from './supabase'
import { db } from './db'
import { recompute } from './parseShift'

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
  if (navigator.onLine) {
    const { error } = await supabase.from('missions').delete().eq('id', id)
    if (error) {
      console.error('Échec suppression mission', id, error.message)
      await db.missions.update(id, { syncStatus: 'pending-delete' })
      return
    }
    await db.missions.delete(id)
    return
  }
  // Hors ligne : on marque toujours la suppression pour la propager au retour du réseau, même si
  // la ligne locale est 'pending'/'error' (donc potentiellement déjà synchronisée avant une édition
  // hors ligne) — un DELETE sur un id jamais synchronisé est un no-op côté serveur, donc sans risque.
  await db.missions.update(id, { syncStatus: 'pending-delete' })
}

let flushingMissions = null
let rerunMissionsFlush = false
export async function flush() {
  if (flushingMissions) {
    rerunMissionsFlush = true
    return flushingMissions
  }
  flushingMissions = (async () => {
    do {
      rerunMissionsFlush = false
      await flushMissionsNow()
    } while (rerunMissionsFlush)
  })()
  try {
    await flushingMissions
  } finally {
    flushingMissions = null
  }
}

async function flushMissionsNow() {
  if (!navigator.onLine) return
  const pending = await db.missions.where('syncStatus').anyOf('pending', 'error', 'pending-delete').toArray()
  for (const m of pending) {
    if (m.syncStatus === 'pending-delete') {
      const { error } = await supabase.from('missions').delete().eq('id', m.id)
      if (error) console.error('Échec suppression différée', m.id, error.message)
      else await db.missions.delete(m.id)
      continue
    }
    const { error } = await supabase.from('missions').upsert(toPayload(m))
    if (error) {
      console.error('Échec sync mission', m.booking_ref, error.message)
      await db.missions.update(m.id, { syncStatus: 'error', syncError: error.message })
    } else {
      // Ne marquer 'synced' que si la ligne n'a pas été réécrite (édition concurrente) depuis la lecture ci-dessus.
      const current = await db.missions.get(m.id)
      if (current && current.updated_at === m.updated_at) {
        await db.missions.update(m.id, { syncStatus: 'synced', syncError: null })
      }
    }
  }
}

export async function pullFromServer() {
  if (!navigator.onLine) return
  const { data, error } = await supabase.from('missions').select('*')
  if (error || !data) return
  const serverIds = new Set(data.map(row => row.id))
  await db.transaction('rw', db.missions, async () => {
    for (const row of data) {
      const local = await db.missions.get(row.id)
      if (local?.syncStatus === 'pending' || local?.syncStatus === 'error' || local?.syncStatus === 'pending-delete') continue // ne pas écraser un write local non synchronisé
      await db.missions.put({ ...row, syncStatus: 'synced' })
    }
    const synced = await db.missions.where('syncStatus').equals('synced').toArray()
    for (const m of synced) {
      if (!serverIds.has(m.id)) await db.missions.delete(m.id) // supprimée à distance (autre device/onglet)
    }
  })
}

export async function loadAll() {
  const all = await db.missions.orderBy('intervention_date').reverse().toArray()
  return all.filter(m => m.syncStatus !== 'pending-delete')
}

let onlineListenerAttached = false
export function initSync() {
  if (!onlineListenerAttached) {
    onlineListenerAttached = true
    window.addEventListener('online', async () => {
      await flush(); await flushShifts()
      await pullFromServer(); await pullShifts()
    })
  }
  flush()
  flushShifts()
  pullFromServer()
  pullShifts()
}

const SHIFT_COLUMNS = ['id', 'shift_date', 'start_min', 'end_min', 'hours', 'overtime_hours', 'is_day_off', 'night_hours', 'night_overtime_hours', 'created_at', 'updated_at']

function toShiftPayload(s) {
  const p = {}
  for (const k of SHIFT_COLUMNS) if (s[k] !== undefined) p[k] = s[k]
  return p
}

export async function saveShift(shift) {
  const now = new Date().toISOString()
  const record = { ...shift, created_at: shift.created_at ?? now, updated_at: now, syncStatus: 'pending' }
  await db.shifts.put(record)
  flushShifts()
  return record
}

export async function deleteShift(id) {
  if (navigator.onLine) {
    const { error } = await supabase.from('work_shifts').delete().eq('id', id)
    if (error) {
      console.error('Échec suppression shift', id, error.message)
      await db.shifts.update(id, { syncStatus: 'pending-delete' })
      return
    }
    await db.shifts.delete(id)
    return
  }
  // Hors ligne : voir le commentaire équivalent dans deleteMission.
  await db.shifts.update(id, { syncStatus: 'pending-delete' })
}

let flushingShifts = null
let rerunShiftsFlush = false
export async function flushShifts() {
  if (flushingShifts) {
    rerunShiftsFlush = true
    return flushingShifts
  }
  flushingShifts = (async () => {
    do {
      rerunShiftsFlush = false
      await flushShiftsNow()
    } while (rerunShiftsFlush)
  })()
  try {
    await flushingShifts
  } finally {
    flushingShifts = null
  }
}

async function flushShiftsNow() {
  if (!navigator.onLine) return
  const pending = await db.shifts.where('syncStatus').anyOf('pending', 'error', 'pending-delete').toArray()
  for (const s of pending) {
    if (s.syncStatus === 'pending-delete') {
      const { error } = await supabase.from('work_shifts').delete().eq('id', s.id)
      if (error) console.error('Échec suppression différée', s.id, error.message)
      else await db.shifts.delete(s.id)
      continue
    }
    // Auto-réparation : une ligne legacy avec start_min/end_min manquant pouvait produire un
    // hours=NaN, qui devient `null` en JSON et se fait rejeter par la contrainte NOT NULL de
    // Postgres, bloquant la ligne en 'error' pour toujours (le flush ne fait que renvoyer ce qui
    // est déjà en Dexie, sans recalcul). On recalcule ici avant l'envoi si hours n'est pas fini.
    let payloadSource = s
    if (!Number.isFinite(Number(s.hours))) {
      payloadSource = { ...s, ...recompute(s, s.is_day_off) }
      await db.shifts.update(s.id, recompute(s, s.is_day_off))
    }
    const { error } = await supabase.from('work_shifts').upsert(toShiftPayload(payloadSource))
    if (error) {
      console.error('Échec sync shift', s.shift_date, error.message)
      await db.shifts.update(s.id, { syncStatus: 'error', syncError: error.message })
    } else {
      const current = await db.shifts.get(s.id)
      if (current && current.updated_at === s.updated_at) {
        await db.shifts.update(s.id, { syncStatus: 'synced', syncError: null })
      }
    }
  }
}

export async function pullShifts() {
  if (!navigator.onLine) return
  const { data, error } = await supabase.from('work_shifts').select('*')
  if (error || !data) return
  const serverIds = new Set(data.map(row => row.id))
  await db.transaction('rw', db.shifts, async () => {
    for (const row of data) {
      const local = await db.shifts.get(row.id)
      if (local?.syncStatus === 'pending' || local?.syncStatus === 'error' || local?.syncStatus === 'pending-delete') continue
      await db.shifts.put({ ...row, syncStatus: 'synced' })
    }
    const synced = await db.shifts.where('syncStatus').equals('synced').toArray()
    for (const s of synced) {
      if (!serverIds.has(s.id)) await db.shifts.delete(s.id)
    }
  })
}

export async function loadShifts() {
  const all = await db.shifts.orderBy('shift_date').reverse().toArray()
  return all.filter(s => s.syncStatus !== 'pending-delete')
}
