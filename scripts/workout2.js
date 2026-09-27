'use strict';
const M = WorkoutModel, KEY = 'wapp';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatDate = d => d.split('-').reverse().join('.');
let state, ix, routineId=null, mode='workout', activeExercise=null, editingSet=null;
let undo=null, sheetStack=[], sheetReturnFocus=null, routineDraft=null, draftDirty=false, externalPending=false, storedSnapshot=null, loadFailed=false;
const dialog=$('sheet'), content=$('sheet-content'), wide=matchMedia('(min-width: 900px)');
const renderedCards=new WeakMap(), setDrafts=new Map();

function notice(message,isError=false){
 const prefix=dialog.open?'sheet-':'';
 $('notice').hidden=dialog.open;$('sheet-notice').hidden=!dialog.open;
 $(prefix+'notice-text').textContent=message;$(prefix+'notice').classList.toggle('error',isError);$(prefix+'undo').hidden=!undo;
}
function persist(next){const raw=JSON.stringify(next);localStorage.setItem(KEY,raw);storedSnapshot=raw;}
function commit(label,mutate,{undoable=true,allowRecovery=false,after}={}){
 try{
  if(loadFailed&&!allowRecovery)throw new Error('Import a valid backup before editing.');
  if(externalPending || localStorage.getItem(KEY)!==storedSnapshot){externalPending=true;throw new Error('Data changed in another tab. Reload before saving.');}
  const focus=document.activeElement,previous=state,next=M.clone(state);mutate(next);
  const checked=M.normalize(next);persist(checked);state=checked;ix=M.index(state);
  undo=undoable ? {state:previous,label} : null;
  draftDirty=false;externalPending=false;
  if(after)after();render();notice(label);
  if(!dialog.open && focus && (!focus.isConnected || focus.hidden) && document.activeElement===document.body){
   const key=focus.dataset.key;
   const card=key ? $('card-'+key) : null;
   const replacement=card?.querySelector('[data-act="unskip"]') || card?.querySelector('input') || card?.querySelector('.exercise-toggle');
   (replacement||$('title')).focus();
  }
  return true;
 }catch(error){notice(error.message || 'Could not save. Your previous data is unchanged.',true);return false;}
}
function load(raw=localStorage.getItem(KEY)){
 return raw ? M.normalize(JSON.parse(raw)) : M.defaults();
}
function selectedSession(){
 return M.sessionFor(state,routineId) || state.sessions.filter(s=>s.r===routineId && s.d===M.today()).at(-1) || null;
}
function currentNames(){const s=selectedSession();return s ? s.ex : (ix.routines.get(routineId)?.ex || []).filter(key=>!ix.exercises.get(key).archived);}
function canEdit(){return !selectedSession() || selectedSession().status==='active';}
function prefill(key,slot){
 if(setDrafts.has(key+':'+slot))return setDrafts.get(key+':'+slot);
 const def=ix.exercises.get(key),history=ix.history.get(key)||[],session=selectedSession();
 const entry=session?.entries[key];
 if(entry?.sets[slot])return entry.sets[slot];
 const target=M.nextTarget(def,history,session?.d || M.today());
 const previous=history.filter(h=>h.session!==session?.id).at(-1);
 const last=previous?.sets[slot] || previous?.sets.find(Boolean);
 return {w:target?.w ?? entry?.sets.find(Boolean)?.w ?? last?.w ?? '',reps:target?.reps ?? last?.reps ?? def.min};
}
function chooseActive(){
 const session=selectedSession(),keys=currentNames();
 if(!keys.includes(activeExercise))activeExercise=null;
 if(!activeExercise)activeExercise=keys.find(key=>{const e=session?.entries[key];return !e?.skipped && (!e || e.sets.some(s=>!s));}) || keys[0] || null;
}
function button(action,text,attributes='',classes='text-button'){return `<button type="button" class="${classes}" data-act="${action}" ${attributes}>${text}</button>`;}
function setText(set){return set ? `${set.w} kg × ${set.reps}` : 'Not logged';}

