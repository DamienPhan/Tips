import { todayLocal } from './date'
import { fmtHours } from './parseShift'

export async function exportPayrollPdf(payrollByMonth, hourlyRate) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210

  payrollByMonth.forEach((m, idx) => {
    if (idx > 0) doc.addPage()
    const p = m.payroll
    let y = 20

    doc.setFontSize(16)
    doc.text(`Simulation de paie — ${m.label}`, W / 2, y, { align: 'center' })
    y += 6
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text(`Taux horaire : ${hourlyRate.toFixed(2)} €/h`, W / 2, y, { align: 'center' })
    doc.setTextColor(0)
    y += 12

    const rows = [
      ['Heures normales', fmtHours(p.baseHours), `${p.baseAmount.toFixed(2)} €`],
      ['Heures sup (≤ 34h, +25%)', fmtHours(p.overtimeLowHours), `${(p.overtimeLowHours * hourlyRate * 1.25).toFixed(2)} €`],
      ['Heures sup (> 34h, +50%)', fmtHours(p.overtimeHighHours), `${(p.overtimeHighHours * hourlyRate * 1.5).toFixed(2)} €`],
      ['Prime de nuit (+25%)', fmtHours(p.nightHours), `${p.nightBonus.toFixed(2)} €`]
    ]
    if (p.offWorkedHours > 0) {
      rows.push([`  dont jours OFF travaillés`, fmtHours(p.offWorkedHours), '(incluses ci-dessus)'])
    }

    doc.setFontSize(10)
    doc.setFillColor(240)
    doc.rect(14, y - 5, W - 28, 8, 'F')
    doc.setFont(undefined, 'bold')
    doc.text('Catégorie', 16, y)
    doc.text('Durée', 120, y)
    doc.text('Montant', 165, y)
    doc.setFont(undefined, 'normal')
    y += 10

    rows.forEach(([label, dur, amt]) => {
      doc.text(label, 16, y)
      doc.text(dur, 120, y)
      doc.text(amt, 165, y)
      y += 8
    })

    doc.setDrawColor(180)
    doc.line(14, y, W - 14, y)
    y += 8
    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.text('TOTAL BRUT ESTIMÉ', 16, y)
    doc.text(`${p.grossTotal.toFixed(2)} €`, 165, y)
    doc.setFont(undefined, 'normal')

    y += 10
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text('Simulation indicative — hors charges sociales et prélèvement à la source.', 16, y)
    doc.setTextColor(0)
  })

  doc.save(`simulation-paie-${payrollByMonth[0]?.key || todayLocal().slice(0, 7)}.pdf`)
}
