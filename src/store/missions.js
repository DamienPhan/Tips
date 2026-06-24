import { create } from 'zustand'
import { saveMission, deleteMission, loadAll, pullFromServer } from '../lib/sync'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export const useMissions = create((set, get) => ({
  missions: [],
  loading: true,

  init: async () => {
    const local = await loadAll()
    set({ missions: local, loading: false })
    await pullFromServer()
    set({ missions: await loadAll() })
  },

  add: async (mission) => {
    const record = await saveMission({ ...mission, id: crypto.randomUUID() })
    set({ missions: [record, ...get().missions] })
  },

  update: async (mission) => {
    const record = await saveMission(mission)
    set({ missions: get().missions.map(m => m.id === record.id ? record : m) })
  },

  remove: async (id) => {
    await deleteMission(id)
    set({ missions: get().missions.filter(m => m.id !== id) })
  },

  todayMissions: () => get().missions.filter(m => m.intervention_date === todayISO()),
  todayTotal: () =>
    get().missions
      .filter(m => m.intervention_date === todayISO())
      .reduce((s, m) => s + Number(m.tip_amount || 0), 0)
}))
