// MOT DE PASSE ADMIN - CHANGE-LE !
const ADMIN_PASSWORD = 'ZLP13.COM';

// Numéro WhatsApp
const WHATSAPP_NUMBER = '22654576629';

// Panier et mode admin
let cart = JSON.parse(localStorage.getItem('whaBizCart')) || [];
let isAdminMode = sessionStorage.getItem('adminMode') === 'true';
let editMode = false;
let editProductId = null;

// Basculer en mode admin
function toggleAdminMode() {
  if (isAdminMode) {
    // Déconnexion
    if (confirm('Voulez-vous vous deconnecter ?')) {
      sessionStorage.removeItem('adminMode');
      isAdminMode = false;
      updateAdminUI();
    }
  } else {
    // Connexion
    const password = prompt('Mot de passe admin :');
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem('adminMode', 'true');
      isAdminMode = true;
      updateAdminUI();
      alert('Connecte en mode admin');
    } else if (password !== null) {
      alert('Mot de passe incorrect');
    }
  }
}

// Mettre à jour l'interface admin
function updateAdminUI() {
  const body = document.body;
  const adminToggle = document.getElementById('adminToggle');
  const adminBadge = document.getElementById('adminBadge');
  
  if (isAdminMode) {
    body.classList.add('admin-mode');
    adminToggle.textContent = '🚪 Deconnexion';
    adminBadge.style.display = 'inline-block';
  } else {
    body.classList.remove('admin-mode');
    adminToggle.textContent = '🔑 Admin';
    adminBadge.style.display = 'none';
  }
  
  loadProducts();
}

// Charger les produits
async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    const products = await response.json();
    displayProducts(products);
  } catch (error) {
    console.error('Erreur:', error);
  }
}

// Afficher les produits
function displayProducts(products) {
  const productList = document.getElementById('productList');
  productList.innerHTML = '';
  
  if (products.length === 0) {
    productList.innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">Aucun produit</p>';
    return;
  }
  
  products.forEach(function(product) {
    const productCard = document.createElement('div');
    productCard.className = 'product-card';
    
    const nameSafe = String(product.name).replace(/'/g, "\\'");
    
    let buttonsHTML = '';
    
    if (isAdminMode) {
      // Mode admin : boutons de gestion
      buttonsHTML = '<button class="edit-btn admin-buttons" onclick="editProduct(' + product.id + ', \'' + nameSafe + '\', ' + product.price + ', \'' + product.image + '\')">Modifier</button>' +
                    '<button class="delete-btn admin-buttons" onclick="deleteProduct(' + product.id + ')">Supprimer</button>';
    } else {
      // Mode client : boutons panier et WhatsApp
      buttonsHTML = '<button class="cart-add-btn" onclick="addToCart(' + product.id + ', \'' + nameSafe + '\', ' + product.price + ')">Ajouter au panier</button>' +
                    '<button class="whatsapp-btn" onclick="orderProduct(\'' + nameSafe + '\', ' + product.price + ')">Commander</button>';
    }
    
    productCard.innerHTML = '<img src="' + product.image + '" alt="' + product.name + '">' +
      '<div class="product-info">' +
      '<h3>' + product.name + '</h3>' +
      '<p>' + product.price + ' FCFA</p>' +
      buttonsHTML +
      '</div>';
    
    productList.appendChild(productCard);
  });
}

// PANIER
function addToCart(id, name, price) {
  const existingItem = cart.find(item => item.id === id);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({ id: id, name: name, price: price, quantity: 1 });
  }
  localStorage.setItem('whaBizCart', JSON.stringify(cart));
  updateCartDisplay();
  alert('Ajoute au panier');
}