function cardHTML(key){
 const def=ix.exercises.get(key),session=selectedSession(),entry=session?.entries[key],editable=canEdit();
 const expanded=activeExercise===key && editable;
 const history=(ix.history.get(key)||[]).filter(h=>h.session!==session?.id),last=history.at(-1);
 const target=M.nextTarget(def,history,session?.d || M.today());
 let html=`<article class="exercise-card" id="card-${key}" data-key="${key}">
  <div class="exercise-heading">${button('expand',`<span>${esc(def.name)}</span><span class="muted small">${entry?.skipped ? 'Skipped' : `${entry?.sets.filter(Boolean).length||0}/2 sets`}</span>`,`data-key="${key}" aria-expanded="${expanded}" aria-controls="sets-${key}"`,'exercise-toggle')}
  ${button('detail','History',`data-key="${key}" aria-label="History for ${esc(def.name)}"`)}</div>
  <p class="exercise-context">${target ? `Suggested ${target.w} kg × ${target.reps}` : `${def.min}–${def.max} reps`}${last ? ` · Last: ${last.sets.filter(Boolean).map(setText).join(' / ')}` : ' · First session'}</p>
  <div id="sets-${key}">`;
 for(let slot=0;slot<2;slot++){
  const set=entry?.sets[slot],editing=editingSet?.key===key && editingSet.slot===slot;
  if(expanded && (!set || editing) && (!entry?.skipped || editing)){
   const val=prefill(key,slot);
   html+=`<form class="set-form" data-form="set" data-key="${key}" data-slot="${slot}" novalidate>
    <span class="set-number">Set ${slot+1}</span>
    <label>Weight <span class="muted">kg</span><input name="weight" type="text" inputmode="decimal" autocomplete="off" value="${esc(val.w)}" required aria-label="${esc(def.name)}, set ${slot+1}, weight in kg"></label>
    <label>Reps<input name="reps" type="text" inputmode="numeric" autocomplete="off" value="${esc(val.reps)}" required aria-label="${esc(def.name)}, set ${slot+1}, reps"></label>
    <button class="primary set-submit" type="submit">${set ? 'Save' : 'Log set '+(slot+1)}</button>
    <p class="field-error" role="alert" hidden></p></form>`;
  }else{
   html+=`<div class="set-summary"><span class="set-number">Set ${slot+1}</span><span class="${set ? 'logged' : 'muted'}">${set ? setText(set)+' <span aria-label="logged">✓</span>' : entry?.skipped ? 'Skipped' : 'Not logged'}</span>${editable ? button('edit-set',set ? 'Edit' : 'Enter',`data-key="${key}" data-slot="${slot}" aria-label="${set ? 'Edit' : 'Enter'} ${esc(def.name)}, set ${slot+1}"`) : ''}</div>`;
  }
 }
 html+='</div>';
 if(expanded){html+=`<div class="card-actions">${entry?.skipped ? button('unskip','Restore skipped sets',`data-key="${key}"`) : (!entry || entry.sets.some(s=>!s)) ? button('skip','Skip remaining sets',`data-key="${key}"`) : '<span class="logged small">Exercise complete</span>'}</div>`;}
 return html+'</article>';
}
function patchCards(){
 const root=$('cards'),keys=currentNames();
 for(const child of [...root.children])if(!keys.includes(child.dataset.key))child.remove();
 keys.forEach((key,i)=>{
  const html=cardHTML(key),old=$('card-'+key);
  if(!old || renderedCards.get(old)!==html){
   const template=document.createElement('template');template.innerHTML=html;const node=template.content.firstElementChild;renderedCards.set(node,html);
   if(old)old.replaceWith(node);else root.append(node);
  }
  const node=$('card-'+key);if(root.children[i]!==node)root.insertBefore(node,root.children[i]||null);
 });
}
function renderDrawer(){
 const html=state.routines.filter(r=>!r.archived).map(r=>{
  const stats=ix.routineStats.get(r.id),current=r.id===routineId;
  return button('routine',`<span>${esc(r.name)}</span><span class="muted small">${stats.active ? 'Resume' : stats.last ? formatDate(stats.last) : 'Not started'}</span>`,`data-id="${r.id}" ${current ? 'aria-current="page"' : ''}`,'routine-link');
 }).join('');
 if($('routines').innerHTML!==html)$('routines').innerHTML=html;
}
function render(){
 if(!ix.routines.get(routineId) || ix.routines.get(routineId).archived)routineId=M.suggested(state,ix);
 const routine=ix.routines.get(routineId),session=selectedSession();
 $('title').textContent=routine?.name || 'Your workouts';
 $('tabs').hidden=!routine;$('routine-tools').hidden=!routine;
 $('workout-view').hidden=mode!=='workout' || !routine;$('progress-view').hidden=mode!=='progress' || !routine;
 $('empty').hidden=!!routine;
 $('tab-workout').setAttribute('aria-pressed',mode==='workout');$('tab-progress').setAttribute('aria-pressed',mode==='progress');
 if(routine){
  if(mode==='workout'){
   chooseActive();patchCards();
   const stats=session ? M.stats(session) : {logged:0,total:currentNames().length*2,skipped:0};
   const label=session?.status==='finished' ? 'Finished' : stats.logged ? 'In progress' : 'Ready to start';
   $('subtitle').textContent=`${label} · ${stats.logged}/${stats.total} sets logged${stats.skipped ? ` · ${stats.skipped} skipped` : ''}${session && session.d!==M.today() ? ` · ${formatDate(session.d)}` : ''}`;
   $('workout-progress').max=stats.total||1;$('workout-progress').value=stats.logged+stats.skipped;
   $('add-exercise').hidden=!canEdit();$('finish').hidden=!canEdit();$('finish').disabled=!stats.logged;
   $('reopen').hidden=session?.status!=='finished';$('new-workout').hidden=session?.status!=='finished';$('discard').hidden=session?.status!=='active';
   $('no-exercises').hidden=currentNames().length>0;
  }else renderProgress();
 }else{$('subtitle').textContent='Create a routine to start logging.';$('cards').replaceChildren();}
 renderDrawer();
}

