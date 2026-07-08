import { parseReports, BOOKING_FIELD_RE } from './parseReport'
import { parseShifts } from './parseShift'

// Détecte le type de contenu collé et renvoie {type, items}.
export function parseImport(text) {
  const t = text.trim()
  if (BOOKING_FIELD_RE.test(t)) {
    return { type: 'missions', items: parseReports(t) }
  }
  if (/\d{1,2}\/\d{1,2}\s*:\s*\d{1,2}h?\d{0,2}\s*-\s*\d{1,2}/.test(t)) {
    return { type: 'shifts', items: parseShifts(t) }
  }
  return { type: 'unknown', items: [] }
}
