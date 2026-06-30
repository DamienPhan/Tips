const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function fmtHours(h) {
  const totalMin = Math.round(Number(h || 0) * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`
}

export function monthlyHours(shifts) {
  const map = new Map()
  for (const s of shifts) {
    const key = s.shift_date.slice(0, 7)
    if (!map.has(key)) map.set(key, { key, days: 0, hours: 0, overtime: 0, night: 0, nightOvertime: 0, offDays: 0 })
    const b = map.get(key)
    b.days += 1
    b.hours += Number(s.hours || 0)
    b.overtime += Number(s.overtime_hours || 0)
    b.night += Number(s.night_hours || 0)
    b.nightOvertime += Number(s.night_overtime_hours || 0)
    if (s.is_day_off) b.offDays += 1
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).map(b => {
    const [y, mo] = b.key.split('-')
    return { ...b, label: `${MONTHS[+mo - 1]} ${y}` }
  })
}

export function hoursTotals(rows) {
  return rows.reduce((acc, r) => ({
    days: acc.days + r.days,
    hours: acc.hours + r.hours,
    overtime: acc.overtime + r.overtime,
    night: acc.night + r.night,
    nightOvertime: acc.nightOvertime + r.nightOvertime,
    offDays: acc.offDays + r.offDays
  }), { days: 0, hours: 0, overtime: 0, night: 0, nightOvertime: 0, offDays: 0 })
}

export async function exportXlsx(shifts) {
  const XLSX = await import('xlsx')
  const rows = monthlyHours(shifts)
  const totals = hoursTotals(rows)
  const r2 = n => Number(Number(n).toFixed(2))
  const data = [
    ['Mois', 'Jours', 'Heures totales', 'Heures sup.', 'Heures de nuit', 'Sup de nuit', 'Jours OFF'],
    ...rows.map(r => [r.label, r.days, r2(r.hours), r2(r.overtime), r2(r.night), r2(r.nightOvertime), r.offDays]),
    ['TOTAL', totals.days, r2(totals.hours), r2(totals.overtime), r2(totals.night), r2(totals.nightOvertime), totals.offDays]
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 16 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Heures')
  XLSX.writeFile(wb, `heures-${new Date().getFullYear()}.xlsx`)
}

export async function exportPdf(shifts) {
  const { jsPDF } = await import('jspdf')
  const rows = monthlyHours(shifts)
  const totals = hoursTotals(rows)
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const W = 297
  let y = 20

  doc.setFontSize(18)
  doc.text('Relevé des heures travaillées', W / 2, y, { align: 'center' })
  y += 7
  doc.setFontSize(10)
  doc.setTextColor(120)
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} · plage nuit 22h–7h`, W / 2, y, { align: 'center' })
  doc.setTextColor(0)
  y += 12

  const cols = [
    { h: 'Mois', x: 16 },
    { h: 'Jours', x: 70 },
    { h: 'Heures', x: 100 },
    { h: 'H. sup.', x: 135 },
    { h: 'H. nuit', x: 170 },
    { h: 'Sup nuit', x: 210 },
    { h: 'Jours OFF', x: 250 }
  ]
  doc.setFontSize(10)
  doc.setFillColor(240)
  doc.rect(14, y - 5, W - 28, 8, 'F')
  doc.setFont(undefined, 'bold')
  cols.forEach(c => doc.text(c.h, c.x, y))
  doc.setFont(undefined, 'normal')
  y += 8

  rows.forEach(r => {
    doc.text(r.label, cols[0].x, y)
    doc.text(String(r.days), cols[1].x, y)
    doc.text(fmtHours(r.hours), cols[2].x, y)
    doc.text(fmtHours(r.overtime), cols[3].x, y)
    doc.text(fmtHours(r.night), cols[4].x, y)
    doc.text(fmtHours(r.nightOvertime), cols[5].x, y)
    doc.text(String(r.offDays), cols[6].x, y)
    y += 7
    if (y > 190) { doc.addPage(); y = 20 }
  })

  doc.setDrawColor(180)
  doc.line(14, y - 3, W - 14, y - 3)
  doc.setFont(undefined, 'bold')
  doc.text('TOTAL', cols[0].x, y + 3)
  doc.text(String(totals.days), cols[1].x, y + 3)
  doc.text(fmtHours(totals.hours), cols[2].x, y + 3)
  doc.text(fmtHours(totals.overtime), cols[3].x, y + 3)
  doc.text(fmtHours(totals.night), cols[4].x, y + 3)
  doc.text(fmtHours(totals.nightOvertime), cols[5].x, y + 3)
  doc.text(String(totals.offDays), cols[6].x, y + 3)

  doc.save(`heures-${new Date().getFullYear()}.pdf`)
}
