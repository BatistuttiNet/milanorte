document.addEventListener('DOMContentLoaded', () => {
  let shippingCost = 0;
  let shippingCostRaw = 0; // before free shipping check
  let shippingDistanceKm = 0;
  const orderForm = document.getElementById('order-form');
  const freeShippingThreshold = orderForm ? parseFloat(orderForm.dataset.freeShippingThreshold) || 0 : 0;
  const phoneVerificationEnabled = orderForm && orderForm.dataset.phoneVerification === '1';
  let phoneVerified = false;

  // Quantity selectors (kg-based, 1kg steps)
  document.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.qty-selector').querySelector('.qty-input');
      const display = btn.closest('.qty-selector').querySelector('.qty-value');
      let val = parseInt(input.value) || 0;

      if (btn.dataset.action === 'plus') {
        val = Math.min(val + 1, 50);
      } else {
        val = Math.max(val - 1, 0);
      }

      input.value = val;
      display.textContent = val;
      updateTotal();
    });
  });

  function formatPrice(n) {
    return '$' + n.toLocaleString('es-AR');
  }

  // Update total and subtotals
  function updateTotal() {
    let productsTotal = 0;
    document.querySelectorAll('.product-card').forEach(card => {
      const qty = parseInt(card.querySelector('.qty-input').value) || 0;
      const pricePerKg = parseFloat(card.dataset.pricePerKg) || 0;
      const subtotal = qty * pricePerKg;
      productsTotal += subtotal;

      const subEl = card.querySelector('.product-subtotal');
      if (subEl) {
        subEl.textContent = qty > 0 ? qty + 'kg = ' + formatPrice(subtotal) : '';
      }
    });

    // Free shipping if products total exceeds threshold
    if (freeShippingThreshold > 0 && productsTotal >= freeShippingThreshold) {
      shippingCost = 0;
    } else {
      shippingCost = shippingCostRaw;
    }

    // Update shipping display
    const shippingInfo = document.getElementById('shipping-info');
    if (shippingInfo && shippingInfo.style.display !== 'none' && shippingDistanceKm > 0) {
      if (shippingCost === 0 && shippingCostRaw > 0) {
        shippingInfo.innerHTML =
          '<span class="shipping-cost" style="color: green;">Envío gratis</span>' +
          '<span class="shipping-distance"> (' + shippingDistanceKm + ' km)</span>';
      } else if (shippingCostRaw > 0) {
        shippingInfo.innerHTML =
          '<span class="shipping-cost">Envío: ' + formatPrice(shippingCostRaw) + '</span>' +
          '<span class="shipping-distance"> (' + shippingDistanceKm + ' km)</span>';
      }
    }

    const total = productsTotal + shippingCost;
    const totalEl = document.getElementById('order-total');
    if (totalEl) totalEl.textContent = formatPrice(total);

    validateForm();
  }

  // Time slots per delivery day
  const slotsByDay = {
    miercoles: [
      { value: 'tarde', label: 'Tarde', time: '13 a 17hs' },
      { value: 'noche', label: 'Noche', time: '18 a 20hs' }
    ],
    sabado: [
      { value: 'manana', label: 'Mañana', time: '9 a 12hs' },
      { value: 'tarde', label: 'Tarde', time: '13 a 17hs' }
    ]
  };

  // Show time slots when delivery day is selected
  const dayRadios = document.querySelectorAll('[name="delivery_day"]');
  const timeSlotsDiv = document.getElementById('time-slots');
  const timeSlotsOptions = document.getElementById('time-slots-options');
  dayRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      const slots = slotsByDay[radio.value] || [];
      timeSlotsOptions.innerHTML = slots.map(s => `
        <div class="delivery-option">
          <input type="radio" id="slot-${s.value}" name="delivery_slot" value="${s.value}">
          <label for="slot-${s.value}">${s.label}<span class="slot-time">${s.time}</span></label>
        </div>
      `).join('');
      // Re-bind slot radios for validation
      timeSlotsOptions.querySelectorAll('[name="delivery_slot"]').forEach(r => {
        r.addEventListener('change', validateForm);
      });
      if (timeSlotsDiv) timeSlotsDiv.style.display = 'block';
      validateForm();
    });
  });

  // Time slot change
  const slotRadios = document.querySelectorAll('[name="delivery_slot"]');
  slotRadios.forEach(radio => {
    radio.addEventListener('change', validateForm);
  });

  // Form validation
  function validateForm() {
    let totalKg = 0;
    document.querySelectorAll('.qty-input').forEach(input => {
      totalKg += parseInt(input.value) || 0;
    });
    const hasMinKg = totalKg >= 2;
    const hasDay = !!document.querySelector('[name="delivery_day"]:checked');
    const hasSlot = !!document.querySelector('[name="delivery_slot"]:checked');
    const phoneOk = !phoneVerificationEnabled || phoneVerified;

    const submitBtn = document.getElementById('submit-order');
    const canSubmit = hasMinKg && hasDay && hasSlot && phoneOk;
    if (submitBtn) submitBtn.disabled = !canSubmit;

    // Show hint about what's missing
    const hint = document.getElementById('submit-hint');
    if (hint) {
      const missing = [];
      if (totalKg === 0) missing.push('Seleccioná al menos un producto');
      else if (!hasMinKg) missing.push('El pedido mínimo es de 2 kg en total');
      if (!hasDay) missing.push('Elegí un día de entrega');
      if (!hasSlot && hasDay) missing.push('Elegí un horario de entrega');
      if (!phoneOk) missing.push('Verificá tu teléfono por WhatsApp');
      hint.textContent = canSubmit ? '' : missing[0] || '';
    }
  }

  // Phone validation (Argentina: 10 digits without +54, 0, or 15)
  function normalizePhone(raw) {
    return raw.replace(/\D/g, '');
  }

  function validatePhone(digits) {
    if (digits.length !== 10) return 'El teléfono debe tener 10 dígitos (ej: 1155667788)';
    if (!/^[1-9]/.test(digits)) return 'El teléfono no debe empezar con 0';
    return null;
  }

  const phoneInput = document.getElementById('phone');
  const phoneError = document.getElementById('phone-error');
  if (phoneInput && phoneError) {
    phoneInput.addEventListener('input', () => {
      const digits = normalizePhone(phoneInput.value);
      const err = validatePhone(digits);
      if (phoneInput.value.length > 0 && err) {
        phoneError.textContent = err;
        phoneError.style.display = 'block';
      } else {
        phoneError.style.display = 'none';
      }
      // Reset verification when phone changes
      if (phoneVerificationEnabled && phoneVerified) {
        phoneVerified = false;
        resetVerificationUI();
        validateForm();
      }
      // Show verify button when phone is valid
      if (phoneVerificationEnabled && !err && digits.length === 10) {
        showVerifySection(digits);
      } else if (phoneVerificationEnabled) {
        hideVerifySection();
      }
    });
  }

  // Phone verification UI logic
  const verifySection = document.getElementById('phone-verify-section');
  const verifyMsg = document.getElementById('phone-verify-msg');
  const btnSendCode = document.getElementById('btn-send-code');
  const phoneSending = document.getElementById('phone-sending');
  const codeSection = document.getElementById('phone-code-section');
  const codeInput = document.getElementById('phone-code');
  const btnVerifyCode = document.getElementById('btn-verify-code');
  const codeError = document.getElementById('phone-code-error');
  const btnResend = document.getElementById('btn-resend-code');
  const verifiedDiv = document.getElementById('phone-verified');
  let resendTimer = null;

  function hideVerifySection() {
    if (verifySection) verifySection.style.display = 'none';
  }

  function resetVerificationUI() {
    if (!verifySection) return;
    verifySection.style.display = 'none';
    btnSendCode.style.display = 'none';
    phoneSending.style.display = 'none';
    codeSection.style.display = 'none';
    verifiedDiv.style.display = 'none';
    verifyMsg.style.display = 'block';
    verifyMsg.style.color = '#c62828';
    verifyMsg.textContent = 'Verificá tu teléfono por WhatsApp para continuar';
    if (phoneInput) phoneInput.style.borderColor = '';
    if (codeError) codeError.style.display = 'none';
  }

  function showVerifySection(digits) {
    if (!verifySection || !phoneVerificationEnabled) return;
    if (phoneVerified) return;

    verifySection.style.display = 'block';
    verifyMsg.style.display = 'block';

    // First check if this is a returning customer
    fetch('/check-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: digits })
    })
    .then(r => r.json())
    .then(data => {
      if (data.verified) {
        setPhoneVerified(data.returning ? 'Teléfono reconocido ✓' : 'Teléfono verificado ✓');
      } else {
        btnSendCode.style.display = 'inline-block';
        phoneInput.style.borderColor = '#c62828';
      }
    })
    .catch(() => {
      btnSendCode.style.display = 'inline-block';
    });
  }

  function setPhoneVerified(msg) {
    phoneVerified = true;
    verifyMsg.style.display = 'none';
    btnSendCode.style.display = 'none';
    phoneSending.style.display = 'none';
    codeSection.style.display = 'none';
    verifiedDiv.textContent = msg || 'Teléfono verificado ✓';
    verifiedDiv.style.display = 'block';
    if (phoneInput) phoneInput.style.borderColor = '#2e7d32';
    validateForm();
  }

  function sendVerificationCode() {
    const digits = normalizePhone(phoneInput.value);
    btnSendCode.style.display = 'none';
    phoneSending.style.display = 'inline';

    fetch('/verify-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: digits })
    })
    .then(r => r.json())
    .then(data => {
      phoneSending.style.display = 'none';
      if (data.success) {
        verifyMsg.textContent = 'Código enviado por WhatsApp';
        verifyMsg.style.color = '#1565c0';
        codeSection.style.display = 'block';
        codeInput.value = '';
        codeInput.focus();
        startResendTimer();
      } else {
        verifyMsg.textContent = data.error || 'Error al enviar código';
        verifyMsg.style.color = '#c62828';
        btnSendCode.style.display = 'inline-block';
        btnSendCode.textContent = 'Reintentar';
      }
    })
    .catch(() => {
      phoneSending.style.display = 'none';
      verifyMsg.textContent = 'Error de conexión. Intentá de nuevo.';
      verifyMsg.style.color = '#c62828';
      btnSendCode.style.display = 'inline-block';
    });
  }

  function startResendTimer() {
    btnResend.style.display = 'none';
    let seconds = 30;
    if (resendTimer) clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      seconds--;
      if (seconds <= 0) {
        clearInterval(resendTimer);
        btnResend.style.display = 'inline';
      }
    }, 1000);
  }

  if (btnSendCode) btnSendCode.addEventListener('click', sendVerificationCode);
  if (btnResend) btnResend.addEventListener('click', sendVerificationCode);

  if (btnVerifyCode) {
    btnVerifyCode.addEventListener('click', () => {
      const digits = normalizePhone(phoneInput.value);
      const code = codeInput.value.trim();
      if (code.length !== 6) {
        codeError.textContent = 'Ingresá los 6 dígitos';
        codeError.style.display = 'block';
        return;
      }

      btnVerifyCode.disabled = true;
      fetch('/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits, code })
      })
      .then(r => r.json())
      .then(data => {
        btnVerifyCode.disabled = false;
        if (data.verified) {
          codeError.style.display = 'none';
          setPhoneVerified();
        } else {
          codeError.textContent = data.error || 'Código incorrecto';
          codeError.style.display = 'block';
        }
      })
      .catch(() => {
        btnVerifyCode.disabled = false;
        codeError.textContent = 'Error de conexión';
        codeError.style.display = 'block';
      });
    });
  }

  // Auto-check phone on blur if verification enabled
  if (phoneInput && phoneVerificationEnabled) {
    phoneInput.addEventListener('blur', () => {
      const digits = normalizePhone(phoneInput.value);
      if (validatePhone(digits) === null && !phoneVerified) {
        showVerifySection(digits);
      }
    });
  }

  if (orderForm) {
    orderForm.addEventListener('submit', (e) => {
      let hasAny = false;
      document.querySelectorAll('.qty-input').forEach(input => {
        if (parseInt(input.value) > 0) hasAny = true;
      });

      if (!hasAny) {
        e.preventDefault();
        alert('Seleccioná al menos un producto');
        return;
      }

      const delivery = document.querySelector('[name="delivery_day"]:checked');
      if (!delivery) {
        e.preventDefault();
        alert('Seleccioná un día de entrega');
        return;
      }

      const slot = document.querySelector('[name="delivery_slot"]:checked');
      if (!slot) {
        e.preventDefault();
        alert('Seleccioná un horario de entrega');
        return;
      }

      // Validate phone
      const phoneVal = document.getElementById('phone');
      if (phoneVal) {
        const phoneDigits = normalizePhone(phoneVal.value);
        const phoneErr = validatePhone(phoneDigits);
        if (phoneErr) {
          e.preventDefault();
          alert(phoneErr);
          phoneVal.focus();
          return;
        }
        phoneVal.value = phoneDigits; // normalize before submit
      }

      // Check phone verification
      if (phoneVerificationEnabled && !phoneVerified) {
        e.preventDefault();
        alert('Verificá tu teléfono por WhatsApp antes de hacer el pedido');
        if (phoneVal) phoneVal.focus();
        return;
      }

      const lat = document.getElementById('customer_lat')?.value;
      if (!lat) {
        e.preventDefault();
        alert('Seleccioná tu dirección de la lista de sugerencias para calcular el envío');
        return;
      }
    });
  }

  // Google Maps Autocomplete
  function initPlacesAutocomplete() {
    const addressInput = document.getElementById('address');
    if (!addressInput) return;

    const autocomplete = new google.maps.places.Autocomplete(addressInput, {
      componentRestrictions: { country: 'ar' },
      fields: ['formatted_address', 'geometry'],
      types: ['address']
    });

    let map = null;
    let marker = null;

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.geometry) return;

      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      document.getElementById('customer_lat').value = lat;
      document.getElementById('customer_lng').value = lng;

      // Show map
      const mapDiv = document.getElementById('address-map');
      mapDiv.style.display = 'block';

      if (!map) {
        map = new google.maps.Map(mapDiv, { zoom: 15, center: { lat, lng } });
        marker = new google.maps.Marker({ map, position: { lat, lng } });
      } else {
        map.setCenter({ lat, lng });
        marker.setPosition({ lat, lng });
      }

      // Calculate shipping
      calculateShipping(lat, lng);

      // Show delivery day/slot section
      const deliverySection = document.getElementById('delivery-section');
      if (deliverySection) deliverySection.style.display = 'block';
    });
  }
  if (window.onGoogleMapsLoad) window.onGoogleMapsLoad(initPlacesAutocomplete);

  function calculateShipping(lat, lng) {
    const shippingInfo = document.getElementById('shipping-info');
    shippingInfo.style.display = 'block';
    shippingInfo.innerHTML = '<span class="shipping-distance">Calculando envío...</span>';

    const service = new google.maps.DistanceMatrixService();
    service.getDistanceMatrix({
      origins: [new google.maps.LatLng(-34.4265, -58.5756)], // La Rioja 1346, Tigre (approx)
      destinations: [new google.maps.LatLng(lat, lng)],
      travelMode: google.maps.TravelMode.DRIVING
    }, function(response, status) {
      if (status !== 'OK' || !response.rows[0]?.elements[0]?.distance) {
        shippingInfo.innerHTML = '<span class="shipping-distance">No se pudo calcular el envío. Verificá tu dirección.</span>';
        shippingCost = 0;
        updateTotal();
        return;
      }

      const distanceKm = Math.round(response.rows[0].elements[0].distance.value / 1000);

      // Get shipping rate from server
      fetch('/calculate-shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distance_km: distanceKm })
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          shippingInfo.innerHTML = '<span class="shipping-distance">Error al calcular el envío</span>';
          shippingCostRaw = 0;
          shippingCost = 0;
          shippingDistanceKm = 0;
        } else {
          shippingCostRaw = data.shipping_cost;
          shippingCost = data.shipping_cost;
          shippingDistanceKm = distanceKm;
        }
        updateTotal();
      })
      .catch(() => {
        shippingInfo.innerHTML = '<span class="shipping-distance">Error al calcular el envío</span>';
        shippingCostRaw = 0;
        shippingCost = 0;
        shippingDistanceKm = 0;
        updateTotal();
      });
    });
  }

  updateTotal();
});
