import Dexie from 'dexie'

export const db = new Dexie('missionsCache')
db.version(1).stores({
  missions: 'id, syncStatus, intervention_date'
})
