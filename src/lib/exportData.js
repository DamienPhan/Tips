import { todayLocal } from './date'
import { isRestDay } from './parseShift'

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const DOW = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function fmtHours(h) {
  const totalMin = Math.round(Number(h || 0) * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`
}

function fmtClock(min) {
  const n = Number(min)
  if (!Number.isFinite(n)) return '—'
  const h = Math.floor(n / 60) % 24
  const m = ((n % 60) + 60) % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

function dayName(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-').map(Number)
  return DOW[new Date(y, m - 1, d).getDay()]
}

export function monthlyDetail(shifts) {
  const map = new Map()
  for (const s of shifts) {
    if (!s.shift_date) continue // ligne corrompue (date manquante) : ignorée plutôt que de faire échouer tout l'export
    const key = s.shift_date.slice(0, 7)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(s)
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, list]) => {
      const [y, mo] = key.split('-')
      const rows = list.slice().sort((a, b) => (a.shift_date < b.shift_date ? -1 : 1))
      const total = rows.reduce((acc, s) => ({
        hours: acc.hours + Number(s.hours || 0),
        overtime: acc.overtime + Number(s.overtime_hours || 0),
        night: acc.night + Number(s.night_hours || 0),
        nightOvertime: acc.nightOvertime + Number(s.night_overtime_hours || 0)
      }), { hours: 0, overtime: 0, night: 0, nightOvertime: 0 })
      return { key, label: `${MONTHS[+mo - 1]} ${y}`, sheet: `${MONTHS[+mo - 1].slice(0, 4)} ${y}`, rows, total }
    })
}

const HEAD = ['Date', 'Jour', 'Horaires', 'Durée', 'Sup', 'Nuit', 'Sup nuit']

function rowCells(s) {
  return [
    s.shift_date,
    dayName(s.shift_date),
    isRestDay(s) ? 'OFF' : `${fmtClock(s.start_min)} – ${fmtClock(s.end_min)}`,
    fmtHours(s.hours),
    fmtHours(s.overtime_hours),
    fmtHours(s.night_hours),
    fmtHours(s.night_overtime_hours)
  ]
}

export async function exportXlsx(shifts, monthKey) {
  const XLSX = await import('xlsx')
  const months = monthlyDetail(shifts)
  const wb = XLSX.utils.book_new()
  for (const m of months) {
    const data = [
      HEAD,
      ...m.rows.map(rowCells),
      ['TOTAL', '', '', fmtHours(m.total.hours), fmtHours(m.total.overtime), fmtHours(m.total.night), fmtHours(m.total.nightOvertime)]
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 12 }, { wch: 6 }, { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 9 }]
    XLSX.utils.book_append_sheet(wb, ws, m.sheet)
  }
  if (months.length === 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEAD]), 'Vide')
  XLSX.writeFile(wb, `heures-${months[0]?.key || monthKey || todayLocal().slice(0, 7)}.xlsx`)
}

export async function exportPdf(shifts, monthKey) {
  const { jsPDF } = await import('jspdf')
  const months = monthlyDetail(shifts)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const X = [16, 46, 66, 108, 130, 152, 176]

  months.forEach((m, idx) => {
    if (idx > 0) doc.addPage()
    let y = 20
    doc.setFontSize(16)
    doc.text(m.label, W / 2, y, { align: 'center' })
    y += 6
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text('Plage nuit 22h–7h', W / 2, y, { align: 'center' })
    doc.setTextColor(0)
    y += 10

    doc.setFontSize(9)
    doc.setFillColor(240)
    doc.rect(14, y - 5, W - 28, 8, 'F')
    doc.setFont(undefined, 'bold')
    HEAD.forEach((h, i) => doc.text(h, X[i], y))
    doc.setFont(undefined, 'normal')
    y += 8

    m.rows.forEach(s => {
      rowCells(s).forEach((c, i) => doc.text(String(c), X[i], y))
      y += 6.5
      if (y > 280) { doc.addPage(); y = 20 }
    })

    doc.setDrawColor(180)
    doc.line(14, y - 3, W - 14, y - 3)
    doc.setFont(undefined, 'bold')
    doc.text('TOTAL', X[0], y + 3)
    doc.text(fmtHours(m.total.hours), X[3], y + 3)
    doc.text(fmtHours(m.total.overtime), X[4], y + 3)
    doc.text(fmtHours(m.total.night), X[5], y + 3)
    doc.text(fmtHours(m.total.nightOvertime), X[6], y + 3)
    doc.setFont(undefined, 'normal')
  })

  if (months.length === 0) doc.text('Aucune donnée.', W / 2, 40, { align: 'center' })
  doc.save(`heures-${months[0]?.key || monthKey || todayLocal().slice(0, 7)}.pdf`)
}
