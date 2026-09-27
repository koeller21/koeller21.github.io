const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../scripts/workout-model.js');
const {fixture}=require('./workout-fixtures.js');

test('default data round-trips with no nutrition or body-weight fields',()=>{
 const state=M.normalize(M.defaults());assert.deepEqual(M.normalize(JSON.parse(JSON.stringify(state))),state);
 assert.deepEqual(Object.keys(state),['v','ex','routines','sessions']);
});
test('logging a lighter second set preserves the first set and forbids false progression',()=>{
 const s=fixture();M.logSet(s,'push','ex_0',0,40,8);const session=M.logSet(s,'push','ex_0',1,35,6);
 assert.deepEqual(session.entries.ex_0.sets,[{w:40,reps:8},{w:35,reps:6}]);
 M.finish(s,'push');session.d='2020-01-01';
 assert.deepEqual(M.nextTarget(s.ex[0],M.index(s).history.get('ex_0')),{sets:[{w:40,reps:8},{w:35,reps:6}],increase:false,review:false});
});
test('progression waits for both sets to reach the top of the range',()=>{
 const s=fixture();M.logSet(s,'push','ex_0',0,40,8);M.logSet(s,'push','ex_0',1,40,6);const session=M.finish(s,'push');session.d='2020-01-01';
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
 M.finish(s,'push');assert.equal(M.index(s).routineStats.get('push').count,1);assert.equal(M.suggested(s),'pull');
});
test('adding an unlogged exercise does not count as a finished workout',()=>{
 const s=fixture();M.addExercise(s,'push','ex_5');assert.equal(M.stats(s.sessions[0]).logged,0);assert.equal(M.index(s).routineStats.get('push').count,0);
 assert.throws(()=>M.finish(s,'push'));
});
test('finish skips only unlogged sets and preserves completed and partial exercises',()=>{
 const s=fixture();M.logSet(s,'push','ex_0',0,40,8);M.logSet(s,'push','ex_0',1,35,7);M.logSet(s,'push','ex_1',1,30,6);
 const session=M.finish(s,'push');assert.equal(session.status,'finished');assert.deepEqual(M.stats(session),{logged:3,skipped:7,total:10,remaining:0});
 assert.deepEqual(session.entries.ex_0,{sets:[{w:40,reps:8},{w:35,reps:7}],skipped:false});
 assert.deepEqual(session.entries.ex_1,{sets:[null,{w:30,reps:6}],skipped:true});
 assert.deepEqual(session.entries.ex_2,{sets:[null,null],skipped:true});M.normalize(s);
});
test('same-day history deletion uses session ID and preserves the other routine',()=>{
 const s=fixture();const push=M.logSet(s,'push','ex_4',0,10,12);M.finish(s,'push');
 const pull=M.logSet(s,'pull','ex_4',0,20,12);M.finish(s,'pull');
 M.deleteHistory(s,pull.id,'ex_4');assert.equal(s.sessions.length,1);assert.equal(s.sessions[0].id,push.id);assert.equal(s.sessions[0].entries.ex_4.sets[0].w,10);
});
test('second-set-only workout remains in history but does not drive progression',()=>{
 const s=fixture();const session=M.logSet(s,'push','ex_0',1,40,6);M.finish(s,'push');session.d='2020-01-01';
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
  const key=s.routines.find(r=>r.id===id).ex[0];M.logSet(s,id,key,0,40,8);const session=M.finish(s,id);session.d=`2020-01-0${i+1}`;
 }
 assert.equal(M.suggested(s),'full_a');M.logSet(s,'optional','lateral_raise',0,5,15);assert.equal(M.suggested(s),'optional');
 M.finish(s,'optional');assert.equal(M.suggested(s),'full_a');
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


test('import rejects exercise IDs inherited from Object.prototype',()=>{
 for(const key of ['toString','valueOf','hasOwnProperty','isPrototypeOf','propertyIsEnumerable','toLocaleString']){
  const s=M.defaults();s.ex[0].id=key;s.routines.forEach(r=>r.ex=r.ex.map(id=>id==='incline_press'?key:id));assert.throws(()=>M.normalize(s),/Invalid exercise definition/);
 }
});

test('archiving a completed exercise in an active workout does not mark its sets skipped',()=>{
 const s=fixture();M.logSet(s,'push','ex_0',0,40,8);M.logSet(s,'push','ex_0',1,40,8);M.archiveExercise(s,'ex_0');
 assert.equal(s.sessions[0].entries.ex_0.skipped,false);assert.deepEqual(M.stats(s.sessions[0]),{logged:2,skipped:0,total:10,remaining:8});
});


test('seeded model fuzz preserves valid state and set accounting through 10,000 operations',()=>{
 for(let seed=1;seed<=40;seed++){
  let n=seed,s=M.defaults();const random=max=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n%max;};
  for(let step=0;step<250;step++){
   const routine=s.routines[random(s.routines.length)],available=s.ex.filter(e=>!e.archived),key=available[random(available.length)]?.id;
   const active=M.sessionFor(s,routine.id),planned=active?.ex||routine.ex,exercise=planned[random(planned.length)];
   switch(random(8)){
    case 0:if(exercise)M.logSet(s,routine.id,exercise,random(2),random(50000)/100,1+random(30));break;
    case 1:if(exercise)M.skipExercise(s,routine.id,exercise,!!random(2));break;
    case 2:if(active&&M.stats(active).logged)M.finish(s,routine.id);break;
    case 3:if(key)M.addExercise(s,routine.id,key);break;
    case 4:if(key)M.archiveExercise(s,key);break;
    case 5:if(s.sessions.length){const session=s.sessions[random(s.sessions.length)],keys=Object.keys(session.entries);if(keys.length)M.deleteHistory(s,session.id,keys[random(keys.length)]);}break;
    case 6:if(routine.ex.length)M.reorder(routine.ex,random(routine.ex.length),random(routine.ex.length));break;
    case 7:s.ex[random(s.ex.length)].archived=false;break;
   }
   const roundTrip=M.normalize(JSON.parse(JSON.stringify(s)));assert.deepEqual(M.normalize(roundTrip),roundTrip,`seed ${seed}, step ${step}`);s=roundTrip;
   for(const session of s.sessions){const counts=M.stats(session);assert(counts.remaining>=0);assert.equal(counts.logged+counts.skipped+counts.remaining,counts.total);}
   assert.doesNotThrow(()=>M.index(s));
  }
 }
});

test('JSON value fuzz rejects invalid fields and round-trips accepted values without mutation',()=>{
 const values=[null,true,false,{},[],0,-1,1.5,'','NaN','<img src=x onerror=alert(1)>'];
 const mutations=[
  [s=>v=>s.ex=v,()=>false],
  [s=>v=>s.routines=v,Array.isArray],
  [s=>v=>s.sessions=v,Array.isArray],
  [s=>v=>s.ex[0].archived=v,v=>typeof v==='boolean'],
  [s=>v=>s.routines[0].optional=v,v=>typeof v==='boolean'],
  [s=>v=>s.ex[0].id=v,()=>false]
 ];
 for(const value of values)for(const [mutate,valid] of mutations){
  const s=M.defaults();mutate(s)(value);const raw=JSON.stringify(s);
  if(valid(value)){const accepted=M.normalize(s);M.index(accepted);assert.deepEqual(M.normalize(JSON.parse(JSON.stringify(accepted))),accepted);}
  else assert.throws(()=>M.normalize(s));
  assert.equal(JSON.stringify(s),raw);
 }
});
