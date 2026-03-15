document.addEventListener('DOMContentLoaded', () => {
  let shippingCost = 0;
  let shippingCostRaw = 0; // before free shipping check
  let shippingDistanceKm = 0;
  const orderForm = document.getElementById('order-form');
  const freeShippingThreshold = orderForm ? parseFloat(orderForm.dataset.freeShippingThreshold) || 0 : 0;

  // Quantity selectors (kg-based, min 2kg jumps: 0 -> 2 -> 3 -> 4 ...)
  document.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.product-card');
      const input = btn.closest('.qty-selector').querySelector('.qty-input');
      const display = btn.closest('.qty-selector').querySelector('.qty-value');
      const minKg = parseInt(card.dataset.minKg) || 2;
      let val = parseInt(input.value) || 0;

      if (btn.dataset.action === 'plus') {
        val = val === 0 ? minKg : Math.min(val + 1, 50);
      } else {
        val = val <= minKg ? 0 : val - 1;
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

  // Show time slots when delivery day is selected
  const dayRadios = document.querySelectorAll('[name="delivery_day"]');
  const timeSlotsDiv = document.getElementById('time-slots');
  dayRadios.forEach(radio => {
    radio.addEventListener('change', () => {
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
    const nalga = parseInt(document.querySelector('[name="qty_nalga"]')?.value) || 0;
    const bife = parseInt(document.querySelector('[name="qty_bife"]')?.value) || 0;
    const hasProducts = nalga > 0 || bife > 0;
    const hasDay = !!document.querySelector('[name="delivery_day"]:checked');
    const hasSlot = !!document.querySelector('[name="delivery_slot"]:checked');

    const submitBtn = document.getElementById('submit-order');
    if (submitBtn) submitBtn.disabled = !(hasProducts && hasDay && hasSlot);
  }

  if (orderForm) {
    orderForm.addEventListener('submit', (e) => {
      const nalga = parseInt(document.querySelector('[name="qty_nalga"]').value) || 0;
      const bife = parseInt(document.querySelector('[name="qty_bife"]').value) || 0;

      if (nalga === 0 && bife === 0) {
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
    });
  }
  if (window._gmCallbacks) window._gmCallbacks.push(initPlacesAutocomplete);

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
