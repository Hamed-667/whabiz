const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const mysql=require('mysql2/promise');
const dotenv=require('dotenv');
const {createMysqlPool}=require('../mysql-ssl');

const ROOT=path.join(__dirname,'..');
dotenv.config({path:path.join(ROOT,'.env')});

const MYSQL_URL=String(process.env.MYSQL_URL||'').trim();
const MYSQL_HOST=String(process.env.MYSQL_HOST||'127.0.0.1').trim();
const MYSQL_PORT=Number(process.env.MYSQL_PORT)||3306;
const MYSQL_USER=String(process.env.MYSQL_USER||'root').trim();
const MYSQL_PASSWORD=String(process.env.MYSQL_PASSWORD||'').trim();
const MYSQL_DATABASE=String(process.env.MYSQL_DATABASE||'whabiz').trim();
const MIGRATIONS_DIR=path.join(ROOT,'db','migrations');

function listSqlMigrationFiles(){
  if(!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
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

async function ensureMigrationTable(pool){
  await pool.execute(
    'CREATE TABLE IF NOT EXISTS `schema_migrations` (migration_name VARCHAR(191) PRIMARY KEY,checksum CHAR(64) NOT NULL,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  );
}

async function run(){
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
    await ensureMigrationTable(pool);
    const files=listSqlMigrationFiles();
    if(!files.length){
      console.log(`[MIGRATIONS] Aucun fichier SQL trouve dans ${MIGRATIONS_DIR}`);
      return;
    }
    for(const fileName of files){
      const fullPath=path.join(MIGRATIONS_DIR,fileName);
      const sql=fs.readFileSync(fullPath,'utf8');
      const checksum=crypto.createHash('sha256').update(sql).digest('hex');
      const [existing]=await pool.execute(
        'SELECT checksum FROM `schema_migrations` WHERE migration_name=? LIMIT 1',
        [fileName]
      );
      if(Array.isArray(existing)&&existing.length){
        if(existing[0].checksum!==checksum){
          throw new Error(`Checksum mismatch pour la migration ${fileName}`);
        }
        console.log(`[SKIP] ${fileName}`);
        continue;
      }

      const statements=splitSqlStatements(sql);
      const conn=await pool.getConnection();
      try{
        await conn.beginTransaction();
        for(const statement of statements){
          await conn.query(statement);
        }
        await conn.execute(
          'INSERT INTO `schema_migrations` (migration_name,checksum) VALUES (?,?)',
          [fileName,checksum]
        );
        await conn.commit();
        console.log(`[OK] ${fileName}`);
      }catch(err){
        try{await conn.rollback();}catch{}
        throw err;
      }finally{
        conn.release();
      }
    }
  }finally{
    await pool.end();
  }
}

run().catch((err)=>{
  console.error('Migration SQL echouee:',err.message);
  process.exit(1);
});
