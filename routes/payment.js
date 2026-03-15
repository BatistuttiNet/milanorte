const express = require('express');
const router = express.Router();
const { MercadoPagoConfig, Preference } = require('mercadopago');
const { getOrder, updateOrderPayment } = require('../db/init');

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

router.get('/create/:orderId', async (req, res) => {
  try {
    const order = getOrder.get(req.params.orderId);
    if (!order) return res.status(404).send('Pedido no encontrado');

    const items = JSON.parse(order.items_json);
    const baseUrl = process.env.BASE_URL;

    const preference = new Preference(client);
    const result = await preference.create({
      body: {
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
        back_urls: {
          success: `${baseUrl}/payment/success`,
          failure: `${baseUrl}/payment/failure`,
          pending: `${baseUrl}/payment/pending`
        },
        auto_return: 'approved',
        notification_url: `${baseUrl}/webhook/mercadopago`,
        external_reference: String(order.id)
      }
    });

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
  const order = orderId ? getOrder.get(orderId) : null;
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
