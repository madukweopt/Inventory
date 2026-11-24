// Pending Weighing: the Storekeeper's list of authorised jobs (sales, purchases and production) and each job's card,
// where weighed quantities are recorded, production entries are saved, corrected or reversed, and production days
// are finished or reopened. Moved out of forms.js unchanged; it uses shared helpers from forms.js (formatDate,
// formatNumber, inventoryUnit, limitInventoryDecimals) and delivery-notes.js, and the Production Data page in
// forms.js uses createProductionHistory and createProductionLossNote from here.
// Loaded after forms.js on forms.html; the functions are only called once the page has loaded.

const weighingTaskList=document.querySelector('.weighing-task-list');
const weighingTasksMessage=document.querySelector('.weighing-tasks-message');
const refreshWeighingTasksBtn=document.querySelector('#refresh-weighing-tasks');

async function editProductionBatch(request,batch,reverse=false,onSaved,card) {
    const refresh=async(message)=>{
        if(onSaved){await onSaved();appNotify(message);}
        // In Pending Weighing only this production card is rebuilt; its entries list stays open.
        else if(card&&card.isConnected){
            try{await refreshProductionCard(card,request.request_id);}catch(error){console.error(error);await loadWeighingTasks({quiet:true});}
            weighingTasksMessage.textContent=message;appNotify(message);
        }
        else {await loadWeighingTasks();weighingTasksMessage.textContent=message;}
    };
    if(reverse) {
        if(!confirm('Reverse this entry? Its quantities will be removed from the daily totals and stock.')) return;
        try {
            const response=await fetch('/api/weighing-requests/'+request.request_id+'/batches/'+batch.batch_id,{
                method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({version:batch.version})});
            const result=await response.json();
            if(response.ok) await refresh(result.message);
            else appNotify(result.err);
        } catch(error) {appNotify('Could not reverse entry.');}
        return;
    }
    const dialog=document.createElement('dialog');
    dialog.className='employee-finance-dialog';
    const form=document.createElement('form');
    const title=document.createElement('h2');title.textContent='Correct entry #'+batch.batch_id+' · '+new Date(batch.created_at).toLocaleString();form.appendChild(title);
    for(const [key,label] of [['kernel_used','Kernel issued (kg)'],['pko_produced','PKO received (kg)'],['pkc_produced','PKC received (kg)'],['sludge_produced','Sludge received (kg)'],['scale_ticket','Scale ticket']]) {
        const field=document.createElement('label');field.textContent=label;
        const input=document.createElement('input');input.name=key;input.type=key==='scale_ticket'?'text':'number';
        if(input.type==='number'){input.min='0';input.step='0.01';input.required=true;}
        input.value=batch[key]??'';
        if(input.type==='number'&&Number(batch[key])===0){input.type='hidden';form.appendChild(input);continue;}
        field.appendChild(input);form.appendChild(field);
    }
    const message=document.createElement('p');message.setAttribute('role','status');
    const actions=document.createElement('div');
    const close=document.createElement('button');close.type='button';close.textContent='Cancel';close.onclick=()=>{dialog.close();dialog.remove();};
    const save=document.createElement('button');save.type='submit';save.textContent='Save Correction';actions.append(close,save);form.append(message,actions);
    form.onsubmit=async(event)=>{
        event.preventDefault();save.disabled=true;
        try {
            const response=await fetch('/api/weighing-requests/'+request.request_id+'/batches/'+batch.batch_id,{
                method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...Object.fromEntries(new FormData(form)),version:batch.version})});
            const result=await response.json();
            if(!response.ok){message.textContent=result.err;return;}
            dialog.close();dialog.remove();await refresh(result.message);
        } catch(error){message.textContent='Could not save correction.';} finally{save.disabled=false;}
    };
    dialog.appendChild(form);document.body.appendChild(dialog);dialog.showModal();
}

