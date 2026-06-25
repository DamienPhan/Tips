import Dexie from 'dexie'

export const db = new Dexie('missionsCache')
db.version(2).stores({
  missions: 'id, syncStatus, intervention_date',
  shifts: 'id, syncStatus, shift_date'
})
