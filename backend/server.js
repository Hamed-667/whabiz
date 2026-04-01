const express=require('express');
const multer=require('multer');
const sharp=require('sharp');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const nodemailer=require('nodemailer');
const helmet=require('helmet');
const rateLimit=require('express-rate-limit');
const PDFDocument=require('pdfkit');
const mysql=require('mysql2/promise');
const dotenv=require('dotenv');
const {createMysqlPool}=require('./mysql-ssl');

const ROOT=__dirname;
dotenv.config({path:path.join(ROOT,'.env')});

const TRUE_VALUES=['1','true','yes','on'];
const FALSE_VALUES=['0','false','no','off'];
const envFlag=(name,defaultValue=false)=>{
  const raw=String(process.env[name]??'').trim().toLowerCase();
  if(!raw) return defaultValue;
  if(TRUE_VALUES.includes(raw)) return true;
  if(FALSE_VALUES.includes(raw)) return false;
  return defaultValue;
};

const app=express();
const PORT=Number(process.env.PORT)||3000;
const NODE_ENV=String(process.env.NODE_ENV||'development').trim().toLowerCase();
const IS_PROD=NODE_ENV==='production';
const DEFAULT_JWT_SECRET='secret-key-change-me';
const JWT_SECRET=String(process.env.JWT_SECRET||DEFAULT_JWT_SECRET).trim();
const ADMIN_EMAIL=String(process.env.ADMIN_EMAIL||'admin@whabiz.local').trim().toLowerCase();
const ADMIN_PASSWORD=String(process.env.ADMIN_PASSWORD||'Admin123!').trim();
const ADMIN_PASSWORD_HASH=String(process.env.ADMIN_PASSWORD_HASH||'').trim();
const ADMIN_SESSION_COOKIE=String(process.env.ADMIN_SESSION_COOKIE||'whabiz_admin_session').trim()||'whabiz_admin_session';
const ADMIN_SESSION_TTL_HOURS=Math.max(1,Number(process.env.ADMIN_SESSION_TTL_HOURS)||12);
const ADMIN_SESSION_TTL_SECONDS=Math.max(3600,Math.floor(ADMIN_SESSION_TTL_HOURS*60*60));
const ADMIN_COOKIE_SAMESITE_RAW=String(process.env.ADMIN_COOKIE_SAMESITE||'lax').trim().toLowerCase();
const ADMIN_COOKIE_SAMESITE=['strict','lax','none'].includes(ADMIN_COOKIE_SAMESITE_RAW)?ADMIN_COOKIE_SAMESITE_RAW:'lax';
const ADMIN_COOKIE_SECURE=envFlag('ADMIN_COOKIE_SECURE',IS_PROD||ADMIN_COOKIE_SAMESITE==='none');
const PAYMENT_WEBHOOK_SECRET=String(process.env.PAYMENT_WEBHOOK_SECRET||'').trim();
const VENDEUR_SESSION_TTL_HOURS=Math.max(1,Number(process.env.VENDEUR_SESSION_TTL_HOURS)||24);
const VENDEUR_SESSION_TTL_SECONDS=Math.max(3600,Math.floor(VENDEUR_SESSION_TTL_HOURS*60*60));
const MYSQL_URL=String(process.env.MYSQL_URL||'').trim();
const MYSQL_ENABLED=envFlag('MYSQL_ENABLED',false)||Boolean(MYSQL_URL);
const MYSQL_HOST=String(process.env.MYSQL_HOST||'127.0.0.1').trim();
const MYSQL_PORT=Number(process.env.MYSQL_PORT)||3306;
const MYSQL_USER=String(process.env.MYSQL_USER||'root').trim();
const MYSQL_PASSWORD=String(process.env.MYSQL_PASSWORD||'').trim();
const MYSQL_DATABASE=String(process.env.MYSQL_DATABASE||'whabiz').trim();
const MYSQL_TABLE=String(process.env.MYSQL_TABLE||'whabiz_store').trim();
const MYSQL_SOURCE_OF_TRUTH=MYSQL_ENABLED&&envFlag('MYSQL_SOURCE_OF_TRUTH',true);
const MYSQL_JSON_MIRROR_WRITES=MYSQL_ENABLED&&envFlag('MYSQL_JSON_MIRROR_WRITES',false);
const BCRYPT_ROUNDS=Math.max(10,Number(process.env.BCRYPT_ROUNDS)||12);
const API_RATE_LIMIT_MAX=Math.max(120,Number(process.env.API_RATE_LIMIT_MAX)||900);
const LOGIN_RATE_LIMIT_MAX=Math.max(3,Number(process.env.LOGIN_RATE_LIMIT_MAX)||8);
const ADMIN_LOGIN_RATE_LIMIT_MAX=Math.max(2,Number(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX)||5);
const SIGNUP_RATE_LIMIT_MAX=Math.max(4,Number(process.env.SIGNUP_RATE_LIMIT_MAX)||15);
const RECOVERY_RATE_LIMIT_MAX=Math.max(2,Number(process.env.RECOVERY_RATE_LIMIT_MAX)||5);
const ORDER_RATE_LIMIT_MAX=Math.max(10,Number(process.env.ORDER_RATE_LIMIT_MAX)||40);
const ANALYTICS_RATE_LIMIT_MAX=Math.max(30,Number(process.env.ANALYTICS_RATE_LIMIT_MAX)||120);
const AUTH_FAILURE_WINDOW_MS=Math.max(60*1000,Number(process.env.AUTH_FAILURE_WINDOW_MS)||15*60*1000);
const AUTH_FAILURE_LIMIT=Math.max(3,Number(process.env.AUTH_FAILURE_LIMIT)||5);
const AUTH_LOCK_MS=Math.max(2*60*1000,Number(process.env.AUTH_LOCK_MS)||20*60*1000);
const RECOVERY_MAX_ATTEMPTS=Math.max(3,Number(process.env.RECOVERY_MAX_ATTEMPTS)||5);
const RECOVERY_DEBUG_CODE=envFlag('RECOVERY_DEBUG_CODE',process.env.NODE_ENV!=='production');
const RECOVERY_WHATSAPP_LINK_ENABLED=envFlag('RECOVERY_WHATSAPP_LINK_ENABLED',process.env.NODE_ENV!=='production');
const RECOVERY_CODE_SECRET=String(process.env.RECOVERY_CODE_SECRET||JWT_SECRET||DEFAULT_JWT_SECRET).trim();
const RECOVERY_CODE_TTL_MINUTES=Math.max(5,Number(process.env.RECOVERY_CODE_TTL_MINUTES)||15);
const JSON_BACKUP_INTERVAL_HOURS=Math.max(1,Number(process.env.JSON_BACKUP_INTERVAL_HOURS)||6);
const MYSQL_BACKUP_AUTO=MYSQL_ENABLED&&envFlag('MYSQL_BACKUP_AUTO',true);
const MYSQL_BACKUP_INTERVAL_HOURS=Math.max(1,Number(process.env.MYSQL_BACKUP_INTERVAL_HOURS)||24);
const MYSQL_RESTORE_TEST_AUTO=MYSQL_ENABLED&&envFlag('MYSQL_RESTORE_TEST_AUTO',false);
const MYSQL_RESTORE_TEST_INTERVAL_HOURS=Math.max(1,Number(process.env.MYSQL_RESTORE_TEST_INTERVAL_HOURS)||168);
const MYSQL_RESTORE_TEST_DB=String(process.env.MYSQL_RESTORE_TEST_DB||`${MYSQL_DATABASE}_restore_test`).trim();
const MYSQL_PERSIST_QUEUE_MAX_WAIT_MS=Math.max(0,Number(process.env.MYSQL_PERSIST_QUEUE_MAX_WAIT_MS)||5000);
const MYSQL_PERSIST_QUEUE_TIMEOUT_ALERT_INTERVAL_MS=Math.max(60*1000,Number(process.env.MYSQL_PERSIST_QUEUE_TIMEOUT_ALERT_INTERVAL_MS)||300000);

if(!JWT_SECRET||JWT_SECRET===DEFAULT_JWT_SECRET){
  const msg='JWT_SECRET utilise encore la valeur par defaut';
  if(String(process.env.NODE_ENV||'').toLowerCase()==='production'){
    throw new Error(`${msg} (refuse en production)`);
  }
  console.warn(`[SECURITY] ${msg}. Configure une vraie valeur dans backend/.env`);
}
if(IS_PROD&&!ADMIN_PASSWORD_HASH&&ADMIN_PASSWORD==='Admin123!'){
  console.warn('[SECURITY] ADMIN_PASSWORD utilise la valeur par defaut. Configure ADMIN_PASSWORD ou ADMIN_PASSWORD_HASH.');
}

const FRONT=path.join(ROOT,'../frontend');
const DATA=path.join(ROOT,'data');
const BACKUPS=path.join(ROOT,'backups');
const UPLOADS=path.join(ROOT,'uploads');
const PROD_UPLOADS=path.join(UPLOADS,'products');
const FRONT_UPLOADS=path.join(FRONT,'uploads/products');
const DB_MIGRATIONS_DIR=path.join(ROOT,'db','migrations');

const FILE={
  products:path.join(DATA,'products.json'),
  vendeurs:path.join(DATA,'vendeurs.json'),
  recovery:path.join(DATA,'recovery.json'),
  orders:path.join(DATA,'orders.json'),
  reviews:path.join(DATA,'reviews.json'),
  payments:path.join(DATA,'payments.json'),
  analytics:path.join(DATA,'analytics.json'),
  experiments:path.join(DATA,'experiments.json'),
  audit:path.join(DATA,'audit-log.json'),
  automations:path.join(DATA,'automations.json')
};
const CARTS_FILE=path.join(DATA,'carts.json');
const OBS_FILE={
  alerts:path.join(DATA,'ops-alerts.json'),
  errors:path.join(DATA,'ops-errors.json'),
  backups:path.join(DATA,'ops-backups.json')
};

const ORDER_STATUSES=['en_attente','confirmee','expediee','livree','annulee'];
const ORDER_STATUS_TRANSITIONS={
  en_attente:['confirmee','annulee'],
  confirmee:['expediee','annulee'],
  expediee:['livree','annulee'],
  livree:[],
  annulee:[]
};
const LEGACY_ORDER_STATUS_MAP={en_cours:'confirmee',expedie:'expediee',livre:'livree'};
const PAYMENT_METHODS=['cash_on_delivery','orange_money','moov_money','wave'];
const PAYMENT_PROVIDER_META={
  cash_on_delivery:{label:'Paiement a la livraison',kind:'offline'},
  orange_money:{label:'Orange Money',kind:'mobile_money'},
  moov_money:{label:'Moov Money',kind:'mobile_money'},
  wave:{label:'Wave',kind:'mobile_money'}
};

[DATA,BACKUPS,PROD_UPLOADS,FRONT_UPLOADS].forEach((d)=>fs.mkdirSync(d,{recursive:true}));
Object.values(FILE).forEach((f)=>{ if(!fs.existsSync(f)) fs.writeFileSync(f,'[]'); });
if(!fs.existsSync(CARTS_FILE)) fs.writeFileSync(CARTS_FILE,'[]');
Object.values(OBS_FILE).forEach((f)=>{ if(!fs.existsSync(f)) fs.writeFileSync(f,'[]'); });
const FILE_KEYS=Object.keys(FILE);
const FILE_KEY_BY_PATH=new Map(Object.entries(FILE).map(([k,f])=>[path.resolve(f),k]));
const LEGACY_SQL_STORE_TABLES={
  products:'wb_products',
  vendeurs:'wb_vendeurs',
  recovery:'wb_recovery',
  orders:'wb_orders',
  reviews:'wb_reviews',
  payments:'wb_payments',
  analytics:'wb_analytics_events',
  experiments:'wb_experiment_events',
  audit:'wb_audit_logs',
  automations:'wb_automations'
};
const REL_MAIN_TABLES={
  products:'rel_products',
  vendeurs:'rel_vendeurs',
  recovery:'rel_recovery',
  orders:'rel_orders',
  reviews:'rel_reviews',
  payments:'rel_payments',
  analytics:'rel_analytics_events',
  experiments:'rel_experiment_events',
  audit:'rel_audit_logs',
  automations:'rel_automations'
};
const REL_CHILD_TABLES={
  productImages:'rel_product_images',
  productVariants:'rel_product_variants',
  orderItems:'rel_order_items'
};
const RELATIONAL_TABLES=[...new Set([...Object.values(REL_MAIN_TABLES),...Object.values(REL_CHILD_TABLES)])];
const storageCache=Object.fromEntries(FILE_KEYS.map((k)=>[k,[]]));
let mysqlPool=null;
let mysqlReady=false;
let persistQueue=Promise.resolve();
let appendQueue=Promise.resolve();
let backupTimerStarted=false;
let mysqlBackupTimerStarted=false;
let mysqlBackupStartupRetryScheduled=false;
let mysqlRestoreTestTimerStarted=false;
let legacyTableDetected=null;
const authFailures=new Map();
let lastPersistQueueTimeoutAt=0;
const APPEND_DIRECT_KEYS=new Set(['analytics','audit','experiments','automations']);

const SMTP_USER=process.env.SMTP_USER||'';
const SMTP_PASS=process.env.SMTP_PASS||'';
const mailer=(SMTP_USER&&SMTP_PASS)?nodemailer.createTransport({service:'gmail',auth:{user:SMTP_USER,pass:SMTP_PASS}}):null;
const OPS_ALERTS_ENABLED=envFlag('OPS_ALERTS_ENABLED',true);
const OPS_ALERT_LEVELS=String(process.env.OPS_ALERT_LEVELS||'error,warning')
  .split(',')
  .map((v)=>String(v||'').trim().toLowerCase())
  .filter(Boolean);
const OPS_ALERT_THROTTLE_MINUTES=Math.max(1,Number(process.env.OPS_ALERT_THROTTLE_MINUTES)||30);
const OPS_ALERT_EMAIL_TO=String(process.env.OPS_ALERT_EMAIL_TO||'').trim();
const OPS_ALERT_EMAIL_FROM=String(process.env.OPS_ALERT_EMAIL_FROM||SMTP_USER||'noreply@whabiz.local').trim()||'noreply@whabiz.local';
const OPS_ALERT_WHATSAPP_PROVIDER=String(process.env.OPS_ALERT_WHATSAPP_PROVIDER||'').trim().toLowerCase();
const OPS_ALERT_WHATSAPP_FROM=String(process.env.OPS_ALERT_WHATSAPP_FROM||'').trim();
const OPS_ALERT_WHATSAPP_TO=String(process.env.OPS_ALERT_WHATSAPP_TO||'').trim();
const OPS_ALERT_WHATSAPP_WEBHOOK_URL=String(process.env.OPS_ALERT_WHATSAPP_WEBHOOK_URL||'').trim();
const OPS_ALERT_WHATSAPP_TOKEN=String(process.env.OPS_ALERT_WHATSAPP_TOKEN||'').trim();
const OPS_ALERT_PHONE_COUNTRY_CODE=String(process.env.OPS_ALERT_PHONE_COUNTRY_CODE||'226').trim();
const TWILIO_ACCOUNT_SID=String(process.env.TWILIO_ACCOUNT_SID||'').trim();
const TWILIO_AUTH_TOKEN=String(process.env.TWILIO_AUTH_TOKEN||'').trim();
const ORDER_DEBUG=envFlag('ORDER_DEBUG',false);
const STORAGE_PROVIDER=String(process.env.STORAGE_PROVIDER||'local').trim().toLowerCase();
const CLOUDINARY_URL=String(process.env.CLOUDINARY_URL||'').trim();
const CLOUDINARY_CLOUD_NAME=String(process.env.CLOUDINARY_CLOUD_NAME||'').trim();
const CLOUDINARY_API_KEY=String(process.env.CLOUDINARY_API_KEY||'').trim();
const CLOUDINARY_API_SECRET=String(process.env.CLOUDINARY_API_SECRET||'').trim();
const CLOUDINARY_FOLDER=String(process.env.CLOUDINARY_FOLDER||'whabiz/products').trim()||'whabiz/products';

app.set('trust proxy',1);
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));
app.use((req,res,next)=>{
  if(req.method!=='GET') return next();
  const p=String(req.path||'');
  const isAdminPage=p==='/admin'||p==='/admin/'||p==='/admin.html';
  if(!isAdminPage) return next();
  const token=getCookie(req,ADMIN_SESSION_COOKIE).trim();
  if(!token){
    return res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl||'/admin.html')}`);
  }
  try{
    const decoded=jwt.verify(token,JWT_SECRET);
    if(decoded.role!=='admin') throw new Error('Invalid admin role');
    req.auth=decoded;
    return next();
  }catch{
    clearAdminSessionCookie(res);
    return res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl||'/admin.html')}&reason=expired`);
  }
});
app.use(express.static(FRONT));
app.use('/uploads',express.static(UPLOADS));
app.use('/uploads',express.static(path.join(FRONT,'uploads')));

