import { parseLocal } from './date'

function isoWeek(dateStr) {
  const d = parseLocal(dateStr)
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-S${String(week).padStart(2, '0')}`
}

// Histogramme adaptatif : semaine->jours, mois->semaines, année->mois.
// `count` exclut les pourboires rapides (tip_only, voir Calendar.jsx) : ce ne sont pas des missions
// traitées, seul leur montant doit gonfler `tips` — sinon le tap-detail "X missions" sous le
// graphe (Home.jsx) compte des notes de pourboire comme des interventions.
export function revenueBars(missions, period) {
  const map = new Map()
  for (const m of missions) {
    let key
    if (period === 'year') key = m.intervention_date.slice(0, 7)
    else if (period === 'month') key = isoWeek(m.intervention_date)
    else key = m.intervention_date
    if (!map.has(key)) map.set(key, { tips: 0, count: 0 })
    const b = map.get(key)
    b.tips += Number(m.tip_amount || 0)
    if (!m.tip_only) b.count += 1
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, { tips, count }]) => ({ key, tips, count }))
}

// "Jour travaillé" (Home.jsx) : inclut les pourboires rapides (tip_only, voir Calendar.jsx) dans le
// calcul de moyenne — contrairement à missionCount/revenueBars' count, qui les excluent parce qu'ils
// ne représentent pas une intervention traitée. Une tentative précédente les excluait aussi ici, sur
// l'hypothèse qu'un pourboire seul ne prouvait pas qu'un jour avait été travaillé — regressé en
// pratique : un utilisateur se servant de "+ Ajouter un pourboire" comme méthode principale (jamais
// de mission complète créée) se retrouvait avec "Moyenne par jour travaillé" bloquée à 0,00 € en
// permanence (`byDay` toujours vide), alors que le Calendrier montrait bien des jours travaillés
// avec de vrais horaires et des gains réels ce mois-là. Un pourboire rapide reste, par définition
// (voir Calendar.jsx), de l'argent perçu un jour où l'utilisateur affirme avoir travaillé — la bonne
// alternative aurait été de croiser avec les shifts du jour, mais cette fonction ne reçoit que
// `missions`, pas `shifts` (Home.jsx l'appelle avec `monthMissions` uniquement).
export function dailyAverage(missions) {
  const byDay = new Map()
  for (const m of missions) {
    const k = m.intervention_date
    byDay.set(k, (byDay.get(k) || 0) + Number(m.tip_amount || 0))
  }
  const vals = [...byDay.values()]
  if (vals.length === 0) return { avg: 0, max: 0, min: 0, days: 0 }
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return { avg, max: Math.max(...vals), min: Math.min(...vals), days: vals.length }
}

export function serviceBreakdown(missions) {
  const acc = { ARR: 0, DEP: 0, TRANSIT: 0 }
  for (const m of missions) if (acc[m.service_type] !== undefined) acc[m.service_type] += 1
  return { ...acc, total: acc.ARR + acc.DEP + acc.TRANSIT }
}

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc']

export function barLabel(key, period) {
  if (period === 'year') return MONTHS[+key.slice(5) - 1]
  if (period === 'month') return `S${key.split('-S')[1]}`
  return parseLocal(key).toLocaleDateString('fr-FR', { weekday: 'narrow' })
}
