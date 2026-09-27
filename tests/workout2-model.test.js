const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../scripts/workout2-model.js');
const {fixture}=require('./workout2-fixtures.js');

test('default data round-trips with no nutrition or body-weight fields',()=>{
 const state=M.normalize(M.defaults());assert.deepEqual(M.normalize(JSON.parse(JSON.stringify(state))),state);
 assert.deepEqual(Object.keys(state),['v','ex','routines','sessions']);
});
test('logging a lighter second set preserves the first set and forbids false progression',()=>{
 const s=fixture();M.logSet(s,'push','ex_0',0,40,8);const session=M.logSet(s,'push','ex_0',1,35,6);
 assert.deepEqual(session.entries.ex_0.sets,[{w:40,reps:8},{w:35,reps:6}]);
 M.finish(s,'push',true);session.d='2020-01-01';
 assert.deepEqual(M.nextTarget(s.ex[0],M.index(s).history.get('ex_0')),{sets:[{w:40,reps:8},{w:35,reps:6}],increase:false,review:false});
});
test('progression waits for both sets to reach the top of the range',()=>{
 const s=fixture();M.logSet(s,'push','ex_0',0,40,8);M.logSet(s,'push','ex_0',1,40,6);const session=M.finish(s,'push',true);session.d='2020-01-01';
 assert.equal(M.nextTarget(s.ex[0],M.index(s).history.get('ex_0')).increase,false);
 session.entries.ex_0.sets[1].reps=8;
 assert.deepEqual(M.nextTarget(s.ex[0],M.index(s).history.get('ex_0')),{sets:[{w:42.5,reps:6},{w:42.5,reps:6}],increase:true,review:false});
});

test('three comparable poor workouts prompt review without automatically lowering load',()=>{
 const history=[1,2,3].map(i=>({d:`2020-01-0${i}`,status:'finished',sets:[{w:40,reps:5},{w:35,reps:4}]}));
 const expected={sets:[{w:40,reps:6},{w:35,reps:6}],increase:false,review:true};
 assert.deepEqual(M.nextTarget(fixture().ex[0],history),expected);
 history.push({d:M.today(),status:'finished',sets:[{w:80,reps:8},{w:80,reps:8}]});
 history.push({d:'2020-01-04',status:'active',sets:[{w:80,reps:8},{w:80,reps:8}]});
 assert.deepEqual(M.nextTarget(fixture().ex[0],history),expected);
});

