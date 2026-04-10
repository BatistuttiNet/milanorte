const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

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
        <p><strong>Dirección:</strong> ${order.customer_address}</p>
        <p><strong>Entrega:</strong> ${deliveryDay}${order.delivery_slot ? ' - ' + order.delivery_slot : ''}</p>
      </div>
    </div>
  `;
}

async function sendOrderNotification(order, items) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !process.env.NOTIFY_EMAIL) return;
  try {
    await transporter.sendMail({
      from: `"Milanorte" <${process.env.GMAIL_USER}>`,
      to: process.env.NOTIFY_EMAIL,
      subject: `Nuevo pedido #${order.id} - ${order.customer_name}`,
      html: `<h2 style="color:#c9a84c">¡Nuevo pedido!</h2>${buildOrderHTML(order, items)}`
    });
  } catch (err) {
    console.error('Error enviando email al dueño:', err.message);
  }
}

async function sendOrderConfirmation(order, items) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !order.customer_email) return;
  try {
    await transporter.sendMail({
      from: `"Milanorte" <${process.env.GMAIL_USER}>`,
      to: order.customer_email,
      subject: `Confirmación de pedido #${order.id} - Milanorte`,
      html: `
        <h2 style="color:#333">¡Gracias por tu pedido, ${order.customer_name}!</h2>
        <p>Recibimos tu pedido y lo estamos procesando.</p>
        ${buildOrderHTML(order, items)}
        <p style="color:#666;font-size:0.9em;margin-top:20px">Si tenés alguna consulta, respondé a este email.</p>
      `
    });
  } catch (err) {
    console.error('Error enviando confirmación al cliente:', err.message);
  }
}

module.exports = { sendOrderNotification, sendOrderConfirmation };
