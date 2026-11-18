// A daily usage entry is an actual stock issue; receipts still come from authorisations.
(async function(){
    const form=document.getElementById('consumable-usage-form');if(!form)return;
    const user=await window.currentUserPromise;if(!user||!['admin','storekeeper'].includes(user.role))return;
    const item=document.getElementById('usage-item'),date=document.getElementById('usage-date'),quantity=document.getElementById('usage-quantity'),unit=document.getElementById('usage-unit');
    const today=new Date();date.value=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    try{
        const response=await fetch('/api/items');if(!response.ok)throw new Error();
        const items=await response.json();
        items.filter(row=>row.item_type==='consumable').forEach(row=>item.add(new Option(row.name,row.item_id)));
    }catch(error){appNotify('Could not load consumables. Refresh this page before recording usage.');}
    item.onchange=()=>{unit.textContent=inventoryUnit(item.selectedOptions[0]?.textContent||'');};
    function selectDailyUsage(row){
        date.value=row.check_date;item.value=String(row.item_id);item.onchange();
        sessionStorage.removeItem('dailyUsageSelection');quantity.focus();
    }
    window.addEventListener('dailyusageselected',event=>selectDailyUsage(event.detail));
    const selected=sessionStorage.getItem('dailyUsageSelection');
    if(selected){try{selectDailyUsage(JSON.parse(selected));}catch(error){sessionStorage.removeItem('dailyUsageSelection');}}
    let saving=false;
    form.onsubmit=async event=>{
        event.preventDefault();if(saving||!form.reportValidity())return;
        const payload={usage_date:date.value,item_id:item.value,quantity:quantity.value};
        const retry=authorisationKey('Consumable usage',payload);
        saving=true;const submit=form.querySelector('button[type=submit]');submit.disabled=true;
        try{
            const response=await fetch('/api/consumable-usage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,entry_key:retry.key})});
            const result=await response.json();if(!response.ok){appNotify(result.err||'Daily usage could not be saved.');return;}
            sessionStorage.removeItem(retry.slot);quantity.value='';appNotify(result.message);
            if(window.refreshPendingWeighingBadge)window.refreshPendingWeighingBadge();
        }catch(error){appNotify('Could not confirm whether usage was saved. Retry the same details to check it safely.');}
        finally{saving=false;submit.disabled=false;}
    };
})();
