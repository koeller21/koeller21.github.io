// Minimal HIT workout log.
// Progression: double progression + Mentzer-style deload.
// Storage: localStorage key "wlog" = array of exercises, each carrying its own log:
//   [ {name, grp, min, max, inc, log:[ {d:'YYYY-MM-DD', w, r:[s1,s2]} ]}, ... ]
// "current" = last log entry, "next" = computeNext() (never stored). Array index = click handle.

function DEFAULTS(){
    return [
        {name:'Overhead Press',      grp:'PUSH', min:6,  max:8,  inc:2.5},
        {name:'Incline Chest Press', grp:'PUSH', min:6,  max:8,  inc:2.5},
        {name:'Triceps Extension',   grp:'PUSH', min:8,  max:10, inc:1.25},
        {name:'Lateral Raises',      grp:'PUSH', min:10, max:12, inc:1.25},
        {name:'Abs',                 grp:'PUSH', min:12, max:20, inc:1.25},
        {name:'Lat Pulldown',        grp:'PULL', min:6,  max:8,  inc:2.5},
        {name:'Seated Row',          grp:'PULL', min:8,  max:10, inc:2.5},
        {name:'Deadlift',            grp:'PULL', min:5,  max:8,  inc:2.5},
        {name:'Biceps Curl',         grp:'PULL', min:8,  max:10, inc:1.25},
        {name:'Abs',                 grp:'PULL', min:12, max:20, inc:1.25},
        {name:'Hack Squat',          grp:'LEGS', min:8,  max:12, inc:2.5},
        {name:'Leg Extension',       grp:'LEGS', min:10, max:15, inc:1.25},
        {name:'Leg Curl',            grp:'LEGS', min:8,  max:10, inc:1.25}
    ].map(function(e){ e.log = []; return e; });
}

var data = [], cal = {b:0, d:{}}, wt = [], rows, ov, sheet;   // cal: {b:budget, d:{date:[kcal,..]}}, wt: [{d,kg}]

function loadData(){
    try { var d = JSON.parse(localStorage.getItem('wlog')); return Array.isArray(d) ? d : DEFAULTS(); }
    catch(e){ return DEFAULTS(); }                // corrupt storage -> fall back instead of bricking init
}
function save(){ localStorage.setItem('wlog', JSON.stringify(data)); }
function jload(key, fb){ try{ var v = JSON.parse(localStorage.getItem(key)); return v && typeof v === 'object' ? v : fb; }catch(e){ return fb; } }
function saveCal(){ localStorage.setItem('wcal', JSON.stringify(cal)); }
function saveWt(){ localStorage.setItem('wwt', JSON.stringify(wt)); }
function today(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }   // local date
function fmtDate(d){ var p = d.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }   // ISO -> DD.MM.YYYY
function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
    return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]; }); }

// Suggested next {w, reps}, or {w:null, reps:null} when there is no suggestion:
// no history yet, OR increment 0 = progression turned off for this exercise.
function computeNext(ex){
    var log = ex.log;
    if(!ex.inc || !log.length) return {w:null, reps:null};
    var last = log[log.length-1], s1 = last.r[0], s2 = last.r[1], w = last.w;

    if(s1 >= ex.max && s2 >= ex.min)              // PROGRESS: add load, reset to bottom
        return {w: w + ex.inc, reps: ex.min};
    if(s1 >= ex.min)                              // HOLD: same load, target +1 rep
        return {w: w, reps: Math.min(s1 + 1, ex.max)};

    var stalls = 0;                               // STALL: count trailing sub-min sessions
    for(var i = log.length-1; i >= 0 && log[i].r[0] < ex.min; i--) stalls++;
    if(stalls >= 3) return {w: Math.max(0, w - ex.inc), reps: ex.min};   // deload (never below 0)
    return {w: w, reps: ex.min};                  // retry
}

function rowHtml(ex, i){
    var log = ex.log, has = log.length > 0;
    var cur = has ? log[log.length-1] : null;
    var next = computeNext(ex);
    return '<tr>'
        + '<td class="tap" data-act="editex" data-i="' + i + '">' + esc(ex.name) + '</td>'
        + '<td class="tap" data-act="entry" data-i="' + i + '">' + (has ? cur.w + '×' + cur.r.join(',') : '-') + '</td>'
        + '<td>' + (next.w == null ? '-' : next.w + '×' + next.reps) + '</td>'
        + '<td><a href="#" data-act="log" data-i="' + i + '">log</a></td>'
        + '</tr>';
}

