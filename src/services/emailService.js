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

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export async function enviarConfirmacionMembresia({ email, nombre, servicio, dia_semana, hora_inicio, precio }) {
  const mail = new Brevo.SendSmtpEmail()
  mail.sender = FROM
  mail.to = [{ email, name: nombre }]
  mail.subject = '✂️ ¡Membresía activada!'
  mail.htmlContent = templateBase(`
    <h2 style="color: #1a1a1a; margin-bottom: 4px;">¡Membresía activada!</h2>
    <p style="color: #555; margin-top: 0;">Hola <strong>${nombre}</strong>, tu membresía fue activada correctamente.</p>

    <div style="background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">SERVICIO</p>
      <p style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #1a1a1a;">${servicio}</p>

      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">DÍA Y HORA FIJOS</p>
      <p style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #1a1a1a;">Todos los ${DIAS[dia_semana]} a las ${hora_inicio}</p>

      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">PRECIO</p>
      <p style="margin: 0; font-size: 18px; font-weight: 600; color: #1a1a1a;">$${precio} por turno</p>
    </div>

    <p style="color: #555; font-size: 14px;">
      Tus turnos quedan reservados automáticamente cada semana. Si necesitás cancelar un turno puntual, contactanos con anticipación.
    </p>
  `)
  await apiInstance.sendTransacEmail(mail)
}

export async function enviarBajaMembresia({ email, nombre, servicio }) {
  const mail = new Brevo.SendSmtpEmail()
  mail.sender = FROM
  mail.to = [{ email, name: nombre }]
  mail.subject = '✂️ Tu membresía fue dada de baja'
  mail.htmlContent = templateBase(`
    <h2 style="color: #1a1a1a; margin-bottom: 4px;">Membresía dada de baja</h2>
    <p style="color: #555; margin-top: 0;">Hola <strong>${nombre}</strong>, te informamos que tu membresía de <strong>${servicio}</strong> fue dada de baja.</p>
    <p style="color: #555; font-size: 14px;">
      Todos tus turnos futuros fueron cancelados y los horarios quedaron liberados.
      Si querés retomar o reservar un turno puntual podés hacerlo desde nuestra página.
    </p>
  `)
  await apiInstance.sendTransacEmail(mail)
}

export async function enviarSolicitudClienteMembresia({ email, nombre, dia, hora }) {
  const mail = new Brevo.SendSmtpEmail()
  mail.sender = FROM
  mail.to = [{ email, name: nombre }]
  mail.subject = '✂️ Recibimos tu solicitud de membresía'
  mail.htmlContent = templateBase(`
    <h2 style="color: #1a1a1a; margin-bottom: 4px;">Solicitud recibida</h2>
    <p style="color: #555; margin-top: 0;">Hola <strong>${nombre}</strong>, recibimos tu solicitud de membresía.</p>

    <div style="background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">DÍA Y HORA SOLICITADOS</p>
      <p style="margin: 0; font-size: 18px; font-weight: 600; color: #1a1a1a;">Todos los ${dia} a las ${hora}</p>
    </div>

    <p style="color: #555; font-size: 14px;">
      Nos vamos a contactar a la brevedad para confirmar la disponibilidad.
    </p>
  `)
  await apiInstance.sendTransacEmail(mail)
}

export async function enviarSolicitudAdminMembresia({ adminEmail, nombre, email, contacto, dia, hora }) {
  const mail = new Brevo.SendSmtpEmail()
  mail.sender = FROM
  mail.to = [{ email: adminEmail }]
  mail.subject = '🔔 Nueva solicitud de membresía'
  mail.htmlContent = templateBase(`
    <h2 style="color: #1a1a1a; margin-bottom: 4px;">Nueva solicitud de membresía</h2>

    <div style="background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">NOMBRE</p>
      <p style="margin: 0 0 20px; font-size: 16px; font-weight: 600; color: #1a1a1a;">${nombre}</p>

      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">EMAIL</p>
      <p style="margin: 0 0 20px; font-size: 16px; font-weight: 600; color: #1a1a1a;">${email}</p>

      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">CONTACTO (WHATSAPP / INSTAGRAM)</p>
      <p style="margin: 0 0 20px; font-size: 16px; font-weight: 600; color: #1a1a1a;">${contacto}</p>

      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">DÍA Y HORA SOLICITADOS</p>
      <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1a1a1a;">Todos los ${dia} a las ${hora}</p>
    </div>

    <p style="color: #555; font-size: 14px;">
      Ingresá al panel de admin para aprobar o rechazar la solicitud.
    </p>
  `)
  await apiInstance.sendTransacEmail(mail)
}


export async function enviarSolicitudAprobada({ email, nombre, dia, hora }) {
  const mail = new Brevo.SendSmtpEmail()
  mail.sender = FROM
  mail.to = [{ email, name: nombre }]
  mail.subject = '✅ Tu membresía fue aprobada'
  mail.htmlContent = templateBase(`
    <h2 style="color: #1a1a1a;">¡Solicitud aprobada!</h2>
    <p>Hola <strong>${nombre}</strong>, tu membresía fue aprobada 🎉</p>

    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:24px;margin:24px 0;">
      <p style="color:#888;font-size:13px;">DÍA Y HORA</p>
      <p style="font-size:18px;font-weight:600;">Todos los ${dia} a las ${hora}</p>
    </div>

    <p>En breve se va a activar tu membresía. ¡Gracias por confiar en nosotros!</p>
  `)

  await apiInstance.sendTransacEmail(mail)
}


export async function enviarSolicitudRechazada({ email, nombre, dia, hora }) {
  const mail = new Brevo.SendSmtpEmail()
  mail.sender = FROM
  mail.to = [{ email, name: nombre }]
  mail.subject = '❌ Tu solicitud de membresía'
  mail.htmlContent = templateBase(`
    <h2 style="color: #1a1a1a;">Solicitud no disponible</h2>
    <p>Hola <strong>${nombre}</strong>, lamentablemente no pudimos aprobar tu solicitud.</p>

    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:24px;margin:24px 0;">
      <p style="color:#888;font-size:13px;">DÍA Y HORA SOLICITADOS</p>
      <p style="font-size:18px;font-weight:600;">Todos los ${dia} a las ${hora}</p>
    </div>

    <p>Podés intentar con otro horario o contactarnos directamente.</p>
  `)

  await apiInstance.sendTransacEmail(mail)
}