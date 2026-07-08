import { todayLocal } from './date'

// Motif du champ Booking, source unique partagée entre la détection de contenu (parseImport.js),
// le découpage multi-bookings (parseReports ci-dessous) et l'extraction de booking_ref
// (parseReport ci-dessous) — le "#" peut être côté label ("Booking # : 30502", éventuellement collé
// "Booking# :") ou côté valeur ("Booking : #30502", format actuel de l'outil externe) ; ne dupliquer
// ce motif nulle part ailleurs, ces trois usages ont déjà divergé une fois par le passé.
const BOOKING_PATTERN = 'Booking\\s*#?\\s*:\\s*#?\\s*(\\S+)'
export const BOOKING_FIELD_RE = new RegExp(BOOKING_PATTERN, 'i')

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

// Enlève les accents avant comparaison : `'Départ'.toUpperCase()` donne 'DÉPART', qui ne matche
// pas `.startsWith('DEP')` (É ≠ E) — normService() a silencieusement classé tout "Départ" en
// "Arrivée" par défaut jusqu'à ce que ce soit corrigé. normBookingMode() gérait déjà ce même
// problème au cas par cas pour "Pré-booking" (`u.includes('PRE') || u.includes('PRÉ')`) ; les deux
// utilisent maintenant ce helper pour éviter qu'un futur libellé accentué retombe dans le même piège.
function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function normBookingMode(raw) {
  const u = stripAccents(raw).toUpperCase()
  if (u.includes('PRE')) return 'PRE'
  if (u.includes('LIVE')) return 'LIVE'
  return null
}

function normService(raw) {
  const u = stripAccents(raw).toUpperCase()
  if (u.startsWith('ARR')) return 'ARR'
  if (u.startsWith('DEP')) return 'DEP'
  if (u.startsWith('TRANS')) return 'TRANSIT'
  return 'ARR'
}

function isAffirmative(raw) {
  return /^oui|^yes|^o$/i.test(raw.trim())
}

export function parseReports(text) {
  const matches = [...text.matchAll(new RegExp(BOOKING_PATTERN, 'gi'))]
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

  // Pas de `\s*` entre `\?` et le groupe capturé : sinon, quand la section est vide, ce `\s*`
  // (glouton) avale toutes les lignes vides jusqu'au prochain caractère non-blanc — souvent le "5"
  // de "5. Ressources" — ce qui empêche le terminateur `\n\s*\d+\.` de matcher juste après (il lui
  // faut un `\n` en tête), et la capture "déborde" jusqu'à la section suivante. En laissant le `\s*`
  // initial dans le groupe paresseux lui-même, le terminateur peut matcher dès la position de départ
  // quand la section est vide, donnant bien une capture vide.
  const issueBlock = text.match(/probl[eè]me rencontr[eé]\s*\?([\s\S]*?)(?:\n\s*\d+\.|$)/i)
  const issueText = issueBlock ? issueBlock[1].trim() : ''
  const is_no_show = /no\s*show/i.test(issueText)
  const has_issue = issueText.length > 0 && !/^(non|aucun|rien|ras|r\.a\.s|néant|neant|nada)\.?$/i.test(issueText.replace(/\s+/g, ''))

  const satRaw = val(text, 'Satisfaction client').toUpperCase().replace(/[^A-ZÀ-Ü]/g, '')
  const satisfaction = SAT_MAP[satRaw] || null

  return {
    intervention_date: normDate(val(text, 'Date')),
    // BOOKING_FIELD_RE consomme déjà le "#" quel que soit son côté (label ou valeur) avant le
    // groupe capturé ; le strip défensif ne fait que nettoyer un "#" qui aurait quand même filtré
    // (ex. "##"). L'affichage (ImportModal.jsx) préfixe lui-même un "#" devant booking_ref.
    booking_ref: (text.match(BOOKING_FIELD_RE)?.[1] || '').replace(/^#/, ''),
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