function createLegacyReview() {
    const section=document.createElement('details');section.className='weighing-task-entry';
    const summary=document.createElement('summary');summary.textContent='Review older records without stock links';section.appendChild(summary);
    let loaded=false;
    section.addEventListener('toggle',async()=>{
        if(!section.open||loaded)return;loaded=true;
        const list=document.createElement('div');list.className='weighing-task-group';section.appendChild(list);
        try {
            const response=await fetch('/api/legacy-links');const records=await response.json();
            if(!response.ok)throw new Error(records.err);
            summary.textContent='Older records needing stock links ('+records.length+')';
            let shown=0;
            const more=document.createElement('button');more.type='button';more.textContent='Show more records';
            function appendMore(){
                records.slice(shown,shown+20).forEach(record=>{
                    const card=document.createElement('details');card.className='weighing-task-card';
                    const label=document.createElement('summary');label.textContent=record.kind+' · '+formatDate(record.day)+' · reference '+record.id;card.appendChild(label);
                    let reviewed=false;
                    card.addEventListener('toggle',async()=>{
                        if(!card.open||reviewed)return;reviewed=true;
                        try {
                            const response=await fetch('/api/legacy-links/'+record.kind+'/'+record.id);const proposal=await response.json();
                            if(!response.ok)throw new Error(proposal.err);
                            const form=document.createElement('form');form.className='weighing-task-form';
                            let complete=true;
                            proposal.options.forEach(option=>{
                                if(!option.required&&!option.matches.length)return;
                                const field=document.createElement('label');field.textContent=option.part+' · received '+option.received+' / issued '+option.issued;
                                const select=document.createElement('select');select.name=option.part;select.required=option.required;
                                const empty=document.createElement('option');empty.value='';empty.textContent=option.matches.length?'Choose the original stock entry':'No exact match — manual review needed';select.appendChild(empty);
                                option.matches.forEach(match=>{
                                    const choice=document.createElement('option');choice.value=match.count_id;
                                    choice.textContent=match.name+' · stock reference '+match.count_id+' · '+new Date(match.created_at).toLocaleString();select.appendChild(choice);
                                });
                                if(option.required&&!option.matches.length)complete=false;
                                field.appendChild(select);form.appendChild(field);
                            });
                            const notice=document.createElement('p');notice.className='weighing-task-guidance';
                            notice.textContent=complete?'Confirm these are the original entries using your delivery notes or scale tickets. Linking will not change quantities.':'Some quantities have no exact match. Leave this record for manual reconciliation; no stock will be guessed.';
                            const save=document.createElement('button');save.type='submit';save.textContent='Confirm Stock Links';save.disabled=!complete;form.append(notice,save);
                            form.onsubmit=async(event)=>{
                                event.preventDefault();if(!confirm('Confirm you have checked these stock entries against the original record?'))return;save.disabled=true;
                                try {
                                    const response=await fetch('/api/legacy-links/'+record.kind+'/'+record.id,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({movements:Object.fromEntries(new FormData(form))})});
                                    const result=await response.json();notice.textContent=result.message||result.err;if(response.ok){form.remove();label.textContent+=' · Linked';}
                                }catch(error){notice.textContent='Could not save links.';}finally{save.disabled=false;}
                            };
                            card.appendChild(form);
                        }catch(error){const message=document.createElement('p');message.textContent=error.message;card.appendChild(message);reviewed=false;}
                    });
                    list.appendChild(card);
                });
                shown+=20;more.hidden=shown>=records.length;
            }
            more.onclick=appendMore;appendMore();section.appendChild(more);
        } catch(error){list.textContent=error.message;loaded=false;}
    });
    return section;
}

// Builds one Storekeeper card for an activity already authorised by the Manager.
function createProductionHistory(entries, request, onSaved) {
    const history=document.createElement('details');
    history.className='weighing-task-history activity-history';
    history.addEventListener('click',event=>event.stopPropagation());
    const summary=document.createElement('summary');
    summary.textContent=entries.length+' production '+(entries.length===1?'entry':'entries');
    history.appendChild(summary);
    const list=document.createElement('div');list.className='activity-list';
    entries.forEach(batch=>{
        const row=document.createElement('div');row.className='activity-row';
        const copy=document.createElement('div');copy.className='activity-copy';
        const title=document.createElement('strong');
        title.textContent=batch.legacy_batch?'Historical daily total':Number(batch.kernel_used)>0?'Kernel issued':'Product received';
        title.textContent+=' · Entry #'+batch.batch_id;
        const meta=document.createElement('small');
        meta.textContent='Issued/received '+formatDate(String(batch.movement_date||request?.request_date||'').slice(0,10))+' · Submitted '+new Date(batch.created_at).toLocaleString()+
            (batch.recorded_by_name?' · '+batch.recorded_by_name:'')+
            (batch.scale_ticket?' · Ticket '+batch.scale_ticket:'')+(batch.voided?' · Reversed':'');
        copy.append(title,meta);
        const amounts=document.createElement('div');amounts.className='activity-amount';
        [['Kernel',batch.kernel_used],['PKO',batch.pko_produced],['PKC',batch.pkc_produced],['Sludge',batch.sludge_produced]].forEach(([label,value])=>{
            if(Number(value)>0){const amount=document.createElement('span');amount.textContent=label+' '+formatNumber(value)+' kg';amounts.appendChild(amount);}
        });
        row.append(copy,amounts);
        if(request&&document.documentElement.dataset.userRole==='admin'&&request.status==='Awaiting Storekeeper'&&!batch.voided){
            const actions=document.createElement('div');actions.className='activity-controls';
            [['Correct entry',false],['Reverse entry',true]].forEach(([label,reverse])=>{
                const button=document.createElement('button');button.type='button';button.className=reverse?'reverse-entry-button':'weighing-task-secondary';button.textContent=label;button.onclick=()=>editProductionBatch(request,batch,reverse,onSaved,button.closest('.weighing-task-card'));actions.appendChild(button);
            });row.appendChild(actions);
        }
        list.appendChild(row);
    });
    if(!entries.length){const empty=document.createElement('p');empty.textContent='No individual entries recorded.';list.appendChild(empty);}
    history.appendChild(list);return history;
}

