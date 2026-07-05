export const BASE_SHIFT_MIN = 510   // 8h30
export const NIGHT_START = 22 * 60  // 22h00
export const NIGHT_END = 7 * 60     // 07h00

// Une minute absolue (peut dépasser 1440) est-elle en plage nuit 22h-7h ?
function isNight(absMin) {
  const t = ((absMin % 1440) + 1440) % 1440
  return t >= NIGHT_START || t < NIGHT_END
}

// Compte les minutes de nuit sur un intervalle [from, to) de minutes absolues.
function nightMinutesIn(from, to) {
  let count = 0
  for (let t = from; t < to; t++) if (isNight(t)) count++
  return count
}

function normDate(d, mo) {
  const year = new Date().getFullYear()
  return `${year}-${String(+mo).padStart(2, '0')}-${String(+d).padStart(2, '0')}`
}

function toMinutes(h, m) {
  return (+h) * 60 + (m ? +m : 0)
}

// Minutes travaillées d'un shift (gère le passage minuit).
export function workedMin(shift) {
  let end = shift.end_min
  if (end < shift.start_min) end += 24 * 60
  return end - shift.start_min
}

// Minutes supplémentaires réelles (temps effectivement travaillé) : tout le shift si OFF, sinon au-delà de 8h30.
export function overtimeMin(workedMinutes, isDayOff) {
  if (isDayOff) return workedMinutes
  return Math.max(0, workedMinutes - BASE_SHIFT_MIN)
}

// Minutes supplémentaires "payées" : un jour OFF travaillé n'a plus de majoration propre ici —
// ses heures (déjà comptées en intégralité par overtimeMin) sont ensuite traitées comme des
// heures sup normales, majorées uniquement au niveau de la paie mensuelle (voir payroll.js).
export function overtimePayMin(workedMinutes, isDayOff) {
  return overtimeMin(workedMinutes, isDayOff)
}

// Minutes de nuit (22h-7h) d'un shift, et part de nuit dans les heures sup.
// Les heures sup occupent les DERNIÈRES minutes réelles du shift (au-delà de 8h30, ou tout si OFF).
export function nightBreakdown(shift, isDayOff) {
  const worked = workedMin(shift)
  const from = shift.start_min
  const to = shift.start_min + worked
  const nightTotal = nightMinutesIn(from, to)
  const otMin = overtimeMin(worked, isDayOff)
  // les sup occupent la fin du shift : [to - otMin, to)
  const nightOt = otMin > 0 ? nightMinutesIn(to - otMin, to) : 0
  return { night_hours: nightTotal / 60, night_overtime_hours: nightOt / 60 }
}

export function parseShifts(text) {
  const re = /(\d{1,2})\/(\d{1,2})\s*:\s*(\d{1,2})h?(\d{0,2})\s*-\s*(\d{1,2})h?(\d{0,2})([^\n]*)/gi
  const out = []
  for (const m of text.matchAll(re)) {
    const [, d, mo, h1, m1, h2, m2, rest] = m
    const start = toMinutes(h1, m1)
    let end = toMinutes(h2, m2)
    if (end < start) end += 24 * 60
    const worked = end - start
    const isDayOff = /off/i.test(rest)
    const shiftObj = { start_min: start, end_min: end }
    const night = nightBreakdown(shiftObj, isDayOff)
    out.push({
      shift_date: normDate(d, mo),
      start_min: start,
      end_min: end % (24 * 60),
      hours: worked / 60,                              // valeur exacte (pas d'arrondi destructif)
      is_day_off: isDayOff,
      overtime_hours: overtimePayMin(worked, isDayOff) / 60,
      night_hours: night.night_hours,
      night_overtime_hours: night.night_overtime_hours
    })
  }
  return out
}

// Recalcule overtime_hours pour un shift existant (toggle OFF / édition horaires).
export function recompute(shift, isDayOff) {
  const w = workedMin(shift)
  const night = nightBreakdown(shift, isDayOff)
  return {
    hours: w / 60,
    overtime_hours: overtimePayMin(w, isDayOff) / 60,
    is_day_off: isDayOff,
    night_hours: night.night_hours,
    night_overtime_hours: night.night_overtime_hours
  }
}

// Jour OFF non travaillé (is_day_off sans aucune heure), par opposition à un jour OFF travaillé (payé +25%).
export function isRestDay(shift) { return !!shift?.is_day_off && !shift.hours }

// Affiche des heures décimales en "XhMM" sans réarrondi (passe par les minutes).
export function fmtHours(h) {
  const totalMin = Math.round(Number(h || 0) * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`
}

// Heure d'horloge depuis des minutes (start_min/end_min).
export function fmtMinutes(min) {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}
