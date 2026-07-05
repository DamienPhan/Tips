const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

// Regroupe des shifts par mois calendaire avec les totaux agrégés — utilisé par payroll.js
// (simulation de paie, exports Excel/PDF). Isolé dans son propre module (pur, sans dépendance
// à xlsx/jspdf) pour ne pas forcer ces libs dans le bundle principal.
export function monthlyDetail(shifts) {
  const map = new Map()
  for (const s of shifts) {
    if (!s.shift_date) continue // ligne corrompue (date manquante) : ignorée plutôt que de faire échouer tout l'export
    const key = s.shift_date.slice(0, 7)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(s)
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, list]) => {
      const [y, mo] = key.split('-')
      const rows = list.slice().sort((a, b) => (a.shift_date < b.shift_date ? -1 : 1))
      // Heures sup "normales" et heures d'un jour OFF travaillé sont gardées séparées ici pour
      // l'affichage/les exports (voir payroll.js pour la fusion utilisée en paie).
      const total = rows.reduce((acc, s) => ({
        hours: acc.hours + Number(s.hours || 0),
        overtime: acc.overtime + (s.is_day_off ? 0 : Number(s.overtime_hours || 0)),
        offWorked: acc.offWorked + (s.is_day_off ? Number(s.overtime_hours || 0) : 0),
        night: acc.night + Number(s.night_hours || 0),
        nightOvertime: acc.nightOvertime + Number(s.night_overtime_hours || 0)
      }), { hours: 0, overtime: 0, offWorked: 0, night: 0, nightOvertime: 0 })
      return { key, label: `${MONTHS[+mo - 1]} ${y}`, sheet: `${MONTHS[+mo - 1].slice(0, 4)} ${y}`, rows, total }
    })
}
