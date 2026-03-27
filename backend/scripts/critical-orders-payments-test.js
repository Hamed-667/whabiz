const {spawn}=require('child_process');
const path=require('path');
const dotenv=require('dotenv');

const ROOT=path.join(__dirname,'..');
dotenv.config({path:path.join(ROOT,'.env')});

function sleep(ms){
  return new Promise((resolve)=>setTimeout(resolve,ms));
}

function getFetchTimeoutMs(){
  return Number(process.env.CRITICAL_FETCH_TIMEOUT_MS)||20000;
}

async function fetchWithTimeout(url,options={}){
  const controller=new AbortController();
  const timeoutMs=getFetchTimeoutMs();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetch(url,{...options,signal:controller.signal});
  }finally{
    clearTimeout(timer);
  }
}

async function requestJson(url,options={}){
  let res;
  try{
    res=await fetchWithTimeout(url,options);
  }catch(err){
    throw new Error(`Fetch failed ${url}: ${err.message||err}`);
  }
  const text=await res.text();
  let data={};
  try{
    data=text?JSON.parse(text):{};
  }catch{
    data={raw:text};
  }
  return {ok:res.ok,status:res.status,data};
}

function withAuth(token,headers={}){
  return {
    ...headers,
    Authorization:`Bearer ${token}`
  };
}

async function waitForReady(baseUrl){
  const attempts=Number(process.env.CRITICAL_WAIT_ATTEMPTS)||120;
  const intervalMs=Number(process.env.CRITICAL_WAIT_INTERVAL_MS)||500;
  for(let i=0;i<attempts;i++){
    try{
      const res=await requestJson(`${baseUrl}/api/health/ready`);
      if(res.ok&&res.data&&res.data.ready) return true;
    }catch{}
    await sleep(intervalMs);
  }
  return false;
}