app.use((req,res,next)=>{
  const requestId=`req_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  req.requestId=requestId;
  res.setHeader('x-request-id',requestId);
  const startedAt=Date.now();
  res.on('finish',()=>{
    if(res.statusCode>=500){
      console.error(`[HTTP ${res.statusCode}] ${req.method} ${req.originalUrl} (${Date.now()-startedAt}ms) req=${requestId}`);
    }
  });
  next();
});

const upload=multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:5*1024*1024},
  fileFilter:(req,file,cb)=>{
    const ok=['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype);
    if(!ok) return cb(new Error('Format image non supporte'));
    cb(null,true);
  }
});

function createLimiter(windowMs,max,errorMessage){
  return rateLimit({
    windowMs,
    max,
    standardHeaders:true,
    legacyHeaders:false,
    handler:(req,res)=>{
      res.status(429).json({error:errorMessage});
    }
  });
}

const apiLimiter=createLimiter(15*60*1000,API_RATE_LIMIT_MAX,'Trop de requetes API, reessaie plus tard');
const adminLoginLimiter=createLimiter(15*60*1000,ADMIN_LOGIN_RATE_LIMIT_MAX,'Trop de tentatives admin, reessaie plus tard');
const loginLimiter=createLimiter(15*60*1000,LOGIN_RATE_LIMIT_MAX,'Trop de tentatives de connexion, reessaie plus tard');
const signupLimiter=createLimiter(15*60*1000,SIGNUP_RATE_LIMIT_MAX,'Trop d inscriptions recues, reessaie plus tard');
const recoveryLimiter=createLimiter(15*60*1000,RECOVERY_RATE_LIMIT_MAX,'Trop de tentatives de recuperation, reessaie plus tard');
const orderLimiter=createLimiter(15*60*1000,ORDER_RATE_LIMIT_MAX,'Trop d operations commandes, reessaie plus tard');
const analyticsLimiter=createLimiter(5*60*1000,ANALYTICS_RATE_LIMIT_MAX,'Trop d evenements analytics, reessaie plus tard');

app.use('/api',apiLimiter);

const readFileArray=(f)=>{try{const x=JSON.parse(fs.readFileSync(f,'utf8'));return Array.isArray(x)?x:[]}catch{return[]}};
const writeFileArray=(f,d)=>fs.writeFileSync(f,JSON.stringify(Array.isArray(d)?d:[],null,2));
const readCartStore=()=>readFileArray(CARTS_FILE);
const writeCartStore=(rows)=>writeFileArray(CARTS_FILE,rows);
const cloneArray=(arr)=>JSON.parse(JSON.stringify(Array.isArray(arr)?arr:[]));
const storeKeyFromFile=(f)=>FILE_KEY_BY_PATH.get(path.resolve(f))||null;

function tableForStoreKey(storeKey){
  return REL_MAIN_TABLES[storeKey]||null;
}

function legacyTableForStoreKey(storeKey){
  return LEGACY_SQL_STORE_TABLES[storeKey]||null;
}

function toFiniteNumber(v,d=0){
  const n=Number(v);
  return Number.isFinite(n)?n:d;
}

function toIntValue(v,d=0){
  const n=parseInt(String(v),10);
  return Number.isFinite(n)?n:d;
}

function parseJson(value,fallback={}){
  try{
    const x=JSON.parse(String(value||''));
    return x&&typeof x==='object'?x:fallback;
  }catch{
    return fallback;
  }
}

function rowIdForStore(storeKey,item,index){
  const data=item&&typeof item==='object'?item:{};
  const baseByKey={
    payments:data.reference||data.id,
    recovery:data.id||`${String(data.tel||'').replace(/[^\d]/g,'')}_${String(data.code||'').trim()}_${String(data.expiresAt||index)}`,
    default:data.id||data.reference||`${storeKey}_${index}`
  };
  let value=String(baseByKey[storeKey]||baseByKey.default||`${storeKey}_${index}`).trim();
  if(!value) value=`${storeKey}_${index}`;
  if(value.length>191) value=value.slice(0,191);
  return value;
}

function normalizeStoreRows(storeKey,records){
  const source=Array.isArray(records)?records:[];
  const used=new Set();
  return source.map((payload,index)=>{
    let rowId=rowIdForStore(storeKey,payload,index);
    let suffix=1;
    while(used.has(rowId)){
      const extra=`_${suffix++}`;
      rowId=(rowId.length+extra.length>191?rowId.slice(0,191-extra.length):rowId)+extra;
    }
    used.add(rowId);
    return {rowId,payload};
  });
}

function inferCreatedAt(payload){
  if(!payload||typeof payload!=='object') return null;
  return payload.at||payload.createdAt||payload.dateCommande||payload.dateInscription||payload.dateAvis||null;
}

function buildReferenceSets(){
  const idsFor=(storeKey)=>new Set(
    (Array.isArray(storageCache[storeKey])?storageCache[storeKey]:[])
      .map((item)=>toFiniteNumber(item&&item.id,null))
      .filter((id)=>id!==null)
  );
  return {
    vendeurs:idsFor('vendeurs'),
    products:idsFor('products'),
    orders:idsFor('orders')
  };
}

function fkNumberOrNull(value,allowedSet){
  const parsed=toFiniteNumber(value,null);
  if(parsed===null) return null;
  return allowedSet instanceof Set&&allowedSet.has(parsed)?parsed:null;
}

async function persistStoreImmediate(storeKey){
  if(!mysqlPool) return;
  const mainTable=tableForStoreKey(storeKey);
  if(!mainTable) return;
  const rows=normalizeStoreRows(storeKey,storageCache[storeKey]);
  const refs=buildReferenceSets();
  const conn=await mysqlPool.getConnection();
  try{
    await conn.beginTransaction();
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    if(storeKey==='products'){
      await conn.query(`DELETE FROM \`${REL_CHILD_TABLES.productImages}\``);
      await conn.query(`DELETE FROM \`${REL_CHILD_TABLES.productVariants}\``);
    }
    if(storeKey==='orders'){
      await conn.query(`DELETE FROM \`${REL_CHILD_TABLES.orderItems}\``);
    }
    await conn.query(`DELETE FROM \`${mainTable}\``);

    for(let i=0;i<rows.length;i++){
      const row=rows[i];
      const p=row.payload&&typeof row.payload==='object'?row.payload:{};
      const payloadJson=JSON.stringify(p||{});
      const createdAt=inferCreatedAt(p);

      if(storeKey==='vendeurs'){
        const vendeurEmail=String(p.email||'').trim().toLowerCase();
        const vendeurTel=String(p.tel||'').trim();
        const vendeurSlug=String(p.slug||'').trim();
        await conn.execute(
          `INSERT INTO \`${mainTable}\` (row_id,vendeur_id,role,nom,email,tel,boutique,slug,plan,actif,date_inscription,payload_json,created_at_txt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [row.rowId,toFiniteNumber(p.id,null),String(p.role||'vendeur'),String(p.nom||''),(vendeurEmail||null),(vendeurTel||null),String(p.boutique||''),(vendeurSlug||null),String(p.plan||''),p.actif?1:0,String(p.dateInscription||''),payloadJson,createdAt]
        );
        continue;
      }
      if(storeKey==='products'){
        await conn.execute(
          `INSERT INTO \`${mainTable}\` (row_id,product_id,vendeur_id,nom,categorie,prix,stock,payload_json,created_at_txt) VALUES (?,?,?,?,?,?,?,?,?)`,
          [row.rowId,toFiniteNumber(p.id,null),fkNumberOrNull(p.vendeurId,refs.vendeurs),String(p.nom||''),String(p.categorie||''),toFiniteNumber(p.prix,0),toIntValue(p.stock,0),payloadJson,createdAt]
        );
        const productId=toFiniteNumber(p.id,null);
        if(productId!==null){
          const images=Array.isArray(p.images)?p.images.filter(Boolean):(p.image?[p.image]:[]);
          for(let ix=0;ix<images.length;ix++){
            await conn.execute(
              `INSERT INTO \`${REL_CHILD_TABLES.productImages}\` (product_id,image_url,sort_order) VALUES (?,?,?)`,
              [productId,String(images[ix]||''),ix]
            );
          }
          const variants=Array.isArray(p.variants)?p.variants:[];
          for(let vx=0;vx<variants.length;vx++){
            const v=variants[vx]||{};
            await conn.execute(
              `INSERT INTO \`${REL_CHILD_TABLES.productVariants}\` (product_id,variant_id,name,stock,sort_order) VALUES (?,?,?,?,?)`,
              [productId,String(v.id||`v-${vx+1}`),String(v.name||v.nom||''),toIntValue(v.stock,0),vx]
            );
          }
        }
        continue;
      }
      if(storeKey==='orders'){
        const payment=p.payment&&typeof p.payment==='object'?p.payment:{};
        await conn.execute(
          `INSERT INTO \`${mainTable}\` (row_id,order_id,vendeur_id,statut,total,date_commande,payment_status,payment_method,payload_json,created_at_txt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [row.rowId,toFiniteNumber(p.id,null),fkNumberOrNull(p.vendeurId,refs.vendeurs),String(p.statut||''),toFiniteNumber(p.total,0),String(p.dateCommande||''),String(payment.status||''),String(payment.method||''),payloadJson,createdAt]
        );
        const orderId=toFiniteNumber(p.id,null);
        if(orderId!==null){
          const items=Array.isArray(p.items)?p.items:[];
          for(let ox=0;ox<items.length;ox++){
            const it=items[ox]||{};
            await conn.execute(
              `INSERT INTO \`${REL_CHILD_TABLES.orderItems}\` (order_id,product_id,nom,prix,quantity,variant_id,sort_order,payload_json) VALUES (?,?,?,?,?,?,?,?)`,
              [orderId,fkNumberOrNull(it.id,refs.products),String(it.nom||''),toFiniteNumber(it.prix,0),Math.max(1,toIntValue(it.quantity,1)),String(it.variantId||''),ox,JSON.stringify(it)]
            );
          }
        }
        continue;
      }
      if(storeKey==='payments'){
        await conn.execute(
          `INSERT INTO \`${mainTable}\` (row_id,payment_id,order_id,vendeur_id,reference,status,method,provider,amount,payload_json,created_at_txt) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [row.rowId,toFiniteNumber(p.id,null),fkNumberOrNull(p.orderId,refs.orders),fkNumberOrNull(p.vendeurId,refs.vendeurs),(p.reference?String(p.reference):null),String(p.status||''),String(p.method||''),String(p.provider||''),toFiniteNumber(p.amount,0),payloadJson,createdAt]
        );
        continue;
      }
      if(storeKey==='reviews'){
        await conn.execute(
          `INSERT INTO \`${mainTable}\` (row_id,review_id,product_id,vendeur_id,rating,date_avis,payload_json,created_at_txt) VALUES (?,?,?,?,?,?,?,?)`,
          [row.rowId,toFiniteNumber(p.id,null),fkNumberOrNull(p.productId,refs.products),fkNumberOrNull(p.vendeurId,refs.vendeurs),toIntValue(p.rating,0),String(p.dateAvis||''),payloadJson,createdAt]
        );
        continue;
      }
      if(storeKey==='recovery'){
        await conn.execute(
          `INSERT INTO \`${mainTable}\` (row_id,vendeur_id,tel,code,expires_at,payload_json,created_at_txt) VALUES (?,?,?,?,?,?,?)`,
          [row.rowId,fkNumberOrNull(p.vendeurId,refs.vendeurs),String(p.tel||''),String(p.code||''),String(p.expiresAt||''),payloadJson,createdAt]
        );
        continue;
      }
      if(storeKey==='analytics'){
        await conn.execute(
          `INSERT INTO \`${mainTable}\` (row_id,event_id,event_name,vendeur_id,slug,session_id,event_at,payload_json) VALUES (?,?,?,?,?,?,?,?)`,
          [row.rowId,String(p.id||row.rowId),String(p.eventName||''),fkNumberOrNull(p.vendeurId,refs.vendeurs),String(p.slug||''),String(p.sessionId||''),String(p.at||createdAt||''),payloadJson]
        );
        continue;
      }
      if(storeKey==='experiments'){
        await conn.execute(
          `INSERT INTO \`${mainTable}\` (row_id,event_id,experiment_id,variant,event_name,event_at,payload_json) VALUES (?,?,?,?,?,?,?)`,
          [row.rowId,String(p.id||row.rowId),String(p.experimentId||''),String(p.variant||''),String(p.eventName||''),String(p.at||createdAt||''),payloadJson]
        );
        continue;
      }
      if(storeKey==='audit'){
        const actor=p.actor&&typeof p.actor==='object'?p.actor:{};
        await conn.execute(
          `INSERT INTO \`${mainTable}\` (row_id,audit_id,action,actor_role,actor_id,event_at,payload_json) VALUES (?,?,?,?,?,?,?)`,
          [row.rowId,String(p.id||row.rowId),String(p.action||''),String(actor.role||''),String(actor.id||''),String(p.at||createdAt||''),payloadJson]
        );
        continue;
      }
      if(storeKey==='automations'){
        await conn.execute(
          `INSERT INTO \`${mainTable}\` (row_id,automation_id,event_type,order_id,vendeur_id,status,event_at,payload_json) VALUES (?,?,?,?,?,?,?,?)`,
          [row.rowId,String(p.id||row.rowId),String(p.eventType||''),fkNumberOrNull(p.orderId,refs.orders),fkNumberOrNull(p.vendeurId,refs.vendeurs),String(p.status||''),String(p.at||createdAt||''),payloadJson]
        );
      }
    }
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
    await conn.commit();
  }catch(err){
    try{await conn.rollback();}catch{}
    throw err;
  }finally{
    try{await conn.query('SET FOREIGN_KEY_CHECKS=1');}catch{}
    conn.release();
  }
}

function queueMySQLPersist(storeKey){
  if(!MYSQL_ENABLED||!mysqlReady||!mysqlPool||!storeKey) return persistQueue;
  persistQueue=persistQueue.then(async()=>{
    await persistStoreImmediate(storeKey);
  }).catch((err)=>{console.error(`[MySQL] Persist error (${storeKey}):`,err.message);});
  return persistQueue;
}

async function flushMySQLPersistQueue(){
  if(!MYSQL_ENABLED||!mysqlPool) return;
  try{
    if(MYSQL_PERSIST_QUEUE_MAX_WAIT_MS>0){
      const timeoutPromise=new Promise((resolve)=>setTimeout(()=>resolve('timeout'),MYSQL_PERSIST_QUEUE_MAX_WAIT_MS));
      const result=await Promise.race([
        persistQueue.then(()=> 'done').catch(()=> 'done'),
        timeoutPromise
      ]);
      if(result==='timeout'){
        const now=Date.now();
        if(now-lastPersistQueueTimeoutAt>MYSQL_PERSIST_QUEUE_TIMEOUT_ALERT_INTERVAL_MS){
          lastPersistQueueTimeoutAt=now;
          console.warn(`[MySQL] Persist queue timeout after ${MYSQL_PERSIST_QUEUE_MAX_WAIT_MS}ms`);
          pushOpsAlert('warning','mysql_persist_queue_timeout','Persist queue trop lente',{timeoutMs:MYSQL_PERSIST_QUEUE_MAX_WAIT_MS});
        }
        return;
      }
      return;
    }
    await persistQueue;
  }catch{
    // Queue errors are already logged per write operation.
  }
}

const read=(f)=>{
  const storeKey=storeKeyFromFile(f);
  if(MYSQL_ENABLED&&mysqlReady&&storeKey) return cloneArray(storageCache[storeKey]);
  return readFileArray(f);
};

const write=(f,d)=>{
  const safe=Array.isArray(d)?d:[];
  const storeKey=storeKeyFromFile(f);
  if(MYSQL_SOURCE_OF_TRUTH&&MYSQL_ENABLED&&mysqlReady&&storeKey){
    storageCache[storeKey]=cloneArray(safe);
    queueMySQLPersist(storeKey);
    if(MYSQL_JSON_MIRROR_WRITES) writeFileArray(f,safe);
    return;
  }
  writeFileArray(f,safe);
  if(MYSQL_ENABLED&&mysqlReady&&storeKey){
    storageCache[storeKey]=cloneArray(safe);
    queueMySQLPersist(storeKey);
  }
};

const num=(v)=>{const n=Number(v);return Number.isFinite(n)?n:null};
const int=(v,d=0)=>{const n=parseInt(String(v),10);return Number.isFinite(n)&&n>=0?n:d};
const tel=(v)=>String(v||'').replace(/[^\d]/g,'');
const txt=(v,m=300)=>String(v||'').replace(/[<>]/g,'').replace(/\s+/g,' ').trim().slice(0,m);
const slugify=(v)=>{const b=String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').replace(/-{2,}/g,'-');return b||`boutique-${Date.now()}`};
const sv=(v)=>{if(!v)return null;const c={...v};delete c.password;delete c.motdepasse;return c};
const pwdHash=(v)=>v?(v.motdepasse||v.password||''):'';
const sig=(p,expiresIn='24h')=>jwt.sign(p,JWT_SECRET,{expiresIn});
const rid=()=>`${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const OPS_NOTIFY_LEVELS=new Set(OPS_ALERT_LEVELS);
const opsNotifyCache=new Map();

function normalizePhone(value){
  const raw=String(value||'').trim();
  if(!raw) return '';
  if(raw.startsWith('+')) return raw;
  const digits=tel(raw);
  if(!digits) return '';
  if(digits.length<=8&&OPS_ALERT_PHONE_COUNTRY_CODE){
    return `+${OPS_ALERT_PHONE_COUNTRY_CODE}${digits}`;
  }
  return `+${digits}`;
}

function parseCookies(req){
  const header=String(req&&req.headers?req.headers.cookie||'':'');
  if(!header) return {};
  const cookies={};
  header.split(';').forEach((part)=>{
    const idx=part.indexOf('=');
    if(idx<1) return;
    const key=part.slice(0,idx).trim();
    if(!key) return;
    const raw=part.slice(idx+1).trim();
    try{
      cookies[key]=decodeURIComponent(raw);
    }catch{
      cookies[key]=raw;
    }
  });
  return cookies;
}
function getCookie(req,name){
  const cookies=parseCookies(req);
  return cookies[name]||'';
}
function extractRequestAuthToken(req){
  const h=String(req.headers.authorization||'');
  if(h.startsWith('Bearer ')){
    const token=h.slice(7).trim();
    if(token) return {token,source:'bearer'};
  }
  const queryToken=String((req.query&&req.query.token)||'').trim();
  if(queryToken) return {token:queryToken,source:'query'};
  const cookieToken=getCookie(req,ADMIN_SESSION_COOKIE).trim();
  if(cookieToken) return {token:cookieToken,source:'cookie'};
  return {token:'',source:null};
}
function adminCookieOptions(){
  return {
    httpOnly:true,
    sameSite:ADMIN_COOKIE_SAMESITE,
    secure:ADMIN_COOKIE_SAMESITE==='none'?true:ADMIN_COOKIE_SECURE,
    path:'/',
    maxAge:ADMIN_SESSION_TTL_SECONDS*1000
  };
}
function setAdminSessionCookie(res,token){
  res.cookie(ADMIN_SESSION_COOKIE,token,adminCookieOptions());
}
function clearAdminSessionCookie(res){
  const options=adminCookieOptions();
  delete options.maxAge;
  res.clearCookie(ADMIN_SESSION_COOKIE,options);
}

function isForeignKeyError(err){
  const msg=String(err&&err.message||'').toLowerCase();
  return msg.includes('foreign key')||msg.includes('constraint fails');
}

async function sqlAppendStoreItem(storeKey,payload){
  if(!mysqlPool||!mysqlReady) return;
  const mainTable=tableForStoreKey(storeKey);
  if(!mainTable) return;
  const safe=payload&&typeof payload==='object'?payload:{};
  const rowId=rowIdForStore(storeKey,safe,0);
  const createdAt=inferCreatedAt(safe);
  const payloadJson=JSON.stringify(safe||{});

  if(storeKey==='analytics'){
    const eventId=String(safe.id||rowId);
    const vendeurId=toFiniteNumber(safe.vendeurId,null);
    try{
      await mysqlPool.execute(
        `INSERT INTO \`${mainTable}\` (row_id,event_id,event_name,vendeur_id,slug,session_id,event_at,payload_json)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           event_name=VALUES(event_name),
           vendeur_id=VALUES(vendeur_id),
           slug=VALUES(slug),
           session_id=VALUES(session_id),
           event_at=VALUES(event_at),
           payload_json=VALUES(payload_json),
           updated_at=CURRENT_TIMESTAMP`,
        [rowId,eventId,String(safe.eventName||''),vendeurId,String(safe.slug||''),String(safe.sessionId||''),String(safe.at||createdAt||''),payloadJson]
      );
      return;
    }catch(err){
      if(isForeignKeyError(err)&&vendeurId!==null){
        await mysqlPool.execute(
          `INSERT INTO \`${mainTable}\` (row_id,event_id,event_name,vendeur_id,slug,session_id,event_at,payload_json)
           VALUES (?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             event_name=VALUES(event_name),
             vendeur_id=VALUES(vendeur_id),
             slug=VALUES(slug),
             session_id=VALUES(session_id),
             event_at=VALUES(event_at),
             payload_json=VALUES(payload_json),
             updated_at=CURRENT_TIMESTAMP`,
          [rowId,eventId,String(safe.eventName||''),null,String(safe.slug||''),String(safe.sessionId||''),String(safe.at||createdAt||''),payloadJson]
        );
        return;
      }
      throw err;
    }
  }

  if(storeKey==='experiments'){
    const eventId=String(safe.id||rowId);
    await mysqlPool.execute(
      `INSERT INTO \`${mainTable}\` (row_id,event_id,experiment_id,variant,event_name,event_at,payload_json)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         experiment_id=VALUES(experiment_id),
         variant=VALUES(variant),
         event_name=VALUES(event_name),
         event_at=VALUES(event_at),
         payload_json=VALUES(payload_json),
         updated_at=CURRENT_TIMESTAMP`,
      [rowId,eventId,String(safe.experimentId||''),String(safe.variant||''),String(safe.eventName||''),String(safe.at||createdAt||''),payloadJson]
    );
    return;
  }

  if(storeKey==='audit'){
    const actor=safe.actor&&typeof safe.actor==='object'?safe.actor:{};
    const auditId=String(safe.id||rowId);
    await mysqlPool.execute(
      `INSERT INTO \`${mainTable}\` (row_id,audit_id,action,actor_role,actor_id,event_at,payload_json)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         action=VALUES(action),
         actor_role=VALUES(actor_role),
         actor_id=VALUES(actor_id),
         event_at=VALUES(event_at),
         payload_json=VALUES(payload_json),
         updated_at=CURRENT_TIMESTAMP`,
      [rowId,auditId,String(safe.action||''),String(actor.role||''),String(actor.id||''),String(safe.at||createdAt||''),payloadJson]
    );
    return;
  }

  if(storeKey==='automations'){
    const automationId=String(safe.id||rowId);
    const orderId=toFiniteNumber(safe.orderId,null);
    const vendeurId=toFiniteNumber(safe.vendeurId,null);
    try{
      await mysqlPool.execute(
        `INSERT INTO \`${mainTable}\` (row_id,automation_id,event_type,order_id,vendeur_id,status,event_at,payload_json)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           event_type=VALUES(event_type),
           order_id=VALUES(order_id),
           vendeur_id=VALUES(vendeur_id),
           status=VALUES(status),
           event_at=VALUES(event_at),
           payload_json=VALUES(payload_json),
           updated_at=CURRENT_TIMESTAMP`,
        [rowId,automationId,String(safe.eventType||''),orderId,vendeurId,String(safe.status||''),String(safe.at||createdAt||''),payloadJson]
      );
      return;
    }catch(err){
      if(isForeignKeyError(err)&&(orderId!==null||vendeurId!==null)){
        await mysqlPool.execute(
          `INSERT INTO \`${mainTable}\` (row_id,automation_id,event_type,order_id,vendeur_id,status,event_at,payload_json)
           VALUES (?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             event_type=VALUES(event_type),
             order_id=VALUES(order_id),
             vendeur_id=VALUES(vendeur_id),
             status=VALUES(status),
             event_at=VALUES(event_at),
             payload_json=VALUES(payload_json),
             updated_at=CURRENT_TIMESTAMP`,
          [rowId,automationId,String(safe.eventType||''),null,null,String(safe.status||''),String(safe.at||createdAt||''),payloadJson]
        );
        return;
      }
      throw err;
    }
  }
}

function queueMySQLAppend(storeKey,payload){
  if(!MYSQL_ENABLED||!mysqlReady||!mysqlPool) return;
  appendQueue=appendQueue.then(()=>sqlAppendStoreItem(storeKey,payload)).catch((err)=>{
    console.error(`[MySQL] Append error (${storeKey}):`,err.message);
    logOpsError(err,'mysql.append');
  });
}

