// Costs, the dashboard and Checks.
// Moved from server.js unchanged; server.js mounts this router where the routes used to be.
const {pool}=require('../db');
const {requireRole}=require('../auth');
const {calculateContinuousCosts}=require('../continuous-costing');
const {stockAdjustmentReasons}=require('../record-rules');
const router=require('express').Router();

// Calculates weighted inventory and production costs from transaction history.
async function calculateCosts(existingClient) {
    const costClient=existingClient||await pool.connect();
    try {
    if(!existingClient) await costClient.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
	const RawPurchasesRecords=await costClient.query(`
    SELECT
    items.item_id,
    items.name,
    items.item_type,
    to_char(
    purchases.purchase_date,
    'YYYY-MM-DD'
    ) AS date,
    purchases.created_at,
    purchases.quantity_supplied AS quantity,
    purchases.quantity_supplied *
    purchases.unit_cost AS value,
    'in' AS type,
    0 AS event_order
    FROM purchases
    INNER JOIN items
    ON purchases.item_id = items.item_id
    `);

	const purchases=RawPurchasesRecords.rows;

	/*
	 * Raw materials and consumables issued for production.
	 * Product dispatches are handled separately.
	 */
	const rawIssues=await costClient.query(`
    SELECT
    items.item_id,
    items.name,
    items.item_type,
    to_char(
    stock_counts.count_date,
    'YYYY-MM-DD'
    ) AS date,
    stock_counts.created_at,
    stock_counts.issued AS quantity,
    'out' AS type,
    1 AS event_order,stock_counts.source_type,stock_counts.adjustment_reason
    FROM stock_counts
    INNER JOIN items
    ON stock_counts.item_id = items.item_id
    WHERE stock_counts.issued > 0
    AND items.item_type IN (
    'raw_material',
    'consumable'
    )
    AND NOT (stock_counts.source_type='Production' AND EXISTS(SELECT 1 FROM production_batches pb
        WHERE pb.request_id=stock_counts.source_id))
    UNION ALL SELECT i.item_id,i.name,i.item_type,to_char(COALESCE(pb.movement_date,w.request_date),'YYYY-MM-DD'),
        pb.created_at,pb.kernel_used,'out',1,'Production',NULL FROM production_batches pb
        JOIN weighing_requests w ON w.request_id=pb.request_id JOIN production p ON p.production_id=w.completed_record_id
        JOIN items i ON LOWER(i.name)='p kernel'
        WHERE NOT pb.voided AND w.status<>'Cancelled' AND pb.kernel_used>0
    `);

	const issues=rawIssues.rows;
    // Raw materials and consumables put back into stock by hand: a return to store, or a count that found more.
    const rawReceipts=(await costClient.query(`SELECT items.item_id,items.name,to_char(stock_counts.count_date,'YYYY-MM-DD') AS date,
        stock_counts.created_at,stock_counts.received AS quantity,stock_counts.adjustment_reason
        FROM stock_counts JOIN items ON items.item_id=stock_counts.item_id
        WHERE stock_counts.source_type='Manual' AND stock_counts.received>0 AND items.item_type IN ('raw_material','consumable')`)).rows;

	const RawProduction=await costClient.query(`
    SELECT
    to_char(
    production.production_date,
    'YYYY-MM-DD'
    ) AS date,
    production.created_at,
    production.kernel_used,
    production.pko_produced,
    production.pkc_produced,
    'produce' AS type,
    2 AS event_order,NULL::integer AS batch_id,true AS legacy_batch
    FROM production WHERE NOT EXISTS(SELECT 1 FROM weighing_requests w JOIN production_batches pb ON pb.request_id=w.request_id
        WHERE w.request_type='Production' AND w.completed_record_id=production.production_id AND w.status<>'Cancelled')
    UNION ALL SELECT to_char(COALESCE(pb.movement_date,w.request_date),'YYYY-MM-DD'),pb.created_at,pb.kernel_used,pb.pko_produced,pb.pkc_produced,
        'produce',2,pb.batch_id,pb.legacy_batch FROM production_batches pb JOIN weighing_requests w ON w.request_id=pb.request_id
        JOIN production p ON p.production_id=w.completed_record_id WHERE NOT pb.voided AND w.status<>'Cancelled'
    `);

	const production=RawProduction.rows;
    const productItems=(await costClient.query("SELECT item_id,name FROM items WHERE LOWER(name) IN ('pko','pkc','sludge')")).rows;

	/*
	 * Storekeeper's finished-product records.
	 *
	 * received = quantity put into finished-product stock
	 * issued   = quantity dispatched or sold
	 */
	const RawProductStock=await costClient.query(`
    SELECT
    items.item_id,
    items.name,
    items.item_type,
    to_char(
    stock_counts.count_date,
    'YYYY-MM-DD'
    ) AS date,
    stock_counts.created_at,
    stock_counts.received,
    stock_counts.issued,stock_counts.source_type,stock_counts.source_id,stock_counts.adjustment_reason,
    EXISTS(SELECT 1 FROM weighing_requests w JOIN sales s ON s.sales_id=w.completed_record_id WHERE w.request_id=stock_counts.source_id AND stock_counts.source_type='Sale' AND s.invoice_number IS NULL) AS awaiting_invoice,
    (SELECT s.quantity FROM weighing_requests w JOIN sales s ON s.sales_id=w.completed_record_id WHERE w.request_id=stock_counts.source_id AND stock_counts.source_type='Sale'
        AND w.request_type='Sale' AND s.billing_basis='Customer' AND s.invoice_number IS NOT NULL) AS invoice_quantity
    FROM stock_counts
    INNER JOIN items
    ON stock_counts.item_id = items.item_id
    WHERE items.item_type = 'product'
    AND (
    stock_counts.received > 0
    OR stock_counts.issued > 0
    )
    `);

	const productStock=RawProductStock.rows;

    // A Finish Day loss is costed on the production's last issue or receipt date, after all its products are weighed.
    const losses=(await costClient.query(`SELECT to_char(COALESCE((SELECT MAX(COALESCE(pb.movement_date,w.request_date)) FROM weighing_requests w
        JOIN production_batches pb ON pb.request_id=w.request_id AND NOT pb.voided
        WHERE w.request_type='Production' AND w.completed_record_id=production.production_id AND w.status<>'Cancelled'),production_date),'YYYY-MM-DD') AS date,
        process_loss AS quantity FROM production WHERE process_loss>0`)).rows;
    const costs=calculateContinuousCosts({purchases,issues,production,productStock,productItems,losses,rawReceipts});
    if(!existingClient) await costClient.query('COMMIT');
	return costs;
    } catch(error) {if(!existingClient) await costClient.query('ROLLBACK');throw error;} finally {if(!existingClient)costClient.release();}
}

