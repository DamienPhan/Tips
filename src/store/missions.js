import { create } from 'zustand'
import {
  saveMission, deleteMission, loadAll, pullFromServer,
  saveShift, deleteShift, loadShifts, pullShifts,
  flush, flushShifts
} from '../lib/sync'

export const useMissions = create((set, get) => ({
  missions: [],
  shifts: [],
  loading: true,

  init: async () => {
    set({ missions: await loadAll(), shifts: await loadShifts(), loading: false })
    // Flush avant de puller : sinon une écriture locale en attente peut se faire écraser par
    // une lecture serveur périmée au moment où l'app retrouve la connexion (cas le plus courant
    // d'ouverture de l'app après une session hors-ligne).
    await flush()
    await flushShifts()
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

  // Import en masse (ImportModal, bouton +) : un shift importé pour une date déjà présente
  // remplace l'existant (même id, données écrasées) plutôt que de créer un doublon — repasser
  // un relevé corrigé pour une période déjà saisie ne doit pas dupliquer les jours communs.
  // get().shifts est relu à chaque itération pour que deux dates identiques dans le même import
  // (cas déjà géré : le second écrase le premier) et un shift tout juste créé dans cette même
  // boucle soient visibles aux itérations suivantes.
  addShifts: async (shifts) => {
    let count = 0
    for (const s of shifts) {
      const existing = get().shifts.find(x => x.shift_date === s.shift_date)
      const record = existing
        ? await saveShift({ ...existing, ...s, id: existing.id })
        : await saveShift({ ...s, id: crypto.randomUUID() })
      set({
        shifts: existing
          ? get().shifts.map(x => x.id === record.id ? record : x)
          : [record, ...get().shifts]
      })
      count++
    }
    return count
  },

  updateShift: async (shift) => {
    const record = await saveShift(shift)
    set({ shifts: get().shifts.map(s => s.id === record.id ? record : s) })
  },

  removeShift: async (id) => {
    await deleteShift(id)
    set({ shifts: get().shifts.filter(s => s.id !== id) })
  }
}))
