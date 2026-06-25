import { parseLocal } from './date'
function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
  return { year: date.getUTCFullYear(), week }
}

function bucketKey(dateStr, granularity) {
  const d = parseLocal(dateStr)
  switch (granularity) {
    case 'day': return dateStr
    case 'week': { const { year, week } = isoWeek(d); return `${year}-S${String(week).padStart(2, '0')}` }
    case 'month': return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    case 'year': return String(d.getFullYear())
    default: return dateStr
  }
}

export function aggregate(missions, shifts, granularity) {
  const map = new Map()
  const ensure = (key) => {
    if (!map.has(key)) map.set(key, { key, tips: 0, count: 0, served: 0, pax: 0, issues: 0, noShows: 0, hours: 0 })
    return map.get(key)
  }

  for (const m of missions) {
    const b = ensure(bucketKey(m.intervention_date, granularity))
    const noShow = !!m.is_no_show
    b.tips += Number(m.tip_amount || 0)
    b.count += 1
    if (!noShow) { b.served += 1; b.pax += Number(m.pax_count || 0) }
    if (m.has_issue) b.issues += 1
    if (noShow) b.noShows += 1
  }

  for (const s of (shifts || [])) {
    const b = ensure(bucketKey(s.shift_date, granularity))
    b.hours += Number(s.hours || 0)
  }

  return [...map.values()]
    .map(b => ({
      ...b,
      tipPerPax: b.pax > 0 ? b.tips / b.pax : 0,
      tipPerHour: b.hours > 0 ? b.tips / b.hours : 0
    }))
    .sort((a, b) => (a.key < b.key ? 1 : -1))
}
