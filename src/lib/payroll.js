import { monthlyDetail } from './monthlyDetail'
import { fmtHours } from './parseShift'

export const DEFAULT_RATES = {
  // Seuil du palier +25% : les heures sup du pool mensuel (voir monthlyDetail.js) sont majorées à
  // +25% jusqu'à 34.86h comprises, puis +50% au-delà. Deuxième révision de cette valeur : d'abord
  // une conversion légale hebdomadaire (35h/8h/44h, ≈34.67h), essayée puis abandonnée sur la base
  // d'une clarification de l'utilisateur disant que l'employeur utilisait un seuil fixe de 33h —
  // cette clarification s'est révélée imprécise une fois confrontée à un vrai bulletin de juillet
  // 2026 : après application du comblement du seuil mensuel (voir baseShortfallHours plus bas dans
  // ce fichier), le pool sup réel de ce mois-là (38.83h) s'y répartissait en 34.86h à 25% et 3.97h à
  // 50% — pas 33h/5.83h. Recopié tel quel (pas re-dérivé d'une formule légale, qui donnerait 34.67h
  // et ne matchait pas exactement non plus) : demande explicite de l'utilisateur après lui avoir
  // signalé que ni l'ancien 33h ni la formule légale ne collaient parfaitement. Comme les deux
  // valeurs précédentes, celle-ci peut se révéler à son tour imprécise sur un futur bulletin — le
  // pool reste de toute façon agrégé au mois entier, pas semaine civile par semaine civile (voir la
  // note sur la coupure du 25 dans monthlyDetail.js).
  overtimeThresholdHours: 34.86,
  overtimeMultiplierLow: 1.25, // heures sup jusqu'au seuil — aussi le taux des heures de jour OFF travaillé (voir plus bas)
  overtimeMultiplierHigh: 1.5, // heures sup au-delà du seuil
  nightBonusRate: 0.25,        // prime de nuit, en supplément du taux de base
  weeklyBaseHours: 35,         // base légale hebdomadaire — mode "Mensualisé" uniquement
  // Cotisations salariales : taux forfaitaire, pas un détail poste par poste (santé/retraite/
  // chômage/CSG-CRDS/mutuelle...) — bien trop spécifique au contrat et à la convention collective
  // pour être répliqué fiablement ici. Un premier bulletin (non-cadre, peu d'heures sup) donnait
  // brut 1179.05 € → net avant impôt 906.72 €, soit ≈23.1% de retenues — mais un second bulletin
  // (juillet 2026, avec beaucoup d'heures sup) donne brut 3109.74 € → net avant impôt 2528.87 €,
  // soit ≈18.7% seulement : les heures sup bénéficient d'une exonération de cotisations salariales
  // (lignes "EXO., ECRET. ET ALLEG. COTIS" / "RÉDUCTION SALARIALE HS/HC" du bulletin), donc le taux
  // réel baisse les mois à forte activité au lieu de rester fixe. 19% est un compromis choisi par
  // l'utilisateur entre les deux, pas une moyenne calculée — reste éditable dans le simulateur pour
  // approcher le taux réel du mois simulé.
  employeeCotisationRate: 0.19
}

