import * as Brevo from '@getbrevo/brevo'

const apiInstance = new Brevo.TransactionalEmailsApi()
apiInstance.authentications['apiKey'].apiKey = process.env.BREVO_API_KEY

const FROM = {
  email: process.env.BREVO_FROM_EMAIL,
  name: process.env.BREVO_FROM_NAME || 'Barbería',
}

function formatFecha(fechaStr) {
  const [y, m, d] = fechaStr.split('-')
  const meses = ['enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre']
  return `${d} de ${meses[parseInt(m) - 1]} de ${y}`
}

function templateBase(contenido) {
  return `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fafafa;">
      ${contenido}
      <p style="color: #aaa; font-size: 12px; margin-top: 32px;">
        Este es un mensaje automático, no respondas a este email.
      </p>
    </div>
  `
}

export async function enviarConfirmacion({ email, nombre, servicio, fecha, hora, precio }) {
  const fechaLinda = formatFecha(fecha)

  const mail = new Brevo.SendSmtpEmail()
  mail.sender = FROM
  mail.to = [{ email, name: nombre }]
  mail.subject = '✂️ Turno confirmado'
  mail.htmlContent = templateBase(`
    <h2 style="color: #1a1a1a; margin-bottom: 4px;">¡Turno confirmado!</h2>
    <p style="color: #555; margin-top: 0;">Hola <strong>${nombre}</strong>, te esperamos.</p>

    <div style="background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">SERVICIO</p>
      <p style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #1a1a1a;">${servicio}</p>

      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">FECHA Y HORA</p>
      <p style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #1a1a1a;">${fechaLinda} a las ${hora}</p>

      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">PRECIO</p>
      <p style="margin: 0; font-size: 18px; font-weight: 600; color: #1a1a1a;">$${precio}</p>
    </div>

    <p style="color: #555; font-size: 14px;">
      Si necesitás cancelar o reprogramar, contactanos con al menos 12 horas de anticipación.
    </p>
  `)

  await apiInstance.sendTransacEmail(mail)
}

export async function enviarRecordatorio({ email, nombre, servicio, fecha, hora }) {
  const fechaLinda = formatFecha(fecha)

  const mail = new Brevo.SendSmtpEmail()
  mail.sender = FROM
  mail.to = [{ email, name: nombre }]
  mail.subject = '✂️ Recordatorio: tu turno es mañana'
  mail.htmlContent = templateBase(`
    <h2 style="color: #1a1a1a; margin-bottom: 4px;">Tu turno es mañana</h2>
    <p style="color: #555; margin-top: 0;">Hola <strong>${nombre}</strong>, te recordamos que tenés turno.</p>

    <div style="background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">SERVICIO</p>
      <p style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #1a1a1a;">${servicio}</p>

      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">FECHA Y HORA</p>
      <p style="margin: 0; font-size: 18px; font-weight: 600; color: #1a1a1a;">${fechaLinda} a las ${hora}</p>
    </div>

    <p style="color: #555; font-size: 14px;">¡Nos vemos mañana!</p>
  `)

  await apiInstance.sendTransacEmail(mail)
}

export async function enviarCancelacion({ email, nombre, servicio, fecha, hora }) {
  const fechaLinda = formatFecha(fecha)

  const mail = new Brevo.SendSmtpEmail()
  mail.sender = FROM
  mail.to = [{ email, name: nombre }]
  mail.subject = '✂️ Tu turno fue cancelado'
  mail.htmlContent = templateBase(`
    <h2 style="color: #1a1a1a; margin-bottom: 4px;">Turno cancelado</h2>
    <p style="color: #555; margin-top: 0;">Hola <strong>${nombre}</strong>, te informamos que tu turno fue cancelado.</p>

    <div style="background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">SERVICIO</p>
      <p style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #1a1a1a;">${servicio}</p>

      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">FECHA Y HORA</p>
      <p style="margin: 0; font-size: 18px; font-weight: 600; color: #1a1a1a;">${fechaLinda} a las ${hora}</p>
    </div>

    <p style="color: #555; font-size: 14px;">
      Si querés reservar un nuevo turno podés hacerlo desde nuestra página web.
    </p>
  `)

  await apiInstance.sendTransacEmail(mail)
}