function graph(values,label,large=false){
 if(values.length<2)return '';
 const W=480,H=large?160:60,pad=10,min=Math.min(...values),max=Math.max(...values),range=max-min||1;
 const points=values.map((v,i)=>`${pad+i*(W-pad*2)/(values.length-1)},${H-pad-(max===min ? .5 : (v-min)/range)*(H-pad*2)}`).join(' ');
 return `<svg class="chart${large?' large':''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><polyline points="${points}"/></svg>`;
}
function renderProgress(){
 const routine=ix.routines.get(routineId),stats=ix.routineStats.get(routineId);
 $('subtitle').textContent=`${stats.count} finished workout${stats.count===1?'':'s'}${stats.last ? ` · Last ${formatDate(stats.last)}` : ''}`;
 // Include exercises removed from the routine if its history still contains them.
 const keys=[...new Set([...routine.ex,...state.sessions.filter(s=>s.r===routineId).flatMap(s=>s.ex)])];
 $('progress-view').innerHTML=keys.map(key=>{
  const def=ix.exercises.get(key),history=ix.history.get(key)||[],values=history.map(h=>M.estimate(h.sets)),delta=values.length>1 ? M.changePercent(values[0],values.at(-1)) : null;
  return `<button class="progress-card" data-act="detail" data-key="${key}"><span class="progress-heading">${esc(def.name)}${def.archived?' <span class="muted small">Archived</span>':''}</span>${graph(values,def.name+' estimated strength trend')}
   <span class="muted small">${values.length ? `Estimated 1RM ${Math.round(values.at(-1))} kg · ${values.length} logged workout${values.length===1?'':'s'} across routines` : 'No sets logged yet'}</span>${delta!==null ? `<span class="delta ${delta>0?'positive':delta<0?'negative':''}">${delta>0?'+':''}${delta}%</span>` : ''}</button>`;
 }).join('') || '<p class="empty-note">Add exercises to see your progress here.</p>';
}

function setDrawer(open){
 const visible=wide.matches||open;
 document.documentElement.classList.toggle('is-open',open&&!wide.matches);
 $('drawer').inert=!visible;$('drawer').setAttribute('aria-hidden',String(!visible));
 $('pane').inert=open&&!wide.matches;$('scrim').hidden=!open||wide.matches;
 $('menu').setAttribute('aria-expanded',String(open&&!wide.matches));
 if(open&&!wide.matches)($('drawer').querySelector('button')||$('drawer-close')).focus();
}
function closeDrawer(){setDrawer(false);if(!wide.matches)$('menu').focus();}
wide.addEventListener('change',()=>setDrawer(false));
document.addEventListener('keydown',event=>{
 if(document.documentElement.classList.contains('is-open')&&!wide.matches){
  if(event.key==='Escape'){event.preventDefault();closeDrawer();}
  if(event.key==='Tab'){
   const controls=[...$('drawer').querySelectorAll('button:not([hidden])')].filter(el=>el.getClientRects().length);
   const at=controls.indexOf(document.activeElement);
   if(event.shiftKey&&at<=0){event.preventDefault();controls.at(-1)?.focus();}
   else if(!event.shiftKey&&at===controls.length-1){event.preventDefault();controls[0]?.focus();}
  }
 }
});

