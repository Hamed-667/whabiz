
var slug = window.location.pathname.substring(1);
var vendeurData = null;
var allProducts = [];
var allReviews = [];
var cart = [];
var currentGalleryImages = [];
var currentGalleryIndex = 0;
var selectedCategory = 'Toutes';
var searchTerm = '';
var currentLayout = 'grid';
var minPrice = null;
var maxPrice = null;
var inStockOnly = false;
var minRating = 0;
var cartUpdatedAt = Number(localStorage.getItem('cartUpdatedAt_' + slug)) || 0;
var clientTel = localStorage.getItem('clientTel_' + slug) || '';
var clientNom = localStorage.getItem('clientNom_' + slug) || '';
var filtersInitialized = false;
var cartSyncTimer = null;
var analyticsSession = localStorage.getItem('analyticsSession') || ('sess_' + Date.now() + '_' + Math.random().toString(16).slice(2));
var clientCity = localStorage.getItem('clientCity_' + slug) || '';
var clientAddress = localStorage.getItem('clientAddress_' + slug) || '';
var clientNotes = localStorage.getItem('clientNotes_' + slug) || '';
localStorage.setItem('analyticsSession', analyticsSession);
var PAYMENT_LABELS = {
  cash_on_delivery: 'Paiement a la livraison',
  orange_money: 'Orange Money',
  moov_money: 'Moov Money',
  wave: 'Wave'
};
function pickAvailableVariant(product) {
  if (!product || !Array.isArray(product.variants) || product.variants.length === 0) return null;
  return product.variants.find(function(v) { return Number(v.stock || 0) > 0; }) || product.variants[0];
}

function getAvailableStock(product) {
  var variant = pickAvailableVariant(product);
  if (variant) return Number(variant.stock || 0);
  return Number(product && product.stock);
}

function isOutOfStock(product) {
  var availableStock = getAvailableStock(product);
  return Number.isFinite(availableStock) && availableStock <= 0;
}

function trackEvent(eventName, metadata) {
  try {
    fetch('/api/analytics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: eventName,
        slug: slug,
        vendeurId: vendeurData ? vendeurData.id : null,
        sessionId: analyticsSession,
        metadata: metadata || {}
      })
    });
  } catch (e) {}
}

function getVendorPaymentMethods() {
  if (!vendeurData || !Array.isArray(vendeurData.paymentMethods) || !vendeurData.paymentMethods.length) {
    return ['cash_on_delivery', 'orange_money'];
  }
  return vendeurData.paymentMethods.slice();
}

function getVendorDeliveryConfig() {
  var delivery = vendeurData && vendeurData.delivery && typeof vendeurData.delivery === 'object' ? vendeurData.delivery : {};
  return {
    mode: String(delivery.mode || 'pickup_and_delivery'),
    fee: Math.max(0, Number(delivery.fee || 0)),
    freeAbove: Math.max(0, Number(delivery.freeAbove || 0)),
    eta: String(delivery.eta || '24h'),
    zones: String(delivery.zones || 'Votre ville'),
    instructions: String(delivery.instructions || '')
  };
}

function getPaymentLabel(method) {
  return PAYMENT_LABELS[String(method || '')] || 'Paiement';
}

function getDeliveryOptions() {
  var delivery = getVendorDeliveryConfig();
  if (delivery.mode === 'pickup_only') {
    return [{ value: 'pickup', label: 'Retrait boutique', hint: 'Le client recupere sa commande.' }];
  }
  if (delivery.mode === 'delivery_only') {
    return [{ value: 'delivery', label: 'Livraison', hint: 'Livraison dans ' + delivery.zones + '.' }];
  }
  return [
    { value: 'delivery', label: 'Livraison', hint: 'Livraison dans ' + delivery.zones + '.' },
    { value: 'pickup', label: 'Retrait boutique', hint: 'Le client recupere sa commande.' }
  ];
}

function computeDeliveryFee(subtotal, method) {
  if (method !== 'delivery') return 0;
  var delivery = getVendorDeliveryConfig();
  if (delivery.freeAbove > 0 && subtotal >= delivery.freeAbove) return 0;
  return Math.max(0, Number(delivery.fee || 0));
}


function loadCartFromStorage() {
  var stored = localStorage.getItem('cart_' + slug);
  if (stored) {
    try {
      cart = JSON.parse(stored);
    } catch (e) {
      cart = [];
    }
  }
  cartUpdatedAt = Number(localStorage.getItem('cartUpdatedAt_' + slug)) || 0;
  clientTel = localStorage.getItem('clientTel_' + slug) || '';
  clientNom = localStorage.getItem('clientNom_' + slug) || '';
  clientCity = localStorage.getItem('clientCity_' + slug) || '';
  clientAddress = localStorage.getItem('clientAddress_' + slug) || '';
  clientNotes = localStorage.getItem('clientNotes_' + slug) || '';
  updateCartBadge();
}


function saveCartToStorage(timestamp, skipSync) {
  var stamp = Number.isFinite(timestamp) ? timestamp : Date.now();
  cartUpdatedAt = stamp;
  localStorage.setItem('cart_' + slug, JSON.stringify(cart));
  localStorage.setItem('cartUpdatedAt_' + slug, String(stamp));
  updateCartBadge();
  if (!skipSync) {
    scheduleCartSync();
  }
}

function normalizeTel(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function getClientTel() {
  return localStorage.getItem('clientTel_' + slug) || '';
}

function scheduleCartSync() {
  clientTel = getClientTel();
  if (!clientTel) return;
  if (cartSyncTimer) clearTimeout(cartSyncTimer);
  cartSyncTimer = setTimeout(syncCartToServer, 600);
}

async function syncCartToServer() {
  clientTel = getClientTel();
  if (!clientTel) return;
  try {
    await fetch('/api/carts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: slug,
        clientTel: clientTel,
        items: cart
      })
    });
  } catch (e) {}
}

async function loadCartFromServer() {
  clientTel = getClientTel();
  if (!clientTel) return;
  try {
    var res = await fetch('/api/carts?slug=' + encodeURIComponent(slug) + '&clientTel=' + encodeURIComponent(clientTel));
    if (!res.ok) return;
    var payload = await res.json();
    var serverItems = Array.isArray(payload.items) ? payload.items : [];
    var serverUpdatedAt = Date.parse(payload.updatedAt || '') || 0;
    var localUpdated = Number(localStorage.getItem('cartUpdatedAt_' + slug)) || 0;
    if (serverItems.length && serverUpdatedAt > localUpdated) {
      cart = serverItems;
      saveCartToStorage(serverUpdatedAt, true);
      displayCart();
    }
  } catch (e) {}
}

