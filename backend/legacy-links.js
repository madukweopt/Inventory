const {historicalBatch}=require('./dependency-services');
const {lockStock}=require('./stock-safety');
const types={purchases:{table:'purchases',id:'purchase_id',date:'purchase_date',type:'Purchase'},sales:{table:'sales',id:'sales_id',date:'sales_date',type:'Sale'},production:{table:'production',id:'production_id',date:'production_date',type:'Production'}};
function fail(status,message){throw Object.assign(new Error(message),{status});}
async function proposal(client,kind,id,lock=false) {
    const c=types[kind];if(!c) fail(400,'Invalid record type');
    const record=(await client.query(`SELECT *,to_char(${c.date},'YYYY-MM-DD') AS day ${kind==='production'?",to_char(production_hours,'HH24:MI') AS production_hours,to_char(down_time,'HH24:MI') AS down_time":''} FROM ${c.table} WHERE ${c.id}=$1 ${lock?'FOR UPDATE':''}`,[id])).rows[0];
    if(!record) fail(404,'Record not found');
    if((await client.query('SELECT 1 FROM weighing_requests WHERE request_type=$1 AND completed_record_id=$2',[c.type,id])).rowCount) fail(409,'This record already has an inventory link');
    let movements;
    if(kind==='production') {
        const items=(await client.query("SELECT item_id,LOWER(name) AS name FROM items WHERE LOWER(name) IN ('p kernel','pko','pkc','sludge')")).rows;
        const ids=Object.fromEntries(items.map(i=>[i.name,i.item_id]));
        movements=[['Kernel Issued',ids['p kernel'],0,record.kernel_used],['PKO Received',ids.pko,record.pko_produced,0],['PKC Received',ids.pkc,record.pkc_produced,0],['Sludge Received',ids.sludge,record.sludge_produced,0]];
    } else movements=[[kind==='purchases'?'Received':'Issued',record.item_id,kind==='purchases'?record.quantity_supplied:0,kind==='sales'?record.quantity:0]];
    const options=[];
    for(const [part,itemId,received,issued] of movements) {
        if(!itemId) fail(409,'Required inventory item is missing');
        const rows=(await client.query(`SELECT sc.*,i.name FROM stock_counts sc JOIN items i ON i.item_id=sc.item_id
            WHERE sc.source_type='Manual' AND sc.source_id IS NULL AND sc.count_date=$1::date AND sc.item_id=$2
            AND sc.received=$3 AND sc.issued=$4 ORDER BY sc.created_at,sc.count_id`,[record.day,itemId,received,issued])).rows;
        options.push({part,item_id:itemId,received,issued,required:Number(received)>0||Number(issued)>0,matches:rows});
    }
    return {record,options};
}
module.exports=function(app,pool,requireRole) {
    app.get('/api/legacy-links',requireRole(['admin']),async(req,res)=>{
        try {
            const result=await pool.query(`SELECT * FROM (
                SELECT 'purchases' AS kind,p.purchase_id AS id,to_char(p.purchase_date,'YYYY-MM-DD') AS day FROM purchases p WHERE NOT EXISTS(SELECT 1 FROM weighing_requests w WHERE w.request_type='Purchase' AND w.completed_record_id=p.purchase_id)
                UNION ALL SELECT 'sales',s.sales_id,to_char(s.sales_date,'YYYY-MM-DD') FROM sales s WHERE NOT EXISTS(SELECT 1 FROM weighing_requests w WHERE w.request_type='Sale' AND w.completed_record_id=s.sales_id)
                UNION ALL SELECT 'production',p.production_id,to_char(p.production_date,'YYYY-MM-DD') FROM production p WHERE NOT EXISTS(SELECT 1 FROM weighing_requests w WHERE w.request_type='Production' AND w.completed_record_id=p.production_id)) r ORDER BY day,kind,id`);
            return res.json(result.rows);
        }catch(error){return res.status(500).json({err:'Could not load older records'});}
    });
    app.get('/api/legacy-links/:kind/:id',requireRole(['admin']),async(req,res)=>{
        try{return res.json(await proposal(pool,req.params.kind,req.params.id));}
        catch(error){return res.status(error.status||500).json({err:error.status?error.message:'Could not find matching inventory'});}
    });
    app.post('/api/legacy-links/:kind/:id',requireRole(['admin']),async(req,res)=>{
        const client=await pool.connect();
        try {
            await client.query('BEGIN');await lockStock(client);
            const c=types[req.params.kind];
            const {record,options}=await proposal(client,req.params.kind,req.params.id,true);
            const supplied=req.body.movements||{};
            const chosen=[];
            for(const option of options) {
                const countId=Number(supplied[option.part]||0);
                if(!countId&&!option.required) continue;
                const match=option.matches.find(row=>row.count_id===countId);
                if(!match) fail(409,'Select an exact inventory match for every non-zero quantity. No quantities will be guessed.');
                chosen.push({...option,count_id:countId});
            }
            if(new Set(chosen.map(row=>row.count_id)).size!==chosen.length) fail(400,'An inventory row cannot be used twice');
            const inserted=await client.query(`INSERT INTO weighing_requests
                (request_type,request_date,item_id,supplier_id,customer_id,unit_cost,unit_price,quantity,
                 production_hours,down_time,kernel_used,pko_produced,pkc_produced,sludge_produced,
                 status,created_by,completed_by,completed_record_id,created_at,completed_at,legacy_linked)
                VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Completed',$15,$15,$16,$17,$17,true) RETURNING request_id`,
                [c.type,record.day,record.item_id||null,record.supplier_id||null,record.customer_id||null,record.unit_cost||null,record.unit_price||null,
                 record.quantity_supplied||record.quantity||null,record.production_hours||null,record.down_time||null,
                 record.kernel_used??null,record.pko_produced??null,record.pkc_produced??null,record.sludge_produced??null,
                 req.session.user_id,record[c.id],record.created_at]);
            for(const row of chosen) {
                const linked=await client.query(`UPDATE stock_counts SET source_type=$1,source_id=$2,source_part=$3
                    WHERE count_id=$4 AND source_type='Manual' AND source_id IS NULL RETURNING count_id`,[c.type,inserted.rows[0].request_id,row.part,row.count_id]);
                if(!linked.rowCount) fail(409,'Inventory changed during review. Refresh the matches.');
            }
            await historicalBatch(client,{request_id:inserted.rows[0].request_id,request_type:c.type,completed_record_id:record[c.id]},req.session.user_id);
            await client.query('COMMIT');return res.json({message:'Older record linked to the reviewed inventory. Quantities were not changed.'});
        }catch(error){await client.query('ROLLBACK');return res.status(error.status||500).json({err:error.status?error.message:'Could not link the reviewed records'});}
        finally{client.release();}
    });
};
