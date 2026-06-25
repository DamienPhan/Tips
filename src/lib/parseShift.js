export const BASE_SHIFT_MIN = 510   // 8h30
export const WEEKLY_BASE_HOURS = 35

function normDate(d, mo) {
  const year = new Date().getFullYear()
  return `${year}-${String(+mo).padStart(2, '0')}-${String(+d).padStart(2, '0')}`
}

function toMinutes(h, m) {
  return (+h) * 60 + (m ? +m : 0)
}

export function parseShifts(text) {
  const re = /(\d{1,2})\/(\d{1,2})\s*:\s*(\d{1,2})h(\d{0,2})\s*-\s*(\d{1,2})h(\d{0,2})/gi
  const out = []
  for (const m of text.matchAll(re)) {
    const [, d, mo, h1, m1, h2, m2] = m
    const start = toMinutes(h1, m1)
    let end = toMinutes(h2, m2)
    if (end < start) end += 24 * 60
    const worked = end - start
    const overtime = Math.max(0, worked - BASE_SHIFT_MIN)
    out.push({
      shift_date: normDate(d, mo),
      start_min: start,
      end_min: end,
      hours: Math.round(worked / 6) / 10,
      overtime_hours: Math.round(overtime / 6) / 10
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