function renderCartProfileSection() {
  var telValue = getClientTel();
  var hint = telValue
    ? 'Synchro active pour ce numero.'
    : 'Entrez votre numero pour sauvegarder votre panier et le retrouver plus tard.';
  return '<div class="cart-profile">' +
    '<div class="cart-profile-title">Sauvegarde du panier</div>' +
    '<div class="cart-profile-row">' +
    '<input type="tel" class="cart-profile-input" id="clientTelInput" placeholder="Numero WhatsApp" value="' + telValue + '">' +
    '<button class="cart-profile-btn" onclick="saveClientTel()">Sauvegarder</button>' +
    '</div>' +
    '<div class="cart-profile-hint">' + hint + '</div>' +
    '</div>';
}

function renderCheckoutSection(subtotal) {
  var paymentMethods = getVendorPaymentMethods();
  var deliveryOptions = getDeliveryOptions();
  var defaultDelivery = deliveryOptions[0] ? deliveryOptions[0].value : 'delivery';
  var savedDeliveryMethod = localStorage.getItem('clientDeliveryMethod_' + slug) || defaultDelivery;
  var deliveryMethod = deliveryOptions.some(function(option) { return option.value === savedDeliveryMethod; }) ? savedDeliveryMethod : defaultDelivery;
  var savedPaymentMethod = localStorage.getItem('clientPaymentMethod_' + slug) || paymentMethods[0] || 'cash_on_delivery';
  var paymentMethod = paymentMethods.indexOf(savedPaymentMethod) >= 0 ? savedPaymentMethod : (paymentMethods[0] || 'cash_on_delivery');
  var deliveryFee = computeDeliveryFee(subtotal, deliveryMethod);
  var total = subtotal + deliveryFee;
  var delivery = getVendorDeliveryConfig();
  var deliveryOptionsHtml = deliveryOptions.map(function(option) {
    var checked = option.value === deliveryMethod ? ' checked' : '';
    return '<label class="checkout-option"><input type="radio" name="checkoutDeliveryMethod" value="' + option.value + '"' + checked + '><span><strong>' + option.label + '</strong><small>' + option.hint + '</small></span></label>';
  }).join('');
  var paymentOptionsHtml = paymentMethods.map(function(method) {
    var checked = method === paymentMethod ? ' checked' : '';
    return '<label class="checkout-option"><input type="radio" name="checkoutPaymentMethod" value="' + method + '"' + checked + '><span><strong>' + getPaymentLabel(method) + '</strong><small>' + (method === 'cash_on_delivery' ? 'Paiement au moment de la remise.' : 'Validation mobile money avant confirmation finale.') + '</small></span></label>';
  }).join('');

  return ''
    + '<div class="checkout-panel">'
    +   '<div class="checkout-panel-title">Validation de commande</div>'
    +   '<div class="checkout-panel-subtitle">Confirmez votre WhatsApp, choisissez paiement et livraison, puis envoyez la commande.</div>'
    +   '<div class="checkout-grid">'
    +     '<div class="checkout-field">'
    +       '<label class="checkout-label" for="checkoutClientNom">Nom complet</label>'
    +       '<input type="text" class="checkout-input" id="checkoutClientNom" value="' + (clientNom || '') + '" placeholder="Votre nom" required>'
    +     '</div>'
    +     '<div class="checkout-field">'
    +       '<label class="checkout-label" for="checkoutClientTel">WhatsApp</label>'
    +       '<input type="tel" class="checkout-input" id="checkoutClientTel" value="' + (clientTel || '') + '" placeholder="Numero WhatsApp" required>'
    +     '</div>'
    +     '<div class="checkout-field">'
    +       '<label class="checkout-label" for="checkoutClientCity">Ville</label>'
    +       '<input type="text" class="checkout-input" id="checkoutClientCity" value="' + (clientCity || '') + '" placeholder="Ex: Bobo-Dioulasso">'
    +     '</div>'
    +     '<div class="checkout-field checkout-field--full">'
    +       '<label class="checkout-label" for="checkoutClientAddress">Adresse / quartier</label>'
    +       '<textarea class="checkout-input checkout-textarea" id="checkoutClientAddress" placeholder="Precisez le quartier, la rue ou un point de repere">' + (clientAddress || '') + '</textarea>'
    +     '</div>'
    +     '<div class="checkout-field checkout-field--full">'
    +       '<label class="checkout-label">Mode de livraison</label>'
    +       '<div class="checkout-options checkout-options--delivery">' + deliveryOptionsHtml + '</div>'
    +       '<div class="checkout-helper">' + (delivery.instructions ? delivery.instructions + ' ' : '') + 'Zone desservie: ' + delivery.zones + '. Delai indicatif: ' + delivery.eta + '.</div>'
    +     '</div>'
    +     '<div class="checkout-field checkout-field--full">'
    +       '<label class="checkout-label">Mode de paiement</label>'
    +       '<div class="checkout-options">' + paymentOptionsHtml + '</div>'
    +     '</div>'
    +     '<div class="checkout-field checkout-field--full">'
    +       '<label class="checkout-label" for="checkoutNotes">Note pour la boutique</label>'
    +       '<textarea class="checkout-input checkout-textarea" id="checkoutNotes" placeholder="Couleur souhaitee, heure de livraison, precision utile...">' + (clientNotes || '') + '</textarea>'
    +     '</div>'
    +   '</div>'
    +   '<div class="checkout-summary">'
    +     '<div class="checkout-summary-row"><span>Sous-total</span><strong>' + subtotal.toLocaleString('fr-FR') + ' FCFA</strong></div>'
    +     '<div class="checkout-summary-row"><span>Livraison</span><strong id="checkoutDeliveryFee">' + deliveryFee.toLocaleString('fr-FR') + ' FCFA</strong></div>'
    +     '<div class="checkout-summary-row checkout-summary-row--total"><span>Total a confirmer</span><strong id="checkoutGrandTotal">' + total.toLocaleString('fr-FR') + ' FCFA</strong></div>'
    +   '</div>'
    + '</div>';
}

function syncCheckoutUi(subtotal) {
  var deliveryInputs = document.querySelectorAll('input[name="checkoutDeliveryMethod"]');
  if (!deliveryInputs.length) return;

  function update() {
    var deliveryInput = document.querySelector('input[name="checkoutDeliveryMethod"]:checked');
    var method = deliveryInput ? deliveryInput.value : 'delivery';
    var deliveryFee = computeDeliveryFee(subtotal, method);
    var total = subtotal + deliveryFee;
    var feeNode = document.getElementById('checkoutDeliveryFee');
    var totalNode = document.getElementById('checkoutGrandTotal');
    var address = document.getElementById('checkoutClientAddress');
    if (feeNode) feeNode.textContent = deliveryFee.toLocaleString('fr-FR') + ' FCFA';
    if (totalNode) totalNode.textContent = total.toLocaleString('fr-FR') + ' FCFA';
    if (address) {
      var pickup = method === 'pickup';
      address.disabled = pickup;
      address.placeholder = pickup ? 'Le retrait boutique ne demande pas d adresse.' : 'Precisez le quartier, la rue ou un point de repere';
    }
  }

  Array.prototype.forEach.call(deliveryInputs, function(input) {
    input.addEventListener('change', update);
  });
  update();
}

