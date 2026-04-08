import { Router } from 'express'
import { db } from '../config/firebase.js'
import { requireAdmin } from '../middlewares/auth.js'

const router = Router()
const collection = db.collection('servicios')

// GET /servicios -> públicos, solo activos
router.get('/', async (req, res, next) => {
  try {
    const snap = await collection.where('activo', '==', true).get()

    const servicios = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    servicios.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))

    res.json(servicios)
  } catch (err) {
    next(err)
  }
})

// GET /servicios/admin -> todos
router.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const snap = await collection.get()

    const servicios = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }))

    servicios.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))

    res.json(servicios)
  } catch (err) {
    next(err)
  }
})

// POST /servicios
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const {
      nombre,
      precio,
      duracion_min,
      descripcion = '',
      imagen = '',
      activo = true,
    } = req.body

    if (!nombre || precio === undefined || duracion_min === undefined) {
      return res.status(400).json({ error: 'nombre, precio y duracion_min son requeridos' })
    }

    const data = {
      nombre: String(nombre).trim(),
      precio: Number(precio),
      duracion_min: Number(duracion_min),
      descripcion: String(descripcion || '').trim(),
      imagen: String(imagen || '').trim(),
      activo: Boolean(activo),
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    }

    const ref = await collection.add(data)

    res.status(201).json({
      id: ref.id,
      mensaje: 'Servicio creado correctamente',
    })
  } catch (err) {
    next(err)
  }
})

// PUT /servicios/:id
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const ref = collection.doc(req.params.id)
    const snap = await ref.get()

    if (!snap.exists) {
      return res.status(404).json({ error: 'Servicio no encontrado' })
    }

    const {
      nombre,
      precio,
      duracion_min,
      descripcion = '',
      imagen = '',
      activo = true,
    } = req.body

    if (!nombre || precio === undefined || duracion_min === undefined) {
      return res.status(400).json({ error: 'nombre, precio y duracion_min son requeridos' })
    }

    const data = {
      nombre: String(nombre).trim(),
      precio: Number(precio),
      duracion_min: Number(duracion_min),
      descripcion: String(descripcion || '').trim(),
      imagen: String(imagen || '').trim(),
      activo: Boolean(activo),
      actualizado_en: new Date().toISOString(),
    }

    await ref.update(data)

    res.json({ mensaje: 'Servicio actualizado correctamente' })
  } catch (err) {
    next(err)
  }
})

// DELETE /servicios/:id -> desactiva
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const ref = collection.doc(req.params.id)
    const snap = await ref.get()

    if (!snap.exists) {
      return res.status(404).json({ error: 'Servicio no encontrado' })
    }

    await ref.update({
      activo: false,
      actualizado_en: new Date().toISOString(),
    })

    res.json({ mensaje: 'Servicio desactivado correctamente' })
  } catch (err) {
    next(err)
  }
})

export default router