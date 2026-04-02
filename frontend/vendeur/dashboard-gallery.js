var vendeurId = null;
var vendeurData = null;
var currentProducts = [];
var productImages = []; 
var productVariants = [];
var variantIdCounter = 1;
var apiFetch = window.authFetch || fetch;

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function checkAuth() {
  vendeurId = localStorage.getItem('vendeurId');
  var vendeurNom = localStorage.getItem('vendeurNom');
  var vendeurBoutique = localStorage.getItem('vendeurBoutique');

  if (!vendeurId) {
    window.location.href = '/vendeur';
    return false;
  }

  document.getElementById('vendeurNom').textContent = vendeurNom;
  document.getElementById('shopName').textContent = vendeurBoutique;

  return true;
}

async function loadData() {
  if (!checkAuth()) return;

  try {
    var vendeurRes = await apiFetch('/api/vendeurs/' + vendeurId);
    vendeurData = await vendeurRes.json();
    localStorage.setItem('vendeurSlug', vendeurData.slug || '');

    document.getElementById('planActuel').textContent = vendeurData.plan.toUpperCase();
    document.getElementById('shopLink').textContent = '/' + vendeurData.slug;
    document.getElementById('viewShop').href = '/' + vendeurData.slug;
    var shopVisitLink = document.getElementById('shopVisitLink');
    if (shopVisitLink) {
      shopVisitLink.href = '/' + vendeurData.slug;
    }
    var shopLinkCard = document.getElementById('shopLinkCard');
    if (shopLinkCard) {
      shopLinkCard.href = '/' + vendeurData.slug;
    }
    var produitsRes = await apiFetch('/api/products/vendeur/' + vendeurId);
    currentProducts = await produitsRes.json();

    document.getElementById('totalProduits').textContent = currentProducts.length;

    // Ajout du bouton de paramètres et du modal
    displayProducts();
    handleDashboardEntryAction();

  } catch (error) {
    console.error('Erreur:', error);
    alert('Erreur lors du chargement des données');
  }
}

function handleDashboardEntryAction() {
  try {
    var params = new URLSearchParams(window.location.search || '');
    if (params.get('action') !== 'add-product') return;
    openAddModal();
    params.delete('action');
    params.delete('source');
    var next = window.location.pathname + (params.toString() ? ('?' + params.toString()) : '') + (window.location.hash || '');
    window.history.replaceState({}, '', next);
  } catch (error) {}
}

function injectSettingsButton() {
    var headerActions = document.querySelector('.header-actions');
    if (!headerActions || document.getElementById('settingsBtn')) return;
    headerActions.insertAdjacentHTML('afterbegin', '<button id="settingsBtn" class="btn btn-secondary" onclick="openSettingsModal()">⚙️ Paramètres</button>');
}

function getShopUrl() {
  if (!vendeurData || !vendeurData.slug) return '';
  return window.location.origin + '/' + vendeurData.slug;
}

async function copyShopLink() {
  var shopUrl = getShopUrl();
  if (!shopUrl) {
    alert('Lien boutique indisponible pour le moment.');
    return;
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(shopUrl);
      alert('Lien boutique copie.');
      return;
    }
  } catch (error) {}
  window.prompt('Copiez le lien de votre boutique', shopUrl);
}

function shareShopOnWhatsApp() {
  var shopUrl = getShopUrl();
  if (!shopUrl) {
    alert('Lien boutique indisponible pour le moment.');
    return;
  }
  var shopName = vendeurData && vendeurData.boutique ? vendeurData.boutique : 'ma boutique';
  var message = 'Bonjour 👋 Voici ma boutique ' + shopName + ' sur WhaBiz : ' + shopUrl;
  window.open('https://wa.me/?text=' + encodeURIComponent(message), '_blank');
}