// Handles GET /api/average_cost requests.
router.get("/api/average_cost",requireRole(['admin']),async function(req,res) {
	try {
		const costs=await calculateCosts();
		res.status(200).json(costs);
	} catch(error) {
		console.log(error);
		res.status(500).json({
			err: "Could not load production costs"
		});
	}
});

// Handles GET /api/dashboard requests.
router.get("/api/dashboard",requireRole(['admin','manager','storekeeper']),async function(req,res) {
	try {
		const selectedDate=req.query.date||null;

		let datesql;

		if(selectedDate) {
			datesql="$1::date";
		} else {
			datesql="CURRENT_DATE";
		}

		let param=[];

		if(selectedDate) {
			param=[selectedDate];
		}

		const RawStockLevels=await pool.query(
			`
      SELECT
      items.name,
      COALESCE(
      SUM(
      COALESCE(stock_counts.received, 0) -
      COALESCE(stock_counts.issued, 0)
      ),
      0
      ) AS remaining,
      items.item_type
      FROM items
      LEFT JOIN stock_counts
      ON stock_counts.item_id = items.item_id
      AND stock_counts.count_date <= ${datesql}
      GROUP BY items.name, items.item_type
      `,
			param
		);

		// Transforms collection entries into the required output shape.
		const stockLevels=RawStockLevels.rows.map(stockLevel => {
			return {
				item: stockLevel.name,
				remaining: Number(stockLevel.remaining),
				item_type: stockLevel.item_type
			};
		});

		res.status(200).json(stockLevels);
	} catch(error) {
		console.log(error);

		res.status(500).json({
			error: "Could not retrieve stock levels"
		});
	}
});

