// Background helper for the installed app. Pages always come from the server, so everyone sees live data and
// updates arrive straight away; only when there is no network does it show the saved "You're offline" page.
// It never stores pages or records. Change CACHE when the offline page changes, so phones take the new copy.
const CACHE='somad-offline-v1';
const OFFLINE_FILES=['/offline.html','/css/offline.css','/images/app/icon-192.png'];

self.addEventListener('install',event=>{
    event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(OFFLINE_FILES)));
    self.skipWaiting();
});

// Removes offline copies from earlier versions.
self.addEventListener('activate',event=>{
    event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
        .then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
    const request=event.request;
    if(request.method==='GET'&&request.mode==='navigate') {
        event.respondWith(fetch(request).catch(()=>caches.match('/offline.html')));
    } else if(request.method==='GET'&&OFFLINE_FILES.includes(new URL(request.url).pathname)) {
        event.respondWith(caches.match(request).then(saved=>saved||fetch(request)));
    }
    // Everything else (data, saving records, uploads) goes straight to the server, untouched.
});
