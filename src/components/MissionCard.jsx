import { useMissions } from '../store/missions'

const SERVICE_LABEL = { ARR: 'Arrivée', DEP: 'Départ', TRANSIT: 'Transit' }
const SYNC_DOT = { synced: 'bg-synced', pending: 'bg-pending', error: 'bg-error' }

export default function MissionCard({ mission, onEdit }) {
  const remove = useMissions(s => s.remove)
  const tip = Number(mission.tip_amount || 0).toFixed(2).replace('.', ',')

  return (
    <article className="bg-surface rounded-2xl p-4 mb-3 border border-white/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-1.5 h-1.5 rounded-full ${SYNC_DOT[mission.syncStatus] || 'bg-muted'}`}
              title={mission.syncStatus}
            />
            <h3 className="font-medium truncate">
              {mission.client_name || 'Client inconnu'}
            </h3>
          </div>
          <p className="text-muted text-sm mt-0.5 truncate">
            {SERVICE_LABEL[mission.service_type] || '—'}
            {mission.flight_code ? ` · ${mission.flight_code}` : ''}
            {mission.terminal ? ` · ${mission.terminal}` : ''}
          </p>
          {mission.booking_ref && (
            <p className="text-muted/70 text-xs mt-0.5">Réf. {mission.booking_ref}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="tnum font-display font-bold text-amber text-2xl leading-none">{tip}<span className="text-amber/60 text-base"> €</span></p>
          <p className="text-muted text-xs mt-1">{mission.pax_count || 1} pax</p>
        </div>
      </div>

      {mission.has_issue && (
        <p className="text-error text-xs mt-3 bg-error/10 rounded-lg px-2.5 py-1.5">
          ⚠ {mission.issue_description || 'Problème signalé'}
        </p>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onEdit(mission)}
          className="flex-1 text-sm text-muted bg-surface-2 rounded-lg py-2 active:bg-white/10"
        >
          Modifier
        </button>
        <button
          onClick={() => { if (confirm('Supprimer cette mission ?')) remove(mission.id) }}
          className="px-4 text-sm text-error bg-error/10 rounded-lg py-2 active:bg-error/20"
        >
          Suppr.
        </button>
      </div>
    </article>
  )
}