function updateCartDisplay() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById('cartCount').textContent = totalItems;
  
  const cartItemsDiv = document.getElementById('cartItems');
  if (cart.length === 0) {
    cartItemsDiv.innerHTML = '<p class="empty-cart">Panier vide</p>';
    document.getElementById('cartTotal').textContent = '0 FCFA';
    return;
  }
  
  cartItemsDiv.innerHTML = '';
  let total = 0;
  
  cart.forEach(function(item) {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;
    
    const cartItem = document.createElement('div');
    cartItem.className = 'cart-item';
    cartItem.innerHTML = '<div class="cart-item-info"><h4>' + item.name + '</h4><p>' + item.price + ' FCFA</p></div>' +
      '<div class="cart-item-controls">' +
      '<button onclick="decreaseQuantity(' + item.id + ')">-</button>' +
      '<span>' + item.quantity + '</span>' +
      '<button onclick="increaseQuantity(' + item.id + ')">+</button>' +
      '<button class="remove-item" onclick="removeFromCart(' + item.id + ')">X</button>' +
      '</div>' +
      '<div class="cart-item-total">' + itemTotal + ' FCFA</div>';
    cartItemsDiv.appendChild(cartItem);
  });
  
  document.getElementById('cartTotal').textContent = total + ' FCFA';
}

function increaseQuantity(id) {
  const item = cart.find(item => item.id === id);
  if (item) {
    item.quantity += 1;
    localStorage.setItem('whaBizCart', JSON.stringify(cart));
    updateCartDisplay();
  }
}

function decreaseQuantity(id) {
  const item = cart.find(item => item.id === id);
  if (item && item.quantity > 1) {
    item.quantity -= 1;
    localStorage.setItem('whaBizCart', JSON.stringify(cart));
    updateCartDisplay();
  }
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  localStorage.setItem('whaBizCart', JSON.stringify(cart));
  updateCartDisplay();
}

function clearCart() {
  if (confirm('Vider le panier ?')) {
    cart = [];
    localStorage.setItem('whaBizCart', JSON.stringify(cart));
    updateCartDisplay();
  }
}

function toggleCart() {
  document.getElementById('cartModal').classList.toggle('show');
}

function orderCart() {
  if (cart.length === 0) {
    alert('Panier vide');
    return;
  }
  
  let message = 'Bonjour ! Je voudrais commander :\n\n';
  let total = 0;
  
  cart.forEach(function(item) {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;
    message += '• ' + item.name + ' x' + item.quantity + ' = ' + itemTotal + ' FCFA\n';
  });
  
  message += '\nTotal: ' + total + ' FCFA';
  window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message), '_blank');
}

function orderProduct(name, price) {
  const message = 'Bonjour ! Je suis interesse par : ' + name + ' au prix de ' + price + ' FCFA.';
  window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message), '_blank');
}

// ADMIN
document.getElementById('productForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const name = document.getElementById('productName').value;
  const price = document.getElementById('productPrice').value;
  const image = document.getElementById('productImage').value;
  
  try {
    let response;
    
    if (editMode) {
      response = await fetch('/api/products/' + editProductId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, price: price, image: image })
      });
      if (response.ok) {
        alert('Produit modifie');
        cancelEdit();
      }
    } else {
      response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, price: price, image: image })
      });
      if (response.ok) {
        alert('Produit ajoute');
      }
    }
    
    document.getElementById('productForm').reset();
    loadProducts();
  } catch (error) {
    console.error('Erreur:', error);
  }
});

function editProduct(id, name, price, image) {
  editMode = true;
  editProductId = id;
  
  document.getElementById('productName').value = name;
  document.getElementById('productPrice').value = price;
  document.getElementById('productImage').value = image;
  
  document.getElementById('formTitle').textContent = 'Modifier le produit';
  document.getElementById('submitBtn').textContent = 'Enregistrer';
  
  if (!document.getElementById('cancelBtn')) {
    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'cancelBtn';
    cancelBtn.type = 'button';
    cancelBtn.className = 'cancel-btn';
    cancelBtn.textContent = 'Annuler';
    cancelBtn.onclick = cancelEdit;
    document.getElementById('productForm').appendChild(cancelBtn);
  }
  
  document.querySelector('.add-product').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  editMode = false;
  editProductId = null;
  
  document.getElementById('productForm').reset();
  document.getElementById('formTitle').textContent = 'Ajouter un produit';
  document.getElementById('submitBtn').textContent = 'Ajouter';
  
  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) cancelBtn.remove();
}

async function deleteProduct(id) {
  if (!confirm('Supprimer ce produit ?')) return;
  
  try {
    const response = await fetch('/api/products/' + id, { method: 'DELETE' });
    if (response.ok) {
      loadProducts();
      alert('Produit supprime');
    }
  } catch (error) {
    console.error('Erreur:', error);
  }
}

// Initialisation
updateAdminUI();
updateCartDisplay();