const fs=require('fs');
const path=require('path');
const mysql=require('mysql2/promise');
const dotenv=require('dotenv');
const {createMysqlPool}=require('../mysql-ssl');

const ROOT=path.join(__dirname,'..');
dotenv.config({path:path.join(ROOT,'.env')});

const DATA=path.join(ROOT,'data');
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

const MYSQL_URL=String(process.env.MYSQL_URL||'').trim();
const MYSQL_HOST=String(process.env.MYSQL_HOST||'127.0.0.1').trim();
const MYSQL_PORT=Number(process.env.MYSQL_PORT)||3306;
const MYSQL_USER=String(process.env.MYSQL_USER||'root').trim();
const MYSQL_PASSWORD=String(process.env.MYSQL_PASSWORD||'').trim();
const MYSQL_DATABASE=String(process.env.MYSQL_DATABASE||'whabiz').trim();
const MYSQL_TABLE=String(process.env.MYSQL_TABLE||'whabiz_store').trim(); // backup table

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

function readArray(file){
  try{
    const raw=JSON.parse(fs.readFileSync(file,'utf8'));
    return Array.isArray(raw)?raw:[];
  }catch{
    return [];
  }
}

function toFiniteNumber(v,d=0){
  const n=Number(v);
  return Number.isFinite(n)?n:d;
}

