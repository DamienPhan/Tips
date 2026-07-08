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
export const SHIFT_TABLE_HEAD = ['Date', 'Jour', 'Horaires', 'Durée', 'Sup', 'OFF trav.', 'Nuit', 'Sup nuit']

export function shiftRowCells(s) {
  return [
    s.shift_date,
    dayName(s.shift_date),
    isRestDay(s) ? 'OFF' : `${fmtClock(s.start_min)} – ${fmtClock(s.end_min)}`,
    fmtHours(s.hours),
    fmtHours(s.is_day_off ? 0 : s.overtime_hours),
    fmtHours(s.is_day_off ? s.overtime_hours : 0),
    fmtHours(s.night_hours),
    fmtHours(s.night_overtime_hours)
  ]
}

// Ligne de totaux du tableau détail des heures — mêmes colonnes que shiftRowCells(), somme des
// heures de chaque colonne numérique (Durée/Sup/OFF trav./Nuit/Sup nuit) sur tous les shifts du mois.
export function shiftTotalsRow(rows) {
  const sum = key => rows.reduce((acc, s) => acc + Number(s[key] || 0), 0)
  const sumOvertime = rows.reduce((acc, s) => acc + (s.is_day_off ? 0 : Number(s.overtime_hours || 0)), 0)
  const sumOffWorked = rows.reduce((acc, s) => acc + (s.is_day_off ? Number(s.overtime_hours || 0) : 0), 0)
  return ['', '', 'Total', fmtHours(sum('hours')), fmtHours(sumOvertime), fmtHours(sumOffWorked), fmtHours(sum('night_hours')), fmtHours(sum('night_overtime_hours'))]
}