function render(){
    var html = '', groups = [], i;
    for(i=0; i<data.length; i++)                  // groups in first-seen order
        if(groups.indexOf(data[i].grp) < 0) groups.push(data[i].grp);
    for(var g=0; g<groups.length; g++){
        html += '<tr class="h"><td colspan="4">' + esc(groups[g]) + '</td></tr>';
        for(i=0; i<data.length; i++)
            if(data[i].grp === groups[g]) html += rowHtml(data[i], i);
    }
    rows.innerHTML = html;
}

function openEntry(i){
    var ex = data[i], next = computeNext(ex);
    var last = ex.log.length ? ex.log[ex.log.length-1] : null;   // no suggestion -> prefill "repeat last"
    var w  = next.w    != null ? next.w    : (last ? last.w    : '');
    var r1 = next.reps != null ? next.reps : (last ? last.r[0] : ex.min);
    var r2 = next.reps != null ? next.reps : (last ? last.r[1] : ex.min);
    sheet.innerHTML =
        '<a href="#" data-act="close">close</a>'
        + '<h3>' + esc(ex.name) + '</h3>'
        + '<p>target: ' + ex.min + ' to ' + ex.max + ' reps · 2 sets</p>'
        + '<label>kg<input id="ew" type="text" inputmode="decimal" value="' + w + '"></label>'
        + '<label>set 1 reps<input id="e1" type="number" inputmode="numeric" value="' + r1 + '"></label>'
        + '<label>set 2 reps<input id="e2" type="number" inputmode="numeric" value="' + r2 + '"></label>'
        + '<button data-act="savecur" data-i="' + i + '">save</button>';
    ov.hidden = false;
}

function saveEntry(i){
    var w  = parseFloat(document.getElementById('ew').value.replace(',', '.'));
    var s1 = parseInt(document.getElementById('e1').value, 10);
    var s2 = parseInt(document.getElementById('e2').value, 10);
    if(isNaN(w) || isNaN(s1) || isNaN(s2)) return;   // ignore incomplete entries
    data[i].log.push({d: today(), w: w, r: [s1, s2]});
    save(); render(); closeOv();
}

function e1rm(w, reps){ return w * (1 + reps / 30); }   // Epley estimated 1-rep max

function readout(e){ return e.w + ' kg × ' + e.r.join(',') + ' · e1RM ' + Math.round(e1rm(e.w, e.r[0])) + ' · ' + fmtDate(e.d); }

// generic inline SVG line chart over parallel date/value arrays. no deps.
// built at device width (1 svg unit = 1px) so hairlines and 10px labels stay crisp on any screen.
// wireChart() makes it interactive; pair it with a .readout line.
function chartSvg(ds, vals){
    if(vals.length < 2) return '';
    var W = Math.min(560, (window.innerWidth || 400) - 40), H = 190;
    var T = 10, B = H - 24, L = 40, R = W - 10, n = vals.length;
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if(min === max){ min -= 1; max += 1; }
    var yOf = function(v){ return (T + (1 - (v - min) / (max - min)) * (B - T)).toFixed(1); };

    var step = Math.pow(10, Math.floor(Math.log(max - min) / Math.LN10));   // clean steps -> 2-5 gridlines
    if((max - min) / step >= 5) step *= 2; else if((max - min) / step < 2) step /= 2;
    var s = '';
    for(var v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step)
        s += '<line class="grid" x1="' + L + '" y1="' + yOf(v) + '" x2="' + R + '" y2="' + yOf(v) + '"/>'
           + '<text class="tick" x="' + (L - 8) + '" y="' + (+yOf(v) + 3) + '" text-anchor="end">' + Math.round(v * 100) / 100 + '</text>';

    var pts = [];
    for(var k = 0; k < n; k++)
        pts.push((L + k * (R - L) / (n - 1)).toFixed(1) + ',' + yOf(vals[k]));
    var lp = pts[n - 1].split(',');
    return '<svg class="chart" width="' + W + '" height="' + H + '" role="img" aria-label="trend">'
        + s
        + '<line class="grid" x1="' + L + '" y1="' + B + '" x2="' + R + '" y2="' + B + '"/>'
        + '<text class="tick" x="' + L + '" y="' + (H - 6) + '">' + fmtDate(ds[0]) + '</text>'
        + '<text class="tick" x="' + R + '" y="' + (H - 6) + '" text-anchor="end">' + fmtDate(ds[n - 1]) + '</text>'
        + '<line class="xh" x1="' + lp[0] + '" y1="' + T + '" x2="' + lp[0] + '" y2="' + B + '"/>'
        + '<polyline points="' + pts.join(' ') + '"/>'
        + '<circle class="sel" cx="' + lp[0] + '" cy="' + lp[1] + '" r="4"/>'
        + '</svg>';
}