function toIntValue(v,d=0){
  const n=parseInt(String(v),10);
  return Number.isFinite(n)?n:d;
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

function buildReferenceSets(allData){
  const idsFor=(storeKey)=>new Set(
    (Array.isArray(allData[storeKey])?allData[storeKey]:[])
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

async function ensureSchema(pool){
  await pool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.vendeurs}\` (row_id VARCHAR(191) PRIMARY KEY,vendeur_id BIGINT NULL,role VARCHAR(30) NULL,nom VARCHAR(180) NULL,email VARCHAR(190) NULL,tel VARCHAR(40) NULL,boutique VARCHAR(190) NULL,slug VARCHAR(220) NULL,plan VARCHAR(40) NULL,actif TINYINT(1) NULL,date_inscription VARCHAR(40) NULL,payload_json LONGTEXT NOT NULL,created_at_txt VARCHAR(40) NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_vendeurs_id(vendeur_id),KEY idx_rel_vendeurs_slug(slug),KEY idx_rel_vendeurs_tel(tel)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.products}\` (row_id VARCHAR(191) PRIMARY KEY,product_id BIGINT NULL,vendeur_id BIGINT NULL,nom VARCHAR(190) NULL,categorie VARCHAR(120) NULL,prix DECIMAL(14,2) NULL,stock INT NULL,payload_json LONGTEXT NOT NULL,created_at_txt VARCHAR(40) NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_products_id(product_id),KEY idx_rel_products_vendeur(vendeur_id),KEY idx_rel_products_category(categorie)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_CHILD_TABLES.productImages}\` (id BIGINT AUTO_INCREMENT PRIMARY KEY,product_id BIGINT NULL,image_url VARCHAR(500) NULL,sort_order INT NULL,KEY idx_rel_product_images_product(product_id)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_CHILD_TABLES.productVariants}\` (id BIGINT AUTO_INCREMENT PRIMARY KEY,product_id BIGINT NULL,variant_id VARCHAR(120) NULL,name VARCHAR(190) NULL,stock INT NULL,sort_order INT NULL,KEY idx_rel_product_variants_product(product_id)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.orders}\` (row_id VARCHAR(191) PRIMARY KEY,order_id BIGINT NULL,vendeur_id BIGINT NULL,statut VARCHAR(60) NULL,total DECIMAL(14,2) NULL,date_commande VARCHAR(40) NULL,payment_status VARCHAR(60) NULL,payment_method VARCHAR(80) NULL,payload_json LONGTEXT NOT NULL,created_at_txt VARCHAR(40) NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_orders_id(order_id),KEY idx_rel_orders_vendeur(vendeur_id),KEY idx_rel_orders_statut(statut),KEY idx_rel_orders_date(date_commande)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_CHILD_TABLES.orderItems}\` (id BIGINT AUTO_INCREMENT PRIMARY KEY,order_id BIGINT NULL,product_id BIGINT NULL,nom VARCHAR(190) NULL,prix DECIMAL(14,2) NULL,quantity INT NULL,variant_id VARCHAR(120) NULL,sort_order INT NULL,payload_json LONGTEXT NULL,KEY idx_rel_order_items_order(order_id),KEY idx_rel_order_items_product(product_id)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.payments}\` (row_id VARCHAR(191) PRIMARY KEY,payment_id BIGINT NULL,order_id BIGINT NULL,vendeur_id BIGINT NULL,reference VARCHAR(190) NULL,status VARCHAR(60) NULL,method VARCHAR(80) NULL,provider VARCHAR(120) NULL,amount DECIMAL(14,2) NULL,payload_json LONGTEXT NOT NULL,created_at_txt VARCHAR(40) NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_payments_order(order_id),KEY idx_rel_payments_reference(reference),KEY idx_rel_payments_status(status)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.reviews}\` (row_id VARCHAR(191) PRIMARY KEY,review_id BIGINT NULL,product_id BIGINT NULL,vendeur_id BIGINT NULL,rating INT NULL,date_avis VARCHAR(40) NULL,payload_json LONGTEXT NOT NULL,created_at_txt VARCHAR(40) NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_reviews_product(product_id),KEY idx_rel_reviews_vendeur(vendeur_id)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.recovery}\` (row_id VARCHAR(191) PRIMARY KEY,vendeur_id BIGINT NULL,tel VARCHAR(40) NULL,code VARCHAR(20) NULL,expires_at VARCHAR(40) NULL,payload_json LONGTEXT NOT NULL,created_at_txt VARCHAR(40) NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_recovery_vendeur(vendeur_id),KEY idx_rel_recovery_tel(tel)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.analytics}\` (row_id VARCHAR(191) PRIMARY KEY,event_id VARCHAR(191) NULL,event_name VARCHAR(120) NULL,vendeur_id BIGINT NULL,slug VARCHAR(220) NULL,session_id VARCHAR(191) NULL,event_at VARCHAR(40) NULL,payload_json LONGTEXT NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_analytics_event(event_name),KEY idx_rel_analytics_vendeur(vendeur_id),KEY idx_rel_analytics_at(event_at)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.experiments}\` (row_id VARCHAR(191) PRIMARY KEY,event_id VARCHAR(191) NULL,experiment_id VARCHAR(191) NULL,variant VARCHAR(120) NULL,event_name VARCHAR(120) NULL,event_at VARCHAR(40) NULL,payload_json LONGTEXT NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_experiments_id(experiment_id),KEY idx_rel_experiments_variant(variant)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.audit}\` (row_id VARCHAR(191) PRIMARY KEY,audit_id VARCHAR(191) NULL,action VARCHAR(190) NULL,actor_role VARCHAR(40) NULL,actor_id VARCHAR(120) NULL,event_at VARCHAR(40) NULL,payload_json LONGTEXT NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_audit_action(action),KEY idx_rel_audit_actor(actor_id),KEY idx_rel_audit_at(event_at)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS \`${REL_MAIN_TABLES.automations}\` (row_id VARCHAR(191) PRIMARY KEY,automation_id VARCHAR(191) NULL,event_type VARCHAR(120) NULL,order_id BIGINT NULL,vendeur_id BIGINT NULL,status VARCHAR(60) NULL,event_at VARCHAR(40) NULL,payload_json LONGTEXT NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,KEY idx_rel_automations_order(order_id),KEY idx_rel_automations_vendeur(vendeur_id),KEY idx_rel_automations_type(event_type)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await pool.execute(`CREATE TABLE IF NOT EXISTS \`${MYSQL_TABLE}\` (store_key VARCHAR(80) PRIMARY KEY,data_json LONGTEXT NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
}

async function mysqlIndexExists(pool,tableName,indexName){
  const [rows]=await pool.execute(
    'SELECT 1 AS ok FROM information_schema.statistics WHERE table_schema=? AND table_name=? AND index_name=? LIMIT 1',
    [MYSQL_DATABASE,tableName,indexName]
  );
  return Array.isArray(rows)&&rows.length>0;
}

async function mysqlForeignKeyExists(pool,tableName,constraintName){
  const [rows]=await pool.execute(
    'SELECT 1 AS ok FROM information_schema.referential_constraints WHERE constraint_schema=? AND table_name=? AND constraint_name=? LIMIT 1',
    [MYSQL_DATABASE,tableName,constraintName]
  );
  return Array.isArray(rows)&&rows.length>0;
}

async function ensureIndex(pool,tableName,indexName,columns,unique=false){
  if(await mysqlIndexExists(pool,tableName,indexName)) return;
  const uniq=unique?'UNIQUE ':'';
  await pool.execute(`CREATE ${uniq}INDEX \`${indexName}\` ON \`${tableName}\` (${columns})`);
}

async function ensureForeignKey(pool,tableName,constraintName,column,refTable,refColumn,onDelete='SET NULL',onUpdate='CASCADE'){
  if(await mysqlForeignKeyExists(pool,tableName,constraintName)) return;
  await pool.execute(
    `ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${constraintName}\` FOREIGN KEY (\`${column}\`) REFERENCES \`${refTable}\`(\`${refColumn}\`) ON DELETE ${onDelete} ON UPDATE ${onUpdate}`
  );
}

async function normalizeRelationalReferences(pool){
  await pool.execute(`UPDATE \`${REL_MAIN_TABLES.vendeurs}\` SET slug=NULL WHERE slug IS NOT NULL AND TRIM(slug)=''`);
  await pool.execute(`UPDATE \`${REL_MAIN_TABLES.vendeurs}\` SET email=NULL WHERE email IS NOT NULL AND TRIM(email)=''`);
  await pool.execute(`UPDATE \`${REL_MAIN_TABLES.vendeurs}\` SET tel=NULL WHERE tel IS NOT NULL AND TRIM(tel)=''`);
  await pool.execute(`UPDATE \`${REL_MAIN_TABLES.payments}\` SET reference=NULL WHERE reference IS NOT NULL AND TRIM(reference)=''`);
  await pool.execute(`UPDATE \`${REL_MAIN_TABLES.products}\` p LEFT JOIN \`${REL_MAIN_TABLES.vendeurs}\` v ON v.vendeur_id=p.vendeur_id SET p.vendeur_id=NULL WHERE p.vendeur_id IS NOT NULL AND v.vendeur_id IS NULL`);
  await pool.execute(`UPDATE \`${REL_MAIN_TABLES.orders}\` o LEFT JOIN \`${REL_MAIN_TABLES.vendeurs}\` v ON v.vendeur_id=o.vendeur_id SET o.vendeur_id=NULL WHERE o.vendeur_id IS NOT NULL AND v.vendeur_id IS NULL`);
  await pool.execute(`UPDATE \`${REL_MAIN_TABLES.payments}\` p LEFT JOIN \`${REL_MAIN_TABLES.orders}\` o ON o.order_id=p.order_id SET p.order_id=NULL WHERE p.order_id IS NOT NULL AND o.order_id IS NULL`);
  await pool.execute(`UPDATE \`${REL_MAIN_TABLES.payments}\` p LEFT JOIN \`${REL_MAIN_TABLES.vendeurs}\` v ON v.vendeur_id=p.vendeur_id SET p.vendeur_id=NULL WHERE p.vendeur_id IS NOT NULL AND v.vendeur_id IS NULL`);
  await pool.execute(`UPDATE \`${REL_MAIN_TABLES.reviews}\` r LEFT JOIN \`${REL_MAIN_TABLES.products}\` p ON p.product_id=r.product_id SET r.product_id=NULL WHERE r.product_id IS NOT NULL AND p.product_id IS NULL`);
  await pool.execute(`UPDATE \`${REL_MAIN_TABLES.reviews}\` r LEFT JOIN \`${REL_MAIN_TABLES.vendeurs}\` v ON v.vendeur_id=r.vendeur_id SET r.vendeur_id=NULL WHERE r.vendeur_id IS NOT NULL AND v.vendeur_id IS NULL`);
  await pool.execute(`UPDATE \`${REL_MAIN_TABLES.recovery}\` r LEFT JOIN \`${REL_MAIN_TABLES.vendeurs}\` v ON v.vendeur_id=r.vendeur_id SET r.vendeur_id=NULL WHERE r.vendeur_id IS NOT NULL AND v.vendeur_id IS NULL`);
  await pool.execute(`UPDATE \`${REL_MAIN_TABLES.analytics}\` a LEFT JOIN \`${REL_MAIN_TABLES.vendeurs}\` v ON v.vendeur_id=a.vendeur_id SET a.vendeur_id=NULL WHERE a.vendeur_id IS NOT NULL AND v.vendeur_id IS NULL`);
  await pool.execute(`UPDATE \`${REL_MAIN_TABLES.automations}\` a LEFT JOIN \`${REL_MAIN_TABLES.orders}\` o ON o.order_id=a.order_id SET a.order_id=NULL WHERE a.order_id IS NOT NULL AND o.order_id IS NULL`);
  await pool.execute(`UPDATE \`${REL_MAIN_TABLES.automations}\` a LEFT JOIN \`${REL_MAIN_TABLES.vendeurs}\` v ON v.vendeur_id=a.vendeur_id SET a.vendeur_id=NULL WHERE a.vendeur_id IS NOT NULL AND v.vendeur_id IS NULL`);
  await pool.execute(`UPDATE \`${REL_CHILD_TABLES.productImages}\` i LEFT JOIN \`${REL_MAIN_TABLES.products}\` p ON p.product_id=i.product_id SET i.product_id=NULL WHERE i.product_id IS NOT NULL AND p.product_id IS NULL`);
  await pool.execute(`UPDATE \`${REL_CHILD_TABLES.productVariants}\` v LEFT JOIN \`${REL_MAIN_TABLES.products}\` p ON p.product_id=v.product_id SET v.product_id=NULL WHERE v.product_id IS NOT NULL AND p.product_id IS NULL`);
  await pool.execute(`UPDATE \`${REL_CHILD_TABLES.orderItems}\` i LEFT JOIN \`${REL_MAIN_TABLES.orders}\` o ON o.order_id=i.order_id SET i.order_id=NULL WHERE i.order_id IS NOT NULL AND o.order_id IS NULL`);
  await pool.execute(`UPDATE \`${REL_CHILD_TABLES.orderItems}\` i LEFT JOIN \`${REL_MAIN_TABLES.products}\` p ON p.product_id=i.product_id SET i.product_id=NULL WHERE i.product_id IS NOT NULL AND p.product_id IS NULL`);
}

async function ensureRelationalConstraintsAndIndexes(pool){
  await normalizeRelationalReferences(pool);

  await ensureIndex(pool,REL_MAIN_TABLES.vendeurs,'uq_rel_vendeurs_vendeur_id','vendeur_id',true);
  await ensureIndex(pool,REL_MAIN_TABLES.vendeurs,'uq_rel_vendeurs_slug','slug',true);
  await ensureIndex(pool,REL_MAIN_TABLES.vendeurs,'uq_rel_vendeurs_tel','tel',true);
  await ensureIndex(pool,REL_MAIN_TABLES.vendeurs,'uq_rel_vendeurs_email','email',true);

  await ensureIndex(pool,REL_MAIN_TABLES.products,'uq_rel_products_product_id','product_id',true);
  await ensureIndex(pool,REL_MAIN_TABLES.orders,'uq_rel_orders_order_id','order_id',true);
  await ensureIndex(pool,REL_MAIN_TABLES.payments,'uq_rel_payments_reference','reference',true);
  await ensureIndex(pool,REL_MAIN_TABLES.payments,'uq_rel_payments_payment_id','payment_id',true);
  await ensureIndex(pool,REL_MAIN_TABLES.reviews,'uq_rel_reviews_review_id','review_id',true);
  await ensureIndex(pool,REL_MAIN_TABLES.analytics,'uq_rel_analytics_event_id','event_id',true);
  await ensureIndex(pool,REL_MAIN_TABLES.experiments,'uq_rel_experiments_event_id','event_id',true);
  await ensureIndex(pool,REL_MAIN_TABLES.audit,'uq_rel_audit_audit_id','audit_id',true);
  await ensureIndex(pool,REL_MAIN_TABLES.automations,'uq_rel_automations_automation_id','automation_id',true);

  await ensureIndex(pool,REL_CHILD_TABLES.productImages,'uq_rel_product_images_product_sort','product_id,sort_order',true);
  await ensureIndex(pool,REL_CHILD_TABLES.productVariants,'uq_rel_product_variants_product_variant','product_id,variant_id',true);
  await ensureIndex(pool,REL_CHILD_TABLES.orderItems,'uq_rel_order_items_order_sort','order_id,sort_order',true);

  await ensureIndex(pool,REL_MAIN_TABLES.vendeurs,'idx_rel_vendeurs_actif_plan','actif,plan');
  await ensureIndex(pool,REL_MAIN_TABLES.orders,'idx_rel_orders_vendeur_statut_date','vendeur_id,statut,date_commande');
  await ensureIndex(pool,REL_MAIN_TABLES.orders,'idx_rel_orders_vendeur_date','vendeur_id,date_commande');
  await ensureIndex(pool,REL_MAIN_TABLES.orders,'idx_rel_orders_payment_status','payment_status,payment_method');
  await ensureIndex(pool,REL_MAIN_TABLES.products,'idx_rel_products_vendeur_categorie_nom','vendeur_id,categorie,nom');
  await ensureIndex(pool,REL_MAIN_TABLES.payments,'idx_rel_payments_vendeur_status_method','vendeur_id,status,method');
  await ensureIndex(pool,REL_MAIN_TABLES.payments,'idx_rel_payments_order_status','order_id,status');
  await ensureIndex(pool,REL_MAIN_TABLES.reviews,'idx_rel_reviews_product_date','product_id,date_avis');
  await ensureIndex(pool,REL_MAIN_TABLES.recovery,'idx_rel_recovery_tel_expires','tel,expires_at');
  await ensureIndex(pool,REL_MAIN_TABLES.analytics,'idx_rel_analytics_vendeur_event_date','vendeur_id,event_name,event_at');
  await ensureIndex(pool,REL_MAIN_TABLES.experiments,'idx_rel_experiments_exp_variant_at','experiment_id,variant,event_at');
  await ensureIndex(pool,REL_MAIN_TABLES.audit,'idx_rel_audit_action_date','action,event_at');
  await ensureIndex(pool,REL_MAIN_TABLES.automations,'idx_rel_automations_vendeur_event_status','vendeur_id,event_type,status,event_at');

  await ensureForeignKey(pool,REL_MAIN_TABLES.products,'fk_rel_products_vendeur','vendeur_id',REL_MAIN_TABLES.vendeurs,'vendeur_id','SET NULL');
  await ensureForeignKey(pool,REL_MAIN_TABLES.orders,'fk_rel_orders_vendeur','vendeur_id',REL_MAIN_TABLES.vendeurs,'vendeur_id','SET NULL');
  await ensureForeignKey(pool,REL_MAIN_TABLES.payments,'fk_rel_payments_order','order_id',REL_MAIN_TABLES.orders,'order_id','SET NULL');
  await ensureForeignKey(pool,REL_MAIN_TABLES.payments,'fk_rel_payments_vendeur','vendeur_id',REL_MAIN_TABLES.vendeurs,'vendeur_id','SET NULL');
  await ensureForeignKey(pool,REL_MAIN_TABLES.reviews,'fk_rel_reviews_product','product_id',REL_MAIN_TABLES.products,'product_id','SET NULL');
  await ensureForeignKey(pool,REL_MAIN_TABLES.reviews,'fk_rel_reviews_vendeur','vendeur_id',REL_MAIN_TABLES.vendeurs,'vendeur_id','SET NULL');
  await ensureForeignKey(pool,REL_MAIN_TABLES.recovery,'fk_rel_recovery_vendeur','vendeur_id',REL_MAIN_TABLES.vendeurs,'vendeur_id','SET NULL');
  await ensureForeignKey(pool,REL_MAIN_TABLES.analytics,'fk_rel_analytics_vendeur','vendeur_id',REL_MAIN_TABLES.vendeurs,'vendeur_id','SET NULL');
  await ensureForeignKey(pool,REL_MAIN_TABLES.automations,'fk_rel_automations_order','order_id',REL_MAIN_TABLES.orders,'order_id','SET NULL');
  await ensureForeignKey(pool,REL_MAIN_TABLES.automations,'fk_rel_automations_vendeur','vendeur_id',REL_MAIN_TABLES.vendeurs,'vendeur_id','SET NULL');
  await ensureForeignKey(pool,REL_CHILD_TABLES.productImages,'fk_rel_product_images_product','product_id',REL_MAIN_TABLES.products,'product_id','CASCADE');
  await ensureForeignKey(pool,REL_CHILD_TABLES.productVariants,'fk_rel_product_variants_product','product_id',REL_MAIN_TABLES.products,'product_id','CASCADE');
  await ensureForeignKey(pool,REL_CHILD_TABLES.orderItems,'fk_rel_order_items_order','order_id',REL_MAIN_TABLES.orders,'order_id','CASCADE');
  await ensureForeignKey(pool,REL_CHILD_TABLES.orderItems,'fk_rel_order_items_product','product_id',REL_MAIN_TABLES.products,'product_id','SET NULL');
}

async function persistStore(conn,storeKey,data,allData){
  const rows=normalizeStoreRows(storeKey,data);
  const mainTable=REL_MAIN_TABLES[storeKey];
  if(!mainTable) return;
  const refs=buildReferenceSets(allData);

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
      await conn.execute(`INSERT INTO \`${mainTable}\` (row_id,vendeur_id,role,nom,email,tel,boutique,slug,plan,actif,date_inscription,payload_json,created_at_txt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [row.rowId,toFiniteNumber(p.id,null),String(p.role||'vendeur'),String(p.nom||''),(vendeurEmail||null),(vendeurTel||null),String(p.boutique||''),(vendeurSlug||null),String(p.plan||''),p.actif?1:0,String(p.dateInscription||''),payloadJson,createdAt]);
      continue;
    }
    if(storeKey==='products'){
      await conn.execute(`INSERT INTO \`${mainTable}\` (row_id,product_id,vendeur_id,nom,categorie,prix,stock,payload_json,created_at_txt) VALUES (?,?,?,?,?,?,?,?,?)`,
        [row.rowId,toFiniteNumber(p.id,null),fkNumberOrNull(p.vendeurId,refs.vendeurs),String(p.nom||''),String(p.categorie||''),toFiniteNumber(p.prix,0),toIntValue(p.stock,0),payloadJson,createdAt]);
      const productId=toFiniteNumber(p.id,null);
      if(productId!==null){
        const images=Array.isArray(p.images)?p.images.filter(Boolean):(p.image?[p.image]:[]);
        for(let ix=0;ix<images.length;ix++){
          await conn.execute(`INSERT INTO \`${REL_CHILD_TABLES.productImages}\` (product_id,image_url,sort_order) VALUES (?,?,?)`,[productId,String(images[ix]||''),ix]);
        }
        const variants=Array.isArray(p.variants)?p.variants:[];
        for(let vx=0;vx<variants.length;vx++){
          const v=variants[vx]||{};
          await conn.execute(`INSERT INTO \`${REL_CHILD_TABLES.productVariants}\` (product_id,variant_id,name,stock,sort_order) VALUES (?,?,?,?,?)`,
            [productId,String(v.id||`v-${vx+1}`),String(v.name||v.nom||''),toIntValue(v.stock,0),vx]);
        }
      }
      continue;
    }
    if(storeKey==='orders'){
      const payment=p.payment&&typeof p.payment==='object'?p.payment:{};
      await conn.execute(`INSERT INTO \`${mainTable}\` (row_id,order_id,vendeur_id,statut,total,date_commande,payment_status,payment_method,payload_json,created_at_txt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [row.rowId,toFiniteNumber(p.id,null),fkNumberOrNull(p.vendeurId,refs.vendeurs),String(p.statut||''),toFiniteNumber(p.total,0),String(p.dateCommande||''),String(payment.status||''),String(payment.method||''),payloadJson,createdAt]);
      const orderId=toFiniteNumber(p.id,null);
      if(orderId!==null){
        const items=Array.isArray(p.items)?p.items:[];
        for(let ox=0;ox<items.length;ox++){
          const it=items[ox]||{};
          await conn.execute(`INSERT INTO \`${REL_CHILD_TABLES.orderItems}\` (order_id,product_id,nom,prix,quantity,variant_id,sort_order,payload_json) VALUES (?,?,?,?,?,?,?,?)`,
            [orderId,fkNumberOrNull(it.id,refs.products),String(it.nom||''),toFiniteNumber(it.prix,0),Math.max(1,toIntValue(it.quantity,1)),String(it.variantId||''),ox,JSON.stringify(it)]);
        }
      }
      continue;
    }
    if(storeKey==='payments'){
      await conn.execute(`INSERT INTO \`${mainTable}\` (row_id,payment_id,order_id,vendeur_id,reference,status,method,provider,amount,payload_json,created_at_txt) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [row.rowId,toFiniteNumber(p.id,null),fkNumberOrNull(p.orderId,refs.orders),fkNumberOrNull(p.vendeurId,refs.vendeurs),(p.reference?String(p.reference):null),String(p.status||''),String(p.method||''),String(p.provider||''),toFiniteNumber(p.amount,0),payloadJson,createdAt]);
      continue;
    }
    if(storeKey==='reviews'){
      await conn.execute(`INSERT INTO \`${mainTable}\` (row_id,review_id,product_id,vendeur_id,rating,date_avis,payload_json,created_at_txt) VALUES (?,?,?,?,?,?,?,?)`,
        [row.rowId,toFiniteNumber(p.id,null),fkNumberOrNull(p.productId,refs.products),fkNumberOrNull(p.vendeurId,refs.vendeurs),toIntValue(p.rating,0),String(p.dateAvis||''),payloadJson,createdAt]);
      continue;
    }
    if(storeKey==='recovery'){
      await conn.execute(`INSERT INTO \`${mainTable}\` (row_id,vendeur_id,tel,code,expires_at,payload_json,created_at_txt) VALUES (?,?,?,?,?,?,?)`,
        [row.rowId,fkNumberOrNull(p.vendeurId,refs.vendeurs),String(p.tel||''),String(p.code||''),String(p.expiresAt||''),payloadJson,createdAt]);
      continue;
    }
    if(storeKey==='analytics'){
      await conn.execute(`INSERT INTO \`${mainTable}\` (row_id,event_id,event_name,vendeur_id,slug,session_id,event_at,payload_json) VALUES (?,?,?,?,?,?,?,?)`,
        [row.rowId,String(p.id||row.rowId),String(p.eventName||''),fkNumberOrNull(p.vendeurId,refs.vendeurs),String(p.slug||''),String(p.sessionId||''),String(p.at||createdAt||''),payloadJson]);
      continue;
    }
    if(storeKey==='experiments'){
      await conn.execute(`INSERT INTO \`${mainTable}\` (row_id,event_id,experiment_id,variant,event_name,event_at,payload_json) VALUES (?,?,?,?,?,?,?)`,
        [row.rowId,String(p.id||row.rowId),String(p.experimentId||''),String(p.variant||''),String(p.eventName||''),String(p.at||createdAt||''),payloadJson]);
      continue;
    }
    if(storeKey==='audit'){
      const actor=p.actor&&typeof p.actor==='object'?p.actor:{};
      await conn.execute(`INSERT INTO \`${mainTable}\` (row_id,audit_id,action,actor_role,actor_id,event_at,payload_json) VALUES (?,?,?,?,?,?,?)`,
        [row.rowId,String(p.id||row.rowId),String(p.action||''),String(actor.role||''),String(actor.id||''),String(p.at||createdAt||''),payloadJson]);
      continue;
    }
    if(storeKey==='automations'){
      await conn.execute(`INSERT INTO \`${mainTable}\` (row_id,automation_id,event_type,order_id,vendeur_id,status,event_at,payload_json) VALUES (?,?,?,?,?,?,?,?)`,
        [row.rowId,String(p.id||row.rowId),String(p.eventType||''),fkNumberOrNull(p.orderId,refs.orders),fkNumberOrNull(p.vendeurId,refs.vendeurs),String(p.status||''),String(p.at||createdAt||''),payloadJson]);
    }
  }
}

