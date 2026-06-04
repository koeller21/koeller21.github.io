// Minimal HIT workout log.
// Progression: double progression (Sean Nalewanyj) + Mentzer Heavy-Duty deload.
// Storage: localStorage key "wlog" = { exerciseId: [ {d, w, r:[s1,s2]}, ... ] }
// "current" = last logged entry, "next" = computeNext() (never stored).

var DEFS = [
    {id:'push_ohp',  name:'Overhead Press',      grp:'PUSH', min:6,  max:8,  inc:2.5},
    {id:'push_incl', name:'Incline Chest Press', grp:'PUSH', min:6,  max:8,  inc:2.5},
    {id:'push_tri',  name:'Triceps Extension',   grp:'PUSH', min:8,  max:10, inc:1.25},
    {id:'push_lat',  name:'Lateral Raises',      grp:'PUSH', min:10, max:12, inc:1.25},
    {id:'push_abs',  name:'Abs',                 grp:'PUSH', min:12, max:20, inc:1.25},
    {id:'pull_pull', name:'Lat Pulldown',        grp:'PULL', min:6,  max:8,  inc:2.5},
    {id:'pull_row',  name:'Seated Row',          grp:'PULL', min:8,  max:10, inc:2.5},
    {id:'pull_dead', name:'Deadlift',            grp:'PULL', min:5,  max:8,  inc:2.5},
    {id:'pull_curl', name:'Biceps Curl',         grp:'PULL', min:8,  max:10, inc:1.25},
    {id:'pull_abs',  name:'Abs',                 grp:'PULL', min:12, max:20, inc:1.25},
    {id:'legs_hack', name:'Hack Squat',          grp:'LEGS', min:8,  max:12, inc:2.5},
    {id:'legs_ext',  name:'Leg Extension',       grp:'LEGS', min:10, max:15, inc:1.25},
    {id:'legs_curl', name:'Leg Curl',            grp:'LEGS', min:8,  max:10, inc:1.25}
];

var data = {}, rows, ov, sheet;

function loadData(){ return JSON.parse(localStorage.getItem('wlog')) || {}; }
function save(){ localStorage.setItem('wlog', JSON.stringify(data)); }
function today(){ return new Date().toISOString().slice(0, 10); }
function defById(id){ for(var i=0; i<DEFS.length; i++) if(DEFS[i].id === id) return DEFS[i]; }

function computeNext(log, def){
    if(!log || !log.length) return {w:null, reps:def.min, mode:'baseline'};
    var last = log[log.length-1], s1 = last.r[0], s2 = last.r[1], w = last.w;

    if(s1 >= def.max && s2 >= def.min)            // PROGRESS: add load, reset to bottom
        return {w: w + def.inc, reps: def.min, mode:'progress'};
    if(s1 >= def.min)                             // HOLD: same load, target +1 rep
        return {w: w, reps: Math.min(s1 + 1, def.max), mode:'hold'};

    var stalls = 0;                               // STALL: count trailing sub-min sessions
    for(var i = log.length-1; i >= 0 && log[i].r[0] < def.min; i--) stalls++;
    if(stalls >= 3) return {w: w - def.inc, reps: def.min, mode:'deload'};
    return {w: w, reps: def.min, mode:'retry'};
}

function render(){
    var html = '', grp = '';
    for(var i=0; i<DEFS.length; i++){
        var def = DEFS[i];
        if(def.grp !== grp){
            grp = def.grp;
            html += '<tr class="h"><td colspan="6">' + grp + '</td></tr>';
        }
        var log  = data[def.id] || [];
        var has  = log.length > 0;
        var cur  = has ? log[log.length-1] : null;
        var next = computeNext(log, def);
        html += '<tr>'
            + '<td>' + def.name + '</td>'
            + '<td class="tap" data-act="entry" data-id="' + def.id + '">' + (has ? cur.w : '—') + '</td>'
            + '<td class="tap" data-act="entry" data-id="' + def.id + '">' + (has ? cur.r.join(',') : '—') + '</td>'
            + '<td>' + (has ? next.w : '—') + '</td>'
            + '<td>' + (has ? next.reps : '—') + '</td>'
            + '<td><a href="#" data-act="log" data-id="' + def.id + '">log</a></td>'
            + '</tr>';
    }
    rows.innerHTML = html;
}

