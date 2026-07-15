import { monthlyDetail } from './monthlyDetail'
import { fmtHours } from './parseShift'

export const DEFAULT_RATES = {
  // Seuil du palier +25%. La vraie règle légale est hebdomadaire (35h/semaine de base sans
  // majoration, les 8h suivantes de la 36e à la 43e heure à +25%, à partir de la 44e à +50%) —
  // mais le pool sup de l'app reste agrégé au mois entier (voir monthlyDetail.js/le 25 du mois),
  // pas semaine civile par semaine civile (choix explicite : découper par semaine impliquerait de
  // décider comment rattacher une semaine à cheval sur deux mois de paie, ce qui n'a pas de réponse
  // évidente). Ce seuil est donc la bande hebdomadaire de 8h ramenée au mois par un facteur
  // 52 semaines / 12 mois, la même conversion que weeklyBaseHours ci-dessous pour la base légale
  // mensuelle — une approximation assumée plutôt qu'un vrai calcul semaine par semaine.
  overtimeThresholdHours: Math.round(8 * 52 / 12 * 100) / 100, // ≈ 34.67h
  overtimeMultiplierLow: 1.25, // heures sup jusqu'au seuil
  overtimeMultiplierHigh: 1.5, // heures sup au-delà du seuil
  nightBonusRate: 0.25,        // prime de nuit, en supplément du taux de base
  weeklyBaseHours: 35,         // base légale hebdomadaire — mode "Mensualisé" uniquement
  // Cotisations salariales : taux forfaitaire, pas un détail poste par poste (santé/retraite/
  // chômage/CSG-CRDS/mutuelle...) — bien trop spécifique au contrat et à la convention collective
  // pour être répliqué fiablement ici. Valeur par défaut dérivée d'un vrai bulletin (non-cadre) :
  // brut 1179.05 € → net avant impôt 906.72 €, soit (1179.05-906.72)/1179.05 ≈ 23.1% de retenues.
  // Éditable dans le simulateur, à ajuster si le profil (cadre/mutuelle/etc.) diffère.
  employeeCotisationRate: 0.231
}

