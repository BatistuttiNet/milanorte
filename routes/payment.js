const express = require('express');
const router = express.Router();
const { MercadoPagoConfig, Preference } = require('mercadopago');
const { getOrder, updateOrderPayment, updateOrderPaymentFromRedirect } = require('../db/init');
const { sendOrderConfirmation } = require('../utils/mailer');

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

router.get('/create/:orderId', async (req, res) => {
  try {
    const order = getOrder.get(req.params.orderId);
    if (!order) return res.status(404).send('Pedido no encontrado');

    const items = JSON.parse(order.items_json);
    const baseUrl = process.env.BASE_URL;

    const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');

    const preferenceBody = {
      items: [
        ...items.map(item => ({
          title: item.product,
          quantity: item.quantity,
          unit_price: item.unit_price,
          currency_id: 'ARS'
        })),
        ...(order.shipping_cost > 0 ? [{
          title: 'Envío',
          quantity: 1,
          unit_price: order.shipping_cost,
          currency_id: 'ARS'
        }] : [])
      ],
      external_reference: String(order.id)
    };

    // back_urls y auto_return solo funcionan con URLs públicas (no localhost)
    if (!isLocalhost) {
      preferenceBody.back_urls = {
        success: `${baseUrl}/payment/success`,
        failure: `${baseUrl}/payment/failure`,
        pending: `${baseUrl}/payment/pending`
      };
      preferenceBody.auto_return = 'approved';
      preferenceBody.notification_url = `${baseUrl}/webhook/mercadopago`;
    }

    const preference = new Preference(client);
    const result = await preference.create({ body: preferenceBody });

    updateOrderPayment.run({
      id: order.id,
      mp_preference_id: result.id
    });

    res.redirect(result.init_point);
  } catch (err) {
    console.error('Error creando preferencia MP:', err);
    res.status(500).send('Error al procesar el pago. Intentá de nuevo.');
  }
});

router.get('/success', (req, res) => {
  const orderId = req.query.external_reference;
  const paymentId = req.query.payment_id || req.query.collection_id;
  const mpStatus = req.query.status || req.query.collection_status;

  const order = orderId ? getOrder.get(orderId) : null;

  // Capture payment_id from redirect as fallback (useful when webhook doesn't arrive)
  if (order && paymentId) {
    const wasPending = order.status !== 'paid';
    const newStatus = mpStatus === 'approved' ? 'paid' : order.status;
    updateOrderPaymentFromRedirect.run({
      id: order.id,
      mp_payment_id: String(paymentId),
      mp_status: mpStatus || 'approved',
      status: newStatus
    });

    // Send emails only if this redirect is what confirmed the payment (webhook didn't get it first)
    if (mpStatus === 'approved' && wasPending) {
      const updatedOrder = getOrder.get(order.id);
      const items = JSON.parse(updatedOrder.items_json);
      sendOrderConfirmation(updatedOrder, items);
    }
  }

  res.render('success', {
    orderId: orderId || '?',
    deliveryDay: order ? order.delivery_day : 'miercoles'
  });
});

router.get('/failure', (req, res) => {
  const orderId = req.query.external_reference;
  res.render('failure', { orderId: orderId || null });
});

router.get('/pending', (req, res) => {
  const orderId = req.query.external_reference;
  res.render('pending', { orderId: orderId || null });
});

module.exports = router;
