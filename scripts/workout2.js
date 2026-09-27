'use strict';
const M = WorkoutModel, KEY = 'wapp-v4';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatDate = d => d.split('-').reverse().join('.');
let state, ix, routineId=null, mode='workout', activeExercise=null, editingSet=null;
let undo=null, sheetStack=[], sheetReturnFocus=null, routineDraft=null, draftDirty=false, externalPending=false, storedSnapshot=null, loadFailed=false;
const dialog=$('sheet'), content=$('sheet-content'), wide=matchMedia('(min-width: 900px)');
const renderedCards=new WeakMap(), setDrafts=new Map();
let settingsMode=false,settingsCategory=null,pendingSheetNavigation=null;
const settingsSections=[['manager','Exercises & routines','dumbbell'],['appearance','Appearance','sun'],['backup','Backup & restore','download'],['rules','Progression rules','chart']];
const icons={
 dumbbell:'<path d="M6 6v12M3 9v6M18 6v12M21 9v6M6 12h12"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
 moon:'<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4"/>',
 upload:'<path d="M12 15V3m-5 5 5-5 5 5M5 16v4h14v-4"/>',
 chart:'<path d="M4 4v16h16M7 14l4-4 4 2 5-7m-5 0h5v5"/>',
 history:'<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 back:'<path d="m14 5-7 7 7 7"/>',
 edit:'<path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14Z"/>',
 settings:'<path d="M4 7h6m4 0h6M4 17h10m4 0h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>'
};
function icon(name){return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[name]}</svg>`;}
for(const el of document.querySelectorAll('[data-icon]'))el.innerHTML=icon(el.dataset.icon);

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
 const prior=history.filter(h=>h.session!==session?.id && h.status==='finished' && h.d<(session?.d || M.today()));
 const last=prior.findLast(h=>h.sets[slot])?.sets[slot];
 return target?.sets[slot] || last || {w:entry?.sets.find(Boolean)?.w ?? '',reps:def.min};
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
 const expanded=activeExercise===key,logged=entry?.sets.filter(Boolean).length||0;
 const history=(ix.history.get(key)||[]).filter(h=>h.session!==session?.id),last=history.at(-1);
 const target=M.nextTarget(def,history,session?.d || M.today());
 const status=entry?.skipped ? 'Skipped' : logged===2 ? 'Done' : `${logged}/2`;
 let html=`<article class="exercise-card${expanded?' is-active':''}${logged===2?' is-complete':''}" id="card-${key}" data-key="${key}">
  <div class="exercise-heading">${button('expand',`<span class="exercise-name">${esc(def.name)}</span><span class="exercise-state">${logged===2?icon('check'):''}${status}</span>${icon('chevron')}`,`data-key="${key}" aria-expanded="${expanded}" aria-controls="sets-${key}" aria-label="${esc(def.name)}, ${logged} of 2 sets logged${entry?.skipped?', remaining skipped':''}"`,'exercise-toggle')}
  ${button('detail',icon('history'),`data-key="${key}" aria-label="History for ${esc(def.name)}" title="Exercise history"`,'icon-button history-button')}</div>
  <p class="exercise-context"><span>${def.min}–${def.max} reps</span>${target?.increase ? `<span>Next: ${[...new Set(target.sets.map(set=>set.w))].join(' / ')} kg</span>` : expanded&&last ? `<span>Last: ${last.sets.filter(Boolean).map(setText).join(' / ')}</span>` : ''}${expanded&&target?.review ? button('training-help','Check recovery','','recovery-link') : ''}</p>
  <div id="sets-${key}" ${expanded?'':'hidden'}>`;
 for(let slot=0;slot<2;slot++){
  const set=entry?.sets[slot],editing=editingSet?.key===key && editingSet.slot===slot;
  if(expanded && editable && (!set || editing) && (!entry?.skipped || editing)){
   const val=prefill(key,slot);
   html+=`<form class="set-form" data-form="set" data-key="${key}" data-slot="${slot}" novalidate>
    <span class="set-number">Set ${slot+1}</span>
    <label>Weight <span class="muted">kg</span><input name="weight" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="next" value="${esc(val.w)}" required aria-label="${esc(def.name)}, set ${slot+1}, weight in kg"></label>
    <label>Reps<input name="reps" type="text" inputmode="numeric" autocomplete="off" enterkeyhint="done" value="${esc(val.reps)}" required aria-label="${esc(def.name)}, set ${slot+1}, reps"></label>
    <button class="primary set-submit" type="submit" aria-label="${set?'Save':'Log'} ${esc(def.name)}, set ${slot+1}" title="${set?'Save':'Log'} set ${slot+1}">${icon('check')}<span class="set-action-label">${set ? 'Save' : 'Log'}</span></button>
    <p class="field-error" role="alert" hidden></p></form>`;
  }else{
   html+=`<div class="set-summary" data-slot="${slot}"><span class="set-number">Set ${slot+1}</span><span class="${set ? 'logged' : 'muted'}">${set ? setText(set) : entry?.skipped ? 'Skipped' : 'Not logged'}</span>${editable ? button('edit-set',set ? icon('check')+'<span class="set-action-label">Edit</span>' : 'Enter',`data-key="${key}" data-slot="${slot}" aria-label="${set ? 'Edit' : 'Enter'} ${esc(def.name)}, set ${slot+1}" title="${set ? 'Edit' : 'Enter'} set ${slot+1}"`,set?'set-done':'text-button') : set ? `<span class="set-done" role="img" aria-label="Logged">${icon('check')}</span>` : ''}</div>`;
  }
 }
 if(expanded&&editable&&logged<2){html+=`<div class="card-actions">${entry?.skipped ? button('unskip','Restore skipped sets',`data-key="${key}"`) : button('skip','Skip remaining sets',`data-key="${key}"`)}</div>`;}
 return html+'</div></article>';
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
  return button('routine',`<span class="routine-name">${esc(r.name)}</span><span class="routine-meta">${r.optional?'Optional · ':''}${stats.active ? 'In progress' : stats.last ? 'Last '+formatDate(stats.last) : 'Not started'}</span>`,`data-id="${r.id}" ${current ? 'aria-current="page"' : ''}`,'routine-link');
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
   const label=session?.status==='finished' ? 'Finished · ' : stats.logged ? 'In progress · ' : '';
   $('subtitle').textContent=`${label}${stats.logged}/${stats.total} sets${stats.skipped ? ` · ${stats.skipped} skipped` : ''}${session && session.d!==M.today() ? ` · ${formatDate(session.d)}` : ''}`;
   $('add-exercise').hidden=!canEdit();$('finish').hidden=!canEdit();$('finish').disabled=!stats.logged;
   $('reopen').hidden=session?.status!=='finished';$('new-workout').hidden=session?.status!=='finished';$('discard').hidden=session?.status!=='active';
   $('no-exercises').hidden=currentNames().length>0;
  }else renderProgress();
 }else{$('subtitle').textContent='';$('cards').replaceChildren();}
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
 const keys=[...new Set([...routine.ex,...state.sessions.filter(s=>s.r===routineId).flatMap(s=>s.ex)])].filter(key=>ix.history.get(key)?.length);
 $('progress-view').innerHTML=keys.map(key=>{
  const def=ix.exercises.get(key),history=ix.history.get(key)||[],values=history.map(h=>M.estimate(h.sets)),delta=values.length>1 ? M.changePercent(values[0],values.at(-1)) : null;
  return `<button class="progress-card" data-act="detail" data-key="${key}"><span class="progress-heading">${esc(def.name)}${def.archived?' <span class="muted small">Archived</span>':''}</span>${graph(values,def.name+' estimated strength trend')}
   <span class="muted small">${values.length ? `Estimated 1RM ${Math.round(values.at(-1))} kg · ${values.length} workout${values.length===1?'':'s'}` : 'No sets logged yet'}</span>${delta!==null ? `<span class="delta ${delta>0?'positive':delta<0?'negative':''}">${delta>0?'+':''}${delta}%</span>` : ''}</button>`;
 }).join('') || `<div class="empty-state">${icon('chart')}<h2>No progress yet</h2><p>Log a set to start.</p>${button('view','Go to workout','data-view="workout"','secondary')}</div>`;
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
wide.addEventListener('change',()=>{
 setDrawer(false);
 if(dialog.open&&settingsMode){
  if(wide.matches&&sheetStack.length===1)selectSettingsCategory('manager');
  else{const navFocused=$('settings-nav').contains(document.activeElement);syncSheetLayout();if(navFocused&&!wide.matches)$('sheet-title').focus();}
 }
});
document.addEventListener('keydown',event=>{
 if(event.key==='Enter'&&event.target.matches('[data-form="set"] [name="weight"]')){event.preventDefault();event.target.form.elements.reps.focus();return;}
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

function settingsNavigation(){
 return settingsSections.map(([key,label,symbol])=>button('settings-category',`${icon(symbol)}<span><strong>${label}</strong></span>${icon('chevron')}`,`data-category="${key}" ${settingsCategory===key?'aria-current="page"':''}`,'settings-category')).join('');
}
function syncSheetLayout(){
 dialog.classList.toggle('settings-dialog',settingsMode);
 const nav=$('settings-nav'),showNav=settingsMode&&wide.matches;
 nav.hidden=!showNav;
 const html=showNav ? `<h2>Settings</h2><nav aria-label="Settings sections">${settingsNavigation()}</nav>` : '';
 if(nav.innerHTML!==html)nav.innerHTML=html;
 $('sheet-back').hidden=sheetStack.length<=(showNav?2:1);
}
function sheet(title,html,setup,kind=''){
 $('sheet-title').textContent=title;content.innerHTML=html;content.scrollTop=0;dialog.dataset.kind=kind;
 pendingSheetNavigation=null;$('sheet-unsaved').hidden=true;syncSheetLayout();
 if(!dialog.open){sheetReturnFocus=document.activeElement;dialog.showModal();document.documentElement.classList.add('modal-open');if(!$('notice').hidden)notice($('notice-text').textContent,$('notice').classList.contains('error'));}
 if(setup)setup();$('sheet-title').focus();draftDirty=false;
}
function pushSheet(renderer){sheetStack.push(renderer);renderer();}
function leaveSheet(proceed){
 if(draftDirty&&content.querySelector('form')){
  pendingSheetNavigation=proceed;$('sheet-unsaved').hidden=false;
  $('sheet-unsaved').querySelector('[data-act="keep-editing"]').focus();return;
 }
 proceed();
}
function backSheet(){leaveSheet(()=>{
 if(sheetStack.length>1){const category=settingsCategory;sheetStack.pop();sheetStack.at(-1)();if(sheetStack.length===1)content.querySelector(`[data-category="${category}"]`)?.focus();}
});}
function closeSheet(){leaveSheet(()=>dialog.close());}
dialog.addEventListener('cancel',event=>{event.preventDefault();closeSheet();});
dialog.addEventListener('close',()=>{
 sheetStack=[];routineDraft=null;draftDirty=false;settingsMode=false;settingsCategory=null;pendingSheetNavigation=null;
 $('sheet-unsaved').hidden=true;document.documentElement.classList.remove('modal-open');
 if(sheetReturnFocus?.isConnected)sheetReturnFocus.focus();else $('title').focus();
 if(!$('sheet-notice').hidden)notice($('sheet-notice-text').textContent,$('sheet-notice').classList.contains('error'));
 if(externalPending)reload();
});
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeSheet();}});
function showSettings(){
 settingsMode=true;
 if(wide.matches){selectSettingsCategory('manager');return;}
 settingsCategory=null;
 sheet('Settings',`<nav class="settings-menu" aria-label="Settings sections">${settingsNavigation()}</nav>`);
}
function selectSettingsCategory(key){
 const renderer={manager:showManager,appearance:showAppearance,backup:showBackup,rules:showRules}[key];
 if(!renderer)return;
 leaveSheet(()=>{settingsMode=true;settingsCategory=key;sheetStack=[showSettings,renderer];renderer();});
}
function showAppearance(){
 const theme=document.documentElement.dataset.theme;
 sheet('Appearance',`<div class="theme-options" role="group" aria-label="Color theme">${['light','dark'].map(value=>button('theme',`<span class="theme-preview" data-preview="${value}" aria-hidden="true"><span></span><span></span></span><span class="theme-label">${icon(value==='light'?'sun':'moon')}<strong>${value==='light'?'Light':'Dark'}</strong>${icon('check')}</span>`,`data-theme="${value}" aria-pressed="${theme===value}"`,'theme-option')).join('')}</div>`);
}
function applyTheme(theme){
 document.documentElement.dataset.theme=theme;
 document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#0d0d0d':'#ffffff';
 for(const control of content.querySelectorAll('[data-act="theme"]'))control.setAttribute('aria-pressed',String(control.dataset.theme===theme));
}
function showBackup(){
 sheet('Backup & restore',`<p class="panel-intro">Saved in this browser.</p><dl class="data-summary"><div><dt>Workouts</dt><dd>${state.sessions.length}</dd></div><div><dt>Routines</dt><dd>${state.routines.length}</dd></div><div><dt>Exercises</dt><dd>${state.ex.length}</dd></div></dl><section class="settings-section"><h3>Export</h3>${button('export',icon('download')+'<span>Download backup</span>','','secondary icon-label')}</section><section class="settings-section"><h3>Import</h3><p>Replaces your current data.</p>${button('import',icon('upload')+'<span>Choose backup</span>','','secondary icon-label')}</section>`);
}
function showRules(){
 sheet('Progression rules','<ol class="rules"><li><strong>Build reps</strong><p>Keep your load. Add reps within the range when ready.</p></li><li><strong>Add weight</strong><p>Both sets at the top of the range? Try the smallest increase and start at the lower end.</p></li><li><strong>Review a plateau</strong><p>After three comparable workouts without improvement, check rest, technique and recovery. Load never drops automatically.</p></li></ol><details class="settings-details"><summary>Training guide</summary><p>Train A → B → C across the week, with a rest day between sessions. Shoulders & Arms is optional when recovered. Start with one working set per exercise if the extra volume is too much.</p><p>Two working sets per exercise, leaving 1–2 good reps in reserve. Warm up separately. Rest 2–3 minutes for compound lifts and 1–2 minutes for isolation work.</p><p>Targets assume consistent technique and effort. Only finished workouts before the current workout’s date count; incomplete exercises do not advance the load. Each set keeps its own weight. Adjust increases to your equipment; 0 kg disables suggestions.</p></details>');
}
function showManager(){
 const rows=(items,act)=>items.map(item=>button(act,`<span><strong>${esc(item.name)}</strong><small>${item.archived?'Archived':item.ex?(item.optional?'Optional · ':'')+item.ex.length+' exercises':`${item.min}–${item.max} reps · ${item.inc?'+'+item.inc+' kg':'Progression off'}`}</small></span>${icon('chevron')}`,`data-id="${item.id}"`,'manager-row')).join('');
 sheet('Exercises & routines',`<div class="manager-grid"><section><div class="section-heading"><h3>Routines</h3>${button('edit-routine',icon('plus')+'<span>New</span>','aria-label="New routine"','text-button icon-label')}</div><div class="action-list">${rows(state.routines,'edit-routine')||'<p class="muted">No routines yet.</p>'}</div></section><section><div class="section-heading"><h3>Exercises</h3>${button('edit-exercise',icon('plus')+'<span>New</span>','aria-label="New exercise"','text-button icon-label')}</div><div class="action-list">${rows(state.ex,'edit-exercise')||'<p class="muted">No exercises yet.</p>'}</div></section></div>`);
}

function showDetail(key,limit=30){
 const def=ix.exercises.get(key),history=ix.history.get(key)||[],values=history.map(h=>M.estimate(h.sets));
 if(!def){closeSheet();return;}
 const rows=history.slice().reverse().slice(0,limit).map(h=>`<li class="history-entry" tabindex="-1"><div><strong>${formatDate(h.d)}</strong> · ${esc(ix.routines.get(h.r).name)}${h.status==='active'?' · In progress':''}<br><span class="small">Set 1: ${setText(h.sets[0])}<br>Set 2: ${setText(h.sets[1])}</span></div>${button('delete-history','Delete',`data-id="${h.session}" data-key="${key}" aria-label="Delete ${esc(def.name)} entry from ${esc(ix.routines.get(h.r).name)} on ${formatDate(h.d)}"`,'text-button danger')}</li>`).join('');
 sheet(def.name,`<p class="muted">${def.min}–${def.max} reps · ${def.inc ? '+'+def.inc+' kg' : 'Progression off'}</p>${graph(values,def.name+' estimated one-rep-max trend; exact sets are listed below',true)}${values.length>1 ? `<p class="small muted">${formatDate(history[0].d)} — ${formatDate(history.at(-1).d)} · Estimated 1RM</p>`:''}${rows ? `<ul class="history">${rows}</ul>` : `<div class="empty-state">${icon('history')}<h3>No sets logged yet</h3></div>`}${history.length>limit ? button('more-history',`Show earlier workouts (${history.length-limit} remaining)`,`data-key="${key}" data-limit="${limit+30}"`,'secondary') : ''}${button('edit-exercise',icon('edit')+'<span>Edit exercise</span>',`data-id="${key}"`,'secondary icon-label')}`,undefined,'detail');
}
function showPicker(){
 const used=currentNames(),available=state.ex.filter(e=>!e.archived&&!used.includes(e.id));
 sheet('Add to this workout',`<div class="action-list">${available.map(e=>button('pick',esc(e.name),`data-key="${e.id}"`)).join('') || '<p class="muted">All exercises are included.</p>'}</div>${button('new-for-session','＋ New exercise','','secondary')}`);
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
  <p class="small muted">0 kg disables progression.</p>
  <p class="field-error" role="alert" hidden></p><button class="primary" type="submit">${addToSession?'Create & add to workout':'Save exercise'}</button></form>
  ${key ? button(def.archived?'restore-exercise':'archive-exercise',def.archived?'Restore exercise':'Archive exercise',`data-id="${key}"`,'text-button danger') : ''}
  ${key ? '<p class="small muted">Archiving removes it from routines and keeps history.</p>' : ''}`,undefined,'editor');
}
function showRoutineEditor(key=null){
 if(key&&!ix.routines.has(key)){closeSheet();return;}
 const routine=ix.routines.get(key);
 routineDraft={id:key,name:routine?.name||'',optional:routine?.optional||false,ex:routine?.ex.filter(k=>!ix.exercises.get(k).archived).slice()||[]};
 sheet(key?'Edit routine':'New routine',`<form data-form="routine" novalidate><label>Name<input name="name" value="${esc(routineDraft.name)}" maxlength="100" required></label><label class="check-option"><input type="checkbox" name="optional" ${routineDraft.optional?'checked':''}>Optional day</label><h3>Exercise order</h3><div id="routine-order"></div><h3>Add exercises</h3><div id="routine-available" class="action-list"></div><p class="field-error" role="alert" hidden></p><button type="submit" class="primary">Save routine</button></form>${key ? button(routine.archived?'restore-routine':'archive-routine',routine.archived?'Restore routine':'Archive routine',`data-id="${key}"`,'text-button danger') : ''}${key?'<p class="small muted">Order changes apply to new workouts.</p>':''}`,renderRoutineOrder,'editor');
}
function renderRoutineOrder(){
 $('routine-order').innerHTML=routineDraft.ex.map((key,i)=>`<div class="order-row"><span>${i+1}. ${esc(ix.exercises.get(key).name)}</span><div>${button('move-up','↑',`data-key="${key}" ${i===0?'disabled':''} aria-label="Move ${esc(ix.exercises.get(key).name)} up"`)}${button('move-down','↓',`data-key="${key}" ${i===routineDraft.ex.length-1?'disabled':''} aria-label="Move ${esc(ix.exercises.get(key).name)} down"`)}${button('remove-from-routine','Remove',`data-key="${key}" aria-label="Remove ${esc(ix.exercises.get(key).name)} from routine"`)}</div></div>`).join('') || '<p class="muted">Choose exercises below.</p>';
 $('routine-available').innerHTML=state.ex.filter(e=>!e.archived&&!routineDraft.ex.includes(e.id)).map(e=>button('include-exercise','＋ '+esc(e.name),`data-key="${e.id}"`)).join('') || '<p class="muted">All exercises are included.</p>';
}
function refreshSheet(){if(sheetStack.length)sheetStack.at(-1)();}
function finishWorkout(){
 const session=selectedSession(),stats=M.stats(session);
 if(!stats.logged)return;
 const perform=skip=>commit('Workout finished.',s=>M.finish(s,routineId,skip),{after:()=>{editingSet=null;if(dialog.open)closeSheet();}});
 if(stats.remaining){pushSheet(()=>sheet('Finish workout?',`<p>Skip the remaining ${stats.remaining} sets?</p><button class="primary" id="confirm-finish">Skip remaining & finish</button>`,()=>{$('confirm-finish').onclick=()=>perform(true);}));}
 else perform(false);
}
function reload(){
 try{
  const raw=localStorage.getItem(KEY);
  if(raw===storedSnapshot){externalPending=false;if(!draftDirty&&!dialog.open&&!loadFailed)render();return;}
  if(draftDirty || setDrafts.size || dialog.open){externalPending=true;undo=null;notice('Workout data changed. Close your edit and reload before saving.',true);return;}
  const next=load(raw);state=next;storedSnapshot=raw;ix=M.index(state);undo=null;editingSet=null;externalPending=false;setDrafts.clear();render();
 }catch(error){notice('Could not reload workout data: '+error.message,true);}
}
function exportData(){
 const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='workout-'+M.today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 notice('Backup download started.');
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
  const correcting=!!selectedSession()?.entries[key]?.sets[slot],typing=document.activeElement.tagName==='INPUT';
  if(commit(correcting?'Set updated.':'Set '+(slot+1)+' logged.',s=>M.logSet(s,routineId,key,slot,w,reps),{after:()=>{
   editingSet=null;setDrafts.delete(key+':'+slot);
   const session=selectedSession(),keys=currentNames(),at=keys.indexOf(key);
   const order=[key,...keys.slice(at+1),...keys.slice(0,at)];
   activeExercise=correcting ? key : order.find(k=>!session.entries[k]?.skipped && (!session.entries[k] || session.entries[k].sets.some(s=>!s)))||key;
  }})){
   const loggedCard=$('card-'+key),feedback=loggedCard.querySelector(loggedCard.classList.contains('is-complete')?'.exercise-state':`.set-summary[data-slot="${slot}"] .set-done`);
   if(feedback){feedback.classList.add('just-logged');feedback.addEventListener('animationend',()=>feedback.classList.remove('just-logged'),{once:true});}
   const card=$('card-'+activeExercise);
   const focus=correcting ? card.querySelector(`[data-act="edit-set"][data-slot="${slot}"]`) : card.querySelector(typing?'input':'form button[type="submit"]')||$('finish');
   focus?.focus({preventScroll:correcting});
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
  const savedId=key||M.id(),order=routineDraft.ex.slice(),optional=inputs.optional.checked;
  commit('Routine saved.',s=>{let r=s.routines.find(r=>r.id===key);if(!r){r={id:savedId,archived:false};s.routines.push(r);}Object.assign(r,{name,ex:order,optional});},{after:()=>{if(!key){routineId=savedId;mode='workout';activeExercise=null;setDrafts.clear();}if(sheetStack.length>1)backSheet();else closeSheet();}});
 }
});