async function main(){
  const port=Number(process.env.CRITICAL_TEST_PORT)||3201;
  const uid=Date.now();
  const phone=`+2267${String(uid).slice(-7)}`;
  const email=`critical+${uid}@example.com`;
  const password='Test12345';
  const adminEmail=process.env.ADMIN_EMAIL||'admin@whabiz.local';
  const adminPassword=process.env.ADMIN_PASSWORD||'Admin123!';
  const debug=String(process.env.CRITICAL_DEBUG||'').toLowerCase()==='1';
  let childExited=null;

  const server=spawn(process.execPath,['server.js'],{
    cwd:__dirname+'/..',
    env:{...process.env,PORT:String(port)},
    stdio:debug?'inherit':['ignore','pipe','pipe']
  });
  if(!debug){
    server.stdout.on('data',(chunk)=>process.stdout.write(String(chunk||'')));
    server.stderr.on('data',(chunk)=>process.stderr.write(String(chunk||'')));
  }
  server.on('exit',(code,signal)=>{childExited={code,signal};});
  server.on('error',(err)=>{childExited={code:1,signal:'error',message:err.message};});

  let vendeurId=null;
  try{
    const base=`http://127.0.0.1:${port}`;
    const ready=await waitForReady(base,45);
    if(!ready){
      const extra=childExited?` (child exit: ${JSON.stringify(childExited)})`:'';
      throw new Error(`Serveur non pret pour test critique${extra}`);
    }

    const created=await requestJson(`${base}/api/vendeurs`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        nom:'Critical Test',
        boutique:'Critical Boutique',
        tel:phone,
        email,
        plan:'starter',
        produits:'test',
        motdepasse:password
      })
    });
    if(!created.ok){
      throw new Error(`Creation vendeur KO: ${created.status} ${JSON.stringify(created.data)}`);
    }
    vendeurId=created.data&&created.data.vendeur&&created.data.vendeur.id;
    if(!vendeurId){
      throw new Error('ID vendeur manquant');
    }

    const login=await requestJson(`${base}/api/auth/login`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({tel:phone,password})
    });
    if(!login.ok||!login.data.token){
      throw new Error(`Login vendeur KO: ${login.status} ${JSON.stringify(login.data)}`);
    }
    const vendeurToken=login.data.token;

    const order1=await requestJson(`${base}/api/orders`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        vendeurId,
        clientNom:'Client Status',
        clientTel:'+22670000001',
        items:[{id:1,nom:'P1',prix:1000,quantity:1}],
        total:1000
      })
    });
    if(!order1.ok||!order1.data.id){
      throw new Error(`Creation order1 KO: ${order1.status} ${JSON.stringify(order1.data)}`);
    }
    const order1Id=order1.data.id;

    const statuses=['confirmee','expediee','livree'];
    for(const status of statuses){
      const res=await requestJson(`${base}/api/orders/${order1Id}/status`,{
        method:'PUT',
        headers:withAuth(vendeurToken,{'Content-Type':'application/json'}),
        body:JSON.stringify({statut:status})
      });
      if(!res.ok){
        throw new Error(`Transition ${status} KO: ${res.status} ${JSON.stringify(res.data)}`);
      }
    }

    const invalidBack=await requestJson(`${base}/api/orders/${order1Id}/status`,{
      method:'PUT',
      headers:withAuth(vendeurToken,{'Content-Type':'application/json'}),
      body:JSON.stringify({statut:'en_attente'})
    });
    if(invalidBack.ok){
      throw new Error('Transition invalide acceptee (livree -> en_attente)');
    }

    const order2=await requestJson(`${base}/api/orders`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        vendeurId,
        clientNom:'Client Payment',
        clientTel:'+22670000002',
        items:[{id:2,nom:'P2',prix:1200,quantity:2}],
        total:2400
      })
    });
    if(!order2.ok||!order2.data.id){
      throw new Error(`Creation order2 KO: ${order2.status} ${JSON.stringify(order2.data)}`);
    }
    const order2Id=order2.data.id;

    const checkout=await requestJson(`${base}/api/payments/checkout`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({orderId:order2Id,method:'wave'})
    });
    if(!checkout.ok||!checkout.data.payment||!checkout.data.payment.reference){
      throw new Error(`Checkout KO: ${checkout.status} ${JSON.stringify(checkout.data)}`);
    }
    const reference=checkout.data.payment.reference;

    const webhook=await requestJson(`${base}/api/payments/webhook/mock`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({reference,status:'paid'})
    });
    if(!webhook.ok){
      throw new Error(`Webhook mock KO: ${webhook.status} ${JSON.stringify(webhook.data)}`);
    }

    const paymentRead=await requestJson(`${base}/api/payments/${reference}`,{
      headers:withAuth(vendeurToken)
    });
    if(!paymentRead.ok||!paymentRead.data||paymentRead.data.status!=='paid'){
      throw new Error(`Lecture paiement KO: ${paymentRead.status} ${JSON.stringify(paymentRead.data)}`);
    }

    const orderRead=await requestJson(`${base}/api/orders/${order2Id}`,{
      headers:withAuth(vendeurToken)
    });
    if(!orderRead.ok||!orderRead.data){
      throw new Error(`Lecture commande KO: ${orderRead.status} ${JSON.stringify(orderRead.data)}`);
    }
    if(!orderRead.data.payment||orderRead.data.payment.status!=='paid'){
      throw new Error('Commande non synchronisee avec paiement paid');
    }

    const admin=await requestJson(`${base}/api/auth/admin/login`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:adminEmail,password:adminPassword})
    });
    if(!admin.ok||!admin.data.token){
      throw new Error(`Login admin KO: ${admin.status} ${JSON.stringify(admin.data)}`);
    }

    const cleanup=await requestJson(`${base}/api/vendeurs/${vendeurId}`,{
      method:'DELETE',
      headers:withAuth(admin.data.token)
    });
    if(!cleanup.ok){
      throw new Error(`Cleanup KO: ${cleanup.status} ${JSON.stringify(cleanup.data)}`);
    }

    vendeurId=null;
    console.log('CRITICAL_OK');
  }finally{
    if(vendeurId){
      try{
        const base=`http://127.0.0.1:${port}`;
        const admin=await requestJson(`${base}/api/auth/admin/login`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            email:process.env.ADMIN_EMAIL||'admin@whabiz.local',
            password:process.env.ADMIN_PASSWORD||'Admin123!'
          })
        });
        if(admin.ok&&admin.data&&admin.data.token){
          await requestJson(`${base}/api/vendeurs/${vendeurId}`,{
            method:'DELETE',
            headers:withAuth(admin.data.token)
          });
        }
      }catch{}
    }
    server.kill('SIGTERM');
  }
}

main().catch((err)=>{
  console.error(err.message);
  process.exit(1);
});
