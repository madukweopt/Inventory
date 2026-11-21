const {lockStock}=require('./stock-safety');
function registerConsumableChecks(app,pool,requireRole){
    app.get('/api/consumable-checks',requireRole(['admin','storekeeper']),async(req,res)=>{
        try{
            const rows=(await pool.query(`SELECT i.item_id,i.name,to_char(CURRENT_DATE,'YYYY-MM-DD') AS check_date,
                COALESCE(SUM(s.issued),0) AS used,
                CASE WHEN COALESCE(SUM(s.issued),0)>0 THEN 'Recorded'
                    WHEN c.item_id IS NOT NULL THEN 'None used' ELSE 'Pending' END AS status
                FROM items i LEFT JOIN stock_counts s ON s.item_id=i.item_id AND s.count_date=CURRENT_DATE
                LEFT JOIN daily_consumable_checks c ON c.item_id=i.item_id AND c.check_date=CURRENT_DATE
                WHERE i.item_type='consumable' GROUP BY i.item_id,c.item_id ORDER BY i.name`)).rows;
            res.json(rows);
        }catch(error){res.status(500).json({err:'Could not load the daily consumables check.'});}
    });
    app.post('/api/consumable-checks/none',requireRole(['admin','storekeeper']),async(req,res)=>{
        if(!Number.isInteger(Number(req.body.item_id))||Number(req.body.item_id)<1)return res.status(400).json({err:'Select a consumable.'});
        const client=await pool.connect();
        try{
            await client.query('BEGIN');await lockStock(client);
            const item=(await client.query("SELECT item_id FROM items WHERE item_id=$1 AND item_type='consumable'",[req.body.item_id])).rows[0];
            if(!item)throw Object.assign(new Error('Select a consumable.'),{status:400});
            // Check the displayed day, so an old page cannot confirm a new day after midnight.
            const date=(await client.query("SELECT to_char(CURRENT_DATE,'YYYY-MM-DD') AS today")).rows[0].today;
            if(req.body.check_date!==date)throw Object.assign(new Error('The day has changed. Refresh the daily check.'),{status:409});
            const used=(await client.query('SELECT COALESCE(SUM(issued),0) AS used FROM stock_counts WHERE item_id=$1 AND count_date=CURRENT_DATE',[item.item_id])).rows[0].used;
            if(Number(used)>0)throw Object.assign(new Error('Usage has already been recorded for this consumable today.'),{status:409});
            await client.query(`INSERT INTO daily_consumable_checks(check_date,item_id,recorded_by)
                VALUES(CURRENT_DATE,$1,$2) ON CONFLICT DO NOTHING`,[item.item_id,req.session.user_id]);
            await client.query('COMMIT');res.json({message:'Confirmed: none used today. Stock has not changed.'});
        }catch(error){await client.query('ROLLBACK');res.status(error.status||500).json({err:error.status?error.message:'Could not save the daily check.'});}
        finally{client.release();}
    });
}
module.exports={registerConsumableChecks};
