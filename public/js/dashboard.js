const dateInput=document.querySelector("#dashboard-date");
const today=document.querySelector(".today");
const stockPanel=document.querySelector("#stock-panel");

// Fit complete quantities to each grid cell, including when the viewport changes.
const dashboardNumberObserver=new ResizeObserver(entries=>{
    entries.forEach(({target})=>{
        target.style.removeProperty('font-size');
        const available=target.clientWidth;
        if(!available)return;
        const range=document.createRange();range.selectNodeContents(target);
        const needed=range.getBoundingClientRect().width;
        if(needed>available){
            const size=parseFloat(getComputedStyle(target).fontSize);
            target.style.setProperty('font-size',(Math.floor(size*available/needed*10)/10)+'px','important');
        }
    });
});
// Adjusts dashboard number sizing to fit long values.
function sizeDashboardNumber(element,value) {
    dashboardNumberObserver.observe(element);
	const digits=Math.trunc(Math.abs(Number(value))).toString().length;
	if(digits>=7) {
		element.classList.add("number-small");
	} else if(digits>=5) {
		element.classList.add("number-medium");
	}
}

// Loads and displays stock levels.
async function showStockLevels() {
	try {
		const selectedDate=dateInput.value;
		const response=await fetch("/api/dashboard?date="+selectedDate);
		const stockLevels=await response.json();
		const stockGrid=document.querySelector(".stock-grid");
		stockGrid.innerHTML="";

		// Processes each entry in the collection.
		stockLevels.forEach(row => {
			const stockCard=document.createElement("article");
			const stockBadge=document.createElement("span");
			const stockDetails=document.createElement("div");
			const stockName=document.createElement("span");
			const stockQuantity=document.createElement("strong");
			const stockUnit=document.createElement("small");

			stockCard.classList.add("stock-card");
			stockBadge.classList.add("stock-badge");
			stockDetails.classList.add("stock-details");
			stockName.classList.add("stock-name");
			stockQuantity.classList.add("stock-quantity");
			stockUnit.classList.add("stock-unit");

			stockCard.dataset.product=row.item.toLowerCase().replaceAll(' ','-');
            stockQuantity.classList.toggle('negative',Number(row.remaining)<0);
            stockQuantity.textContent=Number(row.remaining).toLocaleString(
				"en-NG",
				{
					minimumFractionDigits: 2,
					maximumFractionDigits: 2
				}
			);
			sizeDashboardNumber(stockQuantity,row.remaining);
			stockName.textContent=row.item;

			if(stockName.textContent==="PKC") {
				stockBadge.textContent="PKC";
				stockUnit.textContent="kg";
			} else if(stockName.textContent==="P Kernel") {
				stockBadge.textContent="PK";
				stockUnit.textContent="kg";
			} else if(stockName.textContent==="PKO") {
				stockBadge.textContent="PKO";
				stockUnit.textContent="kg";
			} else if(stockName.textContent==="Diesel") {
				stockBadge.textContent="DL";
				stockUnit.textContent="L";
			} else if(stockName.textContent==="Electricity") {
				stockCard.classList.add("electricity");
				stockBadge.textContent="EL";
				stockUnit.textContent="kWh";
			} else if(stockName.textContent==="Sludge") {
				stockCard.classList.add("sludge");
				stockBadge.textContent="SLG";
				stockUnit.textContent="kg";
			}

			const productIcon={'Electricity':'electricity','PKC':'sack','PKO':'oil','Sludge':'flask','Diesel':'fuel','P Kernel':'seed'}[row.item]||'cubes';
            stockBadge.replaceChildren(AppUI.icon(productIcon));
            stockDetails.append(stockName,stockQuantity,stockUnit);
			stockCard.appendChild(stockBadge);
			stockCard.appendChild(stockDetails);
			stockGrid.appendChild(stockCard);
		});

		const panelHead=document.querySelector(".panel-head");
		const stockCaption=document.querySelector("#stock-caption");
		stockCaption.textContent=`Closing, ${selectedDate}`;
		panelHead.appendChild(stockCaption);

		const periodTabs=document.querySelector("#period-tabs");
		periodTabs.firstElementChild.classList.add("active");
	} catch(error) {
		console.log("unable to display stock levels");
	}
}