// Calcule la simulation de paie pour un mois (élément retourné par monthlyDetail()).
// Les heures d'un jour OFF travaillé sont des heures sup comme les autres pour la paie : elles
// rejoignent le même pool majoré à 25%/50% avec le même seuil mensuel que les heures sup
// normales, au lieu d'une prime à part à +25% plat (vérifié auprès de l'utilisateur — l'employeur ne
// fait pas de distinction, contrairement à une hypothèse antérieure basée sur une lecture différente
// d'un bulletin de salaire). Les heures de nuit restent en revanche une prime à part, +25% en plus du
// taux de base sur chaque heure de nuit, hors du pool sup et de son seuil. Le "Détail des heures"
// (relevé jour par jour) continue d'afficher Sup/OFF trav. dans deux colonnes séparées — utile pour
// savoir quels jours étaient officiellement des jours OFF — mais côté paie, l'argent est calculé sur
// le total fusionné ; `offWorkedHours` reste exposé (voir plus bas) uniquement pour une ligne
// informative dans payrollRows(), sans montant propre.
//
// options.payMode : 'hourly' (défaut) calcule la base sur les heures réellement pointées ;
// 'monthly' reproduit le mécanisme "salarié mensualisé" observé sur un vrai bulletin de salaire —
// une base légale fixe (rates.weeklyBaseHours × 52/12, arrondi à 2 décimales — ex. 151.67h pour
// 35h/semaine), proratisée par un nombre de jours d'absence saisi manuellement (options.absenceDays ;
// l'app ne connaît pas les dates d'entrée/sortie de contrat). Le taux journalier d'absence est
// weeklyBaseHours ÷ 7 (5h/jour pour 35h/semaine), PAS la base mensuelle ÷ 30 : vérifié au centime
// près sur un vrai bulletin où "Absence entrée" pour 14 jours calendaires (2 semaines pleines)
// valait exactement 70.00h = 14 × 5, alors que 151.67 ÷ 30 × 14 aurait donné 70.78h.
// Heures sup/nuit/jour OFF restent calculées sur les heures réelles dans les deux modes : ce sont
// des suppléments variables, pas la base.
export function computeMonthPayroll(month, hourlyRate, rates = DEFAULT_RATES, options = {}) {
  const total = month.total
  const offWorkedHours = total.offWorked
  const payMode = options.payMode === 'monthly' ? 'monthly' : 'hourly'
  const absenceDays = Number(options.absenceDays) || 0

  let baseHours, baseAmount, fullBaseHours, fullBaseAmount, absenceHours, absenceAmount
  if (payMode === 'monthly') {
    fullBaseHours = Math.round(rates.weeklyBaseHours * 52 / 12 * 100) / 100
    fullBaseAmount = fullBaseHours * hourlyRate
    absenceHours = (rates.weeklyBaseHours / 7) * absenceDays
    absenceAmount = absenceHours * hourlyRate
    baseHours = Math.max(0, fullBaseHours - absenceHours)
    baseAmount = fullBaseAmount - absenceAmount
  } else {
    // total.baseHours est un forfait de 7h30/jour travaillé, pas les heures réelles moins la part
    // sup (voir monthlyDetail.js) — un jour OFF travaillé n'y compte pas du tout, ses heures sont
    // entièrement dans le pool sup ci-dessous (fusionné avec les vraies heures sup).
    baseHours = total.baseHours
    baseAmount = baseHours * hourlyRate
  }

  // Pool fusionné : heures sup normales + heures d'un jour OFF travaillé, tiérées ensemble sur le
  // même seuil mensuel (voir DEFAULT_RATES.overtimeThresholdHours ci-dessus).
  const overtimePoolHours = total.overtime + offWorkedHours
  const overtimeLowHours = Math.min(overtimePoolHours, rates.overtimeThresholdHours)
  const overtimeHighHours = Math.max(0, overtimePoolHours - rates.overtimeThresholdHours)
  const overtimeLowAmount = overtimeLowHours * hourlyRate * rates.overtimeMultiplierLow
  const overtimeHighAmount = overtimeHighHours * hourlyRate * rates.overtimeMultiplierHigh

  const nightBonus = total.night * hourlyRate * rates.nightBonusRate

  const grossTotal = baseAmount + overtimeLowAmount + overtimeHighAmount + nightBonus

  // Estimation forfaitaire des cotisations salariales sur le brut total (voir le commentaire de
  // DEFAULT_RATES.employeeCotisationRate) — pas un calcul détaillé, juste une approximation.
  const cotisationRate = Number(rates.employeeCotisationRate) || 0
  const cotisationAmount = grossTotal * cotisationRate
  const netTotal = grossTotal - cotisationAmount

  return {
    payMode,
    baseHours, baseAmount,
    fullBaseHours, fullBaseAmount, absenceDays, absenceHours, absenceAmount,
    offWorkedHours,
    overtimeThresholdHours: rates.overtimeThresholdHours,
    overtimeLowHours, overtimeHighHours, overtimeLowAmount, overtimeHighAmount,
    overtimeCarriedInHours: total.overtimeCarriedIn,
    nightHours: total.night, nightBonus,
    grossTotal,
    cotisationRate, cotisationAmount, netTotal
  }
}

// Simulation complète : un résultat par mois présent dans shifts.
// options.absenceDaysByMonth : { [monthKey]: jours } — un prorata par mois de paie, saisi
// manuellement dans le simulateur (mode "Mensualisé" seulement, voir computeMonthPayroll).
export function computePayroll(shifts, hourlyRate, rates = DEFAULT_RATES, options = {}) {
  const absenceDaysByMonth = options.absenceDaysByMonth || {}
  return monthlyDetail(shifts).map(m => ({
    key: m.key,
    label: m.label,
    sheet: m.sheet, // nom d'onglet court ("Juil 2026"), pour l'export Excel
    rows: m.rows, // détail jour par jour, pour le relevé d'heures inclus dans les exports paie
    carriedInRows: m.carriedInRows, // shifts du 26-fin du mois précédent dont la majoration est reportée ici (voir monthlyDetail.js)
    carriedOutRows: m.carriedOutRows, // shifts propres à ce mois dont la majoration part au contraire vers le mois suivant (voir monthlyDetail.js)
    ownCountedRows: m.ownCountedRows, // rows moins carriedOutRows (voir monthlyDetail.js)
    cutoffRows: m.cutoffRows, // carriedInRows + ownCountedRows, pour shiftTotalsRow() (voir monthlyDetail.js)
    payroll: computeMonthPayroll(m, hourlyRate, rates, { payMode: options.payMode, absenceDays: absenceDaysByMonth[m.key] })
  }))
}