// Lists kernel returned to store from a production day. The Director can remove a return entered by mistake
// (it stays in Stock Change History); onChanged reloads whichever page shows the card.
function createKernelReturnsNote(record,onChanged) {
    const returns=record.kernel_returns||[];
    if(!returns.length) return document.createDocumentFragment();
    const box=document.createElement('div');box.className='kernel-returns-note';
    const title=document.createElement('p');title.className='kernel-returns-title';
    title.textContent='Returned to store: '+formatNumber(returns.reduce((sum,row)=>sum+Number(row.quantity||0),0))+' kg of kernel (taken off kernel used)';
    box.appendChild(title);
    for(const row of returns) {
        const line=document.createElement('p');line.className='kernel-return-line';
        const text=document.createElement('span');
        text.textContent=formatNumber(row.quantity)+' kg'+(row.recorded_by_name?' · entered by '+row.recorded_by_name:'');
        line.appendChild(text);
        if(document.documentElement.dataset.userRole==='admin') {
            const remove=document.createElement('button');remove.type='button';remove.className='reverse-entry-button';remove.textContent='Remove return';
            remove.onclick=async()=>{
                if(!confirm('Remove this '+formatNumber(row.quantity)+' kg kernel return? The kernel goes back to being counted as issued to this production day. The removal is kept in Stock Change History.'))return;
                remove.disabled=true;
                try {
                    const response=await fetch('/api/correction_delete',{method:'DELETE',headers:{'content-type':'application/json'},
                        body:JSON.stringify({kind:'stock',record:{count_id:row.count_id}})});
                    const result=await response.json().catch(()=>({}));
                    if(!response.ok){appNotify(result.err||'Could not remove the return.',{position:'top'});return;}
                    appNotify('Kernel return removed.',{position:'top'});
                    await onChanged();
                } catch(error){appNotify('Could not remove the return.',{position:'top'});}
                finally{remove.disabled=false;}
            };
            line.appendChild(remove);
        }
        box.appendChild(line);
    }
    return box;
}

// Shows a production day's loss: the kernel not recovered as weighed PKO, PKC or sludge.
// A finished day shows the loss saved at Finish Day (the figure used in profit). An open day shows the
// kernel not yet accounted for, which may still be in the machines, so it is marked Provisional.
function createProductionLossNote(record,isFinal) {
    // Kernel used is net of any kernel returned to store unused.
    const kernel=(Number(record.kernel_used)||0)-(Number(record.kernel_returned)||0);
    const running=Math.max(kernel-(Number(record.pko_produced)||0)-(Number(record.pkc_produced)||0)-(Number(record.sludge_produced)||0),0);
    const loss=isFinal&&record.process_loss!==undefined&&record.process_loss!==null?Number(record.process_loss)||0:Math.round(running*100)/100;
    const note=document.createElement('p');note.className='production-loss-note'+(isFinal?' is-final':' is-provisional');
    const label=document.createElement('span');label.textContent='Production loss';
    const amount=document.createElement('strong');amount.textContent=formatNumber(loss)+' kg';
    const share=document.createElement('span');share.className='production-loss-share';
    share.textContent=(kernel>0?formatNumber(Number((loss/kernel*100).toFixed(2)))+'% of kernel used · ':'')+(isFinal?'Final':'Provisional until Finish Day');
    note.append(label,amount,share);
    return note;
}

// The ordered quantity on a pending sale or purchase card, with Add or Change for the Director or the authorising Manager.
function createOrderedQuantityBox(request) {
    const unit=inventoryUnit(request.item);
    const box=document.createElement('div');box.className='task-ordered'+(request.ordered_quantity==null?' is-missing':'');
    const label=document.createElement('small');label.textContent=request.request_type==='Sale'?'Customer ordered':'Ordered from supplier';
    const amount=document.createElement('strong');amount.textContent=request.ordered_quantity==null?'Not recorded':formatNumber(request.ordered_quantity)+' '+unit;
    box.append(label,amount);
    if(request.can_change_order) {
        const change=document.createElement('button');change.type='button';change.className='task-ordered-change';
        change.textContent=request.ordered_quantity==null?'Add ordered quantity':'Change';
        change.addEventListener('click',() => {
            const editor=document.createElement('form');editor.className='task-ordered-editor';
            const input=document.createElement('input');input.type='number';input.min='0.01';input.step='0.01';input.inputMode='decimal';input.required=true;
            input.value=request.ordered_quantity??'';input.setAttribute('aria-label','Ordered quantity ('+unit+')');input.placeholder='Quantity ('+unit+')';
            limitInventoryDecimals(input);
            const save=document.createElement('button');save.type='submit';save.textContent='Save';
            const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.className='weighing-task-secondary';
            cancel.addEventListener('click',() => { editor.replaceWith(change); });
            editor.addEventListener('submit',async event => {
                event.preventDefault();save.disabled=true;
                try {
                    const response=await fetch('/api/weighing-requests/'+request.request_id+'/ordered-quantity',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({ordered_quantity:input.value})});
                    const result=await response.json();
                    weighingTasksMessage.textContent=result.message||result.err;
                    if(response.ok) await loadWeighingTasks();
                } catch(error) { weighingTasksMessage.textContent='Could not save the ordered quantity. Please try again.'; }
                finally { save.disabled=false; }
            });
            editor.append(input,save,cancel);change.replaceWith(editor);input.focus();
        });
        box.appendChild(change);
    }
    return box;
}

// Production quantities the Storekeeper can enter together or one at a time: [field, entry type, label].
const PRODUCTION_ENTRY_FIELDS=[['kernel_used','Issue','Kernel issued'],['pko_produced','Receive','PKO received'],
    ['pkc_produced','Receive','PKC received'],['sludge_produced','Receive','Sludge received']];