// Calcule la simulation de paie pour un mois (élément retourné par monthlyDetail()).
// Les heures d'un jour OFF travaillé sont une prime à part, payées en intégralité à +25% (même taux
// que le premier palier du pool sup, `overtimeMultiplierLow`), mais HORS du pool sup tiéré et de son
// seuil — elles ne comptent pas dans le total "heures supplémentaires" (précisé par l'utilisateur).
// Ça a déjà changé de sens une fois : une version antérieure les fusionnait dans le même pool que les
// heures sup normales (même seuil de 33h/34h, mêmes deux paliers +25%/+50%), sur la base d'une
// clarification de l'utilisateur disant que l'employeur ne faisait pas de distinction — corrigé une
// seconde fois après une clarification plus précise : payées au même taux que la sup normale, oui,
// mais sans jamais compter dans le total sup ni pousser le pool vers le palier +50%. Les heures de
// nuit restent une prime à part, +25% en plus du taux de base sur chaque heure de nuit, hors du pool
// sup et de son seuil (inchangé). Le "Détail des heures" (relevé jour par jour) continue d'afficher
// Sup/OFF trav. dans deux colonnes séparées, comme les deux montants côté paie maintenant aussi.
//
// options.payMode : 'hourly' (défaut) calcule la base sur les heures réellement pointées ;
// 'monthly' reproduit le mécanisme "salarié mensualisé" observé sur un vrai bulletin de salaire —
// une base légale fixe (rates.weeklyBaseHours × 52/12, arrondi à 2 décimales — ex. 151.67h pour
// 35h/semaine), proratisée par un nombre de jours d'absence saisi manuellement (options.absenceDays ;
// l'app ne connaît pas les dates d'entrée/sortie de contrat). Le taux journalier d'absence est
// weeklyBaseHours ÷ 5 (7h/jour pour 35h/semaine, soit un jour ouvré), PAS la base mensuelle ÷ 30 :
// une première vérification sur 14 jours calendaires d'absence (2 semaines pleines) valant
// exactement 70.00h avait mené à ÷ 7 (5h/jour), mais 14 étant un multiple de 7, ce cas ne
// distinguait pas ÷ 7 de ÷ 5 (70h = 14 × 5 = 10 × 7 tout autant). Un second bulletin, sur une
// absence d'un seul jour ("Abs. Congés ss solde"), a tranché : base 7.00h, montant 94.61 € à
// 13.5162 €/h (7.00 × 13.5162 = 94.6134), donc bien 7h/jour — ÷ 5, pas ÷ 7. Reste, comme ÷ 7,
// différent de la base mensuelle ÷ 30 (151.67 ÷ 30 × 14 aurait donné 70.78h, pas 70.00h).
// Heures sup/nuit/jour OFF restent calculées sur les heures réelles dans les deux modes : ce sont
// des suppléments variables, pas la base — À UNE EXCEPTION PRÈS, voir baseShortfallHours ci-dessous.
export function computeMonthPayroll(month, hourlyRate, rates = DEFAULT_RATES, options = {}) {
  const total = month.total
  const offWorkedHours = total.offWorked
  const payMode = options.payMode === 'monthly' ? 'monthly' : 'hourly'
  const absenceDays = Number(options.absenceDays) || 0

  // Si les heures réellement travaillées ce mois (total.baseHours, le forfait jour-par-jour de
  // monthlyDetail.js) tombent sous le seuil mensuel de référence (151.67h pour 35h/semaine — la
  // même valeur que fullBaseHours en mode "Mensualisé"), une partie du pool d'heures sup sert
  // d'abord à combler ce manque plutôt que d'être payée en plus, au tarif normal et non majoré —
  // précisé par l'utilisateur, et vérifié contre un vrai bulletin : le pool sup recalculé jour par
  // jour ici (48.00h pour juillet 2026) dépassait celui affiché sur le bulletin (38.83h) d'exactement
  // le manque à 151.67h ce mois-là (151.67 - 142.50 = 9.17h = 48.00 - 38.83). Le montant de ces
  // heures n'est perdu dans aucun des deux modes : en mensualisé la base était déjà fixée à 151.67h
  // quoi qu'il arrive (seul le pool sup affiché doit baisser d'autant, sinon le simulateur listerait
  // des heures sup qui ne sont en réalité jamais payées en plus) ; en heures réelles, baseHours
  // ci-dessous est complété par ces mêmes heures pour que leur argent reste bien compté quelque part.
  const monthlyBaseHours = Math.round(rates.weeklyBaseHours * 52 / 12 * 100) / 100
  const baseShortfallHours = Math.max(0, monthlyBaseHours - total.baseHours)
  const overtimeUsedForShortfall = Math.min(baseShortfallHours, total.overtime)

  let baseHours, baseAmount, fullBaseHours, fullBaseAmount, absenceHours, absenceAmount
  if (payMode === 'monthly') {
    fullBaseHours = monthlyBaseHours
    fullBaseAmount = fullBaseHours * hourlyRate
    absenceHours = (rates.weeklyBaseHours / 5) * absenceDays
    absenceAmount = absenceHours * hourlyRate
    baseHours = Math.max(0, fullBaseHours - absenceHours)
    baseAmount = fullBaseAmount - absenceAmount
  } else {
    // total.baseHours est un forfait de 7h30/jour travaillé, pas les heures réelles moins la part
    // sup (voir monthlyDetail.js) — un jour OFF travaillé n'y compte pas du tout, ses heures sont
    // entièrement dans sa propre prime à part ci-dessous. + overtimeUsedForShortfall : voir le
    // commentaire au-dessus de cette fonction.
    baseHours = total.baseHours + overtimeUsedForShortfall
    baseAmount = baseHours * hourlyRate
  }

  // Pool tiéré : heures sup normales SEULEMENT (les heures d'un jour OFF travaillé n'y comptent pas,
  // voir le commentaire au-dessus de cette fonction), moins la part utilisée pour compléter le seuil
  // mensuel ci-dessus.
  const overtimePoolHours = total.overtime - overtimeUsedForShortfall
  const overtimeLowHours = Math.min(overtimePoolHours, rates.overtimeThresholdHours)
  const overtimeHighHours = Math.max(0, overtimePoolHours - rates.overtimeThresholdHours)
  const overtimeLowAmount = overtimeLowHours * hourlyRate * rates.overtimeMultiplierLow
  const overtimeHighAmount = overtimeHighHours * hourlyRate * rates.overtimeMultiplierHigh

  // Heures d'un jour OFF travaillé : prime à part, payées en intégralité au même taux que le premier
  // palier du pool sup (+25%), jamais tiérée ni comptée dans overtimePoolHours ci-dessus.
  const offWorkedAmount = offWorkedHours * hourlyRate * rates.overtimeMultiplierLow

  const nightBonus = total.night * hourlyRate * rates.nightBonusRate

  const grossTotal = baseAmount + overtimeLowAmount + overtimeHighAmount + offWorkedAmount + nightBonus

  // Estimation forfaitaire des cotisations salariales sur le brut total (voir le commentaire de
  // DEFAULT_RATES.employeeCotisationRate) — pas un calcul détaillé, juste une approximation.
  const cotisationRate = Number(rates.employeeCotisationRate) || 0
  const cotisationAmount = grossTotal * cotisationRate
  const netTotal = grossTotal - cotisationAmount

  return {
    payMode,
    baseHours, baseAmount,
    fullBaseHours, fullBaseAmount, absenceDays, absenceHours, absenceAmount,
    monthlyBaseHours, baseShortfallHours, overtimeUsedForShortfall,
    offWorkedHours, offWorkedAmount,
    overtimeThresholdHours: rates.overtimeThresholdHours,
    overtimeLowHours, overtimeHighHours, overtimeLowAmount, overtimeHighAmount,
    overtimeCarriedInHours: total.overtimeCarriedIn,
    offWorkedCarriedInHours: total.offWorkedCarriedIn,
    nightHours: total.night, nightBonus,
    grossTotal,
    cotisationRate, cotisationAmount, netTotal
  }
}

