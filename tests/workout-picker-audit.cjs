// Touch regression audit. Uses optional, existing Playwright/browser installations.
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),M=require('../scripts/workout-model.js');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{const file=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
async function settle(p){await p.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));}
async function stored(p){return p.evaluate(()=>JSON.parse(localStorage.getItem('wapp-v4')));}
async function visibleAddition(p,key){
 await p.locator('#sheet').waitFor({state:'hidden'});await p.waitForFunction(()=>!document.documentElement.classList.contains('modal-open'));await settle(p);
 assert.equal(await p.locator('#card-'+key+' .exercise-toggle').getAttribute('aria-expanded'),'true');
 assert.equal(await p.evaluate(()=>document.activeElement.closest('.exercise-card')?.dataset.key),key,'focus returns to the added exercise');
 const geometry=await p.locator('#card-'+key).evaluate(card=>{const r=card.getBoundingClientRect(),notice=document.getElementById('notice'),bottom=notice.hidden?innerHeight:Math.min(innerHeight,notice.getBoundingClientRect().top);return{top:r.top,bottom:r.bottom,available:bottom};});
 assert(geometry.top>=0&&geometry.bottom<=geometry.available,JSON.stringify(geometry));
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/pages/workout.html';let browser;
 try{
  for(const engine of (process.env.PICKER_ENGINES||'chromium').split(',')){
   browser=await pw[engine].launch({headless:true,...(engine==='chromium'&&process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
   for(const [width,height] of [[320,568],[390,844],[844,390],[1280,900]])for(const theme of ['light','dark']){
    const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<900}),p=await ctx.newPage(),errors=[];p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push(e.message));await ctx.addInitScript(theme=>localStorage.setItem('wtheme',theme),theme);await p.goto(url);
    await p.locator('#card-incline_press form[data-slot="0"] [name="weight"]').fill('17.5');
    await p.locator('#add-exercise').tap();await p.locator('[data-act="pick"][data-key="chest_press"]').tap();await visibleAddition(p,'chest_press');
    let s=await stored(p);assert.equal(s.sessions[0].ex.filter(k=>k==='chest_press').length,1);assert(!s.routines.find(r=>r.id==='full_a').ex.includes('chest_press'));
    const f='#card-chest_press form[data-slot="0"]';await p.locator(f+' [name="weight"]').fill('30');await p.locator(f+' [name="reps"]').fill('10');await p.locator(f+' button[type="submit"]').tap();
    await p.locator('#add-exercise').tap();assert.equal(await p.locator('[data-act="pick"][data-key="chest_press"]').count(),0);await p.locator('[data-act="new-for-session"]').tap();await p.locator('#sheet [name="name"]').fill('Touch test lift');await p.locator('#sheet form button[type="submit"]').tap();
    s=await stored(p);const created=s.ex.find(e=>e.name==='Touch test lift');assert(created);await visibleAddition(p,created.id);
    if(process.env.AUDIT_OUTPUT&&width===390)await p.screenshot({path:path.join(process.env.AUDIT_OUTPUT,'add-exercise-'+engine+'-'+theme+'.png'),animations:'disabled'});
    await p.locator('#undo').tap();assert(!(await stored(p)).ex.some(e=>e.id===created.id));await p.reload();s=await stored(p);assert.deepEqual(s.sessions[0].entries.chest_press.sets[0],{w:30,reps:10});M.normalize(s);
    // A long library must remain scrollable, including its final New exercise action.
    const library=M.defaults();for(let i=0;i<40;i++)library.ex.push({id:'extra_'+i,name:'Extra exercise '+i,min:8,max:12,inc:2.5,archived:false});await p.evaluate(s=>localStorage.setItem('wapp-v4',JSON.stringify(s)),library);await p.reload();await p.locator('#add-exercise').tap();await p.locator('[data-act="new-for-session"]').tap();assert.equal(await p.locator('#sheet-title').textContent(),'New exercise');await p.locator('[data-act="back"]').tap();await p.locator('[data-act="pick"][data-key="extra_39"]').tap();await visibleAddition(p,'extra_39');
    await p.locator('#add-exercise').tap();await p.locator('[data-act="close"]').tap();await p.locator('#sheet').waitFor({state:'hidden'});await p.waitForFunction(()=>!document.documentElement.classList.contains('modal-open'));assert.equal(await p.evaluate(()=>document.activeElement.id),'add-exercise');
    assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await ctx.close();console.log(JSON.stringify({engine,width,height,theme,addAndCreate:'passed',longLibrary:'passed',undoAndReload:'passed'}));
   }
   await browser.close();browser=null;
  }
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
