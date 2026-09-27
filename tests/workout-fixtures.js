// Stable custom program for general UI/model regressions, independent of shipping defaults.
function fixture(){
 const definitions = [
  ['Overhead Press',6,8,2.5],['Incline Chest Press',6,8,2.5],['Triceps Extension',8,10,1.25],
  ['Lateral Raises',10,12,1.25],['Abs',12,20,1.25],['Lat Pulldown',6,8,2.5],['Seated Row',8,10,2.5],
  ['Deadlift',5,8,2.5],['Biceps Curl',8,10,1.25],['Hack Squat',8,12,2.5],['Leg Extension',10,15,1.25],['Leg Curl',8,10,1.25]
 ];
 return {v:4, ex:definitions.map((e,i)=>({id:'ex_'+i,name:e[0],min:e[1],max:e[2],inc:e[3],archived:false})),
  routines:[{id:'push',name:'Push',ex:[0,1,2,3,4]},{id:'pull',name:'Pull',ex:[5,6,7,8,4]},{id:'legs',name:'Legs',ex:[9,10,11]}].map(r=>({...r,ex:r.ex.map(i=>'ex_'+i),archived:false,optional:false})), sessions:[]};
}

module.exports={fixture};
