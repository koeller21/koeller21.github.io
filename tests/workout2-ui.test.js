const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM,VirtualConsole}=require('jsdom');
const M=require('../scripts/workout2-model.js');
const {fixture}=require('./workout2-fixtures.js');
const html=fs.readFileSync(require.resolve('../pages/workout2.html'),'utf8');
const model=fs.readFileSync(require.resolve('../scripts/workout2-model.js'),'utf8');
const ui=fs.readFileSync(require.resolve('../scripts/workout2.js'),'utf8');
function app(t,{state,desktop=false,raw,theme,shippingDefaults=false}={}){
 const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error));
 const dom=new JSDOM(html,{url:'https://workout.test/pages/workout2.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
 const w=dom.window,d=w.document;
 if(raw!==undefined)w.localStorage.setItem('wapp-v4',raw);else if(state)w.localStorage.setItem('wapp-v4',JSON.stringify(state));
 if(theme)w.localStorage.setItem('wtheme',theme);
 for(const script of d.querySelectorAll('script:not([src])'))new vm.Script(script.textContent).runInContext(dom.getInternalVMContext());
 const media={matches:desktop,addEventListener(type,handler){this.onchange=handler;}};w.matchMedia=()=>media;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 new vm.Script(model).runInContext(dom.getInternalVMContext());
 // General interaction tests use a stable custom program; shipping defaults are tested explicitly.
 if(!shippingDefaults)w.WorkoutModel.defaults=fixture;
 new vm.Script(ui).runInContext(dom.getInternalVMContext());
 t.after(()=>{dom.window.close();assert.deepEqual(errors,[]);});
 const q=selector=>{const e=d.querySelector(selector);assert(e,'Missing '+selector);return e;};
 const click=selector=>q(selector).click();
 const type=(selector,value)=>{const e=q(selector);e.value=String(value);e.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const submit=selector=>q(selector).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 const stored=()=>JSON.parse(w.localStorage.getItem('wapp-v4'));
 return {w,d,q,click,type,submit,stored,resizeDesktop:matches=>{media.matches=matches;media.onchange?.();}};
}
const setForm=slot=>`#card-ex_0 form[data-slot="${slot}"]`;
function logFirst(a){a.type(setForm(0)+' [name="weight"]','40');a.type(setForm(0)+' [name="reps"]','8');a.submit(setForm(0));}

test('initial UI exposes workout/progress tabs, named inputs, a finish state and no nutrition controls',t=>{
 const a=app(t);assert.equal(a.q('#title').textContent,'Push');assert.equal(a.q('#finish').disabled,true);
 assert.equal(a.q('#tabs').hidden,false);assert(a.q(setForm(0)+' input').getAttribute('aria-label').includes('set 1'));
 assert(!/kcal|calories|weigh-in/.test(a.d.body.textContent));assert.equal(a.w.localStorage.getItem('wapp-v4'),null);
});
test('inline set logging retains independent weights, sibling drafts and unaffected DOM cards',t=>{
 const a=app(t),other=a.q('#card-ex_1');a.type(setForm(1)+' [name="weight"]','35');a.type(setForm(1)+' [name="reps"]','6');logFirst(a);
 assert.equal(a.q(setForm(1)+' [name="weight"]').value,'35');assert.equal(a.q('#card-ex_1'),other);
 const done=a.q('#card-ex_0 .set-summary[data-slot="0"] [data-act="edit-set"]');assert.match(done.getAttribute('aria-label'),/Edit Overhead Press, set 1/);assert(done.classList.contains('just-logged'));
 done.dispatchEvent(new a.w.Event('animationend'));assert.equal(done.classList.contains('just-logged'),false);
 a.submit(setForm(1));assert.deepEqual(a.stored().sessions[0].entries.ex_0.sets,[{w:40,reps:8},{w:35,reps:6}]);
 assert.match(a.q('#subtitle').textContent,/2\/10/);assert.equal(a.q('#finish').disabled,false);
});
test('finish asks about missing sets, completes explicitly and Undo restores the active workout',t=>{
 const a=app(t);logFirst(a);a.click('#finish');assert(a.q('#sheet').open);assert.match(a.q('#sheet-content').textContent,/9 sets/);
 a.click('#confirm-finish');assert.equal(a.stored().sessions[0].status,'finished');assert.equal(a.q('#reopen').hidden,false);
 a.click('#undo');assert.equal(a.stored().sessions[0].status,'active');assert.match(a.q('#subtitle').textContent,/In progress/);
});
test('reload resumes the unfinished routine, including across midnight',t=>{
 const s=fixture();M.logSet(s,'pull','ex_5',0,40,8);s.sessions[0].d='2020-01-01';
 const a=app(t,{state:s});assert.equal(a.q('#title').textContent,'Pull');assert.match(a.q('#subtitle').textContent,/01\.01\.2020/);
});
test('new exercise from the picker is added directly and closes the dialog',t=>{
 const a=app(t);a.click('#add-exercise');a.click('[data-act="new-for-session"]');a.type('#sheet [name="name"]','New lift');a.submit('#sheet form');
 const s=a.stored(),e=s.ex.find(e=>e.name==='New lift');assert(e);assert(s.sessions[0].ex.includes(e.id));assert.equal(a.q('#sheet').open,false);assert(a.d.getElementById('card-'+e.id));
});
test('routine reorder persists and saving returns to the originating screen',t=>{
 const a=app(t);a.click('[data-act="edit-current-routine"]');a.click('[data-act="move-up"][data-key="ex_4"]');a.submit('#sheet form');
 assert.deepEqual(a.stored().routines[0].ex,['ex_0','ex_1','ex_2','ex_4','ex_3']);assert.equal(a.q('#sheet').open,false);
});
test('duplicate exercise names and invalid numeric inputs display inline errors',t=>{
 const a=app(t);a.type(setForm(0)+' [name="weight"]','40junk');a.submit(setForm(0));assert.equal(a.q(setForm(0)+' .field-error').hidden,false);assert.equal(a.w.localStorage.getItem('wapp-v4'),null);
 a.click('#add-exercise');a.click('[data-act="new-for-session"]');a.type('#sheet [name="name"]','Overhead Press');a.submit('#sheet form');assert.match(a.q('#sheet .field-error').textContent,/already exists/);
});
test('deleting one of two same-day history entries leaves the other intact and supports Undo',t=>{
 const s=fixture();const first=M.logSet(s,'push','ex_4',0,10,12);M.finish(s,'push',true);const second=M.logSet(s,'pull','ex_4',0,20,12);M.finish(s,'pull',true);
 const a=app(t,{state:s});a.click('[data-act="routine"][data-id="push"]');a.click('[data-act="detail"][data-key="ex_4"]');a.click(`[data-act="delete-history"][data-id="${second.id}"]`);
 assert.equal(a.stored().sessions.length,1);assert.equal(a.stored().sessions[0].id,first.id);assert.equal(a.q('#sheet-notice').hidden,false);assert.equal(a.q('#notice').hidden,true);a.click('#sheet-undo');assert.equal(a.stored().sessions.length,2);
});
test('archiving every routine shows a useful empty state and creation selects the new routine',t=>{
 const s=fixture();s.routines.forEach(r=>r.archived=true);const a=app(t,{state:s});assert.equal(a.q('#empty').hidden,false);assert.equal(a.q('#title').textContent,'Your workouts');
 a.click('#empty [data-act="edit-routine"]');a.type('#sheet [name="name"]','Custom');a.submit('#sheet form');assert.equal(a.q('#title').textContent,'Custom');assert.equal(a.q('#empty').hidden,true);
});
test('mobile drawer toggles accessibility state and Escape restores menu focus',t=>{
 const a=app(t);assert.equal(a.q('#drawer').getAttribute('aria-hidden'),'true');assert.equal(a.q('#drawer').inert,true);
 a.click('#menu');assert.equal(a.q('#drawer').getAttribute('aria-hidden'),'false');assert.equal(a.q('#pane').inert,true);assert.equal(a.q('#menu').getAttribute('aria-expanded'),'true');
 a.d.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(a.q('#drawer').inert,true);assert.equal(a.d.activeElement,a.q('#menu'));
});
test('desktop navigation is exposed to assistive technologies',t=>{
 const a=app(t,{desktop:true});assert.equal(a.q('#drawer').inert,false);assert.equal(a.q('#drawer').getAttribute('aria-hidden'),'false');
});
test('dialog Back and Close return predictably and focus stays visible',t=>{
 const a=app(t);a.click('[data-act="settings"]');assert.equal(a.d.activeElement,a.q('#sheet-title'));a.click('[data-category="manager"]');assert.equal(a.q('#sheet-back').hidden,false);
 a.click('#sheet-back');assert.equal(a.q('#sheet-title').textContent,'Settings');a.click('[data-act="close"]');assert.equal(a.q('#sheet').open,false);assert.equal(a.d.activeElement,a.q('#menu'));
});
test('invalid nested import preserves saved state; valid replacement requires a confirmation and is undoable',async t=>{
 const a=app(t,{state:fixture()}),before=a.w.localStorage.getItem('wapp-v4');
 await a.w.importFile({size:100,text:async()=>JSON.stringify({v:4,ex:[null],routines:[],sessions:[]})});
 assert.equal(a.w.localStorage.getItem('wapp-v4'),before);assert.match(a.q('#notice-text').textContent,/Import rejected/);
 const next=fixture();next.routines[0].name='Imported';await a.w.importFile({size:100,text:async()=>JSON.stringify(next)});
 assert.equal(a.w.localStorage.getItem('wapp-v4'),before);a.click('#confirm-import');assert.equal(a.stored().routines[0].name,'Imported');a.click('#undo');assert.equal(a.stored().routines[0].name,'Push');
});
test('storage write failure leaves both logged data and visible state unchanged',t=>{
 const a=app(t);a.w.Storage.prototype.setItem=function(){throw new Error('Storage full');};logFirst(a);
 assert.equal(a.w.localStorage.getItem('wapp-v4'),null);assert.match(a.q('#subtitle').textContent,/0\/10/);assert.match(a.q('#notice-text').textContent,/Storage full/);
});
test('stale draft cannot overwrite a change from another tab',t=>{
 const a=app(t,{state:fixture()});a.type(setForm(0)+' [name="weight"]','40');const other=fixture();M.logSet(other,'pull','ex_5',0,50,8);a.w.localStorage.setItem('wapp-v4',JSON.stringify(other));
 a.w.dispatchEvent(new a.w.StorageEvent('storage',{key:'wapp-v4'}));a.submit(setForm(0));assert.equal(a.stored().sessions[0].r,'pull');assert.match(a.q(setForm(0)+' .field-error').textContent,/another tab/);
});
test('zero-load progress renders no Infinity or NaN and charts have responsive viewBoxes',t=>{
 const s=fixture();M.logSet(s,'push','ex_0',0,0,8);M.finish(s,'push',true);s.sessions[0].d='2020-01-01';M.logSet(s,'push','ex_0',0,40,8);M.finish(s,'push',true);
 const a=app(t,{state:s});a.click('[data-act="routine"][data-id="push"]');a.click('#tab-progress');assert(!/Infinity|NaN/.test(a.q('#progress-view').textContent));assert(a.q('#progress-view svg').hasAttribute('viewBox'));
});
test('corrupt saved data is not silently replaced by defaults',t=>{
 const raw='{"v":4,"ex":[null]}',a=app(t,{raw});assert.equal(a.w.localStorage.getItem('wapp-v4'),raw);assert.equal(a.q('#app-error').hidden,false);
});
test('corrupt saved data can be recovered through a validated backup without a reset',async t=>{
 const a=app(t,{raw:'invalid JSON'});assert(a.q('#app-error [data-act="export-raw"]'));
 await a.w.importFile({size:100,text:async()=>JSON.stringify(fixture())});a.click('#confirm-import');
 assert.equal(a.q('#app-error').hidden,true);assert.equal(a.q('#pane').hidden,false);assert.equal(a.stored().v,4);assert.equal(a.q('#title').textContent,'Push');
});
test('archive and restore actions preserve exercise history and have clear destinations',t=>{
 const s=fixture();M.logSet(s,'push','ex_0',0,40,8);const a=app(t,{state:s});a.click('[data-act="detail"][data-key="ex_0"]');a.click('#sheet [data-act="edit-exercise"]');a.click('[data-act="archive-exercise"]');
 assert(a.stored().ex[0].archived);assert.equal(a.stored().sessions[0].entries.ex_0.sets[0].w,40);assert.equal(a.q('#sheet-title').textContent,'Overhead Press');
 a.click('#sheet [data-act="edit-exercise"]');a.click('[data-act="restore-exercise"]');assert.equal(a.stored().ex[0].archived,false);
});
test('skipping an exercise preserves keyboard focus on its restore action',t=>{
 const a=app(t),skip=a.q('[data-act="skip"][data-key="ex_0"]');skip.focus();skip.click();
 assert.equal(a.d.activeElement,a.q('[data-act="unskip"][data-key="ex_0"]'));assert.match(a.q('#subtitle').textContent,/2 skipped/);
});
test('undoing new exercise creation while its detail dialog is open closes obsolete detail safely',t=>{
 const a=app(t);a.click('#add-exercise');a.click('[data-act="new-for-session"]');a.type('#sheet [name="name"]','Temporary lift');a.submit('#sheet form');
 const key=a.stored().ex.find(e=>e.name==='Temporary lift').id;a.click(`[data-act="detail"][data-key="${key}"]`);a.click('#sheet-undo');
 assert.equal(a.q('#sheet').open,false);assert(!a.stored().ex.some(e=>e.id===key));
});
test('stylesheet parses, reduced motion retains navigation position, and old sheet workarounds are gone',t=>{
 const a=app(t),css=fs.readFileSync(require.resolve('../styles/workout2.css'),'utf8'),style=a.d.createElement('style');style.textContent=css;a.d.head.append(style);assert(style.sheet.cssRules.length>0);
 assert.match(css,/\.is-open #pane \{ transform:translateX\(var\(--dw\)\)/);assert(!/prefers-reduced-motion[^]*transform:none/.test(css));
 assert(!/visualViewport|pointercancel|setPointerCapture|typeval|\.blur\(/.test(ui));
});

test('a complete custom-routine journey supports creation, logging, correction, finishing, reopening and another workout',t=>{
 const a=app(t);a.click('#menu');a.click('#drawer [data-act="edit-routine"]');
 assert.equal(a.d.documentElement.classList.contains('is-open'),false);
 a.type('#sheet [name="name"]','Quick session');a.click('[data-act="include-exercise"][data-key="ex_0"]');a.click('[data-act="include-exercise"][data-key="ex_1"]');a.submit('#sheet form');
 assert.equal(a.q('#title').textContent,'Quick session');const routine=a.stored().routines.find(r=>r.name==='Quick session');
 logFirst(a);a.type(setForm(1)+' [name="weight"]','37,5');a.type(setForm(1)+' [name="reps"]','7');a.submit(setForm(1));
 a.click('[data-act="edit-set"][data-key="ex_0"][data-slot="0"]');a.type(setForm(0)+' [name="reps"]','6');a.submit(setForm(0));
 assert.deepEqual(a.stored().sessions[0].entries.ex_0.sets,[{w:40,reps:6},{w:37.5,reps:7}]);
 a.click('[data-act="expand"][data-key="ex_1"]');a.click('[data-act="skip"][data-key="ex_1"]');a.click('#finish');assert.equal(a.q('#sheet').open,false);assert.equal(a.stored().sessions[0].status,'finished');
 a.click('#reopen');assert.equal(a.stored().sessions[0].status,'active');a.click('[data-act="edit-set"][data-key="ex_1"][data-slot="1"]');
 const form='#card-ex_1 form[data-slot="1"]';a.type(form+' [name="weight"]','20');a.type(form+' [name="reps"]','8');a.submit(form);
 a.click('#finish');a.click('#confirm-finish');assert.equal(a.stored().sessions[0].entries.ex_1.sets[1].w,20);
 a.click('#new-workout');assert.equal(a.stored().sessions.length,2);assert.equal(a.stored().sessions[1].r,routine.id);assert.equal(a.stored().sessions[1].status,'active');assert.match(a.q('#subtitle').textContent,/0\/4/);
 a.click('#discard');a.click('#confirm-discard');assert.equal(a.stored().sessions.length,1);a.click('#undo');assert.equal(a.stored().sessions.length,2);
});
test('an empty planned workout can be discarded without counting as finished',t=>{
 const a=app(t);a.click('#add-exercise');a.click('[data-act="pick"][data-key="ex_5"]');assert.equal(a.q('#finish').disabled,true);assert.equal(a.q('#discard').hidden,false);
 a.click('#discard');a.click('#confirm-discard');assert.equal(a.stored().sessions.length,0);assert.equal(a.q('#discard').hidden,true);assert.equal(a.q('#title').textContent,'Push');
});
test('an explicitly skipped set can be entered directly and sibling weights stay independent',t=>{
 const a=app(t);a.click('[data-act="skip"][data-key="ex_0"]');a.click('[data-act="edit-set"][data-key="ex_0"][data-slot="1"]');
 assert.equal(a.d.activeElement,a.q(setForm(1)+' input'));a.type(setForm(1)+' [name="weight"]','22.5');a.type(setForm(1)+' [name="reps"]','7');a.submit(setForm(1));
 assert.deepEqual(a.stored().sessions[0].entries.ex_0.sets,[null,{w:22.5,reps:7}]);
});
test('exercise rename preserves stable IDs, routine membership and historical records',t=>{
 const s=fixture();M.logSet(s,'push','ex_0',0,40,8);const a=app(t,{state:s});a.click('[data-act="detail"][data-key="ex_0"]');a.click('#sheet [data-act="edit-exercise"]');a.type('#sheet [name="name"]','Strict press');a.submit('#sheet form');
 assert.equal(a.stored().ex[0].id,'ex_0');assert(a.stored().routines[0].ex.includes('ex_0'));assert.equal(a.stored().sessions[0].entries.ex_0.sets[0].w,40);assert.equal(a.q('#sheet-title').textContent,'Strict press');
});
test('switching views or expanding another exercise preserves unsaved set drafts',t=>{
 const a=app(t);a.type(setForm(0)+' [name="weight"]','31.25');a.type(setForm(0)+' [name="reps"]','7');a.click('#tab-progress');a.click('#tab-workout');assert.equal(a.q(setForm(0)+' [name="weight"]').value,'31.25');
 a.click('[data-act="expand"][data-key="ex_1"]');a.click('[data-act="expand"][data-key="ex_0"]');assert.equal(a.q(setForm(0)+' [name="reps"]').value,'7');
});
test('import cancellation and oversize rejection leave saved state untouched',async t=>{
 const a=app(t,{state:fixture()}),before=a.w.localStorage.getItem('wapp-v4');await a.w.importFile({size:11*1024*1024,text:async()=>{throw Error('Should not read oversized file');}});assert.equal(a.w.localStorage.getItem('wapp-v4'),before);
 await a.w.importFile({size:100,text:async()=>JSON.stringify(fixture())});a.click('[data-act="close"]');assert.equal(a.w.localStorage.getItem('wapp-v4'),before);
});
test('appearance choices keep the document theme, selected option and browser tint consistent',t=>{
 const a=app(t);a.click('[data-act="settings"]');a.click('[data-category="appearance"]');a.click('button[data-theme="dark"]');
 assert.equal(a.d.documentElement.dataset.theme,'dark');assert.equal(a.w.localStorage.getItem('wtheme'),'dark');assert.equal(a.q('button[data-theme="dark"]').getAttribute('aria-pressed'),'true');assert.equal(a.q('meta[name="theme-color"]').content,'#172337');
 a.click('button[data-theme="light"]');assert.equal(a.d.documentElement.dataset.theme,'light');assert.equal(a.q('meta[name="theme-color"]').content,'#ffffff');assert.equal(a.q('button[data-theme="dark"]').getAttribute('aria-pressed'),'false');
});

test('history pages expose earlier workouts without replacing or deleting any data',t=>{
 const s=fixture();for(let i=0;i<65;i++){const date=new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10);s.sessions.push({id:'session_'+i,d:date,r:'push',status:'finished',ex:['ex_0'],entries:{ex_0:{sets:[{w:40+i,reps:8},null],skipped:true}}});}
 const a=app(t,{state:s});a.click('[data-act="routine"][data-id="push"]');a.click('[data-act="detail"][data-key="ex_0"]');assert.equal(a.d.querySelectorAll('.history-entry').length,30);a.click('[data-act="more-history"]');assert.equal(a.d.querySelectorAll('.history-entry').length,60);assert(a.d.activeElement.classList.contains('history-entry'));a.click('[data-act="more-history"]');assert.equal(a.d.querySelectorAll('.history-entry').length,65);assert(!a.d.querySelector('[data-act="more-history"]'));assert.equal(a.stored().sessions.length,65);
});
test('changing unrelated localStorage keys does not interrupt a draft or overwrite it',t=>{
 const a=app(t);a.type(setForm(0)+' [name="weight"]','40');a.w.dispatchEvent(new a.w.StorageEvent('storage',{key:'unrelated-key'}));a.submit(setForm(0));assert.equal(a.stored().sessions[0].entries.ex_0.sets[0].w,40);
});
test('stale writes are rejected even if the storage event has not yet arrived',t=>{
 const a=app(t,{state:fixture()}),other=fixture();M.logSet(other,'pull','ex_5',0,70,8);a.w.localStorage.setItem('wapp-v4',JSON.stringify(other));logFirst(a);assert.equal(a.stored().sessions[0].r,'pull');assert.match(a.q('#notice-text').textContent,/another tab/);
});

test('saved theme is applied on initialization without altering workout state',t=>{
 const a=app(t,{theme:'dark'});assert.equal(a.d.documentElement.dataset.theme,'dark');assert.equal(a.q('meta[name="theme-color"]').content,'#172337');assert.equal(a.w.localStorage.getItem('wapp-v4'),null);
});
test('export downloads complete workout data with independent sets and no removed tracking fields',async t=>{
 const a=app(t);logFirst(a);let exported,filename;
 a.w.URL.createObjectURL=blob=>{exported=blob;return 'blob:test';};a.w.URL.revokeObjectURL=()=>{};a.w.HTMLAnchorElement.prototype.click=function(){filename=this.download;};
 a.click('[data-act="settings"]');a.click('[data-category="backup"]');a.click('[data-act="export"]');assert.match(filename,/^workout-\d{4}-\d{2}-\d{2}\.json$/);
 const text=await new Promise((resolve,reject)=>{const reader=new a.w.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(exported);});const payload=JSON.parse(text);
 assert.deepEqual(Object.keys(payload),['v','ex','routines','sessions']);assert.equal(payload.sessions[0].entries.ex_0.sets[0].w,40);assert.deepEqual(M.normalize(payload),payload);
});
test('routine removal, reordering, rename, archive and restore preserve logs',t=>{
 const s=fixture();M.logSet(s,'push','ex_0',0,40,8);const a=app(t,{state:s});a.click('[data-act="edit-current-routine"]');a.type('#sheet [name="name"]','Push A');a.click('[data-act="move-down"][data-key="ex_0"]');a.click('[data-act="remove-from-routine"][data-key="ex_3"]');a.submit('#sheet form');
 assert.equal(a.q('#title').textContent,'Push A');assert.deepEqual(a.stored().routines[0].ex,['ex_1','ex_0','ex_2','ex_4']);assert(a.stored().sessions[0].ex.includes('ex_3'));
 a.click('[data-act="edit-current-routine"]');a.click('[data-act="archive-routine"]');assert.notEqual(a.q('#title').textContent,'Push A');assert.equal(a.stored().sessions[0].entries.ex_0.sets[0].w,40);
 a.click('[data-act="settings"]');a.click('[data-category="manager"]');a.click('[data-act="edit-routine"][data-id="push"]');a.click('[data-act="restore-routine"]');a.click('[data-act="close"]');a.click('[data-act="routine"][data-id="push"]');assert.equal(a.q('#title').textContent,'Push A');assert.match(a.q('#subtitle').textContent,/In progress/);
});
test('progression help is reachable and Back returns to Settings',t=>{
 const a=app(t);a.click('[data-act="settings"]');a.click('[data-category="rules"]');assert.equal(a.q('#sheet-title').textContent,'Progression rules');assert.match(a.q('#sheet-content').textContent,/Each set keeps its own weight/);a.click('#sheet-back');assert.equal(a.q('#sheet-title').textContent,'Settings');
});


test('compact exercise cards expand and collapse with focus retained on their toggle',t=>{
 const a=app(t),toggle='[data-act="expand"][data-key="ex_1"]';
 assert.equal(a.q('#sets-ex_1').hidden,true);a.q(toggle).focus();a.click(toggle);
 assert.equal(a.q('#sets-ex_0').hidden,true);assert.equal(a.q('#sets-ex_1').hidden,false);assert.equal(a.d.activeElement,a.q(toggle));
 a.click(toggle);assert.equal(a.q('#sets-ex_1').hidden,true);assert.equal(a.q(toggle).getAttribute('aria-expanded'),'false');assert.equal(a.d.activeElement,a.q(toggle));
});

test('correcting a logged set keeps its exercise open and returns focus to Edit',t=>{
 const a=app(t);logFirst(a);a.type(setForm(1)+' [name="weight"]','35');a.submit(setForm(1));
 const edit='[data-act="edit-set"][data-key="ex_0"][data-slot="0"]';a.click(edit);a.type(setForm(0)+' [name="reps"]','7');a.submit(setForm(0));
 assert.equal(a.stored().sessions[0].entries.ex_0.sets[0].reps,7);assert.equal(a.q('#sets-ex_0').hidden,false);assert.equal(a.q('#sets-ex_1').hidden,true);assert.equal(a.d.activeElement,a.q(edit));
});

test('weight Enter advances to reps and button logging does not reopen an input',t=>{
 const a=app(t),input=a.q(setForm(0)+' [name="weight"]');input.focus();a.type(setForm(0)+' [name="weight"]','40');
 input.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 assert.equal(a.d.activeElement,a.q(setForm(0)+' [name="reps"]'));assert.equal(a.w.localStorage.getItem('wapp-v4'),null);
 a.q(setForm(0)+' button').focus();a.submit(setForm(0));assert.equal(a.d.activeElement,a.q(setForm(1)+' button'));
});

test('progress begins with one useful empty state and shows only exercises with history',t=>{
 const a=app(t);a.click('#tab-progress');assert.equal(a.d.querySelectorAll('.progress-card').length,0);assert.match(a.q('#progress-view').textContent,/No progress yet/);
 a.click('#progress-view [data-act="view"]');assert.equal(a.q('#workout-view').hidden,false);logFirst(a);a.click('#tab-progress');assert.equal(a.d.querySelectorAll('.progress-card').length,1);
});

test('theme changes from another tab update Appearance without disturbing editor drafts',t=>{
 const a=app(t);a.click('[data-act="settings"]');a.click('[data-category="appearance"]');const choice=a.q('button[data-theme="light"]');choice.focus();
 a.w.dispatchEvent(new a.w.StorageEvent('storage',{key:'wtheme',newValue:'dark'}));assert.equal(a.q('button[data-theme="dark"]').getAttribute('aria-pressed'),'true');assert.equal(a.d.activeElement,choice);
 a.click('#sheet-back');a.click('[data-category="manager"]');a.click('[data-act="edit-exercise"][data-id="ex_0"]');a.type('#sheet [name="name"]','Unsaved name');const input=a.q('#sheet [name="name"]');
 a.w.dispatchEvent(new a.w.StorageEvent('storage',{key:'wtheme',newValue:'light'}));assert.equal(a.q('#sheet [name="name"]'),input);assert.equal(input.value,'Unsaved name');
});

test('set drafts remain protected from external reload after closing Settings',t=>{
 const a=app(t,{state:fixture()});a.type(setForm(0)+' [name="weight"]','31.25');a.click('[data-act="settings"]');a.click('[data-act="close"]');
 const other=fixture();M.logSet(other,'pull','ex_5',0,60,8);a.w.localStorage.setItem('wapp-v4',JSON.stringify(other));a.w.dispatchEvent(new a.w.StorageEvent('storage',{key:'wapp-v4'}));
 assert.equal(a.q(setForm(0)+' [name="weight"]').value,'31.25');assert.match(a.q('#notice-text').textContent,/changed/);a.submit(setForm(0));assert.equal(a.stored().sessions[0].r,'pull');
});


test('desktop Settings keeps its sidebar and switches categories without growing the Back stack',t=>{
 const a=app(t,{desktop:true});a.click('[data-act="settings"]');assert.equal(a.q('#settings-nav').hidden,false);assert.equal(a.q('#sheet-title').textContent,'Exercises & routines');assert.equal(a.q('#sheet-back').hidden,true);
 for(const category of ['appearance','backup','rules','manager','backup']){a.click(`[data-category="${category}"]`);assert.equal(a.q('#settings-nav [aria-current="page"]').dataset.category,category);assert.equal(a.q('#sheet-back').hidden,true);assert.equal(a.d.querySelectorAll('[data-act="settings-category"]').length,4);}
 a.click('[data-category="manager"]');a.click('[data-act="edit-exercise"][data-id="ex_0"]');assert.equal(a.q('#sheet-back').hidden,false);a.click('#sheet-back');assert.equal(a.q('#sheet-title').textContent,'Exercises & routines');assert.equal(a.q('#sheet-back').hidden,true);
});

test('mobile Settings starts with categories and returns focus to the category after Back',t=>{
 const a=app(t);a.click('[data-act="settings"]');assert.equal(a.q('#settings-nav').hidden,true);assert.equal(a.q('#sheet-title').textContent,'Settings');
 a.click('[data-category="backup"]');assert.equal(a.q('#sheet-title').textContent,'Backup & restore');assert.equal(a.d.querySelector('[data-act="settings-category"]'),null);
 a.click('#sheet-back');assert.equal(a.q('#sheet-title').textContent,'Settings');assert.equal(a.d.activeElement,a.q('[data-category="backup"]'));
});

test('resizing Settings preserves editor inputs and adapts its navigation',t=>{
 const a=app(t,{desktop:true});a.click('[data-act="settings"]');a.click('[data-act="edit-exercise"][data-id="ex_0"]');a.type('#sheet [name="name"]','Still editing');const input=a.q('#sheet [name="name"]');
 a.resizeDesktop(false);assert.equal(a.q('#settings-nav').hidden,true);assert.equal(a.q('#sheet [name="name"]'),input);assert.equal(input.value,'Still editing');assert.equal(a.q('#sheet-back').hidden,false);
 a.resizeDesktop(true);assert.equal(a.q('#settings-nav').hidden,false);assert.equal(a.q('#sheet [name="name"]'),input);
});

test('changing categories with an unsaved edit offers Keep editing or Discard without mutating data',t=>{
 const a=app(t,{desktop:true});a.click('[data-act="settings"]');a.click('[data-act="edit-exercise"][data-id="ex_0"]');a.type('#sheet [name="name"]','Draft name');
 a.click('[data-category="appearance"]');assert.equal(a.q('#sheet-unsaved').hidden,false);assert.equal(a.q('#sheet-title').textContent,'Edit exercise');
 a.click('[data-act="keep-editing"]');assert.equal(a.q('#sheet [name="name"]').value,'Draft name');assert.equal(a.q('#sheet-unsaved').hidden,true);
 a.click('[data-category="appearance"]');a.click('[data-act="discard-edits"]');assert.equal(a.q('#sheet-title').textContent,'Appearance');assert.equal(a.w.localStorage.getItem('wapp-v4'),null);
});

test('Escape and Close protect unsaved edits and Discard returns focus to the opener',t=>{
 const a=app(t,{desktop:true});a.q('[data-act="edit-current-routine"]').focus();a.click('[data-act="edit-current-routine"]');a.type('#sheet [name="name"]','Draft routine');
 a.q('#sheet').dispatchEvent(new a.w.Event('cancel',{cancelable:true}));assert.equal(a.q('#sheet').open,true);assert.equal(a.q('#sheet-unsaved').hidden,false);a.click('[data-act="keep-editing"]');
 a.click('[data-act="close"]');assert.equal(a.q('#sheet').open,true);a.click('[data-act="discard-edits"]');assert.equal(a.q('#sheet').open,false);assert.equal(a.d.activeElement,a.q('[data-act="edit-current-routine"]'));
});

test('saving a guarded edit returns to its settings category without a stale warning',t=>{
 const a=app(t,{desktop:true});a.click('[data-act="settings"]');a.click('[data-act="edit-exercise"][data-id="ex_0"]');a.type('#sheet [name="name"]','Saved press');a.click('[data-category="backup"]');
 a.submit('#sheet form');assert.equal(a.stored().ex[0].name,'Saved press');assert.equal(a.q('#sheet-title').textContent,'Exercises & routines');assert.equal(a.q('#sheet-unsaved').hidden,true);a.click('[data-category="backup"]');assert.equal(a.q('#sheet-title').textContent,'Backup & restore');
});


test('fresh installs open Full Body A with the optional fourth day clearly labeled',t=>{
 const a=app(t,{shippingDefaults:true});assert.equal(a.q('#title').textContent,'Full Body A');
 assert.equal(a.d.querySelectorAll('.exercise-card').length,8);assert.match(a.q('#subtitle').textContent,/0\/16/);
 assert.match(a.q('[data-act="routine"][data-id="optional"]').textContent,/Optional/);
 assert.match(a.q('#card-incline_press').textContent,/8–12 reps/);assert.equal(a.w.localStorage.getItem('wapp-v4'),null);
});

test('optional-day editing is saved and remains optional after renaming or reordering',t=>{
 const a=app(t,{shippingDefaults:true});a.click('[data-act="routine"][data-id="optional"]');a.click('[data-act="edit-current-routine"]');
 assert.equal(a.q('#sheet [name="optional"]').checked,true);a.type('#sheet [name="name"]','Extra day');a.click('[data-act="move-down"][data-key="lateral_raise"]');a.submit('#sheet form');
 assert.equal(a.stored().routines.find(r=>r.id==='optional').optional,true);assert.match(a.q('[data-id="optional"] .routine-meta').textContent,/Optional/);
 a.click('[data-act="edit-current-routine"]');a.q('#sheet [name="optional"]').click();a.submit('#sheet form');assert.equal(a.stored().routines.find(r=>r.id==='optional').optional,false);
});

test('per-set suggestions retain a lighter second set and do not force rep increases',t=>{
 const s=M.defaults();M.logSet(s,'full_a','incline_press',0,40,12);M.logSet(s,'full_a','incline_press',1,35,10);M.finish(s,'full_a',true);s.sessions[0].d='2020-01-01';
 const a=app(t,{state:s,shippingDefaults:true});a.click('[data-act="routine"][data-id="full_a"]');
 const base='#card-incline_press form';assert.equal(a.q(base+'[data-slot="0"] [name="weight"]').value,'40');assert.equal(a.q(base+'[data-slot="1"] [name="weight"]').value,'35');assert.equal(a.q(base+'[data-slot="1"] [name="reps"]').value,'10');
});

test('both sets reaching the top suggests the increment independently for each set',t=>{
 const s=M.defaults();M.logSet(s,'full_a','incline_press',0,40,12);M.logSet(s,'full_a','incline_press',1,35,12);M.finish(s,'full_a',true);s.sessions[0].d='2020-01-01';
 const a=app(t,{state:s,shippingDefaults:true});a.click('[data-act="routine"][data-id="full_a"]');
 assert.equal(a.q('#card-incline_press form[data-slot="0"] [name="weight"]').value,'42.5');assert.equal(a.q('#card-incline_press form[data-slot="1"] [name="weight"]').value,'37.5');assert.match(a.q('#card-incline_press .exercise-context').textContent,/Next: 42.5 \/ 37.5 kg/);
});

test('recovery prompt explains a plateau without changing either load',t=>{
 const s=M.defaults();for(let i=1;i<=3;i++){M.logSet(s,'full_a','incline_press',0,40,7);M.logSet(s,'full_a','incline_press',1,35,6);M.finish(s,'full_a',true);s.sessions.at(-1).d=`2020-01-0${i}`;}
 const a=app(t,{state:s,shippingDefaults:true});a.click('[data-act="routine"][data-id="full_a"]');assert.equal(a.q('#card-incline_press form[data-slot="0"] [name="weight"]').value,'40');a.click('[data-act="training-help"]');assert.match(a.q('#sheet-content').textContent,/Load never drops automatically/);assert.equal(a.q('#sheet-title').textContent,'Progression rules');
});
