// Importer Express (framework pour créer le serveur)
const express = require('express');
const fs = require('fs');
const path = require('path');

// Créer l'application
const app = express();
const PORT = process.env.PORT || 3000;

// Permettre au serveur de lire les données JSON envoyées
app.use(express.json());

// Servir les fichiers du dossier "public" (HTML, CSS, JS)
app.use(express.static('public'));

// ROUTE 1 : Récupérer tous les produits
app.get('/api/products', (req, res) => {
  const products = JSON.parse(fs.readFileSync('./data/products.json', 'utf-8'));
  res.json(products);
});

// ROUTE 2 : Ajouter un nouveau produit
app.post('/api/products', (req, res) => {
  const products = JSON.parse(fs.readFileSync('./data/products.json', 'utf-8'));
  const newProduct = {
    id: products.length + 1,
    name: req.body.name,
    price: req.body.price,
    image: req.body.image || 'https://via.placeholder.com/300x300/cccccc/ffffff?text=Produit'
  };
  products.push(newProduct);
  fs.writeFileSync('./data/products.json', JSON.stringify(products, null, 2));
  res.json(newProduct);
});
// ROUTE 3 : Supprimer un produit
app.delete('/api/products/:id', (req, res) => {
  const productId = parseInt(req.params.id);
  const products = JSON.parse(fs.readFileSync('./data/products.json', 'utf-8'));
  
  // Filtrer pour garder tous les produits SAUF celui à supprimer
  const updatedProducts = products.filter(product => product.id !== productId);
  
  // Sauvegarder dans le fichier
  fs.writeFileSync('./data/products.json', JSON.stringify(updatedProducts, null, 2));
  
  res.json({ message: 'Produit supprimé avec succès', id: productId });
});
// ROUTE 4 : Modifier un produit
app.put('/api/products/:id', (req, res) => {
  const productId = parseInt(req.params.id);
  const products = JSON.parse(fs.readFileSync('./data/products.json', 'utf-8'));
  
  // Trouver l'index du produit à modifier
  const productIndex = products.findIndex(product => product.id === productId);
  
  if (productIndex !== -1) {
    // Mettre à jour le produit
    products[productIndex] = {
      id: productId,
      name: req.body.name,
      price: req.body.price,
      image: req.body.image || products[productIndex].image
    };
    
    // Sauvegarder dans le fichier
    fs.writeFileSync('./data/products.json', JSON.stringify(products, null, 2));
    
    res.json(products[productIndex]);
  } else {
    res.status(404).json({ error: 'Produit non trouvé' });
  }
});
// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
});