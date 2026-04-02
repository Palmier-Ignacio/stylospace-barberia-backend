import { Router } from 'express'
import { db } from '../config/firebase.js'
import { requireAdmin } from '../middlewares/auth.js'
import { enviarSolicitudClienteMembresia, enviarSolicitudAdminMembresia } from '../services/emailService.js'

const router = Router()

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

// GET /solicitudes-membresia — lista solicitudes pendientes (admin)
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const { estado } = req.query
    let query = db.collection('solicitudes_membresia').orderBy('creado_en', 'desc')
    if (estado) {
      query = db.collection('solicitudes_membresia')
        .where('estado', '==', estado)
        .orderBy('creado_en', 'desc')
    }
    const snapshot = await query.get()
    const solicitudes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    res.json(solicitudes)
  } catch (err) {
    next(err)
  }
})

// POST /solicitudes-membresia — un cliente solicita membresía (público)
router.post('/', async (req, res, next) => {
  try {
    const {
      nombre_cliente,
      email,
      contacto,
      dia_semana,   // número 0-6
      hora_inicio,  // "14:30"
    } = req.body

    if (!nombre_cliente || !email || !contacto || dia_semana === undefined || !hora_inicio) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' })
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido' })
    }

    if (dia_semana < 0 || dia_semana > 6) {
      return res.status(400).json({ error: 'día de semana inválido' })
    }

    const ref = await db.collection('solicitudes_membresia').add({
      nombre_cliente,
      email,
      contacto,
      dia_semana,
      dia_nombre: DIAS[dia_semana],
      hora_inicio,
      estado: 'pendiente', // pendiente | aprobada | rechazada
      creado_en: new Date().toISOString(),
    })

    const adminEmail = process.env.ADMIN_EMAIL

    // Email al cliente: recibimos tu solicitud
    enviarSolicitudClienteMembresia({
      email,
      nombre: nombre_cliente,
      dia: DIAS[dia_semana],
      hora: hora_inicio,
    }).catch(err => console.error('[Email solicitud cliente] Error:', err.message))

    // Email al admin: nueva solicitud
    if (adminEmail) {
      enviarSolicitudAdminMembresia({
        adminEmail,
        nombre: nombre_cliente,
        email,
        contacto,
        dia: DIAS[dia_semana],
        hora: hora_inicio,
      }).catch(err => console.error('[Email solicitud admin] Error:', err.message))
    }

    res.status(201).json({ id: ref.id, mensaje: 'Solicitud enviada con éxito' })
  } catch (err) {
    next(err)
  }
})

// PATCH /solicitudes-membresia/:id — el admin actualiza el estado (aprobada/rechazada)
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { estado } = req.body
    if (!['aprobada', 'rechazada'].includes(estado)) {
      return res.status(400).json({ error: 'estado debe ser aprobada o rechazada' })
    }
    await db.collection('solicitudes_membresia').doc(req.params.id).update({ estado })
    res.json({ mensaje: `Solicitud marcada como ${estado}` })
  } catch (err) {
    next(err)
  }
})

export default router
