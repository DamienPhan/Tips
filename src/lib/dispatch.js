const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

export const DISPATCH_RATE = 0.10

// Total tips du mois calendaire précédent (par rapport à refDate).
export function lastMonthTips(missions, refDate = new Date()) {
  const d = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1)
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const total = missions
    .filter(m => m.intervention_date.slice(0, 7) === key)
    .reduce((s, m) => s + Number(m.tip_amount || 0), 0)
  const dispatch = total * DISPATCH_RATE
  return { key, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, total, dispatch, net: total - dispatch }
}

// Total tips par mois, décroissant (mois récent en premier).
export function tipsByMonth(missions) {
  const map = new Map()
  for (const m of missions) {
    const key = m.intervention_date.slice(0, 7)
    map.set(key, (map.get(key) || 0) + Number(m.tip_amount || 0))
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, total]) => {
      const [y, mo] = key.split('-')
      const dispatch = total * DISPATCH_RATE
      return {
        key,
        label: `${MONTHS[+mo - 1]} ${y}`,
        total,
        dispatch,
        net: total - dispatch
      }
    })
}