// tap or drag on the sheet's chart -> fmt(k) into its .readout line
function wireChart(fmt){
    var svg = sheet.querySelector('.chart'), ro = sheet.querySelector('.readout');
    if(!svg || !ro) return;
    var P = svg.querySelector('polyline').getAttribute('points').split(' ').map(function(p){ return p.split(','); });
    var xh = svg.querySelector('.xh'), dot = svg.querySelector('.sel');
    var pick = function(ev){
        if(ev.type === 'pointermove' && !ev.buttons) return;
        var f = (ev.clientX - svg.getBoundingClientRect().left - P[0][0]) / (P[P.length - 1][0] - P[0][0]);
        var k = Math.max(0, Math.min(P.length - 1, Math.round(f * (P.length - 1))));
        xh.setAttribute('x1', P[k][0]); xh.setAttribute('x2', P[k][0]);
        dot.setAttribute('cx', P[k][0]); dot.setAttribute('cy', P[k][1]);
        ro.textContent = fmt(k);
        ev.preventDefault();
    };
    svg.addEventListener('pointerdown', pick);
    svg.addEventListener('pointermove', pick);
}

function openLog(i){
    var ex = data[i], log = ex.log;
    var html = '<a href="#" data-act="close">close</a><h3>' + esc(ex.name) + '</h3>';
    if(!log.length){
        html += '<p>no entries yet</p>';
    }else{
        var ds = [], vs = [], k;
        for(k = 0; k < log.length; k++){ ds.push(log[k].d); vs.push(e1rm(log[k].w, log[k].r[0])); }
        var c = chartSvg(ds, vs);
        if(c) html += c + '<p class="readout">' + readout(log[log.length - 1]) + '</p>'
            + '<p class="cap">e1RM = kg × (1 + reps ÷ 30), estimated single-rep max</p>';
        html += '<table class="logt"><thead><tr><th>date</th><th>kg</th><th>reps</th><th></th></tr></thead><tbody>';
        for(var e=log.length-1; e>=0; e--){       // newest first
            html += '<tr><td>' + fmtDate(log[e].d) + '</td><td>' + log[e].w + '</td><td>' + log[e].r.join(',')
                + '</td><td><a href="#" data-act="del" data-i="' + i + '" data-e="' + e + '">delete</a></td></tr>';
        }
        html += '</tbody></table>';
    }
    sheet.innerHTML = html;
    ov.hidden = false;
    wireChart(function(k){ return readout(log[k]); });
}

function delEntry(i, e){
    data[i].log.splice(e, 1);
    save(); render();
    openLog(i);                                   // exercise index unchanged by a log splice
}

function calV(x){ return typeof x === 'number' ? x : x.v; }          // cal entry = number | {v, n}
function calN(x){ return typeof x === 'number' || !x.n ? '' : x.n; }
function calSum(arr){ var s = 0; for(var k = 0; k < arr.length; k++) s += calV(arr[k]); return s; }

function renderStat(){                            // status line: today's kcal vs budget + latest weight
    var sum = calSum(cal.d[today()] || []);
    var kc = document.getElementById('kc'), kw = document.getElementById('kw');
    kc.textContent = sum + (cal.b ? '/' + cal.b : '') + ' kcal';
    kc.className = cal.b && sum > cal.b ? 'over' : '';
    kw.textContent = (wt.length ? wt[wt.length - 1].kg : '-') + ' kg';
}