// Handles GET /api/dashboard_period requests.
router.get("/api/dashboard_period",requireRole(['admin','manager']),async function(req,res) {
	try {
		const selectedDate=req.query.date;
		const datesql=selectedDate? "$1::date":"CURRENT_DATE";
		const param=selectedDate? [selectedDate]:[];

		const yieldStates=(await pool.query(`SELECT
            EXISTS(SELECT 1 FROM weighing_requests WHERE request_type='Production' AND status='Awaiting Storekeeper' AND request_date=${datesql}) AS day,
            EXISTS(SELECT 1 FROM weighing_requests WHERE request_type='Production' AND status='Awaiting Storekeeper' AND request_date>=date_trunc('week',${datesql}) AND request_date<date_trunc('week',${datesql})+INTERVAL '7 days') AS week,
            EXISTS(SELECT 1 FROM weighing_requests WHERE request_type='Production' AND status='Awaiting Storekeeper' AND request_date>=date_trunc('month',${datesql}) AND request_date<date_trunc('month',${datesql})+INTERVAL '1 month') AS month`,param)).rows[0];
		const RawProduction=await pool.query(
			`
        SELECT
        'day' AS period,
        COALESCE(SUM(production.kernel_used), 0) AS kernel_used,
        COALESCE(SUM(production.pko_produced), 0) AS pko_produced,
        COALESCE(SUM(production.pkc_produced), 0) AS pkc_produced,
        COALESCE(SUM(production.process_loss), 0) AS production_loss,
        COALESCE(
        ROUND(
        SUM(production.pko_produced) * 100.0 /
        NULLIF(SUM(production.kernel_used), 0),
        2
        ),
        0
        ) AS oil_yield
        FROM production
        WHERE production.production_date = ${datesql}

        UNION ALL

        SELECT
        'week',
        COALESCE(SUM(production.kernel_used), 0),
        COALESCE(SUM(production.pko_produced), 0),
        COALESCE(SUM(production.pkc_produced), 0),
        COALESCE(SUM(production.process_loss), 0),
        COALESCE(
        ROUND(
        SUM(production.pko_produced) * 100.0 /
        NULLIF(SUM(production.kernel_used), 0),
        2
        ),
        0
        )
        FROM production
        WHERE production.production_date >= date_trunc('week', ${datesql})
        AND production.production_date <
        date_trunc('week', ${datesql}) + INTERVAL '7 days'

        UNION ALL

        SELECT
        'month',
        COALESCE(SUM(production.kernel_used), 0),
        COALESCE(SUM(production.pko_produced), 0),
        COALESCE(SUM(production.pkc_produced), 0),
        COALESCE(SUM(production.process_loss), 0),
        COALESCE(
        ROUND(
        SUM(production.pko_produced) * 100.0 /
        NULLIF(SUM(production.kernel_used), 0),
        2
        ),
        0
        )
        FROM production
        WHERE production.production_date >= date_trunc('month', ${datesql})
        AND production.production_date <
        date_trunc('month', ${datesql}) + INTERVAL '1 month'
        `,
			param
		);

		const production=RawProduction.rows;

		const RawSludgeProduction=await pool.query(
			`SELECT 'day' AS period,COALESCE(SUM(production.sludge_produced),0) AS sludge_produced
			FROM production
			WHERE production.production_date=${datesql}
			UNION ALL
			SELECT 'week',COALESCE(SUM(production.sludge_produced),0)
			FROM production
			WHERE production.production_date>=date_trunc('week',${datesql})
			AND production.production_date<date_trunc('week',${datesql})+INTERVAL '7 days'
			UNION ALL
			SELECT 'month',COALESCE(SUM(production.sludge_produced),0)
			FROM production
			WHERE production.production_date>=date_trunc('month',${datesql})
			AND production.production_date<date_trunc('month',${datesql})+INTERVAL '1 month'`,
			param
		);
		const sludgeProductionByPeriod=Object.fromEntries(
			RawSludgeProduction.rows.map(row => [row.period,Number(row.sludge_produced)])
		);

		const RawSales=await pool.query(
			`SELECT 'day' AS period,
        items.name AS name,
        COALESCE (SUM(sales.quantity), 0) AS quantity_sold,
        COALESCE (SUM(invoice_amount(sales.quantity,sales.unit_price)) / NULLIF(SUM(sales.quantity), 0), 0) AS average_unit_price,
        COALESCE (SUM(invoice_amount(sales.quantity,sales.unit_price)), 0) AS total_sales
        FROM items
        LEFT JOIN sales
        ON sales.item_id = items.item_id
        AND sales.sales_date = ${datesql}
        WHERE items.item_type = 'product'
        GROUP BY items.name

        UNION ALL

        SELECT 'week',
        items.name,
        COALESCE (SUM(sales.quantity), 0),
        COALESCE (SUM(invoice_amount(sales.quantity,sales.unit_price)) / NULLIF(SUM(sales.quantity), 0), 0),
        COALESCE (SUM(invoice_amount(sales.quantity,sales.unit_price)), 0)
        FROM items
        LEFT JOIN sales ON sales.item_id = items.item_id
        AND sales.sales_date >= date_trunc('week', ${datesql})
        AND sales.sales_date < date_trunc('week', ${datesql}) + INTERVAL '7 days'
        WHERE items.item_type = 'product'
        GROUP BY items.name

        UNION ALL

        SELECT 'month',
        items.name,
        COALESCE (SUM(sales.quantity), 0),
        COALESCE (SUM(invoice_amount(sales.quantity,sales.unit_price)) / NULLIF(SUM(sales.quantity), 0), 0),
        COALESCE (SUM(invoice_amount(sales.quantity,sales.unit_price)), 0)
        FROM items
        LEFT JOIN sales ON sales.item_id = items.item_id
        AND sales.sales_date >= date_trunc('month', ${datesql})
        AND sales.sales_date < date_trunc('month', ${datesql}) + '1 month'
        WHERE items.item_type = 'product'
        GROUP BY items.name
        `,
			param
		);
		const sales=RawSales.rows;

		// One-off expenses count on their date. A spread expense (rent, insurance) counts an equal share in each month it covers,
		// shared across that month's days; its first start-up months are reported as start-up costs.
		const rawExpenses=await pool.query(
			`WITH spread AS (
            SELECT expenses.amount_spent/expenses.spread_months AS share,
                (date_trunc('month',expenses.expense_date)+make_interval(months=>covered.month))::date AS month_start,
                covered.month<expenses.startup_months AS startup
            FROM expenses CROSS JOIN LATERAL generate_series(0,expenses.spread_months-1) AS covered(month)
            WHERE expenses.category IN ('Expense', 'Expenses') AND expenses.spread_months>1
        ), period_days AS (
            SELECT 'day'::text AS period,${datesql}::date AS day
            UNION ALL SELECT 'week',day_value::date FROM generate_series(date_trunc('week',${datesql}),date_trunc('week',${datesql})+INTERVAL '6 days',INTERVAL '1 day') AS day_value
            UNION ALL SELECT 'month',day_value::date FROM generate_series(date_trunc('month',${datesql}),date_trunc('month',${datesql})+INTERVAL '1 month - 1 day',INTERVAL '1 day') AS day_value
        ), daily AS (
            SELECT period_days.period,expenses.amount_spent AS amount,expenses.startup_months>0 AS startup,false AS spread
            FROM period_days JOIN expenses ON expenses.expense_date=period_days.day
            WHERE expenses.category IN ('Expense', 'Expenses') AND expenses.spread_months=1
            UNION ALL
            SELECT period_days.period,spread.share/EXTRACT(day FROM (spread.month_start+INTERVAL '1 month - 1 day')),spread.startup,true
            FROM period_days JOIN spread ON spread.month_start=date_trunc('month',period_days.day)::date
        )
        SELECT periods.period,
            COALESCE((SELECT SUM(amount) FROM daily WHERE daily.period=periods.period AND NOT daily.startup),0) AS total_spent,
            COALESCE((SELECT SUM(amount) FROM daily WHERE daily.period=periods.period AND daily.startup),0) AS startup_spent,
            COALESCE((SELECT SUM(amount) FROM daily WHERE daily.period=periods.period AND daily.spread AND NOT daily.startup),0) AS spread_spent
        FROM (VALUES ('day'),('week'),('month')) AS periods(period)`,
			param
		);
		const expenses=rawExpenses.rows;

		const rawPayroll=await pool.query(
			`SELECT 'day' AS period,
			COALESCE((SELECT SUM(total_salary_cost) FROM payroll
			WHERE payroll_month=date_trunc('month',${datesql})::date),0)
			/EXTRACT(day FROM (date_trunc('month',${datesql})+INTERVAL '1 month - 1 day')) AS payroll_cost
			UNION ALL
			SELECT 'week',COALESCE(SUM(
				(SELECT COALESCE(SUM(total_salary_cost),0) FROM payroll
				 WHERE payroll_month=date_trunc('month',day_value)::date)
				/EXTRACT(day FROM (date_trunc('month',day_value)+INTERVAL '1 month - 1 day'))
			),0)
			FROM generate_series(
				date_trunc('week',${datesql}),
				date_trunc('week',${datesql})+INTERVAL '6 days',
				INTERVAL '1 day'
			) AS day_value
			UNION ALL
			SELECT 'month',COALESCE(SUM(total_salary_cost),0)
			FROM payroll WHERE payroll_month=date_trunc('month',${datesql})::date`,
			param
		);
		const payrollByPeriod=Object.fromEntries(
			rawPayroll.rows.map(row => [row.period,Number(row.payroll_cost)||0])
		);

		const output={};

		// Processes each entry in the collection.
		production.forEach(row => {
			output[row.period]={
				production: {
					kernel_used: Number(row.kernel_used),
					pko_produced: Number(row.pko_produced),
					pkc_produced: Number(row.pkc_produced),
						sludge_produced: sludgeProductionByPeriod[row.period]||0,
                    // Kernel not recovered as weighed product, recorded at Finish Day for each production date.
                    production_loss: Number(row.production_loss),
					oil_yield: Number(row.oil_yield),
                        yield_status: yieldStates[row.period]?'Provisional':'Final'
				},
				sales: {},
				expenses: {},
				payroll_cost: payrollByPeriod[row.period]||0
			};
		});
		// Processes each entry in the collection.
		sales.forEach(row => {
			output[row.period].sales[row.name]={
				quantity_sold: Number(row.quantity_sold),
				average_unit_price: Number(row.average_unit_price),
				total_sales: Number(row.total_sales)
			};
		});

		// Processes each entry in the collection.
		expenses.forEach(row => {
			output[row.period].expenses={
				total_expenses: Number(row.total_spent),
				startup_costs: Number(row.startup_spent),
				// The part of total_expenses that comes from rent and other payments spread over several months.
				spread_expenses: Number(row.spread_spent)
			};
		});

		if(req.session.role!=='admin') {
			Object.values(output).forEach(period => {
				delete period.expenses;
				delete period.payroll_cost;
			});
			return res.status(200).json(output);
		}

		const costs=await calculateCosts();
		// Only invoiced goods are cost of goods sold; customer-weight shortfalls and manual write-offs are shown as losses.
		const invoicedShare=dispatch => dispatch.invoice_quantity===null||!dispatch.quantity_dispatched?1:
			Math.min(Math.max(dispatch.invoice_quantity/dispatch.quantity_dispatched,0),1);
		const businessDispatches=costs.product_dispatch_costs.filter(dispatch => dispatch.source_type!=='Manual');
		const dispatchPeriods=calculateDispatchPeriods(
			businessDispatches.map(dispatch => ({...dispatch,cost_of_dispatch:dispatch.cost_of_dispatch*invoicedShare(dispatch)})),
			selectedDate
		);
		const shortfallPeriods=calculateDispatchPeriods(
			businessDispatches.map(dispatch => ({...dispatch,cost_of_dispatch:dispatch.cost_of_dispatch*(1-invoicedShare(dispatch))})),
			selectedDate
		);
		// Raw materials spilled, disposed of or found short are stock losses too. They are placed in the helper's PKO slot only
		// so it can sort them into day, week and month; periodTotal below adds every slot together.
		const rawLosses=(costs.raw_material_losses||[]).map(loss => ({...loss,name:'PKO'}));
		const stockLossPeriods=Object.fromEntries(stockAdjustmentReasons.map(reason => [reason,calculateDispatchPeriods(
			[...costs.product_dispatch_costs.filter(dispatch => dispatch.source_type==='Manual'),...rawLosses]
				.filter(dispatch => (dispatch.adjustment_reason||'Other')===reason),
			selectedDate
		)]));
		output.day.cost_of_goods_sold=dispatchPeriods.day;

		output.week.cost_of_goods_sold=dispatchPeriods.week;

		output.month.cost_of_goods_sold=dispatchPeriods.month;

        const lossPeriods=calculateDispatchPeriods(costs.production_in_progress.map(day=>({
            dispatch_date:day.date,name:'PKO',cost_of_dispatch:day.loss_cost
        })),selectedDate);
		const periodGrossProfit={};
		for(let period in output) {
			const pkcPeriodSales=output[period].sales.PKC?.total_sales||0;
			const pkoPeriodSales=output[period].sales.PKO?.total_sales||0;
			const sludgePeriodSales=output[period].sales.Sludge?.total_sales||0;
			const periodExpenses=output[period].expenses.total_expenses+output[period].expenses.startup_costs;
			const periodPayroll=output[period].payroll_cost;
            const lossCost=lossPeriods[period].pko;
            output[period].production_loss_cost=lossCost;
            const periodTotal=periods => periods[period].pko+periods[period].pkc+periods[period].sludge;
            const shortfallCost=periodTotal(shortfallPeriods);
            output[period].delivery_shortfall_cost=shortfallCost;
            output[period].stock_loss_costs=Object.fromEntries(stockAdjustmentReasons.map(reason => [reason,periodTotal(stockLossPeriods[reason])]));
            const stockLossCost=Object.values(output[period].stock_loss_costs).reduce((total,cost) => total+cost,0);
            output[period].stock_loss_cost=stockLossCost;
            output[period].costing_provisional=true;
			const pkoPeriodCost=output[period].cost_of_goods_sold.pko;
			const pkcPeriodCost=output[period].cost_of_goods_sold.pkc;
			const sludgePeriodCost=output[period].cost_of_goods_sold.sludge;
			const pkoGrossProfit=pkoPeriodSales-pkoPeriodCost;
			const pkcGrossProfit=pkcPeriodSales-pkcPeriodCost;
			const sludgeGrossProfit=sludgePeriodSales-sludgePeriodCost;
			periodGrossProfit[period]={
				pko: pkoGrossProfit,
				pkc: pkcGrossProfit,
				sludge: sludgeGrossProfit
			};
			output[period].period_gross_profit=periodGrossProfit[period];
			const totalNetProfit=
				pkoGrossProfit+pkcGrossProfit+sludgeGrossProfit-
				shortfallCost-stockLossCost-periodExpenses-periodPayroll-lossCost;
			output[period].total_net_profit=totalNetProfit;
		}
		res.status(200).json(output);
	} catch(error) {
		console.log(error);
		res.status(500).json({
			err: "Failed to load dashboard period data"
		});
	}
});

