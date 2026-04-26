const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'milanorte@newsletter.milanorte.com';
const FROM_NAME = process.env.FROM_NAME || 'Milanorte';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;

function isConfigured() {
  return !!(BREVO_API_KEY);
}

async function sendEmail({ to, subject, html }) {
  if (!isConfigured()) return;
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${body}`);
  }
  return res.json();
}

function formatPrice(amount) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount);
}

function buildItemsHTML(items) {
  return items.map(item =>
    `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${item.product}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity} kg</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatPrice(item.unit_price * item.quantity)}</td>
    </tr>`
  ).join('');
}

function buildOrderHTML(order, items) {
  const deliveryDay = order.delivery_day === 'miercoles' ? 'Miércoles' : 'Sábado';
  const hasDiscount = order.discount_amount && order.discount_amount > 0;
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#1a1a2e;padding:20px;text-align:center">
        <h1 style="color:#c9a84c;margin:0">Milanorte</h1>
      </div>
      <div style="padding:20px">
        <h2 style="color:#333">Pedido #${order.id}</h2>
        <table style="width:100%;border-collapse:collapse;margin:15px 0">
          <thead>
            <tr style="background:#f5f5f5">
              <th style="padding:8px;text-align:left">Producto</th>
              <th style="padding:8px;text-align:center">Cantidad</th>
              <th style="padding:8px;text-align:right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${buildItemsHTML(items)}
          </tbody>
        </table>
        ${hasDiscount ? `
          <p style="text-align:right;color:#666;margin:0">Subtotal: ${formatPrice(order.subtotal_amount)}</p>
          <p style="text-align:right;color:#2E7D32;margin:0">Descuento (${order.discount_code} -${order.discount_percent}%): -${formatPrice(order.discount_amount)}</p>
        ` : ''}
        <p style="font-size:1.2em;text-align:right">Total: <strong>${formatPrice(order.total_amount)}</strong></p>
        <hr style="border:none;border-top:1px solid #eee;margin:15px 0">
        <p><strong>Cliente:</strong> ${order.customer_name}</p>
        <p><strong>Teléfono:</strong> ${order.customer_phone}</p>
        ${order.customer_email ? `<p><strong>Email:</strong> ${order.customer_email}</p>` : ''}
        <p><strong>Dirección:</strong> ${order.customer_address}${order.address_extra ? ' (' + order.address_extra + ')' : ''}</p>
        <p><strong>Zona de envío:</strong> Zona Norte</p>
        <p><strong>Entrega:</strong> ${deliveryDay}${order.delivery_slot ? ' - ' + (order.delivery_slot === 'manana' ? 'Mañana (9 a 12hs)' : order.delivery_slot === 'tarde' ? 'Tarde (13 a 17hs)' : 'Noche (18 a 20hs)') : ''}</p>
      </div>
    </div>
  `;
}

async function sendOrderNotification(order, items) {
  if (!isConfigured() || !NOTIFY_EMAIL) return;
  try {
    await sendEmail({
      to: NOTIFY_EMAIL,
      subject: `Nuevo pedido #${order.id} - ${order.customer_name}`,
      html: `<h2 style="color:#c9a84c">¡Nuevo pedido!</h2>${buildOrderHTML(order, items)}`
    });
    console.log(`✅ Email de notificación enviado a ${NOTIFY_EMAIL} (pedido #${order.id})`);
  } catch (err) {
    console.error('Error enviando email al dueño:', err.message);
  }
}

async function sendOrderConfirmation(order, items) {
  if (!isConfigured() || !order.customer_email) return;
  try {
    await sendEmail({
      to: order.customer_email,
      subject: `Confirmación de pedido #${order.id} - Milanorte`,
      html: `
        <h2 style="color:#333">¡Gracias por tu pedido, ${order.customer_name}!</h2>
        <p>Recibimos tu pedido y lo estamos procesando.</p>
        ${buildOrderHTML(order, items)}
        <p style="color:#666;font-size:0.9em;margin-top:20px">Si tenés alguna consulta, respondé a este email.</p>
      `
    });
    console.log(`✅ Email de confirmación enviado a ${order.customer_email} (pedido #${order.id})`);
  } catch (err) {
    console.error('Error enviando confirmación al cliente:', err.message);
  }
}

async function sendTestEmail() {
  if (!isConfigured() || !NOTIFY_EMAIL) {
    return { ok: false, error: 'Faltan variables de entorno: BREVO_API_KEY o NOTIFY_EMAIL' };
  }
  try {
    await sendEmail({
      to: NOTIFY_EMAIL,
      subject: 'Test de email - Milanorte',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1a1a2e;padding:20px;text-align:center">
            <h1 style="color:#c9a84c;margin:0">Milanorte</h1>
          </div>
          <div style="padding:20px">
            <h2 style="color:#333">Test de email exitoso</h2>
            <p>Si estás leyendo esto, la configuración de email funciona correctamente.</p>
            <p style="color:#666;font-size:0.9em">Enviado a: ${NOTIFY_EMAIL}</p>
          </div>
        </div>
      `
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { sendOrderNotification, sendOrderConfirmation, sendTestEmail };