function createWeighingTaskCard(request) {
	const card=document.createElement('article');
	const heading=document.createElement('div');
	const title=document.createElement('h2');
	const details=document.createElement('p');
	const form=document.createElement('form');
	const requestLabel=request.request_type+' '+request.daily_number;
	card.className='weighing-task-card';
	heading.className='weighing-task-card-heading';
	title.textContent=requestLabel;
    const banner=document.createElement('div');banner.className='task-banner';
    const date=document.createElement('span');date.className='task-date';date.textContent=formatDate(request.request_date);
    details.className='task-meta';
    details.textContent=request.request_type==='Purchase'?request.item+' from '+request.supplier:
        request.request_type==='Sale'?request.item+' for '+request.customer+' · Payment by '+(request.billing_basis==='Customer'?'customer’s agreed weight':'factory weight'):
        request.production_hours+' operating hours · '+request.down_time+' hours downtime';
    banner.append(title,date);heading.append(banner,details);
    if(request.request_type!=='Production'){
        const price=document.createElement('div');price.className='task-price';
        const label=document.createElement('small');label.textContent='Unit price';
        const amount=document.createElement('strong');amount.textContent='₦'+formatNumber(request.request_type==='Sale'?request.unit_price:request.unit_cost)+' / '+inventoryUnit(request.item);
        price.append(label,amount);heading.appendChild(price);
    }
    // The quantity ordered, so the Storekeeper knows how much to load or expect. Older authorisations may have none;
    // the Director, or the Manager who authorised it, can add or change it while it is still waiting.
    if(['Sale','Purchase'].includes(request.request_type)&&(request.ordered_quantity!=null||request.can_change_order)) {
        heading.appendChild(createOrderedQuantityBox(request));
    }
    if(request.request_type==='Production') {
        const totals=document.createElement('p');
        totals.className='weighing-task-totals';
        [['Kernel used',Number(request.kernel_used||0)-Number(request.kernel_returned||0)],['PKO',request.pko_produced],['PKC',request.pkc_produced],['Sludge',request.sludge_produced]].forEach(([name,value]) => {
            const metric=document.createElement('span');
            const label=document.createElement('span');
            const amount=document.createElement('strong');
            label.textContent=name;
            amount.textContent=formatNumber(value||0)+' kg';
            metric.append(label,amount);
            totals.appendChild(metric);
        });
        heading.appendChild(totals);
        const yieldNote=document.createElement('p');yieldNote.className='production-yield-status';
        // Yield uses the kernel processed: issued minus any kernel returned to store unused.
        const processed=Number(request.kernel_used||0)-Number(request.kernel_returned||0);
        yieldNote.textContent='Oil yield: '+(processed>0?formatNumber(Number((Number(request.pko_produced||0)/processed*100).toFixed(2)))+'%':'—')+' · '+(request.status==='Completed'?'Final':'Provisional');heading.appendChild(yieldNote);
        heading.appendChild(createProductionLossNote(request,request.status==='Completed'));
        heading.appendChild(createKernelReturnsNote(request,()=>loadWeighingTasks({quiet:true})));
        heading.appendChild(createProductionHistory(request.batches||[],request));
    }
    if(request.status==='Completed') {
        card.appendChild(heading);
        if(document.documentElement.dataset.userRole==='admin'&&request.request_type==='Production') {
            const reopen=document.createElement('button');
            reopen.type='button';
            reopen.className='weighing-task-secondary';
            reopen.textContent='Reopen Production';
            reopen.addEventListener('click',async () => {
                if(!window.confirm('Reopen this production day so more batches can be recorded?')) return;
                reopen.disabled=true;
                try {
                    const response=await fetch('/api/weighing-requests/'+request.request_id+'/reopen',{ method:'PATCH' });
                    const result=await response.json();
                    if(response.ok) await loadWeighingTasks();
                    weighingTasksMessage.textContent=result.message||result.err;
                } catch(error) {
                    weighingTasksMessage.textContent='Could not reopen production.';
                } finally { reopen.disabled=false; }
            });
            const actions=document.createElement('div');
            actions.className='weighing-task-actions';
            actions.appendChild(reopen);
            card.appendChild(actions);
        }
        if(window.styleReferenceWeighingCard)window.styleReferenceWeighingCard(card,request);
        return card;
    }
	if(['admin','manager'].includes(document.documentElement.dataset.userRole)) {
		const managerActions=document.createElement('div');
		const waiting=document.createElement('strong');
		const cancel=document.createElement('button');
		waiting.className='weighing-task-waiting';
		waiting.textContent='Waiting for Storekeeper';
		cancel.type='button';
		cancel.className='cancel-weighing-request';
		cancel.textContent='Cancel Authorisation';
        cancel.hidden=!request.can_cancel;
		cancel.addEventListener('click',async function() {
			if(!window.confirm('Cancel this authorisation?')) return;
            cancel.disabled=true;
            try {
			const response=await fetch('/api/weighing-requests/'+request.request_id+'/cancel',{ method:'PATCH' });
			const result=await response.json();
			if(response.ok) {
				await loadWeighingTasks();
				weighingTasksMessage.textContent=result.message;
			} else {
				weighingTasksMessage.textContent=result.err||'Could not cancel authorisation';
			}
            } catch(error) {
                weighingTasksMessage.textContent='Could not cancel authorisation. Please try again.';
            } finally { cancel.disabled=false; }
		});
		managerActions.className='weighing-task-manager-actions';
		managerActions.append(waiting,cancel);
		card.append(heading,managerActions);
		if(document.documentElement.dataset.userRole==='manager') {
            if(window.styleReferenceWeighingCard)window.styleReferenceWeighingCard(card,request);
            return card;
        }
	}
	form.className='weighing-task-form';
	form.dataset.requestId=request.request_id;

	// Adds a labelled input used to complete the authorised activity.
	function addInput(labelText,name,options={}) {
		const label=document.createElement('label');
		const text=document.createElement('span');
		const input=document.createElement('input');
		text.textContent=labelText;
		input.name=name;
		input.type=options.type||'number';
		if(input.type==='number') {
			input.min=String(options.min??0);
			input.step='0.01';
			input.inputMode='decimal';
		}
		input.required=options.required!==false;
		input.placeholder=options.placeholder||'';
		label.append(text,input);
		form.appendChild(label);
		return input;
	}

    if(request.request_type==='Production') {
        const movementInput=addInput('Date actually issued or received','movement_date',{type:'date'});
        const now=new Date();const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
        movementInput.min=String(request.request_date).slice(0,10);
        movementInput.value=today<movementInput.min?movementInput.min:today;
        // Kernel issued and each product received can be entered together or one at a time.
        // Each filled quantity is saved as its own Issue Kernel or Receive Product entry.
        form.dataset.production='true';
        const inputs=PRODUCTION_ENTRY_FIELDS.map(([name,,label])=>{
            const input=addInput(label+' (kg)',name,{min:0.01,required:false,placeholder:'Leave blank if none'});
            limitInventoryDecimals(input);return input;
        });
        const guidance=document.createElement('p');guidance.className='weighing-task-guidance';
        guidance.textContent='These entries belong to production dated '+formatDate(request.request_date)+'. Enter the kernel issued, any products received, or both, then save. Each quantity is added to stock straight away as its own entry. After a save the form closes; open it again for the next weighing. Leave production open while materials remain in the machines.';
        const status=document.createElement('p');status.className='production-entry-status';status.setAttribute('role','status');
        function updateButton(){
            const filled=PRODUCTION_ENTRY_FIELDS.filter((_,index)=>inputs[index].value!=='');
            const button=form.querySelector('button[type="submit"]');if(!button)return;
            button.textContent=filled.length>1?'Save '+filled.length+' Entries':filled.length&&filled[0][1]==='Receive'?'Save Product Receipt':filled.length?'Save Kernel Issue':'Save Entries';
        }
        inputs.forEach(input=>input.addEventListener('input',updateButton));queueMicrotask(updateButton);
        form.append(guidance,status);
	} else {
        // Stock is dated on the day the goods actually arrive or leave, not the authorisation day.
        const movementInput=addInput(request.request_type==='Purchase'?'Date actually received':'Date actually dispatched','movement_date',{type:'date'});
        const now=new Date();const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
        movementInput.min=String(request.request_date).slice(0,10);
        movementInput.value=today<movementInput.min?movementInput.min:today;
		const quantityInput=addInput(request.request_type==='Purchase'?
			'Quantity received ('+inventoryUnit(request.item)+')':
			'Quantity issued ('+inventoryUnit(request.item)+')','quantity',{ min:0.01 });
		if(['Sale','Purchase'].includes(request.request_type)&&request.ordered_quantity!=null) {
			quantityInput.placeholder='Ordered: '+formatNumber(request.ordered_quantity)+' '+inventoryUnit(request.item);
			form.dataset.orderedQuantity=request.ordered_quantity;form.dataset.orderedUnit=inventoryUnit(request.item);
			form.dataset.orderedBy=request.request_type==='Sale'?'the customer ordered':'the order was for';
		}
		if(request.request_type==='Sale') {
			const total=document.createElement('p');
			total.className='weighing-sale-total';
			const label=document.createElement('span');label.textContent=request.billing_basis==='Customer'?'Factory-weight estimate':'Sale total';
            const amount=document.createElement('strong');amount.textContent='₦0';total.append(label,amount);
			quantityInput.addEventListener('input',function() {
				amount.textContent='₦'+formatNumber((Number(quantityInput.value)||0)*Number(request.unit_price));
			});
			form.appendChild(total);
		}
		addInput('Vehicle number','vehicle_number',{ type:'text',required:request.request_type==='Sale',placeholder:request.request_type==='Sale'?'Vehicle registration':'Optional' });
	}
	addInput('Scale ticket number','scale_ticket',{ type:'text',required:false,placeholder:'Optional' });
    if(request.request_type==='Purchase'&&String(request.item).trim().toLowerCase()==='p kernel') window.addReceiptKernelSample(form);
    if(request.request_type==='Sale') {
        // The driver checks the weighed load and signs before the Storekeeper can confirm dispatch.
        const driverHelp=document.createElement('p');driverHelp.className='weighing-task-guidance';
        driverHelp.textContent='Show the driver the quantity and vehicle number. The driver enters their name and signs below before you confirm dispatch.';
        form.appendChild(driverHelp);
        addInput('Driver’s full name','driver_name',{ type:'text' });
        form.driverSignature=window.addDeliverySignaturePad(form,'Driver signs here');
    }
	const submit=document.createElement('button');
	submit.type='submit';
	submit.textContent=request.request_type==='Purchase'?'Confirm Receipt':
		request.request_type==='Sale'?'Confirm Dispatch':'Save Entries';
    const formActions=document.createElement('div');
    formActions.className='weighing-task-actions';
    formActions.appendChild(submit);
    form.appendChild(formActions);
	form.addEventListener('submit',completeWeighingTask);
    if(!card.contains(heading)) card.appendChild(heading);
    if(['admin','storekeeper'].includes(document.documentElement.dataset.userRole)) {
        const entry=document.createElement('details');
        entry.className='weighing-task-entry';
        const summary=document.createElement('summary');
        summary.textContent=request.request_type==='Production'?'Issue kernel or receive products':'Record weighed quantities';
        entry.append(summary,form);
        card.appendChild(entry);
    } else { card.appendChild(form); }
    if(request.request_type==='Production') {
        const finish=document.createElement('button');
        finish.type='button';
        finish.className='weighing-task-secondary';
        finish.textContent='Finish Day';finish.dataset.action='finish-day';
        finish.disabled=!(request.batches||[]).length;
        finish.addEventListener('click',async () => {
            if(!window.confirm('Have all materials for this production been processed and all products weighed and recorded? Finish Day makes its yield final and closes further entries.')) return;
            finish.disabled=true;
            try {
                const response=await fetch('/api/weighing-requests/'+request.request_id+'/finish',{ method:'PATCH' });
                const result=await response.json();
                if(response.ok) await loadWeighingTasks();
                weighingTasksMessage.textContent=result.message||result.err;
            } catch(error) {
                weighingTasksMessage.textContent='Could not finish production day.';
            } finally { finish.disabled=false; }
        });
        formActions.appendChild(finish);
    }
	if(window.styleReferenceWeighingCard)window.styleReferenceWeighingCard(card,request);
        return card;
}