function openCal(skipFocus){
    var t = cal.d[today()] || [], sum = calSum(t), k;
    var big = sum + (cal.b ? ' / ' + cal.b + ' · ' + (sum <= cal.b ? (cal.b - sum) + ' left' : (sum - cal.b) + ' over') : '');
    var rows = '';
    for(k = t.length - 1; k >= 0; k--)
        rows += '<tr><td>' + calV(t[k]) + '</td><td>' + esc(calN(t[k])) + '</td><td><a href="#" data-act="cdel" data-e="' + k + '">delete</a></td></tr>';
    var ds = Object.keys(cal.d).sort(), vs = [];  // one point per logged day
    for(k = 0; k < ds.length; k++) vs.push(calSum(cal.d[ds[k]]));
    var c = chartSvg(ds, vs);
    sheet.innerHTML =
        '<a href="#" data-act="close">close</a>'
        + '<h3>calories</h3>'
        + '<p class="big' + (cal.b && sum > cal.b ? ' over' : '') + '">' + big + '</p>'
        + '<label>add kcal<input id="cv" type="text" inputmode="numeric"></label>'
        + '<label>name (optional)<input id="cn" type="text" maxlength="24"></label>'
        + '<button data-act="calsave">add</button>'
        + (rows ? '<table class="logt"><thead><tr><th>today</th><th></th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' : '')
        + (c ? c + '<p class="readout">' + vs[vs.length - 1] + ' kcal · ' + fmtDate(ds[ds.length - 1]) + '</p>' : '')
        + '<p class="cap">daily budget ' + (cal.b || 'not set') + ' · <a href="#" data-act="budget">change</a></p>';
    ov.hidden = false;
    wireChart(function(k){ return vs[k] + ' kcal · ' + fmtDate(ds[k]); });
    if(!skipFocus) document.getElementById('cv').focus();
}

function addCal(){
    var v = parseInt(document.getElementById('cv').value, 10);
    if(isNaN(v) || v <= 0) return;
    var n = document.getElementById('cn').value.trim();
    var key = today();
    (cal.d[key] = cal.d[key] || []).push(n ? {v: v, n: n} : v);   // unnamed entries stay plain numbers
    saveCal(); renderStat();
    openCal();                                    // stay open: fresh inputs, keypad up, ready for the next item
}

function openBudget(){                            // one-field editor (native prompt() gets suppressed on mobile)
    sheet.innerHTML =
        '<a href="#" data-act="close">close</a>'
        + '<h3>daily budget</h3>'
        + '<label>kcal (0 = off)<input id="cb" type="text" inputmode="numeric" value="' + (cal.b || '') + '"></label>'
        + '<button data-act="budgetsave">save</button>';
    ov.hidden = false;
    var inp = document.getElementById('cb');
    inp.focus(); inp.select();
}

function saveBudget(){
    var b = parseInt(document.getElementById('cb').value, 10);
    cal.b = isNaN(b) || b < 0 ? 0 : b;
    saveCal(); renderStat(); openCal(true);
}

function delCal(e){
    var key = today(), t = cal.d[key];
    if(!t) return;
    t.splice(e, 1);
    if(!t.length) delete cal.d[key];
    saveCal(); renderStat(); openCal(true);
}

function openWt(skipFocus){
    var last = wt.length ? wt[wt.length - 1] : null, k;
    var rows = '';
    for(k = wt.length - 1; k >= 0; k--)
        rows += '<tr><td>' + fmtDate(wt[k].d) + '</td><td>' + wt[k].kg + '</td><td><a href="#" data-act="wdel" data-e="' + k + '">delete</a></td></tr>';
    var ds = [], vs = [];
    for(k = 0; k < wt.length; k++){ ds.push(wt[k].d); vs.push(wt[k].kg); }
    var c = chartSvg(ds, vs);
    sheet.innerHTML =
        '<a href="#" data-act="close">close</a>'
        + '<h3>weight</h3>'
        + '<label>kg<input id="wv" type="text" inputmode="decimal" value="' + (last ? last.kg : '') + '"></label>'
        + '<button data-act="wtsave">save</button>'
        + (c ? c + '<p class="readout">' + last.kg + ' kg · ' + fmtDate(last.d) + '</p>' : '')
        + (rows ? '<table class="logt"><thead><tr><th>date</th><th>kg</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' : '');
    ov.hidden = false;
    wireChart(function(k){ return vs[k] + ' kg · ' + fmtDate(ds[k]); });
    var inp = document.getElementById('wv');
    if(!skipFocus){ inp.focus(); inp.select(); }
}

