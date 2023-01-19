
const monthNames = ["January", "February", "March", "April", "May", "June",
"July", "August", "September", "October", "November", "December"
];

function buildTable(tbody, poops){
    
    var html = "";
    for(var i=poops.length-1; i>=0;i--){
        html += "<tr>"
        num = i+1;
        html += "<td>"+ num +"</td>"
        var d = new Date(poops[i].time);
        var hours = d.getHours();
        var minutes = d.getMinutes();
        var day = d.getDate();
        var month = monthNames[d.getMonth()];
        var year = d.getFullYear();
        html += "<td>"+ hours + ":" + minutes +"</td>"
        html += "<td>"+ day +"</td>"
        html += "<td>"+ month +"</td>"
        html += "<td>"+ year +"</td>"
        html += "</tr>"
        
    }
    
    tbody.innerHTML = html;
    
}

document.addEventListener("DOMContentLoaded", function () {
    
    var btn = document.getElementById("pbutton");
    var counter = document.getElementById("counter");
    var tbody = document.getElementById("tbody");
    
    var poops = JSON.parse(window.localStorage.getItem("poops"));
    if(poops == null){
        counter.innerText = "No poops yet"; 
    }else{
        counter.innerText = poops.length; 
    }

    buildTable(tbody, poops);
    
    btn.addEventListener("click", function(e){
        
        e.preventDefault();
        
        var poops = [];
        
        var present = JSON.parse(window.localStorage.getItem("poops"));
        
        if(present != null){
            poops = present
        }
        
        var today = new Date();
        var poopy = {
            time : today.toISOString()
        };
        
        poops.push(poopy);  
        
        window.localStorage.setItem("poops", JSON.stringify(poops));
        counter.innerText = poops.length; 
        
        buildTable(tbody, poops);
        
    });
    
});