if(dateInput) {
	dateInput.valueAsDate=new Date();
	const showToday=dateInput.value;

	// Updates date label.
	function updateDateLabel() {
		if(dateInput.value===showToday) {
			today.textContent="Today";
		} else {
			today.textContent="Showing";
		}
	}
	dateInput.addEventListener("change",updateDateLabel);
	dateInput.addEventListener("change",showStockLevels);
	updateDateLabel();
	showStockLevels();

	// Loads and displays period production.
	async function showPeriodProduction(period) {
		const user=await window.currentUserPromise;
		if(!user||user.role==='storekeeper') return;
		const selectedDate=dateInput.value;
		const RawPeriods=await fetch(
			"/api/dashboard_period?date="+selectedDate
		);
		const periods=await RawPeriods.json();
		const production=periods[period].production;
		const prodGrid=document.querySelector(".prod-grid");
		prodGrid.innerHTML="";

		// Processes each entry in the collection.
		Object.entries(production).forEach(function([name,value]) {
			if(name==="oil_yield") {
				return;
			}
			const prodCard=document.createElement("article");
			const prodDetails=document.createElement("div");
			const prodName=document.createElement("span");
			const prodQuantity=document.createElement("strong");
			const prodUnit=document.createElement("small");

			prodCard.classList.add("stock-card");
            prodCard.dataset.product=name.toLowerCase();
            const badge=document.createElement('span');badge.className='stock-badge';
            badge.appendChild(AppUI.icon(/kernel/.test(name)?'seed':/pko/.test(name)?'oil':/pkc/.test(name)?'sack':'flask'));
            prodCard.appendChild(badge);
			prodDetails.classList.add("stock-details");
			prodName.classList.add("stock-name");
			prodQuantity.classList.add("stock-quantity");
			prodUnit.classList.add("stock-unit");

			prodQuantity.textContent=Number(value).toLocaleString("en-NG",{
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			});
			sizeDashboardNumber(prodQuantity,value);
			prodName.textContent=name.replace("_"," ");
			prodUnit.textContent="kg";

			prodDetails.append(prodName,prodQuantity,prodUnit);
			prodCard.appendChild(prodDetails);
			prodGrid.appendChild(prodCard);
		});
		const oilYield=document.querySelector("#oil-yield");
		oilYield.textContent=
			Number(production.oil_yield).toLocaleString("en-NG",{
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			})+"%";
        let yieldStatus=document.querySelector('#oil-yield-status');
        if(!yieldStatus){yieldStatus=document.createElement('small');yieldStatus.id='oil-yield-status';oilYield.after(yieldStatus);}
        yieldStatus.textContent=production.yield_status||'';
	}
	// Loads and displays period profit.
	async function showPeriodProfit(period) {
		const user=await window.currentUserPromise;
		if(!user||user.role!=='admin') return;
		const profitList=document.querySelector("#profit-list");
		const profitCaption=document.querySelector("#profit-caption");
		if(!profitList) return;

		try {
			const selectedDate=dateInput.value;
			const response=await fetch(
				"/api/dashboard_period?date="+encodeURIComponent(selectedDate)
			);
			if(!response.ok) throw new Error("Could not load profit figures");

			const periods=await response.json();
			const profit=periods[period];
			if(!profit)
				throw new Error("Profit data is missing for "+period);

			const grossProfit=profit.period_gross_profit||{};
			const currency=new Intl.NumberFormat("en-NG",{
				style: "currency",
				currency: "NGN",
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			});

			profitList.innerHTML="";
			const cards=document.createElement("div");
			cards.classList.add("profit-cards");

			[
				{
					name: "PKO",
					key: "pko",
					className: "pko"
				},
				{
					name: "PKC",
					key: "pkc",
					className: "pkc"
				},
				{
					name: "Sludge",
					key: "sludge",
					className: "sludge"
				}
			// Processes each entry in the collection.
			].forEach(product => {
				const salesAmount=Number(
					profit.sales[product.name]?.total_sales
				)||0;
				const costAmount=Number(
					profit.cost_of_goods_sold?.[product.key]
				)||0;
				const grossAmount=Number(grossProfit[product.key])||0;
				const margin=salesAmount!==0?
					(grossAmount/salesAmount)*100:0;
				const card=document.createElement("article");
				const heading=document.createElement("header");
				const badge=document.createElement("span");
				const name=document.createElement("span");
				const metrics=document.createElement("div");

				card.classList.add("profit-card",product.className);
				heading.classList.add("profit-product-heading");
				badge.classList.add("profit-badge");
				name.classList.add("profit-label");
				metrics.classList.add("profit-metrics");

				badge.appendChild(AppUI.icon(product.key==='pko'?'oil':product.key==='pkc'?'sack':'flask'));
				name.textContent=product.name;
				heading.append(badge,name);

				[
					["Sales",currency.format(salesAmount)],
					["Cost of products sold",currency.format(costAmount)],
					["Gross profit",currency.format(grossAmount)],
					["Profit margin",margin.toLocaleString("en-NG",{
						minimumFractionDigits: 1,
						maximumFractionDigits: 1
					})+"%"]
				].forEach(function(metric) {
					const box=document.createElement("div");
					const label=document.createElement("span");
					const value=document.createElement("strong");
					label.textContent=metric[0];
					value.textContent=metric[1];
					if(metric[0]==="Gross profit"&&grossAmount<0) {
						value.classList.add("negative");
					}
					box.append(label,value);
					metrics.appendChild(box);
                    dashboardNumberObserver.observe(value);
				});

				card.append(heading,metrics);
				cards.appendChild(card);
			});

			const summary=document.createElement("div");
			summary.classList.add("profit-summary");
			const totalSales=Object.values(profit.sales).reduce(
				(total,product) => total+(Number(product.total_sales)||0),0
			);
			const totalCost=Object.values(profit.cost_of_goods_sold||{}).reduce(
				(total,cost) => total+(Number(cost)||0),0
			);
			const totalGross=Object.values(grossProfit).reduce(
				(total,value) => total+(Number(value)||0),0
			);
			const totalExpenses=Number(profit.expenses?.total_expenses)||0;
			const payrollCost=Number(profit.payroll_cost)||0;
			const netAmount=Number(profit.total_net_profit)||0;
			const netMargin=totalSales!==0? (netAmount/totalSales)*100:0;
			// Losses are shown on their own lines so they are not hidden inside the cost of products sold.
			const lossRows=[
				["Delivery shortfall",Number(profit.delivery_shortfall_cost)||0],
				...Object.entries(profit.stock_loss_costs||{}).map(([reason,cost]) => ["Stock loss · "+reason,Number(cost)||0]),
				["Production loss",Number(profit.production_loss_cost)||0]
			].filter(row => row[1]>0).map(row => [row[0],currency.format(row[1])]);

			[
				["Total sales",currency.format(totalSales)],
				["Total cost of products sold",currency.format(totalCost)],
				["Gross profit",currency.format(totalGross)],
				...lossRows,
				["Expenses",currency.format(totalExpenses)],
				["Employee salaries",currency.format(payrollCost)],
				["Net profit",currency.format(netAmount),"net"],
				["Net profit margin",netMargin.toLocaleString("en-NG",{
					minimumFractionDigits: 1,
					maximumFractionDigits: 1
				})+"%","net"]
			].forEach(function(row) {
				const line=document.createElement("div");
				const label=document.createElement("span");
				const value=document.createElement("strong");
				label.textContent=row[0];
				value.textContent=row[1];
				if(row[2]==="net") line.classList.add("summary-total");
				if(row[2]==="net"&&netAmount<0) line.classList.add("negative");
				line.append(label,value);
				summary.appendChild(line);
                dashboardNumberObserver.observe(value);
			});

			profitList.appendChild(cards);
            let summaryPanel=document.querySelector('#profit-summary-panel');
            if(!summaryPanel){
                summaryPanel=document.createElement('section');summaryPanel.id='profit-summary-panel';summaryPanel.className='panel';summaryPanel.setAttribute('aria-label','Profit summary');
                document.querySelector('#profit-panel').after(summaryPanel);
            }
            summaryPanel.replaceChildren(summary);
			if(profitCaption) {
				profitCaption.textContent=
					new Date(selectedDate+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+' · '+period.charAt(0).toUpperCase()+period.slice(1)+(profit.costing_provisional?' · Estimated':'');
			}
		} catch(error) {
			console.error(error);
			profitList.innerHTML="";
			const message=document.createElement("p");
			message.classList.add("profit-error");
			message.textContent="Profit figures are unavailable.";
			profitList.appendChild(message);
		}
	}

	showPeriodProduction("day");
	showPeriodProfit("day");
	// Handles change events from dateInput.
	dateInput.addEventListener("change",function() {
		showPeriodProduction("day");
		showPeriodSales("day");

		showPeriodProfit("day");
		dashboardChecks("day");
		stockPanel.style.display="block";
		weekBtn.classList.remove("active");
		monthBtn.classList.remove("active");
		if(dateInput.textContent==="") {
			showStockLevels();
		}
	});

	const dayBtn=document.querySelector(".day-button");
	// Handles click events from dayBtn.
	dayBtn.addEventListener("click",function() {
		showPeriodProduction("day");
		showPeriodSales("day");

		showPeriodProfit("day");
		dashboardChecks("day");
		dayBtn.classList.add("active");
		weekBtn.classList.remove("active");
		monthBtn.classList.remove("active");
		stockPanel.style.display="block";
	});

	const weekBtn=document.querySelector(".week-button");
	// Handles click events from weekBtn.
	weekBtn.addEventListener("click",function() {
		showPeriodProduction("week");
		showPeriodSales("week");
		showPeriodProfit("week");
		dashboardChecks("week");
		weekBtn.classList.add("active");
		dayBtn.classList.remove("active");
		monthBtn.classList.remove("active");
		stockPanel.style.display=
			document.documentElement.dataset.userRole==='storekeeper'?
				"block":"none";
	});

	const monthBtn=document.querySelector(".month-button");
	// Handles click events from monthBtn.
	monthBtn.addEventListener("click",function() {
		showPeriodProduction("month");
		showPeriodSales("month");
		showPeriodProfit("month");
		dashboardChecks("month");
		monthBtn.classList.add("active");
		dayBtn.classList.remove("active");
		weekBtn.classList.remove("active");
		stockPanel.style.display=
			document.documentElement.dataset.userRole==='storekeeper'?
				"block":"none";
	});

	// Loads and displays period sales.
	async function showPeriodSales(period) {
		try {
			const user=await window.currentUserPromise;
			if(!user||user.role==='storekeeper') return;
			const selectedDate=dateInput.value;
			const response=await fetch(
				"/api/dashboard_period?date="+selectedDate
			);
			const sales=await response.json();
			const periodSales=sales[period].sales;
			// Transforms collection entries into the required output shape.
			const salesArray=Object.entries(periodSales).map(function([
				product,
				details
			]) {
				return {
					product: product,
					...details
				};
			});
			const salesGrid=document.querySelector("#sales-grid");
			salesGrid.innerHTML="";
			// Processes each entry in the collection.
			salesArray.sort((a,b)=>['PKO','PKC','Sludge'].indexOf(a.product)-['PKO','PKC','Sludge'].indexOf(b.product)).forEach(row => {
				const salesCard=document.createElement("article");
				const salesHeader=document.createElement("header");
				const productName=document.createElement("h3");
				const badge=document.createElement("span");
				const cardBody=document.createElement("div");
				const productIcon=document.createElement("span");
				const salesDetails=document.createElement("div");
				const salesRowOne=document.createElement("div");
				const quantitySold=document.createElement("span");
				const quantityValue=document.createElement("strong");
				const salesUnitOne=document.createElement("small");
				const salesRowTwo=document.createElement("div");
				const avgPrice=document.createElement("span");
				const avgPriceValue=document.createElement("strong");
				const salesRowThree=document.createElement("div");
				const total=document.createElement("span");
				const totalValue=document.createElement("strong");

				salesCard.classList.add("sale-card");
				salesHeader.classList.add("sale-head");
				badge.classList.add("swatch");
				cardBody.classList.add("sale-body");
				productIcon.classList.add("sale-icon");
				salesDetails.classList.add("sale-details");
				salesRowOne.classList.add("sale-row");
				salesRowTwo.classList.add("sale-row");
				salesRowThree.classList.add("sale-row","total");

				productName.textContent=row.product;
				salesUnitOne.textContent="kg";
				quantitySold.textContent="Qty sold";
				quantityValue.textContent=Number(
					row.quantity_sold
				).toLocaleString("en-NG",{
					minimumFractionDigits: 2,
					maximumFractionDigits: 2
				});
				salesRowOne.append(quantitySold,quantityValue,salesUnitOne);

				avgPrice.textContent="Avg price";
				avgPriceValue.textContent=Number(
					row.average_unit_price
				).toLocaleString("en-NG",{
					style: "currency",
					currency: "NGN",
					minimumFractionDigits: 2,
					maximumFractionDigits: 2
				});
				salesRowTwo.append(avgPrice,avgPriceValue);

				total.textContent="Total";
				totalValue.textContent=Number(row.total_sales).toLocaleString(
					"en-NG",
					{
						style: "currency",
						currency: "NGN",
						maximumFractionDigits: 0
					}
				);
				salesRowThree.append(total,totalValue);
				if(row.product==="PKO") {
					salesCard.classList.add("pko");
					badge.textContent="PKO";
					productIcon.textContent="💧";
					} else if(row.product==="PKC") {
					salesCard.classList.add("pkc");
					badge.textContent="PKC";
					productIcon.textContent="🟤";
					} else if(row.product==="Sludge") {
						salesCard.classList.add("sludge");
						badge.textContent="SLG";
						productIcon.textContent="◉";
				}

				badge.replaceChildren(AppUI.icon(row.product==='PKO'?'oil':row.product==='PKC'?'sack':'flask'));
                salesDetails.append(salesRowTwo,salesRowOne,salesRowThree);
				cardBody.append(productIcon,salesDetails);

				salesHeader.append(badge,productName);
				salesCard.append(salesHeader,cardBody);
				salesGrid.appendChild(salesCard);
                salesCard.querySelectorAll('strong').forEach(value=>dashboardNumberObserver.observe(value));
			});
		} catch(error) {
			console.log(error);
		}
	}
	showPeriodSales("day");
    const salesDateCaption=document.querySelector('#sales-caption');
    function updateSalesDateCaption(){
        salesDateCaption.replaceChildren(AppUI.icon('calendar'),document.createTextNode(new Date(dateInput.value+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})));
    }
    dateInput.addEventListener('change',updateSalesDateCaption);
    updateSalesDateCaption();

	// Loads and displays dashboard checks.
	async function dashboardChecks(period) {
		try {
			const user=await window.currentUserPromise;
			if(!user||user.role!=='admin') return;
			const dashboardCheck=document.querySelector(".dashboard-checks");
			const selectedDate=dateInput.value;

			const response=await fetch("/api/checks");

			if(!response.ok) {
				const problem=await response.json();

				appNotify(problem.err);
				console.log(problem.err);
				return;
			}

			const checks=await response.json();

			const selected=new Date(selectedDate+"T00:00:00");

			// Displays check count in the interface.
			function displayCheckCount(count) {
				dashboardCheck.textContent=
					count+
					(count===1
						? " check needs your attention"
						:" checks need your attention");
				dashboardCheck.classList.toggle("has-checks",count>0);
				dashboardCheck.classList.toggle("is-clear",count===0);
				dashboardCheck.dataset.period=period;
				dashboardCheck.dataset.date=selectedDate;
			}

			if(period==="day") {
				// Keeps collection entries that match the current condition.
				const theDay=checks.filter(check => {
					return check.check_date===selectedDate;
				});

				displayCheckCount(theDay.length);
			} else if(period==="week") {
				const weekStart=new Date(selected);

				weekStart.setDate(
					selected.getDate()-((selected.getDay()+6)%7)
				);

				const weekEnd=new Date(weekStart);

				weekEnd.setDate(weekStart.getDate()+7);

				// Keeps collection entries that match the current condition.
				const thatWeek=checks.filter(check => {
					const checkDate=new Date(check.check_date+"T00:00:00");

					return checkDate>=weekStart&&checkDate<weekEnd;
				});

				displayCheckCount(thatWeek.length);
			} else if(period==="month") {
				// Keeps collection entries that match the current condition.
				const thatMonth=checks.filter(check => {
					const checkDate=new Date(check.check_date+"T00:00:00");

					return (
						checkDate.getFullYear()===selected.getFullYear()&&
						checkDate.getMonth()===selected.getMonth()
					);
				});

				displayCheckCount(thatMonth.length);
			}
		} catch(error) {
			console.log(error);
		}
	}

	dashboardChecks("day");

	const dashboardChecksLink=document.querySelector(".dashboard-checks");

	// Handles click events from dashboardChecksLink.
	dashboardChecksLink.addEventListener("click",function() {
		const period=dashboardChecksLink.dataset.period||"day";
		const selectedDate=
			dashboardChecksLink.dataset.date||dateInput.value;

		window.location.href=
			"/checks.html?period="+
			encodeURIComponent(period)+
			"&date="+
			encodeURIComponent(selectedDate);
	});
}

// Decorative dashboard icons follow the same vocabulary as the stock cards.
document.querySelectorAll('#dashboard .panel-title').forEach(title=>{
    const name=title.closest('#stock-panel')?'cubes':title.closest('#production-panel')?'production':title.closest('#sales-panel')?'cart':'chart';
    title.prepend(AppUI.icon(name));
});
document.querySelectorAll('#period-tabs .tab').forEach(button=>button.prepend(AppUI.icon('calendar')));
document.querySelector('.datebar .today')?.prepend(AppUI.icon('calendar'));
