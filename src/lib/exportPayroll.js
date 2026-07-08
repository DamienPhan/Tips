import { todayLocal } from './date'
import { fmtHours } from './parseShift'
import { payrollRows } from './payroll'
import { SHIFT_TABLE_HEAD, shiftRowCells, shiftTotalsRow } from './shiftRows'

function eur(n) { return `${Number(n || 0).toFixed(2)} €` }

// Helvetica explicite partout (jamais `undefined` comme nom de police) : passer `undefined` à
// setFont() est censé "garder la police courante", mais selon l'état interne de jsPDF ça peut
// retomber sur Times au lieu d'Helvetica après un changement de style — d'où un rendu bâtard
// avec deux polices mélangées dans le même document.
const FONT = 'helvetica'

// Couleurs reprises de la charte de l'app (src/index.css --color-amber) pour que le PDF ne
// tranche pas visuellement avec le reste de l'interface.
const AMBER = [232, 177, 76]
const AMBER_TINT = [250, 240, 217]
const ZEBRA_TINT = [250, 246, 235]
const GREY_LINE = [200, 200, 200]

export async function exportPayrollPdf(payrollByMonth, hourlyRate) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setFont(FONT, 'normal')
  const W = 210
  const marginX = 14
  const colW = [88, 40, 50] // Catégorie / Heures / Montant
  const colX = [marginX, marginX + colW[0], marginX + colW[0] + colW[1]]
  const tableW = colW[0] + colW[1] + colW[2]
  const rowH = 9

  payrollByMonth.forEach((m, idx) => {
    if (idx > 0) doc.addPage()
    const p = m.payroll
    const rows = payrollRows(p)
    let y = 22

    doc.setFont(FONT, 'bold')
    doc.setFontSize(18)
    doc.text('Simulation de paie', W / 2, y, { align: 'center' })
    y += 4
    doc.setDrawColor(...AMBER)
    doc.setLineWidth(0.8)
    doc.line(W / 2 - 16, y, W / 2 + 16, y)
    doc.setLineWidth(0.2)
    doc.setDrawColor(0)
    y += 6
    doc.setFont(FONT, 'normal')
    doc.setFontSize(12)
    doc.text(m.label, W / 2, y, { align: 'center' })
    y += 6
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text(`Taux horaire : ${hourlyRate.toFixed(2)} €/h`, W / 2, y, { align: 'center' })
    doc.setTextColor(0)
    y += 12

    // Relevé d'heures détaillé jour par jour (même contenu que l'ancien export "Relevé d'heures"
    // de l'écran Accueil, retiré : tout est désormais réuni dans le PDF de paie) — affiché en
    // premier, avant le récapitulatif de paie.
    const detailX = [14, 38, 56, 92, 110, 130, 154, 176]
    const detailW = W - 28
    if (m.rows?.length) {
      doc.setFillColor(...AMBER)
      doc.rect(marginX, y - 4, 1.2, 5, 'F')
      doc.setFont(FONT, 'bold')
      doc.setFontSize(12)
      doc.text('Détail des heures', marginX + 4, y)
      y += 8

      let zebraIdx = 0
      let chunkTop = 0

      const drawDetailHeader = () => {
        doc.setFontSize(8.5)
        doc.setFillColor(...AMBER_TINT)
        doc.rect(marginX, y - 5, detailW, 7, 'F')
        doc.setFont(FONT, 'bold')
        SHIFT_TABLE_HEAD.forEach((h, i) => doc.text(h, detailX[i], y))
        doc.setFont(FONT, 'normal')
        chunkTop = y - 5
        y += 7
      }
      const closeDetailChunk = () => {
        doc.setDrawColor(...GREY_LINE)
        doc.rect(marginX, chunkTop, detailW, y - chunkTop)
      }

      drawDetailHeader()
      m.rows.forEach(s => {
        if (zebraIdx % 2 === 1) {
          doc.setFillColor(...ZEBRA_TINT)
          doc.rect(marginX, y - 4.5, detailW, 6, 'F')
        }
        shiftRowCells(s).forEach((c, i) => doc.text(String(c), detailX[i], y))
        y += 6
        zebraIdx++
        if (y > 280) {
          closeDetailChunk()
          doc.addPage()
          y = 20
          drawDetailHeader()
        }
      })

      // Ligne de totaux : fond distinct + gras, même si elle prend une septième colonne (Date/Jour
      // vides, "Total" dans la colonne Horaires) plutôt que d'ajouter une colonne dédiée.
      doc.setFillColor(...AMBER_TINT)
      doc.rect(marginX, y - 4.5, detailW, 6, 'F')
      doc.setFont(FONT, 'bold')
      shiftTotalsRow(m.rows).forEach((c, i) => doc.text(String(c), detailX[i], y))
      doc.setFont(FONT, 'normal')
      y += 6

      closeDetailChunk()
      y += 12
    }

    // Le récapitulatif de paie a besoin d'environ 110mm (titre + en-tête + jusqu'à 4 lignes de
    // catégorie + note OFF éventuelle + TOTAL BRUT + cotisations + NET + disclaimer) : on repart
    // sur une nouvelle page plutôt que de le faire chevaucher le bas de la page si le relevé
    // d'heures l'a rempli.
    if (y + 110 > 290) {
      doc.addPage()
      y = 20
    }

    doc.setFillColor(...AMBER)
    doc.rect(marginX, y - 4, 1.2, 5, 'F')
    doc.setFont(FONT, 'bold')
    doc.setFontSize(12)
    doc.text('Récapitulatif de paie', marginX + 4, y)
    y += 8

    const tableTop = y
    // Les lignes n'ont pas toutes la même hauteur (rowH pour l'en-tête/les catégories, rowH+1 pour
    // TOTAL BRUT et NET) : on trace les séparateurs horizontaux à partir des positions `y` réellement
    // atteintes après chaque ligne, plutôt que par un pas fixe qui désaligne la grille dès qu'une
    // ligne surdimensionnée s'intercale (ce qui s'est produit ici avec l'ajout des lignes cotisation/NET).
    const rowBottoms = []

    // En-tête
    doc.setFillColor(...AMBER_TINT)
    doc.rect(marginX, y, tableW, rowH, 'F')
    doc.setFont(FONT, 'bold')
    doc.setFontSize(10)
    doc.text('Catégorie', colX[0] + 3, y + rowH / 2 + 1.2)
    doc.text('Heures', colX[1] + colW[1] - 3, y + rowH / 2 + 1.2, { align: 'right' })
    doc.text('Montant', colX[2] + colW[2] - 3, y + rowH / 2 + 1.2, { align: 'right' })
    y += rowH
    rowBottoms.push(y)

    doc.setFont(FONT, 'normal')
    doc.setFontSize(10)
    rows.forEach(r => {
      doc.text(r.label, colX[0] + 3, y + rowH / 2 + 1.2)
      doc.text(fmtHours(r.hours), colX[1] + colW[1] - 3, y + rowH / 2 + 1.2, { align: 'right' })
      doc.text(eur(r.amount), colX[2] + colW[2] - 3, y + rowH / 2 + 1.2, { align: 'right' })
      y += rowH
      rowBottoms.push(y)
    })

    // TOTAL BRUT
    doc.setFillColor(...AMBER)
    doc.rect(marginX, y, tableW, rowH + 1, 'F')
    doc.setFont(FONT, 'bold')
    doc.setFontSize(11)
    doc.text('TOTAL BRUT ESTIMÉ', colX[0] + 3, y + (rowH + 1) / 2 + 1.2)
    doc.text(eur(p.grossTotal), colX[2] + colW[2] - 3, y + (rowH + 1) / 2 + 1.2, { align: 'right' })
    y += rowH + 1
    rowBottoms.push(y)

    // Cotisations salariales (estimation forfaitaire, voir payroll.js) puis NET
    doc.setFont(FONT, 'normal')
    doc.setFontSize(10)
    doc.text(`Cotisations salariales (est., ${(p.cotisationRate * 100).toFixed(1)}%)`, colX[0] + 3, y + rowH / 2 + 1.2)
    doc.text(`-${eur(p.cotisationAmount)}`, colX[2] + colW[2] - 3, y + rowH / 2 + 1.2, { align: 'right' })
    y += rowH
    rowBottoms.push(y)

    doc.setFillColor(...AMBER)
    doc.rect(marginX, y, tableW, rowH + 1, 'F')
    doc.setFont(FONT, 'bold')
    doc.setFontSize(11)
    doc.text('NET ESTIMÉ', colX[0] + 3, y + (rowH + 1) / 2 + 1.2)
    doc.text(eur(p.netTotal), colX[2] + colW[2] - 3, y + (rowH + 1) / 2 + 1.2, { align: 'right' })
    const tableBottom = y + rowH + 1
    rowBottoms.push(tableBottom)

    // Grille : contour + séparateurs de colonnes + lignes horizontales (une par frontière de ligne
    // réellement dessinée, hors la dernière qui coïncide avec le bord bas déjà tracé par le rect)
    doc.setDrawColor(180)
    doc.rect(marginX, tableTop, tableW, tableBottom - tableTop)
    doc.line(colX[1], tableTop, colX[1], tableBottom)
    doc.line(colX[2], tableTop, colX[2], tableBottom)
    rowBottoms.slice(0, -1).forEach(ly => doc.line(marginX, ly, marginX + tableW, ly))

    y = tableBottom + 10
    doc.setFont(FONT, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text('Simulation indicative — cotisations salariales estimées à taux forfaitaire, hors prélèvement à la source.', marginX, y)
    doc.setTextColor(0)
  })

  doc.save(`simulation-paie-${payrollByMonth[0]?.key || todayLocal().slice(0, 7)}.pdf`)
}

