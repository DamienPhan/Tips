import { todayLocal } from './date'

const SAT_MAP = {
  EXCELLENTE: 'EXCELLENTE', EXCELLENT: 'EXCELLENTE',
  BONNE: 'BONNE', BON: 'BONNE',
  MOYENNE: 'MOYENNE', MOYEN: 'MOYENNE',
  MAUVAISE: 'MAUVAISE', MAUVAIS: 'MAUVAISE'
}

function val(text, label) {
  const re = new RegExp(label + '\\s*:\\s*(.+)', 'i')
  const m = text.match(re)
  return m ? m[1].trim() : ''
}

function intVal(text, label) {
  const v = val(text, label).replace(/\D/g, '')
  return v ? parseInt(v, 10) : 0
}

function normDate(raw) {
  const m = raw.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
  if (!m) return todayLocal()
  const [, d, mo, y] = m
  const year = y ? (y.length === 2 ? 2000 + +y : +y) : new Date().getFullYear()
  return `${year}-${String(+mo).padStart(2, '0')}-${String(+d).padStart(2, '0')}`
}

function normBookingMode(raw) {
  const u = raw.toUpperCase()
  if (u.includes('PRE') || u.includes('PRÉ')) return 'PRE'
  if (u.includes('LIVE')) return 'LIVE'
  return null
}

function normService(raw) {
  const u = raw.toUpperCase()
  if (u.startsWith('ARR')) return 'ARR'
  if (u.startsWith('DEP')) return 'DEP'
  if (u.startsWith('TRANS')) return 'TRANSIT'
  return 'ARR'
}

function isAffirmative(raw) {
  return /^oui|^yes|^o$/i.test(raw.trim())
}

export function parseReports(text) {
  const matches = [...text.matchAll(/Booking\s*#/gi)]
  if (matches.length <= 1) {
    return text.trim() ? [parseReport(text)] : []
  }
  const chunks = []
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    chunks.push(text.slice(start, end))
  }
  return chunks.map(parseReport)
}

export function parseReport(text) {
  const clientRaw = val(text, 'Client')
  let client_name = clientRaw
  let greeter = ''
  const greeterInline = clientRaw.match(/(.*?)\s*-\s*Greeteur\s*:\s*(.+)/i)
  if (greeterInline) {
    client_name = greeterInline[1].trim()
    greeter = greeterInline[2].trim()
  } else {
    greeter = val(text, 'Greeteur')
  }

  const issueBlock = text.match(/probl[eè]me rencontr[eé]\s*\?\s*([\s\S]*?)(?:\n\s*\d+\.|\n5\.|$)/i)
  const issueText = issueBlock ? issueBlock[1].trim() : ''
  const is_no_show = /no\s*show/i.test(issueText)
  const has_issue = issueText.length > 0 && !/^(non|aucun|rien|ras|r\.a\.s|néant|neant|nada)\.?$/i.test(issueText.replace(/\s+/g, ''))

  const satRaw = val(text, 'Satisfaction client').toUpperCase().replace(/[^A-ZÀ-Ü]/g, '')
  const satisfaction = SAT_MAP[satRaw] || null

  return {
    intervention_date: normDate(val(text, 'Date')),
    booking_ref: val(text, 'Booking #') || val(text, 'Booking'),
    client_name,
    greeter,
    booking_mode: normBookingMode(val(text, 'Pré-booking ou Live') || val(text, 'Pre-booking ou Live')),
    service_type: normService(val(text, 'Type de service')),
    flight_code: (val(text, 'Vol - code IATA') || val(text, 'code IATA')).toUpperCase(),
    terminal: val(text, 'Terminal'),
    pax_count: intVal(text, 'Nombre de passagers') || 1,
    bags_standard: intVal(text, 'Nombre de bagages Standard') || intVal(text, 'bagages Standard'),
    bags_oversized: intVal(text, 'Hors format'),
    animal_crates: intVal(text, 'Cage animal'),
    tax_refund: isAffirmative(val(text, 'Détaxe') || val(text, 'Detaxe')),
    meeting_point: val(text, 'Lieu de rencontre'),
    drop_point: val(text, 'Lieu de dépose') || val(text, 'Lieu de depose'),
    has_issue,
    issue_description: has_issue ? issueText : '',
    is_no_show,
    porter_count: intVal(text, 'Nombre de porteurs') || 1,
    satisfaction,
    tip_amount: 0
  }
}
