import { parseReports, BOOKING_FIELD_RE } from './parseReport'
import { parseShifts, SHIFT_LINE_RE } from './parseShift'

// Détecte le type de contenu collé et renvoie {type, items}.
export function parseImport(text) {
  const t = text.trim()
  if (BOOKING_FIELD_RE.test(t)) {
    return { type: 'missions', items: parseReports(t) }
  }
  if (SHIFT_LINE_RE.test(t)) {
    return { type: 'shifts', items: parseShifts(t) }
  }
  return { type: 'unknown', items: [] }
}