// Groups product dispatch costs into reporting periods around the selected date.
function calculateDispatchPeriods(productDispatchCosts,selectedDate) {
	const selected=new Date(selectedDate+"T00:00:00");
	const weekStart=new Date(selected);
	weekStart.setDate(selected.getDate()-((selected.getDay()+6)%7));
	const weekEnd=new Date(weekStart);
	weekEnd.setDate(weekStart.getDate()+7);

	const dispatchPeriods={
		day: {
			pko: 0,
			pkc: 0,
			sludge: 0
		},
		week: {
			pko: 0,
			pkc: 0,
			sludge: 0
		},
		month: {
			pko: 0,
			pkc: 0,
			sludge: 0
		}
	};
	// Processes each entry in the collection.
	productDispatchCosts.forEach(dispatch => {
        if(dispatch.awaiting_invoice)return;
		const product=String(dispatch.name).trim().toLowerCase();
		if(!["pko","pkc","sludge"].includes(product)) {
			return;
		}
		const dispatchDate=new Date(dispatch.dispatch_date+"T00:00:00");
		const dispatchCost=Number(dispatch.cost_of_dispatch)||0;

		if(dispatch.dispatch_date===selectedDate) {
			dispatchPeriods.day[product]+=dispatchCost;
		}
		if(dispatchDate>=weekStart&&dispatchDate<weekEnd) {
			dispatchPeriods.week[product]+=dispatchCost;
		}
		if(
			dispatchDate.getFullYear()===selected.getFullYear()&&
			dispatchDate.getMonth()===selected.getMonth()
		) {
			dispatchPeriods.month[product]+=dispatchCost;
		}
	});
	return dispatchPeriods;
}

