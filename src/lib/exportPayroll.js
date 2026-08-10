import { todayLocal } from './date'
import { fmtHours } from './parseShift'
import { payrollRows } from './payroll'
import { SHIFT_TABLE_HEAD, shiftRowCells, shiftTotalsRow } from './shiftRows'

// n === null (voir la ligne informative "Heures supplémentaires du mois dernier" dans payrollRows())
// n'a délibérément pas de montant propre — distinct de 0 €, qui reste un montant réel affiché normalement.
function eur(n) { return n == null ? '—' : `${Number(n).toFixed(2)} €` }

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

// Hauteur de contenu (mm) qu'occupera exportPayrollPdf en mode hoursOnly pour un mois donné — mêmes
// incréments de `y` que la boucle de dessin plus bas (titre/sous-titre fixes = 50mm, puis en-tête +
// sections + lignes + total du tableau), calculée à l'avance pour dimensionner une page A4 sur mesure
// plutôt que de garder la hauteur A4 complète (297mm) avec un grand vide en bas dès que le mois est
// court — le cas visible sur un relevé d'un seul mois avec peu de shifts. Ne sert que si le résultat
// tient sur une seule page (≤ 280mm, même seuil que le saut de page de la boucle de dessin) ; sinon on
// retombe sur une A4 standard et la pagination existante prend le relais normalement.
function estimateHoursOnlyBottom(m) {
  const carriedInRows = m.carriedInRows || []
  const carriedOutRows = m.carriedOutRows || []
  const ownCountedRows = m.ownCountedRows || []
  const allDetailRows = [...carriedInRows, ...(m.rows || [])]
  let y = 50
  if (allDetailRows.length) {
    y += 8 + 7 + 7 // titre "Détail des heures" + note "Sup : pause déjà retirée" + en-tête du tableau
    if (carriedInRows.length) {
      y += 5 + 6 * carriedInRows.length // étiquette "Report du mois précédent" + ses lignes
      if (ownCountedRows.length) y += 5 // étiquette du mois propre
    }
    y += 6 * ownCountedRows.length
    if (carriedOutRows.length) y += 5 + 6 * carriedOutRows.length // étiquette "Reporté au mois prochain" + ses lignes
    y += 6 // ligne Total
    y += 12
  } else {
    y += 10 // "Aucune heure enregistrée pour ce mois."
  }
  return y
}

