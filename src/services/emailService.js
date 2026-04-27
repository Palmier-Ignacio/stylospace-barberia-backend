import * as Brevo from '@getbrevo/brevo'
import { crearLinkCancelacion, getCanalesContacto } from './cancelacionService.js'

const apiInstance = new Brevo.TransactionalEmailsApi()
apiInstance.authentications['apiKey'].apiKey = process.env.BREVO_API_KEY

const FROM = {
  email: process.env.BREVO_FROM_EMAIL,
  name: process.env.BREVO_FROM_NAME || 'Barbería',
}

function formatFecha(fechaStr) {
  const [y, m, d] = fechaStr.split('-')
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${d} de ${meses[parseInt(m) - 1]} de ${y}`
}


function botonHtml({ href, label, background = '#0a0a0a', color = '#fafafa', border = '#0a0a0a' }) {
  if (!href) return ''
  return `
    <a href="${href}" style="display: inline-block; padding: 12px 18px; margin-right: 12px; margin-bottom: 12px; border-radius: 8px; text-decoration: none; font-weight: 600; background: ${background}; color: ${color}; border: 1px solid ${border};">
      ${label}
    </a>
  `
}

function bloqueAccionCancelacion(turnoId) {
  const cancelUrl = crearLinkCancelacion(turnoId)
  if (!cancelUrl) return ''

  return `
    <div style="margin-top: 24px;">
      <p style="color: #555; font-size: 14px; margin-bottom: 12px;">
        Si querés cancelar tu turno, podés hacerlo desde el siguiente botón. Recordá que solo está habilitado hasta 12 horas antes del horario reservado.
      </p>
      ${botonHtml({ href: cancelUrl, label: 'Cancelar turno' })}
    </div>
  `
}

function bloqueContacto() {
  const { whatsapp, instagram } = getCanalesContacto()
  if (!whatsapp && !instagram) return ''

  return `
    <div style="margin-top: 16px;">
      ${botonHtml({ href: whatsapp, label: 'WhatsApp', background: '#25D366', color: '#ffffff', border: '#25D366' })}
      ${botonHtml({ href: instagram, label: 'Instagram', background: '#ffffff', color: '#0a0a0a', border: '#d0d0d0' })}
    </div>
  `
}

function templateBase(contenido) {
  return `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fafafa;">
      <h1 style="color: #1a1a1a; margin-bottom: 4px;">Stylo Space Barbería</h1>
      <p style="color: #aaa; font-size: 12px; margin-top: 32px;">
        Este es un mensaje automático, no respondas a este email.
      </p>
      ${contenido}
      <p style="color: #aaa; font-size: 12px; margin-top: 32px;">
        Este es un mensaje automático, no respondas a este email.
      </p>
    </div>
  `
}

export async function enviarConfirmacion({ turnoId, email, nombre, servicio, fecha, hora, precio }) {
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

      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">UBICACIÓN</p>
      <p style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #1a1a1a;"> 
                Haydn 3175, William C. Morris <br />
                <a target="_blank" href="https://maps.app.goo.gl/hh1Lj26j8GtJi1jd7">
                  ver en google maps →
                </a>
      </p>

      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">PRECIO</p>
      <p style="margin: 0; font-size: 18px; font-weight: 600; color: #1a1a1a;">$${precio}</p>
      
    </div>

    <p style="color: #555; font-size: 14px;">Si tenés alguna consulta, contactanos por nuestros canales oficiales.</p>

    ${bloqueContacto()}

    <p style="color: #555; font-size: 14px;">
      Si necesitás cancelar o reprogramar, hacelo con al menos 12 horas de anticipación.
    </p>

    ${bloqueAccionCancelacion(turnoId)}
  `)

  await apiInstance.sendTransacEmail(mail)
}

export async function enviarRecordatorio({ turnoId, email, nombre, servicio, fecha, hora }) {
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

      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">UBICACIÓN</p>
      <p style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #1a1a1a;"> 
                Haydn 3175, William C. Morris <br />
                <a target="_blank" href="https://maps.app.goo.gl/hh1Lj26j8GtJi1jd7">
                  ver en google maps →
                </a>
      </p>

    </div>

    <p style="color: #555; font-size: 14px;">Si tenés alguna consulta, contactanos por nuestros canales oficiales.</p>

    ${bloqueContacto()}
    
    <p style="color: #555; font-size: 14px;">Si necesitás cancelar, todavía podés intentarlo desde el botón de abajo, siempre que falten 12 horas o más para tu turno.</p>
    
    ${bloqueAccionCancelacion(turnoId)}
  `)

  await apiInstance.sendTransacEmail(mail)
}


export async function enviarModificacion({ email, nombre, cambios = [], turnoAnterior, turnoNuevo, turnoId }) {
  const fechaAnterior = formatFecha(turnoAnterior.fecha)
  const fechaNueva = formatFecha(turnoNuevo.fecha)
  const huboReprogramacion = cambios.includes('fecha_hora')
  const resumenCambios = cambios.length
    ? cambios.map(cambio => `<li style="margin-bottom: 6px;">${labelCambio(cambio)}</li>`).join('')
    : '<li style="margin-bottom: 6px;">Información del turno actualizada</li>'

  const mail = new Brevo.SendSmtpEmail()
  mail.sender = FROM
  mail.to = [{ email, name: nombre }]
  mail.subject = huboReprogramacion ? '✂️ Tu turno fue reprogramado' : '✂️ Tu turno fue modificado'
  mail.htmlContent = templateBase(`
    <h2 style="color: #1a1a1a; margin-bottom: 4px;">${huboReprogramacion ? 'Tu turno fue reprogramado' : 'Tu turno fue modificado'}</h2>
    <p style="color: #555; margin-top: 0;">Hola <strong>${nombre}</strong>, te avisamos que el equipo de Stylo Space actualizó la información de tu turno.</p>

    <div style="background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 10px; color: #888; font-size: 13px;">CAMBIOS REALIZADOS</p>
      <ul style="margin: 0; padding-left: 18px; color: #333;">${resumenCambios}</ul>
    </div>

    <div style="background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 24px; margin: 24px 0;">
      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">ANTES</p>
      <p style="margin: 0 0 16px; color: #555;">${turnoAnterior.servicio} — ${fechaAnterior} a las ${turnoAnterior.hora} — $${turnoAnterior.precio}</p>

      <p style="margin: 0 0 8px; color: #888; font-size: 13px;">AHORA</p>
      <p style="margin: 0; font-size: 18px; font-weight: 600; color: #1a1a1a;">${turnoNuevo.servicio} — ${fechaNueva} a las ${turnoNuevo.hora} — $${turnoNuevo.precio}</p>
    </div>

    <p style="color: #555; font-size: 14px;">
      Si necesitás hacer otra modificación o tenés alguna consulta, contactanos por nuestros canales oficiales.
    </p>

    ${bloqueContacto()}
    ${bloqueAccionCancelacion(turnoId)}
  `)

  await apiInstance.sendTransacEmail(mail)
}

function labelCambio(cambio) {
  const labels = {
    nombre: 'Nombre del cliente',
    email: 'Email de contacto',
    contacto: 'Teléfono o canal de contacto',
    servicio: 'Servicio reservado',
    fecha_hora: 'Fecha u horario del turno',
    precio: 'Precio del servicio',
  }
  return labels[cambio] || 'Información del turno'
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

    <p style="color: #555; font-size: 14px;">Si tenés alguna consulta, contactanos por nuestros canales oficiales.</p>

    ${bloqueContacto()}
  `)

  await apiInstance.sendTransacEmail(mail)
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