function append(f,item,max=10000){
  const storeKey=storeKeyFromFile(f);
  if(MYSQL_SOURCE_OF_TRUTH&&MYSQL_ENABLED&&mysqlReady&&storeKey&&APPEND_DIRECT_KEYS.has(storeKey)){
    const payload=item&&typeof item==='object'?item:{};
    const current=Array.isArray(storageCache[storeKey])?storageCache[storeKey]:[];
    if(current!==storageCache[storeKey]) storageCache[storeKey]=current;
    current.push(payload);
    if(current.length>max) current.splice(0,current.length-max);
    if(MYSQL_JSON_MIRROR_WRITES&&FILE[storeKey]) writeFileArray(FILE[storeKey],current);
    queueMySQLAppend(storeKey,payload);
    return;
  }
  const a=read(f);a.push(item);if(a.length>max)a.splice(0,a.length-max);write(f,a);
}
function appendObs(filePath,item,max=5000){
  const entries=readFileArray(filePath);
  entries.push(item);
  if(entries.length>max) entries.splice(0,entries.length-max);
  writeFileArray(filePath,entries);
}
function pushOpsAlert(level,code,message,meta={}){
  const entry={id:`alert_${rid()}`,at:new Date().toISOString(),level,code,message,meta};
  appendObs(OBS_FILE.alerts,entry,5000);
  const sink=String(level||'').toLowerCase()==='error'?console.error:console.warn;
  sink(`[OPS:${String(level||'info').toUpperCase()}][${code}] ${message}`);
  if(OPS_ALERTS_ENABLED){
    const timer=setTimeout(()=>{
      notifyOpsAlert(entry).catch((err)=>{
        logOpsError(err,'ops.alert.notify');
      });
    },0);
    if(timer&&typeof timer.unref==='function') timer.unref();
  }
}
function logOpsError(err,scope='server',req=null,meta={}){
  const entry={
    id:`err_${rid()}`,
    at:new Date().toISOString(),
    scope,
    requestId:req&&req.requestId?req.requestId:null,
    method:req&&req.method?req.method:null,
    url:req&&req.originalUrl?req.originalUrl:null,
    ip:req&&(req.ip||req.headers['x-forwarded-for'])?String(req.ip||req.headers['x-forwarded-for']):null,
    message:err&&err.message?String(err.message):String(err||'Erreur inconnue'),
    stack:err&&err.stack?String(err.stack).split('\n').slice(0,12).join('\n'):null,
    meta
  };
  appendObs(OBS_FILE.errors,entry,8000);
}
function logBackupEvent(type,payload={}){
  const entry={id:`backup_${rid()}`,at:new Date().toISOString(),type,...payload};
  appendObs(OBS_FILE.backups,entry,5000);
}
function cleanupAuthFailures(){
  const now=Date.now();
  for(const [key,state] of authFailures.entries()){
    const lastEvent=Math.max(Number(state.lastFailAt)||0,Number(state.lockedUntil)||0);
    if(!lastEvent||now-lastEvent>AUTH_FAILURE_WINDOW_MS*2){
      authFailures.delete(key);
    }
  }
}
function authFailureKey(scope,identity,req){
  const safeScope=txt(scope,30)||'auth';
  const safeIdentity=txt(String(identity||'unknown').toLowerCase(),120)||'unknown';
  const ip=txt((req&&(req.ip||req.headers['x-forwarded-for']))||'0.0.0.0',120)||'0.0.0.0';
  return `${safeScope}:${safeIdentity}:${ip}`;
}
function authFailureState(key){
  cleanupAuthFailures();
  const now=Date.now();
  const state=authFailures.get(key);
  if(!state) return {locked:false,retryAfterSec:0,count:0};
  if(state.lockedUntil&&state.lockedUntil>now){
    return {locked:true,retryAfterSec:Math.max(1,Math.ceil((state.lockedUntil-now)/1000)),count:int(state.count,0)};
  }
  return {locked:false,retryAfterSec:0,count:int(state.count,0)};
}
function clearAuthFailures(key){
  authFailures.delete(key);
}
function markAuthFailure(key){
  const now=Date.now();
  const prev=authFailures.get(key);
  const base=(prev&&now-(prev.firstFailAt||0)<=AUTH_FAILURE_WINDOW_MS)?prev:{count:0,firstFailAt:now,lockedUntil:0,lastFailAt:0};
  base.count=int(base.count,0)+1;
  base.lastFailAt=now;
  if(base.count>=AUTH_FAILURE_LIMIT){
    base.lockedUntil=now+AUTH_LOCK_MS;
  }
  authFailures.set(key,base);
  return authFailureState(key);
}
function isStrongPassword(value){
  const pwd=String(value||'');
  if(pwd.length<8) return false;
  if(!/[A-Za-z]/.test(pwd)) return false;
  if(!/\d/.test(pwd)) return false;
  return true;
}
function recoveryCodeHash(phone,code,salt){
  return crypto.createHash('sha256').update(`${RECOVERY_CODE_SECRET}:${tel(phone)}:${String(code||'').trim()}:${String(salt||'')}`).digest('hex');
}
function toVendeurTokenVersion(vendeur){
  const current=int(vendeur&&vendeur.tokenVersion,1);
  return current>0?current:1;
}
function audit(action,req,details={}){append(FILE.audit,{id:`audit_${rid()}`,at:new Date().toISOString(),action,ip:req?(req.ip||''):null,actor:req&&req.auth?{id:req.auth.id,role:req.auth.role}:{role:'public'},details},20000)}
function track(name,data={}){append(FILE.analytics,{id:`evt_${rid()}`,at:new Date().toISOString(),eventName:name,...data},100000)}
function trackExp(data){append(FILE.experiments,{id:`exp_${rid()}`,at:new Date().toISOString(),...data},50000)}
function antispam(req,res,next){ if(req.body&&(req.body.website||req.body.honeypot||req.body.botField)) return res.status(400).json({error:'Requete invalide'}); next(); }

async function mail(payload){ if(!mailer) return false; try{await mailer.sendMail(payload);return true}catch{return false} }

function parseCloudinaryUrl(raw){
  if(!raw) return null;
  try{
    const u=new URL(raw);
    const apiKey=decodeURIComponent(u.username||'');
    const apiSecret=decodeURIComponent(u.password||'');
    const cloudName=u.hostname||'';
    if(!apiKey||!apiSecret||!cloudName) return null;
    return {cloudName,apiKey,apiSecret};
  }catch{
    return null;
  }
}

function getCloudinaryConfig(){
  const fromUrl=parseCloudinaryUrl(CLOUDINARY_URL);
  const cloudName=fromUrl?fromUrl.cloudName:CLOUDINARY_CLOUD_NAME;
  const apiKey=fromUrl?fromUrl.apiKey:CLOUDINARY_API_KEY;
  const apiSecret=fromUrl?fromUrl.apiSecret:CLOUDINARY_API_SECRET;
  if(!cloudName||!apiKey||!apiSecret) return null;
  return {cloudName,apiKey,apiSecret,folder:CLOUDINARY_FOLDER};
}

const CLOUDINARY_CONFIG=getCloudinaryConfig();
const USE_CLOUDINARY=STORAGE_PROVIDER==='cloudinary'&&CLOUDINARY_CONFIG;
if(STORAGE_PROVIDER==='cloudinary'&&!CLOUDINARY_CONFIG){
  console.warn('[storage] CLOUDINARY config manquante, fallback local');
}

