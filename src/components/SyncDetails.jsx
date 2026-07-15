import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { useMissions } from '../store/missions'

const STATUS_LABEL = { pending: 'En attente', error: 'Erreur', 'pending-delete': 'Suppression en attente' }

// Diagnostic en lecture seule (+ un bouton "Réessayer") : liste les missions/shifts locaux pas
// encore confirmés synchronisés (pending/error/pending-delete) avec le message d'erreur stocké par
// flush()/flushShifts() en cas d'échec (syncError) — sert à comprendre depuis le téléphone pourquoi
// le compteur "en attente" de SyncBar ne redescend pas, sans avoir besoin d'un inspecteur web
// branché sur un Mac. Normalement le flush se redéclenche seul (sauvegarde, retour réseau, ouverture
// de l'app) — ce bouton sert pour le cas où rien de tout ça ne s'est encore reproduit depuis que la
// cause de l'échec a été corrigée côté serveur (ex. colonne manquante ajoutée après coup).
export default function SyncDetails({ onClose }) {
  const [missions, setMissions] = useState(null)
  const [shifts, setShifts] = useState(null)
  const [retrying, setRetrying] = useState(false)

  const load = () => {
    db.missions.where('syncStatus').anyOf('pending', 'error', 'pending-delete').toArray().then(setMissions)
    db.shifts.where('syncStatus').anyOf('pending', 'error', 'pending-delete').toArray().then(setShifts)
  }

  useEffect(load, [])

  const retry = async () => {
    setRetrying(true)
    try {
      await useMissions.getState().init()
      load()
    } finally {
      setRetrying(false)
    }
  }

  const loading = missions === null || shifts === null

  return (
    <div className="fixed inset-0 z-40 bg-night overflow-y-auto mx-auto max-w-[480px]">
      <div className="sticky top-0 bg-night px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 flex items-center justify-between border-b border-white/[0.06]">
        <button onClick={onClose} className="text-muted text-sm">Fermer</button>
        <h2 className="font-medium">Synchronisation</h2>
        <button onClick={retry} disabled={retrying || loading} className="text-amber text-sm font-medium disabled:opacity-50">
          {retrying ? '…' : 'Réessayer'}
        </button>
      </div>

      <div className="p-5 space-y-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {loading && <p className="text-muted text-sm text-center py-8">Chargement…</p>}

        {!loading && missions.length === 0 && shifts.length === 0 && (
          <p className="text-muted text-sm text-center py-8">Tout est synchronisé.</p>
        )}

        {!loading && missions.length > 0 && (
          <div className="space-y-2">
            <p className="text-muted text-xs uppercase tracking-wider">Missions ({missions.length})</p>
            {missions.map(m => (
              <div key={m.id} className="bg-surface rounded-xl px-4 py-3">
                <div className="flex justify-between gap-3">
                  <span className="font-medium truncate">{m.client_name || 'Client inconnu'} · {m.intervention_date || '—'}</span>
                  <span className="text-xs shrink-0 text-pending">{STATUS_LABEL[m.syncStatus] || m.syncStatus}</span>
                </div>
                {m.syncError && <p className="text-error text-xs mt-1 break-words">{m.syncError}</p>}
              </div>
            ))}
          </div>
        )}

        {!loading && shifts.length > 0 && (
          <div className="space-y-2">
            <p className="text-muted text-xs uppercase tracking-wider">Shifts ({shifts.length})</p>
            {shifts.map(s => (
              <div key={s.id} className="bg-surface rounded-xl px-4 py-3">
                <div className="flex justify-between gap-3">
                  <span className="font-medium truncate">{s.shift_date || '—'}</span>
                  <span className="text-xs shrink-0 text-pending">{STATUS_LABEL[s.syncStatus] || s.syncStatus}</span>
                </div>
                {s.syncError && <p className="text-error text-xs mt-1 break-words">{s.syncError}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
