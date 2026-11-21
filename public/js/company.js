// Company details: showing the company's details and logo, and the Director's form for changing them.
// Moved from forms.js unchanged. Loaded on forms.html after forms.js, whose shared page elements and helpers it uses;
// page scripts share their top-level names, so forms.js and the other files call these functions directly.

// Displays a company logo path or the building fallback when no logo is stored.
function displayCompanyLogo(logoPath) {
	if(!companyLogoPreview||!companyLogoFallback) return;
	if(logoPath) {
		companyLogoPreview.src=logoPath;
		companyLogoPreview.hidden=false;
		companyLogoFallback.hidden=true;
	} else {
		companyLogoPreview.removeAttribute('src');
		companyLogoPreview.hidden=true;
		companyLogoFallback.hidden=false;
	}
}

// Fills every company field with the values returned by the company API.
function populateCompanyForm(company) {
	currentCompanyDetails=company;
	const fieldNames=[
		'company_name',
		'registration_number',
		'tax_identification_number',
		'phone_number',
		'email',
		'website',
		'business_address',
		'bank_name',
		'account_number',
		'account_name'
	];
	// Copies each stored value into its matching company form control.
	fieldNames.forEach((fieldName) => {
		companyForm.elements[fieldName].value=company[fieldName]||'';
	});
	removeCompanyLogoValue.value='false';
	companyLogoInput.value='';
	displayCompanyLogo(company.logo_path);
}

// Enables or disables all company controls when entering or leaving edit mode.
function setCompanyEditMode(isEditing) {
	const editableFields=companyForm.querySelectorAll(
		'input:not([type="hidden"]), textarea'
	);
	// Applies the selected edit state to every editable company field.
	editableFields.forEach((field) => {
		field.disabled=!isEditing;
	});
	removeCompanyLogoBtn.disabled=!isEditing;
	editCompanyBtn.hidden=
		isEditing||document.documentElement.dataset.userRole!=='admin';
	companyForm.querySelector('.company-form-actions').hidden=!isEditing;
	companyForm.classList.toggle('is-editing',isEditing);
}

// Fetches the singleton company profile and displays it in read-only mode.
async function loadCompanyDetails() {
	if(!companyForm) return;
	try {
		const response=await fetch('/api/company');
		if(!response.ok) {
			throw new Error('Could not load company details');
		}
		const company=await response.json();
		populateCompanyForm(company);
		setCompanyEditMode(false);
	} catch(error) {
		console.error(error);
	}
}

// Saves edited company information and an optional replacement logo.
async function saveCompanyDetails(event) {
	event.preventDefault();
	try {
		const companyDetails=new FormData(companyForm);
		const response=await fetch('/api/company',{
			method: 'PATCH',
			body: companyDetails
		});
		if(!response.ok) {
			const problem=await response.json();
			appNotify(problem.err||'Could not update company details');
			return;
		}
		const company=await response.json();
		populateCompanyForm(company);
		setCompanyEditMode(false);
		appNotify('Company details updated successfully');
	} catch(error) {
		console.error(error);
		appNotify('Could not update company details. Please try again.');
	}
}

// Connects the company edit, cancel, logo preview, removal, and save controls.
function companyFormBtns() {
	if(!companyForm) return;
	companyForm.addEventListener('submit',saveCompanyDetails);
	editCompanyBtn.addEventListener('click',() => {
		setCompanyEditMode(true);
	});
	cancelCompanyEditBtn.addEventListener('click',() => {
		populateCompanyForm(currentCompanyDetails);
		setCompanyEditMode(false);
	});
	companyLogoInput.addEventListener('change',() => {
		const selectedLogo=companyLogoInput.files[0];
		if(!selectedLogo) {
			displayCompanyLogo(currentCompanyDetails.logo_path);
			return;
		}
		removeCompanyLogoValue.value='false';
		displayCompanyLogo(URL.createObjectURL(selectedLogo));
	});
	removeCompanyLogoBtn.addEventListener('click',() => {
		companyLogoInput.value='';
		removeCompanyLogoValue.value='true';
		displayCompanyLogo(null);
	});
	companyLogoPreview.addEventListener('error',() => {
		companyLogoPreview.hidden=true;
		companyLogoFallback.hidden=false;
	});
}

companyFormBtns();
