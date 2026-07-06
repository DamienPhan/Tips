import { monthlyDetail } from './monthlyDetail'

export const DEFAULT_RATES = {
  overtimeThresholdHours: 33,  // les 33 premières heures de sup dans le mois à +25%, à partir de la 34e heure : +50%
  overtimeMultiplierLow: 1.25, // heures sup jusqu'à la 33e heure
  overtimeMultiplierHigh: 1.5, // heures sup à partir de la 34e heure
  nightBonusRate: 0.25,        // prime de nuit, en supplément du taux de base
  offWorkedBonusRate: 0.25     // prime jour OFF travaillé, en supplément du taux de base
}

// Calcule la simulation de paie pour un mois (élément retourné par monthlyDetail()).
// Jour OFF travaillé et heures de nuit sont deux primes à part, chacune +25% en plus du taux de
// base sur chaque heure concernée (même mécanique que la prime de nuit) — ces heures ne rejoignent
// plus le pool des heures sup normales et n'affectent pas le seuil mensuel de 33h/50%.
export function computeMonthPayroll(month, hourlyRate, rates = DEFAULT_RATES) {
  const total = month.total
  const offWorkedHours = total.offWorked

  // Les heures d'un jour OFF travaillé comptent comme des heures normales pour leur paie de base
  // (la prime jour OFF ci-dessous s'ajoute par-dessus) ; seules les vraies heures sup (jour normal)
  // alimentent le pool majoré à 25%/50%.
  const baseHours = Math.max(0, total.hours - total.overtime)
  const baseAmount = baseHours * hourlyRate

  const overtimeLowHours = Math.min(total.overtime, rates.overtimeThresholdHours)
  const overtimeHighHours = Math.max(0, total.overtime - rates.overtimeThresholdHours)
  const overtimeLowAmount = overtimeLowHours * hourlyRate * rates.overtimeMultiplierLow
  const overtimeHighAmount = overtimeHighHours * hourlyRate * rates.overtimeMultiplierHigh

  const nightBonus = total.night * hourlyRate * rates.nightBonusRate
  const offWorkedBonus = offWorkedHours * hourlyRate * rates.offWorkedBonusRate

  const grossTotal = baseAmount + overtimeLowAmount + overtimeHighAmount + nightBonus + offWorkedBonus

  return {
    baseHours, baseAmount,
    offWorkedHours, offWorkedBonus,
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
  const rows = [
    { label: 'Heures normales', hours: p.baseHours, amount: p.baseAmount },
    { label: "Heures sup jusqu'à 33h (+25%)", hours: p.overtimeLowHours, amount: p.overtimeLowAmount },
    { label: 'Heures sup à partir de 34h (+50%)', hours: p.overtimeHighHours, amount: p.overtimeHighAmount },
    { label: 'Prime de nuit (+25%)', hours: p.nightHours, amount: p.nightBonus }
  ]
  if (p.offWorkedHours > 0) {
    rows.push({ label: 'Prime jour OFF (+25%)', hours: p.offWorkedHours, amount: p.offWorkedBonus })
  }
  return rows
}
