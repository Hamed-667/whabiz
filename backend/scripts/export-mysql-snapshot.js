const fs=require('fs');
const path=require('path');
const mysql=require('mysql2/promise');
const dotenv=require('dotenv');
const {createMysqlPool}=require('../mysql-ssl');

const ROOT=path.join(__dirname,'..');
dotenv.config({path:path.join(ROOT,'.env')});

const BACKUPS=path.join(ROOT,'backups');
const MYSQL_URL=String(process.env.MYSQL_URL||'').trim();
const MYSQL_HOST=String(process.env.MYSQL_HOST||'127.0.0.1').trim();
const MYSQL_PORT=Number(process.env.MYSQL_PORT)||3306;
const MYSQL_USER=String(process.env.MYSQL_USER||'root').trim();
const MYSQL_PASSWORD=String(process.env.MYSQL_PASSWORD||'').trim();
const MYSQL_DATABASE=String(process.env.MYSQL_DATABASE||'whabiz').trim();

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

function parseJson(value){
  try{
    const parsed=JSON.parse(String(value||''));
    return parsed&&typeof parsed==='object'?parsed:null;
  }catch{
    return null;
  }
}

async function run(){
  fs.mkdirSync(BACKUPS,{recursive:true});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  let pool=null;
  if(MYSQL_URL){
    pool=createMysqlPool(mysql,MYSQL_URL,MYSQL_DATABASE);
  }else{
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
    for(const [storeKey,tableName] of Object.entries(REL_MAIN_TABLES)){
      const [rows]=await pool.query(`SELECT payload_json FROM \`${tableName}\` ORDER BY updated_at ASC,row_id ASC`);
      const data=[];
      (Array.isArray(rows)?rows:[]).forEach((row)=>{
        const payload=parseJson(row.payload_json);
        if(payload) data.push(payload);
      });
      const filePath=path.join(BACKUPS,`${stamp}-mysql-snapshot-${storeKey}.json`);
      fs.writeFileSync(filePath,JSON.stringify(data,null,2));
      console.log(`[OK] ${storeKey}: ${data.length} element(s) -> ${path.basename(filePath)}`);
    }
  }finally{
    await pool.end();
  }
}

run().catch((err)=>{
  console.error('Export snapshot MySQL echoue:',err.message);
  process.exit(1);
});
