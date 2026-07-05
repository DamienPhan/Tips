import { create } from 'zustand'
import { todayLocal } from '../lib/date'
import { recompute } from '../lib/parseShift'
import {
  saveMission, deleteMission, loadAll, pullFromServer,
  saveShift, deleteShift, loadShifts, pullShifts
} from '../lib/sync'

function todayISO() {
  return todayLocal()
}

export const useMissions = create((set, get) => ({
  missions: [],
  shifts: [],
  loading: true,

  init: async () => {
    set({ missions: await loadAll(), shifts: await loadShifts(), loading: false })
    await pullFromServer()
    await pullShifts()
    set({ missions: await loadAll(), shifts: await loadShifts() })
  },

  add: async (mission) => {
    const record = await saveMission({ ...mission, id: crypto.randomUUID() })
    set({ missions: [record, ...get().missions] })
  },

  addMany: async (missions) => {
    const saved = []
    for (const m of missions) saved.push(await saveMission({ ...m, id: crypto.randomUUID() }))
    set({ missions: [...saved, ...get().missions] })
    return saved.length
  },

  update: async (mission) => {
    const record = await saveMission(mission)
    set({ missions: get().missions.map(m => m.id === record.id ? record : m) })
  },

  remove: async (id) => {
    await deleteMission(id)
    set({ missions: get().missions.filter(m => m.id !== id) })
  },

  addShifts: async (shifts) => {
    const saved = []
    for (const s of shifts) saved.push(await saveShift({ ...s, id: crypto.randomUUID() }))
    set({ shifts: [...saved, ...get().shifts] })
    return saved.length
  },

  updateShift: async (shift) => {
    const record = await saveShift(shift)
    set({ shifts: get().shifts.map(s => s.id === record.id ? record : s) })
  },

  removeShift: async (id) => {
    await deleteShift(id)
    set({ shifts: get().shifts.filter(s => s.id !== id) })
  },

  // Répare ponctuellement les shifts restés bloqués en 'pending'/'error' (typiquement parce que
  // start_min/end_min manquants sur une ligne legacy produisaient un hours=NaN → null, rejeté par
  // la contrainte NOT NULL de Postgres). workedMin() est maintenant défensif (voir parseShift.js) ;
  // ceci recalcule juste ces lignes précises avec la formule corrigée et les remet en synchro.
  repairStuckShifts: async () => {
    const stuck = get().shifts.filter(s => s.syncStatus === 'pending' || s.syncStatus === 'error')
    for (const s of stuck) {
      await saveShift({ ...s, ...recompute(s, s.is_day_off) })
    }
    set({ shifts: await loadShifts() })
    return stuck.length
  },

  todayMissions: () => get().missions.filter(m => m.intervention_date === todayISO()),
  todayTotal: () =>
    get().missions
      .filter(m => m.intervention_date === todayISO())
      .reduce((s, m) => s + Number(m.tip_amount || 0), 0)
}))
