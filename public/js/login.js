// Submits login credentials and redirects authenticated users.
async function submitLogin(event) {
    event.preventDefault();
    const button=event.currentTarget.querySelector('button[type="submit"]');
    button.disabled=true;button.textContent='Signing in…';
    try {
        const response=await fetch('/api/login',{
            method:'POST',headers:{'content-type':'application/json'},
            body:JSON.stringify({username:document.querySelector('#login-username').value,password:document.querySelector('#login-password').value})
        });
        const result=await response.json();
        if(response.ok) window.location.href='/index.html';
        else appNotify(result.message||'Could not sign in. Check your credentials.',{type:'error'});
    } catch(error) {
        appNotify('Could not connect. Please try again.',{type:'error'});
    } finally {
        button.disabled=false;button.textContent='Login';
    }
}
const loginForm=document.querySelector('#login-form');
if(loginForm) loginForm.addEventListener('submit',submitLogin);
