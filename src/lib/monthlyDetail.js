import { BASE_SHIFT_MIN, NORMAL_SHIFT_MIN, isRestDay } from './parseShift'

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

// Clôture de paie de l'employeur : SEULES les heures normales (base) restent sur le mois calendaire
// réel du shift — toutes les heures majorées (sup, jour OFF travaillé, ET heures de nuit) comptées
// jusqu'au 25 du mois inclus tombent dans le bulletin du mois en cours, celles du 26 à la fin du
// mois basculent sur le bulletin du mois suivant. Les heures de nuit ont d'abord été traitées comme
// les heures normales (mois calendaire réel, jamais reportées) suite à une vérification contre un
// bulletin qui ne semblait pas les reporter — corrigé après qu'un autre bulletin réel a montré que
// la prime de nuit du 26-fin de mois est bien reportée exactement comme les heures sup.
function payrollCutoffMonthKey(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number)
  if (d <= 25) return `${y}-${String(mo).padStart(2, '0')}`
  const ny = mo === 12 ? y + 1 : y
  const nmo = mo === 12 ? 1 : mo + 1
  return `${ny}-${String(nmo).padStart(2, '0')}`
}

// Regroupe des shifts par mois avec les totaux agrégés — utilisé par payroll.js (simulation de
// paie, exports Excel/PDF). Isolé dans son propre module (pur, sans dépendance à xlsx/jspdf) pour
// ne pas forcer ces libs dans le bundle principal.
//
// Deux regroupements différents cohabitent, par champ (voir payrollCutoffMonthKey ci-dessus) :
// - `rows` (relevé jour par jour) et les heures normales du total (`baseHours`) : mois calendaire réel.
// - les heures sup, les heures de jour OFF travaillé, ET les heures de nuit du total : mois de paie
//   (coupure au 25).
// Un shift daté du 27 juin par ex. apparaît dans le relevé de juin avec ses heures normales, mais
// sa part d'heures sup ET ses heures de nuit rejoignent le total du bulletin de juillet, pas celui
// de juin. `total.overtimeCarriedIn`/`total.offWorkedCarriedIn` isolent la part sup / jour OFF
// reportée — deux sous-totaux séparés, pas un seul fusionné, depuis que payroll.js ne mélange plus
// les heures sup normales et les heures de jour OFF travaillé dans le même pool tiéré (l'utilisateur
// a précisé que les heures OFF sont une prime à part, toujours +25%, hors du total heures sup) —
// chacun sert à l'affichage informatif de sa propre ligne "Dont..." dans payrollRows() (voir
// payroll.js). Les heures de nuit reportées n'ont pas de sous-total équivalent (pas de ligne
// "Dont nuit du mois dernier" demandée), seul `total.night` reflète directement la bonne coupure.
// Avec les shifts sources eux-mêmes (`carriedInRows` ci-dessous), on les fait aussi apparaître dans
// le tableau "Détail des heures" du mois de paie où leur majoration (sup ET/OU nuit) est
// effectivement comptée, pas seulement dans celui du mois calendaire où ils sont datés.
// `carriedOutRows` est le symétrique côté mois d'origine : les shifts de `rows` dont la majoration
// part au contraire vers le bulletin SUIVANT — nécessaire pour que exportPayroll.js puisse afficher
// un total Sup/OFF trav./Nuit qui reste la somme exacte des lignes visiblement comptées, sans
// compter dessus (ni omettre) un shift affiché.
function carriesOver(s) {
  return Number(s.overtime_hours || 0) > 0 || Number(s.night_hours || 0) > 0
}