// Finished days are fetched only on request, ten at a time.
function createFinishedProductionHistory(){
    const history=document.createElement('details');history.className='finished-production-history';
    const summary=document.createElement('summary');summary.textContent='Finished production days';
    const help=document.createElement('p');help.className='finished-production-help';help.textContent='Open to view finished days. The newest 10 are loaded first.';
    const message=document.createElement('p');message.setAttribute('role','status');
    const list=document.createElement('div');list.className='weighing-task-group finished-production-list';
    const more=document.createElement('button');more.type='button';more.className='finished-production-more';more.textContent='Load more';more.hidden=true;
    history.append(summary,help,message,list,more);
    let loaded=false,loading=false,cursor=null;
    async function load(){
        if(loading)return;loading=true;more.disabled=true;message.classList.remove('error');message.textContent='Loading history…';
        try{
            const response=await fetch('/api/weighing-requests/finished-production?limit=10'+(cursor?'&before='+encodeURIComponent(cursor):''));
            const result=await response.json();if(!response.ok)throw new Error(result.err||'Could not load finished production days.');
            if(!history.isConnected)return;
            result.requests.forEach(request=>list.appendChild(createWeighingTaskCard(request)));
            cursor=result.next_cursor;loaded=true;
            more.hidden=!result.has_more;more.textContent='Load more';
            message.textContent=list.children.length?list.children.length+' finished day'+(list.children.length===1?'':'s')+' loaded.':'There are no production days in this history.';
        }catch(error){
            message.classList.add('error');message.textContent=error.message;more.hidden=false;more.textContent='Try again';
        }finally{loading=false;more.disabled=false;}
    }
    history.addEventListener('toggle',()=>{if(history.open&&!loaded)load();});
    more.addEventListener('click',load);
    return history;
}

