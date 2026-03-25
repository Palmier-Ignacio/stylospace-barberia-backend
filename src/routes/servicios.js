import { Router } from 'express'
import { db } from '../config/firebase.js'
import { requireAdmin } from '../middlewares/auth.js'

const router = Router()

// GET /servicios — público, para que el cliente vea qué servicios hay
router.get('/', async (req, res, next) => {
  try {
    const snapshot = await db.collection('servicios')
      .where('activo', '==', true)
      .orderBy('nombre')
      .get()

    const servicios = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    res.json(servicios)
  } catch (err) {
    next(err)
  }
})

// GET /servicios/admin — todos (incluyendo inactivos), solo admin
router.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const snapshot = await db.collection('servicios').orderBy('nombre').get()
    const servicios = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    res.json(servicios)
  } catch (err) {
    next(err)
  }
})

// POST /servicios — crear nuevo servicio
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { nombre, precio, duracion_min, descripcion } = req.body

    if (!nombre || !precio || !duracion_min) {
      return res.status(400).json({ error: 'nombre, precio y duracion_min son requeridos' })
    }

    const ref = await db.collection('servicios').add({
      nombre,
      precio: Number(precio),
      duracion_min: Number(duracion_min),
      descripcion: descripcion || '',
      activo: true,
    })

    res.status(201).json({ id: ref.id, mensaje: 'Servicio creado' })
  } catch (err) {
    next(err)
  }
})

// PUT /servicios/:id — editar servicio
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    const { nombre, precio, duracion_min, descripcion, activo } = req.body

    const updates = {}
    if (nombre !== undefined) updates.nombre = nombre
    if (precio !== undefined) updates.precio = Number(precio)
    if (duracion_min !== undefined) updates.duracion_min = Number(duracion_min)
    if (descripcion !== undefined) updates.descripcion = descripcion
    if (activo !== undefined) updates.activo = Boolean(activo)

    await db.collection('servicios').doc(id).update(updates)
    res.json({ mensaje: 'Servicio actualizado' })
  } catch (err) {
    next(err)
  }
})

// DELETE /servicios/:id — desactiva en lugar de borrar (soft delete)
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.collection('servicios').doc(req.params.id).update({ activo: false })
    res.json({ mensaje: 'Servicio desactivado' })
  } catch (err) {
    next(err)
  }
})

export default router