function addWt(){
    var v = parseFloat(document.getElementById('wv').value.replace(',', '.'));
    if(isNaN(v) || v <= 0) return;
    var key = today(), last = wt.length ? wt[wt.length - 1] : null;
    if(last && last.d === key) last.kg = v;       // one weigh-in per day: same-day save overwrites
    else wt.push({d: key, kg: v});
    saveWt(); renderStat(); closeOv();
}

function delWt(e){
    wt.splice(e, 1);
    saveWt(); renderStat(); openWt(true);
}

function openExercise(i){
    var ex = i >= 0 ? data[i] : {name:'', grp:'', min:8, max:12, inc:2.5};
    var groups = [], k;
    for(k=0; k<data.length; k++) if(groups.indexOf(data[k].grp) < 0) groups.push(data[k].grp);
    var opts = groups.map(function(g){ return '<option value="' + esc(g) + '">'; }).join('');
    var del = i >= 0 ? '<button class="danger" data-act="delex" data-i="' + i + '">delete exercise</button>' : '';
    sheet.innerHTML =
        '<a href="#" data-act="close">close</a>'
        + '<h3>' + (i >= 0 ? 'edit exercise' : 'add exercise') + '</h3>'
        + '<label>name<input id="xn" value="' + esc(ex.name) + '"></label>'
        + '<label>group<input id="xg" list="grps" value="' + esc(ex.grp) + '"></label>'
        + '<datalist id="grps">' + opts + '</datalist>'
        + '<label>min reps<input id="xmin" type="number" inputmode="numeric" value="' + ex.min + '"></label>'
        + '<label>max reps<input id="xmax" type="number" inputmode="numeric" value="' + ex.max + '"></label>'
        + '<label>increment kg<input id="xinc" type="text" inputmode="decimal" value="' + ex.inc + '"></label>'
        + '<button data-act="saveex" data-i="' + i + '">save</button>'
        + del;
    ov.hidden = false;
}

function saveExercise(i){
    var name = document.getElementById('xn').value.trim();
    var grp  = document.getElementById('xg').value.trim().toUpperCase() || 'OTHER';
    var min  = parseInt(document.getElementById('xmin').value, 10);
    var max  = parseInt(document.getElementById('xmax').value, 10);
    var inc  = parseFloat(document.getElementById('xinc').value.replace(',', '.'));
    if(!name){ alert('name required'); return; }
    if(isNaN(min) || isNaN(max) || min < 1 || min > max){ alert('need min <= max'); return; }
    if(isNaN(inc) || inc < 0){ alert('increment must be 0 or more'); return; }   // 0 = progression off
    if(i >= 0){                                   // edit: keep existing log
        data[i].name = name; data[i].grp = grp;
        data[i].min = min;   data[i].max = max; data[i].inc = inc;
    }else{                                        // new
        data.push({name:name, grp:grp, min:min, max:max, inc:inc, log:[]});
    }
    save(); render(); closeOv();
}

function delExercise(i){
    if(data[i].log.length && !confirm('Delete "' + data[i].name + '" and its ' + data[i].log.length + ' logged sessions?')) return;
    data.splice(i, 1);
    save(); render(); closeOv();                  // closeOv() makes the index shift safe
}

function closeOv(){ ov.hidden = true; }

function toggleTheme(){
    var t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
    localStorage.setItem('wtheme', t);
}

function openAbout(){
    sheet.innerHTML =
        '<a href="#" data-act="close">close</a>'
        + '<h3>progression rules</h3>'
        + '<p>Two heavy working sets per exercise with double progression. '
        + 'Each exercise has a target rep range (for example 6 to 8). The recommended '
        + '<b>next</b> target is computed from your last session:</p>'
        + '<br/>'
        + '<ul>'
        + '<li><b>add weight:</b> set 1 reached the top of the range and set 2 stayed in range. '
        + 'Load goes up by the exercise\'s increment and reps reset to the bottom of the range.</li>'
        + '<li><b>hold:</b> set 1 is inside the range but below the top. Keep the weight and aim for one more rep.</li>'
        + '<li><b>repeat:</b> set 1 fell below the bottom of the range. Try the same target again.</li>'
        + '<li><b>deload:</b> three sessions in a row below the bottom. Drop one step and rebuild.</li>'
        + '</ul>'
        + '<br/>'
        + '<p>Set an exercise\'s increment to 0 to turn progression off - it just records your sets, with no suggested target.</p>';
    ov.hidden = false;
}

