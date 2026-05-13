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
    settingsKey: 'price_nalga',
    discountKey: 'discount_percent_nalga'
  },
  {
    id: 'pollo',
    title: 'Milanesas de Pollo',
    description: 'Milanesas de pollo premium, rebozado casero crujiente',
    pricePerKg: 28000,
    minKg: 2,
    image: '/images/pollo.jpeg',
    settingsKey: 'price_pollo',
    discountKey: 'discount_percent_pollo'
  },
  {
    id: 'bife-chorizo',
    title: 'Milanesas de Bife de Chorizo',
    description: 'Milanesas de bife de chorizo premium, corte grueso y tierno',
    pricePerKg: 28000,
    minKg: 2,
    image: '/images/bife-chorizo.jpeg',
    settingsKey: 'price_bife_chorizo',
    discountKey: 'discount_percent_bife_chorizo'
  },
  {
    id: 'peceto',
    title: 'Milanesas de Peceto',
    description: 'Milanesas de peceto premium, sabor intenso y tierno',
    pricePerKg: 28000,
    minKg: 2,
    image: '/images/peceto.jpeg',
    settingsKey: 'price_peceto',
    discountKey: 'discount_percent_peceto'
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

  // Load product prices and per-product discount % from DB settings.
  // The struck-through "compare" price is derived from price + discount %.
  const products = PRODUCTS.map(p => {
    const dbPrice = getSetting.get(p.settingsKey);
    const dbDiscount = getSetting.get(p.discountKey);
    const pricePerKg = dbPrice ? parseFloat(dbPrice.value) : p.pricePerKg;
    const discountPercent = dbDiscount ? parseFloat(dbDiscount.value) : 0;
    const comparePricePerKg = discountPercent > 0 && discountPercent < 100
      ? Math.round(pricePerKg / (1 - discountPercent / 100) / 100) * 100
      : 0;
    return { ...p, pricePerKg, discountPercent, comparePricePerKg };
  });
  res.locals.products = products;
  req.products = products;

  // Discount config
  const discountCodeRow = getSetting.get('discount_code');
  const discountPercentRow = getSetting.get('discount_percent');
  res.locals.discountCode = discountCodeRow ? discountCodeRow.value : '';
  res.locals.discountPercent = discountPercentRow ? parseFloat(discountPercentRow.value) : 0;

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
