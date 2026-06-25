import { parseLocal } from './date'
import { WEEKLY_BASE_HOURS } from './parseShift'

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function jsDay(dateStr) {
  const d = parseLocal(dateStr).getDay()
  return d === 0 ? 6 : d - 1
}

function isoWeekKey(dateStr) {
  const d = parseLocal(dateStr)
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-S${String(week).padStart(2, '0')}`
}

export function tipTrend(missions, granularity) {
  const map = new Map()
  for (const m of missions) {
    const key = granularity === 'week' ? isoWeekKey(m.intervention_date)
      : granularity === 'month' ? m.intervention_date.slice(0, 7)
      : m.intervention_date
    if (!map.has(key)) map.set(key, { tips: 0, count: 0 })
    const b = map.get(key)
    b.tips += Number(m.tip_amount || 0)
    b.count += 1
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, { tips, count }]) => ({ key, value: tips, count, avg: count > 0 ? tips / count : 0 }))
}

export function dailyAverage(missions) {
  const byDay = new Map()
  for (const m of missions) {
    const k = m.intervention_date
    if (!byDay.has(k)) byDay.set(k, 0)
    byDay.set(k, byDay.get(k) + Number(m.tip_amount || 0))
  }
  const vals = [...byDay.values()]
  if (vals.length === 0) return { avg: 0, max: 0, min: 0 }
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return { avg, max: Math.max(...vals), min: Math.min(...vals), days: vals.length }
}

export function serviceBreakdown(missions) {
  const acc = { ARR: 0, DEP: 0, TRANSIT: 0 }
  for (const m of missions) if (acc[m.service_type] !== undefined) acc[m.service_type] += 1
  const total = acc.ARR + acc.DEP + acc.TRANSIT
  return { ...acc, total }
}

export function heatmap(missions) {
  // grille jour de semaine (0=Lun..6=Dim) x créneau horaire (0..23 regroupé en 6 tranches de 4h)
  const SLOTS = 6
  const grid = Array.from({ length: 7 }, () => new Array(SLOTS).fill(0))
  let max = 0
  for (const m of missions) {
    const day = jsDay(m.intervention_date)
    // sans heure de mission précise, on répartit sur la tranche dérivée du flight si dispo, sinon ignore
    // ici on n'a pas d'heure -> on compte le volume par jour, tranche = index 0 fallback
    grid[day][0] += Number(m.tip_amount || 0)
    if (grid[day][0] > max) max = grid[day][0]
  }
  return { grid, max, days: DAYS, slots: ['Tips'] }
}

export function weeklyOvertime(shifts) {
  const map = new Map()
  for (const s of shifts) {
    const key = isoWeekKey(s.shift_date)
    if (!map.has(key)) map.set(key, { key, worked: 0, dailyOt: 0 })
    const b = map.get(key)
    b.worked += Number(s.hours || 0)
    b.dailyOt += Number(s.overtime_hours || 0)
  }
  return [...map.values()]
    .map(b => ({ ...b, weeklyOt: Math.max(0, Math.round((b.worked - WEEKLY_BASE_HOURS) * 10) / 10) }))
    .sort((a, b) => (a.key < b.key ? 1 : -1))
}

export function calendarData(shifts) {
  return shifts.map(s => ({
    date: s.shift_date,
    hours: Number(s.hours || 0),
    overtime: Number(s.overtime_hours || 0)
  })).sort((a, b) => (a.date < b.date ? 1 : -1))
}
