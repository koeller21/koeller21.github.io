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

var data = [], rows, ov, sheet;

function loadData(){
    try { var d = JSON.parse(localStorage.getItem('wlog')); return Array.isArray(d) ? d : DEFAULTS(); }
    catch(e){ return DEFAULTS(); }                // corrupt storage -> fall back instead of bricking init
}
function save(){ localStorage.setItem('wlog', JSON.stringify(data)); }
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
        + '<td class="tap" data-act="entry" data-i="' + i + '">' + (has ? cur.w : '-') + '</td>'
        + '<td class="tap" data-act="entry" data-i="' + i + '">' + (has ? cur.r.join(',') : '-') + '</td>'
        + '<td>' + (next.w == null ? '-' : next.w) + '</td>'
        + '<td>' + (next.reps == null ? '-' : next.reps) + '</td>'
        + '<td><a href="#" data-act="log" data-i="' + i + '">log</a></td>'
        + '</tr>';
}

function render(){
    var html = '', groups = [], i;
    for(i=0; i<data.length; i++)                  // groups in first-seen order
        if(groups.indexOf(data[i].grp) < 0) groups.push(data[i].grp);
    for(var g=0; g<groups.length; g++){
        html += '<tr class="h"><td colspan="6">' + esc(groups[g]) + '</td></tr>';
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

function openLog(i){
    var ex = data[i], log = ex.log;
    var html = '<a href="#" data-act="close">close</a><h3>' + esc(ex.name) + '</h3>';
    if(!log.length){
        html += '<p>no entries yet</p>';
    }else{
        html += '<table class="logt"><thead><tr><th>date</th><th>kg</th><th>reps</th><th></th></tr></thead><tbody>';
        for(var e=log.length-1; e>=0; e--){       // newest first
            html += '<tr><td>' + fmtDate(log[e].d) + '</td><td>' + log[e].w + '</td><td>' + log[e].r.join(',')
                + '</td><td><a href="#" data-act="del" data-i="' + i + '" data-e="' + e + '">delete</a></td></tr>';
        }
        html += '</tbody></table>';
    }
    sheet.innerHTML = html;
    ov.hidden = false;
}

function delEntry(i, e){
    data[i].log.splice(e, 1);
    save(); render();
    openLog(i);                                   // exercise index unchanged by a log splice
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
    var blob = new Blob([localStorage.getItem('wlog') || '[]'], {type:'application/json'});
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
            var arr = JSON.parse(reader.result);
            var okEntry = function(s){                                  // a log entry: {d:string, w:number, r:[number,number]}
                return s && typeof s.d === 'string' && typeof s.w === 'number'
                    && Array.isArray(s.r) && s.r.length === 2 && typeof s.r[0] === 'number' && typeof s.r[1] === 'number';
            };
            var ok = Array.isArray(arr) && arr.every(function(e){       // reject malformed files instead of crashing render()
                return e && typeof e.name === 'string' && typeof e.grp === 'string'
                    && typeof e.min === 'number' && typeof e.max === 'number' && typeof e.inc === 'number'
                    && Array.isArray(e.log) && e.log.every(okEntry);
            });
            if(!ok) throw 0;
            if(data.length && !confirm('Replace your current exercises and history with this file?')) return;
            localStorage.setItem('wlog', JSON.stringify(arr));
            data = loadData(); render(); closeOv();
        } catch(e){ alert('could not import: not a valid workout file'); }
    };
    reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', function(){
    rows  = document.getElementById('rows');
    ov    = document.getElementById('ov');
    sheet = document.getElementById('sheet');
    data  = loadData();
    if(!localStorage.getItem('wlog')) save();     // persist defaults on first visit
    render();

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