function saveClientTel() {
  var input = document.getElementById('clientTelInput');
  if (!input) return;
  var raw = normalizeTel(input.value);
  if (!raw) {
    alert('Entrez un numero valide');
    return;
  }
  localStorage.setItem('clientTel_' + slug, raw);
  clientTel = raw;
  showNotification('Panier synchronise');
  scheduleCartSync();
  loadCartFromServer();
}


function updateCartBadge() {
  var badge = document.getElementById('cartBadge');
  var totalItems = cart.reduce(function(sum, item) {
    return sum + item.quantity;
  }, 0);
  
  if (totalItems > 0) {
    badge.textContent = totalItems;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}


function addToCart(productId, event) {
  if (event) event.stopPropagation();
  
  var product = allProducts.find(function(p) { return p.id === productId; });
  if (!product) return;

  var selectedVariant = pickAvailableVariant(product);
  var availableStock = getAvailableStock(product);
  if (Number.isFinite(availableStock) && availableStock <= 0) {
    showNotification('Stock indisponible pour ce produit');
    return;
  }

  var existingItem = cart.find(function(item) {
    return item.id === productId && String(item.variantId || '') === String(selectedVariant ? selectedVariant.id : '');
  });

  if (existingItem) {
    if (Number.isFinite(availableStock) && existingItem.quantity >= availableStock) {
      showNotification('Stock maximum atteint');
      return;
    }
    existingItem.quantity++;
  } else {
    cart.push({
      id: product.id,
      nom: product.nom,
      prix: product.prix,
      image: (product.images && product.images[0]) || product.image || '',
      quantity: 1,
      variantId: selectedVariant ? selectedVariant.id : '',
      variantName: selectedVariant ? selectedVariant.name : ''
    });
  }
  
  saveCartToStorage();
  trackEvent('add_to_cart', { productId: product.id, variantId: selectedVariant ? selectedVariant.id : null });
  showNotification('Produit ajoute au panier');
}


function showNotification(message) {
  var notification = document.createElement('div');
  notification.style.cssText = 'position: fixed; top: 80px; right: 20px; background: rgba(15,157,88,.9); color: #fff; padding: 16px 24px; border-radius: 50px; font-weight: 600; z-index: 3000; animation: slideIn 0.3s;';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(function() {
    notification.remove();
  }, 2000);
}


function openCart() {
  displayCart();
  document.getElementById('cartModal').classList.add('show');
}


function closeCart() {
  document.getElementById('cartModal').classList.remove('show');
}


function displayCart() {
  var container = document.getElementById('cartContent');
  
  if (cart.length === 0) {
    container.innerHTML = '<div class="cart-empty"><div class="cart-empty-icon">Panier</div><h3>Votre panier est vide</h3><p>Ajoutez des produits pour commencer</p></div>' + renderCartProfileSection();
    return;
  }
  
  var html = '<div class="cart-items">';
  
  cart.forEach(function(item, index) {
    var subtotal = item.prix * item.quantity;
    html += '<div class="cart-item">';
    html += '<img src="' + (item.image || 'https://via.placeholder.com/80') + '" alt="' + item.nom + '" class="cart-item-image">';
    html += '<div class="cart-item-details">';
    html += '<div class="cart-item-name">' + item.nom + '</div>';
    if (item.variantName) {
      html += '<div class="cart-item-variant">Option: ' + item.variantName + '</div>';
    }
    html += '<div class="cart-item-price">' + item.prix + ' FCFA/unite</div>';
    html += '<div class="cart-item-controls">';
    html += '<div class="quantity-controls">';
    html += '<button class="quantity-btn" onclick="decreaseQuantity(' + index + ')">-</button>';
    html += '<span class="quantity-value">' + item.quantity + '</span>';
    html += '<button class="quantity-btn" onclick="increaseQuantity(' + index + ')">+</button>';
    html += '</div>';
    html += '<button class="cart-item-remove" onclick="removeFromCart(' + index + ')">Supprimer</button>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  });
  
  html += '</div>';
  
  
  var total = cart.reduce(function(sum, item) {
    return sum + (item.prix * item.quantity);
  }, 0);
  
  var itemsCount = cart.reduce(function(sum, item) {
    return sum + item.quantity;
  }, 0);
  
  html += '<div class="cart-total">';
  html += '<div class="cart-total-row">';
  html += '<span>Articles (' + itemsCount + ')</span>';
  html += '<span>' + itemsCount + '</span>';
  html += '</div>';
  html += '<div class="cart-total-row">';
  html += '<strong>TOTAL</strong>';
  html += '<strong>' + total.toLocaleString() + ' FCFA</strong>';
  html += '</div>';
  html += '</div>';
  
  html += '<div class="cart-actions">';
  html += '<button class="btn-order-all" onclick="orderAll()">';
  html += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" fill="currentColor"/></svg>';
  html += 'Commander tout (' + total.toLocaleString() + ' FCFA)';
  html += '</button>';
  html += '<button class="btn-clear-cart" onclick="clearCart()">Vider le panier</button>';
  html += '</div>';

  html += renderCartProfileSection();
  html += renderCheckoutSection(total);
  
  container.innerHTML = html;
  syncCheckoutUi(total);
}


function increaseQuantity(index) {
  cart[index].quantity++;
  saveCartToStorage();
  displayCart();
}


function decreaseQuantity(index) {
  if (cart[index].quantity > 1) {
    cart[index].quantity--;
    saveCartToStorage();
    displayCart();
  } else {
    removeFromCart(index);
  }
}


function removeFromCart(index) {
  cart.splice(index, 1);
  saveCartToStorage();
  displayCart();
  showNotification('Produit retire du panier');
}


function clearCart() {
  if (confirm('Vider tout le panier ?')) {
    cart = [];
    saveCartToStorage();
    displayCart();
  showNotification('Panier vide');
  }
}


async function orderAll() {
  if (!vendeurData || cart.length === 0) return;

  var clientNomField = document.getElementById('checkoutClientNom');
  var clientTelField = document.getElementById('checkoutClientTel');
  var clientCityField = document.getElementById('checkoutClientCity');
  var clientAddressField = document.getElementById('checkoutClientAddress');
  var clientNotesField = document.getElementById('checkoutNotes');
  var paymentInput = document.querySelector('input[name="checkoutPaymentMethod"]:checked');
  var deliveryInput = document.querySelector('input[name="checkoutDeliveryMethod"]:checked');
  var clientNomValue = clientNomField ? clientNomField.value.trim() : '';
  var cleanedTel = normalizeTel(clientTelField ? clientTelField.value : '');
  var deliveryMethod = deliveryInput ? deliveryInput.value : 'delivery';
  var paymentMethod = paymentInput ? paymentInput.value : 'cash_on_delivery';
  var cityValue = clientCityField ? clientCityField.value.trim() : '';
  var addressValue = clientAddressField ? clientAddressField.value.trim() : '';
  var notesValue = clientNotesField ? clientNotesField.value.trim() : '';

  if (!clientNomValue) {
    alert('Le nom est obligatoire');
    return;
  }
  if (!cleanedTel) {
    alert('Le numero WhatsApp est obligatoire');
    return;
  }
  if (deliveryMethod === 'delivery' && !addressValue) {
    alert('L adresse de livraison est obligatoire');
    return;
  }

  clientTel = cleanedTel;
  clientNom = clientNomValue;
  clientCity = cityValue;
  clientAddress = addressValue;
  clientNotes = notesValue;
  localStorage.setItem('clientNom_' + slug, clientNom);
  localStorage.setItem('clientTel_' + slug, clientTel);
  localStorage.setItem('clientCity_' + slug, clientCity);
  localStorage.setItem('clientAddress_' + slug, clientAddress);
  localStorage.setItem('clientNotes_' + slug, clientNotes);
  localStorage.setItem('clientPaymentMethod_' + slug, paymentMethod);
  localStorage.setItem('clientDeliveryMethod_' + slug, deliveryMethod);

  var subtotal = cart.reduce(function(sum, item) {
    return sum + (item.prix * item.quantity);
  }, 0);
  var deliveryFee = computeDeliveryFee(subtotal, deliveryMethod);
  var total = subtotal + deliveryFee;
  var deliveryConfig = getVendorDeliveryConfig();
  var deliveryPayload = {
    method: deliveryMethod,
    fee: deliveryFee,
    eta: deliveryConfig.eta,
    zone: deliveryConfig.zones,
    city: cityValue,
    address: addressValue,
    instructions: deliveryConfig.instructions
  };

  trackEvent('checkout_start', {
    itemsCount: cart.length,
    total: total,
    paymentMethod: paymentMethod,
    deliveryMethod: deliveryMethod
  });

  var checkout = await saveOrderToServer(clientNom, clientTel, cart, total, paymentMethod, deliveryPayload, notesValue);
  if (!checkout || !checkout.order) {
    alert('Impossible de valider la commande pour le moment');
    return;
  }

  var orderId = checkout.order.id;

  var message = '*Nouvelle commande*\n\n';
  message += 'Commande : #' + orderId + '\n';
  message += 'Client : ' + clientNom + '\n';
  message += 'Tel : ' + clientTel + '\n';
  if (cityValue) {
    message += 'Ville : ' + cityValue + '\n';
  }
  message += 'Livraison : ' + (deliveryMethod === 'pickup' ? 'Retrait boutique' : 'Livraison') + '\n';
  if (deliveryMethod === 'delivery' && addressValue) {
    message += 'Adresse : ' + addressValue + '\n';
  }
  message += '\n';
  
  cart.forEach(function(item) {
    var subtotal = item.prix * item.quantity;
    message += '* ' + item.nom + '\n';
    if (item.variantName) {
      message += '   Option : ' + item.variantName + '\n';
    }
    message += '   Quantite : ' + item.quantity + '\n';
    message += '   Prix unitaire : ' + item.prix.toLocaleString() + ' FCFA\n';
    message += '   Sous-total : ' + subtotal.toLocaleString() + ' FCFA\n\n';
  });
  
  message += 'Paiement : ' + getPaymentLabel(paymentMethod) + '\n';
  if (deliveryFee > 0) {
    message += 'Frais de livraison : ' + deliveryFee.toLocaleString('fr-FR') + ' FCFA\n';
  }
  if (notesValue) {
    message += 'Note : ' + notesValue + '\n';
  }
  message += '*TOTAL : ' + total.toLocaleString() + ' FCFA*\n\n';
  message += 'Merci de confirmer la commande !';
  
  
  var url = 'https://wa.me/' + vendeurData.tel.replace(/\s/g, '') + '?text=' + encodeURIComponent(message);
  
  
  var whatsappWindow = window.open(url, '_blank');
  
  if (!whatsappWindow) {
    
    if (confirm('Le popup a ete bloque. Cliquez OK pour ouvrir WhatsApp dans un nouvel onglet.')) {
      window.location.href = url;
    }
  }

  if (checkout.checkoutUrl) {
    window.open(checkout.checkoutUrl, '_blank');
  }

  trackEvent('order_submit', {
    orderId: orderId,
    total: total,
    paymentMethod: paymentMethod,
    deliveryMethod: deliveryMethod
  });

  showNotification('Commande enregistree !');
  setTimeout(function() {
    clearCart();
    closeCart();
  }, 1500);
}


async function saveOrderToServer(clientNom, clientTel, items, total, paymentMethod, deliveryPayload, notes) {
  try {
    var res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vendeurId: vendeurData.id,
        clientNom: clientNom,
        clientTel: clientTel,
        items: items,
        total: total,
        paymentMethod: paymentMethod,
        delivery: deliveryPayload || {},
        notes: notes || '',
        sessionId: analyticsSession
      })
    });
    
    if (!res.ok) {
      console.error('Erreur enregistrement commande');
      return null;
    }

    var order = await res.json();
    var payment = null;

    if (paymentMethod !== 'cash_on_delivery') {
      var paymentRes = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          method: paymentMethod,
          sessionId: analyticsSession
        })
      });

      if (paymentRes.ok) {
        var payload = await paymentRes.json();
        payment = payload.payment || null;
      }
    }

    return {
      order: order,
      payment: payment,
      checkoutUrl: payment && payment.checkoutUrl ? payment.checkoutUrl : ''
    };
  } catch (error) {
    console.error('Erreur:', error);
    return null;
  }
}


