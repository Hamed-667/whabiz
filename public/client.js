// Numéro WhatsApp de la boutique (CHANGE CE NUMÉRO)
const WHATSAPP_NUMBER = '22670123456'; // Remplace par ton vrai numéro

// Panier d'achat (stocké dans le navigateur)
let cart = JSON.parse(localStorage.getItem('whaBizCart')) || [];

// Fonction pour charger et afficher les produits
async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    const products = await response.json();
    displayProducts(products);
  } catch (error) {
    console.error('Erreur lors du chargement des produits:', error);
  }
}

// Fonction pour afficher les produits dans la page
function displayProducts(products) {
  const productList = document.getElementById('productList');
  productList.innerHTML = ''; // Vider la liste avant d'afficher
  
  if (products.length === 0) {
    productList.innerHTML = '<p style="text-align: center; padding: 40px; color: #999;">Aucun produit disponible pour le moment.</p>';
    return;
  }
  
  products.forEach(product => {
    const productCard = document.createElement('div');
    productCard.className = 'product-card';
    
    const nameSafe = product.name.replace(/'/g, "\\'");
    
    productCard.innerHTML = `
      <img src="${product.image}" alt="${product.name}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22300%22%3E%3Crect fill=%22%23ddd%22 width=%22300%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22%3EProduit%3C/text%3E%3C/svg%3E'">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.price} FCFA</p>
        <button class="cart-add-btn" onclick="addToCart(${product.id}, '${nameSafe}', ${product.price})">
          🛒 Ajouter au panier
        </button>
        <button class="whatsapp-btn" onclick="orderProduct('${nameSafe}', ${product.price})">
          📱 Commander directement
        </button>
      </div>
    `;
    
    productList.appendChild(productCard);
  });
}

// === FONCTIONS DU PANIER ===

// Ajouter un produit au panier
function addToCart(id, name, price) {
  const existingItem = cart.find(item => item.id === id);
  
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({ id, name, price, quantity: 1 });
  }
  
  saveCart();
  updateCartDisplay();
  alert(`✅ "${name}" ajouté au panier !`);
}

// Sauvegarder le panier dans le navigateur
function saveCart() {
  localStorage.setItem('whaBizCart', JSON.stringify(cart));
}

// Mettre à jour l'affichage du panier
function updateCartDisplay() {
  // Mettre à jour le compteur
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById('cartCount').textContent = totalItems;
  
  // Afficher les articles du panier
  const cartItemsDiv = document.getElementById('cartItems');
  
  if (cart.length === 0) {
    cartItemsDiv.innerHTML = '<p class="empty-cart">Votre panier est vide</p>';
    document.getElementById('cartTotal').textContent = '0 FCFA';
    return;
  }
  
  cartItemsDiv.innerHTML = '';
  let total = 0;
  
  cart.forEach(item => {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;
    
    const cartItem = document.createElement('div');
    cartItem.className = 'cart-item';
    cartItem.innerHTML = `
      <div class="cart-item-info">
        <h4>${item.name}</h4>
        <p>${item.price} FCFA</p>
      </div>
      <div class="cart-item-controls">
        <button onclick="decreaseQuantity(${item.id})">-</button>
        <span>${item.quantity}</span>
        <button onclick="increaseQuantity(${item.id})">+</button>
        <button class="remove-item" onclick="removeFromCart(${item.id})">🗑️</button>
      </div>
      <div class="cart-item-total">${itemTotal} FCFA</div>
    `;
    cartItemsDiv.appendChild(cartItem);
  });
  
  document.getElementById('cartTotal').textContent = `${total} FCFA`;
}

// Augmenter la quantité
function increaseQuantity(id) {
  const item = cart.find(item => item.id === id);
  if (item) {
    item.quantity += 1;
    saveCart();
    updateCartDisplay();
  }
}

// Diminuer la quantité
function decreaseQuantity(id) {
  const item = cart.find(item => item.id === id);
  if (item && item.quantity > 1) {
    item.quantity -= 1;
    saveCart();
    updateCartDisplay();
  }
}

// Retirer un article du panier
function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  saveCart();
  updateCartDisplay();
}

// Vider tout le panier
function clearCart() {
  if (confirm('Voulez-vous vraiment vider le panier ?')) {
    cart = [];
    saveCart();
    updateCartDisplay();
  }
}

// Ouvrir/Fermer le panier
function toggleCart() {
  const modal = document.getElementById('cartModal');
  modal.classList.toggle('show');
}

// Commander tout le panier via WhatsApp
function orderCart() {
  if (cart.length === 0) {
    alert('Votre panier est vide !');
    return;
  }
  
  let message = 'Bonjour ! Je voudrais commander :\n\n';
  let total = 0;
  
  cart.forEach(item => {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;
    message += `• ${item.name} x${item.quantity} = ${itemTotal} FCFA\n`;
  });
  
  message += `\n*Total: ${total} FCFA*`;
  
  const whatsappURL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(whatsappURL, '_blank');
}

// Fonction pour commander un produit directement via WhatsApp
function orderProduct(productName, productPrice) {
  const message = `Bonjour ! Je suis intéressé(e) par : *${productName}* au prix de ${productPrice} FCFA.`;
  const whatsappURL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(whatsappURL, '_blank');
}

// Charger les produits et afficher le panier au démarrage
loadProducts();
updateCartDisplay();