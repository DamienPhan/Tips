import { monthlyDetail } from './monthlyDetail'

export const DEFAULT_RATES = {
  overtimeThresholdHours: 34,  // au-delà de 34h de sup cumulées dans le mois, majoration 50%
  overtimeMultiplierLow: 1.25, // heures sup jusqu'à 34h
  overtimeMultiplierHigh: 1.5, // heures sup au-delà de 34h
  nightBonusRate: 0.25         // prime de nuit, en supplément du taux de base
}

// Calcule la simulation de paie pour un mois (élément retourné par monthlyDetail()).
// Les heures d'un jour OFF travaillé n'ont plus de majoration propre : une fois comptées en
// intégralité (total.offWorked, cf. overtimeMin() dans parseShift.js), elles rejoignent le même
// pool que les heures sup normales et suivent le même barème mensuel (≤34h à +25%, au-delà à +50%).
export function computeMonthPayroll(month, hourlyRate, rates = DEFAULT_RATES) {
  const total = month.total
  const offWorkedHours = total.offWorked

  const baseHours = Math.max(0, total.hours - total.overtime - offWorkedHours)
  const baseAmount = baseHours * hourlyRate

  const combinedOvertimeHours = total.overtime + offWorkedHours
  const overtimeLowHours = Math.min(combinedOvertimeHours, rates.overtimeThresholdHours)
  const overtimeHighHours = Math.max(0, combinedOvertimeHours - rates.overtimeThresholdHours)
  const overtimeLowAmount = overtimeLowHours * hourlyRate * rates.overtimeMultiplierLow
  const overtimeHighAmount = overtimeHighHours * hourlyRate * rates.overtimeMultiplierHigh

  const nightBonus = total.night * hourlyRate * rates.nightBonusRate

  const grossTotal = baseAmount + overtimeLowAmount + overtimeHighAmount + nightBonus

  return {
    baseHours, baseAmount,
    offWorkedHours, // informatif : déjà inclus dans overtimeLowHours/overtimeHighHours
    overtimeLowHours, overtimeHighHours, overtimeLowAmount, overtimeHighAmount,
    nightHours: total.night, nightBonus,
    grossTotal
  }
}

// Simulation complète : un résultat par mois présent dans shifts.
export function computePayroll(shifts, hourlyRate, rates = DEFAULT_RATES) {
  return monthlyDetail(shifts).map(m => ({
    key: m.key,
    label: m.label,
    sheet: m.sheet, // nom d'onglet court ("Juil 2026"), pour l'export Excel
    rows: m.rows, // détail jour par jour, pour le relevé d'heures inclus dans les exports paie
    payroll: computeMonthPayroll(m, hourlyRate, rates)
  }))
}

// Lignes de catégorie communes à l'UI, l'export PDF et l'export Excel — une seule source
// de vérité pour éviter que les trois recalculent chacun leur propre montant.
// Libellés en toutes lettres plutôt qu'avec des symboles mathématiques (≤/>) : les polices de
// base de jsPDF (WinAnsi/CP1252) n'ont pas le glyphe "≤", ce qui produisait du texte corrompu
// dans le PDF exporté.
export function payrollRows(p) {
  return [
    { label: 'Heures normales', hours: p.baseHours, amount: p.baseAmount },
    { label: "Heures sup jusqu'à 34h (+25%)", hours: p.overtimeLowHours, amount: p.overtimeLowAmount },
    { label: 'Heures sup au-delà de 34h (+50%)', hours: p.overtimeHighHours, amount: p.overtimeHighAmount },
    { label: 'Prime de nuit (+25%)', hours: p.nightHours, amount: p.nightBonus }
  ]
}