function displayProducts() {
  var container = document.getElementById('productsContainer');

  if (currentProducts.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>Aucun produit. Ajoutez-en un !</p></div>';
    return;
  }

  var grid = document.createElement('div');
  grid.className = 'products-grid';

  currentProducts.forEach(function(product) {
    var card = document.createElement('div');
    card.className = 'product-card';

    var mainImage = product.image || (product.images && product.images[0]) || 'https://via.placeholder.com/300x200?text=Produit';
    var imageCount = (product.images && product.images.length) || (product.image ? 1 : 0);
    var categorie = product.categorie || 'Non categorise';
    var stockValue = Number.isFinite(Number(product.stock)) ? Number(product.stock) : 0;
    var thresholdValue = Number.isFinite(Number(product.lowStockThreshold)) ? Number(product.lowStockThreshold) : 3;
    var variantsCount = Array.isArray(product.variants) ? product.variants.length : 0;
    var stockClass = stockValue <= thresholdValue ? 'stock-low' : '';
    var escapedName = escapeHtml(product.nom || 'Produit');
    var escapedCategory = escapeHtml(categorie);
    var escapedMainImage = escapeHtml(mainImage);
    var displayPrice = Number(product.prix || 0).toLocaleString('fr-FR');
    var imageBadge = imageCount > 1 ? imageCount + ' images' : imageCount + ' image';
    var variantsBadge = variantsCount ? '<span class="product-variant-badge">' + variantsCount + ' variantes</span>' : '';

    card.innerHTML = ''
      + '<div class="product-card__media">'
      +   '<img src="' + escapedMainImage + '" alt="' + escapedName + '" class="product-image" loading="lazy" onerror="this.src=\'https://via.placeholder.com/300x200?text=Produit\'">'
      +   '<div class="product-media-badges"><span class="product-media-badge">' + imageBadge + '</span></div>'
      + '</div>'
      + '<div class="product-info">'
      +   '<div class="product-info-top">'
      +     '<div class="product-category">' + escapedCategory + '</div>'
      +     variantsBadge
      +   '</div>'
      +   '<div class="product-name">' + escapedName + '</div>'
      +   '<div class="product-price-row">'
      +     '<div class="product-price">' + displayPrice + ' FCFA</div>'
      +     '<span class="product-stock-pill ' + stockClass + '">' + stockValue + ' en stock</span>'
      +   '</div>'
      +   '<div class="product-meta"><span>Seuil: ' + thresholdValue + '</span></div>'
      +   '<div class="product-actions"><button class="btn btn-secondary btn-sm" onclick="editProduct(' + product.id + ')">Modifier</button><button class="btn btn-danger btn-sm" onclick="deleteProduct(' + product.id + ')">Supprimer</button></div>'
      + '</div>';

    grid.appendChild(card);
  });

  container.innerHTML = '';
  container.appendChild(grid);
}

function generateVariantId() {
  return 'v-' + Date.now() + '-' + (variantIdCounter++);
}

