const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../scripts/workout2-model.js');

test('default data round-trips with no nutrition or body-weight fields',()=>{
 const state=M.normalize(M.defaults());assert.deepEqual(M.normalize(JSON.parse(JSON.stringify(state))),state);
 assert.deepEqual(Object.keys(state),['v','ex','routines','sessions']);
});
test('logging a lighter second set preserves the first set and forbids false progression',()=>{
 const s=M.defaults();M.logSet(s,'push','ex_0',0,40,8);const session=M.logSet(s,'push','ex_0',1,35,6);
 assert.deepEqual(session.entries.ex_0.sets,[{w:40,reps:8},{w:35,reps:6}]);
 M.finish(s,'push',true);session.d='2020-01-01';
 assert.deepEqual(M.nextTarget(s.ex[0],M.index(s).history.get('ex_0')),{w:40,reps:8});
});
test('progression raises load only when both sets qualify',()=>{
 const s=M.defaults();M.logSet(s,'push','ex_0',0,40,8);M.logSet(s,'push','ex_0',1,40,6);const session=M.finish(s,'push',true);session.d='2020-01-01';
 assert.deepEqual(M.nextTarget(s.ex[0],M.index(s).history.get('ex_0')),{w:42.5,reps:6});
});
test('three below-range finished workouts deload; today and unfinished workouts do not change targets',()=>{
 const history=[1,2,3].map(i=>({d:`2020-01-0${i}`,status:'finished',sets:[{w:40,reps:5},null]}));
 assert.deepEqual(M.nextTarget(M.defaults().ex[0],history),{w:37.5,reps:6});
 history.push({d:M.today(),status:'finished',sets:[{w:80,reps:8},{w:80,reps:8}]});
 history.push({d:'2020-01-04',status:'active',sets:[{w:80,reps:8},{w:80,reps:8}]});
 assert.equal(M.nextTarget(M.defaults().ex[0],history).w,37.5);
});
test('unfinished workout is resumed after serialization and counted only when finished',()=>{
 let s=M.defaults();M.logSet(s,'push','ex_0',0,40,8);s=M.normalize(JSON.parse(JSON.stringify(s)));
 assert.equal(M.suggested(s),'push');assert.equal(M.index(s).routineStats.get('push').count,0);
 M.finish(s,'push',true);assert.equal(M.index(s).routineStats.get('push').count,1);assert.equal(M.suggested(s),'pull');
});
test('adding an unlogged exercise does not count as a finished workout',()=>{
 const s=M.defaults();M.addExercise(s,'push','ex_5');assert.equal(M.stats(s.sessions[0]).logged,0);assert.equal(M.index(s).routineStats.get('push').count,0);
 assert.throws(()=>M.finish(s,'push',true));
});
test('finish requires remaining sets to be explicitly skipped',()=>{
 const s=M.defaults();M.logSet(s,'push','ex_0',0,40,8);assert.throws(()=>M.finish(s,'push',false));
 const session=M.finish(s,'push',true);assert.deepEqual(M.stats(session),{logged:1,skipped:9,total:10,remaining:0});
});
test('same-day history deletion uses session ID and preserves the other routine',()=>{
 const s=M.defaults();const push=M.logSet(s,'push','ex_4',0,10,12);M.finish(s,'push',true);
 const pull=M.logSet(s,'pull','ex_4',0,20,12);M.finish(s,'pull',true);
 M.deleteHistory(s,pull.id,'ex_4');assert.equal(s.sessions.length,1);assert.equal(s.sessions[0].id,push.id);assert.equal(s.sessions[0].entries.ex_4.sets[0].w,10);
});
test('second-set-only workout remains in history but does not drive progression',()=>{
 const s=M.defaults();const session=M.logSet(s,'push','ex_0',1,40,6);M.finish(s,'push',true);session.d='2020-01-01';
 const history=M.index(s).history.get('ex_0');assert.equal(history.length,1);assert.equal(history[0].sets[0],null);assert.equal(M.nextTarget(s.ex[0],history),null);
});
test('routine order is explicit and an active session retains its snapshot',()=>{
 const s=M.defaults(),session=M.ensureSession(s,'push');M.reorder(s.routines[0].ex,4,0);
 assert.equal(s.routines[0].ex[0],'ex_4');assert.equal(session.ex[0],'ex_0');
});
test('all routines can be archived without inventing a null session',()=>{
 const s=M.defaults();s.routines.forEach(r=>r.archived=true);assert.equal(M.suggested(s),null);assert.throws(()=>M.ensureSession(s,null));
});
test('archiving exercises preserves logs and removes future routine membership',()=>{
 const s=M.defaults();M.logSet(s,'push','ex_4',0,10,12);M.archiveExercise(s,'ex_4');
 assert(s.ex[4].archived);assert(s.routines.every(r=>!r.ex.includes('ex_4')));assert.equal(M.index(s).history.get('ex_4').length,1);assert.equal(s.sessions[0].entries.ex_4.skipped,true);M.normalize(s);
});
test('zero baseline has no infinity percentage, negative progress stays negative',()=>{
 assert.equal(M.changePercent(0,10),null);assert.equal(M.changePercent(0,0),null);assert.equal(M.changePercent(40,20),-50);
});
test('malformed imports reject nested data, invalid references, duplicate IDs and non-finite values',()=>{
 const mutations=[s=>s.ex[0]=null,s=>s.ex[0].inc=Infinity,s=>s.ex[0].min=2.5,s=>s.ex[1].id=s.ex[0].id,s=>s.ex[1].name=' Overhead Press ',s=>s.routines[0].ex.push('missing'),s=>s.sessions.push({})];
 for(const mutate of mutations){const s=M.defaults();mutate(s);assert.throws(()=>M.normalize(s));}
 const s=M.defaults();M.logSet(s,'push','ex_0',0,40,8);s.sessions[0].entries.ex_0.sets[0].w=NaN;assert.throws(()=>M.normalize(s));
});
test('import rejects corrupt dates, duplicate active sessions and unsafe IDs',()=>{
 const s=M.defaults();const session=M.logSet(s,'push','ex_0',0,40,8);session.d='2026-02-31';assert.throws(()=>M.normalize(s));
 session.d=M.today();s.sessions.push({...M.clone(session),id:'another'});assert.throws(()=>M.normalize(s));
 s.sessions.pop();s.ex[0].id='__proto__';assert.throws(()=>M.normalize(s));
});
test('existing v2 histories upgrade without body-weight or calorie data and retain partial sets',()=>{
 const old={v:2,ex:[{name:'Press',min:6,max:8,inc:2.5}],routines:[{name:'Push',ex:['Press']}],sessions:[{d:'2020-01-01',r:'Push',sets:{Press:{w:40,r:[null,6]}}}],cal:{},wt:[]};
 const s=M.normalize(old);assert.equal(s.v,3);assert.deepEqual(Object.keys(s),['v','ex','routines','sessions']);assert.deepEqual(s.sessions[0].entries[s.ex[0].id].sets,[null,{w:40,reps:6}]);
});
test('v2 current incomplete workout retains all routine exercises to finish',()=>{
 const old={v:2,ex:[{name:'Press',min:6,max:8,inc:2.5},{name:'Row',min:6,max:8,inc:2.5}],routines:[{name:'Push',ex:['Press','Row']}],sessions:[{d:M.today(),r:'Push',sets:{Press:{w:40,r:[8,null]}}}]};
 const s=M.normalize(old);assert.equal(s.sessions[0].status,'active');assert.equal(M.stats(s.sessions[0]).remaining,3);
});
test('v2 malformed nested entries reject before any conversion can be used',()=>{
 assert.throws(()=>M.normalize({v:2,ex:[null],routines:[],sessions:[]}));
});
