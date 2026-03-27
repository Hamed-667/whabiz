const fs=require('fs');
const path=require('path');
const zlib=require('zlib');
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
const MYSQL_DATABASE=String(process.env.MYSQL_DATABASE||'whabiz').trim();

function parseArgs(argv){
  const out={
    file:'',
    latest:false,
    targetDb:MYSQL_DATABASE,
    dryRun:false,
    verify:false,
    dropTarget:false,
    dropAfterVerify:false
  };
  for(let i=0;i<argv.length;i++){
    const arg=String(argv[i]||'');
    if(arg==='--file'){
      out.file=String(argv[i+1]||'').trim();
      i++;
      continue;
    }
    if(arg==='--latest'){
      out.latest=true;
      continue;
    }
    if(arg==='--target-db'){
      out.targetDb=String(argv[i+1]||'').trim()||MYSQL_DATABASE;
      i++;
      continue;
    }
    if(arg==='--dry-run'){
      out.dryRun=true;
      continue;
    }
    if(arg==='--verify'){
      out.verify=true;
      continue;
    }
    if(arg==='--drop-target'){
      out.dropTarget=true;
      continue;
    }
    if(arg==='--drop-after-verify'){
      out.dropAfterVerify=true;
      continue;
    }
    if(arg.startsWith('--file=')){
      out.file=arg.slice('--file='.length).trim();
      continue;
    }
    if(arg.startsWith('--target-db=')){
      out.targetDb=arg.slice('--target-db='.length).trim()||MYSQL_DATABASE;
    }
  }
  return out;
}

function createLogger(quiet){
  return quiet?()=>{}:console.log;
}

function resolveBackupFile(args){
  if(args.file){
    const direct=path.isAbsolute(args.file)?args.file:path.join(process.cwd(),args.file);
    if(!fs.existsSync(direct)){
      throw new Error(`Fichier backup introuvable: ${direct}`);
    }
    return direct;
  }
  const files=fs.existsSync(BACKUPS_DIR)
    ? fs.readdirSync(BACKUPS_DIR)
      .filter((name)=>name.endsWith('.json.gz')||name.endsWith('.json'))
      .map((name)=>path.join(BACKUPS_DIR,name))
    : [];
  if(!files.length){
    throw new Error(`Aucun backup trouve dans ${BACKUPS_DIR}`);
  }
  files.sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
  return files[0];
}

function readBundle(filePath){
  const raw=fs.readFileSync(filePath);
  const payload=filePath.endsWith('.gz')?zlib.gunzipSync(raw):raw;
  const parsed=JSON.parse(String(payload||'{}'));
  if(!parsed||!parsed.meta||!parsed.schema||!parsed.data){
    throw new Error('Format backup invalide');
  }
  if(parsed.meta.format!=='whabiz-mysql-backup-v1'){
    throw new Error(`Format backup non supporte: ${parsed.meta.format||'inconnu'}`);
  }
  return parsed;
}

async function createBootstrapPool(){
  if(MYSQL_URL){
    const url=new URL(MYSQL_URL);
    if(url.pathname&&url.pathname!=='/'){
      url.pathname='/';
    }
    return createMysqlPool(mysql,url.toString());
  }
  return createMysqlPool(mysql,{
    host:MYSQL_HOST,
    port:MYSQL_PORT,
    user:MYSQL_USER,
    password:MYSQL_PASSWORD,
    connectionLimit:2
  });
}

async function createTargetPool(targetDb){
  if(MYSQL_URL){
    const url=new URL(MYSQL_URL);
    url.pathname=`/${targetDb}`;
    return createMysqlPool(mysql,url.toString(),targetDb);
  }
  return createMysqlPool(mysql,{
    host:MYSQL_HOST,
    port:MYSQL_PORT,
    user:MYSQL_USER,
    password:MYSQL_PASSWORD,
    database:targetDb,
    connectionLimit:4
  });
}

async function ensureTargetDatabase(args){
  const bootstrap=await createBootstrapPool();
  try{
    if(args.dropTarget){
      await bootstrap.query(`DROP DATABASE IF EXISTS \`${args.targetDb}\``);
    }
    await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${args.targetDb}\``);
  }finally{
    await bootstrap.end();
  }
}

