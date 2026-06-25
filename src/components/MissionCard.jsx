import { useState } from 'react'
import { useMissions } from '../store/missions'

const SERVICE_LABEL = { ARR: 'Arrivée', DEP: 'Départ', TRANSIT: 'Transit' }

export default function MissionCard({ mission, onEdit }) {
  const update = useMissions(s => s.update)
  const [editingTip, setEditingTip] = useState(false)
  const [tipDraft, setTipDraft] = useState('')

  const tip = Number(mission.tip_amount || 0)
  const tipFmt = tip.toFixed(2).replace('.', ',')

  const openTip = () => {
    setTipDraft(tip > 0 ? String(tip).replace('.', ',') : '')
    setEditingTip(true)
  }
  const saveTip = async () => {
    const v = Number(String(tipDraft).replace(',', '.')) || 0
    await update({ ...mission, tip_amount: v })
    setEditingTip(false)
  }

  return (
    <button
      onClick={() => onEdit(mission)}
      className="w-full text-left bg-surface rounded-2xl px-4 py-3.5 mb-2.5 active:bg-surface-2 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium truncate">{mission.client_name || 'Client inconnu'}</h3>
            {mission.is_no_show && (
              <span className="text-error text-[0.6rem] uppercase tracking-wide bg-error/10 rounded px-1.5 py-0.5 shrink-0">No show</span>
            )}
          </div>
          <p className="text-muted text-[0.8rem] mt-1 truncate">
            {SERVICE_LABEL[mission.service_type] || '—'}
            {mission.flight_code ? ` · ${mission.flight_code}` : ''}
            {mission.terminal ? ` · T${mission.terminal}` : ''}
            {` · ${mission.pax_count || 1} pax`}
          </p>
        </div>

        <div className="shrink-0" onClick={e => e.stopPropagation()}>
          {editingTip ? (
            <div className="flex items-center gap-1.5">
              <input
                inputMode="decimal" type="text" autoFocus value={tipDraft}
                onChange={e => setTipDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveTip()}
                onBlur={saveTip}
                placeholder="0,00"
                className="w-20 bg-night rounded-lg px-2 py-1.5 text-right tnum font-display text-xl text-amber outline-none ring-2 ring-amber/40"
              />
            </div>
          ) : (
            <button onClick={openTip} className="block text-right active:opacity-60">
              <span className="tnum font-display font-semibold text-amber text-[1.6rem] leading-none">
                {tipFmt}
              </span>
              <span className="text-amber/50 text-sm"> €</span>
              {tip === 0 && <p className="text-amber/40 text-[0.65rem] mt-0.5 text-right">ajouter</p>}
            </button>
          )}
        </div>
      </div>
    </button>
  )
}
