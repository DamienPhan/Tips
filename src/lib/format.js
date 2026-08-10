export function eur(n, dec = 2) { return Number(n || 0).toFixed(dec).replace('.', ',') }

// Parse une saisie montant en français ("12,50") vers un nombre — partagé par MissionForm.jsx,
// MissionCard.jsx et Calendar.jsx, qui dupliquaient chacun le même `Number(String(x).replace(',', '.')) || 0`.
export function parseAmount(str) { return Number(String(str).replace(',', '.')) || 0 }

export const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
