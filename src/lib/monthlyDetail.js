const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

// Clôture de paie de l'employeur : les heures travaillées jusqu'au 25 du mois inclus tombent
// dans le bulletin du mois en cours, celles du 26 à la fin du mois basculent sur le bulletin du
// mois suivant (vérifié sur bulletin réel : cumul h.sup très inférieur au total du mois calendaire
// car les shifts après le 25 n'y figurent pas encore). Le mois "payroll" ne correspond donc pas au
// mois calendaire du shift au-delà du 25.
function payrollMonthKey(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number)
  if (d <= 25) return `${y}-${String(mo).padStart(2, '0')}`
  const ny = mo === 12 ? y + 1 : y
  const nmo = mo === 12 ? 1 : mo + 1
  return `${ny}-${String(nmo).padStart(2, '0')}`
}

// Regroupe des shifts par mois de paie (voir payrollMonthKey ci-dessus) avec les totaux agrégés —
// utilisé par payroll.js (simulation de paie, exports Excel/PDF). Isolé dans son propre module
// (pur, sans dépendance à xlsx/jspdf) pour ne pas forcer ces libs dans le bundle principal.
export function monthlyDetail(shifts) {
  const map = new Map()
  for (const s of shifts) {
    if (!s.shift_date) continue // ligne corrompue (date manquante) : ignorée plutôt que de faire échouer tout l'export
    const key = payrollMonthKey(s.shift_date)
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
