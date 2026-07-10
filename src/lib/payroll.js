import { monthlyDetail } from './monthlyDetail'

export const DEFAULT_RATES = {
  overtimeThresholdHours: 33,  // les 33 premières heures de sup dans le mois à +25%, à partir de la 34e heure : +50%
  overtimeMultiplierLow: 1.25, // heures sup jusqu'à la 33e heure
  overtimeMultiplierHigh: 1.5, // heures sup à partir de la 34e heure
  nightBonusRate: 0.25,        // prime de nuit, en supplément du taux de base
  offWorkedBonusRate: 0.25,    // prime jour OFF travaillé, en supplément du taux de base
  weeklyBaseHours: 35,         // base légale hebdomadaire — mode "Mensualisé" uniquement
  // Cotisations salariales : taux forfaitaire, pas un détail poste par poste (santé/retraite/
  // chômage/CSG-CRDS/mutuelle...) — bien trop spécifique au contrat et à la convention collective
  // pour être répliqué fiablement ici. Valeur par défaut dérivée d'un vrai bulletin (non-cadre) :
  // brut 1179.05 € → net avant impôt 906.72 €, soit (1179.05-906.72)/1179.05 ≈ 23.1% de retenues.
  // Éditable dans le simulateur, à ajuster si le profil (cadre/mutuelle/etc.) diffère.
  employeeCotisationRate: 0.231
}

// Calcule la simulation de paie pour un mois (élément retourné par monthlyDetail()).
// Jour OFF travaillé et heures de nuit sont deux primes à part, chacune +25% en plus du taux de
// base sur chaque heure concernée (même mécanique que la prime de nuit) — ces heures ne rejoignent
// plus le pool des heures sup normales et n'affectent pas le seuil mensuel de 33h/50%.
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
    // entièrement dans la prime jour OFF ci-dessous ; seules les vraies heures sup (jour normal)
    // alimentent le pool majoré à 25%/50%.
    baseHours = total.baseHours
    baseAmount = baseHours * hourlyRate
  }

  const overtimeLowHours = Math.min(total.overtime, rates.overtimeThresholdHours)
  const overtimeHighHours = Math.max(0, total.overtime - rates.overtimeThresholdHours)
  const overtimeLowAmount = overtimeLowHours * hourlyRate * rates.overtimeMultiplierLow
  const overtimeHighAmount = overtimeHighHours * hourlyRate * rates.overtimeMultiplierHigh

  const nightBonus = total.night * hourlyRate * rates.nightBonusRate
  const offWorkedBonus = offWorkedHours * hourlyRate * rates.offWorkedBonusRate

  const grossTotal = baseAmount + overtimeLowAmount + overtimeHighAmount + nightBonus + offWorkedBonus

  // Estimation forfaitaire des cotisations salariales sur le brut total (voir le commentaire de
  // DEFAULT_RATES.employeeCotisationRate) — pas un calcul détaillé, juste une approximation.
  const cotisationRate = Number(rates.employeeCotisationRate) || 0
  const cotisationAmount = grossTotal * cotisationRate
  const netTotal = grossTotal - cotisationAmount

  return {
    payMode,
    baseHours, baseAmount,
    fullBaseHours, fullBaseAmount, absenceDays, absenceHours, absenceAmount,
    offWorkedHours, offWorkedBonus,
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
  rows.push(
    { label: "Heures sup jusqu'à 33h (+25%)", hours: p.overtimeLowHours, amount: p.overtimeLowAmount },
    { label: 'Heures sup à partir de 34h (+50%)', hours: p.overtimeHighHours, amount: p.overtimeHighAmount },
    { label: 'Prime de nuit (+25%)', hours: p.nightHours, amount: p.nightBonus }
  )
  if (p.offWorkedHours > 0) {
    rows.push({ label: 'Prime jour OFF (+25%)', hours: p.offWorkedHours, amount: p.offWorkedBonus })
  }
  return rows
}
