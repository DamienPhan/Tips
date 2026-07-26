export function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// DD/MM/YY plutôt que le YYYY-MM-DD brut d'une date stockée — utilisé partout où une date de
// mission/shift est affichée telle quelle sans passer par un format plus long (jour de semaine +
// mois en toutes lettres), pour éviter d'afficher un ISO illisible à l'utilisateur.
export function fmtDateFr(dateStr) {
  if (!dateStr) return '—'
  const d = parseLocal(dateStr)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}