test('unfinished workout is resumed after serialization and counted only when finished',()=>{
 let s=fixture();M.logSet(s,'push','ex_0',0,40,8);s=M.normalize(JSON.parse(JSON.stringify(s)));
 assert.equal(M.suggested(s),'push');assert.equal(M.index(s).routineStats.get('push').count,0);
 M.finish(s,'push',true);assert.equal(M.index(s).routineStats.get('push').count,1);assert.equal(M.suggested(s),'pull');
});
test('adding an unlogged exercise does not count as a finished workout',()=>{
 const s=fixture();M.addExercise(s,'push','ex_5');assert.equal(M.stats(s.sessions[0]).logged,0);assert.equal(M.index(s).routineStats.get('push').count,0);
 assert.throws(()=>M.finish(s,'push',true));
});
test('finish requires remaining sets to be explicitly skipped',()=>{
 const s=fixture();M.logSet(s,'push','ex_0',0,40,8);assert.throws(()=>M.finish(s,'push',false));
 const session=M.finish(s,'push',true);assert.deepEqual(M.stats(session),{logged:1,skipped:9,total:10,remaining:0});
});
test('same-day history deletion uses session ID and preserves the other routine',()=>{
 const s=fixture();const push=M.logSet(s,'push','ex_4',0,10,12);M.finish(s,'push',true);
 const pull=M.logSet(s,'pull','ex_4',0,20,12);M.finish(s,'pull',true);
 M.deleteHistory(s,pull.id,'ex_4');assert.equal(s.sessions.length,1);assert.equal(s.sessions[0].id,push.id);assert.equal(s.sessions[0].entries.ex_4.sets[0].w,10);
});
test('second-set-only workout remains in history but does not drive progression',()=>{
 const s=fixture();const session=M.logSet(s,'push','ex_0',1,40,6);M.finish(s,'push',true);session.d='2020-01-01';
 const history=M.index(s).history.get('ex_0');assert.equal(history.length,1);assert.equal(history[0].sets[0],null);assert.equal(M.nextTarget(s.ex[0],history),null);
});
test('routine order is explicit and an active session retains its snapshot',()=>{
 const s=fixture(),session=M.ensureSession(s,'push');M.reorder(s.routines[0].ex,4,0);
 assert.equal(s.routines[0].ex[0],'ex_4');assert.equal(session.ex[0],'ex_0');
});
test('all routines can be archived without inventing a null session',()=>{
 const s=fixture();s.routines.forEach(r=>r.archived=true);assert.equal(M.suggested(s),null);assert.throws(()=>M.ensureSession(s,null));
});
test('archiving exercises preserves logs and removes future routine membership',()=>{
 const s=fixture();M.logSet(s,'push','ex_4',0,10,12);M.archiveExercise(s,'ex_4');
 assert(s.ex[4].archived);assert(s.routines.every(r=>!r.ex.includes('ex_4')));assert.equal(M.index(s).history.get('ex_4').length,1);assert.equal(s.sessions[0].entries.ex_4.skipped,true);M.normalize(s);
});
test('zero baseline has no infinity percentage, negative progress stays negative',()=>{
 assert.equal(M.changePercent(0,10),null);assert.equal(M.changePercent(0,0),null);assert.equal(M.changePercent(40,20),-50);
});
test('malformed imports reject nested data, invalid references, duplicate IDs and non-finite values',()=>{
 const mutations=[s=>s.ex[0]=null,s=>s.ex[0].inc=Infinity,s=>s.ex[0].min=2.5,s=>s.ex[1].id=s.ex[0].id,s=>s.ex[1].name=' Overhead Press ',s=>s.routines[0].ex.push('missing'),s=>s.sessions.push({})];
 for(const mutate of mutations){const s=fixture();mutate(s);assert.throws(()=>M.normalize(s));}
 const s=fixture();M.logSet(s,'push','ex_0',0,40,8);s.sessions[0].entries.ex_0.sets[0].w=NaN;assert.throws(()=>M.normalize(s));
});
test('import rejects corrupt dates, duplicate active sessions and unsafe IDs',()=>{
 const s=fixture();const session=M.logSet(s,'push','ex_0',0,40,8);session.d='2026-02-31';assert.throws(()=>M.normalize(s));
 session.d=M.today();s.sessions.push({...M.clone(session),id:'another'});assert.throws(()=>M.normalize(s));
 s.sessions.pop();s.ex[0].id='__proto__';assert.throws(()=>M.normalize(s));
});
test('old workout formats are rejected without migration',()=>{
 for(const v of [2,3])assert.throws(()=>M.normalize({...M.defaults(),v}),/Unsupported workout format/);
});

test('three full-body defaults provide the planned volume without the optional day',()=>{
 const s=M.defaults(),main=s.routines.filter(r=>!r.optional);
 assert.equal(s.v,4);assert.equal(main.length,3);assert.equal(s.routines.filter(r=>r.optional).length,1);
 assert.deepEqual(main.map(r=>r.ex.length),[8,7,7]);assert.equal(main[0].ex[0],'incline_press');
 const sets=keys=>main.reduce((sum,r)=>sum+r.ex.filter(key=>keys.includes(key)).length*2,0);
 assert.equal(sets(['incline_press','chest_press','fly']),8);
 assert.equal(sets(['pulldown','row']),8);assert.equal(sets(['lateral_raise']),6);
 assert.equal(sets(['leg_extension']),6);assert.equal(sets(['leg_curl']),6);
 assert(!s.ex.some(e=>['hack_squat','rdl','calf_raise'].includes(e.id))); assert.equal(sets(['crunch']),4);
 assert.equal(s.ex.find(e=>e.id==='lateral_raise').inc,.5);
 assert.equal(s.ex.find(e=>e.id==='lateral_raise').max,20);
});

