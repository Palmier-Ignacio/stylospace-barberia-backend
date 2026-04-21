import { db } from '../config/firebase.js'
import { enviarRecordatorio } from './emailService.js'

export async function procesarRecordatorios() {
  // Calcular fecha de mañana en formato YYYY-MM-DD
  const manana = new Date()
  manana.setDate(manana.getDate() + 1)
  const fechaStr = manana.toISOString().split('T')[0]

  console.log(`[Recordatorios] Buscando turnos para ${fechaStr}`)

  const snapshot = await db.collection('turnos')
    .where('fecha', '==', fechaStr)
    .where('estado', '==', 'confirmed')
    .where('recordatorio_enviado', '==', false)
    .get()

  if (snapshot.empty) {
    console.log('[Recordatorios] No hay turnos para mañana.')
    return { enviados: 0 }
  }

  const batch = db.batch()
  let enviados = 0
  const errores = []

  for (const doc of snapshot.docs) {
    const turno = doc.data()
    try {
      await enviarRecordatorio({
        turnoId: doc.id,
        email: turno.email,
        nombre: turno.nombre_cliente,
        servicio: turno.servicio_nombre,
        fecha: turno.fecha,
        hora: turno.hora,
      })
      batch.update(doc.ref, { recordatorio_enviado: true })
      enviados++
    } catch (err) {
      console.error(`[Recordatorios] Error enviando a ${turno.email}:`, err.message)
      errores.push(turno.email)
    }
  }

  await batch.commit()
  console.log(`[Recordatorios] Enviados: ${enviados}, errores: ${errores.length}`)
  return { enviados, errores }
}
