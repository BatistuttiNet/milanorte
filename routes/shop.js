const express = require('express');
const router = express.Router();
const { createOrder, getOrder, getSetting } = require('../db/init');

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

  const rateRow = getSetting.get('shipping_rate_per_km');
  const rate = rateRow ? parseFloat(rateRow.value) : 250;
  const shippingCost = Math.round(distance_km * rate);

  res.json({ distance_km, shipping_cost: shippingCost });
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
    customer_phone,
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
