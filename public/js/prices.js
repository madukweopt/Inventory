// Prices page: the current price of each product, its price history, and the Director's form for setting a new price.
// Moved from forms.js unchanged. Loaded on forms.html after forms.js, whose shared page elements and helpers it uses;
// page scripts share their top-level names, so forms.js and the other files call these functions directly.

// Loads every product and its dated price history onto the Prices page.
async function loadPrices() {
	if(!priceCards) return;
	priceCards.textContent='Loading product prices...';
	try {
		const [itemsResponse,pricesResponse]=await Promise.all([
			fetch('/api/items'),fetch('/api/prices')
		]);
		if(!itemsResponse.ok||!pricesResponse.ok) throw new Error('Price records could not be loaded');
		const items=await itemsResponse.json();
		const prices=await pricesResponse.json();
		const products=items.filter(item => item.item_type==='product');
		const selectedProduct=priceProduct?priceProduct.value:'';
		if(priceProduct) {
			priceProduct.replaceChildren(new Option('Select a product',''));
			priceProduct.firstElementChild.disabled=true;
			products.forEach(item => priceProduct.add(new Option(item.name,item.item_id)));
			priceProduct.value=selectedProduct;
		}
		priceCards.replaceChildren();
		const today=new Date().toISOString().slice(0,10);
		products.forEach(product => {
			const history=prices.filter(record => String(record.item_id)===String(product.item_id));
			const current=history.find(record => record.effective_date<=today);
			const priceUnit=inventoryUnit(product.name);
			const card=document.createElement('article');
			card.className='price-card';
			const heading=document.createElement('div');
			heading.className='price-card-heading';
			const title=document.createElement('h2');
			title.textContent=product.name;
			const currentDisplay=document.createElement('div');
			currentDisplay.className='price-current';
			const currentPrice=document.createElement('strong');
			// The figure and its unit are separate, so a long price can put "/kg" on its own line instead of overflowing.
			if(current) {
				const amount=document.createElement('span');
				amount.textContent='₦'+formatNumber(current.unit_price);
				const unit=document.createElement('span');
				unit.textContent='/'+priceUnit;
				currentPrice.append(amount,unit);
			} else {
				currentPrice.className='price-missing';
				currentPrice.textContent='No current price';
			}
			const currentStatus=document.createElement('span');
			currentStatus.className='price-status '+(current?'current':'not-set');
			currentStatus.textContent=current?'Current':'Not set';
			currentDisplay.append(currentPrice,currentStatus);
			heading.append(title,currentDisplay);
			const list=document.createElement('div');
			list.className='price-history';
			list.hidden=true;
			if(history.length===0) {
				const empty=document.createElement('p');
				empty.textContent='No price has been saved for this product.';
				list.appendChild(empty);
			} else {
				history.forEach((record,index) => {
					const row=document.createElement('p');
					const date=document.createElement('span');
					const details=document.createElement('span');
					const amount=document.createElement('b');
					const status=document.createElement('small');
					const recordStatus=record.effective_date>today?'Upcoming':
						(history.slice(0,index).some(entry => entry.effective_date<=today)?'Previous':'Current');
					date.textContent=(record.effective_date>today?'Starts ':'From ')+formatDate(record.effective_date);
					amount.textContent='₦'+formatNumber(record.unit_price)+'/'+priceUnit;
					status.className='price-status '+recordStatus.toLowerCase();
					status.textContent=recordStatus;
					details.append(amount,status);
					row.append(date,details);
					list.appendChild(row);
				});
			}
			const historyButton=document.createElement('button');
			historyButton.type='button';
			historyButton.className='price-history-button';
			historyButton.textContent='View Price History';
			historyButton.disabled=history.length===0;
			historyButton.addEventListener('click',function() {
				list.hidden=!list.hidden;
				historyButton.classList.toggle('is-open',!list.hidden);
				historyButton.textContent=list.hidden?'View Price History':'Hide Price History';
			});
			card.append(heading,historyButton,list);
            if(window.styleReferencePrice)window.styleReferencePrice(card,product);
			priceCards.appendChild(card);
		});
		if(products.length===0) priceCards.textContent='No saleable products were found.';
	} catch(error) {
		console.error(error);
		priceCards.textContent='Product prices could not be loaded.';
	}
}

// Saves a new dated product price and refreshes the visible price history.
async function saveProductPrice(event) {
	event.preventDefault();
	priceMessage.textContent='Saving price...';
	try {
		const response=await fetch('/api/prices',{
			method: 'POST',
			headers: { 'content-type':'application/json' },
			body: JSON.stringify({
				item_id: priceProduct.value,
				unit_price: priceAmount.value,
				effective_date: priceEffectiveDate.value
			})
		});
		const result=await response.json();
		if(!response.ok) {
			priceMessage.textContent=result.err||'The price could not be saved.';
			return;
		}
		priceMessage.textContent='Price saved successfully.';
		priceAmount.value='';
		priceForm.hidden=true;
		await loadPrices();
	} catch(error) {
		console.error(error);
		priceMessage.textContent='The price could not be saved.';
	}
}

if(priceForm) {
	priceEffectiveDate.value=new Date().toISOString().slice(0,10);
	priceForm.addEventListener('submit',saveProductPrice);
}

if(openPriceFormBtn) {
	// Reveals the price form only when the administrator chooses to add a price.
	openPriceFormBtn.addEventListener('click',function() {
		priceForm.hidden=false;
		priceProduct.focus();
	});
}

if(cancelPriceFormBtn) {
	// Closes the price form without changing any saved price.
	cancelPriceFormBtn.addEventListener('click',function() {
		priceForm.hidden=true;
		priceMessage.textContent='';
	});
}
