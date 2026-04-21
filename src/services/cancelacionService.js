import crypto from 'crypto'

const MIN_HORAS_CANCELACION = 12

function getSecret() {
  return process.env.TURNO_CANCEL_SECRET || process.env.BREVO_API_KEY || 'stylo-space-fallback-secret'
}

export function buildTurnoDate(fecha, hora) {
  return new Date(`${fecha}T${hora}:00`)
}

export function puedeCancelarTurno(turno) {
  if (!turno) {
    return { ok: false, code: 'not_found', message: 'Turno no encontrado' }
  }

  if (turno.estado === 'cancelled') {
    return { ok: false, code: 'already_cancelled', message: 'Este turno ya fue cancelado' }
  }

  const ahora = new Date()
  const fechaTurno = buildTurnoDate(turno.fecha, turno.hora)
  const diffMs = fechaTurno - ahora
  const minMs = MIN_HORAS_CANCELACION * 60 * 60 * 1000

  if (diffMs < minMs) {
    return {
      ok: false,
      code: 'deadline_passed',
      message: 'Ya pasó el tiempo necesario para cancelar online. Contactate con el equipo de Stylo Space.',
    }
  }

  return { ok: true, code: 'ok', message: 'Podés cancelar tu turno online.' }
}

export function generarTokenCancelacion(turnoId) {
  return crypto
    .createHmac('sha256', getSecret())
    .update(turnoId)
    .digest('base64url')
}

export function validarTokenCancelacion(turnoId, token) {
  if (!turnoId || !token) return false

  const expected = generarTokenCancelacion(turnoId)
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    return false
  }
}

export function crearLinkCancelacion(turnoId) {
  const frontendUrl = process.env.FRONTEND_URL
  if (!frontendUrl) return null

  const token = generarTokenCancelacion(turnoId)
  return `${frontendUrl.replace(/\/$/, '')}/cancelar-turno?id=${encodeURIComponent(turnoId)}&token=${encodeURIComponent(token)}`
}

export function getCanalesContacto() {
  return {
    whatsapp: process.env.PUBLIC_WHATSAPP_URL || process.env.WHATSAPP_URL || '',
    instagram: process.env.PUBLIC_INSTAGRAM_URL || process.env.INSTAGRAM_URL || '',
  }
}

export { MIN_HORAS_CANCELACION }
