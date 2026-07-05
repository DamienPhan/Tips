import { monthlyDetail } from './exportData'

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
  const overtimeAmount =
    overtimeLowHours * hourlyRate * rates.overtimeMultiplierLow +
    overtimeHighHours * hourlyRate * rates.overtimeMultiplierHigh

  const nightBonus = total.night * hourlyRate * rates.nightBonusRate

  const grossTotal = baseAmount + overtimeAmount + nightBonus

  return {
    baseHours, baseAmount,
    offWorkedHours, // informatif : déjà inclus dans overtimeLowHours/overtimeHighHours
    overtimeLowHours, overtimeHighHours, overtimeAmount,
    nightHours: total.night, nightBonus,
    grossTotal
  }
}

// Simulation complète : un résultat par mois présent dans shifts.
export function computePayroll(shifts, hourlyRate, rates = DEFAULT_RATES) {
  return monthlyDetail(shifts).map(m => ({
    key: m.key,
    label: m.label,
    payroll: computeMonthPayroll(m, hourlyRate, rates)
  }))
}