// options.hoursOnly : n'exporte que le relevé "Détail des heures" (avec sa ligne Total), sans le
// récapitulatif de paie — pour un simple relevé d'heures sans les montants, distinct du PDF complet.
export async function exportPayrollPdf(payrollByMonth, hourlyRate, options = {}) {
  const hoursOnly = !!options.hoursOnly
  const { jsPDF } = await import('jspdf')
  let pageFormat = 'a4'
  let orientation = 'p'
  if (hoursOnly && payrollByMonth.length === 1) {
    const estimated = estimateHoursOnlyBottom(payrollByMonth[0])
    if (estimated <= 280) {
      const height = Math.max(estimated + 10, 60)
      pageFormat = [210, height]
      // jsPDF force la largeur ≤ hauteur en mode "portrait" (et inversement en "landscape") en
      // permutant silencieusement le format fourni s'il ne respecte pas cette contrainte — pour un
      // relevé court, `height` est plus petite que la largeur fixe de 210mm (page volontairement plus
      // large que haute), donc "portrait" l'aurait permuté et cassé tout le calage des colonnes
      // (calibrées sur 210mm de large). "landscape" est ici un simple choix technique pour éviter
      // cette permutation, pas une vraie orientation paysage — pour un relevé plus long où `height`
      // dépasse 210mm, la page redevient plus haute que large et "portrait" est le bon choix pour la
      // même raison (ne pas déclencher la permutation dans l'autre sens).
      orientation = height < 210 ? 'l' : 'p'
    }
  }
  const doc = new jsPDF({ unit: 'mm', format: pageFormat, orientation })
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
    doc.text(hoursOnly ? 'Détail des heures' : 'Simulation de paie', W / 2, y, { align: 'center' })
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
    // Le taux horaire n'a pas sa place dans un relevé d'heures sans montants ; on garde le même
    // avancement de `y` dans les deux cas pour que le tableau démarre à la même position.
    if (!hoursOnly) doc.text(`Taux horaire : ${hourlyRate.toFixed(2)} €/h`, W / 2, y, { align: 'center' })
    doc.setTextColor(0)
    y += 12

    // Relevé d'heures détaillé jour par jour (même contenu que l'ancien export "Relevé d'heures"
    // de l'écran Accueil, retiré : tout est désormais réuni dans le PDF de paie) — affiché en
    // premier, avant le récapitulatif de paie.
    // 7 colonnes (Date/Jour/Horaires/Durée/Sup/OFF trav./Nuit — plus de "Sup nuit", retirée du
    // tableau) réparties sur toute la largeur disponible plutôt que de garder les positions calées
    // sur l'ancienne 8e colonne, ce qui aurait laissé un grand vide à droite du tableau.
    const detailX = [14, 38, 56, 92, 118, 144, 174]
    const detailW = W - 28
    // carriedInRows/carriedOutRows/ownCountedRows/cutoffRows sont précalculés par monthlyDetail()
    // (voir son commentaire) plutôt que recalculés ici — exportPayrollXlsx en a besoin à l'identique,
    // pour que les deux exports ne puissent jamais diverger l'un de l'autre sur ce report.
    const carriedInRows = m.carriedInRows || []
    const carriedOutRows = m.carriedOutRows || []
    const ownCountedRows = m.ownCountedRows || []
    const cutoffRows = m.cutoffRows || []
    const allDetailRows = [...carriedInRows, ...(m.rows || [])]
    if (allDetailRows.length) {
      doc.setFillColor(...AMBER)
      doc.rect(marginX, y - 4, 1.2, 5, 'F')
      doc.setFont(FONT, 'bold')
      doc.setFontSize(12)
      doc.text('Détail des heures', marginX + 4, y)
      y += 8

      // La colonne Sup ne compte que les heures au-delà de 8h30 (BASE_SHIFT_MIN, voir
      // parseShift.js) : la pause d'1h qui sépare ce seuil des 7h30 d'"heures normales" est donc
      // déjà retirée avant que les heures sup ne commencent à être comptées ici — précisé pour ne
      // pas laisser croire que la pause a été oubliée quand la colonne Sup paraît plus basse
      // qu'attendu pour un shift donné. OFF trav. a la même mécanique avec un seuil différent
      // (OFF_DAY_BREAK_THRESHOLD_MIN, 7h) — précisé pour la même raison.
      doc.setFont(FONT, 'italic')
      doc.setFontSize(7.5)
      doc.setTextColor(120)
      doc.text("Sup : heure de pause (1h) déjà retirée du calcul. OFF trav. : idem à partir de la 7e heure.", marginX + 4, y)
      doc.setTextColor(0)
      doc.setFont(FONT, 'normal')
      y += 7

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
      // Étiquette italique introduisant les shifts du 26-fin du mois précédent/reportés au mois
      // suivant dont la majoration (sup ou jour OFF) est comptée dans un autre bulletin que celui de
      // leur propre mois calendaire (voir monthlyDetail.js/payrollCutoffMonthKey) — sans elle, ces
      // lignes se confondraient avec le relevé normal et sembleraient être une erreur plutôt qu'un
      // report intentionnel.
      const drawSectionLabel = text => {
        doc.setFont(FONT, 'italic')
        doc.setFontSize(7.5)
        doc.setTextColor(120)
        doc.text(text, detailX[0], y)
        doc.setTextColor(0)
        doc.setFont(FONT, 'normal')
        doc.setFontSize(8.5)
        y += 5
        if (y > 280) {
          closeDetailChunk()
          doc.addPage()
          y = 20
          drawDetailHeader()
        }
      }
      const drawRow = s => {
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
      }

      drawDetailHeader()
      if (carriedInRows.length) {
        drawSectionLabel('Report du mois précédent (après le 25) :')
        carriedInRows.forEach(drawRow)
        if (ownCountedRows.length) drawSectionLabel(`${m.label} :`)
      }
      ownCountedRows.forEach(drawRow)
      if (carriedOutRows.length) {
        drawSectionLabel('Reporté au mois prochain (après le 25) :')
        carriedOutRows.forEach(drawRow)
      }

      // Ligne de totaux : fond distinct + gras, même si elle prend une colonne vide (Date/Jour
      // vides, "Total" dans la colonne Horaires) plutôt que d'ajouter une colonne dédiée. Durée
      // reste sommée sur m.rows en entier (mois calendaire complet, y compris les shifts reportés
      // au mois suivant — leur durée reste comptée ce mois-ci, voir monthlyDetail.js). Sup/OFF
      // trav./Nuit sont sommées sur `cutoffRows` (carriedInRows + ownCountedRows), l'ensemble exact
      // des lignes visiblement affichées ci-dessus dont la majoration compte dans ce bulletin — et non
      // imposées depuis p.overtimeLowHours+overtimeHighHours/p.offWorkedHours comme avant : ces deux
      // valeurs sont mathématiquement égales, mais sommer les lignes réellement affichées garantit
      // que ce total ne peut jamais diverger silencieusement de ce que le lecteur voit au-dessus (bug
      // trouvé en review : un shift affiché sous "Reporté au mois prochain" restait compté dans le
      // total imposé, et un jour OFF reporté n'avait aucune ligne nulle part pour justifier sa prime).
      doc.setFillColor(...AMBER_TINT)
      doc.rect(marginX, y - 4.5, detailW, 6, 'F')
      doc.setFont(FONT, 'bold')
      shiftTotalsRow(m.rows || [], cutoffRows).forEach((c, i) => doc.text(String(c), detailX[i], y))
      doc.setFont(FONT, 'normal')
      y += 6

      closeDetailChunk()
      y += 12
    } else if (hoursOnly) {
      doc.setFont(FONT, 'normal')
      doc.setFontSize(10)
      doc.setTextColor(120)
      doc.text('Aucune heure enregistrée pour ce mois.', marginX, y)
      doc.setTextColor(0)
      y += 10
    }

    if (hoursOnly) return // pas de récapitulatif de paie dans ce mode

    // Le récapitulatif de paie a besoin de : titre (8mm) + en-tête (rowH) + une ligne par catégorie
    // retournée par payrollRows() (rowH chacune) + TOTAL BRUT et NET (rowH+1 chacune, plus hauts que
    // les autres lignes) + cotisations (rowH) + marge pour le disclaimer (10mm). Calculé dynamiquement
    // à partir de rows.length plutôt qu'un nombre de lignes figé en dur : une estimation fixe à "jusqu'à
    // 4 lignes de catégorie" (110mm) a fini par sous-estimer l'espace réel une fois payrollRows() étendu
    // jusqu'à 8-9 lignes possibles (les lignes informatives "Dont..." — comblement du seuil mensuel,
    // report du mois dernier — s'ajoutent désormais aux lignes de base/sup/OFF/nuit), ce qui aurait pu
    // faire chevaucher le tableau avec le bas de la page pour un mois cumulant plusieurs de ces lignes.
    const recapHeight = 8 + rowH + rows.length * rowH + (rowH + 1) + rowH + (rowH + 1) + 10
    if (y + recapHeight > 290) {
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
    doc.text('Simulation indicative', marginX, y)
    doc.setTextColor(0)
  })

  const suffix = payrollByMonth[0]?.key || todayLocal().slice(0, 7)
  doc.save(hoursOnly ? `detail-heures-${suffix}.pdf` : `simulation-paie-${suffix}.pdf`)
}

