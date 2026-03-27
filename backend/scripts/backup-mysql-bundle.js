const fs=require('fs');
const path=require('path');
const zlib=require('zlib');
const crypto=require('crypto');
const mysql=require('mysql2/promise');
const dotenv=require('dotenv');
const {createMysqlPool}=require('../mysql-ssl');

const ROOT=path.join(__dirname,'..');
dotenv.config({path:path.join(ROOT,'.env')});

const BACKUPS_DIR=path.join(ROOT,'backups','mysql');
const MYSQL_URL=String(process.env.MYSQL_URL||'').trim();
const MYSQL_HOST=String(process.env.MYSQL_HOST||'127.0.0.1').trim();
const MYSQL_PORT=Number(process.env.MYSQL_PORT)||3306;
const MYSQL_USER=String(process.env.MYSQL_USER||'root').trim();
const MYSQL_PASSWORD=String(process.env.MYSQL_PASSWORD||'').trim();
let MYSQL_DATABASE=String(process.env.MYSQL_DATABASE||'whabiz').trim();
const LEGACY_SINGLE_TABLE=String(process.env.MYSQL_TABLE||'whabiz_store').trim()||'whabiz_store';
const RETENTION_DAYS=Math.max(1,Number(process.env.MYSQL_BACKUP_RETENTION_DAYS)||14);

const TABLE_CANDIDATES=[
  LEGACY_SINGLE_TABLE,
  'whabiz_store',
  'wb_products',
  'wb_vendeurs',
  'wb_recovery',
  'wb_orders',
  'wb_reviews',
  'wb_payments',
  'wb_analytics_events',
  'wb_experiment_events',
  'wb_audit_logs',
  'wb_automations',
  'rel_vendeurs',
  'rel_products',
  'rel_product_images',
  'rel_product_variants',
  'rel_orders',
  'rel_order_items',
  'rel_payments',
  'rel_reviews',
  'rel_recovery',
  'rel_analytics_events',
  'rel_experiment_events',
  'rel_audit_logs',
  'rel_automations',
  'schema_migrations',
  'app_runtime_settings'
];

function parseArgs(argv){
  const out={reason:'manual'};
  for(let i=0;i<argv.length;i++){
    const arg=String(argv[i]||'');
    if(arg==='--reason'){
      out.reason=String(argv[i+1]||'manual').trim()||'manual';
      i++;
    }
    if(arg.startsWith('--reason=')){
      out.reason=arg.slice('--reason='.length).trim()||'manual';
    }
  }
  return out;
}

function createLogger(quiet){
  return quiet?()=>{}:console.log;
}

function createWarn(quiet){
  return quiet?()=>{}:console.warn;
}