// Simulation complète : un résultat par mois présent dans shifts.
// options.absenceDaysByMonth : { [monthKey]: jours } — un prorata par mois de paie, saisi
// manuellement dans le simulateur (mode "Mensualisé" seulement, voir computeMonthPayroll).
export function computePayroll(shifts, hourlyRate, rates = DEFAULT_RATES, options = {}) {
  const absenceDaysByMonth = options.absenceDaysByMonth || {}
  return monthlyDetail(shifts).map(m => ({
    key: m.key,
    label: m.label,
    sheet: m.sheet, // nom d'onglet court ("Juil 2026"), pour l'export Excel
    rows: m.rows, // détail jour par jour, pour le relevé d'heures inclus dans les exports paie
    carriedInRows: m.carriedInRows, // shifts du 26-fin du mois précédent dont la majoration est reportée ici (voir monthlyDetail.js)
    carriedOutRows: m.carriedOutRows, // shifts propres à ce mois dont la majoration part au contraire vers le mois suivant (voir monthlyDetail.js)
    ownCountedRows: m.ownCountedRows, // rows moins carriedOutRows (voir monthlyDetail.js)
    cutoffRows: m.cutoffRows, // carriedInRows + ownCountedRows, pour shiftTotalsRow() (voir monthlyDetail.js)
    payroll: computeMonthPayroll(m, hourlyRate, rates, { payMode: options.payMode, absenceDays: absenceDaysByMonth[m.key] })
  }))
}