function cloudinarySignature(params,apiSecret){
  const parts=Object.keys(params)
    .sort()
    .map((key)=>`${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('sha1').update(`${parts}${apiSecret}`).digest('hex');
}

async function uploadToCloudinary(buffer,filename){
  if(!CLOUDINARY_CONFIG) throw new Error('Cloudinary non configure');
  const timestamp=Math.floor(Date.now()/1000);
  const publicId=String(filename||'image').replace(/\.[^/.]+$/,'');
  const params={
    folder:CLOUDINARY_CONFIG.folder,
    public_id:publicId,
    timestamp
  };
  const signature=cloudinarySignature(params,CLOUDINARY_CONFIG.apiSecret);
  const body=new URLSearchParams();
  body.set('file',`data:image/webp;base64,${buffer.toString('base64')}`);
  body.set('api_key',CLOUDINARY_CONFIG.apiKey);
  body.set('timestamp',String(timestamp));
  body.set('signature',signature);
  body.set('folder',CLOUDINARY_CONFIG.folder);
  body.set('public_id',publicId);
  const res=await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body
  });
  let data={};
  try{
    data=await res.json();
  }catch{
    data={};
  }
  if(!res.ok||!data.secure_url){
    throw new Error((data&&data.error&&data.error.message)||'Cloudinary upload failed');
  }
  return data;
}

function extractCloudinaryPublicId(url,cloudName){
  try{
    const u=new URL(url);
    if(!u.hostname.includes('res.cloudinary.com')) return null;
    const parts=u.pathname.split('/').filter(Boolean);
    const cloudIdx=parts.indexOf(cloudName);
    if(cloudIdx<0) return null;
    const uploadIdx=parts.indexOf('upload');
    if(uploadIdx<0||uploadIdx>=parts.length-1) return null;
    let segs=parts.slice(uploadIdx+1);
    if(segs[0]&&/^v\d+$/.test(segs[0])) segs=segs.slice(1);
    else if(segs[1]&&/^v\d+$/.test(segs[1])) segs=segs.slice(2);
    if(!segs.length) return null;
    const last=segs.pop();
    segs.push(last.replace(/\.[^/.]+$/,''));
    return segs.join('/');
  }catch{
    return null;
  }
}

async function destroyCloudinaryImage(url){
  if(!CLOUDINARY_CONFIG) return false;
  const publicId=extractCloudinaryPublicId(url,CLOUDINARY_CONFIG.cloudName);
  if(!publicId) return false;
  const timestamp=Math.floor(Date.now()/1000);
  const params={public_id:publicId,timestamp};
  const signature=cloudinarySignature(params,CLOUDINARY_CONFIG.apiSecret);
  const body=new URLSearchParams();
  body.set('public_id',publicId);
  body.set('api_key',CLOUDINARY_CONFIG.apiKey);
  body.set('timestamp',String(timestamp));
  body.set('signature',signature);
  const res=await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/destroy`,{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body
  });
  if(!res.ok){
    const text=await res.text().catch(()=> '');
    throw new Error(`Cloudinary destroy failed (${res.status}): ${text.slice(0,200)}`);
  }
  return true;
}
function buildOpsAlertText(entry){
  const lines=[
    `[WhaBiz] Alerte OPS`,
    `Niveau: ${String(entry.level||'info').toUpperCase()}`,
    `Code: ${entry.code}`,
    `Message: ${entry.message}`,
    `Date: ${entry.at}`
  ];
  const meta=entry.meta&&Object.keys(entry.meta).length?JSON.stringify(entry.meta,null,2):'';
  if(meta) lines.push(`Meta: ${meta}`);
  return lines.join('\n');
}
async function notifyOpsAlertByEmail(entry){
  if(!OPS_ALERT_EMAIL_TO) return false;
  if(!mailer){
    logOpsError(new Error('SMTP non configure'), 'ops.alert.email');
    return false;
  }
  const subject=`[WhaBiz][${String(entry.level||'info').toUpperCase()}] ${entry.code}`;
  const text=buildOpsAlertText(entry);
  const html=`<pre style="font-family:Segoe UI,Arial,Helvetica,sans-serif;white-space:pre-wrap">${text}</pre>`;
  return mail({from:OPS_ALERT_EMAIL_FROM,to:OPS_ALERT_EMAIL_TO,subject,html});
}
async function notifyOpsAlertByWhatsApp(entry){
  if(!OPS_ALERT_WHATSAPP_WEBHOOK_URL||!OPS_ALERT_WHATSAPP_TO) return false;
  if(typeof fetch!=='function'){
    logOpsError(new Error('fetch indisponible'), 'ops.alert.whatsapp');
    return false;
  }
  const to=normalizePhone(OPS_ALERT_WHATSAPP_TO);
  if(!to) return false;
  const payload={
    app:'WhaBiz',
    to,
    level:entry.level,
    code:entry.code,
    message:entry.message,
    at:entry.at,
    meta:entry.meta||{}
  };
  const headers={'Content-Type':'application/json'};
  if(OPS_ALERT_WHATSAPP_TOKEN){
    headers.Authorization=`Bearer ${OPS_ALERT_WHATSAPP_TOKEN}`;
  }
  const res=await fetch(OPS_ALERT_WHATSAPP_WEBHOOK_URL,{method:'POST',headers,body:JSON.stringify(payload)});
  if(!res.ok){
    throw new Error(`WhatsApp webhook ${res.status}`);
  }
  return true;
}
async function notifyOpsAlertByWhatsAppTwilio(entry){
  if(!TWILIO_ACCOUNT_SID||!TWILIO_AUTH_TOKEN||!OPS_ALERT_WHATSAPP_FROM||!OPS_ALERT_WHATSAPP_TO) return false;
  if(typeof fetch!=='function'){
    logOpsError(new Error('fetch indisponible'), 'ops.alert.twilio');
    return false;
  }
  const to=normalizePhone(OPS_ALERT_WHATSAPP_TO);
  if(!to) return false;
  const from=OPS_ALERT_WHATSAPP_FROM.startsWith('whatsapp:')
    ? OPS_ALERT_WHATSAPP_FROM
    : `whatsapp:${OPS_ALERT_WHATSAPP_FROM}`;
  const body=buildOpsAlertText(entry).slice(0,1600);
  const form=new URLSearchParams();
  form.set('To',`whatsapp:${to}`);
  form.set('From',from);
  form.set('Body',body);
  const auth=Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const res=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,{
    method:'POST',
    headers:{
      Authorization:`Basic ${auth}`,
      'Content-Type':'application/x-www-form-urlencoded'
    },
    body:form
  });
  if(!res.ok){
    const text=await res.text().catch(()=> '');
    throw new Error(`Twilio WhatsApp ${res.status}: ${text.slice(0,200)}`);
  }
  return true;
}
async function notifyOpsAlert(entry){
  if(!OPS_ALERTS_ENABLED) return;
  const level=String(entry.level||'info').toLowerCase();
  if(OPS_NOTIFY_LEVELS.size&&!OPS_NOTIFY_LEVELS.has(level)) return;
  const key=`${level}:${entry.code}`;
  const now=Date.now();
  const last=opsNotifyCache.get(key)||0;
  if(now-last<OPS_ALERT_THROTTLE_MINUTES*60*1000) return;
  opsNotifyCache.set(key,now);
  const tasks=[];
  if(OPS_ALERT_EMAIL_TO) tasks.push(notifyOpsAlertByEmail(entry));
  const provider=OPS_ALERT_WHATSAPP_PROVIDER||'';
  if(provider==='twilio'){
    tasks.push(notifyOpsAlertByWhatsAppTwilio(entry));
  }else if(provider==='webhook'||(!provider&&OPS_ALERT_WHATSAPP_WEBHOOK_URL)){
    if(OPS_ALERT_WHATSAPP_WEBHOOK_URL&&OPS_ALERT_WHATSAPP_TO){
      tasks.push(notifyOpsAlertByWhatsApp(entry));
    }
  }
  if(!tasks.length) return;
  const results=await Promise.allSettled(tasks);
  results.forEach((result)=>{
    if(result.status==='rejected'){
      logOpsError(result.reason,'ops.alert.notify');
    }
  });
}
async function saveImage(buf){
  const file=`product-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.webp`;
  const optimized=await sharp(buf).resize(1200,1200,{fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
  if(USE_CLOUDINARY){
    const uploaded=await uploadToCloudinary(optimized,file);
    return uploaded.secure_url||uploaded.url;
  }
  const p1=path.join(PROD_UPLOADS,file); const p2=path.join(FRONT_UPLOADS,file);
  fs.writeFileSync(p1,optimized);
  try{fs.copyFileSync(p1,p2)}catch{}
  return `/uploads/products/${file}`;
}
function rmImage(u){
  if(!u) return;
  if(USE_CLOUDINARY){
    void destroyCloudinaryImage(u).catch((err)=>{
      console.error('[cloudinary] delete failed:',err.message);
    });
    return;
  }
  const f=path.basename(u);
  [path.join(PROD_UPLOADS,f),path.join(FRONT_UPLOADS,f)].forEach((p)=>{
    if(fs.existsSync(p)) try{fs.unlinkSync(p)}catch{}
  });
}

function auth(req,res,next){
  const extracted=extractRequestAuthToken(req);
  const token=extracted.token;
  if(!token) return res.status(401).json({error:'Authentification requise'});
  try{
    const decoded=jwt.verify(token,JWT_SECRET);
    if(extracted.source==='cookie'&&decoded.role!=='admin'){
      clearAdminSessionCookie(res);
      return res.status(401).json({error:'Session invalide'});
    }
    if(decoded.role==='vendeur'){
      const vendeurs=read(FILE.vendeurs);
      const current=vendeurs.find((v)=>Number(v.id)===Number(decoded.id));
      if(!current||current.actif===false){
        return res.status(401).json({error:'Session invalide'});
      }
      const expectedVersion=toVendeurTokenVersion(current);
      if(decoded.tv!==undefined&&Number(decoded.tv)!==expectedVersion){
        return res.status(401).json({error:'Session expiree, reconnecte-toi'});
      }
    }
    req.auth=decoded;
    req.authSource=extracted.source;
    next();
  }catch{
    if(extracted.source==='cookie'){
      clearAdminSessionCookie(res);
      return res.status(401).json({error:'Session admin invalide ou expiree'});
    }
    return res.status(401).json({error:'Token invalide ou expire'});
  }
}
function role(...r){return(req,res,next)=>{if(!req.auth||!r.includes(req.auth.role))return res.status(403).json({error:'Acces refuse'});next()}}
function can(authData,vendeurId){if(!authData)return false; if(authData.role==='admin')return true; return authData.role==='vendeur'&&Number(authData.id)===Number(vendeurId)}
function guard(req,res,vendeurId){if(!can(req.auth,vendeurId)){res.status(403).json({error:'Action non autorisee'});return false}return true}

function csv(rows){return rows.map((r)=>r.map((v)=>{const t=String(v??'');return(/[",\n]/.test(t))?`"${t.replace(/"/g,'""')}"`:t}).join(',')).join('\n')}

function backup(reason='auto'){
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  FILE_KEYS.forEach((key)=>{
    const sourceFile=FILE[key];
    const target=path.join(BACKUPS,`${stamp}-${reason}-${key}.json`);
    try{
      if(MYSQL_SOURCE_OF_TRUTH&&MYSQL_ENABLED){
        fs.writeFileSync(target,JSON.stringify(cloneArray(storageCache[key]),null,2));
      }else{
        fs.copyFileSync(sourceFile,target);
      }
    }catch{}
  });
}
function extractJsonFromOutput(output){
  const lines=String(output||'').trim().split(/\r?\n/);
  for(let i=lines.length-1;i>=0;i--){
    const line=String(lines[i]||'').trim();
    if(!line) continue;
    const parsed=parseJson(line,null);
    if(parsed&&typeof parsed==='object') return parsed;
  }
  return null;
}
async function runMySQLBundleBackup(reason='auto'){
  if(!MYSQL_BACKUP_AUTO||!MYSQL_ENABLED||!mysqlReady) return;
  const scriptPath=path.join(ROOT,'scripts','backup-mysql-bundle.js');
  if(!fs.existsSync(scriptPath)) return;
  try{
    const mod=require(scriptPath);
    if(!mod||typeof mod.runBackup!=='function'){
      throw new Error('runBackup export introuvable');
    }
    const summary=await mod.runBackup({reason:String(reason||'auto'),quiet:true})||{};
    logBackupEvent('mysql_backup',{
      ok:true,
      reason:String(reason||'auto'),
      file:summary.file||null,
      sha256:summary.sha256||null,
      sizeBytes:summary.sizeBytes||null,
      tables:summary.tables||null
    });
  }catch(err){
    const errText=String(err&&err.message||err||'').trim()||'Backup script failed';
    const noTargetTables=/Aucune table cible trouvee|Aucune table trouvee/i.test(errText);
    if(noTargetTables&&reason==='startup'){
      pushOpsAlert('warning','mysql_backup_startup_delayed','Backup MySQL differe: tables cible non detectees au demarrage',{reason,stderr:errText.slice(-300)});
      if(!mysqlBackupStartupRetryScheduled){
        mysqlBackupStartupRetryScheduled=true;
        setTimeout(()=>runMySQLBundleBackup('startup_retry'),60*1000).unref();
      }
      logBackupEvent('mysql_backup',{ok:false,reason:String(reason||'startup'),error:errText.slice(-300)});
      return;
    }
    logOpsError(new Error(errText),'backup.mysql');
    pushOpsAlert('error','mysql_backup_failed','Echec du backup MySQL automatique',{code:1,reason,stderr:errText.slice(-300)});
    logBackupEvent('mysql_backup',{ok:false,reason:String(reason||'auto'),error:errText.slice(-300)});
  }
}
async function runMySQLRestoreTest(reason='auto'){
  if(!MYSQL_RESTORE_TEST_AUTO||!MYSQL_ENABLED||!mysqlReady) return;
  const scriptPath=path.join(ROOT,'scripts','restore-mysql-bundle.js');
  if(!fs.existsSync(scriptPath)) return;
  const targetDb=MYSQL_RESTORE_TEST_DB||`${MYSQL_DATABASE}_restore_test`;
  try{
    const mod=require(scriptPath);
    if(!mod||typeof mod.runRestore!=='function'){
      throw new Error('runRestore export introuvable');
    }
    const summary=await mod.runRestore({
      latest:true,
      targetDb:String(targetDb),
      dropTarget:true,
      verify:true,
      dropAfterVerify:true,
      quiet:true
    })||{};
    logBackupEvent('mysql_restore_test',{
      ok:true,
      reason:String(reason||'auto'),
      targetDb:summary.targetDb||targetDb,
      backupFile:summary.backupFile||null,
      verified:summary.verified===true
    });
  }catch(err){
    const errText=String(err&&err.message||err||'').trim()||'Restore test failed';
    logOpsError(new Error(errText),'backup.restore');
    pushOpsAlert('error','mysql_restore_test_failed','Echec test restauration MySQL',{reason,targetDb,stderr:errText.slice(-300)});
    logBackupEvent('mysql_restore_test',{ok:false,reason:String(reason||'auto'),targetDb,error:errText.slice(-300)});
  }
}
function startBackupScheduler(){
  if(backupTimerStarted) return;
  backup('startup');
  setInterval(()=>backup('auto'),JSON_BACKUP_INTERVAL_HOURS*60*60*1000).unref();
  backupTimerStarted=true;
  if(mysqlBackupTimerStarted) return;
  if(MYSQL_BACKUP_AUTO){
    setTimeout(()=>runMySQLBundleBackup('startup'),5000).unref();
    setInterval(()=>runMySQLBundleBackup('auto'),MYSQL_BACKUP_INTERVAL_HOURS*60*60*1000).unref();
    mysqlBackupTimerStarted=true;
  }
  if(MYSQL_RESTORE_TEST_AUTO&&!mysqlRestoreTestTimerStarted){
    setTimeout(()=>runMySQLRestoreTest('startup'),15000).unref();
    setInterval(()=>runMySQLRestoreTest('auto'),MYSQL_RESTORE_TEST_INTERVAL_HOURS*60*60*1000).unref();
    mysqlRestoreTestTimerStarted=true;
  }
}

async function mysqlTableExists(tableName){
  const [rows]=await mysqlPool.execute(
    'SELECT 1 AS ok FROM information_schema.tables WHERE table_schema=? AND table_name=? LIMIT 1',
    [MYSQL_DATABASE,tableName]
  );
  return Array.isArray(rows)&&rows.length>0;
}

function listSqlMigrationFiles(){
  if(!fs.existsSync(DB_MIGRATIONS_DIR)) return [];
  return fs.readdirSync(DB_MIGRATIONS_DIR)
    .filter((name)=>name.toLowerCase().endsWith('.sql'))
    .sort((a,b)=>a.localeCompare(b));
}

function splitSqlStatements(sql){
  return String(sql||'')
    .split(/;\s*\r?\n/g)
    .map((stmt)=>stmt.trim())
    .map((stmt)=>stmt.endsWith(';')?stmt.slice(0,-1).trim():stmt)
    .filter(Boolean);
}

async function ensureMigrationTable(){
  await mysqlPool.execute(
    'CREATE TABLE IF NOT EXISTS `schema_migrations` (migration_name VARCHAR(191) PRIMARY KEY,checksum CHAR(64) NOT NULL,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  );
}

async function runSqlMigrations(){
  if(!mysqlPool) return;
  await ensureMigrationTable();
  const files=listSqlMigrationFiles();
  for(const fileName of files){
    const fullPath=path.join(DB_MIGRATIONS_DIR,fileName);
    const sql=fs.readFileSync(fullPath,'utf8');
    const checksum=crypto.createHash('sha256').update(sql).digest('hex');
    const [existing]=await mysqlPool.execute('SELECT checksum FROM `schema_migrations` WHERE migration_name=? LIMIT 1',[fileName]);
    if(Array.isArray(existing)&&existing.length){
      if(existing[0].checksum!==checksum){
        throw new Error(`Migration checksum mismatch for ${fileName}`);
      }
      continue;
    }
    const statements=splitSqlStatements(sql);
    const conn=await mysqlPool.getConnection();
    try{
      await conn.beginTransaction();
      for(const statement of statements){
        await conn.query(statement);
      }
      await conn.execute('INSERT INTO `schema_migrations` (migration_name,checksum) VALUES (?,?)',[fileName,checksum]);
      await conn.commit();
      console.log(`[MySQL] Migration applied: ${fileName}`);
    }catch(err){
      try{await conn.rollback();}catch{}
      throw err;
    }finally{
      conn.release();
    }
  }
}

async function persistRuntimeStorageSettings(){
  if(!mysqlPool) return;
  const settings=[
    ['storage.mode',MYSQL_ENABLED?'mysql':'json'],
    ['storage.mysql_source_of_truth',MYSQL_SOURCE_OF_TRUTH?'1':'0'],
    ['storage.mysql_json_mirror_writes',MYSQL_JSON_MIRROR_WRITES?'1':'0']
  ];
  for(const [key,value] of settings){
    await mysqlPool.execute(
      'INSERT INTO `app_runtime_settings` (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_at=CURRENT_TIMESTAMP',
      [key,value]
    );
  }
}

async function ensureMySQLStoreTables(){
  await mysqlPool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.vendeurs}\` (row_id VARCHAR(191) PRIMARY KEY,vendeur_id BIGINT NULL,role VARCHAR(30) NULL,nom VARCHAR(180) NULL,email VARCHAR(190) NULL,tel VARCHAR(40) NULL,boutique VARCHAR(190) NULL,slug VARCHAR(220) NULL,plan VARCHAR(40) NULL,actif TINYINT(1) NULL,date_inscription VARCHAR(40) NULL,payload_json LONGTEXT NOT NULL,created_at_txt VARCHAR(40) NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_vendeurs_id(vendeur_id),KEY idx_rel_vendeurs_slug(slug),KEY idx_rel_vendeurs_tel(tel)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await mysqlPool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.products}\` (row_id VARCHAR(191) PRIMARY KEY,product_id BIGINT NULL,vendeur_id BIGINT NULL,nom VARCHAR(190) NULL,categorie VARCHAR(120) NULL,prix DECIMAL(14,2) NULL,stock INT NULL,payload_json LONGTEXT NOT NULL,created_at_txt VARCHAR(40) NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_products_id(product_id),KEY idx_rel_products_vendeur(vendeur_id),KEY idx_rel_products_category(categorie)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await mysqlPool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_CHILD_TABLES.productImages}\` (id BIGINT AUTO_INCREMENT PRIMARY KEY,product_id BIGINT NULL,image_url VARCHAR(500) NULL,sort_order INT NULL,KEY idx_rel_product_images_product(product_id)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await mysqlPool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_CHILD_TABLES.productVariants}\` (id BIGINT AUTO_INCREMENT PRIMARY KEY,product_id BIGINT NULL,variant_id VARCHAR(120) NULL,name VARCHAR(190) NULL,stock INT NULL,sort_order INT NULL,KEY idx_rel_product_variants_product(product_id)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await mysqlPool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.orders}\` (row_id VARCHAR(191) PRIMARY KEY,order_id BIGINT NULL,vendeur_id BIGINT NULL,statut VARCHAR(60) NULL,total DECIMAL(14,2) NULL,date_commande VARCHAR(40) NULL,payment_status VARCHAR(60) NULL,payment_method VARCHAR(80) NULL,payload_json LONGTEXT NOT NULL,created_at_txt VARCHAR(40) NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_orders_id(order_id),KEY idx_rel_orders_vendeur(vendeur_id),KEY idx_rel_orders_statut(statut),KEY idx_rel_orders_date(date_commande)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await mysqlPool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_CHILD_TABLES.orderItems}\` (id BIGINT AUTO_INCREMENT PRIMARY KEY,order_id BIGINT NULL,product_id BIGINT NULL,nom VARCHAR(190) NULL,prix DECIMAL(14,2) NULL,quantity INT NULL,variant_id VARCHAR(120) NULL,sort_order INT NULL,payload_json LONGTEXT NULL,KEY idx_rel_order_items_order(order_id),KEY idx_rel_order_items_product(product_id)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await mysqlPool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.payments}\` (row_id VARCHAR(191) PRIMARY KEY,payment_id BIGINT NULL,order_id BIGINT NULL,vendeur_id BIGINT NULL,reference VARCHAR(190) NULL,status VARCHAR(60) NULL,method VARCHAR(80) NULL,provider VARCHAR(120) NULL,amount DECIMAL(14,2) NULL,payload_json LONGTEXT NOT NULL,created_at_txt VARCHAR(40) NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_payments_order(order_id),KEY idx_rel_payments_reference(reference),KEY idx_rel_payments_status(status)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await mysqlPool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.reviews}\` (row_id VARCHAR(191) PRIMARY KEY,review_id BIGINT NULL,product_id BIGINT NULL,vendeur_id BIGINT NULL,rating INT NULL,date_avis VARCHAR(40) NULL,payload_json LONGTEXT NOT NULL,created_at_txt VARCHAR(40) NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_reviews_product(product_id),KEY idx_rel_reviews_vendeur(vendeur_id)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await mysqlPool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.recovery}\` (row_id VARCHAR(191) PRIMARY KEY,vendeur_id BIGINT NULL,tel VARCHAR(40) NULL,code VARCHAR(20) NULL,expires_at VARCHAR(40) NULL,payload_json LONGTEXT NOT NULL,created_at_txt VARCHAR(40) NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_recovery_vendeur(vendeur_id),KEY idx_rel_recovery_tel(tel)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await mysqlPool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.analytics}\` (row_id VARCHAR(191) PRIMARY KEY,event_id VARCHAR(191) NULL,event_name VARCHAR(120) NULL,vendeur_id BIGINT NULL,slug VARCHAR(220) NULL,session_id VARCHAR(191) NULL,event_at VARCHAR(40) NULL,payload_json LONGTEXT NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_analytics_event(event_name),KEY idx_rel_analytics_vendeur(vendeur_id),KEY idx_rel_analytics_at(event_at)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await mysqlPool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.experiments}\` (row_id VARCHAR(191) PRIMARY KEY,event_id VARCHAR(191) NULL,experiment_id VARCHAR(191) NULL,variant VARCHAR(120) NULL,event_name VARCHAR(120) NULL,event_at VARCHAR(40) NULL,payload_json LONGTEXT NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_experiments_id(experiment_id),KEY idx_rel_experiments_variant(variant)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await mysqlPool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.audit}\` (row_id VARCHAR(191) PRIMARY KEY,audit_id VARCHAR(191) NULL,action VARCHAR(190) NULL,actor_role VARCHAR(40) NULL,actor_id VARCHAR(120) NULL,event_at VARCHAR(40) NULL,payload_json LONGTEXT NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_audit_action(action),KEY idx_rel_audit_actor(actor_id),KEY idx_rel_audit_at(event_at)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await mysqlPool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.automations}\` (row_id VARCHAR(191) PRIMARY KEY,automation_id VARCHAR(191) NULL,event_type VARCHAR(120) NULL,order_id BIGINT NULL,vendeur_id BIGINT NULL,status VARCHAR(60) NULL,event_at VARCHAR(40) NULL,payload_json LONGTEXT NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_automations_order(order_id),KEY idx_rel_automations_vendeur(vendeur_id),KEY idx_rel_automations_type(event_type)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
}

async function mysqlIndexExists(tableName,indexName){
  const [rows]=await mysqlPool.execute(
    'SELECT 1 AS ok FROM information_schema.statistics WHERE table_schema=? AND table_name=? AND index_name=? LIMIT 1',
    [MYSQL_DATABASE,tableName,indexName]
  );
  return Array.isArray(rows)&&rows.length>0;
}

async function mysqlForeignKeyExists(tableName,constraintName){
  const [rows]=await mysqlPool.execute(
    'SELECT 1 AS ok FROM information_schema.referential_constraints WHERE constraint_schema=? AND table_name=? AND constraint_name=? LIMIT 1',
    [MYSQL_DATABASE,tableName,constraintName]
  );
  return Array.isArray(rows)&&rows.length>0;
}

async function ensureIndex(tableName,indexName,columns,unique=false){
  if(await mysqlIndexExists(tableName,indexName)) return;
  const uniq=unique?'UNIQUE ':'';
  await mysqlPool.execute(`CREATE ${uniq}INDEX \`${indexName}\` ON \`${tableName}\` (${columns})`);
}

async function ensureForeignKey(tableName,constraintName,column,refTable,refColumn,onDelete='SET NULL',onUpdate='CASCADE'){
  if(await mysqlForeignKeyExists(tableName,constraintName)) return;
  await mysqlPool.execute(
    `ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${constraintName}\` FOREIGN KEY (\`${column}\`) REFERENCES \`${refTable}\`(\`${refColumn}\`) ON DELETE ${onDelete} ON UPDATE ${onUpdate}`
  );
}

async function normalizeRelationalReferences(){
  await mysqlPool.execute(`UPDATE \`${REL_MAIN_TABLES.vendeurs}\` SET slug=NULL WHERE slug IS NOT NULL AND TRIM(slug)=''`);
  await mysqlPool.execute(`UPDATE \`${REL_MAIN_TABLES.vendeurs}\` SET email=NULL WHERE email IS NOT NULL AND TRIM(email)=''`);
  await mysqlPool.execute(`UPDATE \`${REL_MAIN_TABLES.vendeurs}\` SET tel=NULL WHERE tel IS NOT NULL AND TRIM(tel)=''`);
  await mysqlPool.execute(`UPDATE \`${REL_MAIN_TABLES.payments}\` SET reference=NULL WHERE reference IS NOT NULL AND TRIM(reference)=''`);
  await mysqlPool.execute(`UPDATE \`${REL_MAIN_TABLES.products}\` p LEFT JOIN \`${REL_MAIN_TABLES.vendeurs}\` v ON v.vendeur_id=p.vendeur_id SET p.vendeur_id=NULL WHERE p.vendeur_id IS NOT NULL AND v.vendeur_id IS NULL`);
  await mysqlPool.execute(`UPDATE \`${REL_MAIN_TABLES.orders}\` o LEFT JOIN \`${REL_MAIN_TABLES.vendeurs}\` v ON v.vendeur_id=o.vendeur_id SET o.vendeur_id=NULL WHERE o.vendeur_id IS NOT NULL AND v.vendeur_id IS NULL`);
  await mysqlPool.execute(`UPDATE \`${REL_MAIN_TABLES.payments}\` p LEFT JOIN \`${REL_MAIN_TABLES.orders}\` o ON o.order_id=p.order_id SET p.order_id=NULL WHERE p.order_id IS NOT NULL AND o.order_id IS NULL`);
  await mysqlPool.execute(`UPDATE \`${REL_MAIN_TABLES.payments}\` p LEFT JOIN \`${REL_MAIN_TABLES.vendeurs}\` v ON v.vendeur_id=p.vendeur_id SET p.vendeur_id=NULL WHERE p.vendeur_id IS NOT NULL AND v.vendeur_id IS NULL`);
  await mysqlPool.execute(`UPDATE \`${REL_MAIN_TABLES.reviews}\` r LEFT JOIN \`${REL_MAIN_TABLES.products}\` p ON p.product_id=r.product_id SET r.product_id=NULL WHERE r.product_id IS NOT NULL AND p.product_id IS NULL`);
  await mysqlPool.execute(`UPDATE \`${REL_MAIN_TABLES.reviews}\` r LEFT JOIN \`${REL_MAIN_TABLES.vendeurs}\` v ON v.vendeur_id=r.vendeur_id SET r.vendeur_id=NULL WHERE r.vendeur_id IS NOT NULL AND v.vendeur_id IS NULL`);
  await mysqlPool.execute(`UPDATE \`${REL_MAIN_TABLES.recovery}\` r LEFT JOIN \`${REL_MAIN_TABLES.vendeurs}\` v ON v.vendeur_id=r.vendeur_id SET r.vendeur_id=NULL WHERE r.vendeur_id IS NOT NULL AND v.vendeur_id IS NULL`);
  await mysqlPool.execute(`UPDATE \`${REL_MAIN_TABLES.analytics}\` a LEFT JOIN \`${REL_MAIN_TABLES.vendeurs}\` v ON v.vendeur_id=a.vendeur_id SET a.vendeur_id=NULL WHERE a.vendeur_id IS NOT NULL AND v.vendeur_id IS NULL`);
  await mysqlPool.execute(`UPDATE \`${REL_MAIN_TABLES.automations}\` a LEFT JOIN \`${REL_MAIN_TABLES.orders}\` o ON o.order_id=a.order_id SET a.order_id=NULL WHERE a.order_id IS NOT NULL AND o.order_id IS NULL`);
  await mysqlPool.execute(`UPDATE \`${REL_MAIN_TABLES.automations}\` a LEFT JOIN \`${REL_MAIN_TABLES.vendeurs}\` v ON v.vendeur_id=a.vendeur_id SET a.vendeur_id=NULL WHERE a.vendeur_id IS NOT NULL AND v.vendeur_id IS NULL`);
  await mysqlPool.execute(`UPDATE \`${REL_CHILD_TABLES.productImages}\` i LEFT JOIN \`${REL_MAIN_TABLES.products}\` p ON p.product_id=i.product_id SET i.product_id=NULL WHERE i.product_id IS NOT NULL AND p.product_id IS NULL`);
  await mysqlPool.execute(`UPDATE \`${REL_CHILD_TABLES.productVariants}\` v LEFT JOIN \`${REL_MAIN_TABLES.products}\` p ON p.product_id=v.product_id SET v.product_id=NULL WHERE v.product_id IS NOT NULL AND p.product_id IS NULL`);
  await mysqlPool.execute(`UPDATE \`${REL_CHILD_TABLES.orderItems}\` i LEFT JOIN \`${REL_MAIN_TABLES.orders}\` o ON o.order_id=i.order_id SET i.order_id=NULL WHERE i.order_id IS NOT NULL AND o.order_id IS NULL`);
  await mysqlPool.execute(`UPDATE \`${REL_CHILD_TABLES.orderItems}\` i LEFT JOIN \`${REL_MAIN_TABLES.products}\` p ON p.product_id=i.product_id SET i.product_id=NULL WHERE i.product_id IS NOT NULL AND p.product_id IS NULL`);
}

async function ensureRelationalConstraintsAndIndexes(){
  await normalizeRelationalReferences();

  await ensureIndex(REL_MAIN_TABLES.vendeurs,'uq_rel_vendeurs_vendeur_id','vendeur_id',true);
  await ensureIndex(REL_MAIN_TABLES.vendeurs,'uq_rel_vendeurs_slug','slug',true);
  await ensureIndex(REL_MAIN_TABLES.vendeurs,'uq_rel_vendeurs_tel','tel',true);
  await ensureIndex(REL_MAIN_TABLES.vendeurs,'uq_rel_vendeurs_email','email',true);

  await ensureIndex(REL_MAIN_TABLES.products,'uq_rel_products_product_id','product_id',true);
  await ensureIndex(REL_MAIN_TABLES.orders,'uq_rel_orders_order_id','order_id',true);
  await ensureIndex(REL_MAIN_TABLES.payments,'uq_rel_payments_reference','reference',true);
  await ensureIndex(REL_MAIN_TABLES.payments,'uq_rel_payments_payment_id','payment_id',true);
  await ensureIndex(REL_MAIN_TABLES.reviews,'uq_rel_reviews_review_id','review_id',true);
  await ensureIndex(REL_MAIN_TABLES.analytics,'uq_rel_analytics_event_id','event_id',true);
  await ensureIndex(REL_MAIN_TABLES.experiments,'uq_rel_experiments_event_id','event_id',true);
  await ensureIndex(REL_MAIN_TABLES.audit,'uq_rel_audit_audit_id','audit_id',true);
  await ensureIndex(REL_MAIN_TABLES.automations,'uq_rel_automations_automation_id','automation_id',true);

  await ensureIndex(REL_CHILD_TABLES.productImages,'uq_rel_product_images_product_sort','product_id,sort_order',true);
  await ensureIndex(REL_CHILD_TABLES.productVariants,'uq_rel_product_variants_product_variant','product_id,variant_id',true);
  await ensureIndex(REL_CHILD_TABLES.orderItems,'uq_rel_order_items_order_sort','order_id,sort_order',true);

  await ensureIndex(REL_MAIN_TABLES.vendeurs,'idx_rel_vendeurs_actif_plan','actif,plan');
  await ensureIndex(REL_MAIN_TABLES.orders,'idx_rel_orders_vendeur_statut_date','vendeur_id,statut,date_commande');
  await ensureIndex(REL_MAIN_TABLES.orders,'idx_rel_orders_vendeur_date','vendeur_id,date_commande');
  await ensureIndex(REL_MAIN_TABLES.orders,'idx_rel_orders_payment_status','payment_status,payment_method');
  await ensureIndex(REL_MAIN_TABLES.products,'idx_rel_products_vendeur_categorie_nom','vendeur_id,categorie,nom');
  await ensureIndex(REL_MAIN_TABLES.payments,'idx_rel_payments_vendeur_status_method','vendeur_id,status,method');
  await ensureIndex(REL_MAIN_TABLES.payments,'idx_rel_payments_order_status','order_id,status');
  await ensureIndex(REL_MAIN_TABLES.reviews,'idx_rel_reviews_product_date','product_id,date_avis');
  await ensureIndex(REL_MAIN_TABLES.recovery,'idx_rel_recovery_tel_expires','tel,expires_at');
  await ensureIndex(REL_MAIN_TABLES.analytics,'idx_rel_analytics_vendeur_event_date','vendeur_id,event_name,event_at');
  await ensureIndex(REL_MAIN_TABLES.experiments,'idx_rel_experiments_exp_variant_at','experiment_id,variant,event_at');
  await ensureIndex(REL_MAIN_TABLES.audit,'idx_rel_audit_action_date','action,event_at');
  await ensureIndex(REL_MAIN_TABLES.automations,'idx_rel_automations_vendeur_event_status','vendeur_id,event_type,status,event_at');

  await ensureForeignKey(REL_MAIN_TABLES.products,'fk_rel_products_vendeur','vendeur_id',REL_MAIN_TABLES.vendeurs,'vendeur_id','SET NULL');
  await ensureForeignKey(REL_MAIN_TABLES.orders,'fk_rel_orders_vendeur','vendeur_id',REL_MAIN_TABLES.vendeurs,'vendeur_id','SET NULL');
  await ensureForeignKey(REL_MAIN_TABLES.payments,'fk_rel_payments_order','order_id',REL_MAIN_TABLES.orders,'order_id','SET NULL');
  await ensureForeignKey(REL_MAIN_TABLES.payments,'fk_rel_payments_vendeur','vendeur_id',REL_MAIN_TABLES.vendeurs,'vendeur_id','SET NULL');
  await ensureForeignKey(REL_MAIN_TABLES.reviews,'fk_rel_reviews_product','product_id',REL_MAIN_TABLES.products,'product_id','SET NULL');
  await ensureForeignKey(REL_MAIN_TABLES.reviews,'fk_rel_reviews_vendeur','vendeur_id',REL_MAIN_TABLES.vendeurs,'vendeur_id','SET NULL');
  await ensureForeignKey(REL_MAIN_TABLES.recovery,'fk_rel_recovery_vendeur','vendeur_id',REL_MAIN_TABLES.vendeurs,'vendeur_id','SET NULL');
  await ensureForeignKey(REL_MAIN_TABLES.analytics,'fk_rel_analytics_vendeur','vendeur_id',REL_MAIN_TABLES.vendeurs,'vendeur_id','SET NULL');
  await ensureForeignKey(REL_MAIN_TABLES.automations,'fk_rel_automations_order','order_id',REL_MAIN_TABLES.orders,'order_id','SET NULL');
  await ensureForeignKey(REL_MAIN_TABLES.automations,'fk_rel_automations_vendeur','vendeur_id',REL_MAIN_TABLES.vendeurs,'vendeur_id','SET NULL');
  await ensureForeignKey(REL_CHILD_TABLES.productImages,'fk_rel_product_images_product','product_id',REL_MAIN_TABLES.products,'product_id','CASCADE');
  await ensureForeignKey(REL_CHILD_TABLES.productVariants,'fk_rel_product_variants_product','product_id',REL_MAIN_TABLES.products,'product_id','CASCADE');
  await ensureForeignKey(REL_CHILD_TABLES.orderItems,'fk_rel_order_items_order','order_id',REL_MAIN_TABLES.orders,'order_id','CASCADE');
  await ensureForeignKey(REL_CHILD_TABLES.orderItems,'fk_rel_order_items_product','product_id',REL_MAIN_TABLES.products,'product_id','SET NULL');
}

async function loadStoreFromSQL(storeKey){
  const table=tableForStoreKey(storeKey);
  if(!table) return [];
  const [rows]=await mysqlPool.query(`SELECT payload_json FROM \`${table}\` ORDER BY updated_at ASC,row_id ASC`);
  const out=[];
  (Array.isArray(rows)?rows:[]).forEach((row)=>{
    const parsed=parseJson(row.payload_json,null);
    if(parsed&&typeof parsed==='object') out.push(parsed);
  });
  return out;
}

async function loadStoreFromLegacyPayloadTable(storeKey){
  const table=legacyTableForStoreKey(storeKey);
  if(!table) return null;
  const exists=await mysqlTableExists(table);
  if(!exists) return null;
  const [rows]=await mysqlPool.query(`SELECT payload_json FROM \`${table}\` ORDER BY updated_at ASC,row_id ASC`);
  const out=[];
  (Array.isArray(rows)?rows:[]).forEach((row)=>{
    const parsed=parseJson(row.payload_json,null);
    if(parsed&&typeof parsed==='object') out.push(parsed);
  });
  return out;
}

async function loadStoreFromLegacySingleTable(storeKey){
  if(legacyTableDetected===null){
    legacyTableDetected=await mysqlTableExists(MYSQL_TABLE);
  }
  if(!legacyTableDetected) return null;
  const [rows]=await mysqlPool.execute(`SELECT data_json FROM \`${MYSQL_TABLE}\` WHERE store_key=? LIMIT 1`,[storeKey]);
  if(!Array.isArray(rows)||!rows.length) return null;
  const parsed=parseJson(rows[0].data_json,[]);
  return Array.isArray(parsed)?parsed:[];
}

async function initMySQLStore(){
  if(!MYSQL_ENABLED) return;
  if(MYSQL_URL){
    mysqlPool=createMysqlPool(mysql,MYSQL_URL,MYSQL_DATABASE);
  }else{
    const bootstrap=createMysqlPool(mysql,{
      host:MYSQL_HOST,
      port:MYSQL_PORT,
      user:MYSQL_USER,
      password:MYSQL_PASSWORD,
      connectionLimit:2
    });
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\``);
    await bootstrap.end();
    mysqlPool=createMysqlPool(mysql,{
      host:MYSQL_HOST,
      port:MYSQL_PORT,
      user:MYSQL_USER,
      password:MYSQL_PASSWORD,
      database:MYSQL_DATABASE,
      connectionLimit:10
    });
  }

  await ensureMySQLStoreTables();
  await runSqlMigrations();

  for(const key of FILE_KEYS){
    const filePath=FILE[key];
    const fromSQL=await loadStoreFromSQL(key);
    if(fromSQL.length){
      storageCache[key]=cloneArray(fromSQL);
      if(MYSQL_JSON_MIRROR_WRITES||!MYSQL_SOURCE_OF_TRUTH){
        writeFileArray(filePath,storageCache[key]);
      }
      continue;
    }

    const legacyPayload=await loadStoreFromLegacyPayloadTable(key);
    const legacy=await loadStoreFromLegacySingleTable(key);
    const fromFile=readFileArray(filePath);
    const seed=(Array.isArray(legacyPayload)&&legacyPayload.length)?legacyPayload:(Array.isArray(legacy)&&legacy.length?legacy:fromFile);
    storageCache[key]=cloneArray(seed);
    if(MYSQL_JSON_MIRROR_WRITES||!MYSQL_SOURCE_OF_TRUTH){
      writeFileArray(filePath,storageCache[key]);
    }
    await persistStoreImmediate(key);
  }

  await ensureRelationalConstraintsAndIndexes();
  await persistRuntimeStorageSettings();

  mysqlReady=true;
  console.log(`[MySQL] Storage active on ${MYSQL_DATABASE} (${RELATIONAL_TABLES.join(', ')}) | source=${MYSQL_SOURCE_OF_TRUTH?'mysql':'json'} | jsonMirror=${MYSQL_JSON_MIRROR_WRITES?'on':'off'}`);
}

function productInput(body){
  const variants=Array.isArray(body.variants)?body.variants.map((v,i)=>({id:txt(v.id||`v-${i+1}`,40),name:txt(v.name||v.nom||`Variant ${i+1}`,80),stock:int(v.stock,0)})).filter((v)=>v.name):[];
  const images=Array.isArray(body.images)?body.images.filter(Boolean).map((x)=>txt(x,300)):(body.image?[txt(body.image,300)]:[]);
  const prixAvant=num(body.prixAvant);
  return {
    nom:txt(body.nom,120),
    description:txt(body.description,1500),
    prix:num(body.prix),
    prixAvant:prixAvant===null?null:prixAvant,
    image:txt(body.image||images[0]||'',300),
    images,
    categorie:txt(body.categorie||'Non categorise',80),
    stock:int(body.stock,0),
    lowStockThreshold:int(body.lowStockThreshold,3),
    variants
  };
}

function pushStockHistory(product, entry){
  if(!product||!entry) return;
  if(!Array.isArray(product.stockHistory)) product.stockHistory=[];
  product.stockHistory.push(entry);
  if(product.stockHistory.length>200){
    product.stockHistory=product.stockHistory.slice(-200);
  }
}

function makeStockEntry(previous,next,reason,meta={}){
  const prevNumber=Number.isFinite(Number(previous))?Number(previous):previous===null?null:previous;
  const nextNumber=Number.isFinite(Number(next))?Number(next):next===null?null:next;
  const entry={
    at:new Date().toISOString(),
    previous:prevNumber,
    next:nextNumber,
    delta:(Number.isFinite(Number(prevNumber))&&Number.isFinite(Number(nextNumber)))?Number(nextNumber)-Number(prevNumber):null,
    reason:txt(reason,60)||'update'
  };
  if(meta&&meta.orderId) entry.orderId=Number(meta.orderId)||meta.orderId;
  if(meta&&meta.variantId) entry.variantId=txt(meta.variantId,80);
  if(meta&&meta.variantName) entry.variantName=txt(meta.variantName,120);
  return entry;
}

function cartInput(body){
  const slug=txt(body.slug,220);
  const clientTel=tel(body.clientTel);
  const rawItems=Array.isArray(body.items)?body.items:[];
  const items=rawItems.slice(0,100).map((it)=>{
    const item={
      id:toFiniteNumber(it.id,null),
      nom:txt(it.nom,120),
      prix:toFiniteNumber(it.prix,0),
      image:txt(it.image,300),
      quantity:Math.max(1,toIntValue(it.quantity,1)),
      variantId:txt(it.variantId,80),
      variantName:txt(it.variantName,80)
    };
    return item;
  }).filter((it)=>it.id!==null||it.nom);
  return {
    slug,
    clientTel,
    items,
    updatedAt:new Date().toISOString()
  };
}

function applyStock(order){
  const products=read(FILE.products); let changed=false; const alerts=[];
  const orderId=order&&order.id;
  (order.items||[]).forEach((it)=>{
    const ix=products.findIndex((p)=>p.id===Number(it.id)); if(ix===-1) return;
    const qty=Math.max(1,int(it.quantity,1)); const p=products[ix];
    const threshold=int(p.lowStockThreshold,3);
    if(Array.isArray(p.variants)&&p.variants.length&&it.variantId){
      const v=p.variants.find((x)=>String(x.id)===String(it.variantId));
      if(v){
        const prevVariantStock=int(v.stock,0);
        const nextVariantStock=Math.max(0,prevVariantStock-qty);
        if(nextVariantStock!==prevVariantStock){
          v.stock=nextVariantStock;
          changed=true;
          pushStockHistory(p,makeStockEntry(prevVariantStock,nextVariantStock,'order',{orderId,variantId:v.id,variantName:v.name||v.nom}));
        }
        if(v.stock<=threshold) alerts.push({productName:p.nom,variant:v.name||v.nom,stock:v.stock});
      }
    }
    const prevStock=int(p.stock,0);
    const nextStock=Math.max(0,prevStock-qty);
    if(nextStock!==prevStock){
      p.stock=nextStock;
      changed=true;
      pushStockHistory(p,makeStockEntry(prevStock,nextStock,'order',{orderId}));
    }
    if(p.stock<=threshold) alerts.push({productName:p.nom,stock:p.stock});
  });
  if(changed) write(FILE.products,products);
  return alerts;
}

function normalizeOrderStatus(status){
  const raw=txt(status||'',40).toLowerCase();
  if(!raw) return '';
  return LEGACY_ORDER_STATUS_MAP[raw]||raw;
}

function isOrderStatus(status){
  return ORDER_STATUSES.includes(normalizeOrderStatus(status));
}

function canTransitionOrderStatus(currentStatus,nextStatus){
  const current=normalizeOrderStatus(currentStatus);
  const next=normalizeOrderStatus(nextStatus);
  if(!isOrderStatus(current)||!isOrderStatus(next)) return false;
  if(current===next) return true;
  return (ORDER_STATUS_TRANSITIONS[current]||[]).includes(next);
}

function allowedNextOrderStatuses(status){
  const current=normalizeOrderStatus(status);
  if(!isOrderStatus(current)) return [];
  return [current,...(ORDER_STATUS_TRANSITIONS[current]||[])];
}

function normalizePaymentMethod(method,provider){
  const m=txt(method||'',60).toLowerCase();
  const p=txt(provider||'',60).toLowerCase();
  if(m==='mobile_money') return PAYMENT_METHODS.includes(p)?p:'orange_money';
  return PAYMENT_METHODS.includes(m)?m:'cash_on_delivery';
}

function getPaymentProviderMeta(method){
  const key=normalizePaymentMethod(method);
  return PAYMENT_PROVIDER_META[key]||PAYMENT_PROVIDER_META.cash_on_delivery;
}

function paymentProviderId(method){
  const normalized=normalizePaymentMethod(method);
  if(normalized==='cash_on_delivery') return 'manual';
  return `mock-${normalized}`;
}

function whatsappOrderMessage(order,vendeur,type){
  const safeType=txt(type||'confirmation',40);
  const client=txt(order.clientNom||'Client',80)||'Client';
  const boutique=vendeur&&vendeur.boutique?vendeur.boutique:'Votre boutique';
  const amount=Number(order.total||0).toLocaleString('fr-FR');
  if(safeType==='shipping'){
    return `Bonjour ${client}, votre commande #${order.id} de ${boutique} est expediee. Montant: ${amount} FCFA.`;
  }
  if(safeType==='delivery'){
    return `Bonjour ${client}, votre commande #${order.id} de ${boutique} est marquee livree. Merci pour votre confiance.`;
  }
  if(safeType==='reminder'){
    return `Bonjour ${client}, rappel pour votre commande #${order.id} (${amount} FCFA). Merci de confirmer votre disponibilite.`;
  }
  return `Bonjour ${client}, votre commande #${order.id} est confirmee par ${boutique}. Montant: ${amount} FCFA.`;
}

function createWhatsAppLink(phone,message){
  const to=tel(phone);
  if(!to) return '';
  return `https://wa.me/${to}?text=${encodeURIComponent(message)}`;
}

function queueAutomation(eventType,order,vendeur,meta={}){
  const message=whatsappOrderMessage(order,vendeur,meta.messageType||'confirmation');
  const whatsappUrl=createWhatsAppLink(order.clientTel,message);
  const payload={
    id:`auto_${rid()}`,
    at:new Date().toISOString(),
    eventType:txt(eventType,80),
    orderId:order.id,
    vendeurId:order.vendeurId,
    status:order.statut,
    phone:tel(order.clientTel),
    whatsappUrl,
    message,
    metadata:meta
  };
  append(FILE.automations,payload,50000);
  return payload;
}

function rangeDays(days){
  const now=new Date();
  const out=[];
  for(let i=days-1;i>=0;i--){
    const d=new Date(now);
    d.setHours(0,0,0,0);
    d.setDate(d.getDate()-i);
    out.push(d);
  }
  return out;
}

function startOfDay(ts){
  const d=new Date(ts);
  d.setHours(0,0,0,0);
  return d.getTime();
}

function buildProductCopy(body){
  const nom=txt(body.nom||body.name||'Produit',120)||'Produit';
  const categorie=txt(body.categorie||body.category||'Produit',80)||'Produit';
  const tone=txt(body.tone||'pro',30).toLowerCase();
  const prix=num(body.prix);
  const benefits=Array.isArray(body.benefits)?body.benefits.map((x)=>txt(x,120)).filter(Boolean).slice(0,4):[];
  const keywords=Array.isArray(body.keywords)?body.keywords.map((x)=>txt(x,40).toLowerCase()).filter(Boolean).slice(0,6):[];
  const descriptionBase=txt(body.description,600);
  const toneHook={
    premium:'Une piece soignee pour une clientele exigeante.',
    dynamique:'Un produit pratique pour un usage quotidien sans compromis.',
    pro:'Un excellent rapport qualite-prix pour vos clients.',
    local:'Concu pour les besoins de votre marche local.'
  };
  const selectedHook=toneHook[tone]||toneHook.pro;
  const benefitLine=benefits.length?`Points forts: ${benefits.join(' | ')}.`:'Points forts: qualite, confort et durabilite.';
  const priceLine=prix!==null?`Prix conseille: ${Number(prix).toLocaleString('fr-FR')} FCFA.`:'Prix disponible sur demande.';
  const shortDescription=`${nom} - ${selectedHook}`;
  const longDescription=[
    `${nom} (${categorie})`,
    selectedHook,
    benefitLine,
    priceLine,
    descriptionBase?`Details: ${descriptionBase}`:'Disponible en stock limite, commandez rapidement.'
  ].join(' ');
  const tags=[categorie,...keywords].map((x)=>x.replace(/\s+/g,'-')).filter(Boolean).slice(0,8);
  return {
    title:nom,
    shortDescription,
    longDescription,
    tags,
    cta:'Commandez maintenant via WhatsApp'
  };
}

function buildOnboardingChecklist(vendeurId){
  const vendeurs=read(FILE.vendeurs);
  const vendeur=vendeurs.find((v)=>Number(v.id)===Number(vendeurId));
  const products=read(FILE.products).filter((p)=>Number(p.vendeurId)===Number(vendeurId));
  const orders=read(FILE.orders).filter((o)=>Number(o.vendeurId)===Number(vendeurId));
  const paidOrders=orders.filter((o)=>o.payment&&String(o.payment.status||'').toLowerCase()==='paid');
  const steps=[
    {id:'profil',label:'Completer le profil boutique',done:Boolean(vendeur&&vendeur.nom&&vendeur.boutique&&vendeur.tel)},
    {id:'catalogue',label:'Ajouter au moins 1 produit',done:products.length>0},
    {id:'partage',label:'Partager le lien boutique',done:Boolean(vendeur&&vendeur.slug&&orders.length>0)},
    {id:'first_order',label:'Obtenir la premiere commande',done:orders.length>0},
    {id:'first_payment',label:'Valider un premier paiement',done:paidOrders.length>0}
  ];
  const doneCount=steps.filter((s)=>s.done).length;
  return {
    vendeurId:Number(vendeurId),
    completed:doneCount,
    total:steps.length,
    completionRate:steps.length?Number((doneCount/steps.length).toFixed(2)):0,
    steps
  };
}

function computeDashboard(vendeurId,periodDays){
  const orders=read(FILE.orders).filter((o)=>Number(o.vendeurId)===Number(vendeurId));
  const products=read(FILE.products).filter((p)=>Number(p.vendeurId)===Number(vendeurId));
  const analytics=read(FILE.analytics).filter((e)=>Number(e.vendeurId)===Number(vendeurId));
  const paidStatuses=new Set(['paid']);
  const delivered=orders.filter((o)=>normalizeOrderStatus(o.statut)==='livree');
  const awaitingAction=orders.filter((o)=>{
    const st=normalizeOrderStatus(o.statut);
    return st==='en_attente'||st==='confirmee'||st==='expediee';
  });
  const paidOrders=orders.filter((o)=>o.payment&&paidStatuses.has(String(o.payment.status||'').toLowerCase()));
  const revenueDelivered=delivered.reduce((s,o)=>s+Number(o.total||0),0);
  const revenuePaid=paidOrders.reduce((s,o)=>s+Number(o.total||0),0);
  const avgBasket=orders.length?Number((orders.reduce((s,o)=>s+Number(o.total||0),0)/orders.length).toFixed(2)):0;
  const overdueOrders=orders.filter((o)=>{
    const st=normalizeOrderStatus(o.statut);
    if(st==='livree'||st==='annulee') return false;
    const ageMs=Date.now()-new Date(o.dateCommande||0).getTime();
    return ageMs>48*60*60*1000;
  }).length;

  const funnel={view_product:0,add_to_cart:0,start_checkout:0,order_created:0,payment_success:0};
  Object.keys(funnel).forEach((name)=>{funnel[name]=analytics.filter((e)=>e.eventName===name).length;});
  const conversionViewToOrder=funnel.view_product?Number((funnel.order_created/funnel.view_product).toFixed(4)):0;
  const conversionCheckoutToPaid=funnel.start_checkout?Number((funnel.payment_success/funnel.start_checkout).toFixed(4)):0;

  const dates=rangeDays(periodDays);
  const salesSeries=dates.map((d)=>{
    const ts=startOfDay(d);
    const items=orders.filter((o)=>startOfDay(o.dateCommande)===ts&&normalizeOrderStatus(o.statut)==='livree');
    const amount=items.reduce((s,o)=>s+Number(o.total||0),0);
    return {date:new Date(ts).toISOString().slice(0,10),amount,orders:items.length};
  });

  const byProduct={};
  delivered.forEach((o)=>{
    (o.items||[]).forEach((it)=>{
      const key=String(it.id||it.nom||'');
      if(!key) return;
      if(!byProduct[key]){
        byProduct[key]={productId:it.id||null,nom:txt(it.nom,150)||'Produit',quantity:0,revenue:0,orders:0};
      }
      byProduct[key].quantity+=Math.max(1,int(it.quantity,1));
      byProduct[key].revenue+=Number(it.prix||0)*Math.max(1,int(it.quantity,1));
      byProduct[key].orders+=1;
    });
  });
  const topProducts=Object.values(byProduct).sort((a,b)=>b.revenue-a.revenue).slice(0,8);

  const stockAlerts=[];
  products.forEach((p)=>{
    const threshold=int(p.lowStockThreshold,3);
    const stock=int(p.stock,0);
    if(stock<=threshold){
      stockAlerts.push({productId:p.id,nom:p.nom,stock,threshold});
    }
    const variants=Array.isArray(p.variants)?p.variants:[];
    variants.forEach((v)=>{
      const vStock=int(v&&v.stock,0);
      if(vStock<=threshold){
        stockAlerts.push({productId:p.id,nom:p.nom,variant:v.name||v.nom,stock:vStock,threshold});
      }
    });
  });

  return {
    kpis:{
      products:products.length,
      orders:orders.length,
      deliveredOrders:delivered.length,
      awaitingActionOrders:awaitingAction.length,
      revenueDelivered,
      revenuePaid,
      avgBasket,
      overdueOrders
    },
    funnel,
    conversion:{
      view_to_order:conversionViewToOrder,
      checkout_to_paid:conversionCheckoutToPaid
    },
    salesSeries,
    topProducts,
    stockAlerts
  };
}

function useDirectSqlForOrdersPayments(){
  return Boolean(MYSQL_SOURCE_OF_TRUTH&&MYSQL_ENABLED&&mysqlReady&&mysqlPool);
}

async function mysqlHealthCheck(){
  if(!MYSQL_ENABLED){
    return {enabled:false,ready:true,pingMs:null,error:null};
  }
  if(!mysqlPool||!mysqlReady){
    return {enabled:true,ready:false,pingMs:null,error:'mysql_not_ready'};
  }
  const started=Date.now();
  try{
    await mysqlPool.query('SELECT 1');
    return {enabled:true,ready:true,pingMs:Date.now()-started,error:null};
  }catch(err){
    logOpsError(err,'health.mysql');
    pushOpsAlert('warning','mysql_health_degraded','Verification MySQL en echec',{message:err.message});
    return {enabled:true,ready:false,pingMs:Date.now()-started,error:err.message};
  }
}

async function ensureOrdersPaymentsSqlConsistency(){
  if(!useDirectSqlForOrdersPayments()) return;
  await flushMySQLPersistQueue();
}

async function sqlGetIdSet(conn,tableName,columnName){
  let start=0;
  if(ORDER_DEBUG){
    start=Date.now();
    console.log(`[order:sql] load ids ${tableName}.${columnName}...`);
  }
  const [rows]=await conn.query(`SELECT \`${columnName}\` AS id FROM \`${tableName}\` WHERE \`${columnName}\` IS NOT NULL`);
  if(ORDER_DEBUG){
    console.log(`[order:sql] load ids ${tableName}.${columnName} done in ${Date.now()-start}ms`);
  }
  return new Set((Array.isArray(rows)?rows:[]).map((r)=>toFiniteNumber(r.id,null)).filter((id)=>id!==null));
}

async function sqlBuildReferenceSets(conn){
  const [vendeurs,products,orders]=await Promise.all([
    sqlGetIdSet(conn,REL_MAIN_TABLES.vendeurs,'vendeur_id'),
    sqlGetIdSet(conn,REL_MAIN_TABLES.products,'product_id'),
    sqlGetIdSet(conn,REL_MAIN_TABLES.orders,'order_id')
  ]);
  return {vendeurs,products,orders};
}

function sqlExistingFkOrNull(value,idSet){
  const parsed=toFiniteNumber(value,null);
  if(parsed===null) return null;
  return idSet instanceof Set&&idSet.has(parsed)?parsed:null;
}

function parsePayloadRows(rows){
  const out=[];
  (Array.isArray(rows)?rows:[]).forEach((row)=>{
    const parsed=parseJson(row.payload_json,null);
    if(parsed&&typeof parsed==='object') out.push(parsed);
  });
  return out;
}

async function syncSqlCacheStore(storeKey){
  if(!useDirectSqlForOrdersPayments()) return;
  storageCache[storeKey]=await loadStoreFromSQL(storeKey);
  if(MYSQL_JSON_MIRROR_WRITES&&FILE[storeKey]){
    writeFileArray(FILE[storeKey],storageCache[storeKey]);
  }
}

async function syncSqlOrdersPaymentsCache(){
  if(!useDirectSqlForOrdersPayments()) return;
  await syncSqlCacheStore('orders');
  await syncSqlCacheStore('payments');
}

async function sqlLoadOrders({vendeurId=null,orderId=null}={}){
  await ensureOrdersPaymentsSqlConsistency();
  if(orderId!==null){
    const [rows]=await mysqlPool.execute(`SELECT payload_json FROM \`${REL_MAIN_TABLES.orders}\` WHERE order_id=? LIMIT 1`,[orderId]);
    return parsePayloadRows(rows);
  }
  if(vendeurId!==null){
    const [rows]=await mysqlPool.execute(`SELECT payload_json FROM \`${REL_MAIN_TABLES.orders}\` WHERE vendeur_id=? ORDER BY updated_at DESC,order_id DESC`,[vendeurId]);
    return parsePayloadRows(rows);
  }
  const [rows]=await mysqlPool.query(`SELECT payload_json FROM \`${REL_MAIN_TABLES.orders}\` ORDER BY updated_at DESC,order_id DESC`);
  return parsePayloadRows(rows);
}

async function sqlLoadOrderById(orderId,conn=null){
  if(!conn) await ensureOrdersPaymentsSqlConsistency();
  const db=conn||mysqlPool;
  const [rows]=await db.execute(`SELECT payload_json FROM \`${REL_MAIN_TABLES.orders}\` WHERE order_id=? LIMIT 1`,[orderId]);
  const parsed=parsePayloadRows(rows);
  return parsed.length?parsed[0]:null;
}

async function sqlLoadPayments({reference=null}={}){
  await ensureOrdersPaymentsSqlConsistency();
  if(reference){
    const [rows]=await mysqlPool.execute(`SELECT payload_json FROM \`${REL_MAIN_TABLES.payments}\` WHERE reference=? LIMIT 1`,[reference]);
    return parsePayloadRows(rows);
  }
  const [rows]=await mysqlPool.query(`SELECT payload_json FROM \`${REL_MAIN_TABLES.payments}\` ORDER BY updated_at DESC,payment_id DESC,row_id DESC`);
  return parsePayloadRows(rows);
}

async function sqlLoadPaymentByReference(reference,conn=null){
  if(!conn) await ensureOrdersPaymentsSqlConsistency();
  const db=conn||mysqlPool;
  const [rows]=await db.execute(`SELECT payload_json FROM \`${REL_MAIN_TABLES.payments}\` WHERE reference=? LIMIT 1`,[reference]);
  const parsed=parsePayloadRows(rows);
  return parsed.length?parsed[0]:null;
}

async function sqlPersistOrder(order,conn,refs=null){
  if(!conn) await ensureOrdersPaymentsSqlConsistency();
  const target=conn||mysqlPool;
  const orderId=toFiniteNumber(order&&order.id,null);
  if(orderId===null) throw new Error('ID commande invalide');
  if(ORDER_DEBUG) console.log('[order:sql] build refs start');
  const localRefs=refs||await sqlBuildReferenceSets(target);
  if(ORDER_DEBUG) console.log('[order:sql] build refs done');
  const safeOrder=order&&typeof order==='object'?order:{};
  const normalizedVendeurId=sqlExistingFkOrNull(safeOrder.vendeurId,localRefs.vendeurs);
  const normalizedItems=(Array.isArray(safeOrder.items)?safeOrder.items:[]).map((item)=>{
    const safeItem=item&&typeof item==='object'?item:{};
    return {...safeItem,id:sqlExistingFkOrNull(safeItem.id,localRefs.products)};
  });
  const normalizedOrder={...safeOrder,vendeurId:normalizedVendeurId,items:normalizedItems};
  const payment=normalizedOrder.payment&&typeof normalizedOrder.payment==='object'?normalizedOrder.payment:{};
  const rowId=rowIdForStore('orders',safeOrder,0);
  const createdAt=inferCreatedAt(safeOrder);
  if(ORDER_DEBUG) console.log('[order:sql] insert order start');
  await target.execute(
    `INSERT INTO \`${REL_MAIN_TABLES.orders}\` (row_id,order_id,vendeur_id,statut,total,date_commande,payment_status,payment_method,payload_json,created_at_txt)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       row_id=VALUES(row_id),
       vendeur_id=VALUES(vendeur_id),
       statut=VALUES(statut),
       total=VALUES(total),
       date_commande=VALUES(date_commande),
       payment_status=VALUES(payment_status),
       payment_method=VALUES(payment_method),
       payload_json=VALUES(payload_json),
       created_at_txt=VALUES(created_at_txt),
       updated_at=CURRENT_TIMESTAMP`,
    [
      rowId,
      orderId,
      normalizedVendeurId,
      String(normalizedOrder.statut||''),
      toFiniteNumber(normalizedOrder.total,0),
      String(normalizedOrder.dateCommande||''),
      String(payment.status||''),
      String(payment.method||''),
      JSON.stringify(normalizedOrder),
      createdAt
    ]
  );
  if(ORDER_DEBUG) console.log('[order:sql] insert order done');

  if(ORDER_DEBUG) console.log('[order:sql] replace items start');
  await target.execute(`DELETE FROM \`${REL_CHILD_TABLES.orderItems}\` WHERE order_id=?`,[orderId]);
  const items=normalizedItems;
  for(let i=0;i<items.length;i++){
    const item=items[i]&&typeof items[i]==='object'?items[i]:{};
    await target.execute(
      `INSERT INTO \`${REL_CHILD_TABLES.orderItems}\` (order_id,product_id,nom,prix,quantity,variant_id,sort_order,payload_json) VALUES (?,?,?,?,?,?,?,?)`,
      [
        orderId,
        item.id===null?null:toFiniteNumber(item.id,null),
        String(item.nom||''),
        toFiniteNumber(item.prix,0),
        Math.max(1,toIntValue(item.quantity,1)),
        String(item.variantId||''),
        i,
        JSON.stringify(item)
      ]
    );
  }
  if(ORDER_DEBUG) console.log('[order:sql] replace items done');
}

async function sqlPersistPayment(payment,conn,refs=null){
  if(!conn) await ensureOrdersPaymentsSqlConsistency();
  const target=conn||mysqlPool;
  const safe=payment&&typeof payment==='object'?payment:{};
  const localRefs=refs||await sqlBuildReferenceSets(target);
  const normalizedOrderId=sqlExistingFkOrNull(safe.orderId,localRefs.orders);
  const normalizedVendeurId=sqlExistingFkOrNull(safe.vendeurId,localRefs.vendeurs);
  const normalizedPayment={...safe,orderId:normalizedOrderId,vendeurId:normalizedVendeurId};
  const rowId=rowIdForStore('payments',safe,0);
  const createdAt=inferCreatedAt(safe);
  await target.execute(
    `INSERT INTO \`${REL_MAIN_TABLES.payments}\` (row_id,payment_id,order_id,vendeur_id,reference,status,method,provider,amount,payload_json,created_at_txt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       row_id=VALUES(row_id),
       payment_id=VALUES(payment_id),
       order_id=VALUES(order_id),
       vendeur_id=VALUES(vendeur_id),
       reference=VALUES(reference),
       status=VALUES(status),
       method=VALUES(method),
       provider=VALUES(provider),
       amount=VALUES(amount),
       payload_json=VALUES(payload_json),
       created_at_txt=VALUES(created_at_txt),
       updated_at=CURRENT_TIMESTAMP`,
    [
      rowId,
      toFiniteNumber(normalizedPayment.id,null),
      normalizedOrderId,
      normalizedVendeurId,
      normalizedPayment.reference?String(normalizedPayment.reference):null,
      String(normalizedPayment.status||''),
      String(normalizedPayment.method||''),
      String(normalizedPayment.provider||''),
      toFiniteNumber(normalizedPayment.amount,0),
      JSON.stringify(normalizedPayment),
      createdAt
    ]
  );
}

async function sqlDeleteOrderById(orderId){
  await ensureOrdersPaymentsSqlConsistency();
  await mysqlPool.execute(`DELETE FROM \`${REL_MAIN_TABLES.orders}\` WHERE order_id=?`,[orderId]);
}

async function updatePayment(reference,status,details={}){
  if(useDirectSqlForOrdersPayments()){
    await ensureOrdersPaymentsSqlConsistency();
    const conn=await mysqlPool.getConnection();
    try{
      await conn.beginTransaction();
      const payment=await sqlLoadPaymentByReference(reference,conn);
      if(!payment){
        await conn.rollback();
        return null;
      }
      const now=new Date().toISOString();
      payment.status=status;
      payment.updatedAt=now;
      payment.details={...(payment.details||{}),...details};
      const refs=await sqlBuildReferenceSets(conn);
      payment.orderId=sqlExistingFkOrNull(payment.orderId,refs.orders);
      payment.vendeurId=sqlExistingFkOrNull(payment.vendeurId,refs.vendeurs);
      await sqlPersistPayment(payment,conn,refs);
      const orderId=toFiniteNumber(payment.orderId,null);
      if(orderId!==null){
        const order=await sqlLoadOrderById(orderId,conn);
        if(order){
          order.payment={...(order.payment||{}),status,reference:payment.reference,method:payment.method,provider:payment.provider,updatedAt:now};
          if(status==='paid'&&canTransitionOrderStatus(order.statut,'confirmee')){
            order.statut='confirmee';
            order.dateModification=now;
          }
          await sqlPersistOrder(order,conn,refs);
        }
      }
      await conn.commit();
      await syncSqlOrdersPaymentsCache();
      return payment;
    }catch(err){
      try{await conn.rollback();}catch{}
      throw err;
    }finally{
      conn.release();
    }
  }
  const pays=read(FILE.payments); const px=pays.findIndex((p)=>p.reference===reference); if(px===-1) return null;
  pays[px].status=status; pays[px].updatedAt=new Date().toISOString(); pays[px].details={...(pays[px].details||{}),...details}; write(FILE.payments,pays);
  const orders=read(FILE.orders); const ox=orders.findIndex((o)=>o.id===pays[px].orderId);
  if(ox!==-1){
    orders[ox].payment={...(orders[ox].payment||{}),status,reference:pays[px].reference,method:pays[px].method,provider:pays[px].provider,updatedAt:new Date().toISOString()};
    if(status==='paid'&&canTransitionOrderStatus(orders[ox].statut,'confirmee')){
      orders[ox].statut='confirmee';
      orders[ox].dateModification=new Date().toISOString();
    }
    write(FILE.orders,orders);
  }
  return pays[px];
}

app.get('/api/health',async(req,res)=>{
  const db=await mysqlHealthCheck();
  const status=db.ready?'ok':'degraded';
  res.json({
    status,
    uptimeSec:Math.round(process.uptime()),
    timestamp:new Date().toISOString(),
    requestId:req.requestId||null,
    db,
    storage:{
      mode:MYSQL_ENABLED?'mysql':'json',
      mysqlReady:MYSQL_ENABLED?mysqlReady:false,
      mysqlSourceOfTruth:MYSQL_ENABLED?MYSQL_SOURCE_OF_TRUTH:false,
      jsonMirrorWrites:MYSQL_ENABLED?MYSQL_JSON_MIRROR_WRITES:false
    }
  });
});

app.get('/api/health/ready',async(req,res)=>{
  const db=await mysqlHealthCheck();
  const ready=Boolean(db.ready);
  res.status(ready?200:503).json({
    ready,
    timestamp:new Date().toISOString(),
    requestId:req.requestId||null,
    db
  });
});

app.get('/api/health/details',async(req,res)=>{
  const db=await mysqlHealthCheck();
  const payload={
    status:db.ready?'ok':'degraded',
    uptimeSec:Math.round(process.uptime()),
    timestamp:new Date().toISOString(),
    requestId:req.requestId||null,
    db,
    obs:{
      alertsCount:readFileArray(OBS_FILE.alerts).length,
      errorsCount:readFileArray(OBS_FILE.errors).length
    },
    dataFiles:Object.fromEntries(Object.entries(FILE).map(([key,file])=>{
      const items=read(file);
      return [key,{path:file,count:Array.isArray(items)?items.length:0}];
    })),
    env:{
      node:process.version,
      port:PORT,
      smtpConfigured:Boolean(SMTP_USER&&SMTP_PASS),
      mysqlEnabled:MYSQL_ENABLED,
      mysqlReady:MYSQL_ENABLED?mysqlReady:false,
      mysqlSourceOfTruth:MYSQL_ENABLED?MYSQL_SOURCE_OF_TRUTH:false,
      mysqlJsonMirrorWrites:MYSQL_ENABLED?MYSQL_JSON_MIRROR_WRITES:false,
      mysqlDatabase:MYSQL_ENABLED?MYSQL_DATABASE:null,
      mysqlLegacyTable:MYSQL_ENABLED?MYSQL_TABLE:null,
      mysqlTables:MYSQL_ENABLED?RELATIONAL_TABLES:[]
    }
  };
  res.json(payload);
});

app.get('/api/storage/status',(req,res)=>{
  res.json({
    mode:MYSQL_ENABLED?'mysql':'json',
    schema:MYSQL_ENABLED?'multi_table':'json_files',
    mysqlEnabled:MYSQL_ENABLED,
    mysqlReady:MYSQL_ENABLED?mysqlReady:false,
    mysqlSourceOfTruth:MYSQL_ENABLED?MYSQL_SOURCE_OF_TRUTH:false,
    mysqlJsonMirrorWrites:MYSQL_ENABLED?MYSQL_JSON_MIRROR_WRITES:false,
    mysqlDatabase:MYSQL_ENABLED?MYSQL_DATABASE:null,
    mysqlLegacyTable:MYSQL_ENABLED?MYSQL_TABLE:null,
    mysqlTables:MYSQL_ENABLED?RELATIONAL_TABLES:[]
  });
});

app.get('/api/payments/providers',(req,res)=>{
  const providers=PAYMENT_METHODS.map((code)=>({
    code,
    label:PAYMENT_PROVIDER_META[code].label,
    kind:PAYMENT_PROVIDER_META[code].kind
  }));
  res.json({providers});
});

app.post('/api/auth/admin/login',adminLoginLimiter,(req,res)=>{
  const email=txt(req.body.email,150).toLowerCase(); const password=String(req.body.password||'').trim();
  const key=authFailureKey('admin',email||'unknown',req);
  const state=authFailureState(key);
  if(state.locked){
    clearAdminSessionCookie(res);
    return res.status(429).json({error:`Trop de tentatives. Reessaie dans ${state.retryAfterSec}s`});
  }
  const adminPasswordOk=ADMIN_PASSWORD_HASH?bcrypt.compareSync(password,ADMIN_PASSWORD_HASH):password===ADMIN_PASSWORD;
  if(email!==ADMIN_EMAIL||!adminPasswordOk){
    const nextState=markAuthFailure(key);
    audit('auth.admin.login.failed',req,{email,retryAfterSec:nextState.retryAfterSec});
    if(nextState.locked){
      pushOpsAlert('warning','auth_admin_locked','Blocage temporaire suite a trop d echecs admin',{email,ip:req.ip});
      clearAdminSessionCookie(res);
      return res.status(429).json({error:`Compte temporairement bloque. Reessaie dans ${nextState.retryAfterSec}s`});
    }
    clearAdminSessionCookie(res);
    return res.status(401).json({error:'Identifiants admin invalides'});
  }
  clearAuthFailures(key);
  const token=sig({role:'admin',id:'admin',email:ADMIN_EMAIL,kind:'admin_session'},ADMIN_SESSION_TTL_SECONDS);
  setAdminSessionCookie(res,token);
  audit('auth.admin.login.success',req,{email,auth:'cookie_http_only',ttlSec:ADMIN_SESSION_TTL_SECONDS});
  res.json({success:true,token,admin:{email:ADMIN_EMAIL},session:{cookieName:ADMIN_SESSION_COOKIE,ttlSec:ADMIN_SESSION_TTL_SECONDS}});
});

app.get('/api/auth/admin/session',auth,role('admin'),(req,res)=>{
  const exp=Number(req.auth&&req.auth.exp)||0;
  res.json({
    authenticated:true,
    admin:{email:String(req.auth&&req.auth.email||ADMIN_EMAIL)},
    expiresAt:exp?new Date(exp*1000).toISOString():null
  });
});

app.post('/api/auth/admin/logout',(req,res)=>{
  clearAdminSessionCookie(res);
  audit('auth.admin.logout',req,{cookieName:ADMIN_SESSION_COOKIE});
  res.json({success:true});
});

app.post('/api/auth/login',loginLimiter,async(req,res)=>{
  const phone=tel(req.body.tel); const email=txt(req.body.email,150).toLowerCase(); const password=String(req.body.password||req.body.motdepasse||'');
  if(!password||(!phone&&!email)) return res.status(400).json({error:'Identifiants invalides'});
  const loginKey=authFailureKey('vendeur_login',phone||email||'unknown',req);
  const lock=authFailureState(loginKey);
  if(lock.locked){
    return res.status(429).json({error:`Trop de tentatives. Reessaie dans ${lock.retryAfterSec}s`});
  }
  const vendeurs=read(FILE.vendeurs);
  const ix=vendeurs.findIndex((v)=>(phone&&tel(v.tel)===phone)||(email&&String(v.email||'').toLowerCase()===email));
  if(ix===-1){
    const nextState=markAuthFailure(loginKey);
    audit('auth.vendeur.login.failed',req,{phone,email,retryAfterSec:nextState.retryAfterSec});
    return res.status(nextState.locked?429:401).json({error:'Numero ou mot de passe incorrect'});
  }
  const v=vendeurs[ix];
  if(v.actif===false) return res.status(403).json({error:'Compte desactive'});
  const h=pwdHash(v); if(!h) return res.status(401).json({error:'Compte non configure'});
  const ok=await bcrypt.compare(password,h);
  if(!ok){
    const nextState=markAuthFailure(loginKey);
    audit('auth.vendeur.login.failed',req,{vendeurId:v.id,retryAfterSec:nextState.retryAfterSec});
    if(nextState.locked){
      pushOpsAlert('warning','auth_vendeur_locked','Blocage temporaire suite a trop d echecs vendeur',{vendeurId:v.id,ip:req.ip});
    }
    return res.status(nextState.locked?429:401).json({error:'Numero ou mot de passe incorrect'});
  }
  clearAuthFailures(loginKey);
  if(v.motdepasse!==h||v.password!==h){
    vendeurs[ix].motdepasse=h;
    vendeurs[ix].password=h;
  }
  vendeurs[ix].tokenVersion=toVendeurTokenVersion(vendeurs[ix]);
  write(FILE.vendeurs,vendeurs);
  const token=sig({role:'vendeur',id:v.id,tel:v.tel,email:v.email||'',tv:vendeurs[ix].tokenVersion},VENDEUR_SESSION_TTL_SECONDS);
  audit('auth.vendeur.login.success',req,{vendeurId:v.id});
  res.json({success:true,vendeur:sv(vendeurs[ix]),token,session:{ttlSec:VENDEUR_SESSION_TTL_SECONDS}});
});

app.post('/api/auth/request-recovery',recoveryLimiter,antispam,async(req,res)=>{
  const phone=tel(req.body.tel); const method=req.body.method==='email'?'email':'whatsapp';
  if(!phone) return res.status(400).json({error:'Numero invalide'});
  const recoveryKey=authFailureKey('recovery_request',phone,req);
  const lock=authFailureState(recoveryKey);
  if(lock.locked){
    return res.status(429).json({error:`Trop de tentatives. Reessaie dans ${lock.retryAfterSec}s`});
  }
  const vendeurs=read(FILE.vendeurs); const v=vendeurs.find((x)=>tel(x.tel)===phone);
  if(!v||v.actif===false){
    const nextState=markAuthFailure(recoveryKey);
    audit('auth.recovery.request.miss',req,{phone,retryAfterSec:nextState.retryAfterSec});
    return res.json({success:true,message:'Si le compte existe, un code a ete envoye.'});
  }
  if(method==='email'&&!v.email){
    const nextState=markAuthFailure(recoveryKey);
    audit('auth.recovery.request.email_missing',req,{vendeurId:v.id,retryAfterSec:nextState.retryAfterSec});
    return res.json({success:true,message:'Si le compte existe, un code a ete envoye.'});
  }
  const code=String(Math.floor(100000+Math.random()*900000));
  const now=Date.now(); const expiresAt=new Date(now+RECOVERY_CODE_TTL_MINUTES*60*1000).toISOString();
  const codeSalt=crypto.randomBytes(8).toString('hex');
  const codeHash=recoveryCodeHash(phone,code,codeSalt);
  let rec=read(FILE.recovery).filter((r)=>new Date(r.expiresAt).getTime()>Date.now());
  rec=rec.filter((r)=>tel(r.tel)!==phone&&r.vendeurId!==v.id);
  rec.push({
    vendeurId:v.id,
    tel:phone,
    code:RECOVERY_DEBUG_CODE?code:null,
    codeHash,
    codeSalt,
    attempts:0,
    method,
    createdAt:new Date(now).toISOString(),
    expiresAt
  });
  write(FILE.recovery,rec);
  const msg=`Code WhaBiz: ${code}. Il expire dans ${RECOVERY_CODE_TTL_MINUTES} minutes.`;
  if(method==='email') await mail({from:SMTP_USER||'noreply@whabiz.local',to:v.email,subject:'Code de recuperation WhaBiz',html:`<p>${msg}</p>`});
  clearAuthFailures(recoveryKey);
  audit('auth.recovery.request.success',req,{vendeurId:v.id,method});
  const payload={success:true,method,tel:v.tel,message:'Code envoye. Verifie ton canal de recuperation.'};
  if(method==='whatsapp'&&RECOVERY_WHATSAPP_LINK_ENABLED){
    payload.whatsappUrl=`https://wa.me/${v.tel}?text=${encodeURIComponent(msg)}`;
  }
  if(RECOVERY_DEBUG_CODE){
    payload.debugCode=code;
  }
  res.json(payload);
});

app.post('/api/auth/reset-password',recoveryLimiter,antispam,async(req,res)=>{
  const phone=tel(req.body.tel); const code=String(req.body.code||'').trim(); const newPass=String(req.body.newPassword||req.body.motdepasse||'');
  if(!phone||!code) return res.status(400).json({error:'Donnees invalides'});
  if(!isStrongPassword(newPass)) return res.status(400).json({error:'Mot de passe trop faible (8+ caracteres avec lettres et chiffres)'});
  const resetKey=authFailureKey('recovery_reset',phone,req);
  const lock=authFailureState(resetKey);
  if(lock.locked){
    return res.status(429).json({error:`Trop de tentatives. Reessaie dans ${lock.retryAfterSec}s`});
  }
  let rec=read(FILE.recovery).filter((r)=>new Date(r.expiresAt).getTime()>Date.now());
  const hasCode=(record)=>{
    if(record&&record.codeHash&&record.codeSalt){
      return recoveryCodeHash(phone,code,record.codeSalt)===String(record.codeHash);
    }
    return String(record&&record.code||'')===code;
  };
  const record=rec.find((r)=>tel(r.tel)===phone&&hasCode(r));
  if(!record){
    rec=rec.map((r)=>{
      if(tel(r.tel)!==phone) return r;
      const attempts=int(r.attempts,0)+1;
      return {...r,attempts};
    }).filter((r)=>int(r.attempts,0)<RECOVERY_MAX_ATTEMPTS);
    write(FILE.recovery,rec);
    const nextState=markAuthFailure(resetKey);
    if(nextState.locked){
      pushOpsAlert('warning','auth_recovery_locked','Blocage temporaire suite a trop d echecs de reset',{phone,ip:req.ip});
    }
    return res.status(nextState.locked?429:400).json({error:'Code invalide ou expire'});
  }
  const vendeurs=read(FILE.vendeurs); const ix=vendeurs.findIndex((v)=>v.id===record.vendeurId||tel(v.tel)===phone);
  if(ix===-1) return res.status(404).json({error:'Compte introuvable'});
  const h=await bcrypt.hash(newPass,BCRYPT_ROUNDS);
  vendeurs[ix].motdepasse=h;
  vendeurs[ix].password=h;
  vendeurs[ix].tokenVersion=toVendeurTokenVersion(vendeurs[ix])+1;
  write(FILE.vendeurs,vendeurs);
  rec=rec.filter((r)=>{
    if(tel(r.tel)!==phone) return true;
    if(r&&r.codeHash&&r.codeSalt){
      return recoveryCodeHash(phone,code,r.codeSalt)!==String(r.codeHash);
    }
    return String(r.code||'')!==code;
  });
  write(FILE.recovery,rec);
  clearAuthFailures(resetKey);
  audit('auth.recovery.reset.success',req,{vendeurId:vendeurs[ix].id});
  res.json({success:true});
});

app.post('/api/analytics/events',analyticsLimiter,antispam,(req,res)=>{
  const eventName=txt(req.body.eventName,80); if(!eventName) return res.status(400).json({error:'eventName requis'});
  track(eventName,{slug:txt(req.body.slug,120),vendeurId:num(req.body.vendeurId),sessionId:txt(req.body.sessionId,120),metadata:typeof req.body.metadata==='object'&&req.body.metadata?req.body.metadata:{}});
  res.json({success:true});
});

app.post('/api/experiments/events',analyticsLimiter,antispam,(req,res)=>{
  const experimentId=txt(req.body.experimentId,120); const variant=txt(req.body.variant,60); const eventName=txt(req.body.eventName,80);
  if(!experimentId||!variant||!eventName) return res.status(400).json({error:'experimentId, variant et eventName sont requis'});
  trackExp({experimentId,variant,eventName,sessionId:txt(req.body.sessionId,120),slug:txt(req.body.slug,120)});
  res.json({success:true});
});

app.get('/api/vendeurs/slug/:slug',(req,res)=>{
  const slug=txt(req.params.slug,200); const v=read(FILE.vendeurs).find((x)=>x.slug===slug);
  if(!v) return res.status(404).json({error:'Boutique introuvable'});
  res.json(sv(v));
});

app.post('/api/vendeurs',signupLimiter,antispam,async(req,res)=>{
  const vendeurs=read(FILE.vendeurs);
  const nom=txt(req.body.nom,120); const boutique=txt(req.body.boutique,120); const phone=tel(req.body.tel); const email=txt(req.body.email,150).toLowerCase();
  if(!nom||!boutique||!phone) return res.status(400).json({error:'Nom, boutique et numero WhatsApp sont requis'});
  if(vendeurs.some((v)=>tel(v.tel)===phone)) return res.status(409).json({error:'Ce numero WhatsApp est deja utilise'});
  if(email&&vendeurs.some((v)=>String(v.email||'').toLowerCase()===email)) return res.status(409).json({error:'Cet email est deja utilise'});
  const slugBase=req.body.slug||boutique||nom; let slug=slugify(slugBase); let i=1; while(vendeurs.some((v)=>v.slug===slug)){slug=`${slugify(slugBase)}-${i++}`}
  const hasCustomPassword=Boolean(req.body.motdepasse||req.body.password);
  const rawPass=String(req.body.motdepasse||req.body.password||'123456');
  if(hasCustomPassword&&!isStrongPassword(rawPass)){
    return res.status(400).json({error:'Mot de passe trop faible (8+ caracteres avec lettres et chiffres)'});
  }
  const hash=await bcrypt.hash(rawPass,BCRYPT_ROUNDS);
  const nv={
    id:Date.now(),
    role:'vendeur',
    nom,
    email,
    tel:phone,
    boutique,
    slug,
    plan:txt(req.body.plan||'starter',40)||'starter',
    produits:txt(req.body.produits,300),
    dateInscription:new Date().toISOString(),
    actif:true,
    theme:txt(req.body.theme||'dark-green',60),
    motdepasse:hash,
    password:hash,
    tokenVersion:1,
    passwordUpdatedAt:new Date().toISOString(),
    mustResetPassword:!isStrongPassword(rawPass)
  };
  vendeurs.push(nv); write(FILE.vendeurs,vendeurs); audit('vendeur.create',req,{vendeurId:nv.id,slug:nv.slug});
  res.status(201).json({success:true,vendeur:sv(nv),slug:nv.slug});
});

app.get('/api/vendeurs',auth,role('admin'),(req,res)=>res.json(read(FILE.vendeurs).map(sv)));

app.get('/api/vendeurs/:id',auth,(req,res)=>{
  const id=num(req.params.id); if(id===null) return res.status(400).json({error:'ID vendeur invalide'});
  if(!guard(req,res,id)) return;
  const v=read(FILE.vendeurs).find((x)=>x.id===id); if(!v) return res.status(404).json({error:'Vendeur introuvable'});
  res.json(sv(v));
});

app.get('/api/vendeurs/:id/dashboard',auth,(req,res)=>{
  const id=num(req.params.id);
  if(id===null) return res.status(400).json({error:'ID vendeur invalide'});
  if(!guard(req,res,id)) return;
  const periodDays=Math.max(7,Math.min(90,int(req.query.periodDays,30)));
  const dashboard=computeDashboard(id,periodDays);
  const checklist=buildOnboardingChecklist(id);
  res.json({
    vendeurId:id,
    periodDays,
    generatedAt:new Date().toISOString(),
    dashboard,
    checklist
  });
});

app.put('/api/vendeurs/:id',auth,async(req,res)=>{
  const id=num(req.params.id); if(id===null) return res.status(400).json({error:'ID vendeur invalide'});
  if(!guard(req,res,id)) return;
  const vendeurs=read(FILE.vendeurs); const ix=vendeurs.findIndex((v)=>v.id===id); if(ix===-1) return res.status(404).json({error:'Vendeur introuvable'});
  const cur=vendeurs[ix], next={...cur};
  if(req.body.nom!==undefined) next.nom=txt(req.body.nom,120)||cur.nom;
  if(req.body.boutique!==undefined) next.boutique=txt(req.body.boutique,120)||cur.boutique;
  if(req.body.plan!==undefined) next.plan=txt(req.body.plan,40)||cur.plan;
  if(req.body.produits!==undefined) next.produits=txt(req.body.produits,300);
  if(req.body.theme!==undefined) next.theme=txt(req.body.theme,60)||cur.theme;
  if(req.body.shopLayout!==undefined) next.shopLayout=txt(req.body.shopLayout,20)||cur.shopLayout;
  if(req.body.actif!==undefined) next.actif=Boolean(req.body.actif);
  if(req.body.slug!==undefined){let s=slugify(req.body.slug),i=1;while(vendeurs.some((v)=>v.id!==id&&v.slug===s))s=`${slugify(req.body.slug)}-${i++}`;next.slug=s;}
  if(req.body.tel!==undefined){const p=tel(req.body.tel); if(!p) return res.status(400).json({error:'Numero WhatsApp invalide'}); if(vendeurs.some((v)=>v.id!==id&&tel(v.tel)===p)) return res.status(409).json({error:'Ce numero WhatsApp est deja utilise'}); next.tel=p;}
  if(req.body.email!==undefined){const e=txt(req.body.email,150).toLowerCase(); if(e&&vendeurs.some((v)=>v.id!==id&&String(v.email||'').toLowerCase()===e)) return res.status(409).json({error:'Cet email est deja utilise'}); next.email=e;}
  if(req.body.motdepasse||req.body.password){
    const p=String(req.body.motdepasse||req.body.password);
    if(!isStrongPassword(p)) return res.status(400).json({error:'Mot de passe trop faible (8+ caracteres avec lettres et chiffres)'});
    const h=await bcrypt.hash(p,BCRYPT_ROUNDS);
    next.motdepasse=h;
    next.password=h;
    next.passwordUpdatedAt=new Date().toISOString();
    next.mustResetPassword=false;
    next.tokenVersion=toVendeurTokenVersion(cur)+1;
  }
  vendeurs[ix]=next; write(FILE.vendeurs,vendeurs); audit('vendeur.update',req,{vendeurId:id});
  res.json({success:true,vendeur:sv(next)});
});

app.delete('/api/vendeurs/:id',auth,role('admin'),async(req,res)=>{
  const id=num(req.params.id); if(id===null) return res.status(400).json({error:'ID vendeur invalide'});
  const vendeurs=read(FILE.vendeurs); const v=vendeurs.find((x)=>x.id===id); if(!v) return res.status(404).json({error:'Vendeur introuvable'});
  const products=read(FILE.products); products.filter((p)=>p.vendeurId===id).forEach((p)=>{(Array.isArray(p.images)?p.images:[]).forEach(rmImage);rmImage(p.image)});
  write(FILE.vendeurs,vendeurs.filter((x)=>x.id!==id));
  write(FILE.products,products.filter((p)=>p.vendeurId!==id));
  if(useDirectSqlForOrdersPayments()){
    await mysqlPool.execute(`DELETE FROM \`${REL_MAIN_TABLES.payments}\` WHERE vendeur_id=?`,[id]);
    await mysqlPool.execute(`DELETE FROM \`${REL_MAIN_TABLES.orders}\` WHERE vendeur_id=?`,[id]);
    await mysqlPool.execute(`DELETE FROM \`${REL_MAIN_TABLES.analytics}\` WHERE vendeur_id=?`,[id]);
    await mysqlPool.execute(`DELETE FROM \`${REL_MAIN_TABLES.automations}\` WHERE vendeur_id=?`,[id]);
    await syncSqlOrdersPaymentsCache();
  }else{
    write(FILE.orders,read(FILE.orders).filter((o)=>o.vendeurId!==id));
    write(FILE.payments,read(FILE.payments).filter((p)=>p.vendeurId!==id));
  }
  write(FILE.reviews,read(FILE.reviews).filter((r)=>r.vendeurId!==id));
  write(FILE.recovery,read(FILE.recovery).filter((r)=>r.vendeurId!==id));
  if(MYSQL_ENABLED&&mysqlReady){
    await flushMySQLPersistQueue();
  }
  audit('vendeur.delete',req,{vendeurId:id});
  res.json({success:true});
});

app.get('/api/products',(req,res)=>res.json(read(FILE.products)));
app.get('/api/products/:id',(req,res)=>{const id=num(req.params.id);if(id===null)return res.status(400).json({error:'ID produit invalide'});const p=read(FILE.products).find((x)=>x.id===id);if(!p)return res.status(404).json({error:'Produit introuvable'});res.json(p)});
app.get('/api/products/vendeur/:vendeurId',(req,res)=>{const id=num(req.params.vendeurId);if(id===null)return res.status(400).json({error:'ID vendeur invalide'});res.json(read(FILE.products).filter((p)=>p.vendeurId===id))});

app.get('/api/carts',(req,res)=>{
  const slug=txt(req.query.slug,220);
  const clientTel=tel(req.query.clientTel);
  if(!slug||!clientTel) return res.status(400).json({error:'slug et clientTel requis'});
  const carts=readCartStore();
  const entry=carts.find((c)=>c.slug===slug&&c.clientTel===clientTel);
  if(!entry) return res.json({items:[],updatedAt:''});
  res.json({items:Array.isArray(entry.items)?entry.items:[],updatedAt:String(entry.updatedAt||'')});
});

app.post('/api/carts',(req,res)=>{
  const payload=cartInput(req.body||{});
  if(!payload.slug||!payload.clientTel) return res.status(400).json({error:'slug et clientTel requis'});
  const carts=readCartStore();
  const idx=carts.findIndex((c)=>c.slug===payload.slug&&c.clientTel===payload.clientTel);
  if(idx>=0){
    carts[idx]={...carts[idx],items:payload.items,updatedAt:payload.updatedAt};
  }else{
    carts.push(payload);
  }
  writeCartStore(carts);
  res.json({success:true,updatedAt:payload.updatedAt});
});

app.post('/api/products',auth,(req,res)=>{
  const payload=productInput(req.body); if(!payload.nom||payload.prix===null) return res.status(400).json({error:'Nom et prix sont requis'});
  const vendeurId=req.auth.role==='admin'?num(req.body.vendeurId):Number(req.auth.id); if(!vendeurId) return res.status(400).json({error:'vendeurId invalide'});
  if(!guard(req,res,vendeurId)) return;
  const products=read(FILE.products);
  const p={id:Date.now(),...payload,vendeurId};
  pushStockHistory(p,makeStockEntry(null,int(p.stock,0),'create'));
  if(Array.isArray(p.variants)){
    p.variants.forEach((v)=>{
      pushStockHistory(p,makeStockEntry(null,int(v.stock,0),'variant_create',{variantId:v.id,variantName:v.name||v.nom}));
    });
  }
  products.push(p);
  write(FILE.products,products);
  audit('product.create',req,{productId:p.id,vendeurId});
  res.status(201).json(p);
});

app.put('/api/products/:id',auth,(req,res)=>{
  const id=num(req.params.id); if(id===null) return res.status(400).json({error:'ID produit invalide'});
  const products=read(FILE.products); const ix=products.findIndex((p)=>p.id===id); if(ix===-1) return res.status(404).json({error:'Produit introuvable'});
  const cur=products[ix]; if(!guard(req,res,cur.vendeurId)) return;
  const payload=productInput(req.body); const next={...cur,...payload,prix:payload.prix===null?cur.prix:payload.prix};
  if(req.body.stock===undefined) next.stock=cur.stock; if(req.body.lowStockThreshold===undefined) next.lowStockThreshold=cur.lowStockThreshold; if(req.body.variants===undefined) next.variants=cur.variants;
  const prevStock=int(cur.stock,0);
  const nextStock=int(next.stock,0);
  if(prevStock!==nextStock){
    pushStockHistory(next,makeStockEntry(prevStock,nextStock,'manual_update'));
  }
  const prevVariants=Array.isArray(cur.variants)?cur.variants:[];
  const nextVariants=Array.isArray(next.variants)?next.variants:[];
  const prevMap=new Map(prevVariants.map((v)=>[String(v&&v.id),v]));
  nextVariants.forEach((v)=>{
    const idKey=String(v&&v.id);
    const prev=prevMap.get(idKey);
    const prevStock=int(prev&&prev.stock,0);
    const newStock=int(v&&v.stock,0);
    if(!prev){
      pushStockHistory(next,makeStockEntry(null,newStock,'variant_add',{variantId:v.id,variantName:v.name||v.nom}));
      return;
    }
    if(prevStock!==newStock){
      pushStockHistory(next,makeStockEntry(prevStock,newStock,'variant_update',{variantId:v.id,variantName:v.name||v.nom}));
    }
  });
  prevMap.forEach((prev, key)=>{
    if(!nextVariants.find((v)=>String(v&&v.id)===key)){
      pushStockHistory(next,makeStockEntry(int(prev&&prev.stock,0),null,'variant_remove',{variantId:key,variantName:prev.name||prev.nom}));
    }
  });
  products[ix]=next; write(FILE.products,products); audit('product.update',req,{productId:id,vendeurId:cur.vendeurId});
  res.json(next);
});

app.delete('/api/products/:id',auth,(req,res)=>{
  const id=num(req.params.id); if(id===null) return res.status(400).json({error:'ID produit invalide'});
  const products=read(FILE.products); const target=products.find((p)=>p.id===id); if(!target) return res.status(404).json({error:'Produit introuvable'});
  if(!guard(req,res,target.vendeurId)) return;
  (Array.isArray(target.images)?target.images:[]).forEach(rmImage); rmImage(target.image);
  write(FILE.products,products.filter((p)=>p.id!==id)); audit('product.delete',req,{productId:id,vendeurId:target.vendeurId});
  res.json({success:true});
});

app.post('/api/upload',auth,upload.array('images',5),async(req,res)=>{
  const files=Array.isArray(req.files)?req.files:[]; if(!files.length) return res.status(400).json({error:'Aucune image envoyee'});
  const urls=[]; for(const f of files){urls.push(await saveImage(f.buffer));}
  audit('upload.multiple',req,{count:urls.length}); res.json({urls});
});

app.post('/api/upload/product-image',auth,upload.single('image'),async(req,res)=>{
  if(!req.file) return res.status(400).json({error:'Aucune image envoyee'});
  const imageUrl=await saveImage(req.file.buffer); audit('upload.single',req,{imageUrl}); res.json({imageUrl});
});
app.post('/api/orders',orderLimiter,antispam,async(req,res)=>{
  const t0=Date.now();
  const orderLog=(msg,extra='')=>{
    if(!ORDER_DEBUG) return;
    const delta=Date.now()-t0;
    console.log(`[order][${delta}ms] ${msg}${extra?` ${extra}`:''}`);
  };
  const vendeurId=num(req.body.vendeurId);
  if(!vendeurId) return res.status(400).json({error:'vendeurId invalide'});
  const vendeur=read(FILE.vendeurs).find((v)=>v.id===vendeurId); if(!vendeur) return res.status(404).json({error:'Vendeur introuvable'});

  const items=(Array.isArray(req.body.items)?req.body.items:[]).map((it)=>({
    id:num(it.id),nom:txt(it.nom,150),prix:num(it.prix)||0,image:txt(it.image,300),quantity:Math.max(1,int(it.quantity,1)),variantId:txt(it.variantId,60)
  })).filter((it)=>it.id&&it.nom);
  if(!items.length) return res.status(400).json({error:'Panier vide'});

  const totalCalc=items.reduce((s,it)=>s+it.prix*it.quantity,0);
  const total=num(req.body.total);
  const paymentMethod=normalizePaymentMethod(req.body.paymentMethod||'cash_on_delivery');
  const order={
    id:Date.now(),vendeurId,clientNom:txt(req.body.clientNom||'Client',100),clientTel:txt(req.body.clientTel,40),items,
    total:total===null?totalCalc:total,statut:'en_attente',dateCommande:new Date().toISOString(),notes:txt(req.body.notes,600),
    payment:{method:paymentMethod,provider:paymentMethod==='cash_on_delivery'?'manual':'mock-gateway',status:'pending',reference:null,updatedAt:new Date().toISOString()}
  };

  if(useDirectSqlForOrdersPayments()){
    orderLog('sqlPersistOrder:start');
    await sqlPersistOrder(order);
    orderLog('sqlPersistOrder:done');
    orderLog('syncSqlCacheStore:orders:start');
    await syncSqlCacheStore('orders');
    orderLog('syncSqlCacheStore:orders:done');
  }else{
    const orders=read(FILE.orders);
    orders.push(order); write(FILE.orders,orders);
  }
  orderLog('applyStock:start');
  const alerts=applyStock(order);
  orderLog('applyStock:done',`alerts=${alerts.length}`);

  if(alerts.length&&vendeur.email){
    const lines=alerts.map((a)=>`- ${a.productName}${a.variant?` (${a.variant})`:''}: stock ${a.stock}`).join('<br>');
    void mail({from:SMTP_USER||'noreply@whabiz.local',to:vendeur.email,subject:'Alerte stock bas WhaBiz',html:`<h3>Stock bas detecte</h3><p>${lines}</p>`});
  }

  if(vendeur.email){
    const itemsList=items.map((it)=>`- ${it.nom} (x${it.quantity}) : ${(it.prix*it.quantity).toLocaleString()} FCFA`).join('\n');
    void mail({from:SMTP_USER||'noreply@whabiz.local',to:vendeur.email,subject:`Nouvelle commande #${order.id}`,html:`<h2>Nouvelle commande</h2><p>Commande #${order.id}</p><pre>${itemsList}</pre><p>Total: ${order.total.toLocaleString()} FCFA</p>`});
  }

  track('order_created',{vendeurId,slug:vendeur.slug,sessionId:txt(req.body.sessionId,120),metadata:{orderId:order.id,total:order.total,paymentMethod}});
  audit('order.create',req,{orderId:order.id,vendeurId,paymentMethod});
  res.status(201).json(order);
});

app.get('/api/orders',auth,role('admin'),async(req,res)=>{
  if(useDirectSqlForOrdersPayments()){
    return res.json(await sqlLoadOrders());
  }
  return res.json(read(FILE.orders));
});

app.get('/api/orders/vendeur/:vendeurId',auth,async(req,res)=>{
  const vendeurId=num(req.params.vendeurId); if(vendeurId===null) return res.status(400).json({error:'ID vendeur invalide'});
  if(!guard(req,res,vendeurId)) return;
  if(useDirectSqlForOrdersPayments()){
    return res.json(await sqlLoadOrders({vendeurId}));
  }
  return res.json(read(FILE.orders).filter((o)=>o.vendeurId===vendeurId));
});

app.get('/api/orders/:id',auth,async(req,res)=>{
  const id=num(req.params.id); if(id===null) return res.status(400).json({error:'ID commande invalide'});
  const order=useDirectSqlForOrdersPayments()?await sqlLoadOrderById(id):read(FILE.orders).find((o)=>o.id===id);
  if(!order) return res.status(404).json({error:'Commande introuvable'});
  if(!guard(req,res,order.vendeurId)) return;
  return res.json(order);
});

app.put('/api/orders/:id/status',auth,async(req,res)=>{
  const id=num(req.params.id); if(id===null) return res.status(400).json({error:'ID commande invalide'});
  const status=normalizeOrderStatus(txt(req.body.statut,40));
  if(!status) return res.status(400).json({error:'Statut requis'});
  if(!isOrderStatus(status)) return res.status(400).json({error:'Statut invalide',allowed:ORDER_STATUSES});
  let order=null;
  let oldStatus='';
  let oldNormalized='';
  if(useDirectSqlForOrdersPayments()){
    order=await sqlLoadOrderById(id);
    if(!order) return res.status(404).json({error:'Commande introuvable'});
    if(!guard(req,res,order.vendeurId)) return;
    oldStatus=String(order.statut||'');
    oldNormalized=normalizeOrderStatus(oldStatus);
    if(oldNormalized&&!canTransitionOrderStatus(oldNormalized,status)){
      return res.status(400).json({error:'Transition de statut invalide',allowed:allowedNextOrderStatuses(oldNormalized)});
    }
    order.statut=status;
    order.dateModification=new Date().toISOString();
    await sqlPersistOrder(order);
    await syncSqlCacheStore('orders');
  }else{
    const orders=read(FILE.orders); const ix=orders.findIndex((o)=>o.id===id); if(ix===-1) return res.status(404).json({error:'Commande introuvable'});
    if(!guard(req,res,orders[ix].vendeurId)) return;
    oldStatus=String(orders[ix].statut||'');
    oldNormalized=normalizeOrderStatus(oldStatus);
    if(oldNormalized&&!canTransitionOrderStatus(oldNormalized,status)){
      return res.status(400).json({error:'Transition de statut invalide',allowed:allowedNextOrderStatuses(oldNormalized)});
    }
    orders[ix].statut=status; orders[ix].dateModification=new Date().toISOString(); write(FILE.orders,orders);
    order=orders[ix];
  }
  if(status==='livree'&&oldNormalized!=='livree'){const v=read(FILE.vendeurs).find((x)=>x.id===order.vendeurId); if(v&&v.email) await mail({from:SMTP_USER||'noreply@whabiz.local',to:v.email,subject:`Commande #${order.id} livree`,html:`<h2>Commande livree</h2><p>Commande #${order.id} marquee livree.</p><p>Montant: ${Number(order.total||0).toLocaleString()} FCFA</p>`});}
  audit('order.status.update',req,{orderId:id,status});
  return res.json(order);
});

app.delete('/api/orders/:id',auth,async(req,res)=>{
  const id=num(req.params.id); if(id===null) return res.status(400).json({error:'ID commande invalide'});
  const order=useDirectSqlForOrdersPayments()?await sqlLoadOrderById(id):read(FILE.orders).find((o)=>o.id===id);
  if(!order) return res.status(404).json({error:'Commande introuvable'});
  if(!guard(req,res,order.vendeurId)) return;
  if(useDirectSqlForOrdersPayments()){
    await sqlDeleteOrderById(id);
    await syncSqlCacheStore('orders');
  }else{
    const orders=read(FILE.orders);
    write(FILE.orders,orders.filter((o)=>o.id!==id));
  }
  audit('order.delete',req,{orderId:id,vendeurId:order.vendeurId});
  return res.json({success:true});
});

app.post('/api/orders/:id/remind',auth,async(req,res)=>{
  const id=num(req.params.id); if(id===null) return res.status(400).json({error:'ID commande invalide'});
  let order=null;
  if(useDirectSqlForOrdersPayments()){
    order=await sqlLoadOrderById(id);
    if(!order) return res.status(404).json({error:'Commande introuvable'});
    if(!guard(req,res,order.vendeurId)) return;
  }else{
    const orders=read(FILE.orders); const ix=orders.findIndex((o)=>o.id===id); if(ix===-1) return res.status(404).json({error:'Commande introuvable'});
    order=orders[ix];
    if(!guard(req,res,order.vendeurId)) return;
    orders[ix].lastReminderAt=new Date().toISOString(); write(FILE.orders,orders);
  }
  const v=read(FILE.vendeurs).find((x)=>x.id===order.vendeurId);
  const message=`Bonjour ${order.clientNom}, votre commande #${order.id} (${order.total.toLocaleString()} FCFA) est toujours en cours. Merci de confirmer votre disponibilite.`;
  const whatsappUrl=order.clientTel?`https://wa.me/${tel(order.clientTel)}?text=${encodeURIComponent(message)}`:'';
  if(useDirectSqlForOrdersPayments()){
    order.lastReminderAt=new Date().toISOString();
    await sqlPersistOrder(order);
    await syncSqlCacheStore('orders');
  }
  audit('order.reminder.sent',req,{orderId:order.id,vendeurId:order.vendeurId,hasWhatsapp:Boolean(whatsappUrl)});
  if(v&&v.email) mail({from:SMTP_USER||'noreply@whabiz.local',to:v.email,subject:`Relance client commande #${order.id}`,html:`<p>Relance declenchee pour la commande #${order.id}.</p>`});
  return res.json({success:true,whatsappUrl,message});
});

app.get('/api/orders/:id/invoice.pdf',auth,async(req,res)=>{
  const id=num(req.params.id); if(id===null) return res.status(400).json({error:'ID commande invalide'});
  const order=useDirectSqlForOrdersPayments()?await sqlLoadOrderById(id):read(FILE.orders).find((o)=>o.id===id);
  if(!order) return res.status(404).json({error:'Commande introuvable'});
  if(!guard(req,res,order.vendeurId)) return;
  const v=read(FILE.vendeurs).find((x)=>x.id===order.vendeurId);
  res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition',`attachment; filename="facture-${order.id}.pdf"`);
  const doc=new PDFDocument({margin:40}); doc.pipe(res);
  doc.fontSize(18).text('WhaBiz - Facture'); doc.moveDown(0.5);
  doc.fontSize(11).text(`Facture #${order.id}`); doc.text(`Date: ${new Date(order.dateCommande).toLocaleString('fr-FR')}`);
  doc.text(`Boutique: ${v?v.boutique:'-'}`); doc.text(`Client: ${order.clientNom||'-'}`); doc.text(`Tel: ${order.clientTel||'-'}`); doc.moveDown();
  (order.items||[]).forEach((it)=>doc.text(`${it.nom} x${it.quantity} - ${(Number(it.prix||0)*Number(it.quantity||0)).toLocaleString()} FCFA`));
  doc.moveDown(); doc.fontSize(13).text(`TOTAL: ${Number(order.total||0).toLocaleString()} FCFA`,{align:'right'}); doc.moveDown();
  doc.fontSize(10).text(`Statut commande: ${order.statut}`); doc.text(`Statut paiement: ${(order.payment&&order.payment.status)||'pending'}`);
  doc.end();
});

app.post('/api/payments/checkout',orderLimiter,antispam,async(req,res)=>{
  const orderId=num(req.body.orderId); const method=normalizePaymentMethod(req.body.method||'cash_on_delivery');
  if(!orderId) return res.status(400).json({error:'orderId invalide'});
  let order=useDirectSqlForOrdersPayments()?await sqlLoadOrderById(orderId):read(FILE.orders).find((o)=>o.id===orderId);
  if(!order) return res.status(404).json({error:'Commande introuvable'});
  const reference=`pay_${rid()}`; const provider=paymentProviderId(method);
  const now=new Date().toISOString();
  const payment={id:Date.now(),orderId:order.id,vendeurId:order.vendeurId,amount:Number(order.total||0),currency:'XOF',method,provider,reference,status:'pending',createdAt:now,updatedAt:now,details:{}};
  if(useDirectSqlForOrdersPayments()){
    await sqlPersistPayment(payment);
    order={...order,payment:{method,provider,reference,status:'pending',updatedAt:now}};
    await sqlPersistOrder(order);
    await syncSqlOrdersPaymentsCache();
  }else{
    const payments=read(FILE.payments); payments.push(payment);
    write(FILE.payments,payments);
    const orders=read(FILE.orders);
    const ox=orders.findIndex((o)=>o.id===orderId);
    if(ox!==-1){
      orders[ox].payment={method,provider,reference,status:'pending',updatedAt:now};
      write(FILE.orders,orders);
    }
  }
  track('payment_checkout_started',{vendeurId:order.vendeurId,sessionId:txt(req.body.sessionId,120),metadata:{orderId:order.id,reference,method}});
  audit('payment.checkout.create',req,{orderId:order.id,reference,method});
  const checkoutUrl=method==='cash_on_delivery'?'':`/payment/mock/${reference}`;
  res.json({success:true,payment:{reference,status:'pending',method,checkoutUrl}});
});

app.get('/payment/mock/:reference',(req,res)=>{
  const reference=txt(req.params.reference,120);
  const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Mock Payment</title><style>body{font-family:Arial,sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{background:#111827;border:1px solid #334155;border-radius:16px;padding:24px;max-width:420px;width:92%}button{border:0;border-radius:999px;padding:12px 18px;font-weight:700;cursor:pointer;margin-right:8px}.ok{background:#10b981;color:#052e16}.ko{background:#ef4444;color:#fff}small{color:#94a3b8}</style></head><body><div class="card"><h2>Paiement simulation</h2><p>Reference: <strong>${reference}</strong></p><p><small>Cliquez sur un resultat pour envoyer le webhook mock.</small></p><button class="ok" onclick="send('paid')">Valider paiement</button><button class="ko" onclick="send('failed')">Echec paiement</button><p id="status"></p></div><script>async function send(status){const res=await fetch('/api/payments/webhook/mock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference:'${reference}',status:status})});const data=await res.json();document.getElementById('status').textContent=data.success?'Webhook envoye: '+status:(data.error||'Erreur')}</script></body></html>`;
  res.setHeader('Content-Type','text/html; charset=utf-8'); res.send(html);
});

app.post('/api/payments/webhook/mock',async(req,res)=>{
  const reference=txt(req.body.reference,120); const status=txt(req.body.status,30)||'failed';
  if(!reference) return res.status(400).json({error:'reference requise'});
  if(!['paid','failed','cancelled','pending'].includes(status)) return res.status(400).json({error:'status invalide'});
  const p=await updatePayment(reference,status,{webhookMock:true}); if(!p) return res.status(404).json({error:'Paiement introuvable'});
  if(status==='paid') track('payment_success',{vendeurId:p.vendeurId,metadata:{orderId:p.orderId,reference}});
  audit('payment.webhook.mock',req,{reference,status,orderId:p.orderId});
  res.json({success:true,payment:p});
});

app.post('/api/payments/webhook',async(req,res)=>{
  const signature=String(req.headers['x-whabiz-signature']||'');
  if(PAYMENT_WEBHOOK_SECRET){const body=JSON.stringify(req.body||{});const expected=crypto.createHmac('sha256',PAYMENT_WEBHOOK_SECRET).update(body).digest('hex');if(signature!==expected)return res.status(401).json({error:'Signature webhook invalide'})}
  const reference=txt(req.body.reference,120); const status=txt(req.body.status,30);
  if(!reference||!status) return res.status(400).json({error:'reference et status requis'});
  const p=await updatePayment(reference,status,{webhookProvider:true,payload:req.body}); if(!p) return res.status(404).json({error:'Paiement introuvable'});
  if(status==='paid') track('payment_success',{vendeurId:p.vendeurId,metadata:{orderId:p.orderId,reference}});
  audit('payment.webhook.provider',req,{reference,status,orderId:p.orderId});
  res.json({success:true});
});

app.get('/api/payments/:reference',auth,async(req,res)=>{
  const reference=txt(req.params.reference,120);
  const p=useDirectSqlForOrdersPayments()?await sqlLoadPaymentByReference(reference):read(FILE.payments).find((x)=>x.reference===reference);
  if(!p) return res.status(404).json({error:'Paiement introuvable'});
  if(!guard(req,res,p.vendeurId)) return;
  res.json(p);
});

app.get('/api/reviews/product/:productId',(req,res)=>{const id=num(req.params.productId);if(id===null)return res.status(400).json({error:'ID produit invalide'});res.json(read(FILE.reviews).filter((r)=>r.productId===id).sort((a,b)=>new Date(b.dateAvis)-new Date(a.dateAvis)))});
app.get('/api/reviews/vendeur/:vendeurId',(req,res)=>{const id=num(req.params.vendeurId);if(id===null)return res.status(400).json({error:'ID vendeur invalide'});res.json(read(FILE.reviews).filter((r)=>r.vendeurId===id).sort((a,b)=>new Date(b.dateAvis)-new Date(a.dateAvis)))});

app.post('/api/reviews',analyticsLimiter,antispam,(req,res)=>{
  const productId=num(req.body.productId); const vendeurId=num(req.body.vendeurId); const ratingRaw=num(req.body.rating);
  if(!productId||!vendeurId) return res.status(400).json({error:'productId et vendeurId sont requis'});
  const rating=(ratingRaw&&ratingRaw>=1&&ratingRaw<=5)?ratingRaw:5;
  const r={id:Date.now(),productId,vendeurId,clientNom:txt(req.body.clientNom||'Client',80),rating,comment:txt(req.body.comment||'',500),dateAvis:new Date().toISOString()};
  const reviews=read(FILE.reviews); reviews.push(r); write(FILE.reviews,reviews); track('review_created',{vendeurId,metadata:{productId,rating}});
  res.status(201).json(r);
});

app.delete('/api/reviews/:id',auth,(req,res)=>{
  const id=num(req.params.id); if(id===null) return res.status(400).json({error:'ID avis invalide'});
  const reviews=read(FILE.reviews); const r=reviews.find((x)=>x.id===id); if(!r) return res.status(404).json({error:'Avis introuvable'});
  if(!guard(req,res,r.vendeurId)) return;
  write(FILE.reviews,reviews.filter((x)=>x.id!==id)); audit('review.delete',req,{reviewId:id,vendeurId:r.vendeurId});
  res.json({success:true});
});

app.get('/api/exports/orders.csv',auth,async(req,res)=>{
  const vendeurId=num(req.query.vendeurId); if(!vendeurId) return res.status(400).json({error:'vendeurId requis'});
  if(!guard(req,res,vendeurId)) return;
  const orders=useDirectSqlForOrdersPayments()?await sqlLoadOrders({vendeurId}):read(FILE.orders).filter((o)=>o.vendeurId===vendeurId);
  const rows=[['order_id','date','client','tel','statut','total','payment_status','payment_method','items_count']];
  orders.forEach((o)=>rows.push([o.id,o.dateCommande,o.clientNom,o.clientTel,o.statut,o.total,(o.payment&&o.payment.status)||'pending',(o.payment&&o.payment.method)||'cash_on_delivery',Array.isArray(o.items)?o.items.length:0]));
  res.setHeader('Content-Type','text/csv; charset=utf-8'); res.setHeader('Content-Disposition',`attachment; filename="orders-${vendeurId}.csv"`); res.send(csv(rows));
});

app.get('/api/exports/products.csv',auth,(req,res)=>{
  const vendeurId=num(req.query.vendeurId); if(!vendeurId) return res.status(400).json({error:'vendeurId requis'});
  if(!guard(req,res,vendeurId)) return;
  const products=read(FILE.products).filter((p)=>p.vendeurId===vendeurId);
  const rows=[['product_id','nom','categorie','prix','prix_avant','stock','low_stock_threshold','image','images','variants']];
  products.forEach((p)=>{
    const images=Array.isArray(p.images)?p.images.filter(Boolean):[];
    const image=p.image||images[0]||'';
    const variants=Array.isArray(p.variants)?p.variants.map((v)=>`${v.name||v.nom}:${int(v.stock,0)}`).join('|'):'';
    rows.push([p.id,p.nom,p.categorie,p.prix,p.prixAvant??'',int(p.stock,0),int(p.lowStockThreshold,3),image,images.join('|'),variants]);
  });
  res.setHeader('Content-Type','text/csv; charset=utf-8'); res.setHeader('Content-Disposition',`attachment; filename="products-${vendeurId}.csv"`); res.send(csv(rows));
});

app.get('/api/analytics/funnel',auth,(req,res)=>{
  const vendeurId=num(req.query.vendeurId); if(!vendeurId) return res.status(400).json({error:'vendeurId requis'});
  if(!guard(req,res,vendeurId)) return;
  const start=req.query.start?new Date(req.query.start).getTime():null; const end=req.query.end?new Date(req.query.end).getTime():null;
  const events=read(FILE.analytics).filter((e)=>Number(e.vendeurId)===vendeurId&&(!start||new Date(e.at).getTime()>=start)&&(!end||new Date(e.at).getTime()<=end));
  const steps=['view_product','add_to_cart','start_checkout','order_created','payment_success']; const counts={}; steps.forEach((s)=>counts[s]=events.filter((e)=>e.eventName===s).length);
  res.json({vendeurId,period:{start:req.query.start||null,end:req.query.end||null},counts,conversion:{view_to_order:counts.view_product?Number((counts.order_created/counts.view_product).toFixed(4)):0,checkout_to_paid:counts.start_checkout?Number((counts.payment_success/counts.start_checkout).toFixed(4)):0}});
});

app.get('/api/experiments/results',auth,role('admin'),(req,res)=>{
  const experimentId=txt(req.query.experimentId,120); if(!experimentId) return res.status(400).json({error:'experimentId requis'});
  const events=read(FILE.experiments).filter((e)=>e.experimentId===experimentId); const variants={};
  events.forEach((e)=>{const v=e.variant||'unknown'; if(!variants[v]) variants[v]={totalEvents:0,conversionEvents:0}; variants[v].totalEvents++; if(e.eventName==='signup_submit'||e.eventName==='purchase_complete') variants[v].conversionEvents++;});
  res.json({experimentId,variants,totalEvents:events.length});
});

app.get('/api/admin/audit',auth,role('admin'),(req,res)=>{const limit=Math.min(1000,Math.max(1,int(req.query.limit,200))); const logs=read(FILE.audit); res.json(logs.slice(-limit).reverse())});
app.get('/api/admin/metrics',auth,role('admin'),async(req,res)=>{
  const vendeurs=read(FILE.vendeurs);
  const products=read(FILE.products);
  const orders=useDirectSqlForOrdersPayments()?await sqlLoadOrders():read(FILE.orders);
  const payments=useDirectSqlForOrdersPayments()?await sqlLoadPayments():read(FILE.payments);
  const revenuePaid=orders.filter((o)=>o.payment&&o.payment.status==='paid').reduce((s,o)=>s+Number(o.total||0),0);
  res.json({uptimeSec:Math.round(process.uptime()),vendeurs:vendeurs.length,produits:products.length,commandes:orders.length,paiements:payments.length,revenuePaid});
});

app.get('/api/admin/ops/alerts',auth,role('admin'),(req,res)=>{
  const limit=Math.min(1000,Math.max(1,int(req.query.limit,200)));
  const logs=readFileArray(OBS_FILE.alerts);
  res.json(logs.slice(-limit).reverse());
});
app.get('/api/admin/ops/errors',auth,role('admin'),(req,res)=>{
  const limit=Math.min(1000,Math.max(1,int(req.query.limit,200)));
  const logs=readFileArray(OBS_FILE.errors);
  res.json(logs.slice(-limit).reverse());
});
app.get('/api/admin/ops/backups',auth,role('admin'),(req,res)=>{
  const limit=Math.min(1000,Math.max(1,int(req.query.limit,200)));
  const logs=readFileArray(OBS_FILE.backups);
  res.json(logs.slice(-limit).reverse());
});

app.use((err,req,res,next)=>{
  if(err instanceof multer.MulterError){
    if(err.code==='LIMIT_FILE_SIZE') return res.status(400).json({error:'Image trop lourde (max 5MB)',requestId:req.requestId||null});
    return res.status(400).json({error:err.message,requestId:req.requestId||null});
  }
  if(err){
    const status=Number(err.statusCode||err.status)||500;
    logOpsError(err,'express',req,{status});
    if(status>=500){
      pushOpsAlert('error','api_internal_error','Erreur API non geree',{requestId:req.requestId||null,url:req.originalUrl||'',status});
    }
    const message=status>=500?'Erreur interne du serveur':(err.message||'Requete invalide');
    return res.status(status).json({error:message,requestId:req.requestId||null});
  }
  next();
});

app.get('/',(req,res)=>res.sendFile(path.join(FRONT,'index.html')));
app.get('/admin',(req,res)=>res.sendFile(path.join(FRONT,'admin.html')));
app.get('/admin/login',(req,res)=>res.sendFile(path.join(FRONT,'admin-login.html')));
app.get('/vendeur',(req,res)=>res.sendFile(path.join(FRONT,'vendeur','login.html')));
app.get('/vendeur/signup',(req,res)=>res.sendFile(path.join(FRONT,'vendeur','signup.html')));
app.get('/vendeur/dashboard',(req,res)=>res.sendFile(path.join(FRONT,'vendeur','dashboard.html')));
app.get('/vendeur/orders',(req,res)=>res.sendFile(path.join(FRONT,'vendeur','orders.html')));
app.get('/vendeur/stats',(req,res)=>res.sendFile(path.join(FRONT,'vendeur','stats.html')));
app.get('/vendeur/themes',(req,res)=>res.sendFile(path.join(FRONT,'vendeur','themes.html')));
app.get('/vendeur/email',(req,res)=>res.sendFile(path.join(FRONT,'vendeur','email-settings.html')));
app.get('/vendeur/recovery',(req,res)=>res.sendFile(path.join(FRONT,'vendeur','recovery.html')));
app.get('/:slug',(req,res)=>res.sendFile(path.join(FRONT,'boutique.html')));

async function startServer(){
  await initMySQLStore();
  startBackupScheduler();
  const server=app.listen(PORT,'0.0.0.0',()=>console.log(`WhaBiz server running on http://localhost:${PORT}`));
  server.on('error',(err)=>{
    logOpsError(err,'server.listen',null,{port:PORT});
    pushOpsAlert('error','server_listen_error','Le serveur n a pas pu demarrer',{port:PORT,message:err.message});
    console.error('Server listen error:',err.message);
    process.exit(1);
  });
}

startServer().catch((err)=>{
  console.error('Server startup failed:',err.message);
  process.exit(1);
});

process.on('SIGINT',async()=>{
  await flushMySQLPersistQueue();
  if(mysqlPool){
    try{await mysqlPool.end();}catch{}
  }
  process.exit(0);
});

process.on('SIGTERM',async()=>{
  await flushMySQLPersistQueue();
  if(mysqlPool){
    try{await mysqlPool.end();}catch{}
  }
  process.exit(0);
});

process.on('unhandledRejection',(reason)=>{
  logOpsError(reason instanceof Error?reason:new Error(String(reason||'Unhandled rejection')),'process.unhandledRejection');
  pushOpsAlert('error','process_unhandled_rejection','Unhandled promise rejection detectee',{message:String(reason||'')});
});

process.on('uncaughtException',(err)=>{
  logOpsError(err,'process.uncaughtException');
  pushOpsAlert('error','process_uncaught_exception','Uncaught exception detectee',{message:err.message});
  console.error('Uncaught exception:',err.message);
});
