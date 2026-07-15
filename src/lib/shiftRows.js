import { isRestDay, fmtHours } from './parseShift'
import { parseLocal } from './date'

const DOW = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function fmtClock(min) {
  const n = Number(min)
  if (!Number.isFinite(n)) return '—'
  const h = Math.floor(n / 60) % 24
  const m = ((n % 60) + 60) % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

function dayName(dateStr) {
  if (!dateStr) return '—'
  return DOW[parseLocal(dateStr).getDay()]
}

// Détail jour par jour d'un mois de shifts — utilisé par le relevé d'heures et le PDF de paie.
// Pas de colonne "Sup nuit" (heures sup ET de nuit à la fois) : trop de catégories qui se chevauchent
// avec Sup/Nuit rendaient le tableau confus, et cette valeur n'est de toute façon jamais utilisée
// dans le calcul de paie (retirée sur demande).
export const SHIFT_TABLE_HEAD = ['Date', 'Jour', 'Horaires', 'Durée', 'Sup', 'OFF trav.', 'Nuit']

export function shiftRowCells(s) {
  return [
    s.shift_date,
    dayName(s.shift_date),
    isRestDay(s) ? 'OFF' : `${fmtClock(s.start_min)} – ${fmtClock(s.end_min)}`,
    fmtHours(s.hours),
    fmtHours(s.is_day_off ? 0 : s.overtime_hours),
    fmtHours(s.is_day_off ? s.overtime_hours : 0),
    fmtHours(s.night_hours)
  ]
}

// Ligne de totaux du tableau détail des heures — mêmes colonnes que shiftRowCells().
// Durée ne suit jamais la coupure de paie (voir monthlyDetail.js) : sommée sur `calendarRows`, le
// mois calendaire complet (y compris les shifts du 26-fin dont la part sup/jour OFF/nuit est
// reportée au mois suivant — leur durée reste comptée ce mois-ci). Sup/OFF trav./Nuit suivent au
// contraire la coupure : sommées sur `cutoffRows`, l'ensemble exact des shifts dont la majoration
// est comptée dans le bulletin de CE mois (les shifts propres non reportés + les shifts reportés du
// mois précédent) — un ensemble différent de `calendarRows` dès qu'il y a un report dans un sens ou
// dans l'autre. Les deux ensembles sont construits par l'appelant (exportPayroll.js, via
// `rows`/`carriedInRows`/`carriedOutRows` de monthlyDetail()) plutôt que recalculés ici, pour que ce
// total reste garanti égal à la somme des lignes effectivement affichées dans le tableau — un total
// imposé depuis ailleurs (ex. les totaux de computeMonthPayroll()) peut diverger silencieusement des
// lignes visibles dès qu'un shift est reporté (bug trouvé en review).
export function shiftTotalsRow(calendarRows, cutoffRows) {
  const sumCal = key => calendarRows.reduce((acc, s) => acc + Number(s[key] || 0), 0)
  const sumOvertime = cutoffRows.reduce((acc, s) => acc + (s.is_day_off ? 0 : Number(s.overtime_hours || 0)), 0)
  const sumOffWorked = cutoffRows.reduce((acc, s) => acc + (s.is_day_off ? Number(s.overtime_hours || 0) : 0), 0)
  const sumNight = cutoffRows.reduce((acc, s) => acc + Number(s.night_hours || 0), 0)
  return ['', '', 'Total', fmtHours(sumCal('hours')), fmtHours(sumOvertime), fmtHours(sumOffWorked), fmtHours(sumNight)]
}
