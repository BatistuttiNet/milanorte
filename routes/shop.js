const express = require('express');
const router = express.Router();
const { createOrder, getOrder, getSetting, findOrderByPhone, createVerification, getActiveVerification, markPhoneVerified, isPhoneVerified } = require('../db/init');
const fetch = require('node-fetch');

// La Rioja 1346, Tigre coordinates (hidden from client)
const ORIGIN_LAT = -34.4265;
const ORIGIN_LNG = -58.5756;

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get('/', (req, res) => {
  res.render('index', { products: res.locals.products });
});

// Calculate shipping cost from distance (client sends distance_km from browser Distance Matrix)
router.post('/calculate-shipping', (req, res) => {
  const { distance_km } = req.body;
  if (!distance_km || distance_km <= 0) return res.json({ error: 'Distancia inválida' });

  const roundedKm = Math.round(distance_km); // Sin decimales
  const rateRow = getSetting.get('shipping_rate_per_km');
  const rate = rateRow ? parseFloat(rateRow.value) : 250;
  const shippingCost = Math.round(roundedKm * rate);

  res.json({ distance_km: roundedKm, shipping_cost: shippingCost });
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
  const { qty_nalga, qty_bife, delivery_day, delivery_slot, customer_name, customer_phone, customer_email, customer_address, customer_lat, customer_lng } = req.body;
  const products = res.locals.products;

  const qNalga = parseInt(qty_nalga) || 0;
  const qBife = parseInt(qty_bife) || 0;

  if (qNalga === 0 && qBife === 0) {
    return res.redirect('/');
  }

  if (!delivery_day || !delivery_slot || !customer_name || !customer_phone || !customer_address) {
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

  const items = [];
  if (qNalga > 0) {
    items.push({ product: products[0].title, quantity: qNalga, unit_price: products[0].pricePerKg, unit: 'kg' });
  }
  if (qBife > 0) {
    items.push({ product: products[1].title, quantity: qBife, unit_price: products[1].pricePerKg, unit: 'kg' });
  }

  const productsTotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  // Server-side shipping calculation using haversine (approximate, doesn't need API)
  let shippingCost = 0;
  let shippingDistanceKm = 0;
  const lat = parseFloat(customer_lat);
  const lng = parseFloat(customer_lng);

  if (lat && lng) {
    shippingDistanceKm = Math.round(haversineKm(ORIGIN_LAT, ORIGIN_LNG, lat, lng) * 1.3); // ~30% road factor
    const rateRow = getSetting.get('shipping_rate_per_km');
    const rate = rateRow ? parseFloat(rateRow.value) : 250;
    shippingCost = Math.round(shippingDistanceKm * rate);
  }

  // Free shipping above threshold
  const thresholdRow = getSetting.get('free_shipping_threshold');
  const freeThreshold = thresholdRow ? parseFloat(thresholdRow.value) : 150000;
  if (freeThreshold > 0 && productsTotal >= freeThreshold) {
    shippingCost = 0;
  }

  const total = productsTotal + shippingCost;

  const result = createOrder.run({
    customer_name,
    customer_phone: phoneDigits,
    customer_email: customer_email || null,
    customer_address,
    delivery_day,
    delivery_slot,
    items_json: JSON.stringify(items),
    total_amount: total,
    shipping_cost: shippingCost,
    shipping_distance_km: shippingDistanceKm,
    customer_lat: lat || null,
    customer_lng: lng || null
  });

  const order = getOrder.get(result.lastInsertRowid);
  res.render('checkout', { order, items });
});

module.exports = router;
