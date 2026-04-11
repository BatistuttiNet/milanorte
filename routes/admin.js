const express = require('express');
const router = express.Router();
const { listOrders, listOrdersByStatus, listOrdersByDelivery, getOrder, updateOrderStatus, getAllSettings, setSetting } = require('../db/init');
const { sendTestEmail, sendOrderConfirmation } = require('../utils/mailer');

// Auth middleware
function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

router.get('/login', (req, res) => {
  res.render('admin/login', { error: null });
});

router.post('/login', (req, res) => {
  if (req.body.password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.redirect('/admin');
  } else {
    res.render('admin/login', { error: 'Contraseña incorrecta' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

router.get('/', requireAdmin, (req, res) => {
  const { status, delivery } = req.query;
  let orders;

  if (status) {
    orders = listOrdersByStatus.all(status);
  } else if (delivery) {
    orders = listOrdersByDelivery.all(delivery);
  } else {
    orders = listOrders.all();
  }

  res.render('admin/orders', {
    orders,
    currentFilter: status || delivery || 'all',
    pageTitle: 'Admin'
  });
});

router.get('/orders/:id', requireAdmin, (req, res) => {
  const order = getOrder.get(req.params.id);
  if (!order) return res.status(404).send('Pedido no encontrado');

  const items = JSON.parse(order.items_json);
  res.render('admin/order-detail', { order, items, pageTitle: `Pedido #${order.id}` });
});

router.post('/orders/:id/status', requireAdmin, (req, res) => {
  const order = getOrder.get(req.params.id);
  const wasPaid = order && order.status === 'paid';
  updateOrderStatus.run({ id: req.params.id, status: req.body.status });

  // Send confirmation email to customer when manually marked as paid
  if (req.body.status === 'paid' && !wasPaid && order) {
    const items = JSON.parse(order.items_json);
    sendOrderConfirmation(order, items);
  }

  res.redirect(`/admin/orders/${req.params.id}`);
});

// Settings
router.get('/settings', requireAdmin, (req, res) => {
  const rows = getAllSettings.all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.render('admin/settings', { settings, saved: req.query.saved === '1', test: req.query.test, testMsg: req.query.msg, pageTitle: 'Configuración' });
});

router.post('/settings', requireAdmin, (req, res) => {
  const fields = ['price_nalga', 'price_pollo', 'price_bife_chorizo', 'price_pelleto', 'shipping_rate_per_km', 'free_shipping_threshold'];
  for (const key of fields) {
    if (req.body[key] !== undefined) {
      setSetting.run(key, req.body[key]);
    }
  }
  // Checkbox: if unchecked, it's not sent in the form body
  setSetting.run('whatsapp_verification_enabled', req.body.whatsapp_verification_enabled ? '1' : '0');
  res.redirect('/admin/settings?saved=1');
});

router.post('/test-email', requireAdmin, async (req, res) => {
  const result = await sendTestEmail();
  if (result.ok) {
    res.redirect('/admin/settings?test=ok');
  } else {
    res.redirect('/admin/settings?test=error&msg=' + encodeURIComponent(result.error));
  }
});

module.exports = router;
