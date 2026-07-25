export const BASE_SHIFT_MIN = 510   // 8h30
// Part "heures normales" d'un jour travaillé pour la paie mensuelle (monthlyDetail.js) : un forfait
// fixe de 7h30, pas "brut moins la part sup". L'écart avec BASE_SHIFT_MIN (1h) correspond à une pause
// non payée implicite déjà absorbée par le seuil de déclenchement des heures sup — vérifié contre le
// relevé réel de l'utilisateur (Normal=7h30 pour chaque jour non-OFF, quelle que soit sa durée, tant
// qu'elle atteint au moins 8h30 ; un jour OFF travaillé n'a lui aucune valeur "Normal", voir plus bas).
export const NORMAL_SHIFT_MIN = 450 // 7h30
export const NIGHT_START = 22 * 60  // 22h00
export const NIGHT_END = 7 * 60     // 07h00
// Un jour OFF travaillé de 7h ou plus a lui aussi une pause implicite d'1h retirée du décompte
// majoré (ex. 8h travaillées → 7h majorées) — précisé par l'utilisateur, distinct du seuil des
// jours normaux (8h30/7h30 ci-dessus) : ici la pause ne s'applique qu'à partir de 7h, pas avant.
export const OFF_DAY_BREAK_THRESHOLD_MIN = 420 // 7h
export const OFF_DAY_BREAK_MIN = 60            // 1h

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

// Motif d'une ligne shift ("d/m : HhMM - HhMM"), source unique partagée entre parseShifts()
// ci-dessous et le sniff de contenu dans parseImport.js, pour que les deux ne dérivent pas l'un de
// l'autre — comme c'est déjà arrivé une fois pour le champ Booking (voir parseReport.js). Le tiret
// entre les deux heures est optionnel et chaque heure peut être suivie d'un point final : certains
// utilisateurs notent "7h.  17h30" ou "9h 17h" (sans tiret) plutôt que le format à tiret "7h - 17h30".
// Le "h" reste obligatoire (jamais optionnel) pour deux raisons : (1) sans lui, un texte sans
// rapport comme "12/05 : 123" (aucune heure) matchait quand même une fois le tiret rendu optionnel,
// le sniff de parseImport.js le classant à tort comme un relevé d'heures ; (2) le point final ne
// peut pas être suivi d'un chiffre (`(?!\d)`), sinon une notation ambiguë comme "6h.30" (point entre
// heure et minutes plutôt qu'après) se ferait analyser en avalant le "30" comme une deuxième heure
// bidon et en jetant la vraie fin de plage dans le texte libre ignoré — mieux vaut que la ligne ne
// matche pas du tout dans ce cas (échec silencieux mais sûr) que produire un horaire corrompu.
// withCaptures=true renvoie les groupes (d, mo, h1, m1, h2, m2, reste) utilisés par parseShifts() ;
// withCaptures=false (sniff, pas besoin d'extraire les valeurs) ne capture rien.
function shiftLineSource(withCaptures) {
  const H = withCaptures ? '(\\d{1,2})' : '\\d{1,2}'
  const M = withCaptures ? '(\\d{0,2})' : '\\d{0,2}'
  const rest = withCaptures ? '([^\\n]*)' : ''
  const TIME = `${H}h${M}\\.?(?!\\d)`
  return `${H}\\/${H}\\s*:\\s*${TIME}\\s*[-–]?\\s*${TIME}${rest}`
}

export const SHIFT_LINE_RE = new RegExp(shiftLineSource(false), 'i')

// Minutes travaillées d'un shift (gère le passage minuit).
// Coercition défensive : un shift legacy/corrompu avec start_min/end_min manquant (undefined)
// donnait NaN ici, qui devient `null` en JSON envoyé à Supabase — rejeté par la contrainte
// `hours numeric not null`, laissant la ligne bloquée en syncStatus 'error' indéfiniment.
export function workedMin(shift) {
  const start = Number(shift.start_min) || 0
  let end = Number(shift.end_min) || 0
  if (end < start) end += 24 * 60
  return end - start
}

// Minutes supplémentaires réelles (temps effectivement travaillé) : tout le shift si OFF (moins la
// pause d'1h au-delà de 7h, voir OFF_DAY_BREAK_THRESHOLD_MIN), sinon au-delà de 8h30. `hours` (la
// durée brute du shift) n'est jamais affecté par cette pause — seul le décompte majoré l'est, même
// logique que BASE_SHIFT_MIN/NORMAL_SHIFT_MIN pour un jour normal (voir plus haut).
export function overtimeMin(workedMinutes, isDayOff) {
  if (isDayOff) return workedMinutes >= OFF_DAY_BREAK_THRESHOLD_MIN ? workedMinutes - OFF_DAY_BREAK_MIN : workedMinutes
  return Math.max(0, workedMinutes - BASE_SHIFT_MIN)
}

