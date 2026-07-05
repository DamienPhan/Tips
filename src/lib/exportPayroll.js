import { todayLocal } from './date'
import { fmtHours } from './parseShift'
import { payrollRows } from './payroll'

function eur(n) { return `${Number(n || 0).toFixed(2)} €` }

export async function exportPayrollPdf(payrollByMonth, hourlyRate) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const marginX = 14
  const colW = [88, 40, 50] // Catégorie / Heures / Montant
  const colX = [marginX, marginX + colW[0], marginX + colW[0] + colW[1]]
  const tableW = colW[0] + colW[1] + colW[2]
  const rowH = 8

  payrollByMonth.forEach((m, idx) => {
    if (idx > 0) doc.addPage()
    const p = m.payroll
    const rows = payrollRows(p)
    let y = 20

    doc.setFontSize(17)
    doc.setFont(undefined, 'bold')
    doc.text('Simulation de paie', W / 2, y, { align: 'center' })
    doc.setFont(undefined, 'normal')
    y += 7
    doc.setFontSize(11)
    doc.text(m.label, W / 2, y, { align: 'center' })
    y += 6
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text(`Taux horaire : ${hourlyRate.toFixed(2)} €/h`, W / 2, y, { align: 'center' })
    doc.setTextColor(0)
    y += 12

    const tableTop = y
    // En-tête
    doc.setFillColor(235)
    doc.rect(marginX, y, tableW, rowH, 'F')
    doc.setFont(undefined, 'bold')
    doc.setFontSize(9.5)
    doc.text('Catégorie', colX[0] + 3, y + rowH / 2 + 1.2)
    doc.text('Heures', colX[1] + colW[1] - 3, y + rowH / 2 + 1.2, { align: 'right' })
    doc.text('Montant', colX[2] + colW[2] - 3, y + rowH / 2 + 1.2, { align: 'right' })
    doc.setFont(undefined, 'normal')
    y += rowH

    rows.forEach(r => {
      doc.setFontSize(9.5)
      doc.text(r.label, colX[0] + 3, y + rowH / 2 + 1.2)
      doc.text(fmtHours(r.hours), colX[1] + colW[1] - 3, y + rowH / 2 + 1.2, { align: 'right' })
      doc.text(eur(r.amount), colX[2] + colW[2] - 3, y + rowH / 2 + 1.2, { align: 'right' })
      y += rowH
    })

    if (p.offWorkedHours > 0) {
      doc.setFontSize(8)
      doc.setTextColor(130)
      doc.text(`dont ${fmtHours(p.offWorkedHours)} de jours OFF travaillés, inclus dans les heures sup ci-dessus`, colX[0] + 3, y + rowH / 2 + 1.2)
      doc.setTextColor(0)
      y += rowH
    }

    // TOTAL
    doc.setFillColor(232, 177, 76)
    doc.rect(marginX, y, tableW, rowH + 1, 'F')
    doc.setFont(undefined, 'bold')
    doc.setFontSize(10.5)
    doc.text('TOTAL BRUT ESTIMÉ', colX[0] + 3, y + (rowH + 1) / 2 + 1.2)
    doc.text(eur(p.grossTotal), colX[2] + colW[2] - 3, y + (rowH + 1) / 2 + 1.2, { align: 'right' })
    doc.setFont(undefined, 'normal')
    const tableBottom = y + rowH + 1

    // Grille : contour + séparateurs de colonnes + lignes horizontales
    doc.setDrawColor(180)
    doc.rect(marginX, tableTop, tableW, tableBottom - tableTop)
    doc.line(colX[1], tableTop, colX[1], tableBottom)
    doc.line(colX[2], tableTop, colX[2], tableBottom)
    for (let ly = tableTop + rowH; ly < tableBottom - 1; ly += rowH) {
      doc.line(marginX, ly, marginX + tableW, ly)
    }

    y = tableBottom + 10
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text('Simulation indicative — hors charges sociales et prélèvement à la source.', marginX, y)
    doc.setTextColor(0)
  })

  doc.save(`simulation-paie-${payrollByMonth[0]?.key || todayLocal().slice(0, 7)}.pdf`)
}

export async function exportPayrollXlsx(payrollByMonth, hourlyRate) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  payrollByMonth.forEach(m => {
    const p = m.payroll
    const rows = payrollRows(p)
    const data = [
      ['Simulation de paie', m.label],
      ['Taux horaire (€/h)', hourlyRate],
      [],
      ['Catégorie', 'Heures', 'Montant (€)'],
      ...rows.map(r => [r.label, Number(r.hours.toFixed(2)), Number(r.amount.toFixed(2))]),
      ...(p.offWorkedHours > 0 ? [[`dont jours OFF travaillés (inclus ci-dessus)`, Number(p.offWorkedHours.toFixed(2)), '']] : []),
      ['TOTAL BRUT ESTIMÉ', '', Number(p.grossTotal.toFixed(2))]
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 34 }, { wch: 12 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws, m.key.slice(0, 4) + m.key.slice(5))
  })

  if (payrollByMonth.length === 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Aucune donnée']]), 'Vide')
  XLSX.writeFile(wb, `simulation-paie-${payrollByMonth[0]?.key || todayLocal().slice(0, 7)}.xlsx`)
}