function sheet(title,html,setup){
 $('sheet-title').textContent=title;content.innerHTML=html;content.scrollTop=0;
 $('sheet-back').hidden=sheetStack.length<=1;
 if(!dialog.open){sheetReturnFocus=document.activeElement;dialog.showModal();if(!$('notice').hidden)notice($('notice-text').textContent,$('notice').classList.contains('error'));}
 if(setup)setup();$('sheet-title').focus();draftDirty=false;
}
function pushSheet(renderer){sheetStack.push(renderer);renderer();}
function backSheet(){if(sheetStack.length>1){sheetStack.pop();sheetStack.at(-1)();}}
function closeSheet(){dialog.close();}
dialog.addEventListener('close',()=>{
 sheetStack=[];routineDraft=null;draftDirty=false;
 if(sheetReturnFocus?.isConnected)sheetReturnFocus.focus();else $('title').focus();
 if(!$('sheet-notice').hidden)notice($('sheet-notice-text').textContent,$('sheet-notice').classList.contains('error'));
 if(externalPending)reload();
});
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeSheet();}});
function showSettings(){
 sheet('Settings',`<div class="action-list">${button('manager','Exercises & routines')}${button('theme',`Use ${document.documentElement.dataset.theme==='dark'?'light':'dark'} theme`)}${button('export','Export workout data')}${button('import','Import workout data')}${button('about','Progression rules')}</div>`);
}
function showManager(){
 const rows=(items,act)=>items.map(item=>button(act,`${esc(item.name)}${item.archived?' <span class="muted">(archived)</span>':''}`,`data-id="${item.id}"`)).join('');
 sheet('Exercises & routines',`<h3>Routines</h3><div class="action-list">${rows(state.routines,'edit-routine')}${button('edit-routine','＋ New routine')}</div><h3>Exercises</h3><div class="action-list">${rows(state.ex,'edit-exercise')}${button('edit-exercise','＋ New exercise')}</div>`);
}
function showDetail(key,limit=30){
 const def=ix.exercises.get(key),history=ix.history.get(key)||[],values=history.map(h=>M.estimate(h.sets));
 if(!def){closeSheet();return;}
 const rows=history.slice().reverse().slice(0,limit).map(h=>`<li class="history-entry" tabindex="-1"><div><strong>${formatDate(h.d)}</strong> · ${esc(ix.routines.get(h.r).name)}${h.status==='active'?' · In progress':''}<br><span class="small">Set 1: ${setText(h.sets[0])}<br>Set 2: ${setText(h.sets[1])}</span></div>${button('delete-history','Delete',`data-id="${h.session}" data-key="${key}" aria-label="Delete ${esc(def.name)} entry from ${esc(ix.routines.get(h.r).name)} on ${formatDate(h.d)}"`,'text-button danger')}</li>`).join('');
 sheet(def.name,`<p class="muted">${def.min}–${def.max} reps · ${def.inc ? '+'+def.inc+' kg' : 'Progression off'}</p>${graph(values,def.name+' estimated one-rep-max trend; exact sets are listed below',true)}${values.length>1 ? `<p class="small muted">${formatDate(history[0].d)} — ${formatDate(history.at(-1).d)} · One point per logged workout</p>`:''}<ul class="history">${rows || '<li>No sets logged yet.</li>'}</ul>${history.length>limit ? button('more-history',`Show earlier workouts (${history.length-limit} remaining)`,`data-key="${key}" data-limit="${limit+30}"`,'secondary') : ''}${button('edit-exercise','Edit exercise',`data-id="${key}"`,'secondary')}`);
}
function showPicker(){
 const used=currentNames(),available=state.ex.filter(e=>!e.archived&&!used.includes(e.id));
 sheet('Add to this workout',`<div class="action-list">${available.map(e=>button('pick',esc(e.name),`data-key="${e.id}"`)).join('') || '<p class="muted">All available exercises are already included.</p>'}</div>${button('new-for-session','＋ New exercise','','secondary')}`);
}
function fieldError(form,message,input){
 const el=form.querySelector('.field-error');el.textContent=message;el.hidden=false;
 if(input){input.setAttribute('aria-invalid','true');input.focus();}
}
function numeric(input){const s=input.value.trim().replace(',','.');return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) ? Number(s) : NaN;}
function showExerciseEditor(key=null,addToSession=false){
 if(key&&!ix.exercises.has(key)){closeSheet();return;}
 const def=ix.exercises.get(key) || {name:'',min:8,max:12,inc:2.5};
 sheet(key ? 'Edit exercise' : 'New exercise',`<form data-form="exercise" data-id="${key||''}" data-add="${addToSession}" novalidate>
  <label>Name<input name="name" value="${esc(def.name)}" maxlength="100" required></label>
  <div class="field-grid"><label>Minimum reps<input name="min" inputmode="numeric" value="${def.min}" required></label><label>Maximum reps<input name="max" inputmode="numeric" value="${def.max}" required></label><label>Increase (kg)<input name="inc" inputmode="decimal" value="${def.inc}" required></label></div>
  <p class="small muted">Use 0 kg to turn automatic progression off.</p>
  <p class="field-error" role="alert" hidden></p><button class="primary" type="submit">${addToSession?'Create & add to workout':'Save exercise'}</button></form>
  ${key ? button(def.archived?'restore-exercise':'archive-exercise',def.archived?'Restore exercise':'Archive exercise',`data-id="${key}"`,'text-button danger') : ''}
  ${key ? '<p class="small muted">Archiving removes this exercise from routines and keeps its history.</p>' : ''}`);
}
function showRoutineEditor(key=null){
 if(key&&!ix.routines.has(key)){closeSheet();return;}
 const routine=ix.routines.get(key);
 routineDraft={id:key,name:routine?.name||'',ex:routine?.ex.filter(k=>!ix.exercises.get(k).archived).slice()||[]};
 sheet(key?'Edit routine':'New routine',`<form data-form="routine" novalidate><label>Name<input name="name" value="${esc(routineDraft.name)}" maxlength="100" required></label><h3>Exercise order</h3><div id="routine-order"></div><h3>Add exercises</h3><div id="routine-available" class="action-list"></div><p class="field-error" role="alert" hidden></p><button type="submit" class="primary">Save routine</button></form>${key ? button(routine.archived?'restore-routine':'archive-routine',routine.archived?'Restore routine':'Archive routine',`data-id="${key}"`,'text-button danger') : ''}${key?'<p class="small muted">History is retained. Order changes apply to new workouts.</p>':''}`,renderRoutineOrder);
}
function renderRoutineOrder(){
 $('routine-order').innerHTML=routineDraft.ex.map((key,i)=>`<div class="order-row"><span>${i+1}. ${esc(ix.exercises.get(key).name)}</span><div>${button('move-up','↑',`data-key="${key}" ${i===0?'disabled':''} aria-label="Move ${esc(ix.exercises.get(key).name)} up"`)}${button('move-down','↓',`data-key="${key}" ${i===routineDraft.ex.length-1?'disabled':''} aria-label="Move ${esc(ix.exercises.get(key).name)} down"`)}${button('remove-from-routine','Remove',`data-key="${key}" aria-label="Remove ${esc(ix.exercises.get(key).name)} from routine"`)}</div></div>`).join('') || '<p class="muted">Choose exercises below. You can also add them during a workout.</p>';
 $('routine-available').innerHTML=state.ex.filter(e=>!e.archived&&!routineDraft.ex.includes(e.id)).map(e=>button('include-exercise','＋ '+esc(e.name),`data-key="${e.id}"`)).join('') || '<p class="muted">All exercises are included.</p>';
}
function refreshSheet(){if(sheetStack.length)sheetStack.at(-1)();}
function finishWorkout(){
 const session=selectedSession(),stats=M.stats(session);
 if(!stats.logged)return;
 const perform=skip=>commit('Workout finished.',s=>M.finish(s,routineId,skip),{after:()=>{editingSet=null;if(dialog.open)closeSheet();}});
 if(stats.remaining){pushSheet(()=>sheet('Finish workout?',`<p>${stats.remaining} sets have not been logged. Finish and mark them as skipped?</p><button class="primary" id="confirm-finish">Skip remaining & finish</button>`,()=>{$('confirm-finish').onclick=()=>perform(true);}));}
 else perform(false);
}
function reload(){
 try{
  const raw=localStorage.getItem(KEY);
  if(raw===storedSnapshot){externalPending=false;if(!draftDirty&&!dialog.open&&!loadFailed)render();return;}
  if(draftDirty || dialog.open){externalPending=true;undo=null;notice('Workout data changed. Close your edit and reload before saving.',true);return;}
  const next=load(raw);state=next;storedSnapshot=raw;ix=M.index(state);undo=null;editingSet=null;externalPending=false;setDrafts.clear();render();
 }catch(error){notice('Could not reload workout data: '+error.message,true);}
}
function exportData(){
 const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='workout-'+M.today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importFile(file){
 try{
  if(file.size>10*1024*1024)throw new Error('Choose a workout file smaller than 10 MB.');
  const candidate=M.normalize(JSON.parse(await file.text()));
  pushSheet(()=>sheet('Replace workout data?',`<p>This file contains ${candidate.ex.length} exercises, ${candidate.routines.length} routines and ${candidate.sessions.length} workouts.</p><p>Import replaces the current workout data. ${loadFailed?'Download your unreadable saved data first if you want to keep a copy.':'You can undo the import until your next change.'}</p><button class="primary" id="confirm-import">Replace with this file</button>`,()=>{$('confirm-import').onclick=()=>commit('Workout data imported.',next=>{Object.keys(next).forEach(key=>delete next[key]);Object.assign(next,candidate);},{undoable:!loadFailed,allowRecovery:true,after:()=>{loadFailed=false;$('app-error').hidden=true;$('pane').hidden=false;$('drawer').hidden=false;setDrawer(false);routineId=M.suggested(candidate);activeExercise=null;editingSet=null;setDrafts.clear();closeSheet();}});}));
 }catch(error){notice('Import rejected: '+error.message+' Your data was not changed.',true);}
}

document.addEventListener('input',event=>{
 if(event.target.closest('form')){draftDirty=true;event.target.removeAttribute('aria-invalid');const error=event.target.closest('form').querySelector('.field-error');if(error)error.hidden=true;}
 const form=event.target.closest('[data-form="set"]');
 if(form)setDrafts.set(form.dataset.key+':'+form.dataset.slot,{w:form.elements.weight.value,reps:form.elements.reps.value});
});
document.addEventListener('submit',event=>{
 const form=event.target;if(!form.dataset.form)return;event.preventDefault();
 if(externalPending){fieldError(form,'Data changed in another tab. Close your edit and reload before saving.');return;}
 const inputs=form.elements;
 if(form.dataset.form==='set'){
  const w=numeric(inputs.weight),reps=numeric(inputs.reps),key=form.dataset.key,slot=+form.dataset.slot;
  if(!Number.isFinite(w)||w<0||w>100000){fieldError(form,'Enter a weight from 0 to 100,000 kg.',inputs.weight);return;}
  if(!Number.isInteger(reps)||reps<1||reps>1000){fieldError(form,'Enter whole-number reps from 1 to 1,000.',inputs.reps);return;}
  if(commit('Set '+(slot+1)+' logged.',s=>M.logSet(s,routineId,key,slot,w,reps),{after:()=>{editingSet=null;setDrafts.delete(key+':'+slot);}})){
   const session=selectedSession();
   const nextKey=currentNames().find(k=>!session.entries[k]?.skipped && (!session.entries[k] || session.entries[k].sets.some(s=>!s)));
   activeExercise=nextKey||key;patchCards();
   const focus=$('card-'+activeExercise)?.querySelector('input')||$('finish');focus.focus();
  }
 }else if(form.dataset.form==='exercise'){
  const key=form.dataset.id,add=form.dataset.add==='true',name=inputs.name.value.trim(),min=numeric(inputs.min),max=numeric(inputs.max),inc=numeric(inputs.inc);
  if(!name){fieldError(form,'Enter an exercise name.',inputs.name);return;}
  if(state.ex.some(e=>e.id!==key&&e.name.toLowerCase()===name.toLowerCase())){fieldError(form,'An exercise with this name already exists, including archived exercises.',inputs.name);return;}
  if(!Number.isInteger(min)||min<1||!Number.isInteger(max)||max<min||max>1000){fieldError(form,'Use whole-number reps, with minimum ≤ maximum (1–1,000).',inputs.min);return;}
  if(!Number.isFinite(inc)||inc<0||inc>10000){fieldError(form,'Enter an increase from 0 to 10,000 kg.',inputs.inc);return;}
  const savedId=key||M.id();
  commit(add?'Exercise added to workout.':'Exercise saved.',s=>{let e=s.ex.find(e=>e.id===key);if(!e){e={id:savedId,archived:false};s.ex.push(e);}Object.assign(e,{name,min,max,inc});if(add)M.addExercise(s,routineId,savedId);},{after:()=>{if(add){activeExercise=savedId;closeSheet();}else if(sheetStack.length>1)backSheet();else closeSheet();}});
 }else if(form.dataset.form==='routine'){
  const name=inputs.name.value.trim(),key=routineDraft.id;
  if(!name){fieldError(form,'Enter a routine name.',inputs.name);return;}
  if(state.routines.some(r=>r.id!==key&&r.name.toLowerCase()===name.toLowerCase())){fieldError(form,'A routine with this name already exists, including archived routines.',inputs.name);return;}
  const savedId=key||M.id(),order=routineDraft.ex.slice();
  commit('Routine saved.',s=>{let r=s.routines.find(r=>r.id===key);if(!r){r={id:savedId,archived:false};s.routines.push(r);}Object.assign(r,{name,ex:order});},{after:()=>{if(!key){routineId=savedId;mode='workout';activeExercise=null;setDrafts.clear();}if(sheetStack.length>1)backSheet();else closeSheet();}});
 }
});

document.addEventListener('click',event=>{
 const el=event.target.closest('[data-act]');if(!el)return;
 const act=el.dataset.act,key=el.dataset.key,id=el.dataset.id;
 if(act==='menu')setDrawer(true);
 else if(act==='close-drawer')closeDrawer();
 else if(act==='routine'){routineId=id;activeExercise=null;editingSet=null;draftDirty=false;setDrafts.clear();render();closeDrawer();if(wide.matches)$('title').focus();}
 else if(act==='view'){mode=el.dataset.view;draftDirty=false;editingSet=null;render();}
 else if(act==='expand'){activeExercise=activeExercise===key ? null : key;editingSet=null;patchCards();}
 else if(act==='edit-set'){activeExercise=key;editingSet={key,slot:+el.dataset.slot};patchCards();$('card-'+key).querySelector(`[data-slot="${editingSet.slot}"] input`)?.focus();}
 else if(act==='skip'||act==='unskip')commit(act==='skip'?'Remaining sets skipped.':'Skipped sets restored.',s=>M.skipExercise(s,routineId,key,act==='skip'));
 else if(act==='finish')finishWorkout();
 else if(act==='discard'){
  const session=selectedSession(),count=M.stats(session).logged;
  pushSheet(()=>sheet('Discard this workout?',`<p>Remove this unfinished workout and its ${count} logged sets? You can undo this until your next change.</p><button class="primary" id="confirm-discard">Discard workout</button>`,()=>{$('confirm-discard').onclick=()=>commit('Workout discarded.',s=>{s.sessions=s.sessions.filter(s=>s.id!==session.id);},{after:()=>{setDrafts.clear();activeExercise=null;editingSet=null;closeSheet();}});}));
 }
 else if(act==='more-history'){
  const scroll=content.scrollTop,limit=+el.dataset.limit;showDetail(key,limit);content.scrollTop=scroll;content.querySelectorAll('.history-entry')[limit-30]?.focus({preventScroll:true});
 }
 else if(act==='reopen')commit('Workout reopened.',s=>{s.sessions.find(s=>s.id===selectedSession().id).status='active';});
 else if(act==='new-workout')commit('New workout started.',s=>M.ensureSession(s,routineId),{after:()=>{activeExercise=null;setDrafts.clear();}});
 else if(act==='pickex')pushSheet(showPicker);
 else if(act==='pick')commit('Exercise added to workout.',s=>M.addExercise(s,routineId,key),{after:()=>{activeExercise=key;closeSheet();}});
 else if(act==='new-for-session')pushSheet(()=>showExerciseEditor(null,true));
 else if(act==='detail')pushSheet(()=>showDetail(key));
 else if(act==='delete-history')commit('History entry deleted.',s=>M.deleteHistory(s,id,key),{after:refreshSheet});
 else if(act==='settings'){closeDrawer();pushSheet(showSettings);}
 else if(act==='manager')pushSheet(showManager);
 else if(act==='edit-exercise')pushSheet(()=>showExerciseEditor(id||null));
 else if(act==='edit-routine'){if(el.closest('#drawer'))closeDrawer();pushSheet(()=>showRoutineEditor(id||null));}
 else if(act==='edit-current-routine')pushSheet(()=>showRoutineEditor(routineId));
 else if(act==='archive-exercise'||act==='restore-exercise')commit(act==='archive-exercise'?'Exercise archived.':'Exercise restored.',s=>{if(act==='archive-exercise')M.archiveExercise(s,id);else s.ex.find(e=>e.id===id).archived=false;},{after:()=>{if(sheetStack.length>1)backSheet();else closeSheet();}});
 else if(act==='archive-routine'||act==='restore-routine')commit(act==='archive-routine'?'Routine archived.':'Routine restored.',s=>{s.routines.find(r=>r.id===id).archived=act==='archive-routine';},{after:()=>{if(sheetStack.length>1)backSheet();else closeSheet();}});
 else if(['include-exercise','remove-from-routine','move-up','move-down'].includes(act)){
  routineDraft.name=content.querySelector('[name="name"]').value;const at=routineDraft.ex.indexOf(key);
  if(act==='include-exercise')routineDraft.ex.push(key);
  else if(act==='remove-from-routine')routineDraft.ex.splice(at,1);
  else M.reorder(routineDraft.ex,at,at+(act==='move-up'?-1:1));
  renderRoutineOrder();draftDirty=true;
  const next=content.querySelector(`[data-act="${act}"][data-key="${key}"]:not(:disabled)`) || content.querySelector(`[data-key="${key}"]:not(:disabled)`);next?.focus();
 }
 else if(act==='back')backSheet();
 else if(act==='close')closeSheet();
 else if(act==='undo'){
  if(undo){const previous=undo;try{if(localStorage.getItem(KEY)!==storedSnapshot)throw new Error('Data changed in another tab. Reload first.');persist(previous.state);state=previous.state;ix=M.index(state);undo=null;draftDirty=false;editingSet=null;setDrafts.clear();render();refreshSheet();notice('Undone: '+previous.label);}catch(error){notice('Could not undo: '+error.message,true);}}
 }
 else if(act==='dismiss-notice'){el.parentElement.hidden=true;}
 else if(act==='reload') {draftDirty=false;if(dialog.open)closeSheet();reload();}
 else if(act==='theme'){
  const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;
  try{localStorage.setItem('wtheme',theme);}catch(error){notice('Theme changed for this visit only.',true);}
  document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#0d0d0d':'#ffffff';refreshSheet();
 }
 else if(act==='export')exportData();
 else if(act==='export-raw'){
  const url=URL.createObjectURL(new Blob([storedSnapshot||''],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='workout-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 else if(act==='import')$('importfile').click();
 else if(act==='about')pushSheet(()=>sheet('Progression rules','<p>Two working sets per exercise. Suggestions use finished workouts before the date of the current workout.</p><ul class="rules"><li><strong>Add weight:</strong> set 1 reaches the top of the rep range and set 2 meets the minimum at the same or a heavier weight.</li><li><strong>Add a rep:</strong> set 1 is in range; keep its weight and aim for one more rep, up to the maximum.</li><li><strong>Repeat:</strong> set 1 is below the minimum; keep its weight and aim for the minimum.</li><li><strong>Deload:</strong> after three qualifying workouts below the minimum, reduce weight by one increment.</li></ul><p>Each set keeps its own weight. A partial workout stays in history; without set 1 it does not drive progression. Increment 0 disables suggestions.</p>'));
});
$('importfile').addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';if(file)importFile(file);});
window.addEventListener('storage',event=>{
 if(event.key===KEY){undo=null;reload();}
 if(event.key==='wtheme'){document.documentElement.dataset.theme=event.newValue==='dark'?'dark':'light';document.querySelector('meta[name="theme-color"]').content=event.newValue==='dark'?'#0d0d0d':'#ffffff';}
});
window.addEventListener('pageshow',event=>{if(event.persisted)reload();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){
 try{if(localStorage.getItem(KEY)!==JSON.stringify(state))reload();else if(!draftDirty&&!dialog.open)render();}catch(error){notice('Cannot access saved data.',true);}
}});
try{
 storedSnapshot=localStorage.getItem(KEY);state=load(storedSnapshot);ix=M.index(state);routineId=M.suggested(state,ix);render();
 document.querySelector('meta[name="theme-color"]').content=document.documentElement.dataset.theme==='dark'?'#0d0d0d':'#ffffff';
 setDrawer(false);
}catch(error){
 loadFailed=true;state=M.defaults();ix=M.index(state);
 $('app-error').hidden=false;$('app-error-text').textContent='Saved workout data could not be loaded. It has not been overwritten. '+error.message;
 $('pane').hidden=true;$('drawer').hidden=true;
}
