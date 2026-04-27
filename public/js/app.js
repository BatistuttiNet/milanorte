document.addEventListener('DOMContentLoaded', () => {
  const orderForm = document.getElementById('order-form');
  const phoneVerificationEnabled = orderForm && orderForm.dataset.phoneVerification === '1';
  let phoneVerified = false;
  let discountPercent = 0;

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

  // Garlic toggle (con/sin ajo) per product
  document.querySelectorAll('.product-card').forEach(card => {
    const toggle = card.querySelector('.garlic-toggle');
    const checkbox = card.querySelector('.garlic-checkbox');
    const hidden = card.querySelector('.garlic-input');
    const label = card.querySelector('.garlic-label');
    if (toggle && checkbox && hidden && label) {
      const sync = () => {
        const con = checkbox.checked;
        hidden.value = con ? 'con' : 'sin';
        label.textContent = con ? 'Con ajo' : 'Sin ajo';
        toggle.classList.toggle('is-on', con);
      };
      checkbox.addEventListener('change', sync);
      label.addEventListener('click', () => {
        checkbox.checked = !checkbox.checked;
        sync();
      });
    }
  });

  // Update total and subtotals
  function updateTotal() {
    let subtotal = 0;
    document.querySelectorAll('.product-card').forEach(card => {
      const qty = parseInt(card.querySelector('.qty-input').value) || 0;
      const pricePerKg = parseFloat(card.dataset.pricePerKg) || 0;
      const lineSub = qty * pricePerKg;
      subtotal += lineSub;

      const subEl = card.querySelector('.product-subtotal');
      if (subEl) {
        subEl.textContent = qty > 0 ? qty + 'kg = ' + formatPrice(lineSub) : '';
      }
    });

    const discountAmount = Math.round(subtotal * discountPercent / 100);
    const total = subtotal - discountAmount;

    const subtotalRow = document.getElementById('subtotal-row');
    const discountRow = document.getElementById('discount-row');
    const subtotalEl = document.getElementById('order-subtotal');
    const discountEl = document.getElementById('order-discount');
    const discountLabel = document.getElementById('discount-label');
    const totalEl = document.getElementById('order-total');

    if (discountPercent > 0 && subtotal > 0) {
      if (subtotalRow) subtotalRow.style.display = 'block';
      if (discountRow) discountRow.style.display = 'block';
      if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
      if (discountEl) discountEl.textContent = '-' + formatPrice(discountAmount);
      if (discountLabel) discountLabel.textContent = '-' + discountPercent + '%';
    } else {
      if (subtotalRow) subtotalRow.style.display = 'none';
      if (discountRow) discountRow.style.display = 'none';
    }

    if (totalEl) totalEl.textContent = formatPrice(total);

    validateForm();
  }

  // Discount code apply
  const btnApplyDiscount = document.getElementById('btn-apply-discount');
  const discountInput = document.getElementById('discount_code');
  const discountMsg = document.getElementById('discount-msg');
  if (btnApplyDiscount && discountInput) {
    btnApplyDiscount.addEventListener('click', () => {
      const code = discountInput.value.trim();
      if (!code) {
        discountPercent = 0;
        discountMsg.style.display = 'none';
        updateTotal();
        return;
      }
      btnApplyDiscount.disabled = true;
      fetch('/validate-discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
        .then(r => r.json())
        .then(data => {
          btnApplyDiscount.disabled = false;
          if (data.valid) {
            discountPercent = parseFloat(data.percent) || 0;
            discountMsg.textContent = '✓ Descuento de ' + discountPercent + '% aplicado';
            discountMsg.style.color = 'var(--green, #2E7D32)';
            discountMsg.style.display = 'block';
            discountInput.style.borderColor = '#2E7D32';
          } else {
            discountPercent = 0;
            discountMsg.textContent = data.error || 'Código inválido';
            discountMsg.style.color = '#c62828';
            discountMsg.style.display = 'block';
            discountInput.style.borderColor = '#c62828';
          }
          updateTotal();
        })
        .catch(() => {
          btnApplyDiscount.disabled = false;
          discountPercent = 0;
          discountMsg.textContent = 'Error al validar el código';
          discountMsg.style.color = '#c62828';
          discountMsg.style.display = 'block';
          updateTotal();
        });
    });
    // Reset discount if user changes the code
    discountInput.addEventListener('input', () => {
      if (discountPercent > 0) {
        discountPercent = 0;
        discountMsg.style.display = 'none';
        discountInput.style.borderColor = '';
        updateTotal();
      }
    });
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

  // Calculate next 2 available delivery dates (Wed=3, Sat=6) with 24h cutoff
  function getNextDeliveryDates() {
    const now = new Date();
    const deliveryDays = [3, 6]; // Wednesday, Saturday
    const dates = [];
    const dayNames = { 3: 'miercoles', 6: 'sabado' };
    const dayLabels = { 3: 'Miércoles', 6: 'Sábado' };
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    for (let i = 1; i <= 14 && dates.length < 2; i++) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + i);
      const dow = candidate.getDay();
      if (!deliveryDays.includes(dow)) continue;

      // 24h cutoff: must be at least 24h from now
      const diffMs = candidate.setHours(0,0,0,0) - now.getTime();
      if (diffMs < 24 * 60 * 60 * 1000) continue;

      dates.push({
        value: dayNames[dow],
        label: dayLabels[dow],
        dateStr: candidate.getDate() + '/' + (candidate.getMonth() + 1),
        dateLong: candidate.getDate() + ' de ' + months[candidate.getMonth()],
        dateISO: candidate.toISOString().slice(0, 10)
      });
    }
    return dates;
  }

  // Populate delivery day options with real dates
  const deliveryDayContainer = document.getElementById('delivery-day-options');
  const timeSlotsDiv = document.getElementById('time-slots');
  const timeSlotsOptions = document.getElementById('time-slots-options');

  function renderDeliveryDays() {
    const dates = getNextDeliveryDates();
    if (!deliveryDayContainer) return;
    deliveryDayContainer.innerHTML = dates.map((d, i) => `
      <div class="delivery-option">
        <input type="radio" id="del-${i}" name="delivery_day" value="${d.value}" data-date="${d.dateISO}">
        <label for="del-${i}">${d.label}<span class="delivery-date">${d.dateLong}</span></label>
      </div>
    `).join('');

    // Bind change events
    deliveryDayContainer.querySelectorAll('[name="delivery_day"]').forEach(radio => {
      radio.addEventListener('change', () => {
        // Set hidden delivery_date field
        const dateInput = document.getElementById('delivery_date');
        if (dateInput) dateInput.value = radio.dataset.date;
        const slots = slotsByDay[radio.value] || [];
        timeSlotsOptions.innerHTML = slots.map(s => `
          <div class="delivery-option">
            <input type="radio" id="slot-${s.value}" name="delivery_slot" value="${s.value}">
            <label for="slot-${s.value}">${s.label}<span class="slot-time">${s.time}</span></label>
          </div>
        `).join('');
        timeSlotsOptions.querySelectorAll('[name="delivery_slot"]').forEach(r => {
          r.addEventListener('change', validateForm);
        });
        if (timeSlotsDiv) timeSlotsDiv.style.display = 'block';
        validateForm();
      });
    });
  }
  renderDeliveryDays();

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
      if (phoneVerificationEnabled && phoneVerified) {
        phoneVerified = false;
        resetVerificationUI();
        validateForm();
      }
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
      let totalKg = 0;
      document.querySelectorAll('.qty-input').forEach(input => {
        totalKg += parseInt(input.value) || 0;
      });

      if (totalKg === 0) {
        e.preventDefault();
        alert('Seleccioná al menos un producto');
        return;
      }

      if (totalKg < 2) {
        e.preventDefault();
        alert('El pedido mínimo es de 2 kg en total');
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
        phoneVal.value = phoneDigits;
      }

      if (phoneVerificationEnabled && !phoneVerified) {
        e.preventDefault();
        alert('Verificá tu teléfono por WhatsApp antes de hacer el pedido');
        if (phoneVal) phoneVal.focus();
        return;
      }

      const lat = document.getElementById('customer_lat')?.value;
      if (!lat) {
        e.preventDefault();
        alert('Seleccioná tu dirección de la lista de sugerencias');
        return;
      }
    });
  }

  // Google Maps Autocomplete (for address validation, not shipping)
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

      const mapDiv = document.getElementById('address-map');
      mapDiv.style.display = 'block';

      if (!map) {
        map = new google.maps.Map(mapDiv, { zoom: 15, center: { lat, lng } });
        marker = new google.maps.Marker({ map, position: { lat, lng } });
      } else {
        map.setCenter({ lat, lng });
        marker.setPosition({ lat, lng });
      }

      // Delivery section is always visible now (no need to show/hide)
    });
  }
  if (window.onGoogleMapsLoad) window.onGoogleMapsLoad(initPlacesAutocomplete);

  updateTotal();
});
