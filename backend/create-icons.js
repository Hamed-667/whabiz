const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '..', 'frontend', 'icons');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createSvg(size) {
  const radius = Math.round(size * 0.22);
  const accent = Math.round(size * 0.16);
  const fontSize = Math.round(size * 0.46);

  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0F9D58"/>
      <stop offset="1" stop-color="#0B7A43"/>
    </linearGradient>
    <linearGradient id="shine" x1="${size * 0.1}" y1="${size * 0.1}" x2="${size * 0.9}" y2="${size * 0.9}" gradientUnits="userSpaceOnUse">
      <stop stop-color="rgba(255,255,255,0.28)"/>
      <stop offset="1" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#bg)"/>
  <path d="M ${size * 0.18} ${size * 0.24} C ${size * 0.32} ${size * 0.1}, ${size * 0.58} ${size * 0.08}, ${size * 0.8} ${size * 0.18}" stroke="rgba(255,255,255,0.22)" stroke-width="${Math.max(4, Math.round(size * 0.04))}" stroke-linecap="round"/>
  <circle cx="${size * 0.78}" cy="${size * 0.24}" r="${accent}" fill="#D4AF37"/>
  <text x="50%" y="56%" text-anchor="middle" font-family="Outfit, Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="#FFFFFF">W</text>
</svg>
`.trim();
}

async function buildIcon(size) {
  const svgContent = createSvg(size);
  const svgPath = path.join(iconsDir, `icon-${size}.svg`);
  const pngPath = path.join(iconsDir, `icon-${size}.png`);
  const svgBuffer = Buffer.from(svgContent);

  fs.writeFileSync(svgPath, svgContent, 'utf8');
  await sharp(svgBuffer).png().toFile(pngPath);
}

async function main() {
  ensureDir(iconsDir);
  console.log('[pwa] generating icons in frontend/icons');

  for (const size of sizes) {
    await buildIcon(size);
    console.log(`[pwa] icon-${size}.svg and icon-${size}.png`);
  }

  console.log('[pwa] icons generated successfully');
}

main().catch((error) => {
  console.error('[pwa] icon generation failed:', error && error.message ? error.message : error);
  process.exitCode = 1;
});