async function insertRows(conn,tableName,rows){
  if(!rows.length) return;
  const columns=Object.keys(rows[0]||{});
  if(!columns.length) return;
  const colSql=columns.map((col)=>`\`${col}\``).join(',');
  const batchSize=200;
  const normalizeValue=(value)=>{
    if(typeof value==='string'){
      const isoMatch=value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
      if(isoMatch){
        return `${isoMatch[1]} ${isoMatch[2]}`;
      }
    }
    return value;
  };
  for(let i=0;i<rows.length;i+=batchSize){
    const chunk=rows.slice(i,i+batchSize);
    const values=[];
    const placeholders=chunk.map((row)=>{
      columns.forEach((col)=>{
        values.push(normalizeValue(row[col]));
      });
      return `(${columns.map(()=>'?').join(',')})`;
    }).join(',');
    const sql=`INSERT INTO \`${tableName}\` (${colSql}) VALUES ${placeholders}`;
    await conn.query(sql,values);
  }
}

async function restoreBundle(args,bundle,log){
  if(args.dryRun){
    log('[db:restore] Dry-run: aucune ecriture effectuee');
    return {verified:false,rowCounts:{}};
  }
  await ensureTargetDatabase(args);
  const pool=await createTargetPool(args.targetDb);
  try{
    const conn=await pool.getConnection();
    try{
      await conn.query('SET FOREIGN_KEY_CHECKS=0');
      const tables=Array.isArray(bundle.meta.tables)?bundle.meta.tables:[];
      for(let i=tables.length-1;i>=0;i--){
        const tableName=tables[i];
        await conn.query(`DROP TABLE IF EXISTS \`${tableName}\``);
      }
      for(const tableName of tables){
        const createSql=String(bundle.schema[tableName]||'').trim();
        if(!createSql){
          throw new Error(`Schema absent pour ${tableName}`);
        }
        await conn.query(createSql);
        const rows=Array.isArray(bundle.data[tableName])?bundle.data[tableName]:[];
        await insertRows(conn,tableName,rows);
        log(`[db:restore] ${tableName}: ${rows.length} ligne(s)`);
      }
      await conn.query('SET FOREIGN_KEY_CHECKS=1');
    }finally{
      conn.release();
    }
  }finally{
    await pool.end();
  }

  const verify=await verifyCounts(args,bundle,log);
  if(args.verify&&args.dropAfterVerify){
    const bootstrap=await createBootstrapPool();
    try{
      await bootstrap.query(`DROP DATABASE IF EXISTS \`${args.targetDb}\``);
    }finally{
      await bootstrap.end();
    }
  }
  return verify;
}

async function verifyCounts(args,bundle,log){
  const expected=bundle.meta&&bundle.meta.rowCounts?bundle.meta.rowCounts:{};
  const actual={};
  if(!args.verify) return {verified:false,rowCounts:actual};

  const pool=await createTargetPool(args.targetDb);
  try{
    for(const tableName of Object.keys(expected)){
      const [rows]=await pool.query(`SELECT COUNT(*) AS c FROM \`${tableName}\``);
      actual[tableName]=Number(rows&&rows[0]&&rows[0].c||0);
    }
  }finally{
    await pool.end();
  }
  const mismatches=Object.keys(expected).filter((tableName)=>Number(expected[tableName]||0)!==Number(actual[tableName]||0));
  if(mismatches.length){
    throw new Error(`Verification KO: ${mismatches.join(', ')}`);
  }
  log('[db:restore] Verification OK');
  return {verified:true,rowCounts:actual};
}

async function runRestore(options={}){
  const args={
    ...parseArgs([]),
    ...options
  };
  const quiet=options.quiet===true;
  const log=createLogger(quiet);
  const backupFile=resolveBackupFile(args);
  const bundle=readBundle(backupFile);
  const target=args.targetDb||MYSQL_DATABASE;
  args.targetDb=target;

  log(JSON.stringify({
    backupFile,
    targetDb:args.targetDb,
    dryRun:args.dryRun,
    verify:args.verify,
    dropTarget:args.dropTarget,
    dropAfterVerify:args.dropAfterVerify
  }));

  const result=await restoreBundle(args,bundle,log);
  const summary={
    ok:true,
    backupFile,
    targetDb:args.targetDb,
    verified:result.verified
  };
  log(JSON.stringify(summary));
  return summary;
}

if(require.main===module){
  const args=parseArgs(process.argv.slice(2));
  runRestore(args).catch((err)=>{
    console.error('[db:restore] Echec:',err.message);
    process.exit(1);
  });
}

module.exports={runRestore};
