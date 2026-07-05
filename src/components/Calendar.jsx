import { useState } from 'react'
import { useMissions } from '../store/missions'
import { fmtHours, fmtMinutes, recompute, workedMin, overtimePayMin, isRestDay } from '../lib/parseShift'
import { parseLocal } from '../lib/date'

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function ymd(y, m, d) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
function eur(n, dec = 2) { return Number(n || 0).toFixed(dec).replace('.', ',') }

function parseTime(str) {
  const s = String(str).trim().replace(/\s/g, '')
  const m = s.match(/^(\d{1,2})(?:[h:](\d{0,2}))?$/i)
  if (!m) return null
  const h = +m[1]; const min = m[2] ? +m[2] : 0
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export default function Calendar() {
  const shifts = useMissions(s => s.shifts)
  const missions = useMissions(s => s.missions)
  const updateShift = useMissions(s => s.updateShift)
  const addShifts = useMissions(s => s.addShifts)
  const removeShift = useMissions(s => s.removeShift)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(false)
  const [startStr, setStartStr] = useState('')
  const [endStr, setEndStr] = useState('')
  const [editOff, setEditOff] = useState(false)
  const [err, setErr] = useState('')

  const shiftMap = new Map(shifts.map(s => [s.shift_date, s]))
  // tips par jour
  const tipMap = new Map()
  for (const m of missions) {
    tipMap.set(m.intervention_date, (tipMap.get(m.intervention_date) || 0) + Number(m.tip_amount || 0))
  }
  const missionCountMap = new Map()
  for (const m of missions) {
    missionCountMap.set(m.intervention_date, (missionCountMap.get(m.intervention_date) || 0) + 1)
  }
  const maxTip = Math.max(...[...tipMap.values()], 1)

  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1) } else setMonth(month - 1); closeDetail() }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1) } else setMonth(month + 1); closeDetail() }
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); closeDetail() }
  const closeDetail = () => { setSelected(null); setEditing(false); setErr('') }

  const selDate = selected ? ymd(year, month, selected) : null
  const selShift = selDate ? shiftMap.get(selDate) : null
  const selTips = selDate ? (tipMap.get(selDate) || 0) : 0
  const selCount = selDate ? (missionCountMap.get(selDate) || 0) : 0

  const openEdit = () => {
    if (selShift) {
      setStartStr(fmtMinutes(selShift.start_min)); setEndStr(fmtMinutes(selShift.end_min)); setEditOff(!!selShift.is_day_off)
    } else { setStartStr(''); setEndStr(''); setEditOff(false) }
    setErr(''); setEditing(true)
  }

  const saveEdit = async () => {
    const start = parseTime(startStr); const end = parseTime(endStr)
    if (start === null || end === null) { setErr('Format invalide. Ex : 7h ou 7h30'); return }
    const rec = recompute({ start_min: start, end_min: end }, editOff)
    if (selShift) await updateShift({ ...selShift, start_min: start, end_min: end, ...rec })
    else await addShifts([{ shift_date: selDate, start_min: start, end_min: end, ...rec }])
    setEditing(false)
  }

  const toggleOff = async () => { if (selShift) await updateShift({ ...selShift, ...recompute(selShift, !selShift.is_day_off) }) }
  const del = async () => { if (selShift && confirm('Supprimer ce shift ?')) { await removeShift(selShift.id); closeDetail() } }

  const markRestDay = async () => {
    const rec = recompute({ start_min: 0, end_min: 0 }, true)
    if (selShift) await updateShift({ ...selShift, start_min: 0, end_min: 0, ...rec })
    else await addShifts([{ shift_date: selDate, start_min: 0, end_min: 0, ...rec }])
  }

  let preview = null
  if (editing) {
    const s = parseTime(startStr), e = parseTime(endStr)
    if (s !== null && e !== null) {
      const w = workedMin({ start_min: s, end_min: e })
      preview = { brut: fmtHours(w / 60), sup: fmtHours(overtimePayMin(w, editOff) / 60) }
    }
  }

  return (
    <div className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-36">
      {/* Navigation mois — grandes zones tactiles */}
      <div className="flex items-stretch gap-2 mb-4">
        <button onClick={prevMonth} aria-label="Mois précédent"
          className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center text-2xl text-amber active:bg-surface-2">‹</button>
        <button onClick={goToday}
          className="flex-1 h-14 rounded-2xl bg-surface flex flex-col items-center justify-center active:bg-surface-2">
          <span className="font-medium">{MONTHS[month]} {year}</span>
          <span className="text-muted text-[0.65rem]">Appuyer pour aujourd'hui</span>
        </button>
        <button onClick={nextMonth} aria-label="Mois suivant"
          className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center text-2xl text-amber active:bg-surface-2">›</button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {DOW.map((d, i) => <div key={i} className="text-center text-muted text-xs">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />
          const date = ymd(year, month, d)
          const shift = shiftMap.get(date)
          const tips = tipMap.get(date) || 0
          const isSel = selected === d
          const isToday = date === ymd(now.getFullYear(), now.getMonth(), now.getDate())
          // intensité fond selon tips
          const intensity = tips > 0 ? 0.12 + (tips / maxTip) * 0.5 : 0
          const bg = isSel ? '#E8B14C' : tips > 0 ? `rgba(232,177,76,${intensity})` : shift ? '#1F2633' : 'transparent'
          const textColor = isSel ? '#0B0E14' : '#E6E9EF'
          return (
            <button key={i} onClick={() => { setSelected(isSel ? null : d); setEditing(false); setErr('') }}
              className={`aspect-[3/4] rounded-xl flex flex-col items-center pt-1.5 px-0.5 relative ${isToday && !isSel ? 'ring-1 ring-amber/50' : ''}`}
              style={{ background: bg }}>
              {shift?.is_day_off && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-error" />
              )}
              <span className="text-xs font-medium leading-none h-3.5 flex items-center" style={{ color: tips === 0 && !shift && !isSel ? '#7C8499' : textColor }}>{d}</span>
              <span className="flex-1 flex items-center justify-center">
                {tips > 0 && (
                  <span className="tnum font-display text-[0.72rem] font-semibold leading-none"
                    style={{ color: isSel ? '#0B0E14' : '#E8B14C' }}>
                    {eur(tips, 0)}€
                  </span>
                )}
              </span>
              <span className="h-3.5 flex items-center justify-center mb-1">
                {shift && (
                  <span className="text-[0.55rem] leading-none" style={{ color: isSel ? 'rgba(11,14,20,0.7)' : '#7C8499' }}>
                    {isRestDay(shift) ? 'OFF' : `${fmtHours(shift.hours)}${shift.is_day_off ? '·OFF' : ''}`}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/* Légende */}
      <div className="flex items-center gap-2 mt-3 text-[0.65rem] text-muted">
        <span>Tips :</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: 'rgba(232,177,76,0.15)' }} />faible</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: 'rgba(232,177,76,0.62)' }} />élevé</span>
        <span className="flex items-center gap-1 ml-auto"><span className="w-2 h-2 rounded-full bg-error" />jour OFF</span>
      </div>

      {selected && (
        <div className="mt-5 bg-surface rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium capitalize">
              {parseLocal(selDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            {!editing && <button onClick={openEdit} className="text-amber text-sm">{selShift ? 'Modifier' : 'Ajouter shift'}</button>}
          </div>

          {/* Tips du jour toujours visibles */}
          {!editing && (
            <div className="bg-night rounded-xl px-4 py-3 mb-3 flex items-baseline justify-between">
              <span className="text-muted text-sm">Pourboires</span>
              <div className="text-right">
                <span className="tnum font-display font-bold text-amber text-2xl">{eur(selTips)}</span>
                <span className="text-amber/50"> €</span>
                {selCount > 0 && <p className="text-muted text-xs mt-0.5">{selCount} mission{selCount > 1 ? 's' : ''}</p>}
              </div>
            </div>
          )}

          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted text-xs uppercase tracking-wider mb-1.5 block">Début</label>
                  <input inputMode="numeric" value={startStr} onChange={e => setStartStr(e.target.value)} placeholder="7h"
                    className="w-full bg-surface-2 rounded-xl px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-amber/40" />
                </div>
                <div>
                  <label className="text-muted text-xs uppercase tracking-wider mb-1.5 block">Fin</label>
                  <input inputMode="numeric" value={endStr} onChange={e => setEndStr(e.target.value)} placeholder="15h30"
                    className="w-full bg-surface-2 rounded-xl px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-amber/40" />
                </div>
              </div>
              <button onClick={() => setEditOff(!editOff)}
                className={`w-full py-3 rounded-xl text-sm font-medium ${editOff ? 'bg-error/15 text-error' : 'bg-surface-2 text-muted'}`}>
                {editOff ? '✓ Jour OFF travaillé (compté comme heures sup)' : 'Jour normal'}
              </button>
              {preview && (
                <div className="flex justify-between text-sm bg-night rounded-xl px-3 py-2.5">
                  <span className="text-muted">Brut {preview.brut}</span>
                  <span className={preview.sup !== '0h' ? 'text-error' : 'text-muted'}>Sup {preview.sup}</span>
                </div>
              )}
              {err && <p className="text-error text-sm">{err}</p>}
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="flex-1 bg-surface-2 text-muted rounded-xl py-3 text-sm">Annuler</button>
                <button onClick={saveEdit} className="flex-1 bg-amber text-night font-medium rounded-xl py-3 text-sm">Enregistrer</button>
              </div>
            </div>
          ) : selShift && isRestDay(selShift) ? (
            <>
              <div className="bg-error/10 rounded-xl px-4 py-3.5 mb-1 flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-error shrink-0" />
                <p className="text-sm">Jour OFF — non travaillé</p>
              </div>

              <button onClick={openEdit} className="w-full py-3.5 rounded-xl text-sm font-medium mt-2 bg-surface-2 text-[#E6E9EF]">
                Ajouter des horaires (jour finalement travaillé)
              </button>

              <button onClick={del} className="w-full py-2.5 rounded-xl text-xs text-error/80 active:bg-error/10 mt-2">
                Supprimer ce jour OFF
              </button>
            </>
          ) : selShift ? (
            <>
              <Row label="Horaires" value={`${fmtMinutes(selShift.start_min)} – ${fmtMinutes(selShift.end_min)}`} />
              <Row label="Durée brute" value={fmtHours(selShift.hours)} />
              <Row label={selShift.is_day_off ? 'Heures travaillées (OFF)' : 'Heures sup.'} value={selShift.overtime_hours > 0 ? fmtHours(selShift.overtime_hours) : '0h'} accent={selShift.overtime_hours > 0} />
              {selShift.night_hours > 0 && <Row label="Heures de nuit" value={fmtHours(selShift.night_hours)} />}
              {selShift.night_overtime_hours > 0 && <Row label="Sup de nuit" value={fmtHours(selShift.night_overtime_hours)} accent />}

              {selShift.is_day_off && (
                <div className="bg-error/10 rounded-xl px-3 py-2.5 mt-2 mb-1">
                  <p className="text-error text-xs">Jour OFF travaillé : {fmtHours(selShift.hours)} travaillées comptées intégralement comme des heures sup — majorées selon le même barème mensuel que les heures sup normales.</p>
                </div>
              )}

              <button onClick={toggleOff}
                className={`w-full py-3.5 rounded-xl text-sm font-medium mt-2 ${selShift.is_day_off ? 'bg-error text-night' : 'bg-surface-2 text-[#E6E9EF]'}`}>
                {selShift.is_day_off ? '✓ Jour OFF travaillé' : 'Marquer ce jour comme OFF travaillé'}
              </button>
              <p className="text-muted/60 text-[0.7rem] text-center mt-2">
                {selShift.is_day_off ? 'Appuie pour repasser en jour normal' : 'Toutes les heures du jour passeront en sup'}
              </p>

              <button onClick={del} className="w-full py-2.5 rounded-xl text-xs text-error/80 active:bg-error/10 mt-2">
                Supprimer ce shift
              </button>
            </>
          ) : (
            <>
              <p className="text-muted text-sm mb-3">Aucun shift enregistré ce jour. Appuie sur « Ajouter shift » ci-dessus pour un jour travaillé.</p>
              <button onClick={markRestDay} className="w-full py-3.5 rounded-xl text-sm font-medium bg-surface-2 text-[#E6E9EF]">
                Marquer comme jour OFF (non travaillé)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, accent }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`tnum ${accent ? 'text-error' : 'text-[#E6E9EF]'}`}>{value}</span>
    </div>
  )
}
