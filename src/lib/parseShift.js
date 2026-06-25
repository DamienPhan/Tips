export const BASE_SHIFT_MIN = 510   // 8h30

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

// Minutes supplémentaires : 100% si OFF, sinon au-delà de 8h30.
export function overtimeMin(workedMinutes, isDayOff) {
  if (isDayOff) return workedMinutes
  return Math.max(0, workedMinutes - BASE_SHIFT_MIN)
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
    out.push({
      shift_date: normDate(d, mo),
      start_min: start,
      end_min: end % (24 * 60),
      hours: worked / 60,                              // valeur exacte (pas d'arrondi destructif)
      is_day_off: isDayOff,
      overtime_hours: overtimeMin(worked, isDayOff) / 60
    })
  }
  return out
}

// Recalcule overtime_hours pour un shift existant (toggle OFF / édition horaires).
export function recompute(shift, isDayOff) {
  const w = workedMin(shift)
  return {
    hours: w / 60,
    overtime_hours: overtimeMin(w, isDayOff) / 60,
    is_day_off: isDayOff
  }
}

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