function quickOrder(productId, event) {
  if (event) event.stopPropagation();
  
  var product = allProducts.find(function(p) { return p.id === productId; });
  if (!product || !vendeurData) return;
  
  var message = 'Bonjour ! Je suis interesse(e) par :\n\n* ' + product.nom + '*\nPrix : ' + product.prix + ' FCFA\n\nPouvez-vous me donner plus d\'informations ?';
  
  var url = 'https://wa.me/' + vendeurData.tel.replace(/\s/g, '') + '?text=' + encodeURIComponent(message);
  window.open(url, '_blank');
}

function showSkeletonLoader() {
  var container = document.getElementById('productsContainer');
  var grid = document.createElement('div');
  grid.className = 'products-grid';

  var skeletonHTML = `
    <div class="skeleton-card shimmer">
      <div class="skeleton-image"></div>
      <div class="skeleton-info">
        <div class="skeleton-title"></div>
        <div class="skeleton-text"></div>
        <div class="skeleton-text w-50"></div>
        <div class="skeleton-footer">
          <div class="skeleton-price"></div>
          <div class="skeleton-btn"></div>
        </div>
      </div>
    </div>
  `;

  // RÃ©pÃ©ter le squelette pour simuler une grille
  for (var i = 0; i < 6; i++) {
    grid.innerHTML += skeletonHTML;
  }

  container.innerHTML = '';
  container.appendChild(grid);
}


