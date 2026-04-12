const express = require('express');
const router = express.Router();
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { getOrder, updateOrderFromWebhook } = require('../db/init');
const { sendOrderConfirmation } = require('../utils/mailer');

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

router.post('/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;

    if (type === 'payment') {
      const payment = new Payment(client);
      const paymentData = await payment.get({ id: data.id });

      const orderId = paymentData.external_reference;
      const order = getOrder.get(orderId);

      if (order) {
        let newStatus = order.status;
        if (paymentData.status === 'approved') {
          newStatus = 'paid';
        } else if (paymentData.status === 'rejected') {
          newStatus = 'cancelled';
        }

        updateOrderFromWebhook.run({
          id: order.id,
          mp_payment_id: String(paymentData.id),
          mp_status: paymentData.status,
          status: newStatus
        });

        // Send emails when payment is approved
        if (paymentData.status === 'approved') {
          const updatedOrder = getOrder.get(order.id);
          const items = JSON.parse(updatedOrder.items_json);
          sendOrderConfirmation(updatedOrder, items);
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Error procesando webhook MP:', err);
    res.sendStatus(200); // Always return 200 to MP
  }
});

module.exports = router;
