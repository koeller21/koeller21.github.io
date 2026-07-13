// network-first, cache-fallback: always fresh online, works offline. no update dance,
// no version bumps needed here - the page's ?v= scheme stays the source of truth.
// all fetches bypass the HTTP cache ('no-store'): otherwise a stale HTTP-cache hit
// masquerades as "network ok" and serves mixed old/new files instead of our cache.
var CACHE = 'wlog-v2';
var PRECACHE = [
    '/pages/workout.html',
    '/scripts/workout.js',
    '/styles/workout.css',
    '/favicon.ico'
];

self.addEventListener('install', function(e){
    e.waitUntil(caches.open(CACHE).then(function(c){
        return c.addAll(PRECACHE.map(function(u){ return new Request(u, {cache: 'no-store'}); }));
    }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e){
    e.waitUntil(caches.keys().then(function(ks){
        return Promise.all(ks.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e){
    if(e.request.method !== 'GET') return;
    e.respondWith(
        fetch(e.request.url, {cache: 'no-store'}).then(function(res){
            if(res.ok){
                var copy = res.clone();
                caches.open(CACHE).then(function(c){ c.put(e.request.url, copy); });
            }
            return res;
        }).catch(function(){
            return caches.match(e.request.url, {ignoreSearch: true});   // offline: any cached ?v= variant beats nothing
        })
    );
});