// Lignes de catégorie communes à l'UI, l'export PDF et l'export Excel — une seule source
// de vérité pour éviter que les trois recalculent chacun leur propre montant.
// Libellés en toutes lettres plutôt qu'avec des symboles mathématiques (≤/>) : les polices de
// base de jsPDF (WinAnsi/CP1252) n'ont pas le glyphe "≤", ce qui produisait du texte corrompu
// dans le PDF exporté.
export function payrollRows(p) {
  const rows = []
  if (p.payMode === 'monthly') {
    rows.push({ label: 'Salaire de base (mensualisé)', hours: p.fullBaseHours, amount: p.fullBaseAmount })
    if (p.absenceDays > 0) {
      rows.push({ label: `Absence prorata (${p.absenceDays} j)`, hours: p.absenceHours, amount: -p.absenceAmount })
    }
  } else {
    rows.push({ label: 'Heures normales', hours: p.baseHours, amount: p.baseAmount })
  }
  // Informative uniquement : ces heures sont déjà comptées dans baseHours/baseAmount ci-dessus (mode
  // heures réelles) ou n'affectent pas fullBaseAmount, déjà fixe (mode mensualisé) — mais PAS dans
  // overtimeLowHours/overtimeHighHours plus bas, contrairement aux deux lignes "Dont..." suivantes :
  // ce sont au contraire des heures qui auraient dû y être sans le manque à combler (voir
  // computeMonthPayroll()). Précisé pour la même raison que les "Dont..." ci-dessous : sans ce
  // libellé, un lecteur comparant au pool sup recalculé à la main pourrait croire à des heures sup
  // oubliées plutôt qu'à des heures déjà payées au tarif normal via la base.
  if (p.overtimeUsedForShortfall > 0) {
    rows.push({
      // Libellé volontairement court (voir le commentaire ASCII-only plus bas dans ce fichier pour
      // la même contrainte de largeur en PDF, colonne Catégorie à 88mm) : une première version plus
      // explicite ("... complétant le seuil mensuel de 151h40 (payées à taux normal, pas en plus)")
      // mesurait ~155mm avec jsPDF.getTextWidth(), largement au-delà de la colonne — déjà un souci
      // préexistant sur d'autres lignes "Dont..." de ce fichier (~115mm pour 88mm de large, aucun
      // retour à la ligne géré par exportPayroll.js), mais pas de raison de l'aggraver davantage ici.
      label: `Dont ${fmtHours(p.overtimeUsedForShortfall)} de sup utilisées pour compléter le seuil mensuel (taux normal)`,
      hours: p.overtimeUsedForShortfall, amount: null
    })
  }
  // Informative uniquement : ce sous-total est déjà compris dans overtimeLowHours/overtimeHighHours
  // ci-dessous (voir monthlyDetail.js), donc pas de montant propre — l'ajouter en aurait doublé le
  // paiement dans TOTAL BRUT ESTIMÉ, qui reste calculé à partir de grossTotal, pas d'une somme des
  // lignes affichées ici. Le libellé précise "dont" explicitement : sans ça, cette ligne a exactement
  // le même rendu (Row, PDF, Excel) que les lignes qui s'additionnent réellement juste en dessous —
  // un lecteur comparant à un vrai bulletin pourrait sinon lire les heures comme un ajout et non
  // comme un sous-total déjà inclus, et remonter un faux écart.
  if (p.overtimeCarriedInHours > 0) {
    rows.push({ label: 'Dont heures sup. du mois dernier (déjà incluses ci-dessous)', hours: p.overtimeCarriedInHours, amount: null })
  }
  // Seuil affiché dynamiquement plutôt qu'en dur dans le texte : ce seuil a déjà changé deux fois
  // en pratique (33 → une approximation hebdomadaire non ronde → 33 à nouveau) — un libellé figé
  // se désynchroniserait silencieusement de la vraie valeur utilisée pour le calcul à chaque
  // changement de DEFAULT_RATES.overtimeThresholdHours.
  const thresholdLabel = fmtHours(p.overtimeThresholdHours)
  rows.push(
    { label: `Heures sup jusqu'à ${thresholdLabel} (+25%)`, hours: p.overtimeLowHours, amount: p.overtimeLowAmount },
    { label: `Heures sup au-delà de ${thresholdLabel} (+50%)`, hours: p.overtimeHighHours, amount: p.overtimeHighAmount }
  )
  // Prime à part, plus dans le pool sup ci-dessus (voir computeMonthPayroll()) — a donc désormais son
  // propre montant, contrairement à l'ancienne ligne purement informative "Dont... (déjà incluses
  // ci-dessous)" qui n'avait plus de sens une fois le pool dé-fusionné.
  if (p.offWorkedCarriedInHours > 0) {
    rows.push({ label: 'Dont heures travaillées en OFF du mois dernier (déjà incluses ci-dessous)', hours: p.offWorkedCarriedInHours, amount: null })
  }
  if (p.offWorkedHours > 0) {
    rows.push({ label: 'Heures travaillées en OFF (+25%)', hours: p.offWorkedHours, amount: p.offWorkedAmount })
  }
  rows.push({ label: 'Prime de nuit (+25%)', hours: p.nightHours, amount: p.nightBonus })
  return rows
}