document.addEventListener('click',event=>{
 const el=event.target.closest('[data-act]');if(!el)return;
 const act=el.dataset.act,key=el.dataset.key,id=el.dataset.id;
 if(act==='menu')setDrawer(true);
 else if(act==='close-drawer')closeDrawer();
 else if(act==='routine'){routineId=id;activeExercise=null;editingSet=null;draftDirty=false;setDrafts.clear();render();closeDrawer();if(wide.matches)$('title').focus();}
 else if(act==='view'){mode=el.dataset.view;draftDirty=false;editingSet=null;render();}
 else if(act==='expand'){activeExercise=activeExercise===key ? null : key;editingSet=null;patchCards();$('card-'+key).querySelector('.exercise-toggle').focus({preventScroll:true});}
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
 else if(act==='training-help')pushSheet(showRules);
 else if(act==='settings-category')selectSettingsCategory(el.dataset.category);
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
 else if(act==='keep-editing'){pendingSheetNavigation=null;$('sheet-unsaved').hidden=true;content.querySelector('input')?.focus();}
 else if(act==='discard-edits'){const next=pendingSheetNavigation;pendingSheetNavigation=null;draftDirty=false;$('sheet-unsaved').hidden=true;next?.();}
 else if(act==='back')backSheet();
 else if(act==='close')closeSheet();
 else if(act==='undo'){
  if(undo){const previous=undo;try{if(localStorage.getItem(KEY)!==storedSnapshot)throw new Error('Data changed in another tab. Reload first.');persist(previous.state);state=previous.state;ix=M.index(state);undo=null;draftDirty=false;editingSet=null;setDrafts.clear();render();refreshSheet();notice('Undone: '+previous.label);}catch(error){notice('Could not undo: '+error.message,true);}}
 }
 else if(act==='dismiss-notice'){el.parentElement.hidden=true;}
 else if(act==='reload') {draftDirty=false;if(dialog.open)closeSheet();reload();}
 else if(act==='theme'){
  const theme=el.dataset.theme;applyTheme(theme);
  try{localStorage.setItem('wtheme',theme);}catch(error){notice('Theme changed for this visit only.',true);}
  el.focus({preventScroll:true});
 }
 else if(act==='export')exportData();
 else if(act==='export-raw'){
  const url=URL.createObjectURL(new Blob([storedSnapshot||''],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='workout-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 else if(act==='import')$('importfile').click();
});
$('importfile').addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';if(file)importFile(file);});
window.addEventListener('storage',event=>{
 if(event.key===KEY){undo=null;reload();}
 if(event.key==='wtheme')applyTheme(event.newValue==='dark'?'dark':'light');
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
