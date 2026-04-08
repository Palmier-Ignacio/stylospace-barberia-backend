import { auth } from '../config/firebase.js'
import { Receiver } from '@upstash/qstash'

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


const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
})

export async function requireQStash(req, res, next) {
  try {
    const signature = req.header('Upstash-Signature')

    if (!signature) {
      return res.status(401).json({ error: 'Missing Upstash-Signature' })
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol
    const url = `${protocol}://${req.get('host')}${req.originalUrl}`

    await receiver.verify({
      signature,
      body: req.rawBody ?? "",
      url,
    })

    next()
  } catch (err) {
    console.error('QStash verify error:', err)
    return res.status(401).json({ error: 'No autorizado' })
  }
}
