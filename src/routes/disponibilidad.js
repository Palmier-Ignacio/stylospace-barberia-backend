import { Router } from 'express'
import { db } from '../config/firebase.js'
import { requireAdmin } from '../middlewares/auth.js'

const router = Router()

// Genera slots de 30 min entre hora_desde y hora_hasta
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

// GET /disponibilidad?fecha=YYYY-MM-DD — slots disponibles para un día (público)
router.get('/', async (req, res, next) => {
  try {
    const { fecha } = req.query
    if (!fecha) return res.status(400).json({ error: 'fecha requerida' })

    // Validar que no sea pasado ni menos de 12hs desde ahora
    const ahora = new Date()
    const fechaSlot = new Date(`${fecha}T00:00:00`)
    if (fechaSlot < ahora) {
      return res.json([])
    }

    const snapshot = await db.collection('disponibilidad')
      .where('fecha', '==', fecha)
      .where('disponible', '==', true)
      .orderBy('hora_inicio')
      .get()

    const limite12hs = new Date(ahora.getTime() + 12 * 60 * 60 * 1000)

    const slots = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(slot => {
        const slotDate = new Date(`${slot.fecha}T${slot.hora_inicio}:00`)
        return slotDate > limite12hs
      })

    res.json(slots)
  } catch (err) {
    next(err)
  }
})

// GET /disponibilidad/admin?fecha=YYYY-MM-DD — todos los slots (admin)
router.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const { fecha } = req.query
    if (!fecha) return res.status(400).json({ error: 'fecha requerida' })

    const snapshot = await db.collection('disponibilidad')
      .where('fecha', '==', fecha)
      .orderBy('hora_inicio')
      .get()

    const slots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
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

    // Verificar que no exista ya
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
    })

    res.status(201).json({ id: ref.id, mensaje: 'Slot habilitado' })
  } catch (err) {
    next(err)
  }
})

// POST /disponibilidad/rango — genera slots para días de la semana en un rango de horas
router.post('/rango', requireAdmin, async (req, res, next) => {
  try {
    const { dias_semana, hora_desde, hora_hasta, fecha_desde, fecha_hasta, duracion_min } = req.body
    // dias_semana: array de números 0=dom, 1=lun... 6=sab
    if (!dias_semana || !hora_desde || !hora_hasta || !fecha_desde || !fecha_hasta) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    // Guardar el rango
    const rangoRef = await db.collection('rangos_horarios').add({
      dias_semana,
      hora_desde,
      hora_hasta,
      fecha_desde,
      fecha_hasta,
      duracion_min: duracion_min || 30,
      activo: true,
    })

    // Generar los slots individuales
    const slots = generarSlots(hora_desde, hora_hasta, duracion_min || 30)
    const batch = db.batch()
    let creados = 0

    const inicio = new Date(fecha_desde + 'T00:00:00')
    const fin = new Date(fecha_hasta + 'T00:00:00')

    for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
      if (!dias_semana.includes(d.getDay())) continue

      const fechaStr = d.toISOString().split('T')[0]

      for (let i = 0; i < slots.length; i++) {
        const horaInicio = slots[i]
        const [h, m] = horaInicio.split(':').map(Number)
        const finMin = h * 60 + m + (duracion_min || 30)
        const horaFin = `${String(Math.floor(finMin / 60)).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`

        const ref = db.collection('disponibilidad').doc()
        batch.set(ref, {
          fecha: fechaStr,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          disponible: true,
          rango_id: rangoRef.id,
        })
        creados++
      }
    }

    await batch.commit()
    res.status(201).json({ rango_id: rangoRef.id, slots_creados: creados })
  } catch (err) {
    next(err)
  }
})

// PATCH /disponibilidad/:id — habilitar/deshabilitar un slot
// Si se habilita un slot ocupado, cancela el turno y notifica al cliente
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { disponible } = req.body
    const slotId = req.params.id

    if (disponible === true || disponible === 'true') {
      const turnoSnap = await db.collection('turnos')
        .where('disponibilidad_id', '==', slotId)
        .where('estado', '==', 'confirmed')
        .limit(1)
        .get()

      if (!turnoSnap.empty) {
        const turnoDoc = turnoSnap.docs[0]
        const turno = turnoDoc.data()

        await db.runTransaction(async (t) => {
          t.update(turnoDoc.ref, { estado: 'cancelled' })
          t.update(db.collection('disponibilidad').doc(slotId), { disponible: true })
        })

        const { enviarCancelacion } = await import('../services/emailService.js')
        enviarCancelacion({
          email: turno.email,
          nombre: turno.nombre_cliente,
          servicio: turno.servicio_nombre,
          fecha: turno.fecha,
          hora: turno.hora,
        }).catch(err => console.error('[Email cancelación por admin] Error:', err.message))

        return res.json({ mensaje: 'Slot liberado y turno cancelado. El cliente fue notificado.' })
      }
    }

    await db.collection('disponibilidad').doc(slotId).update({
      disponible: Boolean(disponible),
    })
    res.json({ mensaje: 'Slot actualizado' })
  } catch (err) {
    next(err)
  }
})

export default router
