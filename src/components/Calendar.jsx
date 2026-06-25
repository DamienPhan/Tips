import { useState } from 'react'
import { useMissions } from '../store/missions'
import { fmtHours, fmtMinutes, computeOvertime } from '../lib/parseShift'
import { parseLocal } from '../lib/date'

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function ymd(y, m, d) { return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` }

export default function Calendar() {
  const shifts = useMissions(s => s.shifts)
  const missions = useMissions(s => s.missions)
  const updateShift = useMissions(s => s.updateShift)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState(null)

  const shiftMap = new Map(shifts.map(s => [s.shift_date, s]))
  const missionDays = new Set(missions.map(m => m.intervention_date))

  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7  // lundi=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1) } else setMonth(month - 1); setSelected(null) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1) } else setMonth(month + 1); setSelected(null) }

  const selDate = selected ? ymd(year, month, selected) : null
  const selShift = selDate ? shiftMap.get(selDate) : null

  const toggleOff = async () => {
    if (!selShift) return
    const isOff = !selShift.is_day_off
    await updateShift({ ...selShift, is_day_off: isOff, overtime_hours: computeOvertime(selShift.hours, isOff) })
  }

  return (
    <div className="px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-32">
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
            <button key={i} onClick={() => setSelected(isSel ? null : d)}
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
          <h3 className="font-medium mb-3">
            {parseLocal(selDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          {selShift ? (
            <>
              <Row label="Horaires" value={`${fmtMinutes(selShift.start_min)} – ${fmtMinutes(selShift.end_min)}`} />
              <Row label="Durée brute" value={fmtHours(selShift.hours)} />
              <Row label="Heures sup." value={selShift.overtime_hours > 0 ? fmtHours(selShift.overtime_hours) : '0h'} accent={selShift.overtime_hours > 0} />
              <button onClick={toggleOff}
                className={`w-full mt-3 py-3 rounded-xl text-sm font-medium ${selShift.is_day_off ? 'bg-error/15 text-error' : 'bg-surface-2 text-muted'}`}>
                {selShift.is_day_off ? '✓ Jour OFF travaillé (100% sup)' : 'Marquer comme jour OFF travaillé'}
              </button>
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