// Couleurs/formats repris de exportPayrollPdf (AMBER/AMBER_TINT/ZEBRA_TINT ci-dessus) pour que les
// deux exports se ressemblent — possible depuis le passage de `xlsx` (community edition, qui ignore
// silencieusement tout style de cellule à l'écriture — limite vérifiée empiriquement, documentée
// dans l'historique git) à `exceljs`, qui applique réellement gras/couleurs/bordures.
const argb = ([r, g, b]) => 'FF' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')
const AMBER_ARGB = argb(AMBER)
const AMBER_TINT_ARGB = argb(AMBER_TINT)
const ZEBRA_TINT_ARGB = argb(ZEBRA_TINT)
const GREY_LINE_ARGB = argb(GREY_LINE)
const EUR_FMT = '#,##0.00" €"'
const HOURS_FMT = '0.00" h"'
const thinBorder = { style: 'thin', color: { argb: GREY_LINE_ARGB } }
const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } })

export async function exportPayrollXlsx(payrollByMonth, hourlyRate) {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()

  payrollByMonth.forEach(m => {
    const p = m.payroll
    const rows = payrollRows(p)
    const ws = wb.addWorksheet(m.sheet)
    ws.columns = [{ width: 50 }, { width: 11 }, { width: 16 }, { width: 8 }, { width: 8 }, { width: 11 }, { width: 8 }]

    const addRow = (values, opts = {}) => {
      const row = ws.addRow(values)
      if (opts.bold) row.font = { bold: true }
      if (opts.size) row.font = { ...row.font, size: opts.size }
      if (opts.italic) row.font = { ...row.font, italic: true, color: { argb: 'FF808080' } }
      if (opts.fill) row.eachCell({ includeEmpty: true }, cell => { cell.fill = fill(opts.fill) })
      return row
    }

    addRow(['SIMULATION DE PAIE'], { bold: true, size: 14 })
    addRow([m.label], { size: 12 })
    const rateRow = addRow(['Taux horaire (€/h)', hourlyRate])
    addRow([])
    addRow(['DÉTAIL DE LA RÉMUNÉRATION'], { bold: true, size: 12 })
    const headRow1 = addRow(['Catégorie', 'Heures', 'Montant (€)'], { bold: true, fill: AMBER_TINT_ARGB })
    const catStart = ws.rowCount + 1
    rows.forEach(r => addRow([r.label, Number(r.hours.toFixed(2)), r.amount == null ? '' : Number(r.amount.toFixed(2))]))
    const catEnd = ws.rowCount
    // Pas de ligne vide ici (contrairement à l'ancienne version aoa) : TOTAL BRUT/cotisations/NET
    // enchaînent directement les catégories, comme dans exportPayrollPdf, pour que la bordure posée
    // plus bas (headRow1 → netRow) forme un rectangle plein sans trou au milieu.
    const totalRow = addRow(['TOTAL BRUT ESTIMÉ', '', Number(p.grossTotal.toFixed(2))], { bold: true, fill: AMBER_ARGB })
    const cotisRow = addRow([`Cotisations salariales (est., ${(p.cotisationRate * 100).toFixed(1)}%)`, '', Number((-p.cotisationAmount).toFixed(2))])
    const netRow = addRow(['NET ESTIMÉ', '', Number(p.netTotal.toFixed(2))], { bold: true, fill: AMBER_ARGB })
    addRow([])
    addRow(['Simulation indicative'], { italic: true })
    addRow([])
    addRow(['DÉTAIL DES HEURES'], { bold: true, size: 12 })
    addRow(['Sup : heure de pause (1h) déjà retirée du calcul. OFF trav. : idem à partir de la 7e heure.'], { italic: true })
    const headRow2 = addRow(SHIFT_TABLE_HEAD, { bold: true, fill: AMBER_TINT_ARGB })
    // carriedInRows/carriedOutRows/ownCountedRows/cutoffRows sont précalculés par monthlyDetail() —
    // même source que exportPayrollPdf, voir son commentaire, pour que les deux exports restent
    // cohérents l'un avec l'autre sur ce report.
    const carriedInRows = m.carriedInRows || []
    const carriedOutRows = m.carriedOutRows || []
    const ownCountedRows = m.ownCountedRows || []
    const cutoffRows = m.cutoffRows || []
    let zebraIdx = 0
    const addDetailRow = s => {
      const row = addRow(shiftRowCells(s))
      if (zebraIdx % 2 === 1) row.eachCell({ includeEmpty: true }, cell => { cell.fill = fill(ZEBRA_TINT_ARGB) })
      zebraIdx++
    }
    if (carriedInRows.length) {
      addRow(['Report du mois précédent (après le 25) :'], { italic: true })
      carriedInRows.forEach(addDetailRow)
      if (ownCountedRows.length) addRow([`${m.label} :`], { italic: true })
    }
    ownCountedRows.forEach(addDetailRow)
    if (carriedOutRows.length) {
      addRow(['Reporté au mois prochain (après le 25) :'], { italic: true })
      carriedOutRows.forEach(addDetailRow)
    }
    // Durée sommée sur m.rows en entier (mois calendaire complet), Sup/OFF trav./Nuit
    // sommées sur `cutoffRows` (les lignes réellement affichées ci-dessus dont la majoration compte
    // dans ce bulletin) — même raison que dans exportPayrollPdf, voir son commentaire.
    let detailTotalRow = null
    if (carriedInRows.length || m.rows?.length) {
      detailTotalRow = addRow(shiftTotalsRow(m.rows || [], cutoffRows), { bold: true, fill: AMBER_TINT_ARGB })
    }

    const setFmt = (row, c, fmt) => { row.getCell(c).numFmt = fmt }
    setFmt(rateRow, 2, EUR_FMT)
    for (let r = catStart; r <= catEnd; r++) {
      setFmt(ws.getRow(r), 2, HOURS_FMT)
      setFmt(ws.getRow(r), 3, EUR_FMT)
    }
    setFmt(totalRow, 3, EUR_FMT)
    setFmt(cotisRow, 3, EUR_FMT)
    setFmt(netRow, 3, EUR_FMT)

    // Bordures fines autour des deux tableaux (récap + détail des heures), même esprit que le
    // `doc.rect(...)`/les `doc.line(...)` de exportPayrollPdf — un fond de couleur seul ne suffit
    // pas à délimiter visuellement un tableau dans Excel comme il le fait dans un PDF dessiné.
    // Bordure posée colonne par colonne (`row.getCell(c)`, pas `eachCell`) : une ligne d'étiquette
    // comme "Report du mois précédent..." n'a qu'une seule valeur poussée (cellCount=1) — `eachCell`
    // n'aurait bordé que sa première colonne, laissant un contour en dents de scie au lieu d'un
    // rectangle plein sur toute la largeur du tableau.
    const border = (row, cols) => {
      for (let c = 1; c <= cols; c++) row.getCell(c).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }
    }
    for (let r = headRow1.number; r <= netRow.number; r++) border(ws.getRow(r), 3)
    if (detailTotalRow) {
      for (let r = headRow2.number; r <= detailTotalRow.number; r++) border(ws.getRow(r), 7)
    }
  })

  if (payrollByMonth.length === 0) wb.addWorksheet('Vide').addRow(['Aucune donnée'])

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `simulation-paie-${payrollByMonth[0]?.key || todayLocal().slice(0, 7)}.xlsx`
  // `xlsx`'s own writeFile() (avant ce passage à exceljs) attachait l'ancre au DOM avant de cliquer,
  // la retirait juste après, et ne révoquait l'URL blob qu'après un délai de 60s plutôt que tout de
  // suite — repris ici à l'identique : un `.click()` sur une ancre jamais insérée dans le document,
  // ou une révocation synchrone de l'URL avant que le navigateur n'ait effectivement démarré le
  // téléchargement, sont des échecs silencieux connus sur certaines versions de WebKit (iOS Safari,
  // PWA installée) — pas de reproduction locale possible ici, mais ce sont exactement les
  // plateformes que cet export doit prendre en charge (voir le préchargement jspdf/exceljs plus bas).
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
