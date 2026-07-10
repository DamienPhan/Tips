import { BASE_SHIFT_MIN, NORMAL_SHIFT_MIN } from './parseShift'

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

// Clôture de paie de l'employeur : SEULES les heures sup et les heures d'un jour OFF travaillé
// comptées jusqu'au 25 du mois inclus tombent dans le bulletin du mois en cours, celles du 26 à la
// fin du mois basculent sur le bulletin du mois suivant — vérifié auprès de l'utilisateur, les
// heures normales et les heures de nuit restent sur le mois calendaire réel du shift, seules les
// heures majorées (sup/jour OFF) suivent cette coupure administrative.
function payrollCutoffMonthKey(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number)
  if (d <= 25) return `${y}-${String(mo).padStart(2, '0')}`
  const ny = mo === 12 ? y + 1 : y
  const nmo = mo === 12 ? 1 : mo + 1
  return `${ny}-${String(nmo).padStart(2, '0')}`
}

// Regroupe des shifts par mois avec les totaux agrégés — utilisé par payroll.js (simulation de
// paie, exports Excel/PDF). Isolé dans son propre module (pur, sans dépendance à xlsx/jspdf) pour
// ne pas forcer ces libs dans le bundle principal.
//
// Deux regroupements différents cohabitent, par champ (voir payrollCutoffMonthKey ci-dessus) :
// - `rows` (relevé jour par jour) et les heures normales/de nuit du total : mois calendaire réel.
// - les heures sup et les heures de jour OFF travaillé du total : mois de paie (coupure au 25).
// Un shift daté du 27 juin par ex. apparaît dans le relevé de juin avec ses heures normales, mais
// sa part d'heures sup rejoint le total du bulletin de juillet, pas celui de juin.
// `total.overtimeCarriedIn` isole justement cette part reportée (sous-ensemble de `total.overtime`,
// pas un total à part) — sert à l'affichage informatif de payrollRows() (voir payroll.js) et,
// avec les shifts sources eux-mêmes (`carriedInRows` ci-dessous), à les faire apparaître dans le
// tableau "Détail des heures" du mois de paie où leurs heures sup sont effectivement comptées,
// pas seulement dans celui du mois calendaire où ils sont datés.
export function monthlyDetail(shifts) {
  const calendarMap = new Map() // mois calendaire -> shifts (relevé, heures normales/nuit)
  const cutoffMap = new Map()   // mois de paie -> { overtime, overtimeCarriedIn, offWorked, carriedInRows }

  for (const s of shifts) {
    if (!s.shift_date) continue // ligne corrompue (date manquante) : ignorée plutôt que de faire échouer tout l'export
    const calKey = s.shift_date.slice(0, 7)
    if (!calendarMap.has(calKey)) calendarMap.set(calKey, [])
    calendarMap.get(calKey).push(s)

    const cutKey = payrollCutoffMonthKey(s.shift_date)
    if (!cutoffMap.has(cutKey)) cutoffMap.set(cutKey, { overtime: 0, overtimeCarriedIn: 0, offWorked: 0, carriedInRows: [] })
    const bucket = cutoffMap.get(cutKey)
    const otHours = Number(s.overtime_hours || 0)
    if (s.is_day_off) {
      bucket.offWorked += otHours
    } else {
      bucket.overtime += otHours
      // cutKey ne matche le mois calendaire du shift que pour les jours 1-25 (voir
      // payrollCutoffMonthKey) : si les deux diffèrent, ce shift est daté du 26-fin du mois
      // calendaire précédent et sa part sup est reportée dans le bulletin de cutKey — on isole
      // ce sous-total pour l'afficher séparément (voir total.overtimeCarriedIn plus bas), et on
      // garde le shift source pour l'afficher dans le relevé "Détail des heures" du mois de paie.
      if (cutKey !== calKey && otHours > 0) {
        bucket.overtimeCarriedIn += otHours
        bucket.carriedInRows.push(s)
      }
    }
  }

  const keys = new Set([...calendarMap.keys(), ...cutoffMap.keys()])
  return [...keys].sort().map(key => {
    const [y, mo] = key.split('-')
    const rows = (calendarMap.get(key) || []).slice().sort((a, b) => (a.shift_date < b.shift_date ? -1 : 1))
    // Heures normales = un forfait fixe de 7h30 (NORMAL_SHIFT_MIN) par jour travaillé, pas le brut
    // moins la part sup — vérifié contre le relevé réel de l'utilisateur. Un jour OFF travaillé ne
    // compte pas du tout ici : ses heures sont entièrement à part (prime jour OFF, voir payroll.js).
    const baseHours = rows.reduce((sum, s) => {
      if (s.is_day_off) return sum
      const workedMin = Number(s.hours || 0) * 60
      const normalMin = Math.max(0, Math.min(workedMin, BASE_SHIFT_MIN) - (BASE_SHIFT_MIN - NORMAL_SHIFT_MIN))
      return sum + normalMin / 60
    }, 0)
    const night = rows.reduce((sum, s) => sum + Number(s.night_hours || 0), 0)
    const nightOvertime = rows.reduce((sum, s) => sum + Number(s.night_overtime_hours || 0), 0)
    const cutoff = cutoffMap.get(key) || { overtime: 0, overtimeCarriedIn: 0, offWorked: 0, carriedInRows: [] }
    const carriedInRows = cutoff.carriedInRows.slice().sort((a, b) => (a.shift_date < b.shift_date ? -1 : 1))
    return {
      key,
      label: `${MONTHS[+mo - 1]} ${y}`,
      sheet: `${MONTHS[+mo - 1].slice(0, 4)} ${y}`,
      rows,
      carriedInRows,
      total: { baseHours, overtime: cutoff.overtime, overtimeCarriedIn: cutoff.overtimeCarriedIn, offWorked: cutoff.offWorked, night, nightOvertime }
    }
  })
}
