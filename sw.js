// Network first; cache the workout app for offline reloads.
const CACHE = 'wlog-v6';
const PRECACHE = [
 '/pages/workout.html', '/scripts/workout-model.js', '/scripts/workout.js', '/styles/workout.css',
 '/favicon.ico', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'
];
self.addEventListener('install', event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PRECACHE.map(url=>new Request(url,{cache:'no-store'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('wlog-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{}));}
  return response;
 }).catch(async()=>{
  const cache=await caches.open(CACHE);
  return await cache.match(event.request)||await cache.match(event.request,{ignoreSearch:true})||Response.error();
 }));
});