// Build one row per job, using its current stage even when requests refresh concurrently.
let pendingWorkLoad=0;
// A quiet reload (after a receipt or dispatch is saved) keeps the search, job type, loaded jobs and open job.
let pendingWorkView={query:'',type:'',visible:10,openKey:null};
async function loadWeighingTasks(options) {
    if(!weighingTaskList)return;
    const quiet=Boolean(options&&options.quiet===true);
    const load=++pendingWorkLoad;
    if(!quiet){pendingWorkView={query:'',type:'',visible:10,openKey:null};weighingTaskList.textContent='Loading pending work...';weighingTasksMessage.textContent='';}
    const view=pendingWorkView;
    try{
        const responses=await Promise.all([fetch('/api/weighing-requests'),fetch('/api/delivery-notes/pending')]);
        if(responses.some(response=>!response.ok))throw Error('Could not load pending work.');
        const [requests,deliveries]=await Promise.all(responses.map(response=>response.json()));
        if(load!==pendingWorkLoad)return;
        const jobs=new Map();
        for(const request of requests)jobs.set('request:'+request.request_id,{key:'request:'+request.request_id,type:request.request_type,date:request.request_date,
            title:request.request_type==='Sale'?request.customer+' · '+request.item:request.request_type==='Purchase'?request.supplier+' · '+request.item:'Production',
            stage:request.request_type==='Sale'?'Record factory dispatch':request.request_type==='Purchase'?'Record goods received':'Issue kernels or receive products',request});
        for(const delivery of deliveries)jobs.set(delivery.request_id?'request:'+delivery.request_id:'delivery:'+delivery.sales_id,{key:delivery.request_id?'request:'+delivery.request_id:'delivery:'+delivery.sales_id,type:'Sale',date:delivery.sales_date,
            title:delivery.customer+' · '+delivery.item,stage:delivery.delivery_status,delivery});
        const rows=[...jobs.values()].sort((a,b)=>a.date.localeCompare(b.date));
        const fragment=document.createDocumentFragment(),tools=document.createElement('div');tools.className='pending-work-tools';
        const searchLabel=document.createElement('label');searchLabel.textContent='Find a job';
        const search=document.createElement('input');search.type='search';search.placeholder='Customer, supplier, product or date';searchLabel.appendChild(search);
        const typeLabel=document.createElement('label');typeLabel.textContent='Job type';const type=document.createElement('select');
        for(const [value,label]of [['','All jobs'],['Sale','Sales and deliveries'],['Purchase','Purchases'],['Production','Production']])type.add(new Option(label,value));typeLabel.appendChild(type);
        const count=document.createElement('p');count.className='pending-work-count';count.setAttribute('role','status');
        const list=document.createElement('div');list.className='pending-work-list';
        const more=document.createElement('button');more.type='button';more.textContent='Load more';
        tools.append(searchLabel,typeLabel);fragment.append(tools,count,list,more);
        search.value=view.query;type.value=view.type;
        let visible=view.visible,restoreOpen=quiet;
        function render(){
            const query=search.value.trim().toLowerCase();
            const filtered=rows.filter(row=>(!type.value||row.type===type.value)&&[row.title,row.date,row.type,row.stage].join(' ').toLowerCase().includes(query));
            count.textContent=filtered.length+' pending '+(filtered.length===1?'job':'jobs');list.replaceChildren();
            count.classList.toggle('is-clear',!filtered.length);
            for(const row of filtered.slice(0,visible)){
                const job=document.createElement('details');job.className='pending-work-job';
                const summary=document.createElement('summary'),heading=document.createElement('span'),stage=document.createElement('span');
                // The job type gets its own coloured label; a delivery awaiting the Director is highlighted in yellow.
                const title=document.createElement('strong');title.textContent=row.title;const meta=document.createElement('small');
                const type=document.createElement('span');type.className='pending-work-type type-'+row.type.toLowerCase();type.textContent=row.type;
                meta.append(type,document.createTextNode(' '+formatDate(row.date)));
                heading.append(title,meta);stage.className='pending-work-stage'+(row.stage==='Awaiting Director approval'?' is-approval':'');stage.textContent=row.stage;summary.append(heading,stage);
                const body=document.createElement('div');body.className='pending-work-body';job.append(summary,body);
                let built=false;
                job.addEventListener('toggle',()=>{
                    if(!job.open){if(view.openKey===row.key)view.openKey=null;return;}
                    view.openKey=row.key;
                    for(const other of list.children)if(other!==job)other.open=false;
                    if(built)return;built=true;
                    if(row.request)body.appendChild(createWeighingTaskCard(row.request));
                    else{const help=document.createElement('p');help.textContent=row.stage;const open=document.createElement('button');open.type='button';open.textContent='Open Delivery Note';open.onclick=()=>window.openDeliveryNote(row.delivery.sales_id);body.append(help,open);}
                });list.appendChild(job);
                if(restoreOpen&&row.key===view.openKey)job.open=true;
            }
            restoreOpen=false;
            if(!filtered.length){const empty=document.createElement('p');empty.className='weighing-tasks-empty';empty.textContent=rows.length?'No matching jobs.':'There is no pending work.';list.appendChild(empty);}
            more.hidden=visible>=filtered.length;
        }
        search.oninput=type.onchange=()=>{view.query=search.value;view.type=type.value;visible=view.visible=10;render();};more.onclick=()=>{visible=view.visible=visible+10;render();};render();
        if(document.documentElement.dataset.userRole==='admin'){fragment.append(createFinishedProductionHistory(),createLegacyReview());}
        const scroll=window.scrollY;
        weighingTaskList.replaceChildren(fragment);
        if(quiet)window.scrollTo(0,scroll);
        if(window.refreshPendingWeighingBadge)window.refreshPendingWeighingBadge();
        if(window.styleReferenceWeighingList)window.styleReferenceWeighingList(weighingTaskList);
    }catch(error){if(load===pendingWorkLoad){if(quiet)weighingTasksMessage.textContent='Saved. The list could not be refreshed; select Refresh.';else weighingTaskList.textContent='Pending work could not be loaded.';}}
}

