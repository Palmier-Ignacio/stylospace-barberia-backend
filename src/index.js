import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import serviciosRouter from './routes/servicios.js'
import disponibilidadRouter from './routes/disponibilidad.js'
import turnosRouter from './routes/turnos.js'
import membresiasRouter from './routes/membresias.js'
import solicitudesMembresiaRouter from './routes/solicitudesMembresia.js'
import { errorHandler } from './middlewares/errorHandler.js'
import { procesarRecordatorios } from './services/recordatorioService.js'
import { requireQStash } from './middlewares/auth.js'

const app = express()
const PORT = process.env.PORT || 3000

// CORS
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:5173',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(express.json())

// Health check — Upstash lo pinga cada 5 minutos para que Render no duerma el servidor
app.get('/ping', (req, res) => res.json({ ok: true, ts: Date.now() }))

// Rutas públicas + admin
app.use('/servicios', serviciosRouter)
app.use('/disponibilidad', disponibilidadRouter)
app.use('/turnos', turnosRouter)
app.use('/membresias', membresiasRouter)
app.use('/solicitudes-membresia', solicitudesMembresiaRouter)

// Cron de recordatorios — llamado por Upstash QStash cada día a las 08:00
app.post('/cron/recordatorios', requireQStash, async (req, res, next) => {
  try {
    const resultado = await procesarRecordatorios()
    res.json(resultado)
  } catch (err) {
    next(err)
  }
})

app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`[Servidor] corriendo en puerto ${PORT}`)
})
