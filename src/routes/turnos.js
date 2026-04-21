import { Router } from 'express'
import { db } from '../config/firebase.js'
import { requireAdmin } from '../middlewares/auth.js'
import { enviarConfirmacion, enviarCancelacion } from '../services/emailService.js'
import { getCanalesContacto, puedeCancelarTurno, validarTokenCancelacion } from '../services/cancelacionService.js'

const router = Router()
const MAX_DIAS_ANTICIPACION = 30
const MIN_HORAS_ANTICIPACION = 12

function parseDateOnly(fecha) {
  const [year, month, day] = fecha.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function startOfToday() {
  const hoy = new Date()
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
    const {
      nombre_cliente,
      email,
      contacto,
      servicio_id,
      disponibilidad_id,
    } = req.body

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

    const ahora = new Date()
    const fechaSlot = new Date(`${slot.fecha}T${slot.hora_inicio}:00`)
    const diff = fechaSlot - ahora
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

// PATCH /turnos/:id/cancelar — cancelar un turno (admin)
router.patch('/:id/cancelar', requireAdmin, async (req, res, next) => {
  try {
    const turnoDoc = await db.collection('turnos').doc(req.params.id).get()
    if (!turnoDoc.exists) return res.status(404).json({ error: 'Turno no encontrado' })

    const turno = turnoDoc.data()

    await db.runTransaction(async (t) => {
      t.update(db.collection('turnos').doc(req.params.id), { estado: 'cancelled' })
      t.update(db.collection('disponibilidad').doc(turno.disponibilidad_id), { disponible: true })
    })

    enviarCancelacion({
      email: turno.email,
      nombre: turno.nombre_cliente,
      servicio: turno.servicio_nombre,
      fecha: turno.fecha,
      hora: turno.hora,
    }).catch(err => console.error('[Email cancelación] Error:', err.message))

    res.json({ mensaje: 'Turno cancelado y slot liberado' })
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
