const fs = require('fs');

const TRUE_VALUES = ['1', 'true', 'yes', 'on'];
const FALSE_VALUES = ['0', 'false', 'no', 'off'];

function envFlag(name, defaultValue = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return defaultValue;
  if (TRUE_VALUES.includes(raw)) return true;
  if (FALSE_VALUES.includes(raw)) return false;
  return defaultValue;
}

function parseMysqlUrl(urlString, fallbackDatabase = '') {
  try {
    const url = new URL(urlString);
    const database = decodeURIComponent(url.pathname.replace(/^\//, '')) || fallbackDatabase || '';
    return {
      host: url.hostname || '127.0.0.1',
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username || ''),
      password: decodeURIComponent(url.password || ''),
      database: database || undefined
    };
  } catch {
    return null;
  }
}

function getMysqlSslOptions() {
  const enabled = envFlag('MYSQL_SSL', false);
  if (!enabled) return null;
  const rejectUnauthorized = envFlag('MYSQL_SSL_REJECT_UNAUTHORIZED', true);
  const caPath = String(process.env.MYSQL_SSL_CA || '').trim();
  const ssl = { rejectUnauthorized };
  if (caPath) {
    try {
      ssl.ca = fs.readFileSync(caPath, 'utf8');
    } catch (err) {
      console.warn(`[mysql] SSL CA read failed: ${err.message}`);
    }
  }
  return ssl;
}

function createMysqlPool(mysql, urlOrOptions, fallbackDatabase = '') {
  const ssl = getMysqlSslOptions();
  if (typeof urlOrOptions === 'string') {
    const parsed = parseMysqlUrl(urlOrOptions, fallbackDatabase);
    if (parsed) {
      const opts = { ...parsed };
      if (ssl) opts.ssl = ssl;
      return mysql.createPool(opts);
    }
    if (ssl) return mysql.createPool({ uri: urlOrOptions, ssl });
    return mysql.createPool(urlOrOptions);
  }
  const options = { ...(urlOrOptions || {}) };
  if (ssl) options.ssl = ssl;
  return mysql.createPool(options);
}

module.exports = {
  createMysqlPool,
  getMysqlSslOptions,
  parseMysqlUrl
};