// Lignes de catégorie communes à l'UI, l'export PDF et l'export Excel — une seule source
// de vérité pour éviter que les trois recalculent chacun leur propre montant.
// Libellés en toutes lettres plutôt qu'avec des symboles mathématiques (≤/>) : les polices de
// base de jsPDF (WinAnsi/CP1252) n'ont pas le glyphe "≤", ce qui produisait du texte corrompu
// dans le PDF exporté.
export function payrollRows(p) {
  const rows = []
  if (p.payMode === 'monthly') {
    rows.push({ label: 'Salaire de base (mensualisé)', hours: p.fullBaseHours, amount: p.fullBaseAmount })
    if (p.absenceDays > 0) {
      rows.push({ label: `Absence prorata (${p.absenceDays} j)`, hours: p.absenceHours, amount: -p.absenceAmount })
    }
  } else {
    rows.push({ label: 'Heures normales', hours: p.baseHours, amount: p.baseAmount })
  }
  // Informative uniquement : ce sous-total est déjà compris dans overtimeLowHours/overtimeHighHours
  // ci-dessous (voir monthlyDetail.js), donc pas de montant propre — l'ajouter en aurait doublé le
  // paiement dans TOTAL BRUT ESTIMÉ, qui reste calculé à partir de grossTotal, pas d'une somme des
  // lignes affichées ici. Le libellé précise "dont" explicitement : sans ça, cette ligne a exactement
  // le même rendu (Row, PDF, Excel) que les lignes qui s'additionnent réellement juste en dessous —
  // un lecteur comparant à un vrai bulletin pourrait sinon lire les heures comme un ajout et non
  // comme un sous-total déjà inclus, et remonter un faux écart.
  if (p.overtimeCarriedInHours > 0) {
    rows.push({ label: 'Dont heures sup. du mois dernier (déjà incluses ci-dessous)', hours: p.overtimeCarriedInHours, amount: null })
  }
  // Même principe que la ligne "Dont... du mois dernier" ci-dessus : les heures d'un jour OFF
  // travaillé sont fusionnées dans le pool sup (voir computeMonthPayroll()), donc déjà comptées et
  // payées dans les deux lignes "Heures sup..." qui suivent — cette ligne est purement informative
  // (amount: null), pour que le lecteur sache combien de ce total vient d'un jour OFF plutôt que
  // d'heures sup normales, sans dupliquer le montant.
  if (p.offWorkedHours > 0) {
    rows.push({ label: 'Dont heures travaillées en OFF (déjà incluses ci-dessous)', hours: p.offWorkedHours, amount: null })
  }
  // Seuil affiché dynamiquement (ex. "34h40") plutôt qu'en dur ("33h"/"34h") : overtimeThresholdHours
  // n'est plus un entier rond depuis qu'il dérive de la bande légale hebdomadaire de 8h ramenée au
  // mois (voir DEFAULT_RATES ci-dessus) — un texte figé aurait désynchronisé silencieusement de la
  // vraie valeur utilisée pour le calcul au prochain changement de ce seuil.
  const thresholdLabel = fmtHours(p.overtimeThresholdHours)
  rows.push(
    { label: `Heures sup jusqu'à ${thresholdLabel} (+25%)`, hours: p.overtimeLowHours, amount: p.overtimeLowAmount },
    { label: `Heures sup au-delà de ${thresholdLabel} (+50%)`, hours: p.overtimeHighHours, amount: p.overtimeHighAmount },
    { label: 'Prime de nuit (+25%)', hours: p.nightHours, amount: p.nightBonus }
  )
  return rows
}
