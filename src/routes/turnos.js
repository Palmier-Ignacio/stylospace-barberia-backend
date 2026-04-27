import { Router } from 'express'
import { db } from '../config/firebase.js'
import { requireAdmin } from '../middlewares/auth.js'
import { enviarConfirmacion, enviarCancelacion, enviarModificacion } from '../services/emailService.js'
import { getCanalesContacto, puedeCancelarTurno, validarTokenCancelacion } from '../services/cancelacionService.js'

const router = Router()
const MAX_DIAS_ANTICIPACION = 30
const MIN_HORAS_ANTICIPACION = 12

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

function startOfWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function parseFechaParam(fecha) {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  return parseDateOnly(fecha)
}

function toDateOnly(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function estaDentroDeVentanaPublica(fecha) {
  const fechaDate = parseDateOnly(fecha)
  const hoy = startOfToday()
  const limite = addDays(hoy, MAX_DIAS_ANTICIPACION)
  return fechaDate >= hoy && fechaDate <= limite
}

function sumarIngresos(turnos) {
  return turnos.reduce((total, turno) => total + (Number(turno.precio) || 0), 0)
}

function esTurnoComputableComoIngreso(turno) {
  return turno.estado !== 'cancelled'
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

// GET /turnos/admin/ingresos — resumen de ingresos para dashboard admin
router.get('/admin/ingresos', requireAdmin, async (req, res, next) => {
  try {
    const hoy = startOfToday()
    const inicioSemana = startOfWeek(hoy)
    const finSemana = addDays(inicioSemana, 6)
    const inicioMes = startOfMonth(hoy)
    const finMes = endOfMonth(hoy)

    const fechaFiltro = parseFechaParam(req.query.fecha)
    const desdeFiltro = parseFechaParam(req.query.desde)
    const hastaFiltro = parseFechaParam(req.query.hasta)

    const snapshot = await db.collection('turnos').orderBy('fecha').orderBy('hora').get()
    const turnos = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(esTurnoComputableComoIngreso)

    const hoyStr = toDateOnly(hoy)
    const desdeSemana = toDateOnly(inicioSemana)
    const hastaSemanaAcumulada = hoyStr
    const hastaSemanaEstimada = toDateOnly(finSemana)
    const desdeMes = toDateOnly(inicioMes)
    const hastaMesAcumulado = hoyStr
    const hastaMesEstimado = toDateOnly(finMes)

    const filtrarPorRango = (desde, hasta) => turnos.filter(turno => turno.fecha >= desde && turno.fecha <= hasta)

    const turnosSemanaAcumulada = filtrarPorRango(desdeSemana, hastaSemanaAcumulada)
    const turnosSemanaEstimada = filtrarPorRango(desdeSemana, hastaSemanaEstimada)
    const turnosMesAcumulado = filtrarPorRango(desdeMes, hastaMesAcumulado)
    const turnosMesEstimado = filtrarPorRango(desdeMes, hastaMesEstimado)

    const historicoReal = turnos.filter(turno => turno.fecha <= hoyStr)
    const historicoPorMes = new Map()
    for (const turno of historicoReal) {
      const periodo = turno.fecha.slice(0, 7)
      const actual = historicoPorMes.get(periodo) || { periodo, ingresos: 0, turnos: 0 }
      actual.ingresos += Number(turno.precio) || 0
      actual.turnos += 1
      historicoPorMes.set(periodo, actual)
    }

    let desdeHistorico = null
    let hastaHistorico = null
    if (fechaFiltro) {
      desdeHistorico = toDateOnly(fechaFiltro)
      hastaHistorico = toDateOnly(fechaFiltro)
    } else {
      if (desdeFiltro) desdeHistorico = toDateOnly(desdeFiltro)
      if (hastaFiltro) hastaHistorico = toDateOnly(hastaFiltro)
    }

    const turnosFiltrados = historicoReal.filter(turno => {
      if (desdeHistorico && turno.fecha < desdeHistorico) return false
      if (hastaHistorico && turno.fecha > hastaHistorico) return false
      return true
    })

    res.json({
      generado_en: new Date().toISOString(),
      criterios: {
        acumulado: 'Incluye turnos no cancelados desde el inicio del período hasta hoy inclusive.',
        estimado: 'Incluye turnos no cancelados desde el inicio del período hasta el final del período inclusive.',
        historico: 'Incluye turnos no cancelados con fecha hasta hoy inclusive.',
      },
      semana: {
        acumulado: { desde: desdeSemana, hasta: hastaSemanaAcumulada, ingresos: sumarIngresos(turnosSemanaAcumulada), turnos: turnosSemanaAcumulada.length },
        estimado: { desde: desdeSemana, hasta: hastaSemanaEstimada, ingresos: sumarIngresos(turnosSemanaEstimada), turnos: turnosSemanaEstimada.length },
      },
      mes: {
        acumulado: { desde: desdeMes, hasta: hastaMesAcumulado, ingresos: sumarIngresos(turnosMesAcumulado), turnos: turnosMesAcumulado.length },
        estimado: { desde: desdeMes, hasta: hastaMesEstimado, ingresos: sumarIngresos(turnosMesEstimado), turnos: turnosMesEstimado.length },
      },
      historico: Array.from(historicoPorMes.values()).sort((a, b) => b.periodo.localeCompare(a.periodo)),
      historico_filtrado: {
        desde: desdeHistorico,
        hasta: hastaHistorico,
        ingresos: sumarIngresos(turnosFiltrados),
        turnos: turnosFiltrados.length,
        detalle: turnosFiltrados
          .map(turno => ({
            id: turno.id,
            fecha: turno.fecha,
            hora: turno.hora,
            cliente: turno.nombre_cliente,
            servicio: turno.servicio_nombre,
            precio: Number(turno.precio) || 0,
          }))
          .sort((a, b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`)),
      },
      total_historico: { ingresos: sumarIngresos(historicoReal), turnos: historicoReal.length },
    })
  } catch (err) {
    next(err)
  }
})

// GET /turnos/admin — todos los turnos (con filtros opcionales)
router.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const { fecha, estado } = req.query
    let query = db.collection('turnos').orderBy('fecha').orderBy('hora')

    if (fecha) query = db.collection('turnos').where('fecha', '==', fecha).orderBy('hora')
    if (estado) query = query.where('estado', '==', estado)

    const snapshot = await query.get()
    const turnos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    res.json(turnos)
  } catch (err) {
    next(err)
  }
})

// POST /turnos — reservar turno (público)
router.post('/', async (req, res, next) => {
  try {
    const { nombre_cliente, email, contacto, servicio_id, disponibilidad_id } = req.body

    if (!nombre_cliente || !email || !contacto || !servicio_id || !disponibilidad_id) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido' })
    }

    const [slotDoc, servicioDoc] = await Promise.all([
      db.collection('disponibilidad').doc(disponibilidad_id).get(),
      db.collection('servicios').doc(servicio_id).get(),
    ])

    if (!slotDoc.exists) return res.status(404).json({ error: 'Slot no encontrado' })
    if (!servicioDoc.exists) return res.status(404).json({ error: 'Servicio no encontrado' })

    const slot = slotDoc.data()
    const servicio = servicioDoc.data()

    if (!estaDentroDeVentanaPublica(slot.fecha)) {
      return res.status(400).json({ error: 'Solo se pueden reservar turnos dentro de los próximos 30 días' })
    }

    if (!slot.disponible) {
      return res.status(409).json({ error: 'El turno ya no está disponible' })
    }

    const ahoraArgentina = getNowArgentina()
const fechaSlot = construirFechaHoraArgentina(slot.fecha, slot.hora_inicio)
const diff = fechaSlot - ahoraArgentina
    if (diff < MIN_HORAS_ANTICIPACION * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'El turno debe reservarse con al menos 12 horas de anticipación' })
    }

    const turnoRef = db.collection('turnos').doc()

    await db.runTransaction(async (t) => {
      const slotRef = db.collection('disponibilidad').doc(disponibilidad_id)
      const slotFresh = await t.get(slotRef)
      if (!slotFresh.exists || !slotFresh.data().disponible) {
        throw { status: 409, message: 'El turno ya fue tomado por otro cliente' }
      }

      t.set(turnoRef, {
        nombre_cliente,
        email,
        contacto,
        servicio_id,
        servicio_nombre: servicio.nombre,
        disponibilidad_id,
        fecha: slot.fecha,
        hora: slot.hora_inicio,
        precio: servicio.precio,
        estado: 'confirmed',
        recordatorio_enviado: false,
        creado_en: new Date().toISOString(),
      })

      t.update(slotRef, { disponible: false })
    })

    const turnoId = turnoRef.id

    enviarConfirmacion({
      turnoId,
      email,
      nombre: nombre_cliente,
      servicio: servicio.nombre,
      fecha: slot.fecha,
      hora: slot.hora_inicio,
      precio: servicio.precio,
    }).catch(err => console.error('[Email confirmación] Error:', err.message))

    res.status(201).json({ mensaje: 'Turno reservado con éxito' })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// PUT /turnos/:id — editar un turno desde admin
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const turnoRef = db.collection('turnos').doc(req.params.id)
    const turnoDoc = await turnoRef.get()
    if (!turnoDoc.exists) return res.status(404).json({ error: 'Turno no encontrado' })

    const turnoActual = turnoDoc.data()
    if (turnoActual.estado === 'cancelled') {
      return res.status(400).json({ error: 'No se puede editar un turno cancelado' })
    }

    const { nombre_cliente, email, contacto, servicio_id, disponibilidad_id, precio } = req.body

    if (!nombre_cliente || !email || !contacto || !servicio_id || !disponibilidad_id) {
      return res.status(400).json({ error: 'nombre, email, contacto, servicio y horario son requeridos' })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido' })
    }

    const [slotDoc, servicioDoc] = await Promise.all([
      db.collection('disponibilidad').doc(disponibilidad_id).get(),
      db.collection('servicios').doc(servicio_id).get(),
    ])

    if (!slotDoc.exists) return res.status(404).json({ error: 'Slot no encontrado' })
    if (!servicioDoc.exists) return res.status(404).json({ error: 'Servicio no encontrado' })

    const servicio = servicioDoc.data()
    const cambioDeSlot = disponibilidad_id !== turnoActual.disponibilidad_id
    const precioFinal = precio === undefined || precio === '' ? Number(servicio.precio) : Number(precio)

    if (Number.isNaN(precioFinal) || precioFinal < 0) {
      return res.status(400).json({ error: 'Precio inválido' })
    }

    const turnoActualizado = await db.runTransaction(async (t) => {
      const slotRef = db.collection('disponibilidad').doc(disponibilidad_id)
      const slotFresh = await t.get(slotRef)
      if (!slotFresh.exists) throw { status: 404, message: 'Slot no encontrado' }

      const slotData = slotFresh.data()
      if (cambioDeSlot && !slotData.disponible) {
        throw { status: 409, message: 'El nuevo horario ya está ocupado' }
      }

      const dataActualizada = {
        nombre_cliente: String(nombre_cliente).trim(),
        email: String(email).trim(),
        contacto: String(contacto).trim(),
        servicio_id,
        servicio_nombre: servicio.nombre,
        disponibilidad_id,
        fecha: slotData.fecha,
        hora: slotData.hora_inicio,
        precio: precioFinal,
        actualizado_en: new Date().toISOString(),
      }

      t.update(turnoRef, dataActualizada)

      if (cambioDeSlot) {
        if (turnoActual.disponibilidad_id) {
          t.update(db.collection('disponibilidad').doc(turnoActual.disponibilidad_id), { disponible: true })
        }
        t.update(slotRef, { disponible: false })
      }

      return dataActualizada
    })

    const cambios = []
    if (turnoActual.nombre_cliente !== turnoActualizado.nombre_cliente) cambios.push('nombre')
    if (turnoActual.email !== turnoActualizado.email) cambios.push('email')
    if (turnoActual.contacto !== turnoActualizado.contacto) cambios.push('contacto')
    if (turnoActual.servicio_nombre !== turnoActualizado.servicio_nombre) cambios.push('servicio')
    if (turnoActual.fecha !== turnoActualizado.fecha || turnoActual.hora !== turnoActualizado.hora) cambios.push('fecha_hora')
    if (Number(turnoActual.precio) !== Number(turnoActualizado.precio)) cambios.push('precio')

    enviarModificacion({
      email: turnoActualizado.email,
      nombre: turnoActualizado.nombre_cliente,
      cambios,
      turnoAnterior: {
        servicio: turnoActual.servicio_nombre,
        fecha: turnoActual.fecha,
        hora: turnoActual.hora,
        precio: turnoActual.precio,
      },
      turnoNuevo: {
        servicio: turnoActualizado.servicio_nombre,
        fecha: turnoActualizado.fecha,
        hora: turnoActualizado.hora,
        precio: turnoActualizado.precio,
      },
      turnoId: req.params.id,
    }).catch(err => console.error('[Email modificación] Error:', err.message))

    res.json({ mensaje: 'Turno actualizado correctamente y cliente notificado' })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

// PATCH /turnos/:id/cancelar — cancelar un turno (admin)
router.patch('/:id/cancelar', requireAdmin, async (req, res, next) => {
  try {
    const turnoDoc = await db.collection('turnos').doc(req.params.id).get()
    if (!turnoDoc.exists) return res.status(404).json({ error: 'Turno no encontrado' })

    const turno = turnoDoc.data()

    const ahoraArgentina = getNowArgentina()
const fechaHoraTurno = construirFechaHoraArgentina(turno.fecha, turno.hora)
const turnoYaPaso = fechaHoraTurno < ahoraArgentina

    await db.runTransaction(async (t) => {
      t.update(db.collection('turnos').doc(req.params.id), {
        estado: 'cancelled',
        cancelado_por: 'admin',
        cancelado_en: new Date().toISOString(),
      })
      t.update(db.collection('disponibilidad').doc(turno.disponibilidad_id), { disponible: true })
    })

    if (!turnoYaPaso) {
      enviarCancelacion({
        email: turno.email,
        nombre: turno.nombre_cliente,
        servicio: turno.servicio_nombre,
        fecha: turno.fecha,
        hora: turno.hora,
      }).catch(err => console.error('[Email cancelación] Error:', err.message))
    }

    res.json({
      mensaje: turnoYaPaso
        ? 'Turno cancelado sin notificar al cliente porque ya había pasado'
        : 'Turno cancelado, slot liberado y cliente notificado',
    })
  } catch (err) {
    next(err)
  }
})

function validarAccesoCancelacionPublica(req, res) {
  const token = req.query.token || req.body?.token
  if (!validarTokenCancelacion(req.params.id, token)) {
    res.status(401).json({ error: 'Link de cancelación inválido o vencido' })
    return null
  }
  return token
}

// GET /turnos/:id/cancelacion-publica — validar estado del link público
router.get('/:id/cancelacion-publica', async (req, res, next) => {
  try {
    if (!validarAccesoCancelacionPublica(req, res)) return

    const turnoDoc = await db.collection('turnos').doc(req.params.id).get()
    if (!turnoDoc.exists) return res.status(404).json({ error: 'Turno no encontrado' })

    const turno = turnoDoc.data()
    const evaluacion = puedeCancelarTurno(turno)

    res.json({
      turno: {
        id: turnoDoc.id,
        nombre_cliente: turno.nombre_cliente,
        servicio_nombre: turno.servicio_nombre,
        fecha: turno.fecha,
        hora: turno.hora,
        estado: turno.estado,
        cancelado_por: turno.cancelado_por,
      },
      cancelacion: evaluacion,
      contacto: getCanalesContacto(),
    })
  } catch (err) {
    next(err)
  }
})

// PATCH /turnos/:id/cancelacion-publica — cancelar un turno desde link público
router.patch('/:id/cancelacion-publica', async (req, res, next) => {
  try {
    if (!validarAccesoCancelacionPublica(req, res)) return

    const turnoRef = db.collection('turnos').doc(req.params.id)
    const turnoDoc = await turnoRef.get()
    if (!turnoDoc.exists) return res.status(404).json({ error: 'Turno no encontrado' })

    const turno = turnoDoc.data()
    const evaluacion = puedeCancelarTurno(turno)

    if (!evaluacion.ok) {
      return res.status(evaluacion.code === 'already_cancelled' ? 409 : 400).json({
        error: evaluacion.message,
        code: evaluacion.code,
        contacto: getCanalesContacto(),
      })
    }

    await db.runTransaction(async (t) => {
      const freshTurnoDoc = await t.get(turnoRef)
      if (!freshTurnoDoc.exists) {
        throw { status: 404, message: 'Turno no encontrado' }
      }

      const freshTurno = freshTurnoDoc.data()
      const freshEvaluacion = puedeCancelarTurno(freshTurno)
      if (!freshEvaluacion.ok) {
        throw { status: freshEvaluacion.code === 'already_cancelled' ? 409 : 400, message: freshEvaluacion.message, code: freshEvaluacion.code }
      }

      t.update(turnoRef, { estado: 'cancelled', cancelado_por: 'cliente', cancelado_en: new Date().toISOString() })
      t.update(db.collection('disponibilidad').doc(freshTurno.disponibilidad_id), { disponible: true })
    })

    enviarCancelacion({
      email: turno.email,
      nombre: turno.nombre_cliente,
      servicio: turno.servicio_nombre,
      fecha: turno.fecha,
      hora: turno.hora,
    }).catch(err => console.error('[Email cancelación pública] Error:', err.message))

    res.json({ mensaje: 'Turno cancelado con éxito', contacto: getCanalesContacto() })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, code: err.code, contacto: getCanalesContacto() })
    next(err)
  }
})

export default router
