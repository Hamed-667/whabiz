const fs=require('fs');
const path=require('path');

const ROOT=path.join(__dirname,'..');
const DATA_DIR=path.join(ROOT,'data');
const OPS_ALERTS=path.join(DATA_DIR,'ops-alerts.json');
const OPS_ERRORS=path.join(DATA_DIR,'ops-errors.json');

function parseArgs(argv){
  const out={dryRun:false};
  argv.forEach((arg)=>{
    const a=String(arg||'').trim().toLowerCase();
    if(a==='--dry-run') out.dryRun=true;
  });
  return out;
}

function readArray(filePath){
  try{
    const raw=fs.readFileSync(filePath,'utf8');
    const parsed=JSON.parse(String(raw||'[]'));
    return Array.isArray(parsed)?parsed:[];
  }catch{
    return [];
  }
}

function writeEmptyArray(filePath){
  fs.writeFileSync(filePath,'[]\n');
}

async function run(){
  const args=parseArgs(process.argv.slice(2));
  fs.mkdirSync(DATA_DIR,{recursive:true});

  const alerts=readArray(OPS_ALERTS);
  const errors=readArray(OPS_ERRORS);

  if(args.dryRun){
    console.log(JSON.stringify({
      ok:true,
      dryRun:true,
      files:{
        alerts:{path:OPS_ALERTS,count:alerts.length},
        errors:{path:OPS_ERRORS,count:errors.length}
      }
    }));
    return;
  }

  writeEmptyArray(OPS_ALERTS);
  writeEmptyArray(OPS_ERRORS);
  console.log(JSON.stringify({
    ok:true,
    cleared:{
      alerts:alerts.length,
      errors:errors.length
    }
  }));
}

run().catch((err)=>{
  console.error('[ops:clear] Echec:',err.message);
  process.exit(1);
});

