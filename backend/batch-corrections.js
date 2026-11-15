const {lockStock,stockFloor,protectStock}=require('./stock-safety');
function quantity(value) {
    const text=String(value??'');
    if(!/^\d+(\.\d{1,2})?$/.test(text)||!Number.isFinite(Number(text))) throw Object.assign(new Error('Enter non-negative quantities with no more than two decimals'),{status:400});
    return Number(text);
}
module.exports=function(app,pool,requireRole) {
    async function correct(req,res,reverse) {
        const client=await pool.connect();
        try {
            await client.query('BEGIN');await lockStock(client);
            const before=await stockFloor(client);
            const request=(await client.query('SELECT * FROM weighing_requests WHERE request_id=$1 FOR UPDATE',[req.params.id])).rows[0];
            if(!request||request.request_type!=='Production') throw Object.assign(new Error('Production authorisation not found'),{status:404});
            if(request.status!=='Awaiting Storekeeper') throw Object.assign(new Error('Reopen this production day before correcting a batch'),{status:409});
            const batch=(await client.query('SELECT * FROM production_batches WHERE request_id=$1 AND batch_id=$2 FOR UPDATE',[req.params.id,req.params.batchId])).rows[0];
            if(!batch) throw Object.assign(new Error('Batch not found'),{status:404});
            if(batch.voided||Number(req.body.version)!==batch.version) throw Object.assign(new Error('This batch changed or was reversed. Refresh before correcting it.'),{status:409});
            const keys=['kernel_used','pko_produced','pkc_produced','sludge_produced'];
            const values=keys.map(key=>reverse?Number(batch[key]):quantity(req.body[key]));
            if(!reverse&&!values.some(value=>value>0)) throw Object.assign(new Error('Enter a positive quantity or use Reverse Batch'),{status:400});
            const deltas=keys.map((key,index)=>reverse?-Number(batch[key]):values[index]-Number(batch[key]));
            await client.query(`UPDATE production_batches SET kernel_used=$1,pko_produced=$2,pkc_produced=$3,sludge_produced=$4,
                scale_ticket=$5,version=version+1,voided=$6 WHERE batch_id=$7`,[...values,reverse?batch.scale_ticket:String(req.body.scale_ticket||'').trim()||null,reverse,batch.batch_id]);
            await client.query(`UPDATE production SET kernel_used=kernel_used+$1,pko_produced=pko_produced+$2,
                pkc_produced=pkc_produced+$3,sludge_produced=sludge_produced+$4 WHERE production_id=$5`,[...deltas,request.completed_record_id]);
            await client.query(`UPDATE weighing_requests SET kernel_used=kernel_used+$1,pko_produced=pko_produced+$2,
                pkc_produced=pkc_produced+$3,sludge_produced=sludge_produced+$4 WHERE request_id=$5`,[...deltas,request.request_id]);
            for(const [index,part] of ['Kernel Issued','PKO Received','PKC Received','Sludge Received'].entries()) {
                await client.query(`UPDATE stock_counts SET received=received+$1,issued=issued+$2
                    WHERE source_type='Production' AND source_id=$3 AND source_part=$4`,[index===0?0:deltas[index],index===0?deltas[index]:0,request.request_id,part]);
            }
            await protectStock(client,before);
            await client.query('COMMIT');return res.json({message:reverse?'Production entry reversed; daily totals and stock updated':'Production entry corrected; daily totals and stock updated'});
        } catch(error) {await client.query('ROLLBACK');return res.status(error.status||500).json({err:error.status?error.message:'Could not correct this batch'});}
        finally {client.release();}
    }
    app.patch('/api/weighing-requests/:id/batches/:batchId',requireRole(['admin']),(req,res)=>correct(req,res,false));
    app.delete('/api/weighing-requests/:id/batches/:batchId',requireRole(['admin']),(req,res)=>correct(req,res,true));
};
