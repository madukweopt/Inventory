// The login form is submitted by the browser itself, so the phone keyboard closes when the dashboard opens
// and the browser can offer to save the password. The server redirects back here with ?error= when sign-in fails.
const loginForm=document.querySelector('#login-form');
const loginMessages={
    invalid:'Invalid username or password',
    locked:'Too many failed sign-in attempts. Wait 15 minutes and try again.',
    failed:'Could not sign in. Please try again.'
};
if(loginForm) {
    const username=document.querySelector('#login-username');
    const error=new URLSearchParams(location.search).get('error');
    if(error) {
        appNotify(loginMessages[error]||loginMessages.failed,{type:'error'});
        // Keep the username typed before the failed attempt, and clear the error from the address bar.
        try { const saved=sessionStorage.getItem('loginUsername'); if(saved&&!username.value) username.value=saved; } catch(storageError) {}
        history.replaceState(null,'',location.pathname);
    }
    loginForm.addEventListener('submit',function() {
        try { sessionStorage.setItem('loginUsername',username.value); } catch(storageError) {}
        if(document.activeElement instanceof HTMLElement) document.activeElement.blur();
        const button=loginForm.querySelector('button[type="submit"]');
        // Disabled after the browser has collected the form, so a second tap cannot send it twice.
        setTimeout(()=>{button.disabled=true;button.textContent='Signing in…';},0);
    });
    // Coming back to this page (for example with the Back button) shows a usable Login button again.
    window.addEventListener('pageshow',function() {
        const button=loginForm.querySelector('button[type="submit"]');
        button.disabled=false;button.textContent='Login';
    });
}