test('optional sessions never displace the main rotation but unfinished ones resume',()=>{
 const s=M.defaults();assert.equal(M.suggested(s),'full_a');
 for(const [i,id] of ['full_a','full_b','full_c'].entries()){
  const key=s.routines.find(r=>r.id===id).ex[0];M.logSet(s,id,key,0,40,8);const session=M.finish(s,id,true);session.d=`2020-01-0${i+1}`;
 }
 assert.equal(M.suggested(s),'full_a');M.logSet(s,'optional','lateral_raise',0,5,15);assert.equal(M.suggested(s),'optional');
 M.finish(s,'optional',true);assert.equal(M.suggested(s),'full_a');
 s.routines.filter(r=>!r.optional).forEach(r=>r.archived=true);assert.equal(M.suggested(s),'optional');
});

test('completed back-off sets retain their separate weights when both are ready to advance',()=>{
 const def={min:8,max:12,inc:2.5},history=[{d:'2020-01-01',status:'finished',sets:[{w:40,reps:12},{w:35,reps:12}]}];
 assert.deepEqual(M.nextTarget(def,history),{sets:[{w:42.5,reps:8},{w:37.5,reps:8}],increase:true,review:false});
});

test('repeating in-range reps does not force an extra rep into either set',()=>{
 const history=[{d:'2020-01-01',status:'finished',sets:[{w:40,reps:10},{w:35,reps:9}]}];
 assert.deepEqual(M.nextTarget({min:8,max:12,inc:2.5},history).sets,[{w:40,reps:10},{w:35,reps:9}]);
});

test('a newer partial session suppresses an older increase recommendation',()=>{
 const history=[{d:'2020-01-01',status:'finished',sets:[{w:40,reps:12},{w:40,reps:12}]},{d:'2020-01-02',status:'finished',sets:[{w:42.5,reps:8},null]}];
 assert.equal(M.nextTarget({min:8,max:12,inc:2.5},history),null);
});

test('plateau review resets after a load change or partial session and recognizes progress in set 2',()=>{
 const def={min:8,max:12,inc:2.5},history=[1,2,3].map(i=>({d:`2020-01-0${i}`,status:'finished',sets:[{w:40,reps:10},{w:35,reps:8}]}));
 assert.equal(M.nextTarget(def,history).review,true);
 history[2].sets[1].reps=9;assert.equal(M.nextTarget(def,history).review,false);
 history[2].sets[1].reps=8;history[2].sets[0].w=42.5;assert.equal(M.nextTarget(def,history).review,false);
 history[2].sets[0].w=40;history[1].sets[1]=null;assert.equal(M.nextTarget(def,history).review,false);
});

test('disabled progression yields no targets and small increments retain decimal precision',()=>{
 const history=[{d:'2020-01-01',status:'finished',sets:[{w:5.1,reps:20},{w:4.1,reps:20}]}];
 assert.equal(M.nextTarget({min:12,max:20,inc:0},history),null);
 assert.deepEqual(M.nextTarget({min:12,max:20,inc:.5},history).sets,[{w:5.6,reps:12},{w:4.6,reps:12}]);
});

test('optional-day flags must be valid and survive a backup round-trip',()=>{
 const s=M.defaults();assert.equal(M.normalize(JSON.parse(JSON.stringify(s))).routines.at(-1).optional,true);
 s.routines[0].optional='yes';assert.throws(()=>M.normalize(s));
});