async function createPool(){
  if(MYSQL_URL){
    try{
      const url=new URL(MYSQL_URL);
      const hasDb=Boolean(url.pathname&&url.pathname!=='/');
      if(hasDb){
        MYSQL_DATABASE=decodeURIComponent(url.pathname.replace(/^\//,''))||MYSQL_DATABASE;
        return createMysqlPool(mysql,url.toString(),MYSQL_DATABASE);
      }
      url.pathname=`/${encodeURIComponent(MYSQL_DATABASE)}`;
      return createMysqlPool(mysql,url.toString(),MYSQL_DATABASE);
    }catch{
      return createMysqlPool(mysql,MYSQL_URL,MYSQL_DATABASE);
    }
  }
  return createMysqlPool(mysql,{
    host:MYSQL_HOST,
    port:MYSQL_PORT,
    user:MYSQL_USER,
    password:MYSQL_PASSWORD,
    database:MYSQL_DATABASE,
    connectionLimit:4
  });
}

function normalizeRow(row){
  const out={};
  Object.keys(row||{}).forEach((key)=>{
    const value=row[key];
    if(value instanceof Date){
      out[key]=value.toISOString();
    }else{
      out[key]=value;
    }
  });
  return out;
}

async function listExistingTables(pool){
  const placeholders=TABLE_CANDIDATES.map(()=>'?').join(',');
  const [rows]=await pool.query(
    `SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema=? AND table_name IN (${placeholders})`,
    [MYSQL_DATABASE,...TABLE_CANDIDATES]
  );
  return (Array.isArray(rows)?rows:[])
    .map((row)=>String(row.tableName||row.TABLE_NAME||'').trim())
    .filter(Boolean)
    .sort((a,b)=>TABLE_CANDIDATES.indexOf(a)-TABLE_CANDIDATES.indexOf(b));
}

async function listAllTables(pool){
  const [rows]=await pool.query(
    'SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema=? AND table_type=\"BASE TABLE\"',
    [MYSQL_DATABASE]
  );
  return (Array.isArray(rows)?rows:[])
    .map((row)=>String(row.tableName||row.TABLE_NAME||'').trim())
    .filter(Boolean)
    .sort();
}

async function loadTableSnapshot(pool,tableName){
  const [createRows]=await pool.query(`SHOW CREATE TABLE \`${tableName}\``);
  const createRow=Array.isArray(createRows)&&createRows.length?createRows[0]:null;
  const createSql=createRow?String(createRow['Create Table']||'').trim():'';
  if(!createSql){
    throw new Error(`CREATE TABLE manquant pour ${tableName}`);
  }
  const [rows]=await pool.query(`SELECT * FROM \`${tableName}\``);
  return {
    createSql,
    rows:(Array.isArray(rows)?rows:[]).map(normalizeRow)
  };
}

function pruneOldBackups(){
  if(!fs.existsSync(BACKUPS_DIR)) return;
  const now=Date.now();
  const keepMs=RETENTION_DAYS*24*60*60*1000;
  const files=fs.readdirSync(BACKUPS_DIR)
    .filter((name)=>name.endsWith('.json.gz'))
    .map((name)=>path.join(BACKUPS_DIR,name));
  files.forEach((filePath)=>{
    try{
      const stats=fs.statSync(filePath);
      if(now-stats.mtimeMs>keepMs){
        fs.unlinkSync(filePath);
      }
    }catch{}
  });
}

async function runBackup(options={}){
  const reason=String(options.reason||'manual').trim()||'manual';
  const quiet=options.quiet===true;
  const log=createLogger(quiet);
  const warn=createWarn(quiet);
  fs.mkdirSync(BACKUPS_DIR,{recursive:true});

  const pool=await createPool();
  try{
    const tables=await listExistingTables(pool);
    if(!tables.length){
      const allTables=await listAllTables(pool);
      if(!allTables.length){
        throw new Error(`Aucune table trouvee dans ${MYSQL_DATABASE}`);
      }
      warn(`[db:backup] Aucune table cible trouvee; fallback: backup de toutes les tables (${allTables.length})`);
      tables.push(...allTables);
    }

    const schema={};
    const data={};
    const rowCounts={};

    for(const tableName of tables){
      const snapshot=await loadTableSnapshot(pool,tableName);
      schema[tableName]=snapshot.createSql;
      data[tableName]=snapshot.rows;
      rowCounts[tableName]=snapshot.rows.length;
      log(`[db:backup] ${tableName}: ${snapshot.rows.length} ligne(s)`);
    }

    const bundle={
      meta:{
        format:'whabiz-mysql-backup-v1',
        createdAt:new Date().toISOString(),
        reason,
        sourceDatabase:MYSQL_DATABASE,
        tables,
        rowCounts
      },
      schema,
      data
    };

    const raw=Buffer.from(JSON.stringify(bundle));
    const compressed=zlib.gzipSync(raw,{level:9});
    const digest=crypto.createHash('sha256').update(compressed).digest('hex');
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const fileName=`${stamp}-${reason}-mysql-backup.json.gz`;
    const filePath=path.join(BACKUPS_DIR,fileName);
    fs.writeFileSync(filePath,compressed);

    pruneOldBackups();

    const summary={
      ok:true,
      file:filePath,
      sha256:digest,
      sizeBytes:compressed.length,
      tables:tables.length
    };
    log(JSON.stringify(summary));
    return summary;
  }finally{
    await pool.end();
  }
}

if(require.main===module){
  const args=parseArgs(process.argv.slice(2));
  runBackup({reason:args.reason,quiet:false}).catch((err)=>{
    console.error('[db:backup] Echec:',err.message);
    process.exit(1);
  });
}

module.exports={runBackup};
