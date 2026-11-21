// Company details and logo.
// Moved from server.js unchanged; server.js mounts this router where the routes used to be.
const {pool}=require('../db');
const {requireRole}=require('../auth');
const {companyLogoUpload,removeUploadedEmployeePhoto}=require('../uploads');
const router=require('express').Router();

// Returns the company profile displayed on the company details page.
router.get('/api/company',requireRole(['admin','manager','storekeeper']),async function(req,res) {
	try {
		const result=await pool.query(
			'SELECT * FROM company_details WHERE company_id=1'
		);
		return res.status(200).json(result.rows[0]);
	} catch(error) {
		console.error(error);
		return res.status(500).json({
			err: 'Could not load company details'
		});
	}
});

// Updates every editable company field and optionally replaces or removes the logo.
router.patch('/api/company',requireRole(['admin']),function(req,res) {
	companyLogoUpload.single('logo')(req,res,async function(uploadError) {
		if(uploadError) {
			const message=uploadError.code==='LIMIT_FILE_SIZE'?
				'Company logo must not exceed 2 MB':
				uploadError.message;
			return res.status(400).json({ err: message });
		}

		const company=req.body;
		if(!company.company_name||!company.company_name.trim()) {
			removeUploadedEmployeePhoto(req.file);
			return res.status(400).json({ err: 'Company name is required' });
		}

		try {
			const currentResult=await pool.query(
				'SELECT logo_path FROM company_details WHERE company_id=1'
			);
			const currentLogo=currentResult.rows[0]? currentResult.rows[0].logo_path:null;
			let logoPath=currentLogo;
			if(company.remove_logo==='true') {
				logoPath=null;
			} else if(req.file) {
				logoPath='/images/company/'+req.file.filename;
			}

			// A new database has no company record yet: the first save creates it, later saves update it.
			const result=await pool.query(
				`INSERT INTO company_details
				(company_id,company_name,registration_number,tax_identification_number,phone_number,email,website,
				business_address,bank_name,account_number,account_name,logo_path,updated_at)
				VALUES (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP)
				ON CONFLICT (company_id) DO UPDATE SET
				company_name=EXCLUDED.company_name,
				registration_number=EXCLUDED.registration_number,
				tax_identification_number=EXCLUDED.tax_identification_number,
				phone_number=EXCLUDED.phone_number,
				email=EXCLUDED.email,
				website=EXCLUDED.website,
				business_address=EXCLUDED.business_address,
				bank_name=EXCLUDED.bank_name,
				account_number=EXCLUDED.account_number,
				account_name=EXCLUDED.account_name,
				logo_path=EXCLUDED.logo_path,
				updated_at=CURRENT_TIMESTAMP
				RETURNING *`,
				[
					company.company_name.trim(),
					company.registration_number? company.registration_number.trim():null,
					company.tax_identification_number? company.tax_identification_number.trim():null,
					company.phone_number? company.phone_number.trim():null,
					company.email? company.email.trim():null,
					company.website? company.website.trim():null,
					company.business_address? company.business_address.trim():null,
					company.bank_name? company.bank_name.trim():null,
					company.account_number? company.account_number.trim():null,
					company.account_name? company.account_name.trim():null,
					logoPath
				]
			);

            // Retain old logos: issued invoices may still reference them.

			return res.status(200).json(result.rows[0]);
		} catch(error) {
			removeUploadedEmployeePhoto(req.file);
			console.error(error);
			return res.status(500).json({ err: 'Could not update company details' });
		}
	});
});

module.exports={router};