// Un `shift_date` ne devrait avoir qu'un seul shift — toute la logique de l'app le suppose
// (isRestDay, addShifts() qui écrase par date, etc.). Un doublon peut malgré tout apparaître (pas de
// contrainte d'unicité côté serveur sur shift_date, donc une course entre deux appareils/onglets
// hors-ligne créant chacun un shift pour la même date peut produire deux lignes distinctes qui
// syncent séparément) : sans dédup ici, un jour dupliqué double ses heures dans TOUS les totaux
// (normales, sup, nuit...), pas seulement dans le relevé "Détail des heures" où le doublon a été
// repéré. On garde le shift le plus récemment modifié (`updated_at`) par date plutôt que de sommer
// les deux, puisque le doublon ne représente pas deux vraies périodes de travail distinctes.
function dedupeByDate(shifts) {
  const byDate = new Map()
  for (const s of shifts) {
    if (!s.shift_date) continue
    const existing = byDate.get(s.shift_date)
    if (!existing) { byDate.set(s.shift_date, s); continue }
    const newTime = new Date(s.updated_at || 0).getTime()
    const existingTime = new Date(existing.updated_at || 0).getTime()
    // Un `existing.updated_at` invalide (legacy/corrompu) donne un NaN qui perd TOUTE comparaison
    // `>=` (NaN >= x est toujours false) — sans ce garde-fou, une ligne à la date corrompue une fois
    // choisie comme "existing" ne pourrait plus jamais être remplacée, même par un doublon valide et
    // réellement plus récent (bug trouvé en review). `Number.isNaN(existingTime)` fait perdre
    // systématiquement une date invalide face à n'importe quel concurrent, plutôt que de la figer.
    if (Number.isNaN(existingTime) || newTime >= existingTime) {
      byDate.set(s.shift_date, s)
    }
  }
  return [...byDate.values()]
}

