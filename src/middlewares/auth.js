import { auth } from '../config/firebase.js'

export async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' })
  }

  const token = authHeader.split('Bearer ')[1]

  try {
    const decoded = await auth.verifyIdToken(token)
    req.user = decoded
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

// Middleware para verificar que el request venga de QStash (cron jobs)
export function requireQStash(req, res, next) {
  const signingKey = req.headers['upstash-signature']
  if (!signingKey) {
    return res.status(401).json({ error: 'No autorizado' })
  }
  // Verificación básica — para producción podés agregar la verificación
  // de firma completa con @upstash/qstash Receiver
  next()
}
