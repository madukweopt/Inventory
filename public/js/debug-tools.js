// Loads the mobile debugging console only when debugging is enabled.
async function loadDebugTools() {
	try {
		const response=await fetch('/debug-settings');

		if(!response.ok) {
			return;
		}

		const settings=await response.json();

		if(!settings.enabled) {
			return;
		}

		const script=document.createElement('script');
		script.src='https://cdn.jsdelivr.net/npm/eruda@3.4.1/eruda.js';
		script.onload=function() {
			eruda.init();
		};
		document.head.appendChild(script);
	} catch(error) {
		console.error('Could not load the debugging tools');
	}
}

loadDebugTools();
