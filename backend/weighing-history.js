const weighingRequestDetails=`SELECT
			(wr.status='Awaiting Storekeeper' AND wr.completed_record_id IS NULL
            AND ($2::text='admin' OR wr.created_by=$1)) AS can_cancel,
            (wr.status='Awaiting Storekeeper' AND wr.request_type IN ('Sale','Purchase')
            AND ($2::text='admin' OR wr.created_by=$1)) AS can_change_order,wr.ordered_quantity,
            COALESCE((SELECT p.process_loss FROM production p WHERE p.production_id=wr.completed_record_id),0) AS process_loss,
            COALESCE((SELECT p.kernel_returned FROM production p WHERE p.production_id=wr.completed_record_id),0) AS kernel_returned,
            -- Kernel returned to store from this production day, listed on its card so the Director can remove one.
            (SELECT COALESCE(json_agg(json_build_object('count_id',s.count_id,'quantity',s.received,'count_date',to_char(s.count_date,'YYYY-MM-DD'),
                'recorded_by_name',(SELECT username FROM users WHERE user_id=s.recorded_by)) ORDER BY s.count_id),'[]'::json)
             FROM stock_counts s WHERE s.return_request_id=wr.request_id) AS kernel_returns,
            wr.request_id,wr.daily_number,wr.request_type,TO_CHAR(wr.request_date,'YYYY-MM-DD') AS request_date,
			wr.item_id,items.name AS item,wr.supplier_id,suppliers.name AS supplier,
			wr.customer_id,customers.name AS customer,wr.unit_cost,wr.unit_price,wr.billing_basis,wr.representative_id,
			TO_CHAR(wr.production_hours,'HH24:MI') AS production_hours,
			TO_CHAR(wr.down_time,'HH24:MI') AS down_time,wr.status,wr.created_at,wr.kernel_used,wr.pko_produced,wr.pkc_produced,wr.sludge_produced,
			(SELECT COALESCE(json_agg(b ORDER BY b.batch_id),'[]'::json) FROM
			 (SELECT pb.*,u.username AS recorded_by_name FROM production_batches pb
			 LEFT JOIN users u ON u.user_id=pb.recorded_by WHERE pb.request_id=wr.request_id) b) AS batches,
			users.username AS authorised_by
		FROM numbered_requests wr
		LEFT JOIN items ON items.item_id=wr.item_id
		LEFT JOIN suppliers ON suppliers.supplier_id=wr.supplier_id
		LEFT JOIN customers ON customers.customer_id=wr.customer_id
		LEFT JOIN users ON users.user_id=wr.created_by`;

function registerFinishedProduction(app,pool,requireRole){
    app.get('/api/weighing-requests/finished-production',requireRole(['admin']),async(req,res)=>{
        const limit=req.query.limit===undefined?10:Number(req.query.limit);
        if(!Number.isInteger(limit)||limit<1||limit>50)return res.status(400).json({err:'Page size must be between 1 and 50.'});
        let before=null;
        if(req.query.before!==undefined){
            try{
                if(typeof req.query.before!=='string'||req.query.before.length>256)throw new Error();
                before=JSON.parse(Buffer.from(req.query.before,'base64url').toString('utf8'));
                if(!/^\d{4}-\d{2}-\d{2}$/.test(before.date)||Number(before.date.slice(0,4))<1||new Date(before.date+'T00:00:00Z').toISOString().slice(0,10)!==before.date||!Number.isInteger(before.id)||before.id<1||before.id>2147483647)throw new Error();
            }catch(error){return res.status(400).json({err:'Invalid history page reference. Refresh and try again.'});}
        }
        try{
            // Select a bounded page before loading each day's entry history.
            const result=await pool.query(`WITH completed_page AS (
                SELECT wr.* FROM weighing_requests wr
                WHERE wr.request_type='Production' AND wr.status='Completed'
                AND EXISTS(SELECT 1 FROM production p WHERE p.production_id=wr.completed_record_id)
                AND ($3::date IS NULL OR (wr.request_date,wr.request_id)<($3::date,$4::integer))
                ORDER BY wr.request_date DESC,wr.request_id DESC LIMIT $5
            ),numbered_requests AS (
                SELECT completed_page.*,(SELECT COUNT(*) FROM weighing_requests n
                    WHERE n.request_type=completed_page.request_type AND n.request_date=completed_page.request_date
                    AND n.request_id<=completed_page.request_id) AS daily_number FROM completed_page
            ) ${weighingRequestDetails}
            ORDER BY wr.request_date DESC,wr.request_id DESC`,
                [req.session.user_id,req.session.role,before?.date||null,before?.id||null,limit+1]);
            const requests=result.rows.slice(0,limit),hasMore=result.rows.length>limit,last=requests.at(-1);
            const next=hasMore?Buffer.from(JSON.stringify({date:last.request_date,id:last.request_id})).toString('base64url'):null;
            res.set('Cache-Control','no-store').json({requests,has_more:hasMore,next_cursor:next});
        }catch(error){console.error(error);res.status(500).json({err:'Could not load finished production days.'});}
    });
}
module.exports={weighingRequestDetails,registerFinishedProduction};
