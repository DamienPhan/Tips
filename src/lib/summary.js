import { parseLocal } from './date'

function isoWeekKey(dateStr) {
  const d = parseLocal(dateStr)
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-S${String(week).padStart(2, '0')}`
}

// Borne une date dans la période courante (semaine/mois/année) par rapport à aujourd'hui.
function inCurrentPeriod(dateStr, period, ref) {
  const d = parseLocal(dateStr)
  if (period === 'year') return d.getFullYear() === ref.getFullYear()
  if (period === 'month') return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
  return isoWeekKey(dateStr) === isoWeekKey(`${ref.getFullYear()}-${String(ref.getMonth()+1).padStart(2,'0')}-${String(ref.getDate()).padStart(2,'0')}`)
}

export function summary(missions, shifts, period, refDate = new Date()) {
  const ms = missions.filter(m => inCurrentPeriod(m.intervention_date, period, refDate))
  const ss = shifts.filter(s => inCurrentPeriod(s.shift_date, period, refDate))
  const tips = ms.reduce((a, m) => a + Number(m.tip_amount || 0), 0)
  const hours = ss.reduce((a, s) => a + Number(s.hours || 0), 0)
  const overtime = ss.reduce((a, s) => a + Number(s.overtime_hours || 0), 0)
  const night = ss.reduce((a, s) => a + Number(s.night_hours || 0), 0)
  const nightOvertime = ss.reduce((a, s) => a + Number(s.night_overtime_hours || 0), 0)
  return { tips, hours, overtime, night, nightOvertime, missionCount: ms.length, shiftCount: ss.length }
}
