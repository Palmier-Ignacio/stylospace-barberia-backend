import { Router } from 'express'
import { db } from '../config/firebase.js'
import { requireAdmin } from '../middlewares/auth.js'

const router = Router()
const MAX_DIAS_ANTICIPACION = 30
const MIN_HORAS_ANTICIPACION = 12

function formatFechaLocal(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateOnly(fecha) {
  const [year, month, day] = fecha.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function startOfToday() {
  const hoy = getNowArgentina()
  hoy.setHours(0, 0, 0, 0)
  return hoy
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function estaDentroDeVentanaPublica(fecha) {
  const fechaDate = parseDateOnly(fecha)
  const hoy = startOfToday()
  const limite = addDays(hoy, MAX_DIAS_ANTICIPACION)
  return fechaDate >= hoy && fechaDate <= limite
}

function normalizarBoolean(value) {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return Boolean(value)
}

// Genera slots de N min entre hora_desde y hora_hasta
function generarSlots(horaDesde, horaHasta, duracionMin = 30) {
  const slots = []
  const [hD, mD] = horaDesde.split(':').map(Number)
  const [hH, mH] = horaHasta.split(':').map(Number)
  let minutos = hD * 60 + mD
  const fin = hH * 60 + mH

  while (minutos + duracionMin <= fin) {
    const h = String(Math.floor(minutos / 60)).padStart(2, '0')
    const m = String(minutos % 60).padStart(2, '0')
    slots.push(`${h}:${m}`)
    minutos += duracionMin
  }
  return slots
}

function calcularHoraFin(horaInicio, duracionMin) {
  const [h, m] = horaInicio.split(':').map(Number)
  const finMin = h * 60 + m + duracionMin
  return `${String(Math.floor(finMin / 60)).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`
}

function getNowArgentina() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(new Date())

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return new Date(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
    0
  )
}

function construirFechaHoraArgentina(fecha, hora) {
  const [year, month, day] = fecha.split('-').map(Number)
  const [hours, minutes] = hora.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
}

function esSlotReservable(fecha, horaInicio) {
  const ahoraArgentina = getNowArgentina()
  const limite = new Date(ahoraArgentina.getTime() + MIN_HORAS_ANTICIPACION * 60 * 60 * 1000)
  const slotDate = construirFechaHoraArgentina(fecha, horaInicio)
  return slotDate > limite
}

function crearResumenVacio(fecha) {
  return {
    fecha,
    disponibles: 0,
    primera_hora: null,
    ultima_hora: null,
  }
}

function acumularHoraEnResumen(resumen, hora) {
  resumen.disponibles += 1
  if (!resumen.primera_hora || hora < resumen.primera_hora) {
    resumen.primera_hora = hora
  }
  if (!resumen.ultima_hora || hora > resumen.ultima_hora) {
    resumen.ultima_hora = hora
  }
}

async function obtenerRangosActivos() {
  const snapshot = await db.collection('rangos_horarios')
    .where('activo', '==', true)
    .get()

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

async function asegurarDisponibilidadParaFecha(fecha) {
  const fechaDate = parseDateOnly(fecha)
  const diaSemana = fechaDate.getDay()

  // 🔒 1. chequeo de excepciones (día cerrado)
  const excepcionSnap = await db.collection('excepciones_fecha')
    .where('fecha', '==', fecha)
    .limit(1)
    .get()

  if (!excepcionSnap.empty) {
    const excepcion = excepcionSnap.docs[0].data()
    if (excepcion.cerrado) {
      return { creados: 0, existentes: 0 }
    }
  }

  // 🔄 2. buscar overrides (rangos)
  const rangosSnap = await db.collection('rangos_horarios')
    .where('activo', '==', true)
    .where('fecha_desde', '<=', fecha)
    .where('fecha_hasta', '>=', fecha)
    .get()

  let configuraciones = []

  for (const doc of rangosSnap.docs) {
    const r = doc.data()
    if (Array.isArray(r.dias_semana) && r.dias_semana.includes(diaSemana)) {
      configuraciones.push({
        hora_desde: r.hora_desde,
        hora_hasta: r.hora_hasta,
        duracion: Number(r.duracion_min) || 30,
      })
    }
  }

  // 📅 3. si no hay override → usar horario base
  if (configuraciones.length === 0) {
    const baseSnap = await db.collection('horarios_base')
      .where('dia_semana', '==', diaSemana)
      .where('activo', '==', true)
      .limit(1)
      .get()

    if (baseSnap.empty) {
      return { creados: 0, existentes: 0 }
    }

    const base = baseSnap.docs[0].data()

    configuraciones.push({
      hora_desde: base.hora_desde,
      hora_hasta: base.hora_hasta,
      duracion: Number(base.duracion_min) || 30,
    })
  }

  // 🔍 4. obtener slots existentes
  const existentesSnap = await db.collection('disponibilidad')
    .where('fecha', '==', fecha)
    .get()

  const existentes = new Set(
    existentesSnap.docs.map(doc => doc.data().hora_inicio)
  )

  const batch = db.batch()
  let creados = 0

  // ⚙️ 5. generar slots
  for (const config of configuraciones) {
    const slots = generarSlots(config.hora_desde, config.hora_hasta, config.duracion)

    for (const horaInicio of slots) {
      if (existentes.has(horaInicio)) continue

      const ref = db.collection('disponibilidad').doc()
      batch.set(ref, {
        fecha,
        hora_inicio: horaInicio,
        hora_fin: calcularHoraFin(horaInicio, config.duracion),
        disponible: true,
        generado_automaticamente: true,
      })

      existentes.add(horaInicio)
      creados++
    }
  }

  if (creados > 0) {
    await batch.commit()
  }

  return { creados, existentes: existentesSnap.size }
}

async function obtenerSlotsDelDia(fecha, soloDisponibles = false) {
  await asegurarDisponibilidadParaFecha(fecha)

  let query = db.collection('disponibilidad')
    .where('fecha', '==', fecha)
    .orderBy('hora_inicio')

  if (soloDisponibles) {
    query = db.collection('disponibilidad')
      .where('fecha', '==', fecha)
      .where('disponible', '==', true)
      .orderBy('hora_inicio')
  }

  const snapshot = await query.get()
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

function construirResumenEstimadoParaFecha(fecha, rangos) {
  const fechaDate = parseDateOnly(fecha)
  const diaSemana = fechaDate.getDay()
  const resumen = crearResumenVacio(fecha)

  for (const rango of rangos) {
    if (!Array.isArray(rango.dias_semana) || !rango.dias_semana.includes(diaSemana)) continue
    if (rango.fecha_desde && rango.fecha_desde > fecha) continue
    if (rango.fecha_hasta && rango.fecha_hasta < fecha) continue

    const duracion = Number(rango.duracion_min) || 30
    const slots = generarSlots(rango.hora_desde, rango.hora_hasta, duracion)

    for (const hora of slots) {
      if (!esSlotReservable(fecha, hora)) continue
      acumularHoraEnResumen(resumen, hora)
    }
  }

  return resumen
}

// GET /disponibilidad?fecha=YYYY-MM-DD — slots disponibles para un día (público)
router.get('/', async (req, res, next) => {
  try {
    const { fecha } = req.query
    if (!fecha) return res.status(400).json({ error: 'fecha requerida' })
    const hoy = startOfToday()
    const fechaDate = parseDateOnly(fecha)

    const limite = addDays(hoy, MAX_DIAS_ANTICIPACION)

    if (fechaDate > limite) {
      return res.status(400).json({ error: 'Fecha fuera del rango permitido' })
    }

    if (!estaDentroDeVentanaPublica(fecha)) {
      return res.json([])
    }

    const slots = await obtenerSlotsDelDia(fecha, true)

    const filtrados = slots.filter(slot => esSlotReservable(slot.fecha, slot.hora_inicio))

    res.json(filtrados)
  } catch (err) {
    next(err)
  }
})

// GET /disponibilidad/resumen?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Devuelve un resumen liviano por fecha para pintar el calendario.
router.get('/resumen', async (req, res, next) => {
  try {
    const { desde, hasta } = req.query

    if (!desde || !hasta) {
      return res.status(400).json({ error: 'desde y hasta son requeridos' })
    }

    const inicio = parseDateOnly(desde)
    const fin = parseDateOnly(hasta)

    if (fin < inicio) {
      return res.status(400).json({ error: 'El rango de fechas es inválido' })
    }

    const hoy = startOfToday()
    const limite = addDays(hoy, MAX_DIAS_ANTICIPACION)
    const rangoInicio = inicio < hoy ? hoy : inicio
    const rangoFin = fin > limite ? limite : fin

    if (rangoFin < rangoInicio) {
      return res.json([])
    }

    const [rangos, disponibilidadSnap] = await Promise.all([
      obtenerRangosActivos(),
      db.collection('disponibilidad')
        .where('fecha', '>=', formatFechaLocal(rangoInicio))
        .where('fecha', '<=', formatFechaLocal(rangoFin))
        .where('disponible', '==', true)
        .get(),
    ])

    const resumenMap = new Map()

    for (let d = new Date(rangoInicio); d <= rangoFin; d.setDate(d.getDate() + 1)) {
      const fecha = formatFechaLocal(d)
      resumenMap.set(fecha, construirResumenEstimadoParaFecha(fecha, rangos))
    }

    for (const doc of disponibilidadSnap.docs) {
      const slot = doc.data()
      if (!esSlotReservable(slot.fecha, slot.hora_inicio)) continue

      if (!resumenMap.has(slot.fecha)) {
        resumenMap.set(slot.fecha, crearResumenVacio(slot.fecha))
      }

      const resumen = resumenMap.get(slot.fecha)

      // Si ya existen slots materializados para el día, priorizamos la disponibilidad real.
      if (!resumen.__materializado) {
        resumen.disponibles = 0
        resumen.primera_hora = null
        resumen.ultima_hora = null
        resumen.__materializado = true
      }

      acumularHoraEnResumen(resumen, slot.hora_inicio)
    }

    const items = Array.from(resumenMap.values()).map(({ __materializado, ...item }) => item)
    res.json(items)
  } catch (err) {
    next(err)
  }
})

// GET /disponibilidad/admin?fecha=YYYY-MM-DD — todos los slots (admin)
router.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const { fecha } = req.query
    if (!fecha) return res.status(400).json({ error: 'fecha requerida' })

    const slots = await obtenerSlotsDelDia(fecha, false)
    res.json(slots)
  } catch (err) {
    next(err)
  }
})

// POST /disponibilidad/slot — habilitar un slot manual para una fecha y hora
router.post('/slot', requireAdmin, async (req, res, next) => {
  try {
    const { fecha, hora_inicio, hora_fin } = req.body
    if (!fecha || !hora_inicio || !hora_fin) {
      return res.status(400).json({ error: 'fecha, hora_inicio y hora_fin son requeridos' })
    }

    const existe = await db.collection('disponibilidad')
      .where('fecha', '==', fecha)
      .where('hora_inicio', '==', hora_inicio)
      .get()

    if (!existe.empty) {
      return res.status(409).json({ error: 'Ya existe ese slot' })
    }

    const ref = await db.collection('disponibilidad').add({
      fecha,
      hora_inicio,
      hora_fin,
      disponible: true,
      rango_id: null,
      generado_automaticamente: false,
    })

    res.status(201).json({ id: ref.id, mensaje: 'Slot habilitado' })
  } catch (err) {
    next(err)
  }
})

// POST /disponibilidad/rango — registra una regla horaria.
router.post('/rango', requireAdmin, async (req, res, next) => {
  try {
    const { dias_semana, hora_desde, hora_hasta, fecha_desde, fecha_hasta, duracion_min } = req.body
    if (!dias_semana || !hora_desde || !hora_hasta || !fecha_desde || !fecha_hasta) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    const rangoRef = await db.collection('rangos_horarios').add({
      dias_semana,
      hora_desde,
      hora_hasta,
      fecha_desde,
      fecha_hasta,
      duracion_min: Number(duracion_min) || 30,
      activo: true,
    })

    res.status(201).json({ rango_id: rangoRef.id, mensaje: 'Rango horario creado' })
  } catch (err) {
    next(err)
  }
})

// PATCH /disponibilidad/:id — habilitar/deshabilitar un slot
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { disponible } = req.body
    const slotId = req.params.id

    const slotRef = db.collection('disponibilidad').doc(slotId)
    const slotDoc = await slotRef.get()

    if (!slotDoc.exists) {
      return res.status(404).json({ error: 'Slot no encontrado' })
    }

    const nuevoDisponible = normalizarBoolean(disponible)

    if (nuevoDisponible === true) {
      const turnoSnap = await db.collection('turnos')
        .where('disponibilidad_id', '==', slotId)
        .where('estado', '==', 'confirmed')
        .limit(1)
        .get()

      if (!turnoSnap.empty) {
        const turnoDoc = turnoSnap.docs[0]
        const turno = turnoDoc.data()

        const ahoraArgentina = getNowArgentina()
        const fechaHoraTurno = construirFechaHoraArgentina(turno.fecha, turno.hora)
        const turnoYaPaso = fechaHoraTurno < ahoraArgentina

        await db.runTransaction(async (t) => {
          t.update(turnoDoc.ref, {
            estado: 'cancelled',
            cancelado_por: 'admin',
            cancelado_en: new Date().toISOString(),
          })
          t.update(slotRef, { disponible: true })
        })

        const { enviarCancelacion } = await import('../services/emailService.js')
        if (!turnoYaPaso) {
          enviarCancelacion({
            email: turno.email,
            nombre: turno.nombre_cliente,
            servicio: turno.servicio_nombre,
            fecha: turno.fecha,
            hora: turno.hora,
          }).catch(err => console.error('[Email cancelación] Error:', err.message))
        }

        return res.json({
          mensaje: turnoYaPaso
            ? 'Turno cancelado sin notificar al cliente porque ya había pasado'
            : 'Turno cancelado, slot liberado y cliente notificado',
        })
      }
    }

    await slotRef.update({
      disponible: nuevoDisponible,
    })

    res.json({ mensaje: 'Slot actualizado' })
  } catch (err) {
    next(err)
  }
})

export default router
