// Employees, salary history, employment status and payroll.
// Moved from server.js unchanged; server.js mounts this router where the routes used to be.
const {pool}=require('../db');
const {requireRole}=require('../auth');
const {markPayrollReview,preparePayroll}=require('../dependency-services');
const {employeePhotoUpload,removeUploadedEmployeePhoto}=require('../uploads');
const router=require('express').Router();

// Returns employee records used to build the employee cards.
router.get('/api/employees',requireRole(['admin','manager']),function(req,res) {
	pool.query(
		`SELECT
		employee_id,
		TO_CHAR(start_date,'YYYY-MM-DD') AS start_date,
		name,
		phone_number,
		address,
		email,
		role,
        COALESCE((SELECT h.new_salary FROM salary_history h WHERE h.employee_id=employees.employee_id AND h.effective_date<=CURRENT_DATE ORDER BY h.effective_date DESC,h.salary_history_id DESC LIMIT 1),salary) AS salary,
		note,
		department,
        COALESCE((SELECT c.status FROM employment_period_changes c WHERE c.employee_id=employees.employee_id AND c.effective_date<=CURRENT_DATE ORDER BY c.effective_date DESC,c.change_id DESC LIMIT 1),status) AS status,
		TO_CHAR(inactive_date,'YYYY-MM-DD') AS inactive_date,
		username,
		permissions,
		photo_path,
		created_at
		FROM employees
		ORDER BY start_date DESC, employee_id DESC`,
		// Sends the stored employee records to the employee page.
		function(error,result) {
			if(error) {
				console.error(error);
				return res.status(500).json({
					err: 'Could not load employee details'
				});
			}
			return res.status(200).json(result.rows);
		}
	);
});

// Validates and saves an employee record with an optional passport photograph.
router.post('/api/employees',requireRole(['admin']),function(req,res) {
	employeePhotoUpload.single('photo')(req,res,async function(uploadError) {
		if(uploadError) {
			const message=uploadError.code==='LIMIT_FILE_SIZE'?
				'Employee photograph must not exceed 2 MB':
				uploadError.message;
			return res.status(400).json({ err: message });
		}

		const employee=req.body;
		if(
			!employee.start_date||
			!employee.name||
			!employee.phone||
			!employee.address||
			!employee.role
		) {
			removeUploadedEmployeePhoto(req.file);
			return res.status(400).json({
				err: 'Complete all required employee fields'
			});
		}

		const photoPath=req.file?
			'/images/employees/'+req.file.filename:
			null;

		try {
			const client=await pool.connect();
			try {
				await client.query('BEGIN');
				const result=await client.query(
				`INSERT INTO employees (
				start_date,
				name,
				phone_number,
				address,
				email,
				role,
				salary,
				note,
				photo_path
				)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
				RETURNING employee_id,photo_path`,
				[
					employee.start_date,
					employee.name.trim(),
					employee.phone.trim(),
					employee.address.trim(),
					employee.email? employee.email.trim():null,
					employee.role.trim(),
					employee.salary||null,
					employee.note? employee.note.trim():null,
					photoPath
				]
				);
                await client.query("INSERT INTO employment_period_changes(employee_id,effective_date,status) VALUES ($1,$2,'Active')",[result.rows[0].employee_id,employee.start_date]);
				if(employee.salary) {
					await client.query(
						`INSERT INTO salary_history
						(employee_id,previous_salary,new_salary,effective_date,reason,changed_by)
						VALUES ($1,NULL,$2,$3,'Initial salary',$4)`,
						[result.rows[0].employee_id,employee.salary,employee.start_date,req.session.user_id]
					);
				}
				await client.query('COMMIT');
				return res.status(201).json(result.rows[0]);
			} catch(error) {
				await client.query('ROLLBACK');
				throw error;
			} finally {
				client.release();
			}
		} catch(error) {
			removeUploadedEmployeePhoto(req.file);
			console.error(error);
			return res.status(500).json({
				err: 'Could not save employee details'
			});
		}
	});
});

// Returns the complete agreed-salary history for one employee.
router.get('/api/employees/:id/salary-history',requireRole(['admin','manager']),async function(req,res) {
	try {
		const result=await pool.query(
			`SELECT salary_history_id,previous_salary,new_salary,
			TO_CHAR(effective_date,'YYYY-MM-DD') AS effective_date,reason,created_at
			FROM salary_history WHERE employee_id=$1
			ORDER BY effective_date DESC,salary_history_id DESC`,
			[req.params.id]
		);
		return res.json(result.rows);
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not load salary history' });
	}
});

// Changes an employee's agreed salary while preserving the previous amount.
router.post('/api/employees/:id/salary-history',requireRole(['admin']),async function(req,res) {
	const employeeId=Number(req.params.id);
	const newSalary=Number(req.body.new_salary);
	const effectiveDate=String(req.body.effective_date||'');
	const reason=String(req.body.reason||'').trim();
	if(!Number.isInteger(employeeId)||employeeId<1||!Number.isFinite(newSalary)||newSalary<=0||!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)||!reason) {
		return res.status(400).json({ err: 'Enter the new salary, effective date and reason' });
	}
	const client=await pool.connect();
	try {
		await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(91001)');
		const employee=await client.query(
			'SELECT salary FROM employees WHERE employee_id=$1 FOR UPDATE',
			[employeeId]
		);
		if(employee.rowCount===0) {
			await client.query('ROLLBACK');
			return res.status(404).json({ err: 'Employee not found' });
		}
		await client.query(
			`INSERT INTO salary_history
			(employee_id,previous_salary,new_salary,effective_date,reason,changed_by)
			VALUES ($1,$2,$3,$4,$5,$6)`,
			[employeeId,employee.rows[0].salary,newSalary,effectiveDate,reason,req.session.user_id]
		);
		await client.query(`UPDATE employees SET salary=COALESCE((SELECT h.new_salary FROM salary_history h
            WHERE h.employee_id=$1 AND h.effective_date<=CURRENT_DATE ORDER BY h.effective_date DESC,h.salary_history_id DESC LIMIT 1),salary)
            WHERE employee_id=$1`,[employeeId]);
        await markPayrollReview(client,employeeId,effectiveDate);
		await client.query('COMMIT');
		return res.json({ message: 'Salary changed successfully' });
	} catch(error) {
		await client.query('ROLLBACK');
		console.error(error);
		return res.status(500).json({ err: 'Could not change salary' });
	} finally {
		client.release();
	}
});