function exportData(){
    var blob = new Blob([JSON.stringify({ex: data, cal: cal, wt: wt})], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'workout.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData(file){
    var reader = new FileReader();
    reader.onload = function(){
        try {
            var raw = JSON.parse(reader.result);
            var pack = Array.isArray(raw) ? {ex: raw} : raw;            // legacy export = bare exercise array
            var okEntry = function(s){                                  // a log entry: {d:string, w:number, r:[number,number]}
                return s && typeof s.d === 'string' && typeof s.w === 'number'
                    && Array.isArray(s.r) && s.r.length === 2 && typeof s.r[0] === 'number' && typeof s.r[1] === 'number';
            };
            var ok = pack && Array.isArray(pack.ex) && pack.ex.every(function(e){   // reject malformed files instead of crashing render()
                return e && typeof e.name === 'string' && typeof e.grp === 'string'
                    && typeof e.min === 'number' && typeof e.max === 'number' && typeof e.inc === 'number'
                    && Array.isArray(e.log) && e.log.every(okEntry);
            });
            if(!ok) throw 0;
            if(data.length && !confirm('Replace your current exercises and history with this file?')) return;
            localStorage.setItem('wlog', JSON.stringify(pack.ex));
            if(pack.cal && typeof pack.cal === 'object' && pack.cal.d && typeof pack.cal.d === 'object'
                && Object.keys(pack.cal.d).every(function(k){ var a = pack.cal.d[k]; return Array.isArray(a) && a.every(function(x){
                    return typeof x === 'number' || (x && typeof x.v === 'number' && (x.n === undefined || typeof x.n === 'string')); }); })){
                cal = {b: +pack.cal.b || 0, d: pack.cal.d}; saveCal();
            }
            if(Array.isArray(pack.wt) && pack.wt.every(function(e){ return e && typeof e.d === 'string' && typeof e.kg === 'number'; })){
                wt = pack.wt; saveWt();
            }
            data = loadData(); render(); renderStat(); closeOv();
        } catch(e){ alert('could not import: not a valid workout file'); }
    };
    reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', function(){
    rows  = document.getElementById('rows');
    ov    = document.getElementById('ov');
    sheet = document.getElementById('sheet');
    data  = loadData();
    cal = jload('wcal', {b:0, d:{}});
    if(!cal.d || typeof cal.d !== 'object') cal = {b:0, d:{}};
    cal.b = +cal.b || 0;
    wt = jload('wwt', []);
    if(!Array.isArray(wt)) wt = [];
    if(!localStorage.getItem('wlog')) save();     // persist defaults on first visit
    render(); renderStat();

    // one delegated listener for everything (survives re-render)
    document.addEventListener('click', function(e){
        var t = e.target.closest('[data-act]');
        if(!t) return;
        if(t.tagName === 'A') e.preventDefault();
        var act = t.getAttribute('data-act');
        var i = t.hasAttribute('data-i') ? parseInt(t.getAttribute('data-i'), 10) : -1;
        if(act === 'entry')        openEntry(i);
        else if(act === 'log')     openLog(i);
        else if(act === 'savecur') saveEntry(i);
        else if(act === 'del')     delEntry(i, parseInt(t.getAttribute('data-e'), 10));
        else if(act === 'editex')  openExercise(i);
        else if(act === 'addex')   openExercise(-1);
        else if(act === 'saveex')  saveExercise(i);
        else if(act === 'delex')   delExercise(i);
        else if(act === 'cal')     openCal();
        else if(act === 'wt')      openWt();
        else if(act === 'calsave') addCal();
        else if(act === 'budget')  openBudget();
        else if(act === 'budgetsave') saveBudget();
        else if(act === 'wtsave')  addWt();
        else if(act === 'cdel')    delCal(parseInt(t.getAttribute('data-e'), 10));
        else if(act === 'wdel')    delWt(parseInt(t.getAttribute('data-e'), 10));
        else if(act === 'about')   openAbout();
        else if(act === 'export')  exportData();
        else if(act === 'import')  document.getElementById('importfile').click();
        else if(act === 'theme')   toggleTheme();
        else if(act === 'close')   closeOv();
    });

    document.getElementById('importfile').addEventListener('change', function(e){
        if(e.target.files[0]) importData(e.target.files[0]);
        e.target.value = '';                          // allow re-importing the same file
    });
});
