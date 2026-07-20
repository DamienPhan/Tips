import { MONTHS } from './format'

export const DISPATCH_RATE = 0.10

// Total tips du mois calendaire en cours (par rapport à refDate).
export function currentMonthTips(missions, refDate = new Date()) {
  const d = new Date(refDate.getFullYear(), refDate.getMonth(), 1)
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const total = missions
    .filter(m => m.intervention_date.slice(0, 7) === key)
    .reduce((s, m) => s + Number(m.tip_amount || 0), 0)
  const dispatch = total * DISPATCH_RATE
  return { key, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, total, dispatch, net: total - dispatch }
}
