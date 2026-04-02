import { Router } from 'express'
import { db } from '../config/firebase.js'
import { requireAdmin } from '../middlewares/auth.js'
import { enviarConfirmacionMembresia, enviarBajaMembresia } from '../services/emailService.js'

const router = Router()

// Genera todas las fechas futuras de un día de semana desde hoy
function generarFechasFuturas(diaSemana, horaInicio, horaFin, mesesAdelante = 6) {
  const fechas = []
  const hoy = new Date()
  const limite = new Date()
  limite.setMonth(limite.getMonth() + mesesAdelante)

  const cursor = new Date(hoy)
  // Avanzar hasta el próximo día de semana indicado
  while (cursor.getDay() !== diaSemana) {
    cursor.setDate(cursor.getDate() + 1)
  }

  while (cursor <= limite) {
    fechas.push({
      fecha: cursor.toISOString().split('T')[0],
      hora_inicio: horaInicio,
      hora_fin: horaFin,
    })
    cursor.setDate(cursor.getDate() + 7)
  }

  return fechas
}

// GET /membresias — lista todas las membresías (admin)
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const snapshot = await db.collection('membresias').orderBy('nombre_cliente').get()
    const membresias = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    res.json(membresias)
  } catch (err) {
    next(err)
  }
})

// POST /membresias — el admin activa una membresía para un cliente
// Esto reserva automáticamente todos los slots de ese día/hora para los próximos N meses
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const {
      nombre_cliente,
      email,
      contacto,
      servicio_id,
      dia_semana,   // 0=dom, 1=lun... 6=sab
      hora_inicio,  // "14:30"
      hora_fin,     // "15:00"
    } = req.body

    if (!nombre_cliente || !email || !contacto || !servicio_id ||
        dia_semana === undefined || !hora_inicio || !hora_fin) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    const servicioDoc = await db.collection('servicios').doc(servicio_id).get()
    if (!servicioDoc.exists) return res.status(404).json({ error: 'Servicio no encontrado' })
    const servicio = servicioDoc.data()

    // Crear la membresía
    const membresiaRef = await db.collection('membresias').add({
      nombre_cliente,
      email,
      contacto,
      servicio_id,
      servicio_nombre: servicio.nombre,
      dia_semana,
      hora_inicio,
      hora_fin,
      activo: true,
      creado_en: new Date().toISOString(),
    })

    // Buscar y reservar todos los slots correspondientes
    const fechas = generarFechasFuturas(dia_semana, hora_inicio, hora_fin)
    const batch = db.batch()
    let reservados = 0
    const noEncontrados = []

    for (const { fecha } of fechas) {
      const slotSnap = await db.collection('disponibilidad')
        .where('fecha', '==', fecha)
        .where('hora_inicio', '==', hora_inicio)
        .where('disponible', '==', true)
        .limit(1)
        .get()

      if (slotSnap.empty) {
        noEncontrados.push(fecha)
        continue
      }

      const slotRef = slotSnap.docs[0].ref

      // Crear el turno para esta fecha
      const turnoRef = db.collection('turnos').doc()
      batch.set(turnoRef, {
        nombre_cliente,
        email,
        contacto,
        servicio_id,
        servicio_nombre: servicio.nombre,
        disponibilidad_id: slotSnap.docs[0].id,
        fecha,
        hora: hora_inicio,
        precio: servicio.precio,
        estado: 'confirmed',
        recordatorio_enviado: false,
        membresia_id: membresiaRef.id,
        creado_en: new Date().toISOString(),
      })

      // Marcar el slot como ocupado
      batch.update(slotRef, { disponible: false })
      reservados++
    }

    await batch.commit()

    // Email al cliente confirmando la membresía
    enviarConfirmacionMembresia({
      email,
      nombre: nombre_cliente,
      servicio: servicio.nombre,
      dia_semana,
      hora_inicio,
      precio: servicio.precio,
    }).catch(err => console.error('[Email membresía] Error:', err.message))

    res.status(201).json({
      membresia_id: membresiaRef.id,
      turnos_reservados: reservados,
      slots_no_encontrados: noEncontrados,
    })
  } catch (err) {
    next(err)
  }
})

// PATCH /membresias/:id/baja — el admin da de baja una membresía
// Libera todos los turnos futuros asociados
router.patch('/:id/baja', requireAdmin, async (req, res, next) => {
  try {
    const membresiaDoc = await db.collection('membresias').doc(req.params.id).get()
    if (!membresiaDoc.exists) return res.status(404).json({ error: 'Membresía no encontrada' })

    const membresia = membresiaDoc.data()
    const hoy = new Date().toISOString().split('T')[0]

    // Buscar todos los turnos futuros de esta membresía
    const turnosSnap = await db.collection('turnos')
      .where('membresia_id', '==', req.params.id)
      .where('estado', '==', 'confirmed')
      .get()

    const batch = db.batch()
    let liberados = 0

    for (const doc of turnosSnap.docs) {
      const turno = doc.data()
      if (turno.fecha >= hoy) {
        // Cancelar el turno
        batch.update(doc.ref, { estado: 'cancelled' })
        // Liberar el slot
        batch.update(
          db.collection('disponibilidad').doc(turno.disponibilidad_id),
          { disponible: true }
        )
        liberados++
      }
    }

    // Marcar membresía como inactiva
    batch.update(db.collection('membresias').doc(req.params.id), { activo: false })

    await batch.commit()

    // Email al cliente informando la baja
    enviarBajaMembresia({
      email: membresia.email,
      nombre: membresia.nombre_cliente,
      servicio: membresia.servicio_nombre,
    }).catch(err => console.error('[Email baja membresía] Error:', err.message))

    res.json({ mensaje: 'Membresía dada de baja', turnos_liberados: liberados })
  } catch (err) {
    next(err)
  }
})

// PATCH /membresias/:id/liberar-fecha — el admin libera un turno específico de una membresía
router.patch('/:id/liberar-fecha', requireAdmin, async (req, res, next) => {
  try {
    const { fecha } = req.body
    if (!fecha) return res.status(400).json({ error: 'fecha requerida' })

    // Buscar el turno de esa membresía en esa fecha
    const turnoSnap = await db.collection('turnos')
      .where('membresia_id', '==', req.params.id)
      .where('fecha', '==', fecha)
      .where('estado', '==', 'confirmed')
      .limit(1)
      .get()

    if (turnoSnap.empty) {
      return res.status(404).json({ error: 'No se encontró turno para esa fecha' })
    }

    const turnoDoc = turnoSnap.docs[0]
    const turno = turnoDoc.data()

    await db.runTransaction(async (t) => {
      t.update(turnoDoc.ref, { estado: 'cancelled', liberado_por_admin: true })
      t.update(
        db.collection('disponibilidad').doc(turno.disponibilidad_id),
        { disponible: true }
      )
    })

    res.json({ mensaje: `Fecha ${fecha} liberada para otros clientes` })
  } catch (err) {
    next(err)
  }
})

export default router
