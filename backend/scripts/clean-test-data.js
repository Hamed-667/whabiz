const mysql=require('mysql2/promise');
const path=require('path');
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
const DRY_RUN=process.argv.includes('--dry-run');

function asInt(value){
  const n=Number(value);
  return Number.isFinite(n)?n:0;
}

async function createPool(){
  if(MYSQL_URL) return createMysqlPool(mysql,MYSQL_URL,MYSQL_DATABASE);
  return createMysqlPool(mysql,{
    host:MYSQL_HOST,
    port:MYSQL_PORT,
    user:MYSQL_USER,
    password:MYSQL_PASSWORD,
    database:MYSQL_DATABASE,
    connectionLimit:5
  });
}

async function run(){
  const pool=await createPool();
  const conn=await pool.getConnection();

  const TEST_VENDOR_WHERE=`(
    slug LIKE 'smoke-boutique%' OR
    slug LIKE 'flow%' OR
    slug LIKE 'critical%' OR
    slug='dbg' OR
    LOWER(COALESCE(nom,'')) IN ('smoke test','flow test','flow2','flow3','flow4','dbg','critical test') OR
    LOWER(COALESCE(email,'')) LIKE 'smoke+%@example.com' OR
    LOWER(COALESCE(email,'')) LIKE 'flow+%@example.com' OR
    LOWER(COALESCE(email,'')) LIKE 'flow%@example.com' OR
    LOWER(COALESCE(email,'')) LIKE 'critical+%@example.com' OR
    LOWER(COALESCE(email,'')) LIKE 'dbg+%@example.com'
  )`;

  try{
    const [vendorsRows]=await conn.query(`SELECT vendeur_id FROM rel_vendeurs WHERE ${TEST_VENDOR_WHERE}`);
    const vendorIds=(Array.isArray(vendorsRows)?vendorsRows:[])
      .map((row)=>asInt(row.vendeur_id))
      .filter((id)=>id>0);
    const vendorIdSet=new Set(vendorIds);
    const vendorParams=Array.from(vendorIdSet);
    const vendorPlaceholders=vendorParams.map(()=>'?').join(',');

    const impactedOrderIds=new Set();
    const impactedOrderItemIds=new Set();
    const impactedPaymentIds=new Set();
    const impactedAutomationIds=new Set();
    const impactedProductIds=new Set();
    const impactedReviewIds=new Set();
    const impactedAnalyticsIds=new Set();
    const impactedRecoveryIds=new Set();
    const impactedVendorIds=new Set(vendorParams);

    if(vendorParams.length){
      const [rowsOrders]=await conn.query(
        `SELECT order_id
         FROM rel_orders
         WHERE vendeur_id IN (${vendorPlaceholders})
            OR CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.vendeurId')) AS UNSIGNED) IN (${vendorPlaceholders})`,
        [...vendorParams,...vendorParams]
      );
      (rowsOrders||[]).forEach((row)=>{
        const id=asInt(row.order_id);
        if(id>0) impactedOrderIds.add(id);
      });

      const [rowsPayments]=await conn.query(
        `SELECT payment_id
         FROM rel_payments
         WHERE vendeur_id IN (${vendorPlaceholders})
            OR CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.vendeurId')) AS UNSIGNED) IN (${vendorPlaceholders})`,
        [...vendorParams,...vendorParams]
      );
      (rowsPayments||[]).forEach((row)=>{
        const id=asInt(row.payment_id);
        if(id>0) impactedPaymentIds.add(id);
      });

      const [rowsProducts]=await conn.query(
        `SELECT product_id FROM rel_products WHERE vendeur_id IN (${vendorPlaceholders})`,
        vendorParams
      );
      (rowsProducts||[]).forEach((row)=>{
        const id=asInt(row.product_id);
        if(id>0) impactedProductIds.add(id);
      });

      const [rowsReviews]=await conn.query(
        `SELECT review_id FROM rel_reviews WHERE vendeur_id IN (${vendorPlaceholders})`,
        vendorParams
      );
      (rowsReviews||[]).forEach((row)=>{
        const id=asInt(row.review_id);
        if(id>0) impactedReviewIds.add(id);
      });

      const [rowsAnalytics]=await conn.query(
        `SELECT event_id FROM rel_analytics_events WHERE vendeur_id IN (${vendorPlaceholders})`,
        vendorParams
      );
      (rowsAnalytics||[]).forEach((row)=>{
        const id=String(row.event_id||'').trim();
        if(id) impactedAnalyticsIds.add(id);
      });

      const [rowsRecovery]=await conn.query(
        `SELECT row_id FROM rel_recovery WHERE vendeur_id IN (${vendorPlaceholders})`,
        vendorParams
      );
      (rowsRecovery||[]).forEach((row)=>{
        const id=String(row.row_id||'').trim();
        if(id) impactedRecoveryIds.add(id);
      });

      const [rowsAutomations]=await conn.query(
        `SELECT automation_id FROM rel_automations WHERE vendeur_id IN (${vendorPlaceholders})`,
        vendorParams
      );
      (rowsAutomations||[]).forEach((row)=>{
        const id=String(row.automation_id||'').trim();
        if(id) impactedAutomationIds.add(id);
      });
    }

    const [orphanOrdersRows]=await conn.query(`
      SELECT order_id
      FROM rel_orders
      WHERE vendeur_id IS NULL
        AND (
          JSON_EXTRACT(payload_json,'$.vendeurId') IS NULL
          OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.vendeurId')))='null'
          OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.vendeurId')))='undefined'
          OR TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.vendeurId')),''))=''
        )
    `);
    (orphanOrdersRows||[]).forEach((row)=>{
      const id=asInt(row.order_id);
      if(id>0) impactedOrderIds.add(id);
    });

    const orderParams=Array.from(impactedOrderIds);
    const orderPlaceholders=orderParams.map(()=>'?').join(',');
    if(orderParams.length){
      const [rowsOrderItems]=await conn.query(
        `SELECT id FROM rel_order_items WHERE order_id IN (${orderPlaceholders})`,
        orderParams
      );
      (rowsOrderItems||[]).forEach((row)=>{
        const id=asInt(row.id);
        if(id>0) impactedOrderItemIds.add(id);
      });

      const [rowsOrderPayments]=await conn.query(
        `SELECT payment_id FROM rel_payments WHERE order_id IN (${orderPlaceholders})`,
        orderParams
      );
      (rowsOrderPayments||[]).forEach((row)=>{
        const id=asInt(row.payment_id);
        if(id>0) impactedPaymentIds.add(id);
      });

      const [rowsOrderAutomations]=await conn.query(
        `SELECT automation_id FROM rel_automations WHERE order_id IN (${orderPlaceholders})`,
        orderParams
      );
      (rowsOrderAutomations||[]).forEach((row)=>{
        const id=String(row.automation_id||'').trim();
        if(id) impactedAutomationIds.add(id);
      });
    }

    const [orphanPaymentsRows]=await conn.query(`
      SELECT payment_id
      FROM rel_payments
      WHERE vendeur_id IS NULL
        AND (
          JSON_EXTRACT(payload_json,'$.vendeurId') IS NULL
          OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.vendeurId')))='null'
          OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.vendeurId')))='undefined'
          OR TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.vendeurId')),''))=''
        )
    `);
    (orphanPaymentsRows||[]).forEach((row)=>{
      const id=asInt(row.payment_id);
      if(id>0) impactedPaymentIds.add(id);
    });

    const summary={
      dryRun:DRY_RUN,
      vendors:impactedVendorIds.size,
      orders:impactedOrderIds.size,
      orderItems:impactedOrderItemIds.size,
      payments:impactedPaymentIds.size,
      automations:impactedAutomationIds.size,
      products:impactedProductIds.size,
      reviews:impactedReviewIds.size,
      analytics:impactedAnalyticsIds.size,
      recovery:impactedRecoveryIds.size
    };
    console.log('[db:clean-test] Preview impact:',JSON.stringify(summary));

    if(DRY_RUN){
      console.log('[db:clean-test] Mode dry-run: aucune suppression effectuee.');
      return;
    }

    await conn.beginTransaction();

    if(orderParams.length){
      await conn.query(`DELETE FROM rel_order_items WHERE order_id IN (${orderPlaceholders})`,orderParams);
      await conn.query(`DELETE FROM rel_automations WHERE order_id IN (${orderPlaceholders})`,orderParams);
      await conn.query(`DELETE FROM rel_payments WHERE order_id IN (${orderPlaceholders})`,orderParams);
      await conn.query(`DELETE FROM rel_orders WHERE order_id IN (${orderPlaceholders})`,orderParams);
    }

    await conn.query(`
      DELETE FROM rel_payments
      WHERE vendeur_id IS NULL
        AND (
          JSON_EXTRACT(payload_json,'$.vendeurId') IS NULL
          OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.vendeurId')))='null'
          OR LOWER(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.vendeurId')))='undefined'
          OR TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.vendeurId')),''))=''
        )
    `);
    await conn.query(`
      DELETE p
      FROM rel_payments p
      LEFT JOIN rel_orders o ON o.order_id=p.order_id
      LEFT JOIN rel_vendeurs v ON v.vendeur_id=p.vendeur_id
      WHERE (p.order_id IS NULL OR o.order_id IS NULL)
        AND (p.vendeur_id IS NULL OR v.vendeur_id IS NULL)
    `);

    if(vendorParams.length){
      await conn.query(`DELETE FROM rel_automations WHERE vendeur_id IN (${vendorPlaceholders})`,vendorParams);
      await conn.query(`DELETE FROM rel_analytics_events WHERE vendeur_id IN (${vendorPlaceholders})`,vendorParams);
      await conn.query(`DELETE FROM rel_recovery WHERE vendeur_id IN (${vendorPlaceholders})`,vendorParams);
      await conn.query(`DELETE FROM rel_reviews WHERE vendeur_id IN (${vendorPlaceholders})`,vendorParams);
      await conn.query(`DELETE FROM rel_products WHERE vendeur_id IN (${vendorPlaceholders})`,vendorParams);
      await conn.query(
        `DELETE FROM rel_payments
         WHERE vendeur_id IN (${vendorPlaceholders})
            OR CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.vendeurId')) AS UNSIGNED) IN (${vendorPlaceholders})`,
        [...vendorParams,...vendorParams]
      );
      await conn.query(
        `DELETE FROM rel_orders
         WHERE vendeur_id IN (${vendorPlaceholders})
            OR CAST(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.vendeurId')) AS UNSIGNED) IN (${vendorPlaceholders})`,
        [...vendorParams,...vendorParams]
      );
      await conn.query(`DELETE FROM rel_vendeurs WHERE vendeur_id IN (${vendorPlaceholders})`,vendorParams);
    }

    await conn.commit();

    const [[remainVendors]]=await conn.query(`SELECT COUNT(*) AS c FROM rel_vendeurs WHERE ${TEST_VENDOR_WHERE}`);
    const [[remainOrders]]=await conn.query(`SELECT COUNT(*) AS c FROM rel_orders WHERE vendeur_id IS NULL`);
    const [[remainPayments]]=await conn.query(`SELECT COUNT(*) AS c FROM rel_payments WHERE vendeur_id IS NULL OR order_id IS NULL`);

    console.log(
      '[db:clean-test] Nettoyage termine:',
      JSON.stringify({
        testVendorsRemaining:asInt(remainVendors.c),
        orphanOrdersRemaining:asInt(remainOrders.c),
        orphanPaymentsRemaining:asInt(remainPayments.c)
      })
    );
  }catch(err){
    try{await conn.rollback();}catch{}
    throw err;
  }finally{
    conn.release();
    await pool.end();
  }
}

run().catch((err)=>{
  console.error('[db:clean-test] Echec:',err.message);
  process.exit(1);
});
