import { Router } from 'express'
import { db } from '../config/firebase.js'
import { requireAdmin } from '../middlewares/auth.js'
import { enviarConfirmacion, enviarCancelacion } from '../services/emailService.js'

const router = Router()

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

    // Validar email básico
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido' })
    }

    // Obtener el slot y el servicio en paralelo
    const [slotDoc, servicioDoc] = await Promise.all([
      db.collection('disponibilidad').doc(disponibilidad_id).get(),
      db.collection('servicios').doc(servicio_id).get(),
    ])

    if (!slotDoc.exists) return res.status(404).json({ error: 'Slot no encontrado' })
    if (!servicioDoc.exists) return res.status(404).json({ error: 'Servicio no encontrado' })

    const slot = slotDoc.data()
    const servicio = servicioDoc.data()

    if (!slot.disponible) {
      return res.status(409).json({ error: 'El turno ya no está disponible' })
    }

    // Validar 12hs de anticipación
    const ahora = new Date()
    const fechaSlot = new Date(`${slot.fecha}T${slot.hora_inicio}:00`)
    const diff = fechaSlot - ahora
    if (diff < 12 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'El turno debe reservarse con al menos 12 horas de anticipación' })
    }

    // Transacción: marcar slot como ocupado y crear el turno
    await db.runTransaction(async (t) => {
      const slotRef = db.collection('disponibilidad').doc(disponibilidad_id)
      const slotFresh = await t.get(slotRef)
      if (!slotFresh.data().disponible) {
        throw { status: 409, message: 'El turno ya fue tomado por otro cliente' }
      }

      const turnoRef = db.collection('turnos').doc()
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

    // Enviar email de confirmación (no bloqueamos la respuesta si falla)
    enviarConfirmacion({
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
      // Cancelar el turno
      t.update(db.collection('turnos').doc(req.params.id), { estado: 'cancelled' })
      // Liberar el slot
      t.update(db.collection('disponibilidad').doc(turno.disponibilidad_id), { disponible: true })
    })

    // Email de cancelación al cliente
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

export default router
