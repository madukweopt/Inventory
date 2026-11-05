// Defines an empty placeholder function.
function name(params) {

}
// Defines an empty placeholder function.
function name(params) {

}
// Defines an empty placeholder function.
function name(params) {

}
// Defines an empty placeholder function.
function name(params) {

}
// Defines an empty placeholder function.
function name(params) {

}
// Defines an empty placeholder function.
function name(params) {

}
// Defines an empty placeholder function.
function name(params) {

}
// Defines an empty placeholder function.
function name(params) {

}
// Submits login credentials and redirects authenticated users.
async function submitLogin(event) {
	event.preventDefault();
	const username=document.querySelector("#login-username");
	const password=document.querySelector("#login-password");

	const response=await fetch("/api/login",{
		method: "POST",
		headers: {
			"content-type": "application/json"
		},
		body: JSON.stringify({
			username: username.value,
			password: password.value
		})
	});
	const result=await response.json();
	if(response.ok) {
		window.location.href='/index.html';
	} else {
		alert(result.message);
	}
}
const loginForm=document.querySelector("#login-form");
if(loginForm) {
	loginForm.addEventListener('submit',submitLogin);
}

