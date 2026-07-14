import { BASE_SHIFT_MIN, NORMAL_SHIFT_MIN, isRestDay } from './parseShift'

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

// Clôture de paie de l'employeur : SEULES les heures sup et les heures d'un jour OFF travaillé
// comptées jusqu'au 25 du mois inclus tombent dans le bulletin du mois en cours, celles du 26 à la
// fin du mois basculent sur le bulletin du mois suivant — vérifié auprès de l'utilisateur, les
// heures normales et les heures de nuit restent sur le mois calendaire réel du shift, seules les
// heures majorées (sup/jour OFF) suivent cette coupure administrative.
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
// - `rows` (relevé jour par jour) et les heures normales/de nuit du total : mois calendaire réel.
// - les heures sup et les heures de jour OFF travaillé du total : mois de paie (coupure au 25).
// Un shift daté du 27 juin par ex. apparaît dans le relevé de juin avec ses heures normales, mais
// sa part d'heures sup rejoint le total du bulletin de juillet, pas celui de juin.
// `total.overtimeCarriedIn` isole justement cette part reportée (heures sup ET jour OFF confondues,
// puisque payroll.js les fusionne dans le même pool sup — pas un total à part) — sert à l'affichage
// informatif de payrollRows() (voir payroll.js) et,
// avec les shifts sources eux-mêmes (`carriedInRows` ci-dessous), à les faire apparaître dans le
// tableau "Détail des heures" du mois de paie où leurs heures sup sont effectivement comptées,
// pas seulement dans celui du mois calendaire où ils sont datés. `carriedOutRows` est le symétrique
// côté mois d'origine : les shifts de `rows` dont la majoration part au contraire vers le bulletin
// SUIVANT — nécessaire pour que exportPayroll.js puisse afficher un total Sup/OFF trav. qui reste
// la somme exacte des lignes visiblement comptées, sans compter dessus (ni omettre) un shift affiché.
function carriesOver(s) {
  return Number(s.overtime_hours || 0) > 0
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
  const calendarMap = new Map() // mois calendaire -> shifts (relevé, heures normales/nuit)
  const cutoffMap = new Map()   // mois de paie -> { overtime, overtimeCarriedIn, offWorked, carriedInRows }

  for (const s of shifts) {
    // dedupeByDate() ci-dessus a déjà écarté les lignes corrompues (date manquante) avant d'atteindre cette boucle.
    const calKey = s.shift_date.slice(0, 7)
    if (!calendarMap.has(calKey)) calendarMap.set(calKey, [])
    calendarMap.get(calKey).push(s)

    const cutKey = payrollCutoffMonthKey(s.shift_date)
    if (!cutoffMap.has(cutKey)) cutoffMap.set(cutKey, { overtime: 0, overtimeCarriedIn: 0, offWorked: 0, carriedInRows: [] })
    const bucket = cutoffMap.get(cutKey)
    const otHours = Number(s.overtime_hours || 0)
    if (s.is_day_off) bucket.offWorked += otHours
    else bucket.overtime += otHours

    // cutKey ne matche le mois calendaire du shift que pour les jours 1-25 (voir
    // payrollCutoffMonthKey) : si les deux diffèrent, ce shift est daté du 26-fin du mois calendaire
    // précédent et sa majoration (sup normale OU jour OFF travaillé, les deux suivent la même
    // coupure ET rejoignent le même pool sup côté paie, voir payroll.js) est reportée dans le
    // bulletin de cutKey — on isole ce sous-total (overtimeCarriedIn, is_day_off inclus puisque les
    // deux alimentent désormais le même pool sup pour la ligne informative "Dont..." de
    // payrollRows()) et on garde systématiquement le shift source pour l'afficher dans le relevé
    // "Détail des heures" du mois de paie où sa majoration compte réellement — sans ça, un jour OFF
    // travaillé reporté n'apparaissait dans AUCUN tableau tout en générant une prime avec un montant
    // dans le récapitulatif (bug trouvé en review).
    if (cutKey !== calKey && carriesOver(s)) {
      bucket.overtimeCarriedIn += otHours
      bucket.carriedInRows.push(s)
    }
  }

  const keys = new Set([...calendarMap.keys(), ...cutoffMap.keys()])
  return [...keys].sort().map(key => {
    const [y, mo] = key.split('-')
    // Un jour OFF non travaillé (isRestDay : is_day_off sans aucune heure, voir parseShift.js) n'a
    // rien à montrer dans le relevé jour par jour — Durée/Sup/OFF trav./Nuit y sont toujours à 0,
    // retiré du relevé sur demande pour ne pas noyer les jours effectivement travaillés parmi des
    // lignes "OFF" vides. Exclu ici (pas juste à l'affichage dans exportPayroll.js) puisqu'il
    // contribue de toute façon 0 à baseHours/night plus bas : aucun total n'est affecté.
    const rows = (calendarMap.get(key) || []).filter(s => !isRestDay(s)).sort((a, b) => (a.shift_date < b.shift_date ? -1 : 1))
    // Heures normales = un forfait fixe de 7h30 (NORMAL_SHIFT_MIN) par jour travaillé, pas le brut
    // moins la part sup — vérifié contre le relevé réel de l'utilisateur. Un jour OFF travaillé ne
    // compte pas du tout ici : ses heures rejoignent entièrement le pool sup (voir payroll.js).
    const baseHours = rows.reduce((sum, s) => {
      if (s.is_day_off) return sum
      const workedMin = Number(s.hours || 0) * 60
      const normalMin = Math.max(0, Math.min(workedMin, BASE_SHIFT_MIN) - (BASE_SHIFT_MIN - NORMAL_SHIFT_MIN))
      return sum + normalMin / 60
    }, 0)
    const night = rows.reduce((sum, s) => sum + Number(s.night_hours || 0), 0)
    // Parmi les shifts propres à ce mois calendaire (rows), ceux datés du 26-fin dont la majoration
    // part au contraire vers le bulletin SUIVANT — restent dans `rows` (relevé jour par jour complet,
    // Durée/Nuit ne suivent jamais la coupure) mais doivent être exclus du total Sup/OFF trav. de CE
    // mois-ci (voir shiftTotalsRow() dans shiftRows.js) et signalés séparément à l'affichage.
    const carriedOutRows = rows.filter(s => payrollCutoffMonthKey(s.shift_date) !== key && carriesOver(s))
    const cutoff = cutoffMap.get(key) || { overtime: 0, overtimeCarriedIn: 0, offWorked: 0, carriedInRows: [] }
    const carriedInRows = cutoff.carriedInRows.slice().sort((a, b) => (a.shift_date < b.shift_date ? -1 : 1))
    // Précalculés ici plutôt que recalculés indépendamment dans exportPayrollPdf et exportPayrollXlsx
    // (qui en avaient chacun leur propre copie identique) — même rationale que BOOKING_FIELD_RE dans
    // parseReport.js : éviter que les deux exports ne dérivent l'un de l'autre si l'un est modifié
    // sans l'autre. `ownCountedRows` = les shifts de `rows` dont la majoration compte bien dans CE
    // bulletin (exclut carriedOutRows) ; `cutoffRows` = l'ensemble exact dont Sup/OFF trav. doivent
    // être sommées pour que le total du tableau ne puisse jamais diverger de ce qui est affiché.
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
      total: { baseHours, overtime: cutoff.overtime, overtimeCarriedIn: cutoff.overtimeCarriedIn, offWorked: cutoff.offWorked, night }
    }
  })
}