function normalizeStockValue(value) {
  var parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function refreshStockFromVariants() {
  var stockInput = document.getElementById('productStock');
  var hint = document.getElementById('stockHint');
  if (!stockInput) return;
  if (productVariants.length > 0) {
    var total = productVariants.reduce(function(sum, variant) {
      return sum + normalizeStockValue(variant.stock);
    }, 0);
    stockInput.value = total;
    stockInput.readOnly = true;
    stockInput.dataset.auto = '1';
    if (hint) hint.textContent = 'Stock total calcule depuis les variantes.';
  } else {
    stockInput.readOnly = false;
    stockInput.dataset.auto = '0';
    if (hint) hint.textContent = 'Renseignez le stock total disponible.';
  }
}

function renderVariants() {
  var list = document.getElementById('variantsList');
  if (!list) return;
  list.innerHTML = '';
  if (!productVariants.length) {
    refreshStockFromVariants();
    return;
  }
  productVariants.forEach(function(variant, index) {
    var row = document.createElement('div');
    row.className = 'variant-row';

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'form-input';
    nameInput.placeholder = 'Nom variante';
    nameInput.value = variant.name || '';
    nameInput.addEventListener('input', function() {
      productVariants[index].name = this.value;
    });

    var stockInput = document.createElement('input');
    stockInput.type = 'number';
    stockInput.className = 'form-input';
    stockInput.min = '0';
    stockInput.step = '1';
    stockInput.placeholder = 'Stock';
    stockInput.value = normalizeStockValue(variant.stock);
    stockInput.addEventListener('input', function() {
      productVariants[index].stock = normalizeStockValue(this.value);
      refreshStockFromVariants();
    });

    var idInput = document.createElement('input');
    idInput.type = 'text';
    idInput.className = 'form-input variant-id-input';
    idInput.placeholder = 'ID (optionnel)';
    idInput.value = variant.id || '';
    idInput.addEventListener('input', function() {
      productVariants[index].id = this.value;
    });

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-danger btn-sm';
    removeBtn.textContent = 'Retirer';
    removeBtn.addEventListener('click', function() {
      productVariants.splice(index, 1);
      renderVariants();
    });

    row.appendChild(nameInput);
    row.appendChild(stockInput);
    row.appendChild(idInput);
    row.appendChild(removeBtn);
    list.appendChild(row);
  });

  refreshStockFromVariants();
}

function addVariant() {
  productVariants.push({ id: generateVariantId(), name: '', stock: 0 });
  renderVariants();
}

function getVariantsPayload() {
  if (!productVariants.length) return [];
  var out = [];
  productVariants.forEach(function(variant, index) {
    var name = String(variant.name || '').trim();
    if (!name) return;
    var id = String(variant.id || '').trim();
    if (!id) id = 'v-' + (index + 1);
    out.push({ id: id, name: name, stock: normalizeStockValue(variant.stock) });
  });
  return out;
}

function renderStockHistory(history) {
  var block = document.getElementById('stockHistoryBlock');
  var list = document.getElementById('stockHistoryList');
  if (!block || !list) return;
  var items = Array.isArray(history) ? history.slice() : [];
  if (!items.length) {
    block.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  items.sort(function(a, b) {
    return new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime();
  });
  items = items.slice(0, 30);
  block.style.display = 'block';
  list.innerHTML = items.map(function(item) {
    var before = Number.isFinite(Number(item.previous)) ? Number(item.previous) : '-';
    var after = Number.isFinite(Number(item.next)) ? Number(item.next) : '-';
    var deltaValue = Number.isFinite(Number(item.delta)) ? Number(item.delta) : null;
    if (deltaValue === null && Number.isFinite(Number(before)) && Number.isFinite(Number(after))) {
      deltaValue = Number(after) - Number(before);
    }
    var deltaLabel = deltaValue === null ? '' : ' (' + (deltaValue > 0 ? '+' : '') + deltaValue + ')';
    var reason = String(item.reason || 'update').replace(/_/g, ' ');
    var orderLabel = item.orderId ? ' | Commande #' + item.orderId : '';
    var target = item.variantName ? 'Variante ' + item.variantName : 'Stock produit';
    var dateObj = item.at ? new Date(item.at) : null;
    var dateLabel = dateObj && !isNaN(dateObj.getTime()) ? dateObj.toLocaleString('fr-FR') : 'Date inconnue';
    return '' +
      '<div class="stock-history-item">' +
        '<div>' +
          '<div>' + target + ': ' + before + ' -> ' + after + deltaLabel + '</div>' +
          '<div class="stock-history-meta">' + reason + orderLabel + '</div>' +
        '</div>' +
        '<div>' + dateLabel + '</div>' +
      '</div>';
  }).join('');
}

function openAddModal() {
  document.getElementById('modalTitle').textContent = 'Ajouter un produit';
  document.getElementById('productForm').reset();
  document.getElementById('productId').value = '';
  document.getElementById('productPrixAvant').value = '';
  document.getElementById('productStock').value = 0;
  var thresholdInput = document.getElementById('productLowStockThreshold');
  if (thresholdInput) thresholdInput.value = 3;
  productVariants = [];
  productImages = [];
  updateGalleryDisplay();
  renderVariants();
  renderStockHistory([]);
  document.getElementById('productModal').classList.add('show');
}

function editProduct(id) {
  var product = currentProducts.find(function(p) { return p.id === id; });
  if (!product) return;

  document.getElementById('modalTitle').textContent = 'Modifier le produit';
  document.getElementById('productId').value = product.id;
  document.getElementById('productCategorie').value = product.categorie || 'Autre';
  document.getElementById('productNom').value = product.nom;
  document.getElementById('productDescription').value = product.description || '';
  document.getElementById('productPrix').value = product.prix;
  document.getElementById('productPrixAvant').value = Number.isFinite(Number(product.prixAvant)) ? Number(product.prixAvant) : '';
  document.getElementById('productStock').value = Number.isFinite(Number(product.stock)) ? Number(product.stock) : 0;
  var lowStockInput = document.getElementById('productLowStockThreshold');
  if (lowStockInput) {
    lowStockInput.value = Number.isFinite(Number(product.lowStockThreshold)) ? Number(product.lowStockThreshold) : 3;
  }

  productVariants = Array.isArray(product.variants) ? product.variants.map(function(variant, index) {
    return {
      id: String((variant && variant.id) || ('v-' + (index + 1))),
      name: String((variant && (variant.name || variant.nom)) || ''),
      stock: normalizeStockValue(variant && variant.stock)
    };
  }) : [];


  productImages = [];
  if (product.images && product.images.length > 0) {
    productImages = product.images.slice();
  } else if (product.image) {
    productImages = [product.image];
  }

  updateGalleryDisplay();
  renderVariants();
  renderStockHistory(product.stockHistory || []);
  document.getElementById('productModal').classList.add('show');
}

function closeModal() {
  document.getElementById('productModal').classList.remove('show');
}


function updateGalleryDisplay() {
  var gallery = document.getElementById('galleryGrid');
  var count = document.getElementById('imagesCount');
  var uploadZone = document.getElementById('uploadZone');
  
  count.textContent = productImages.length + '/5 images';
  
  if (productImages.length >= 5) {
    uploadZone.style.display = 'none';
  } else {
    uploadZone.style.display = 'block';
  }
  
  gallery.innerHTML = '';
  
  productImages.forEach(function(url, index) {
    var item = document.createElement('div');
    item.className = 'gallery-item';
    
    var img = document.createElement('img');
    img.src = url;
    img.alt = 'Image ' + (index + 1);
    
    var removeBtn = document.createElement('button');
    removeBtn.className = 'gallery-item-remove';
    removeBtn.textContent = '×';
    removeBtn.type = 'button';
    removeBtn.onclick = function() { removeImageFromGallery(index); };
    
    item.appendChild(img);
    item.appendChild(removeBtn);
    
    if (index === 0) {
      var mainBadge = document.createElement('div');
      mainBadge.className = 'gallery-item-main';
      mainBadge.textContent = '★ Principale';
      item.appendChild(mainBadge);
    }
    
    gallery.appendChild(item);
  });
}

function removeImageFromGallery(index) {
  productImages.splice(index, 1);
  updateGalleryDisplay();
}


var imageInput = document.getElementById('imageInput');
var uploadZone = document.getElementById('uploadZone');
var addVariantBtn = document.getElementById('addVariantBtn');

if (addVariantBtn) {
  addVariantBtn.addEventListener('click', addVariant);
}

imageInput.addEventListener('change', function(e) {
  var files = Array.from(e.target.files);
  uploadMultipleImages(files);
});

uploadZone.addEventListener('dragover', function(e) {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', function(e) {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', function(e) {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  var files = Array.from(e.dataTransfer.files).filter(function(f) {
    return f.type.startsWith('image/');
  });
  uploadMultipleImages(files);
});

async function uploadMultipleImages(files) {
  var remaining = 5 - productImages.length;
  
  if (remaining <= 0) {
    alert('Maximum 5 images par produit');
    return;
  }
  
  if (files.length > remaining) {
    alert('Vous ne pouvez ajouter que ' + remaining + ' image(s) supplémentaire(s)');
    files = files.slice(0, remaining);
  }
  
  for (var i = 0; i < files.length; i++) {
    await uploadSingleImage(files[i]);
  }
}

async function uploadSingleImage(file) {
  var formData = new FormData();
  formData.append('image', file);

  try {
    var res = await apiFetch('/api/upload/product-image', {
      method: 'POST',
      body: formData
    });

    var data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Erreur lors de l\'upload');
      return;
    }

    productImages.push(data.imageUrl);
    updateGalleryDisplay();

  } catch (error) {
    console.error('Erreur upload:', error);
    alert('Erreur lors de l\'upload');
  }
}

document.getElementById('productForm').addEventListener('submit', async function(e) {
  e.preventDefault();

  if (productImages.length === 0) {
    alert('Ajoutez au moins une image');
    return;
  }

  var productId = document.getElementById('productId').value;
  var prixAvantValue = parseInt(document.getElementById('productPrixAvant').value, 10);
  var variantsPayload = getVariantsPayload();
  var stockValue = normalizeStockValue(document.getElementById('productStock').value || '0');
  if (variantsPayload.length) {
    stockValue = variantsPayload.reduce(function(sum, variant) {
      return sum + normalizeStockValue(variant.stock);
    }, 0);
  }
  var lowStockValue = parseInt(document.getElementById('productLowStockThreshold').value, 10);
  lowStockValue = Number.isFinite(lowStockValue) && lowStockValue >= 0 ? lowStockValue : null;
  var data = {
    nom: document.getElementById('productNom').value,
    categorie: document.getElementById('productCategorie').value,
    description: document.getElementById('productDescription').value,
    prix: parseInt(document.getElementById('productPrix').value),
    prixAvant: Number.isFinite(prixAvantValue) && prixAvantValue > 0 ? prixAvantValue : null,
    stock: stockValue,
    lowStockThreshold: lowStockValue,
    variants: variantsPayload,
    image: productImages[0], 
    images: productImages, 
    vendeurId: parseInt(vendeurId)
  };
  if (Number.isFinite(data.prixAvant) && Number.isFinite(data.prix) && data.prixAvant <= data.prix) {
    data.prixAvant = null;
  }

  try {
    var res;
    if (productId) {
      res = await apiFetch('/api/products/' + productId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } else {
      res = await apiFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }

    if (res.ok) {
      alert(productId ? 'Produit modifié !' : 'Produit ajouté !');
      closeModal();
      loadData();
    } else {
      alert('Erreur lors de l\'enregistrement');
    }

  } catch (error) {
    console.error('Erreur:', error);
    alert('Erreur de connexion');
  }
});

async function deleteProduct(id) {
  if (!confirm('Supprimer ce produit ?')) return;

  try {
    var res = await apiFetch('/api/products/' + id, { method: 'DELETE' });
    if (res.ok) {
      alert('Produit supprimé');
      loadData();
    }
  } catch (error) {
    alert('Erreur lors de la suppression');
  }
}

function logout() {
  localStorage.removeItem('vendeurToken');
  localStorage.removeItem('vendeurId');
  localStorage.removeItem('vendeurNom');
  localStorage.removeItem('vendeurBoutique');
  window.location.href = '/vendeur';
}


document.getElementById('productModal').addEventListener('click', function(e) {
  if (e.target.id === 'productModal') {
    closeModal();
  }
});


// --- Section Paramètres de la boutique ---
// NOTE: Idéalement, ce code serait dans son propre fichier JS pour une page de paramètres dédiée.

function createSettingsModal() {
  if (document.getElementById('settingsModal')) return;

  var themes = [
    { id: 'default', name: 'Émeraude (Défaut)' },
    { id: 'light-modern', name: 'Luxe Minimaliste' },
    { id: 'dark-blue', name: 'Saphir' },
    { id: 'dark-purple', name: 'Améthyste' },
    { id: 'dark-orange', name: 'Bronze' },
    { id: 'dark-red', name: 'Rubis' },
    { id: 'dark-teal', name: 'Océan' },
    { id: 'light-blue', name: 'Ciel' },
    { id: 'business-gold', name: 'Business Gold 👑' },
    { id: 'business-midnight', name: 'Business Midnight 👑' }
  ];

  var themeOptions = themes.map(function(t) {
    return '<option value="' + t.id + '">' + t.name + '</option>';
  }).join('');

  var modalHTML = `
    <div class="modal" id="settingsModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Paramètres de la boutique</h3>
          <button class="modal-close" onclick="closeSettingsModal()">×</button>
        </div>
        <div class="modal-body">
          <form id="settingsForm">
            <div class="form-group">
              <label for="shopTheme">Thème de la boutique</label>
              <select id="shopTheme" class="form-control">${themeOptions}</select>
              <small>Les thèmes 👑 sont réservés au plan Business.</small>
            </div>
            <div class="form-group">
              <label>Mise en page des produits</label>
              <div class="radio-group">
                <label><input type="radio" name="shopLayout" value="grid" checked><span>Grille</span></label>
                <label><input type="radio" name="shopLayout" value="list"><span>Liste</span></label>
              </div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" onclick="closeSettingsModal()">Annuler</button>
              <button type="submit" class="btn btn-primary">Enregistrer</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  document.getElementById('settingsModal').addEventListener('click', function(e) {
    if (e.target.id === 'settingsModal') {
      closeSettingsModal();
    }
  });

  document.getElementById('settingsForm').addEventListener('submit', saveSettings);

  // Gérer le style des radio buttons
  var radios = document.querySelectorAll('input[name="shopLayout"]');
  radios.forEach(function(radio) {
    radio.addEventListener('change', function() {
      updateRadioLabels();
    });
  });
}

function openSettingsModal() {
  if (!vendeurData) return;

  // Remplir avec les valeurs actuelles
  document.getElementById('shopTheme').value = vendeurData.theme || 'default';
  var layout = vendeurData.shopLayout || 'grid';
  document.querySelector('input[name="shopLayout"][value="' + layout + '"]').checked = true;
  updateRadioLabels();

  document.getElementById('settingsModal').classList.add('show');
}

function updateRadioLabels() {
  var radios = document.querySelectorAll('input[name="shopLayout"]');
  radios.forEach(function(radio) {
    var label = radio.closest('label');
    if (label) label.classList.toggle('active', radio.checked);
  });
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.remove('show');
}

async function saveSettings(e) {
  e.preventDefault();

  var selectedTheme = document.getElementById('shopTheme').value;
  var selectedLayout = document.querySelector('input[name="shopLayout"]:checked').value;

  var dataToUpdate = {
    theme: selectedTheme,
    shopLayout: selectedLayout
  };

  try {
    var res = await apiFetch('/api/vendeurs/' + vendeurId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dataToUpdate)
    });

    if (res.ok) {
      // Mettre à jour les données locales
      vendeurData.theme = selectedTheme;
      vendeurData.shopLayout = selectedLayout;
      
      // Mettre à jour le lien de la boutique pour refléter le nouveau thème
      var shopLink = document.getElementById('viewShop');
      var url = new URL(shopLink.href);
      url.searchParams.set('theme_preview', selectedTheme); // Ajoute un param pour forcer le rafraîchissement du thème
      shopLink.href = url.toString();

      alert('Paramètres enregistrés !');
      closeSettingsModal();
    } else {
      var error = await res.json();
      alert('Erreur: ' + (error.error || 'Impossible d\'enregistrer les paramètres.'));
    }
  } catch (error) {
    console.error('Erreur sauvegarde paramètres:', error);
    alert('Erreur de connexion.');
  }
}

// --- Fin Section Paramètres ---

function injectSettingsModalStyles() {
  if (document.getElementById('dashboardSettingsModalStyles')) return;
  var style = document.createElement('style');
  style.id = 'dashboardSettingsModalStyles';
  style.textContent = `
    /* Styles for Settings Modal in Dashboard */
    .modal {
      display: none;
      position: fixed;
      z-index: 1050;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      overflow: auto;
      background-color: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(5px);
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    .modal.show {
      display: block;
      opacity: 1;
    }
    .modal-content {
      background-color: #1e293b; /* slate-800 */
      margin: 10% auto;
      padding: 24px;
      border: 1px solid #334155; /* slate-700 */
      width: 90%;
      max-width: 500px;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      color: #cbd5e1; /* slate-300 */
      transform: translateY(-20px);
      transition: transform 0.3s ease;
    }
    .modal.show .modal-content {
      transform: translateY(0);
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #334155;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .modal-header h3 {
      margin: 0;
      font-size: 20px;
      color: #fff;
    }
    .modal-close {
      background: transparent;
      border: none;
      font-size: 28px;
      color: #94a3b8; /* slate-400 */
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    .modal-close:hover {
      color: #fff;
    }
    .radio-group {
      display: flex;
      gap: 10px;
      background-color: #334155;
      padding: 6px;
      border-radius: 8px;
    }
    .radio-group label {
      flex: 1;
      text-align: center;
      padding: 8px 12px;
      margin: 0;
      border-radius: 6px;
      cursor: pointer;
      transition: all .2s;
      color: #cbd5e1;
      font-weight: 600;
    }
    .radio-group input[type="radio"] {
      display: none;
    }
    .radio-group label.active {
      background-color: #4f46e5; /* indigo-500 */
      color: #fff;
    }
  `;
  document.head.appendChild(style);
}


loadData();