// Marks an employee as active or inactive using the administrator's effective date.
router.patch('/api/employees/:id/status',requireRole(['admin']),async function(req,res) {
	const employeeId=Number(req.params.id);
	const status=String(req.body.status||'');
	const effectiveDate=String(req.body.effective_date||'');
	if(
		!Number.isInteger(employeeId)||employeeId<1||
		!['Active','Inactive'].includes(status)||
		((status==='Inactive'||effectiveDate)&&!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate))
	) {
		return res.status(400).json({ err: 'Choose a valid employee status and date' });
	}
    const client=await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(91001)');
        const employee=await client.query('SELECT * FROM employees WHERE employee_id=$1 FOR UPDATE',[employeeId]);
        if(!employee.rowCount) { await client.query('ROLLBACK');return res.status(404).json({err:'Employee not found'}); }
        const date=effectiveDate||new Date().toISOString().slice(0,10);
        await client.query(`INSERT INTO employment_period_changes(employee_id,effective_date,status)
            VALUES($1,CASE WHEN $3::varchar='Inactive' THEN $2::date+1 ELSE $2::date END,$3::varchar)
            ON CONFLICT(employee_id,effective_date) DO UPDATE SET status=EXCLUDED.status`,[employeeId,date,status]);
        const result=await client.query(`UPDATE employees SET status=$1::varchar,
            inactive_date=CASE WHEN $1::varchar='Inactive' THEN $2::date ELSE NULL END WHERE employee_id=$3 RETURNING employee_id,status,inactive_date`,[status,date,employeeId]);
        await markPayrollReview(client,employeeId,date);
        await client.query('COMMIT');
        return res.json(result.rows[0]);
    } catch(error) { await client.query('ROLLBACK');console.error(error);return res.status(500).json({err:'Could not change employee status'}); }
    finally {client.release();}
});

// Loads payroll records for a selected month.
router.get('/api/payroll',requireRole(['admin']),async function(req,res) {
	const month=String(req.query.month||'');
	if(!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ err: 'Choose a payroll month' });
	try {
		const result=await pool.query(
			`SELECT payroll.payroll_id,payroll.employee_id,employees.name,
			payroll.basic_salary,payroll.bonus,payroll.deduction,payroll.total_salary_cost,
			payroll.needs_review,payroll.payment_status,TO_CHAR(payroll.payment_date,'YYYY-MM-DD') AS payment_date
			FROM payroll INNER JOIN employees ON employees.employee_id=payroll.employee_id
			WHERE payroll.payroll_month=$1::date ORDER BY employees.name`,
			[month+'-01']
		);
		return res.json(result.rows);
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not load payroll' });
	}
});

// Creates missing monthly payroll records using each employee's current salary.
router.post('/api/payroll/generate',requireRole(['admin']),async function(req,res) {
	const month=String(req.body.month||'');
	if(!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ err: 'Choose a payroll month' });
    try {return res.status(200).json(await preparePayroll(pool,month));}
    catch(error) {console.error(error);return res.status(500).json({err:'Could not prepare payroll'});}
});

// Saves payroll adjustments and payment information.
router.patch('/api/payroll/:id',requireRole(['admin']),async function(req,res) {
	const payrollId=Number(req.params.id);
	const bonus=Number(req.body.bonus);
	const deduction=Number(req.body.deduction);
	const status=String(req.body.payment_status||'');
	const paymentDate=req.body.payment_date||null;
	if(!Number.isInteger(payrollId)||payrollId<1||!Number.isFinite(bonus)||bonus<0||!Number.isFinite(deduction)||deduction<0||!['Pending','Paid'].includes(status)||(status==='Paid'&&!paymentDate)||
		(paymentDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)||!Number.isFinite(Date.parse(paymentDate+'T00:00:00Z'))||new Date(paymentDate+'T00:00:00Z').toISOString().slice(0,10)!==paymentDate))) {
		return res.status(400).json({ err: 'Check the payroll values and payment date' });
	}
	try {
		// Paid salaries are locked so a saved payment cannot be changed or reopened by mistake.
		const result=await pool.query(
			`UPDATE payroll SET bonus=$1,deduction=$2,
			total_salary_cost=GREATEST(basic_salary+$1-$2,0),payment_status=$3,payment_date=$4
			WHERE payroll_id=$5 AND NOT needs_review AND payment_status<>'Paid' RETURNING *`,
			[bonus,deduction,status,paymentDate,payrollId]
		);
		if(result.rowCount===0) return res.status(409).json({err:'Payroll is missing, already paid, or needs review. Paid salaries are locked; recalculate unpaid payroll before saving.'});
		return res.json(result.rows[0]);
	} catch(error) {
		console.error(error);
		return res.status(500).json({ err: 'Could not save payroll' });
	}
});

module.exports={router};
