import { useState } from 'react'
import { useMissions } from '../store/missions'
import { fmtHours, fmtMinutes, recompute, workedMin, overtimeMin } from '../lib/parseShift'
import { parseLocal } from '../lib/date'

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function ymd(y, m, d) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` }

// "6h45" / "6:45" / "0645" -> minutes ; renvoie null si invalide
function parseTime(str) {
  const s = String(str).trim().replace(/\s/g, '')
  const m = s.match(/^(\d{1,2})(?:[h:](\d{0,2}))?$/i)
  if (!m) return null
  const h = +m[1]
  const min = m[2] ? +m[2] : 0
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
  const missionDays = new Set(missions.map(m => m.intervention_date))

  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1) } else setMonth(month - 1); closeDetail() }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1) } else setMonth(month + 1); closeDetail() }
  const closeDetail = () => { setSelected(null); setEditing(false); setErr('') }

  const selDate = selected ? ymd(year, month, selected) : null
  const selShift = selDate ? shiftMap.get(selDate) : null

  const openEdit = () => {
    if (selShift) {
      setStartStr(fmtMinutes(selShift.start_min))
      setEndStr(fmtMinutes(selShift.end_min))
      setEditOff(!!selShift.is_day_off)
    } else {
      setStartStr(''); setEndStr(''); setEditOff(false)
    }
    setErr(''); setEditing(true)
  }

  const saveEdit = async () => {
    const start = parseTime(startStr)
    const end = parseTime(endStr)
    if (start === null || end === null) { setErr('Format invalide. Ex : 7h ou 7h30'); return }
    const base = { start_min: start, end_min: end }
    const rec = recompute(base, editOff)
    if (selShift) {
      await updateShift({ ...selShift, start_min: start, end_min: end, ...rec })
    } else {
      await addShifts([{ shift_date: selDate, start_min: start, end_min: end, ...rec }])
    }
    setEditing(false)
  }

  const toggleOff = async () => {
    if (!selShift) return
    await updateShift({ ...selShift, ...recompute(selShift, !selShift.is_day_off) })
  }

  const del = async () => {
    if (selShift && confirm('Supprimer ce shift ?')) { await removeShift(selShift.id); closeDetail() }
  }

  // Aperçu live pendant l'édition
  let preview = null
  if (editing) {
    const s = parseTime(startStr), e = parseTime(endStr)
    if (s !== null && e !== null) {
      const w = workedMin({ start_min: s, end_min: e })
      preview = { brut: fmtHours(w / 60), sup: fmtHours(overtimeMin(w, editOff) / 60) }
    }
  }

  return (
    <div className="px-5 pt-3 pb-32">
      <div className="flex items-center justify-between mb-5">
        <button onClick={prevMonth} className="text-muted text-xl px-2 active:text-amber">‹</button>
        <h2 className="font-medium">{MONTHS[month]} {year}</h2>
        <button onClick={nextMonth} className="text-muted text-xl px-2 active:text-amber">›</button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {DOW.map((d, i) => <div key={i} className="text-center text-muted text-xs py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />
          const date = ymd(year, month, d)
          const shift = shiftMap.get(date)
          const hasMission = missionDays.has(date)
          const isSel = selected === d
          const isToday = date === ymd(now.getFullYear(), now.getMonth(), now.getDate())
          return (
            <button key={i} onClick={() => { setSelected(isSel ? null : d); setEditing(false); setErr('') }}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center relative text-sm
                ${isSel ? 'bg-amber text-night font-medium' : shift ? 'bg-surface-2 text-[#E6E9EF]' : 'text-muted'}
                ${isToday && !isSel ? 'ring-1 ring-amber/40' : ''}`}>
              {d}
              <div className="flex gap-0.5 absolute bottom-1">
                {shift && <span className={`w-1 h-1 rounded-full ${shift.is_day_off ? 'bg-error' : isSel ? 'bg-night' : 'bg-amber'}`} />}
                {hasMission && !shift && <span className={`w-1 h-1 rounded-full ${isSel ? 'bg-night' : 'bg-muted'}`} />}
              </div>
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="mt-5 bg-surface rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium capitalize">
              {parseLocal(selDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            {!editing && <button onClick={openEdit} className="text-amber text-sm">{selShift ? 'Modifier' : 'Ajouter'}</button>}
          </div>

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
                {editOff ? '✓ Jour OFF travaillé (100% sup)' : 'Jour normal'}
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
          ) : selShift ? (
            <>
              <Row label="Horaires" value={`${fmtMinutes(selShift.start_min)} – ${fmtMinutes(selShift.end_min)}`} />
              <Row label="Durée brute" value={fmtHours(selShift.hours)} />
              <Row label="Heures sup." value={selShift.overtime_hours > 0 ? fmtHours(selShift.overtime_hours) : '0h'} accent={selShift.overtime_hours > 0} />
              <div className="flex gap-2 mt-3">
                <button onClick={toggleOff}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium ${selShift.is_day_off ? 'bg-error/15 text-error' : 'bg-surface-2 text-muted'}`}>
                  {selShift.is_day_off ? '✓ Jour OFF' : 'Marquer OFF'}
                </button>
                <button onClick={del} className="px-4 py-3 rounded-xl text-sm text-error active:bg-error/10">Suppr.</button>
              </div>
            </>
          ) : (
            <p className="text-muted text-sm">Aucun shift enregistré ce jour.</p>
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