// Rebuilds one production card in place after an entry is saved, keeping the open entry form,
// its date and any quantities not yet saved, so the Storekeeper carries on where they stopped.
async function refreshProductionCard(card,requestId) {
    const response=await fetch('/api/weighing-requests');
    if(!response.ok) throw new Error('Could not refresh the production card.');
    const request=(await response.json()).find(row=>String(row.request_id)===String(requestId));
    if(!request||!card||!card.isConnected) return loadWeighingTasks({quiet:true});
    const fresh=createWeighingTaskCard(request);
    const entry=card.querySelector(':scope>.weighing-task-entry'),freshEntry=fresh.querySelector(':scope>.weighing-task-entry');
    if(entry&&freshEntry){
        freshEntry.replaceWith(entry);
        const finish=entry.querySelector('[data-action="finish-day"]');
        if(finish) finish.disabled=!(request.batches||[]).length;
    }
    const history=fresh.querySelector('.activity-history');
    if(history&&card.querySelector('.activity-history')?.open) history.open=true;
    card.replaceWith(fresh);
}

// Saves the filled production quantities in one request: each becomes its own entry (kernel issued, each product
// received), and the server saves all of them or none. One quantity on its own is saved the same way.
// Every quantity keeps its own submission key until it is saved, so retrying after a lost connection is safe.
async function saveProductionEntries(form,submit) {
    const status=form.querySelector('.production-entry-status');
    const filled=PRODUCTION_ENTRY_FIELDS.map(([name,type,label])=>({name,type,label,input:form.elements[name]})).filter(field=>field.input.value!=='');
    if(!filled.length) {
        status.textContent='Enter the kernel issued or at least one product received.';
        submit.disabled=false;return;
    }
    form.entryKeys=form.entryKeys||{};
    const entries=filled.map(field=>{
        form.entryKeys[field.name]=form.entryKeys[field.name]||crypto.randomUUID();
        const entry={entry_type:field.type,submission_key:form.entryKeys[field.name],kernel_used:'0',pko_produced:'0',pkc_produced:'0',sludge_produced:'0'};
        entry[field.name]=field.input.value;
        if(field.type==='Receive') entry.received_product=field.name;
        return entry;
    });
    const body={movement_date:form.elements.movement_date.value,scale_ticket:form.elements.scale_ticket.value,entries};
    status.textContent='Saving…';status.classList.remove('error');
    let message,saved=false;
    try {
        const response=await fetch('/api/weighing-requests/'+form.dataset.requestId+'/complete',{
            method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
        const result=await response.json();
        if(response.ok) {
            saved=true;
            message='Saved and added to stock: '+filled.map(field=>field.label+' '+formatNumber(field.input.value)+' kg').join(', ')+'.';
            for(const field of filled) { field.input.value='';delete form.entryKeys[field.name]; }
            form.elements.scale_ticket.value='';
        } else {
            message=(filled.length>1?'Nothing was saved: ':'Not saved: ')+(result.err||'please try again.');
        }
    } catch(error) {
        message='The save could not be confirmed. Select Save again to retry it safely.';
    }
    form.querySelectorAll('input[type="number"]').forEach(input=>input.dispatchEvent(new Event('input')));
    status.textContent=message;status.classList.toggle('error',!saved);
    submit.disabled=false;
    if(saved) {
        // The entry form closes after a save; the production card stays on screen with its updated entries,
        // and the success message shows at the top of the screen.
        const entry=form.closest('.weighing-task-entry');
        if(entry) entry.open=false;
        status.textContent='';
        try { await refreshProductionCard(form.closest('.weighing-task-card'),form.dataset.requestId); } catch(error) { console.error(error); }
        if(window.refreshPendingWeighingBadge) window.refreshPendingWeighingBadge();
        appNotify(message,{position:'top'});
        return;
    }
    // Not saved: the form stays open with the quantities, ready to try again.
    appNotify(message,{position:'top'});
    const next=PRODUCTION_ENTRY_FIELDS.map(([name])=>form.elements[name]).find(input=>input.value!=='')||form.elements.kernel_used;
    if(next&&form.isConnected) next.focus({preventScroll:true});
}

// Saves the Storekeeper quantities once and completes the related business record and Inventory movement.
async function completeWeighingTask(event) {
	event.preventDefault();
	const form=event.currentTarget;
	const submit=form.querySelector('button[type="submit"]');
	submit.disabled=true;
    if(form.dataset.production==='true') return saveProductionEntries(form,submit);
	weighingTasksMessage.textContent='Saving physical quantities...';
	const values=Object.fromEntries(new FormData(form).entries());
    // Loading or receiving more than was ordered needs a second look before it is saved.
    if(form.dataset.orderedQuantity&&Number(values.quantity)>Number(form.dataset.orderedQuantity)&&
       !window.confirm('You entered '+formatNumber(values.quantity)+' '+form.dataset.orderedUnit+', but '+form.dataset.orderedBy+' '+formatNumber(form.dataset.orderedQuantity)+' '+form.dataset.orderedUnit+'. Save it anyway?')) {
        submit.disabled=false;weighingTasksMessage.textContent='';return;
    }
    if(form.driverSignature) {
        try { values.driver_signature=form.driverSignature(); }
        catch(error) { weighingTasksMessage.textContent='The driver must sign before you confirm dispatch.';submit.disabled=false;return; }
    }
    if(values.include_kernel_test){
        values.kernel_test={sample_weight_g:values.sample_weight_g,impurity_weight_g:values.impurity_weight_g,entry_key:values.impurity_entry_key};
    }
    for(const field of ['include_kernel_test','sample_weight_g','impurity_weight_g','impurity_entry_key'])delete values[field];
	try {
		const response=await fetch('/api/weighing-requests/'+form.dataset.requestId+'/complete',{
			method: 'PATCH',
			headers: { 'content-type':'application/json' },
			body: JSON.stringify(values)
		});
		const result=await response.json();
		if(!response.ok) {
			weighingTasksMessage.textContent=result.err||'The quantities could not be saved.';
			submit.disabled=false;
			return;
		}
		// The completed job leaves the list without resetting the search, filter or loaded jobs.
		await loadWeighingTasks({quiet:true});
		weighingTasksMessage.textContent=result.message;
		appNotify(result.message);
	} catch(error) {
		console.error(error);
		weighingTasksMessage.textContent='The quantities could not be saved.';
		submit.disabled=false;
	}
}

if(refreshWeighingTasksBtn) refreshWeighingTasksBtn.addEventListener('click',loadWeighingTasks);
