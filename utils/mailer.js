const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Milanorte <onboarding@resend.dev>';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) return;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
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
        ${order.shipping_cost > 0 ? `<p>Envío (${order.shipping_distance_km} km): <strong>${formatPrice(order.shipping_cost)}</strong></p>` : '<p>Envío: <strong>Gratis</strong></p>'}
        <p style="font-size:1.2em">Total: <strong>${formatPrice(order.total_amount)}</strong></p>
        <hr style="border:none;border-top:1px solid #eee;margin:15px 0">
        <p><strong>Cliente:</strong> ${order.customer_name}</p>
        <p><strong>Teléfono:</strong> ${order.customer_phone}</p>
        ${order.customer_email ? `<p><strong>Email:</strong> ${order.customer_email}</p>` : ''}
        <p><strong>Dirección:</strong> ${order.customer_address}${order.address_extra ? ' (' + order.address_extra + ')' : ''}</p>
        <p><strong>Entrega:</strong> ${deliveryDay}${order.delivery_slot ? ' - ' + (order.delivery_slot === 'manana' ? 'Mañana (9 a 12hs)' : order.delivery_slot === 'tarde' ? 'Tarde (13 a 17hs)' : 'Noche (18 a 20hs)') : ''}</p>
      </div>
    </div>
  `;
}

async function sendOrderNotification(order, items) {
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) return;
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
  if (!RESEND_API_KEY || !order.customer_email) return;
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
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    return { ok: false, error: 'Faltan variables de entorno: RESEND_API_KEY o NOTIFY_EMAIL' };
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