// Minutes supplémentaires "payées" : un jour OFF travaillé n'a plus de majoration propre ici —
// ses heures (déjà comptées, pause déduite, par overtimeMin) sont ensuite traitées comme une prime
// à part au niveau de la paie mensuelle (voir payroll.js) — plus dans le pool sup tiéré depuis que
// l'utilisateur a précisé qu'elles ne doivent pas compter dans le total heures sup.
export function overtimePayMin(workedMinutes, isDayOff) {
  return overtimeMin(workedMinutes, isDayOff)
}

// Minutes de nuit (22h-7h) d'un shift. Une heure qui est à la fois "nuit" et "sup" compte déjà en
// entier dans night_hours ET dans overtime_hours indépendamment (les deux totaux couvrent chacun
// tout le shift, sans s'exclure) — un troisième champ "sup de nuit" isolant ce recoupement a existé
// mais s'est révélé inutile et confus (retiré du tableau d'export en premier, puis de partout) : il
// n'a jamais influencé le calcul de paie, et affiché à côté de Sup et Nuit il donnait l'impression
// d'une catégorie distincte à additionner, alors que ses heures sont déjà comptées dans les deux autres.
export function nightBreakdown(shift) {
  const worked = workedMin(shift)
  const from = Number(shift.start_min) || 0
  const to = from + worked
  return { night_hours: nightMinutesIn(from, to) / 60 }
}

export function parseShifts(text) {
  const re = new RegExp(shiftLineSource(true), 'gi')
  const out = []
  for (const m of text.matchAll(re)) {
    const [, d, mo, h1, m1, h2, m2, rest] = m
    const start = toMinutes(h1, m1)
    let end = toMinutes(h2, m2)
    if (end < start) end += 24 * 60
    const worked = end - start
    const isDayOff = /off/i.test(rest)
    const shiftObj = { start_min: start, end_min: end }
    const night = nightBreakdown(shiftObj)
    out.push({
      shift_date: normDate(d, mo),
      start_min: start,
      end_min: end % (24 * 60),
      hours: worked / 60,                              // valeur exacte (pas d'arrondi destructif)
      is_day_off: isDayOff,
      overtime_hours: overtimePayMin(worked, isDayOff) / 60,
      night_hours: night.night_hours
    })
  }
  return out
}

// Reconstruit un relevé de shifts au format texte accepté par parseShifts() ("d/m : Hh - Hh"),
// pour permettre de copier/partager ses horaires en texte plutôt qu'un PDF/Excel — et
// éventuellement les recoller tels quels dans l'import (round-trip, même esprit que
// formatMissionReport() pour les missions, voir formatReport.js). Un jour OFF travaillé se
// distingue par un suffixe " (off)" (le seul indice que parseShifts() sait reconnaître, via
// /off/i.test(rest)). Les jours OFF non travaillés (isRestDay) sont exclus : ce format n'a aucune
// façon d'encoder un jour sans horaires (parseShifts() exige toujours deux heures), et un jour de
// repos ne se crée de toute façon jamais par ce biais dans l'app (bouton dédié "Marquer comme jour OFF").
export function formatShiftsText(shifts) {
  return shifts
    .filter(s => !isRestDay(s))
    .map(s => {
      const [, mo, d] = s.shift_date.split('-')
      const line = `${d}/${mo} : ${fmtMinutes(s.start_min)} - ${fmtMinutes(s.end_min)}`
      return s.is_day_off ? `${line} (off)` : line
    })
    .join('\n')
}

// Recalcule overtime_hours pour un shift existant (toggle OFF / édition horaires).
export function recompute(shift, isDayOff) {
  const w = workedMin(shift)
  const night = nightBreakdown(shift)
  return {
    hours: w / 60,
    overtime_hours: overtimePayMin(w, isDayOff) / 60,
    is_day_off: isDayOff,
    night_hours: night.night_hours
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

// Heure d'horloge depuis des minutes (start_min/end_min). Défensif comme workedMin()/nightBreakdown()
// ci-dessus (voir leur commentaire) : un start_min/end_min manquant/corrompu donnait "NaNh" au lieu
// d'un échec propre — trouvé en review sur formatShiftsText(), qui aurait pu copier une ligne
// illisible dans le presse-papiers pour un shift legacy corrompu. Même sentinelle "—" que fmtClock()
// dans shiftRows.js (duplication existante, pas fusionnée ici pour rester ciblé sur le bug trouvé).
export function fmtMinutes(min) {
  const n = Number(min)
  if (!Number.isFinite(n)) return '—'
  const h = Math.floor(n / 60) % 24
  const m = ((n % 60) + 60) % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}