export function monthlyDetail(shifts) {
  shifts = dedupeByDate(shifts)
  const calendarMap = new Map() // mois calendaire -> shifts (relevé, heures normales)
  const cutoffMap = new Map()   // mois de paie -> { overtime, overtimeCarriedIn, offWorked, offWorkedCarriedIn, night, carriedInRows }

  for (const s of shifts) {
    // dedupeByDate() ci-dessus a déjà écarté les lignes corrompues (date manquante) avant d'atteindre cette boucle.
    const calKey = s.shift_date.slice(0, 7)
    if (!calendarMap.has(calKey)) calendarMap.set(calKey, [])
    calendarMap.get(calKey).push(s)

    const cutKey = payrollCutoffMonthKey(s.shift_date)
    if (!cutoffMap.has(cutKey)) cutoffMap.set(cutKey, { overtime: 0, overtimeCarriedIn: 0, offWorked: 0, offWorkedCarriedIn: 0, night: 0, carriedInRows: [] })
    const bucket = cutoffMap.get(cutKey)
    const otHours = Number(s.overtime_hours || 0)
    if (s.is_day_off) bucket.offWorked += otHours
    else bucket.overtime += otHours
    // Les heures de nuit ne se distinguent pas par is_day_off (une prime à part, voir payroll.js) —
    // simple somme par mois de paie.
    bucket.night += Number(s.night_hours || 0)

    // cutKey ne matche le mois calendaire du shift que pour les jours 1-25 (voir
    // payrollCutoffMonthKey) : si les deux diffèrent, ce shift est daté du 26-fin du mois calendaire
    // précédent et sa majoration (sup normale OU jour OFF travaillé OU heures de nuit — toutes
    // suivent la même coupure) est reportée dans le bulletin de cutKey — on isole deux sous-totaux
    // séparés (overtimeCarriedIn pour la sup normale, offWorkedCarriedIn pour le jour OFF, plus un
    // seul pool fusionné depuis que payroll.js les traite comme deux primes distinctes) pour les
    // lignes informatives "Dont..." de payrollRows() ; les heures de nuit n'ont pas de sous-total
    // "carried in" équivalent, `bucket.night` ci-dessus suffit puisqu'aucune ligne informative ne le
    // détaille séparément. Le shift source est systématiquement gardé pour l'afficher dans le relevé
    // "Détail des heures" du mois de paie où sa majoration compte réellement — sans ça, un jour OFF
    // travaillé reporté n'apparaissait dans AUCUN tableau tout en générant une prime avec un montant
    // dans le récapitulatif (bug trouvé en review).
    if (cutKey !== calKey && carriesOver(s)) {
      if (s.is_day_off) bucket.offWorkedCarriedIn += otHours
      else bucket.overtimeCarriedIn += otHours
      bucket.carriedInRows.push(s)
    }
  }

  const keys = new Set([...calendarMap.keys(), ...cutoffMap.keys()])
  return [...keys].sort().map(key => {
    const [y, mo] = key.split('-')
    // Un jour OFF non travaillé (isRestDay : is_day_off sans aucune heure, voir parseShift.js) n'a
    // rien à montrer dans le relevé jour par jour — Durée/Sup/OFF trav./Nuit y sont toujours à 0,
    // retiré du relevé sur demande pour ne pas noyer les jours effectivement travaillés parmi des
    // lignes "OFF" vides. Exclu ici (pas juste à l'affichage dans exportPayroll.js) sans risque pour
    // les totaux : baseHours (calculé sur `rows` ci-dessous) l'exclut donc naturellement, et
    // overtime/offWorked/night (calculés plus haut sur `shifts` en entier, avant ce filtre) restent
    // inchangés puisqu'un jour de repos non travaillé a de toute façon overtime_hours=night_hours=0.
    const rows = (calendarMap.get(key) || []).filter(s => !isRestDay(s)).sort((a, b) => (a.shift_date < b.shift_date ? -1 : 1))
    // Heures normales = un forfait fixe de 7h30 (NORMAL_SHIFT_MIN) par jour travaillé, pas le brut
    // moins la part sup — vérifié contre le relevé réel de l'utilisateur. Un jour OFF travaillé ne
    // compte pas du tout ici : ses heures rejoignent entièrement sa propre prime à part (voir payroll.js).
    const baseHours = rows.reduce((sum, s) => {
      if (s.is_day_off) return sum
      const workedMin = Number(s.hours || 0) * 60
      const normalMin = Math.max(0, Math.min(workedMin, BASE_SHIFT_MIN) - (BASE_SHIFT_MIN - NORMAL_SHIFT_MIN))
      return sum + normalMin / 60
    }, 0)
    // Parmi les shifts propres à ce mois calendaire (rows), ceux datés du 26-fin dont la majoration
    // part au contraire vers le bulletin SUIVANT — restent dans `rows` (relevé jour par jour complet,
    // Durée ne suit jamais la coupure) mais doivent être exclus du total Sup/OFF trav./Nuit de CE
    // mois-ci (voir shiftTotalsRow() dans shiftRows.js) et signalés séparément à l'affichage.
    const carriedOutRows = rows.filter(s => payrollCutoffMonthKey(s.shift_date) !== key && carriesOver(s))
    const cutoff = cutoffMap.get(key) || { overtime: 0, overtimeCarriedIn: 0, offWorked: 0, offWorkedCarriedIn: 0, night: 0, carriedInRows: [] }
    const carriedInRows = cutoff.carriedInRows.slice().sort((a, b) => (a.shift_date < b.shift_date ? -1 : 1))
    // Précalculés ici plutôt que recalculés indépendamment dans exportPayrollPdf et exportPayrollXlsx
    // (qui en avaient chacun leur propre copie identique) — même rationale que BOOKING_FIELD_RE dans
    // parseReport.js : éviter que les deux exports ne dérivent l'un de l'autre si l'un est modifié
    // sans l'autre. `ownCountedRows` = les shifts de `rows` dont la majoration compte bien dans CE
    // bulletin (exclut carriedOutRows) ; `cutoffRows` = l'ensemble exact dont Sup/OFF trav./Nuit
    // doivent être sommées pour que le total du tableau ne puisse jamais diverger de ce qui est affiché.
    const ownCountedRows = rows.filter(s => !carriedOutRows.includes(s))
    const cutoffRows = [...carriedInRows, ...ownCountedRows]
    return {
      key,
      label: `${MONTHS[+mo - 1]} ${y}`,
      sheet: `${MONTHS[+mo - 1].slice(0, 4)} ${y}`,
      rows,
      carriedInRows,
      carriedOutRows,
      ownCountedRows,
      cutoffRows,
      // night vient de cutoff (mois de paie), pas d'un reduce sur `rows` (mois calendaire) — les
      // heures de nuit suivent la même coupure au 25 que les heures sup, voir le commentaire en
      // haut de fichier.
      total: {
        baseHours, overtime: cutoff.overtime, overtimeCarriedIn: cutoff.overtimeCarriedIn,
        offWorked: cutoff.offWorked, offWorkedCarriedIn: cutoff.offWorkedCarriedIn, night: cutoff.night
      }
    }
  })
}
