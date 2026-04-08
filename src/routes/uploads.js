import { Router } from 'express'
import { Readable } from 'stream'
import cloudinary from '../config/cloudinary.js'
import upload from '../middlewares/upload.js'
import { requireAdmin } from '../middlewares/auth.js'

const router = Router()

router.post('/servicio', requireAdmin, upload.single('imagen'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen' })
    }

    const streamUpload = () =>
      new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'stylospace/servicios',
            resource_type: 'image',
          },
          (error, result) => {
            if (error) return reject(error)
            resolve(result)
          }
        )

        Readable.from(req.file.buffer).pipe(stream)
      })

    const result = await streamUpload()

    res.status(201).json({
      mensaje: 'Imagen subida correctamente',
      imagen: result.secure_url,
      public_id: result.public_id,
    })
  } catch (err) {
    next(err)
  }
})

export default router