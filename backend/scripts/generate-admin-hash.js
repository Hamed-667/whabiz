const bcrypt = require('bcryptjs');

const password = String(process.argv[2] || '').trim();
const rounds = Math.max(10, Number(process.env.BCRYPT_ROUNDS) || 12);

if (!password) {
  console.error('Usage: node scripts/generate-admin-hash.js "password"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, rounds);
console.log(hash);
