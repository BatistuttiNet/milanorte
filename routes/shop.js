const express = require('express');
const router = express.Router();
const { createOrder, getOrder, getSetting, findOrderByPhone, createVerification, getActiveVerification, markPhoneVerified, isPhoneVerified } = require('../db/init');
const fetch = require('node-fetch');
const { sendOrderNotification } = require('../utils/mailer');

router.get('/', (req, res) => {
  res.render('index', { products: res.locals.products });
});

// Validate discount code (used by client to preview discount before submitting)
router.post('/validate-discount', (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ valid: false });

  const codeRow = getSetting.get('discount_code');
  const percentRow = getSetting.get('discount_percent');
  const configuredCode = codeRow ? codeRow.value.trim() : '';
  const configuredPercent = percentRow ? parseFloat(percentRow.value) : 0;

  if (!configuredCode || configuredPercent <= 0) {
    return res.json({ valid: false, error: 'No hay descuentos disponibles' });
  }

  if (code.trim().toUpperCase() !== configuredCode.toUpperCase()) {
    return res.json({ valid: false, error: 'Código inválido' });
  }

  res.json({ valid: true, percent: configuredPercent });
});

// Check if phone already has a previous order (returning customer)
router.post('/check-phone', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.json({ verified: false });

  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) return res.json({ verified: false });

  const existingOrder = findOrderByPhone.get(digits);
  if (existingOrder) return res.json({ verified: true, returning: true });

  const verified = isPhoneVerified.get(digits);
  if (verified) return res.json({ verified: true });

  return res.json({ verified: false });
});

// Send verification code via WhatsApp
router.post('/verify-phone', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.json({ error: 'Teléfono requerido' });

  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) return res.json({ error: 'Teléfono inválido' });

  // Generate 6-digit code
  const code = String(Math.floor(100000 + Math.random() * 900000));

  // Save to DB
  createVerification.run({ phone: digits, code });

  // Send via WhatsApp Cloud API
  const waToken = process.env.WHATSAPP_TOKEN;
  const waPhoneId = process.env.WHATSAPP_PHONE_ID;

  if (!waToken || !waPhoneId) {
    console.error('WhatsApp Cloud API not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID)');
    return res.json({ error: 'WhatsApp no configurado. Contactá al administrador.' });
  }

  try {
    const waNumber = '549' + digits; // Argentina E.164 format without +
    const response = await fetch(`https://graph.facebook.com/v21.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${waToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: waNumber,
        type: 'text',
        text: { body: `Tu código de verificación para Milanorte es: ${code}` }
      })
    });

    const data = await response.json();
    if (data.error) {
      console.error('WhatsApp API error:', data.error);
      return res.json({ error: 'No se pudo enviar el código. Verificá tu número.' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('WhatsApp send error:', err);
    res.json({ error: 'Error al enviar el código. Intentá de nuevo.' });
  }
});

// Verify code
router.post('/verify-code', (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.json({ verified: false, error: 'Datos incompletos' });

  const digits = phone.replace(/\D/g, '');
  const verification = getActiveVerification.get(digits);

  if (!verification) {
    return res.json({ verified: false, error: 'Código expirado. Solicitá uno nuevo.' });
  }

  if (verification.code !== code.trim()) {
    return res.json({ verified: false, error: 'Código incorrecto' });
  }

  markPhoneVerified.run(digits, code.trim());
  res.json({ verified: true });
});

router.post('/order', async (req, res) => {
  const { delivery_day, delivery_slot, delivery_date, customer_name, customer_phone, customer_email, customer_address, address_extra, customer_lat, customer_lng, discount_code } = req.body;
  const products = res.locals.products;

  // Build items dynamically from all products
  const items = [];
  products.forEach(p => {
    const qty = parseInt(req.body[`qty_${p.id}`]) || 0;
    if (qty > 0) {
      const garlic = req.body[`garlic_${p.id}`] === 'sin' ? 'sin' : 'con';
      const garlicLabel = garlic === 'sin' ? 'sin ajo' : 'con ajo';
      items.push({
        product: `${p.title} (${garlicLabel})`,
        quantity: qty,
        unit_price: p.pricePerKg,
        unit: 'kg',
        garlic
      });
    }
  });

  if (items.length === 0) {
    return res.redirect('/');
  }

  const totalKg = items.reduce((sum, item) => sum + item.quantity, 0);
  if (totalKg < 2) {
    return res.redirect('/');
  }

  if (!delivery_day || !delivery_slot || !customer_name || !customer_phone || !customer_email || !customer_address) {
    return res.redirect('/');
  }

  // Validate Argentina phone: 10 digits, no leading 0
  const phoneDigits = customer_phone.replace(/\D/g, '');
  if (phoneDigits.length !== 10 || !/^[1-9]/.test(phoneDigits)) {
    return res.redirect('/');
  }

  // Check phone verification if enabled
  const verificationSetting = getSetting.get('whatsapp_verification_enabled');
  const verificationEnabled = verificationSetting && verificationSetting.value === '1';
  if (verificationEnabled) {
    const hasOrder = findOrderByPhone.get(phoneDigits);
    const hasVerification = isPhoneVerified.get(phoneDigits);
    if (!hasOrder && !hasVerification) {
      return res.redirect('/');
    }
  }

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  // Validate and apply discount
  let appliedDiscountCode = null;
  let appliedDiscountPercent = 0;
  let discountAmount = 0;
  if (discount_code && discount_code.trim()) {
    const codeRow = getSetting.get('discount_code');
    const percentRow = getSetting.get('discount_percent');
    const configuredCode = codeRow ? codeRow.value.trim() : '';
    const configuredPercent = percentRow ? parseFloat(percentRow.value) : 0;
    if (configuredCode && configuredPercent > 0 && discount_code.trim().toUpperCase() === configuredCode.toUpperCase()) {
      appliedDiscountCode = configuredCode.toUpperCase();
      appliedDiscountPercent = configuredPercent;
      discountAmount = Math.round(subtotal * configuredPercent / 100);
    }
  }

  const total = subtotal - discountAmount;

  const lat = parseFloat(customer_lat);
  const lng = parseFloat(customer_lng);

  const result = createOrder.run({
    customer_name,
    customer_phone: phoneDigits,
    customer_email: customer_email || null,
    customer_address,
    address_extra: address_extra || null,
    delivery_day,
    delivery_slot,
    delivery_date: delivery_date || null,
    items_json: JSON.stringify(items),
    total_amount: total,
    subtotal_amount: subtotal,
    discount_code: appliedDiscountCode,
    discount_percent: appliedDiscountPercent,
    discount_amount: discountAmount,
    customer_lat: lat || null,
    customer_lng: lng || null
  });

  const order = getOrder.get(result.lastInsertRowid);

  // Notificar al admin del nuevo pedido
  sendOrderNotification(order, items);

  res.render('checkout', { order, items });
});

module.exports = router;
