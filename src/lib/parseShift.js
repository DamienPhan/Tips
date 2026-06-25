export const BASE_SHIFT_MIN = 510   // 8h30

function normDate(d, mo) {
  const year = new Date().getFullYear()
  return `${year}-${String(+mo).padStart(2, '0')}-${String(+d).padStart(2, '0')}`
}

function toMinutes(h, m) {
  return (+h) * 60 + (m ? +m : 0)
}

// Calcule les heures sup d'un shift selon qu'il est OFF ou normal.
export function computeOvertime(hours, isDayOff) {
  if (isDayOff) return Math.round(hours * 10) / 10        // 100% en sup
  return Math.max(0, Math.round((hours - BASE_SHIFT_MIN / 60) * 10) / 10)  // au-delà de 8h30
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
    const hours = Math.round(worked / 6) / 10
    const isDayOff = /off/i.test(rest)
    out.push({
      shift_date: normDate(d, mo),
      start_min: start,
      end_min: end,
      hours,
      is_day_off: isDayOff,
      overtime_hours: computeOvertime(hours, isDayOff)
    })
  }
  return out
}

export function fmtMinutes(min) {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export function fmtHours(h) {
  const n = Number(h || 0)
  const whole = Math.floor(n)
  const mins = Math.round((n - whole) * 60)
  return mins ? `${whole}h${String(mins).padStart(2, '0')}` : `${whole}h`
}
