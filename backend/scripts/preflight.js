const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
const { createMysqlPool } = require('../mysql-ssl');

const ROOT = path.join(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const TRUE_VALUES = ['1', 'true', 'yes', 'on'];
const FALSE_VALUES = ['0', 'false', 'no', 'off'];
const DEFAULT_JWT_SECRET = 'secret-key-change-me';

function envFlag(name, defaultValue = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return defaultValue;
  if (TRUE_VALUES.includes(raw)) return true;
  if (FALSE_VALUES.includes(raw)) return false;
  return defaultValue;
}

function getEnv(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

function addIssue(list, message) {
  list.push({ level: 'issue', message });
}

function addWarning(list, message) {
  list.push({ level: 'warning', message });
}

async function checkMySQL(report) {
  const MYSQL_URL = getEnv('MYSQL_URL');
  const MYSQL_ENABLED = envFlag('MYSQL_ENABLED', false) || Boolean(MYSQL_URL);
  if (!MYSQL_ENABLED) {
    return;
  }

  const MYSQL_HOST = getEnv('MYSQL_HOST', '127.0.0.1');
  const MYSQL_PORT = Number(process.env.MYSQL_PORT) || 3306;
  const MYSQL_USER = getEnv('MYSQL_USER', 'root');
  const MYSQL_PASSWORD = getEnv('MYSQL_PASSWORD');
  const MYSQL_DATABASE = getEnv('MYSQL_DATABASE', 'whabiz');

  let pool = null;
  try {
    if (MYSQL_URL) {
      pool = createMysqlPool(mysql, MYSQL_URL, MYSQL_DATABASE);
    } else {
      pool = createMysqlPool(mysql, {
        host: MYSQL_HOST,
        port: MYSQL_PORT,
        user: MYSQL_USER,
        password: MYSQL_PASSWORD,
        database: MYSQL_DATABASE,
        connectionLimit: 2
      });
    }
    await pool.query('SELECT 1');

    const tables = ['rel_vendeurs', 'rel_products', 'rel_orders', 'rel_payments'];
    const [rows] = await pool.query(
      'SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema=? AND table_name IN (?,?,?,?)',
      [MYSQL_DATABASE, ...tables]
    );
    const existing = new Set((rows || []).map((row) => String(row.tableName || '').trim()));
    const missing = tables.filter((name) => !existing.has(name));
    if (missing.length) {
      addWarning(report, `MySQL tables missing: ${missing.join(', ')} (run mysql:migrations if needed)`);
    }
  } catch (error) {
    addIssue(report, `MySQL connection failed: ${error.message}`);
  } finally {
    if (pool) await pool.end();
  }
}

async function main() {
  const report = [];
  const NODE_ENV = getEnv('NODE_ENV', 'development').toLowerCase();

  const jwtSecret = getEnv('JWT_SECRET', DEFAULT_JWT_SECRET);
  if (!jwtSecret || jwtSecret === DEFAULT_JWT_SECRET) {
    if (NODE_ENV === 'production') {
      addIssue(report, 'JWT_SECRET is default in production.');
    } else {
      addWarning(report, 'JWT_SECRET is default.');
    }
  }

  const adminPassword = getEnv('ADMIN_PASSWORD', 'Admin123!');
  const adminHash = getEnv('ADMIN_PASSWORD_HASH');
  if (!adminHash && adminPassword === 'Admin123!') {
    if (NODE_ENV === 'production') {
      addIssue(report, 'ADMIN_PASSWORD is default and ADMIN_PASSWORD_HASH is empty.');
    } else {
      addWarning(report, 'ADMIN_PASSWORD is default. Consider ADMIN_PASSWORD_HASH.');
    }
  }

  const recoveryDebug = envFlag('RECOVERY_DEBUG_CODE', NODE_ENV !== 'production');
  if (NODE_ENV === 'production' && recoveryDebug) {
    addWarning(report, 'RECOVERY_DEBUG_CODE is enabled in production.');
  }

  const recoveryWhatsApp = envFlag('RECOVERY_WHATSAPP_LINK_ENABLED', NODE_ENV !== 'production');
  if (NODE_ENV === 'production' && recoveryWhatsApp) {
    addWarning(report, 'RECOVERY_WHATSAPP_LINK_ENABLED is enabled in production.');
  }

  await checkMySQL(report);

  const issues = report.filter((item) => item.level === 'issue');
  const warnings = report.filter((item) => item.level === 'warning');

  if (!report.length) {
    console.log('[preflight] OK - no issues.');
    process.exit(0);
  }

  console.log('[preflight] Results:');
  issues.forEach((item) => console.log(`- ISSUE: ${item.message}`));
  warnings.forEach((item) => console.log(`- WARN : ${item.message}`));

  if (issues.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[preflight] Failed:', error.message);
  process.exit(1);
});
