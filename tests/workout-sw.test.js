const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../sw.js'),'utf8');
function worker(){
 const listeners={},stores=new Map(),origin='https://workout.test';let network=async()=>new Response('network');
 const cache={keys:async()=>[...stores.keys()],delete:async key=>stores.delete(key),open:async key=>{
  if(!stores.has(key))stores.set(key,new Map());const values=stores.get(key);
  return {addAll:async requests=>{for(const r of requests){assert(fs.existsSync(require('node:path').join(__dirname,'..',new URL(r.url).pathname)));values.set(r.url,new Response('precache:'+new URL(r.url).pathname));}},put:async(r,res)=>values.set(r.url,res),match:async(r,options={})=>{const url=typeof r==='string'?r:r.url;for(const [key,value]of values)if(key===url||(options.ignoreSearch&&new URL(key).pathname===new URL(url).pathname))return value.clone();}};
 }};
 vm.runInNewContext(source,{self:{location:{origin},addEventListener:(type,fn)=>listeners[type]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches:cache,Request:function(url,options){return new Request(new URL(url,origin),options);},Response,URL,fetch:(...args)=>network(...args)});
 return {cache,stores,setNetwork:fn=>network=fn,async event(type,request){const waits=[];let response;listeners[type]({request,waitUntil:p=>waits.push(p),respondWith:p=>response=p});const result=await response;await Promise.all(waits);return result;}};
}

test('worker precaches the canonical app and removes only its own obsolete caches',async()=>{
 const w=worker();await w.cache.open('unrelated-app');await w.cache.open('wlog-old');await w.event('install');await w.event('activate');
 assert.equal(w.stores.has('unrelated-app'),true);assert.equal(w.stores.has('wlog-old'),false);
 const paths=[...w.stores.values()].flatMap(store=>[...store.keys()].map(url=>new URL(url).pathname));
 for(const file of ['/pages/workout.html','/scripts/workout.js','/scripts/workout-model.js','/styles/workout.css','/manifest.json','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png'])assert(paths.includes(file));
});

test('worker serves the offline app and versioned assets, while misses are network errors',async()=>{
 const w=worker();await w.event('install');w.setNetwork(async()=>{throw new Error('offline');});
 for(const file of ['/pages/workout.html','/scripts/workout.js?v=15','/scripts/workout-model.js?v=15','/styles/workout.css?v=15']){const response=await w.event('fetch',new Request('https://workout.test'+file));assert.equal(response.status,200);assert.match(await response.text(),/^precache:/);}
 assert.equal((await w.event('fetch',new Request('https://workout.test/missing'))).type,'error');
 assert.equal(await w.event('fetch',new Request('https://elsewhere.test/script.js')),undefined);
 assert.equal(await w.event('fetch',new Request('https://workout.test/save',{method:'POST'})),undefined);
});

test('worker preserves request details and caches the exact successful version for offline use',async()=>{
 const w=worker(),request=new Request('https://workout.test/scripts/workout.js?v=next',{headers:{'X-Audit':'keep'}});
 w.setNetwork(async received=>{assert.equal(received,request);assert.equal(received.headers.get('X-Audit'),'keep');return new Response('new version');});
 assert.equal(await(await w.event('fetch',request)).text(),'new version');w.setNetwork(async()=>{throw new Error('offline');});assert.equal(await(await w.event('fetch',request)).text(),'new version');
});