function openEntry(id){
    var def = defById(id), log = data[id] || [], next = computeNext(log, def);
    var w = next.w != null ? next.w : '';
    sheet.innerHTML =
        '<a href="#" data-act="close">close</a>'
        + '<h3>' + def.name + '</h3>'
        + '<p>target: ' + def.min + '–' + def.max + ' reps · 2 sets</p>'
        + '<label>kg<input id="ew" type="number" inputmode="decimal" step="0.25" value="' + w + '"></label>'
        + '<label>set 1 reps<input id="e1" type="number" inputmode="numeric" value="' + next.reps + '"></label>'
        + '<label>set 2 reps<input id="e2" type="number" inputmode="numeric" value="' + next.reps + '"></label>'
        + '<button data-act="savecur" data-id="' + id + '">save</button>';
    ov.hidden = false;
}

function saveEntry(id){
    var w  = parseFloat(document.getElementById('ew').value);
    var s1 = parseInt(document.getElementById('e1').value, 10);
    var s2 = parseInt(document.getElementById('e2').value, 10);
    if(isNaN(w) || isNaN(s1) || isNaN(s2)) return;   // ignore incomplete entries
    if(!data[id]) data[id] = [];
    data[id].push({d: today(), w: w, r: [s1, s2]});
    save(); render(); closeOv();
}

function fmtDate(d){ var p = d.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }   // ISO -> DD.MM.YYYY

function openLog(id){
    var def = defById(id), log = data[id] || [];
    var html = '<a href="#" data-act="close">close</a><h3>' + def.name + '</h3>';
    if(!log.length){
        html += '<p>no entries yet</p>';
    }else{
        html += '<table class="logt"><thead><tr><th>date</th><th>kg</th><th>reps</th><th></th></tr></thead><tbody>';
        for(var i=log.length-1; i>=0; i--){       // newest first
            html += '<tr><td>' + fmtDate(log[i].d) + '</td><td>' + log[i].w + '</td><td>' + log[i].r.join(',')
                + '</td><td><a href="#" data-act="del" data-id="' + id + '" data-i="' + i + '">delete</a></td></tr>';
        }
        html += '</tbody></table>';
    }
    sheet.innerHTML = html;
    ov.hidden = false;
}

function delEntry(id, i){
    if(!data[id]) return;
    data[id].splice(i, 1);
    if(!data[id].length) delete data[id];
    save(); render();
    openLog(id);                                  // refresh the log view in place
}

function closeOv(){ ov.hidden = true; }

function openAbout(){
    sheet.innerHTML =
        '<a href="#" data-act="close">close</a>'
        + '<h3>how progression works</h3>'
        + '<p>Two heavy working sets per exercise (Mentzer HIT) with double progression. '
        + 'Each exercise has a target rep range (for example 6 to 8). The recommended '
        + '<b>next</b> target is computed from your last session:</p>'
        + '<ul>'
        + '<li><b>add weight:</b> set 1 reached the top of the range and set 2 stayed in range. '
        + 'Load goes up one step (compound +2.5 kg, isolation +1.25 kg) and reps reset to the bottom of the range.</li>'
        + '<li><b>hold:</b> set 1 is inside the range but below the top. Keep the weight and aim for one more rep.</li>'
        + '<li><b>repeat:</b> set 1 fell below the bottom of the range. Try the same target again.</li>'
        + '<li><b>deload:</b> three sessions in a row below the bottom. Drop one step and rebuild.</li>'
        + '</ul>';
    ov.hidden = false;
}

function exportData(){
    var blob = new Blob([localStorage.getItem('wlog') || '{}'], {type:'application/json'});
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
            var obj = JSON.parse(reader.result);
            if(typeof obj !== 'object' || obj === null) throw 0;
            if(Object.keys(loadData()).length && !confirm('Replace your current history with this file?')) return;
            localStorage.setItem('wlog', JSON.stringify(obj));
            data = loadData(); render(); closeOv();
        } catch(e){ alert('could not import: not valid JSON'); }
    };
    reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', function(){
    rows  = document.getElementById('rows');
    ov    = document.getElementById('ov');
    sheet = document.getElementById('sheet');
    data  = loadData();
    render();

    // one delegated listener for everything (survives re-render)
    document.addEventListener('click', function(e){
        var t = e.target.closest('[data-act]');
        if(!t) return;
        if(t.tagName === 'A') e.preventDefault();
        var act = t.getAttribute('data-act'), id = t.getAttribute('data-id');
        if(act === 'entry')        openEntry(id);
        else if(act === 'log')     openLog(id);
        else if(act === 'savecur') saveEntry(id);
        else if(act === 'del')     delEntry(id, parseInt(t.getAttribute('data-i'), 10));
        else if(act === 'about')   openAbout();
        else if(act === 'export')  exportData();
        else if(act === 'import')  document.getElementById('importfile').click();
        else if(act === 'close')   closeOv();
    });

    document.getElementById('importfile').addEventListener('change', function(e){
        if(e.target.files[0]) importData(e.target.files[0]);
        e.target.value = '';                          // allow re-importing the same file
    });
});
