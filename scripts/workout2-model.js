/* Workout data and rules. No DOM or storage access. */
(function(root){
'use strict';
const clone = value => JSON.parse(JSON.stringify(value));
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const round = value => Math.round(value * 100) / 100;
let sequence = 0;
function id(){ return 'id_' + (root.crypto?.randomUUID?.() || Date.now().toString(36) + '_' + (++sequence) + '_' + Math.random().toString(36).slice(2)); }
function today(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function assert(ok, message){ if(!ok) throw new Error(message); }
function object(v){ return v && typeof v === 'object' && !Array.isArray(v); }
function number(v, min, max){ return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max; }
function name(v){ return typeof v === 'string' && v.trim().length > 0 && v.length <= 100; }
function identifier(v){ return typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v) && !['__proto__','constructor','prototype'].includes(v); }
function date(v){ return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v; }
function unique(values){ return new Set(values).size === values.length; }
function exerciseRules(e){ return name(e.name) && Number.isInteger(e.min) && Number.isInteger(e.max) && number(e.min,1,1000) && number(e.max,e.min,1000) && number(e.inc,0,10000); }

function defaults(){
 const definitions = [
  ['Overhead Press',6,8,2.5],['Incline Chest Press',6,8,2.5],['Triceps Extension',8,10,1.25],
  ['Lateral Raises',10,12,1.25],['Abs',12,20,1.25],['Lat Pulldown',6,8,2.5],['Seated Row',8,10,2.5],
  ['Deadlift',5,8,2.5],['Biceps Curl',8,10,1.25],['Hack Squat',8,12,2.5],['Leg Extension',10,15,1.25],['Leg Curl',8,10,1.25]
 ];
 return {v:3, ex:definitions.map((e,i)=>({id:'ex_'+i,name:e[0],min:e[1],max:e[2],inc:e[3],archived:false})),
  routines:[{id:'push',name:'Push',ex:[0,1,2,3,4]},{id:'pull',name:'Pull',ex:[5,6,7,8,4]},{id:'legs',name:'Legs',ex:[9,10,11]}].map(r=>({...r,ex:r.ex.map(i=>'ex_'+i),archived:false})), sessions:[]};
}

/* Preserve existing v2 workout history when upgrading the set representation. */
function fromV2(p){
 assert(Array.isArray(p.ex) && Array.isArray(p.routines) && Array.isArray(p.sessions),'Missing workout lists.');
 assert(p.ex.every(e=>object(e) && exerciseRules(e)) && unique(p.ex.map(e=>e.name)),'Invalid or duplicate exercises.');
 assert(p.routines.every(r=>object(r) && name(r.name) && Array.isArray(r.ex) && r.ex.every(name) && unique(r.ex)) && unique(p.routines.map(r=>r.name)),'Invalid routines.');
 const s={v:3,ex:p.ex.map(e=>({id:id(),name:e.name,min:e.min,max:e.max,inc:e.inc,archived:false})),routines:[],sessions:[]};
 const exercise = n => { let e=s.ex.find(x=>x.name===n); if(!e){ e={id:id(),name:n,min:1,max:20,inc:0,archived:true};s.ex.push(e); } return e.id; };
 s.routines=p.routines.map(r=>({id:id(),name:r.name,ex:r.ex.map(exercise),archived:false}));
 p.sessions.forEach(old=>{
  assert(object(old) && date(old.d) && name(old.r) && object(old.sets),'Invalid workout session.');
  let routine=s.routines.find(r=>r.name===old.r);
  if(!routine){routine={id:id(),name:old.r,ex:[],archived:true};s.routines.push(routine);}
  const entries={}, ex=[];
  Object.keys(old.sets).forEach(n=>{
   const value=old.sets[n];
   assert(name(n) && object(value) && number(value.w,0,100000) && Array.isArray(value.r) && value.r.length===2 && value.r.every(r=>r===null || (Number.isInteger(r) && number(r,1,1000))),'Invalid logged set.');
   const key=exercise(n);ex.push(key);entries[key]={sets:value.r.map(reps=>reps===null ? null : {w:value.w,reps}),skipped:false};
  });
  const complete=ex.length>0 && routine.ex.every(key=>own(entries,key) && entries[key].sets.every(Boolean));
  const active=old.d===today() && !complete;
  s.sessions.push({id:id(),d:old.d,r:routine.id,ex:active ? [...new Set([...routine.ex,...ex])] : ex,entries,status:active ? 'active' : 'finished'});
 });
 return s;
}

function normalize(input){
 assert(object(input),'Expected a workout data object.');
 const p=input.v===2 ? fromV2(input) : input;
 assert(p.v===3 && Array.isArray(p.ex) && Array.isArray(p.routines) && Array.isArray(p.sessions),'Unsupported workout format.');
 assert(p.ex.every(e=>object(e) && identifier(e.id) && exerciseRules(e) && typeof e.archived==='boolean'),'Invalid exercise definition.');
 assert(unique(p.ex.map(e=>e.id)) && unique(p.ex.map(e=>e.name.trim().toLowerCase())),'Duplicate exercises.');
 const exIds=new Set(p.ex.map(e=>e.id));
 assert(p.routines.every(r=>object(r) && identifier(r.id) && name(r.name) && typeof r.archived==='boolean' && Array.isArray(r.ex) && unique(r.ex) && r.ex.every(key=>exIds.has(key))),'Invalid routine definition.');
 assert(unique(p.routines.map(r=>r.id)) && unique(p.routines.map(r=>r.name.trim().toLowerCase())),'Duplicate routines.');
 const routineIds=new Set(p.routines.map(r=>r.id));
 const sessions=p.sessions.map(s=>{
  assert(object(s) && identifier(s.id) && date(s.d) && routineIds.has(s.r) && ['active','finished'].includes(s.status) && Array.isArray(s.ex) && unique(s.ex) && s.ex.every(key=>exIds.has(key)) && object(s.entries),'Invalid session.');
  assert(Object.keys(s.entries).every(key=>s.ex.includes(key)),'Session contains an unknown exercise.');
  const entries={};
  Object.keys(s.entries).forEach(key=>{
   const e=s.entries[key];
   assert(object(e) && typeof e.skipped==='boolean' && Array.isArray(e.sets) && e.sets.length===2 && e.sets.every(set=>set===null || (object(set) && number(set.w,0,100000) && Number.isInteger(set.reps) && number(set.reps,1,1000))),'Invalid set values.');
   entries[key]={sets:e.sets.map(set=>set ? {w:set.w,reps:set.reps} : null),skipped:e.skipped};
  });
  return {id:s.id,d:s.d,r:s.r,ex:s.ex.slice(),entries,status:s.status};
 });
 assert(unique(sessions.map(s=>s.id)),'Duplicate session IDs.');
 assert(unique(sessions.filter(s=>s.status==='active').map(s=>s.r)),'A routine has multiple unfinished workouts.');
 sessions.sort((a,b)=>a.d.localeCompare(b.d));
 return {v:3,ex:p.ex.map(e=>({id:e.id,name:e.name.trim(),min:e.min,max:e.max,inc:e.inc,archived:e.archived})),routines:p.routines.map(r=>({id:r.id,name:r.name.trim(),ex:r.ex.slice(),archived:r.archived})),sessions};
}

function stats(session){
 let logged=0,skipped=0;
 if(session) session.ex.forEach(key=>{
  const e=session.entries[key];const count=e ? e.sets.filter(Boolean).length : 0;
  logged+=count;if(e?.skipped) skipped+=2-count;
 });
 const total=session ? session.ex.length*2 : 0;
 return {logged,skipped,total,remaining:total-logged-skipped};
}
function index(state){
 const exercises=new Map(state.ex.map(e=>[e.id,e])), routines=new Map(state.routines.map(r=>[r.id,r]));
 const history=new Map(), routineStats=new Map();
 state.routines.forEach(r=>routineStats.set(r.id,{count:0,last:null,active:null}));
 state.sessions.forEach(s=>{
  const rs=routineStats.get(s.r), counts=stats(s);
  if(s.status==='active') rs.active=s;
  if(s.status==='finished' && counts.logged){rs.count++;rs.last=s.d;}
  s.ex.forEach(key=>{
   const e=s.entries[key];
   if(e?.sets.some(Boolean)){if(!history.has(key)) history.set(key,[]);history.get(key).push({session:s.id,d:s.d,r:s.r,sets:e.sets,status:s.status});}
  });
 });
 return {exercises,routines,history,routineStats};
}
function suggested(state, ix=index(state)){
 const available=state.routines.filter(r=>!r.archived);
 const active=state.sessions.slice().reverse().find(s=>s.status==='active' && available.some(r=>r.id===s.r));
 if(active) return active.r;
 return available.slice().sort((a,b)=>(ix.routineStats.get(a.id).last||'').localeCompare(ix.routineStats.get(b.id).last||''))[0]?.id || null;
}
function nextTarget(def, history, day=today()){
 const prior=history.filter(e=>e.d<day && e.status==='finished' && e.sets[0]);
 if(!def.inc || !prior.length) return null;
 const last=prior[prior.length-1],first=last.sets[0],second=last.sets[1];
 if(first.reps>=def.max && second && second.w>=first.w && second.reps>=def.min) return {w:round(first.w+def.inc),reps:def.min};
 if(first.reps>=def.min) return {w:first.w,reps:Math.min(first.reps+1,def.max)};
 let stalls=0;
 for(let i=prior.length-1;i>=0 && prior[i].sets[0].reps<def.min;i--) stalls++;
 return {w:stalls>=3 ? Math.max(0,round(first.w-def.inc)) : first.w,reps:def.min};
}
function estimate(sets){ return Math.max(...sets.filter(Boolean).map(s=>s.w*(1+s.reps/30))); }
function changePercent(first,last){return first>0 ? Math.round((last/first-1)*100) : null;}
function sessionFor(state,routineId){return state.sessions.find(s=>s.r===routineId && s.status==='active') || null;}
function ensureSession(state,routineId){
 let session=sessionFor(state,routineId);
 if(!session){const r=state.routines.find(r=>r.id===routineId && !r.archived);assert(r,'Choose a routine first.');session={id:id(),d:today(),r:r.id,ex:r.ex.filter(key=>!state.ex.find(e=>e.id===key).archived),entries:{},status:'active'};state.sessions.push(session);}
 return session;
}
function logSet(state,routineId,key,slot,w,reps){
 assert([0,1].includes(slot) && number(w,0,100000) && Number.isInteger(reps) && number(reps,1,1000),'Enter a valid weight and whole-number reps.');
 const s=ensureSession(state,routineId);assert(s.ex.includes(key),'Exercise is not in this workout.');
 const e=s.entries[key] ||= {sets:[null,null],skipped:false};e.sets[slot]={w:round(w),reps};e.skipped=false;
 return s;
}
function skipExercise(state,routineId,key,skipped){
 const s=ensureSession(state,routineId);assert(s.ex.includes(key),'Exercise is not in this workout.');
 const e=s.entries[key] ||= {sets:[null,null],skipped:false};e.skipped=skipped;return s;
}
function finish(state,routineId,skipRemaining){
 const s=sessionFor(state,routineId);assert(s && stats(s).logged,'Log at least one set before finishing.');
 if(skipRemaining) s.ex.forEach(key=>{const e=s.entries[key] ||= {sets:[null,null],skipped:false};if(e.sets.some(x=>!x))e.skipped=true;});
 assert(stats(s).remaining===0,'Log or skip the remaining sets.');s.status='finished';return s;
}
function deleteHistory(state,sessionId,key){
 const s=state.sessions.find(s=>s.id===sessionId);assert(s && own(s.entries,key),'History entry no longer exists.');
 delete s.entries[key];
 if(s.status==='finished'){s.ex=s.ex.filter(x=>x!==key);if(!stats(s).logged)state.sessions=state.sessions.filter(x=>x!==s);}
}
function addExercise(state,routineId,key){const s=ensureSession(state,routineId);assert(state.ex.some(e=>e.id===key && !e.archived),'Exercise no longer exists.');if(!s.ex.includes(key))s.ex.push(key);return s;}
function reorder(values,from,to){assert(from>=0 && from<values.length && to>=0 && to<values.length,'Invalid exercise order.');const [item]=values.splice(from,1);values.splice(to,0,item);}
function archiveExercise(state,key){
 const e=state.ex.find(e=>e.id===key);assert(e,'Exercise no longer exists.');e.archived=true;
 state.routines.forEach(r=>{r.ex=r.ex.filter(x=>x!==key);});
 state.sessions.filter(s=>s.status==='active').forEach(s=>{if(s.ex.includes(key)){const entry=s.entries[key] ||= {sets:[null,null],skipped:false};entry.skipped=true;}});
}
const api={clone,id,today,round,defaults,normalize,stats,index,suggested,nextTarget,estimate,changePercent,sessionFor,ensureSession,logSet,skipExercise,finish,deleteHistory,addExercise,reorder,archiveExercise};
if(typeof module==='object' && module.exports) module.exports=api;else root.WorkoutModel=api;
})(typeof globalThis==='object' ? globalThis : this);
