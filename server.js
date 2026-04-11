require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const { getSetting } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000;

// Warnings de seguridad para producción
if (process.env.NODE_ENV === 'production') {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'cambiar-este-secreto') {
    console.warn('⚠️  SESSION_SECRET no está configurado. Usá un string aleatorio seguro.');
  }
  if (process.env.ADMIN_PASSWORD === 'admin123') {
    console.warn('⚠️  ADMIN_PASSWORD es "admin123". Cambialo por uno seguro.');
  }
}

// Products config (defaults, overridden by DB settings)
const PRODUCTS = [
  {
    id: 'nalga',
    title: 'Milanesas de Nalga',
    description: 'Milanesas de nalga premium, rebozado casero crujiente',
    pricePerKg: 28000,
    minKg: 2,
    image: '/images/nalga.jpeg',
    settingsKey: 'price_nalga'
  },
  {
    id: 'pollo',
    title: 'Milanesas de Pollo',
    description: 'Milanesas de pollo premium, rebozado casero crujiente',
    pricePerKg: 28000,
    minKg: 2,
    image: '/images/pollo.jpeg',
    settingsKey: 'price_pollo'
  },
  {
    id: 'bife-chorizo',
    title: 'Milanesas de Bife de Chorizo',
    description: 'Milanesas de bife de chorizo premium, corte grueso y tierno',
    pricePerKg: 28000,
    minKg: 2,
    image: '/images/bife-chorizo.jpeg',
    settingsKey: 'price_bife_chorizo'
  },
  {
    id: 'pelleto',
    title: 'Milanesas de Pelleto',
    description: 'Milanesas de pelleto premium, sabor intenso y tierno',
    pricePerKg: 28000,
    minKg: 2,
    image: '/images/peceto.jpeg',
    settingsKey: 'price_pelleto'
  }
];

app.locals.siteName = 'Milanorte';
app.locals.slogan = 'Otra vez milanesas?';
app.locals.formatPrice = (n) => '$' + Number(n).toLocaleString('es-AR');

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'milanorte-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Make session data + dynamic prices available in views
app.use((req, res, next) => {
  res.locals.session = req.session;

  // Load product prices from DB settings
  const products = PRODUCTS.map(p => {
    const dbPrice = getSetting.get(p.settingsKey);
    return { ...p, pricePerKg: dbPrice ? parseFloat(dbPrice.value) : p.pricePerKg };
  });
  res.locals.products = products;
  req.products = products;

  // Shipping rate, free threshold & Google Maps key
  const shippingRow = getSetting.get('shipping_rate_per_km');
  res.locals.shippingRate = shippingRow ? parseFloat(shippingRow.value) : 250;
  const thresholdRow = getSetting.get('free_shipping_threshold');
  res.locals.freeShippingThreshold = thresholdRow ? parseFloat(thresholdRow.value) : 150000;
  res.locals.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || '';

  const waVerification = getSetting.get('whatsapp_verification_enabled');
  res.locals.phoneVerificationEnabled = waVerification && waVerification.value === '1';

  const mpEnabled = getSetting.get('mp_enabled');
  res.locals.mpEnabled = mpEnabled ? mpEnabled.value === '1' : true; // default enabled
  const transferAlias = getSetting.get('transfer_alias');
  res.locals.transferAlias = transferAlias ? transferAlias.value : '';
  const paymentWhatsapp = getSetting.get('payment_whatsapp');
  res.locals.paymentWhatsapp = paymentWhatsapp ? paymentWhatsapp.value : '';

  next();
});

// Routes
app.use('/', require('./routes/shop'));
app.use('/payment', require('./routes/payment'));
app.use('/webhook', require('./routes/webhook'));
app.use('/admin', require('./routes/admin'));

app.listen(PORT, () => {
  console.log(`Milanorte corriendo en http://localhost:${PORT}`);
});
