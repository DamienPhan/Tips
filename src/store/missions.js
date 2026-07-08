import { create } from 'zustand'
import { recompute } from '../lib/parseShift'
import {
  saveMission, deleteMission, loadAll, pullFromServer,
  saveShift, deleteShift, loadShifts, pullShifts,
  flush, flushShifts
} from '../lib/sync'

// Un shift dont hours/overtime_hours/night_hours/night_overtime_hours ne correspondent plus à ce
// que recompute() donnerait aujourd'hui (ex. calculé avant l'ajout d'une règle comme les heures de
// nuit) peut rester `synced` indéfiniment : le self-heal de flushShifts() ne retraite que les lignes
// `pending`/`error` avec un `hours` NaN, jamais une ligne déjà synchronisée mais numériquement stale.
const FIELDS_TO_CHECK = ['hours', 'overtime_hours', 'night_hours', 'night_overtime_hours']
function needsRecompute(shift, recomputed) {
  return FIELDS_TO_CHECK.some(k => Math.abs((Number(shift[k]) || 0) - (Number(recomputed[k]) || 0)) > 1 / 120)
}

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

  // Outil de réparation ponctuel : recalcule hours/overtime_hours/night_hours/night_overtime_hours
  // pour TOUS les shifts (contrairement au self-heal de flushShifts(), qui ne touche jamais une
  // ligne déjà `synced`), et ne resauvegarde que ceux dont un champ dérivé a réellement changé.
  recalcAllShifts: async () => {
    let fixed = 0
    // Re-lit get().shifts à chaque itération (pas un instantané figé en tête de boucle) : la
    // boucle est longue (un saveShift() séquentiel par shift stale) et un shift peut être édité
    // ailleurs (ex. Calendar.jsx) pendant qu'elle tourne — travailler sur un instantané périmé
    // écraserait silencieusement cette édition concurrente.
    for (const id of get().shifts.map(s => s.id)) {
      const s = get().shifts.find(x => x.id === id)
      if (!s) continue // supprimé entretemps
      const recomputed = recompute(s, s.is_day_off)
      if (needsRecompute(s, recomputed)) {
        await saveShift({ ...s, ...recomputed })
        fixed++
      }
    }
    set({ shifts: await loadShifts() })
    return fixed
  }
}))
