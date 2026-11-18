// Native calendars work from the date text, calendar button and keyboard.
(function(){
    function open(input,event){
        if(typeof input.showPicker==='function'){
            try{input.showPicker();event.preventDefault();return;}catch(error){/* Native picker buttons remain available if this browser rejects showPicker. */}
        }
        input.focus();
    }
    document.querySelectorAll('.data-date-filter').forEach(range=>{
        const inputs=[...range.querySelectorAll('input[type="date"]')];
        for(const input of inputs)input.addEventListener('click',event=>open(input,event));
        const [from,to]=inputs;
        if(from&&to){
            function constrain(){from.max=to.value||'';to.min=from.value||'';}
            from.addEventListener('change',constrain);to.addEventListener('change',constrain);constrain();
        }
        const calendar=range.querySelector('.ref-art,.workspace-art');
        if(calendar&&from){
            calendar.removeAttribute('aria-hidden');calendar.setAttribute('role','button');calendar.tabIndex=0;
            calendar.setAttribute('aria-label','Choose start date');calendar.title='Choose start date';
            calendar.addEventListener('click',event=>open(from,event));
            calendar.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')open(from,event);});
        }
    });
})();