async function main(){
  let pool=null;
  if(MYSQL_URL){
    pool=createMysqlPool(mysql,MYSQL_URL,MYSQL_DATABASE);
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
    pool=createMysqlPool(mysql,{
      host:MYSQL_HOST,
      port:MYSQL_PORT,
      user:MYSQL_USER,
      password:MYSQL_PASSWORD,
      database:MYSQL_DATABASE,
      connectionLimit:5
    });
  }

  try{
    await ensureSchema(pool);
    const allData=Object.fromEntries(
      Object.entries(FILE).map(([storeKey,file])=>[storeKey,readArray(file)])
    );

    for(const [storeKey,data] of Object.entries(allData)){
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        await persistStore(conn,storeKey,data,allData);
        await conn.execute(
          `INSERT INTO \`${MYSQL_TABLE}\` (store_key,data_json) VALUES (?,?)
           ON DUPLICATE KEY UPDATE data_json=VALUES(data_json),updated_at=CURRENT_TIMESTAMP`,
          [storeKey,JSON.stringify(data)]
        );
        await conn.commit();
      }catch(err){
        try{await conn.rollback();}catch{}
        throw err;
      }finally{
        conn.release();
      }
      console.log(`[OK] ${storeKey}: ${data.length} element(s) -> ${REL_MAIN_TABLES[storeKey]}`);
    }

    await ensureRelationalConstraintsAndIndexes(pool);

    const tables=[...Object.values(REL_MAIN_TABLES),...Object.values(REL_CHILD_TABLES)];
    console.log(`Migration terminee vers ${MYSQL_DATABASE} (tables: ${tables.join(', ')})`);
  } finally {
    await pool.end();
  }
}

main().catch((err)=>{
  console.error('Migration MySQL echouee:',err.message);
  process.exit(1);
});