async function loadShop() {
  showSkeletonLoader();
  try {
    // --- MODE DÃ‰MO : DonnÃ©es fictives si l'URL est /demo ---
    if (slug === 'demo' || window.location.search.includes('demo=true')) {
      var demoThemes = ['business-gold', 'business-midnight', 'light-modern', 'dark-blue'];
      var randomTheme = demoThemes[Math.floor(Math.random() * demoThemes.length)];

      vendeurData = {
        id: 'demo',
        boutique: "Boutique DÃ©mo WhaBiz",
        tel: "22600000000",
        slug: "demo",
        plan: "business", // La dÃ©mo a accÃ¨s Ã  tout
        theme: randomTheme,
        produits: "Bienvenue ! Ceci est une boutique de dÃ©monstration. Testez l'ajout au panier et la commande WhatsApp."
      };

      allProducts = [
        { id: 1, nom: "Montre Chrono Luxe", prix: 25000, categorie: "Accessoires", image: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=600", description: "Montre Ã©lÃ©gante, bracelet cuir." },
        { id: 2, nom: "Sneakers Urban", prix: 18500, categorie: "Mode", image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600", description: "Confortables et stylÃ©es pour la ville." },
        { id: 3, nom: "Casque Audio Pro", prix: 35000, categorie: "Ã‰lectronique", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600", description: "RÃ©duction de bruit active." },
        { id: 4, nom: "Sac Ã  dos Voyage", prix: 12000, categorie: "Accessoires", image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600", description: "RÃ©sistant Ã  l'eau, grande capacitÃ©." },
        { id: 5, nom: "Lunettes Soleil", prix: 8000, categorie: "Mode", image: "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600", description: "Protection UV400." },
        { id: 6, nom: "CrÃ¨me Visage Bio", prix: 6500, categorie: "BeautÃ©", image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600", description: "IngrÃ©dients 100% naturels." }
      ];

      allReviews = [
        { productId: 1, clientNom: "Marc", rating: 5, comment: "Superbe qualitÃ© !", dateAvis: new Date().toISOString() },
        { productId: 3, clientNom: "Sophie", rating: 4, comment: "Bon son, mais un peu lourd.", dateAvis: new Date().toISOString() }
      ];

      document.getElementById('pageTitle').textContent = vendeurData.boutique;
      document.getElementById('headerShopName').textContent = vendeurData.boutique;
      document.getElementById('shopNameDisplay').textContent = vendeurData.boutique;
      document.getElementById('footerShopName').textContent = vendeurData.boutique;
      document.getElementById('shopDescription').textContent = vendeurData.produits;

      // --- Plan Badge Logic (Demo) ---
      // Pour la dÃ©mo, on choisit une mise en page au hasard
      var demoLayouts = ['grid', 'list'];
      vendeurData.shopLayout = demoLayouts[Math.floor(Math.random() * demoLayouts.length)];


      var plan = vendeurData.plan || 'starter';
      if (plan === 'pro' || plan === 'business') {
          var badgeText = plan.toUpperCase();
          var badgeClass = plan + '-badge';
          var headerName = document.getElementById('headerShopName');
          if (headerName && !headerName.parentNode.querySelector('.plan-badge')) {
              var headerBadge = document.createElement('span');
              headerBadge.textContent = badgeText;
              headerBadge.className = 'plan-badge ' + badgeClass;
              headerName.parentNode.appendChild(headerBadge);
          }
          var mainTitle = document.getElementById('shopNameDisplay');
          if (mainTitle && !mainTitle.querySelector('.plan-badge')) {
              var mainBadge = document.createElement('span');
              mainBadge.textContent = badgeText;
              mainBadge.className = 'plan-badge ' + badgeClass;
              mainTitle.appendChild(mainBadge);
          }
      }
      
      if (vendeurData.theme) {
        document.documentElement.setAttribute('data-theme', vendeurData.theme);
      }

      var headerWA = document.getElementById('headerWhatsApp');
      headerWA.onclick = function() { alert("En mode dÃ©mo, le bouton WhatsApp simule l'ouverture."); };

      // Notification de bienvenue pour la dÃ©mo
      setTimeout(function() {
        var demoBanner = document.createElement('div');
        demoBanner.id = 'demoBanner';
        demoBanner.style.cssText = 'position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); width: 90%; max-width: 400px; background: rgba(17, 24, 39, 0.95); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 20px; border-radius: 16px; z-index: 10000; box-shadow: 0 20px 50px rgba(0,0,0,0.5); display: flex; gap: 16px; animation: slideUpDemo 0.6s cubic-bezier(0.16, 1, 0.3, 1);';
        demoBanner.innerHTML = `
          <div style="font-size: 32px;">ðŸ‘‹</div>
          <div style="flex: 1;">
            <h3 style="margin: 0 0 4px 0; font-size: 18px; font-weight: 700; color: #fff;">Bienvenue sur la DÃ©mo</h3>
            <p style="margin: 0 0 12px 0; font-size: 14px; color: #9ca3af; line-height: 1.4;">Ceci est une boutique fictive pour tester l'interface. Aucune commande rÃ©elle ne sera effectuÃ©e.</p>
            <button onclick="document.getElementById('demoBanner').remove()" style="background: #10B981; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; transition: background 0.2s;">C'est notÃ© !</button>
          </div>
        `;
        document.body.appendChild(demoBanner);

        var style = document.createElement('style');
        style.textContent = '@keyframes slideUpDemo { from { transform: translate(-50%, 100px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }';
        document.head.appendChild(style);
      }, 1000);

      setupLayoutSwitcher(vendeurData.shopLayout || 'grid');
      displayProducts(allProducts);
      loadCartFromStorage();
      return;
    }

    var vendeurRes = await fetch('/api/vendeurs/slug/' + slug);
    if (!vendeurRes.ok) {
      showError('Boutique introuvable');
      return;
    }
    vendeurData = await vendeurRes.json();
    trackEvent('view_shop', { vendeurId: vendeurData.id, slug: slug });

    // --- AUTO-CONFIGURATION BUSINESS ---
    // Si c'est un compte Business et qu'aucun thÃ¨me n'est choisi, on met le thÃ¨me Gold par dÃ©faut
    if (!vendeurData.theme && vendeurData.plan === 'business') {
      vendeurData.theme = 'business-gold';
    }
    if (!vendeurData.shopLayout) {
      vendeurData.shopLayout = 'grid';
    }

    document.getElementById('pageTitle').textContent = vendeurData.boutique;
    document.getElementById('headerShopName').textContent = vendeurData.boutique;
    document.getElementById('shopNameDisplay').textContent = vendeurData.boutique;
    document.getElementById('footerShopName').textContent = vendeurData.boutique;
    
    if (vendeurData.produits) {
      document.getElementById('shopDescription').textContent = vendeurData.produits;
    }

    // --- Plan Badge Logic ---
    var plan = vendeurData.plan || 'starter';
    if (plan === 'pro' || plan === 'business') {
        var badgeText = plan.toUpperCase();
        var badgeClass = plan + '-badge';

        // Badge in header
        var headerName = document.getElementById('headerShopName');
        if (headerName && !headerName.parentNode.querySelector('.plan-badge')) {
            var headerBadge = document.createElement('span');
            headerBadge.textContent = badgeText;
            headerBadge.className = 'plan-badge ' + badgeClass;
            headerName.parentNode.appendChild(headerBadge);
        }

        // Badge in main title
        var mainTitle = document.getElementById('shopNameDisplay');
        if (mainTitle && !mainTitle.querySelector('.plan-badge')) {
            var mainBadge = document.createElement('span');
            mainBadge.textContent = badgeText;
            mainBadge.className = 'plan-badge ' + badgeClass;
            mainTitle.appendChild(mainBadge);
        }
    }

    
    // --- Logique des themes par plan ---
    var themeId = vendeurData.theme;
    if (!themeId || themeId === 'default') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('shopTheme_' + slug);
    } else {
      var plan = vendeurData.plan || 'starter';
      var allowed = false;

      var starterThemes = ['default', 'light-modern'];
      var proThemes = starterThemes.concat(['dark-blue', 'dark-purple', 'dark-orange', 'dark-red', 'dark-teal', 'light-blue']);
      var businessThemes = proThemes.concat(['business-gold', 'business-midnight']);

      if (plan === 'business' && businessThemes.includes(themeId)) allowed = true;
      else if (plan === 'pro' && proThemes.includes(themeId)) allowed = true;
      else if (plan === 'starter' && starterThemes.includes(themeId)) allowed = true;

      if (allowed) {
        document.documentElement.setAttribute('data-theme', themeId);
        localStorage.setItem('shopTheme_' + slug, themeId);
      } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem('shopTheme_' + slug);
      }
    }

    var headerWA = document.getElementById('headerWhatsApp');
    headerWA.onclick = function() {
      window.open('https://wa.me/' + vendeurData.tel.replace(/\s/g, ''), '_blank');
    };

    var produitsRes = await fetch('/api/products/vendeur/' + vendeurData.id);
    allProducts = await produitsRes.json();
    trackEvent('view_product', { count: allProducts.length });

    
    var reviewsRes = await fetch('/api/reviews/vendeur/' + vendeurData.id);
    allReviews = await reviewsRes.json();

    setupLayoutSwitcher(vendeurData.shopLayout);
    initFilters();
    displayProducts(allProducts);
    loadCartFromStorage();
    loadCartFromServer();

  } catch (error) {
    console.error('Erreur:', error);
    showError('Erreur lors du chargement');
  }
}

function setupLayoutSwitcher(defaultLayout) {
  var gridBtn = document.getElementById('gridViewBtn');
  var listBtn = document.getElementById('listViewBtn');
  var container = document.getElementById('productsContainer');

  currentLayout = defaultLayout || 'grid';
  container.setAttribute('data-layout', currentLayout);

  if (currentLayout === 'list') {
    gridBtn.classList.remove('active');
    listBtn.classList.add('active');
  }

  gridBtn.onclick = function() {
    currentLayout = 'grid';
    container.setAttribute('data-layout', 'grid');
    gridBtn.classList.add('active');
    listBtn.classList.remove('active');
    displayProducts(allProducts);
  };
  listBtn.onclick = function() {
    currentLayout = 'list';
    container.setAttribute('data-layout', 'list');
    listBtn.classList.add('active');
    gridBtn.classList.remove('active');
    displayProducts(allProducts);
  };
}

function buildRatingMap() {
  var map = {};
  if (!Array.isArray(allReviews)) return map;
  allReviews.forEach(function(r) {
    var pid = r.productId;
    if (pid === undefined || pid === null) return;
    var rating = Number(r.rating);
    if (!Number.isFinite(rating)) return;
    if (!map[pid]) map[pid] = { sum: 0, count: 0 };
    map[pid].sum += rating;
    map[pid].count += 1;
  });
  return map;
}

function displayProducts(produits) {
  var container = document.getElementById('productsContainer');
  var count = document.getElementById('productsCount');
  createCategoryFilters(produits);

  var ratingMap = buildRatingMap();
  
  var filteredProducts = produits.filter(function(p) {
    var matchesCategory = selectedCategory === 'Toutes' || p.categorie === selectedCategory;
    var nameText = String(p.nom || '').toLowerCase();
    var descText = String(p.description || '').toLowerCase();
    var matchesSearch = !searchTerm || nameText.includes(searchTerm) || descText.includes(searchTerm);
    var price = Number(p.prix);
    if (Number.isFinite(minPrice) && price < minPrice) return false;
    if (Number.isFinite(maxPrice) && price > maxPrice) return false;
    if (inStockOnly && isOutOfStock(p)) return false;
    var stats = ratingMap[p.id];
    var avgRating = stats ? (stats.sum / stats.count) : 0;
    if (minRating > 0 && avgRating < minRating) return false;
    return matchesCategory && matchesSearch;
  });

  count.textContent = filteredProducts.length + ' produit(s)';

  if (filteredProducts.length === 0) {
    var msg = searchTerm ? 'Aucun resultat pour "' + searchTerm + '"' : 'Aucun produit dans cette categorie';
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">Recherche</div><h3>' + msg + '</h3><p>Essayez autre chose</p></div>';
    return;
  }

  var displayContainer = document.createElement('div');
  displayContainer.className = currentLayout === 'grid' ? 'products-grid' : 'products-list';

  filteredProducts.forEach(function(product) {
    var card = document.createElement('div');
    var outOfStock = isOutOfStock(product);
    card.className = 'product-card' + (outOfStock ? ' is-out-of-stock' : '');

    var images = product.images || (product.image ? [product.image] : []);
    var mainImage = images[0] || 'https://via.placeholder.com/400x300?text=Produit';

    
    var ratingStats = ratingMap[product.id] || { sum: 0, count: 0 };
    var avgRating = ratingStats.count ? (ratingStats.sum / ratingStats.count) : 0;

    var priceValue = Number(product.prix);
    if (!Number.isFinite(priceValue)) priceValue = 0;
    var oldPriceValue = Number(product.prixAvant);
    var hasPromo = Number.isFinite(oldPriceValue) && oldPriceValue > priceValue && priceValue > 0;
    var discountPct = hasPromo ? Math.round((1 - (priceValue / oldPriceValue)) * 100) : 0;

    var isNew = false;
    var pid = Number(product.id);
    if (Number.isFinite(pid) && pid > 1000000000000) {
      var ageDays = (Date.now() - pid) / 86400000;
      if (ageDays <= 7) isNew = true;
    }

    var imagesHtml = '<div class="product-images" onclick="openGallery(' + JSON.stringify(images).replace(/"/g, '&quot;') + ')">';
    imagesHtml += '<img src="' + mainImage + '" alt="' + product.nom + '" class="product-image" onerror="this.src=\'https://via.placeholder.com/400x300?text=Produit\'">';
    var badges = [];
    if (outOfStock) badges.push('<span class="badge badge-out">Rupture</span>');
    if (hasPromo && discountPct > 0) badges.push('<span class="badge badge-sale">-' + discountPct + '%</span>');
    if (isNew) badges.push('<span class="badge badge-new">Nouveau</span>');
    if (badges.length) {
      imagesHtml += '<div class="product-badges">' + badges.join('') + '</div>';
    }
    if (images.length > 1) {
      imagesHtml += '<div class="images-indicator">Photos ' + images.length + '</div>';
    }
    imagesHtml += '</div>';

    var infoHtml = '<div class="product-info">';
    infoHtml += '<div class="product-name">' + product.nom + '</div>';
    if (product.categorie) {
      infoHtml += '<div class="product-category">' + product.categorie + '</div>';
    }
    if (ratingStats.count > 0) {
      infoHtml += '<div class="product-rating">';
      infoHtml += '<span class="stars">' + getStars(avgRating) + '</span>';
      infoHtml += '<span class="rating-text">' + avgRating.toFixed(1) + ' (' + ratingStats.count + ' avis)</span>';
      infoHtml += '</div>';
    }
    
    infoHtml += '<div class="product-description">' + (product.description || 'Decouvrez ce produit') + '</div>';
    infoHtml += '<div class="product-footer">';
    infoHtml += '<div class="product-price-block"><div class="product-price">' + priceValue.toLocaleString() + ' FCFA</div>' + (hasPromo ? '<div class="product-price-old">' + oldPriceValue.toLocaleString() + ' FCFA</div>' : '') + '</div>';
    infoHtml += '<div class="product-actions">';
    infoHtml += '<button class="add-to-cart-btn' + (outOfStock ? ' is-disabled' : '') + '" ' + (outOfStock ? 'disabled ' : '') + 'onclick="addToCart(' + product.id + ', event)">' 
             + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>'
             + '<span>' + (outOfStock ? 'Indisponible' : 'Panier') + '</span></button>';
    infoHtml += '<button class="quick-order-btn" onclick="quickOrder(' + product.id + ', event)" title="Commander directement">'
             + '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>'
             + '<span>WhatsApp</span></button>';
    infoHtml += '</div>';
    infoHtml += '</div>';
    infoHtml += '<button class="review-btn" onclick="openReviewModal(' + product.id + ', \'' + product.nom.replace(/'/g, "\\'") + '\', event)">Laisser un avis</button>';
    infoHtml += '</div>';

    card.innerHTML = imagesHtml + infoHtml;
    displayContainer.appendChild(card);
  });

  container.innerHTML = '';
  container.appendChild(displayContainer);
}


function getStars(rating) {
  var stars = '';
  for (var i = 1; i <= 5; i++) {
    if (i <= Math.round(rating)) {
      stars += '*';
    } else {
      stars += '.';
    }
  }
  return stars;
}


function createCategoryFilters(produits) {
  var container = document.getElementById('categoryFilters');
  
  
  var categories = ['Toutes'];
  produits.forEach(function(p) {
    if (p.categorie && categories.indexOf(p.categorie) === -1) {
      categories.push(p.categorie);
    }
  });

  if (categories.length <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = '';

  categories.forEach(function(cat) {
    var btn = document.createElement('button');
    btn.className = 'category-filter-btn' + (cat === selectedCategory ? ' active' : '');
    btn.textContent = cat;
    btn.onclick = function() { filterByCategory(cat); };
    container.appendChild(btn);
  });
}

function filterByCategory(category) {
  selectedCategory = category;
  displayProducts(allProducts);
}

function filterProducts() {
  searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
  displayProducts(allProducts);
}

function initFilters() {
  if (filtersInitialized) return;
  var minInput = document.getElementById('minPriceInput');
  var maxInput = document.getElementById('maxPriceInput');
  var stockToggle = document.getElementById('inStockOnly');
  var ratingSelect = document.getElementById('minRating');
  var resetBtn = document.getElementById('resetFilters');

  if (!minInput || !maxInput || !stockToggle || !ratingSelect || !resetBtn) return;

  minInput.addEventListener('input', function() {
    var v = parseFloat(minInput.value);
    minPrice = Number.isFinite(v) ? v : null;
    displayProducts(allProducts);
  });
  maxInput.addEventListener('input', function() {
    var v = parseFloat(maxInput.value);
    maxPrice = Number.isFinite(v) ? v : null;
    displayProducts(allProducts);
  });
  stockToggle.addEventListener('change', function() {
    inStockOnly = !!stockToggle.checked;
    displayProducts(allProducts);
  });
  ratingSelect.addEventListener('change', function() {
    var v = parseInt(ratingSelect.value, 10);
    minRating = Number.isFinite(v) ? v : 0;
    displayProducts(allProducts);
  });
  resetBtn.addEventListener('click', function() {
    minInput.value = '';
    maxInput.value = '';
    stockToggle.checked = false;
    ratingSelect.value = '0';
    minPrice = null;
    maxPrice = null;
    inStockOnly = false;
    minRating = 0;
    displayProducts(allProducts);
  });

  filtersInitialized = true;
}


function openGallery(images) {
  currentGalleryImages = images;
  currentGalleryIndex = 0;
  updateGalleryDisplay();
  document.getElementById('galleryModal').classList.add('show');
}

function closeGallery() {
  document.getElementById('galleryModal').classList.remove('show');
}

function prevImage() {
  currentGalleryIndex = (currentGalleryIndex - 1 + currentGalleryImages.length) % currentGalleryImages.length;
  updateGalleryDisplay();
}

function nextImage() {
  currentGalleryIndex = (currentGalleryIndex + 1) % currentGalleryImages.length;
  updateGalleryDisplay();
}

function goToImage(index) {
  currentGalleryIndex = index;
  updateGalleryDisplay();
}

function updateGalleryDisplay() {
  document.getElementById('galleryImage').src = currentGalleryImages[currentGalleryIndex];
  document.getElementById('galleryCounter').textContent = (currentGalleryIndex + 1) + ' / ' + currentGalleryImages.length;

  var thumbsContainer = document.getElementById('galleryThumbs');
  thumbsContainer.innerHTML = '';

  currentGalleryImages.forEach(function(img, index) {
    var thumb = document.createElement('div');
    thumb.className = 'gallery-thumb' + (index === currentGalleryIndex ? ' active' : '');
    thumb.onclick = function() { goToImage(index); };
    thumb.innerHTML = '<img src="' + img + '" alt="Image ' + (index + 1) + '">';
    thumbsContainer.appendChild(thumb);
  });
}

function showError(msg) {
  var container = document.getElementById('productsContainer');
  container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">Erreur</div><h3>' + msg + '</h3><p>Veuillez reessayer plus tard</p></div>';
}


document.addEventListener('keydown', function(e) {
  if (document.getElementById('galleryModal').classList.contains('show')) {
    if (e.key === 'ArrowLeft') prevImage();
    if (e.key === 'ArrowRight') nextImage();
    if (e.key === 'Escape') closeGallery();
  }
  if (document.getElementById('cartModal').classList.contains('show')) {
    if (e.key === 'Escape') closeCart();
  }
  if (document.getElementById('reviewModal') && document.getElementById('reviewModal').classList.contains('show')) {
    if (e.key === 'Escape') closeReviewModal();
  }
});


document.getElementById('cartModal').addEventListener('click', function(e) {
  if (e.target.id === 'cartModal') {
    closeCart();
  }
});


var currentReviewProductId = null;
var currentReviewProductName = '';

function openReviewModal(productId, productName, event) {
  if (event) event.stopPropagation();
  currentReviewProductId = productId;
  currentReviewProductName = productName;
  
  
  if (!document.getElementById('reviewModal')) {
    createReviewModal();
  }
  
  document.getElementById('reviewProductName').textContent = productName;
  document.getElementById('reviewModal').classList.add('show');
  
  
  loadProductReviews(productId);
}

function closeReviewModal() {
  if (document.getElementById('reviewModal')) {
    document.getElementById('reviewModal').classList.remove('show');
  }
}

function createReviewModal() {
  var modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'reviewModal';
  modal.innerHTML = '<div class="modal-content" style="max-width: 600px;"><div class="modal-header"><h3 class="modal-title">Avis sur <span id="reviewProductName"></span></h3><button class="modal-close" onclick="closeReviewModal()">X</button></div><div id="reviewsContent"><div class="review-form"><h4 style="margin-bottom: 16px; font-size: 18px;">Laisser votre avis</h4><div class="form-group"><label class="form-label">Votre nom</label><input type="text" class="form-input" id="reviewName" placeholder="Votre nom"></div><div class="form-group"><label class="form-label">Note</label><div class="rating-input" id="ratingInput"></div></div><div class="form-group"><label class="form-label">Commentaire</label><textarea class="form-textarea" id="reviewComment" placeholder="Partagez votre experience..."></textarea></div><button class="btn btn-primary" style="width: 100%;" onclick="submitReview()">Publier l\'avis</button></div><div class="reviews-list" id="reviewsList" style="margin-top: 32px;"></div></div></div>';
  document.body.appendChild(modal);
  
  
  var ratingInput = document.getElementById('ratingInput');
  for (var i = 1; i <= 5; i++) {
    var star = document.createElement('span');
    star.className = 'rating-star';
    star.textContent = '.';
    star.dataset.rating = i;
    star.onclick = function() { selectRating(this.dataset.rating); };
    ratingInput.appendChild(star);
  }
  
  
  modal.addEventListener('click', function(e) {
    if (e.target.id === 'reviewModal') {
      closeReviewModal();
    }
  });
}

var selectedRating = 5;

function selectRating(rating) {
  selectedRating = parseInt(rating);
  var stars = document.querySelectorAll('.rating-star');
  stars.forEach(function(star, index) {
    if (index < selectedRating) {
      star.textContent = '*';
    } else {
      star.textContent = '.';
    }
  });
}

async function submitReview() {
  var name = document.getElementById('reviewName').value.trim();
  var comment = document.getElementById('reviewComment').value.trim();
  
  if (!name) {
    alert('Veuillez entrer votre nom');
    return;
  }
  
  if (!comment) {
    alert('Veuillez ecrire un commentaire');
    return;
  }
  
  try {
    var res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: currentReviewProductId,
        vendeurId: vendeurData.id,
        clientNom: name,
        rating: selectedRating,
        comment: comment
      })
    });
    
    if (res.ok) {
      showNotification('Avis publie avec succes !');
      document.getElementById('reviewName').value = '';
      document.getElementById('reviewComment').value = '';
      selectRating(5);
      
      
      var reviewsRes = await fetch('/api/reviews/vendeur/' + vendeurData.id);
      allReviews = await reviewsRes.json();
      displayProducts(allProducts);
      loadProductReviews(currentReviewProductId);
    } else {
      alert('Erreur lors de la publication');
    }
  } catch (error) {
    console.error('Erreur:', error);
    alert('Erreur de connexion');
  }
}

function loadProductReviews(productId) {
  var reviews = allReviews.filter(function(r) { return r.productId === productId; });
  var container = document.getElementById('reviewsList');
  
  if (reviews.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 40px; color: rgba(255,255,255,.5);">Aucun avis pour le moment. Soyez le premier !</div>';
    return;
  }
  
  container.innerHTML = '<h4 style="margin-bottom: 16px; font-size: 18px;">Avis des clients (' + reviews.length + ')</h4>';
  
  reviews.forEach(function(review) {
    var date = new Date(review.dateAvis).toLocaleDateString('fr-FR');
    var reviewDiv = document.createElement('div');
    reviewDiv.style.cssText = 'padding: 16px; background: rgba(255,255,255,.05); border-radius: 12px; margin-bottom: 12px;';
    reviewDiv.innerHTML = '<div style="display: flex; justify-content: space-between; margin-bottom: 8px;"><strong>' + review.clientNom + '</strong><span style="color: rgba(255,255,255,.6); font-size: 13px;">' + date + '</span></div><div style="margin-bottom: 8px;">' + getStars(review.rating) + '</div><div style="color: rgba(255,255,255,.8);">' + review.comment + '</div>';
    container.appendChild(reviewDiv);
  });
}