// Calculates inventory consistency checks from production, purchase, and sales data.
async function calculateChecks() {
    const result=await pool.query(`WITH expected AS (
        SELECT w.request_id,'Purchase'::text AS source_type,'Received'::text AS source_part,p.purchase_date AS day,
            p.item_id,p.quantity_supplied AS received,0::numeric AS issued,'purchases'::text AS related_source
        FROM purchases p JOIN weighing_requests w ON w.request_type='Purchase' AND w.completed_record_id=p.purchase_id AND w.status<>'Cancelled'
        UNION ALL SELECT w.request_id,'Sale','Issued',s.sales_date,s.item_id,0,COALESCE(s.factory_quantity,s.quantity),'sales'
        FROM sales s JOIN weighing_requests w ON w.request_type='Sale' AND w.completed_record_id=s.sales_id AND w.status<>'Cancelled'
        UNION ALL SELECT w.request_id,'Production',
            v.part||CASE WHEN d.day=w.request_date THEN '' ELSE '@'||to_char(d.day,'YYYY-MM-DD') END,
            d.day,i.item_id,v.received,v.issued,'production'
        FROM production p JOIN weighing_requests w ON w.request_type='Production' AND w.completed_record_id=p.production_id AND w.status<>'Cancelled'
        CROSS JOIN LATERAL (
            SELECT COALESCE(pb.movement_date,w.request_date) AS day,SUM(pb.kernel_used) AS kernel_used,
                SUM(pb.pko_produced) AS pko_produced,SUM(pb.pkc_produced) AS pkc_produced,SUM(pb.sludge_produced) AS sludge_produced
            FROM production_batches pb WHERE pb.request_id=w.request_id AND NOT pb.voided
            GROUP BY COALESCE(pb.movement_date,w.request_date)
            UNION ALL SELECT p.production_date,p.kernel_used,p.pko_produced,p.pkc_produced,p.sludge_produced
            WHERE NOT EXISTS(SELECT 1 FROM production_batches pb WHERE pb.request_id=w.request_id)
        ) d
        CROSS JOIN LATERAL (VALUES ('p kernel','Kernel Issued',0::numeric,d.kernel_used),
            ('pko','PKO Received',d.pko_produced,0),('pkc','PKC Received',d.pkc_produced,0),('sludge','Sludge Received',d.sludge_produced,0)) v(name,part,received,issued)
        JOIN items i ON LOWER(i.name)=v.name
    ) SELECT to_char(COALESCE(e.day,sc.count_date),'YYYY-MM-DD') AS check_date,
        COALESCE(i.name,actual_item.name) AS item,COALESCE(e.related_source,CASE sc.source_type WHEN 'Purchase' THEN 'purchases' WHEN 'Sale' THEN 'sales' ELSE 'production' END) AS related_source,
        CASE WHEN e.source_type='Purchase' THEN LOWER(i.name)||'_received_vs_purchased'
             WHEN e.source_type='Sale' THEN LOWER(i.name)||'_issued_vs_sold'
             WHEN e.source_part LIKE 'Kernel Issued%' THEN 'kernel_issued_vs_used' ELSE LOWER(i.name)||'_received_vs_produced' END AS check_type,
        COALESCE(sc.received,0)+COALESCE(sc.issued,0) AS storekeeper_says,
        COALESCE(e.received,0)+COALESCE(e.issued,0) AS manager_says,
        COALESCE(sc.received,0)+COALESCE(sc.issued,0)-COALESCE(e.received,0)-COALESCE(e.issued,0) AS difference,
        e.request_id,CASE WHEN sc.item_id IS DISTINCT FROM e.item_id THEN 'Item or stock entry does not match'
            WHEN sc.count_date IS DISTINCT FROM e.day THEN 'Inventory date does not match' ELSE 'Quantity does not match' END AS detail
        FROM expected e FULL JOIN (SELECT * FROM stock_counts WHERE source_type<>'Manual') sc
            ON sc.source_id=e.request_id AND sc.source_type=e.source_type AND sc.source_part=e.source_part
        LEFT JOIN items i ON i.item_id=e.item_id LEFT JOIN items actual_item ON actual_item.item_id=sc.item_id
        WHERE ((e.request_id IS NULL AND sc.received+sc.issued<>0) OR COALESCE(sc.received,0)<>e.received OR COALESCE(sc.issued,0)<>e.issued
            OR (e.request_id IS NOT NULL AND sc.count_id IS NOT NULL AND (sc.item_id<>e.item_id OR sc.count_date<>e.day))
            OR (sc.count_id IS NULL AND e.received+e.issued>0))
        ORDER BY check_date,item`);
    return result.rows;
}

// Handles GET /api/checks requests.
router.get("/api/checks",requireRole(['admin']),async function(req,res) {
	try {
		const checks=await calculateChecks();
		res.status(200).json(checks);
	} catch(error) {
		console.log(error);
		res.status(500).json({
			err: "Could not load checks"
		});
	}
});

module.exports={router,calculateCosts,calculateChecks};
