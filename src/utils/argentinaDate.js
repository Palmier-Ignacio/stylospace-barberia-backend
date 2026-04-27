export const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires'

function getArgentinaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARGENTINA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date)

  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

export function getNowArgentina() {
  const parts = getArgentinaParts()
  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
    0
  )
}

export function parseDateOnlyArgentina(fecha) {
  const [year, month, day] = fecha.split('-').map(Number)
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

export function construirFechaHoraArgentina(fecha, hora) {
  const [year, month, day] = fecha.split('-').map(Number)
  const [hours, minutes] = hora.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
}

export function startOfTodayArgentina() {
  const hoy = getNowArgentina()
  hoy.setHours(0, 0, 0, 0)
  return hoy
}

export function addDaysArgentina(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function startOfWeekArgentina(date = getNowArgentina()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export function startOfMonthArgentina(date = getNowArgentina()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

export function endOfMonthArgentina(date = getNowArgentina()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 0, 0, 0, 0)
}

export function toDateOnlyArgentina(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function tomorrowDateOnlyArgentina() {
  return toDateOnlyArgentina(addDaysArgentina(startOfTodayArgentina(), 1))
}
