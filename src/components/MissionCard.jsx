import { useState } from 'react'
import { useMissions } from '../store/missions'
import { parseAmount } from '../lib/format'

const SERVICE = {
  ARR: { label: 'Arrivée', color: '#E8B14C' },
  DEP: { label: 'Départ', color: '#5DCAA5' },
  TRANSIT: { label: 'Transit', color: '#7C8499' }
}

export default function MissionCard({ mission, onEdit }) {
  const update = useMissions(s => s.update)
  const remove = useMissions(s => s.remove)
  const [editingTip, setEditingTip] = useState(false)
  const [tipDraft, setTipDraft] = useState('')

  const tip = Number(mission.tip_amount || 0)
  const tipFmt = tip.toFixed(2).replace('.', ',')
  const svc = SERVICE[mission.service_type] || { label: '—', color: '#7C8499' }

  const openTip = () => {
    setTipDraft(tip > 0 ? String(tip).replace('.', ',') : '')
    setEditingTip(true)
  }
  const saveTip = async () => {
    const v = parseAmount(tipDraft)
    await update({ ...mission, tip_amount: v })
    setEditingTip(false)
  }

  const openMission = () => onEdit(mission)
  const onKeyDown = e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMission() }
  }

  const tipInput = editingTip ? (
    <input
      inputMode="decimal" type="text" autoFocus value={tipDraft}
      onChange={e => setTipDraft(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && saveTip()}
      onBlur={saveTip}
      placeholder="0,00"
      className="w-20 bg-night rounded-lg px-2 py-1.5 text-right tnum font-display text-xl text-amber outline-none ring-2 ring-amber/40"
    />
  ) : (
    <button onClick={openTip} className={`block text-right active:opacity-60 ${tip === 0 ? 'opacity-100' : ''}`}>
      {tip > 0 ? (
        <>
          <span className="tnum font-display font-semibold text-amber text-[1.6rem] leading-none">{tipFmt}</span>
          <span className="text-amber/50 text-sm"> €</span>
        </>
      ) : (
        <span className="text-amber/60 text-xs border border-amber/30 rounded-full px-2.5 py-1">+ tip</span>
      )}
    </button>
  )

  // Pourboire rapide ajouté depuis le Calendrier (voir Calendar.jsx), sans mission complète derrière
  // — pas de client/service/greeteur à afficher, et surtout pas cliquable vers MissionForm : ce
  // formulaire suppose des champs toujours renseignés (ses <select> service/booking retombent sur
  // leur première option dès que la valeur est undefined, ce qui affiche "Arrivée"/"Pré-booking"
  // comme si c'était déjà enregistré alors que rien ne l'est tant que le select n'est pas touché).
  // Seuls le montant (inline, comme ci-dessus) et la suppression sont donc éditables ici.
  if (mission.tip_only) {
    return (
      <div className="w-full bg-surface rounded-2xl mb-2 overflow-hidden flex">
        <span className="w-1 shrink-0 bg-amber/40" />
        <div className="flex-1 min-w-0 px-3.5 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-medium text-muted">Pourboire</h3>
            <p className="text-muted/60 text-xs mt-0.5">Ajouté depuis le calendrier</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {tipInput}
            <button
              onClick={async () => { if (confirm('Supprimer ce pourboire ?')) await remove(mission.id) }}
              aria-label="Supprimer ce pourboire"
              className="text-muted/50 text-lg leading-none px-1 py-1 active:text-error"
            >✕</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      role="button" tabIndex={0}
      onClick={openMission} onKeyDown={onKeyDown}
      className="w-full text-left bg-surface rounded-2xl mb-2 active:bg-surface-2 transition-colors overflow-hidden flex cursor-pointer"
    >
      {/* Liseré couleur service */}
      <span className="w-1 shrink-0" style={{ background: svc.color }} />

      <div className="flex-1 min-w-0 px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate">{mission.client_name || 'Client inconnu'}</h3>
              {mission.is_no_show && (
                <span className="text-error text-[0.55rem] uppercase tracking-wide bg-error/10 rounded px-1.5 py-0.5 shrink-0">No show</span>
              )}
            </div>
            <p className="text-[0.8rem] mt-1 truncate">
              <span style={{ color: svc.color }}>{svc.label}</span>
              <span className="text-muted">
                {mission.flight_code ? ` · ${mission.flight_code}` : ''}
                {mission.terminal ? ` · T${mission.terminal}` : ''}
              </span>
            </p>
            {mission.greeter && (
              <p className="text-muted/70 text-xs mt-0.5 truncate">Greeteur · {mission.greeter}</p>
            )}
          </div>

          <div className="shrink-0" onClick={e => e.stopPropagation()}>
            {tipInput}
          </div>
        </div>
      </div>
    </div>
  )
}
