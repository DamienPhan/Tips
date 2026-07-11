const SERVICE_LABEL = { ARR: 'Arrivée', DEP: 'Départ', TRANSIT: 'Transit' }
const BOOKING_MODE_LABEL = { PRE: 'Pré-booking', LIVE: 'Live' }
const SATISFACTION_LABEL = { EXCELLENTE: 'Excellente', BONNE: 'Bonne', MOYENNE: 'Moyenne', MAUVAISE: 'Mauvaise' }

// Reconstruit un rapport texte à partir d'une mission déjà enregistrée, avec les mêmes libellés que
// parseReport.js (val(text, 'Label')) — pour que le texte copié puisse être recollé dans l'import et
// reparsé correctement, comme un aller-retour avec le rapport d'origine de l'outil externe.
// Limite connue : is_no_show/has_issue sont deux booléens indépendants dans le formulaire (deux
// boutons distincts), mais parseReport() les dérive tous les deux de la même ligne "Problème
// rencontré ?" (is_no_show via /no\s*show/i, has_issue via "le texte n'est pas juste 'Non'/'Aucun'/...")
// — un état is_no_show=true / has_issue=false (no-show saisi sans cocher "Problème signalé") n'a donc
// aucune représentation textuelle distincte : le "No show" écrit ici fait forcément reparser has_issue
// à true avec issue_description="No show" (vérifié). Pas de correctif possible sans changer la logique
// d'import elle-même (hors scope, et risqué pour le parsing de vrais rapports de l'outil externe).
export function formatMissionReport(m) {
  const [y, mo, d] = (m.intervention_date || '').split('-')
  const dateFr = y ? `${d}/${mo}/${y}` : ''
  const issue = m.is_no_show
    ? `No show${m.has_issue && m.issue_description ? ` — ${m.issue_description}` : ''}`
    : (m.has_issue ? m.issue_description : 'Non')

  return [
    `Date : ${dateFr}`,
    `Booking : #${m.booking_ref || ''}`,
    `Client : ${m.client_name || ''}`,
    `Greeteur : ${m.greeter || ''}`,
    `Pré-booking ou Live : ${BOOKING_MODE_LABEL[m.booking_mode] || ''}`,
    `Type de service : ${SERVICE_LABEL[m.service_type] || ''}`,
    `Vol - code IATA : ${m.flight_code || ''}`,
    `Terminal : ${m.terminal || ''}`,
    `Nombre de passagers : ${m.pax_count || 0}`,
    `Nombre de bagages Standard : ${m.bags_standard || 0}`,
    `Hors format : ${m.bags_oversized || 0}`,
    `Cage animal : ${m.animal_crates || 0}`,
    `Détaxe : ${m.tax_refund ? 'Oui' : 'Non'}`,
    `Lieu de rencontre : ${m.meeting_point || ''}`,
    `Lieu de dépose : ${m.drop_point || ''}`,
    `Nombre de porteurs : ${m.porter_count || 0}`,
    `Satisfaction client : ${SATISFACTION_LABEL[m.satisfaction] || ''}`,
    `Pourboire : ${m.tip_amount || 0} €`,
    // Doit rester la DERNIÈRE ligne : la capture "problème rencontré" de parseReport.js s'arrête au
    // prochain "\nN." (section numérotée) ou à la fin du texte — ce rapport reconstruit n'a pas de
    // sections numérotées comme l'outil externe, donc seule la fin de chaîne peut servir de
    // terminateur. Ailleurs que dernière, la capture avalerait tout ce qui suit (bug trouvé en testant
    // l'aller-retour formatMissionReport → parseReport).
    `Problème rencontré ? ${issue}`
  ].join('\n')
}
