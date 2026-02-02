const ADMIN_PASSWORD = 'ZLP13.COM';
const WHATSAPP_NUMBER = '22654576629';

let editMode = false;
let editProductId = null;

function checkAuth() {
  const isLoggedIn = sessionStorage.getItem('adminLoggedIn');
  if (isLoggedIn === 'true') {
    showAdminContent();
  }
}

document.getElementById('loginForm').addEventListener('submit', function(e) {
  e.preventDefault();
  const password = document.getElementById('adminPassword').value;
  
  if (password === ADMIN_PASSWORD) {
    sessionStorage.setItem('adminLoggedIn', 'true');
    showAdminContent();
  } else {
    alert('Mot de passe incorrect');
    document.getElementById('adminPassword').value = '';
  }
});

function showAdminContent() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminContent').style.display = 'block';
  loadProducts();
}

function logout() {
  if (confirm('Voulez-vous vraiment vous deconnecter ?')) {
    sessionStorage.removeItem('adminLoggedIn');
    location.reload();
  }
}

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    const products = await response.json();
    displayProducts(products);
  } catch (error) {
    console.error('Erreur:', error);
  }
}

function displayProducts(products) {
  const productList = document.getElementById('productList');
  productList.innerHTML = '';
  
  if (products.length === 0) {
    productList.innerHTML = '<p style="text-align: center; padding: 40px;">Aucun produit</p>';
    return;
  }
  
  products.forEach(function(product) {
    const productCard = document.createElement('div');
    productCard.className = 'product-card';
    
    productCard.innerHTML = '<img src="' + product.image + '" alt="' + product.name + '">' +
      '<div class="product-info">' +
      '<h3>' + product.name + '</h3>' +
      '<p>' + product.price + ' FCFA</p>' +
      '<button class="edit-btn" onclick="editProduct(' + product.id + ', \'' + product.name + '\', ' + product.price + ', \'' + product.image + '\')">Modifier</button>' +
      '<button class="delete-btn" onclick="deleteProduct(' + product.id + ')">Supprimer</button>' +
      '</div>';
    
    productList.appendChild(productCard);
  });
}

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
}

function cancelEdit() {
  editMode = false;
  editProductId = null;
  
  document.getElementById('productForm').reset();
  document.getElementById('formTitle').textContent = 'Ajouter un produit';
  document.getElementById('submitBtn').textContent = 'Ajouter';
  
  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) {
    cancelBtn.remove();
  }
}

async function deleteProduct(productId) {
  if (!confirm('Supprimer ce produit ?')) {
    return;
  }
  
  try {
    const response = await fetch('/api/products/' + productId, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      loadProducts();
      alert('Produit supprime');
    }
  } catch (error) {
    console.error('Erreur:', error);
  }
}

checkAuth();