// La build xlsx installée (community edition) ignore silencieusement tout style de cellule
// (gras, couleurs, bordures) à l'écriture — vérifié empiriquement en inspectant le styles.xml
// produit. La clarté vient donc uniquement de la structure (titres en MAJUSCULES isolés par des
// lignes vides, indentation) et des formats numériques réels via `.z` (ceux-là fonctionnent bien).
const EUR_FMT = '#,##0.00" €"'
const HOURS_FMT = '0.00" h"'

export async function exportPayrollXlsx(payrollByMonth, hourlyRate) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  payrollByMonth.forEach(m => {
    const p = m.payroll
    const rows = payrollRows(p)

    const data = []
    const push = row => { data.push(row); return data.length - 1 }

    push(['SIMULATION DE PAIE'])
    push([m.label])
    const rateRow = push(['Taux horaire (€/h)', hourlyRate])
    push([])
    push(['DÉTAIL DE LA RÉMUNÉRATION'])
    push(['Catégorie', 'Heures', 'Montant (€)'])
    const catStart = data.length
    rows.forEach(r => push([r.label, Number(r.hours.toFixed(2)), Number(r.amount.toFixed(2))]))
    const catEnd = data.length
    push([])
    const totalRow = push(['TOTAL BRUT ESTIMÉ', '', Number(p.grossTotal.toFixed(2))])
    const cotisRow = push([`Cotisations salariales (est., ${(p.cotisationRate * 100).toFixed(1)}%)`, '', Number((-p.cotisationAmount).toFixed(2))])
    const netRow = push(['NET ESTIMÉ', '', Number(p.netTotal.toFixed(2))])
    push([])
    push(['Simulation indicative — cotisations salariales estimées à taux forfaitaire, hors prélèvement à la source.'])
    push([])
    push(['DÉTAIL DES HEURES'])
    push(SHIFT_TABLE_HEAD)
    ;(m.rows || []).forEach(s => push(shiftRowCells(s)))
    if (m.rows?.length) push(shiftTotalsRow(m.rows))

    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 50 }, { wch: 11 }, { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 11 }, { wch: 8 }, { wch: 10 }]

    const setFmt = (r, c, fmt) => {
      const addr = XLSX.utils.encode_cell({ r, c })
      if (ws[addr]) ws[addr].z = fmt
    }
    setFmt(rateRow, 1, EUR_FMT)
    for (let r = catStart; r < catEnd; r++) {
      setFmt(r, 1, HOURS_FMT)
      setFmt(r, 2, EUR_FMT)
    }
    setFmt(totalRow, 2, EUR_FMT)
    setFmt(cotisRow, 2, EUR_FMT)
    setFmt(netRow, 2, EUR_FMT)

    XLSX.utils.book_append_sheet(wb, ws, m.sheet)
  })

  if (payrollByMonth.length === 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Aucune donnée']]), 'Vide')
  XLSX.writeFile(wb, `simulation-paie-${payrollByMonth[0]?.key || todayLocal().slice(0, 7)}.xlsx`)
}
