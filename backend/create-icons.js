
const fs = require('fs');
const path = require('path');


const iconsDir = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}


const sizes = [72, 96, 128, 144, 152, 192, 384, 512];


const createSVG = (size) => `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#0F9D58" rx="${size * 0.2}"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.6}" font-weight="900" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central">W</text>
</svg>
`;

console.log('🎨 Création des icônes PWA...\n');

sizes.forEach(size => {
  const svgContent = createSVG(size);
  const filename = `icon-${size}.svg`;
  const filepath = path.join(iconsDir, filename);
  
  fs.writeFileSync(filepath, svgContent);
  console.log(`✅ Créé: icons/${filename}`);
});

console.log('\n✨ Icônes créées avec succès !');
console.log('✅ Les icônes SVG fonctionnent directement dans les navigateurs modernes.');