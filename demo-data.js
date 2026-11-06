/* Sample data for the design previews (host pages, gate, overall view). Every name, number and phone here is invented.
   It has the same shape as what the database sends, and goes through the same builder (live.js), so the previews draw
   exactly what the real pages will. Each invitation is one honoured-guest number for one to four seats, in numbered chairs */
(function(){
  'use strict';
  function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  var R=rng(20261220);
  function pick(a){return a[Math.floor(R()*a.length)];}

  /* the hosts and their seats, 180 in all. The family hosts' own seats come out of their 20 */
  var HOSTS=[{key:'mike',name:'Michael',seats:43},{key:'bea',name:'Beatrice',seats:37},{key:'mum',name:'Juliana',role:'Mum',seats:20},
    {key:'dad',name:'Samuel',role:'Dad',seats:20},{key:'joshua',name:'Joshua',seats:20},{key:'isaac',name:'Isaac',seats:20},{key:'benjamin',name:'Benjamin',seats:20}];
  var NAMES=[null,'Rose','Lily','Jasmine','Orchid','Hibiscus','Frangipani','Bougainvillea','Magnolia','Gardenia','Camellia',
    'Lavender','Peony','Tulip','Dahlia','Iris','Daisy','Violet','Sunflower','Azalea','Freesia'];
  /* where each host's guests sit, as in the database: table 7 is shared, 18 is the family table */
  var PLAN=[[1,'joshua',9],[2,'joshua',9],[3,'isaac',9],[4,'isaac',9],[5,'benjamin',9],[6,'benjamin',9],[7,'benjamin',1],[7,'mike',7],[7,'bea',1],
    [8,'bea',9],[9,'bea',9],[10,'mike',9],[11,'mike',9],[12,'bea',9],[13,'bea',9],[14,'mike',9],[15,'mike',9],[16,'dad',9],[17,'mum',9],
    [18,'mum',2],[18,'dad',2],[18,'joshua',2],[18,'isaac',2],[18,'benjamin',1],[19,'dad',9],[20,'mum',9]];
  /* the family hosts' own invitations, chairs 1 to 7 at the family table; 8 and 9 are Juliana's and Samuel's guest chairs */
  var FAMILY=[['mum',[1],0,''],['dad',[2],0,''],['joshua',[3,4],4,'Your four children come in with you and take no chair.'],
    ['isaac',[5,6],3,'Michael’s three children come in with your wife and take no chair.'],['benjamin',[7],0,'']];
  /* invitations the gate preview points at, by table and first chair: 418 four seats, nobody in yet; 350 three seats,
     one in; 777 two seats, both in; 263 never confirmed (950 matches nothing) */
  var PRESET={'11:1':{num:418,seats:4,status:'confirmed',att:4,name:'Mensah family'},
    '14:1':{num:350,seats:3,status:'confirmed',att:3,arrived:1,at:'4:05 pm',name:'Owusu family'},
    '12:1':{num:777,seats:2,status:'confirmed',att:2,arrived:2,at:'4:12 pm',name:'Kwame & Efua Ofori'},
    '15:1':{num:263,seats:2,status:'sent',name:'Yaw & Abena Darko'}};
  var FIRST=['Ama','Kofi','Akua','Yaw','Efua','Kwame','Abena','Kojo','Esi','Kwesi','Afia','Fiifi','Adjoa','Nii','Naa','Dede','Kweku','Selorm',
    'Elikem','Amma','Ekow','Araba','Kobina','Adwoa','Kwabena','Akosua','Kwaku','Maame','Edem','Delali'];
  var LAST=['Mensah','Boateng','Owusu','Darko','Asante','Quaye','Ofori','Addo','Armah','Tetteh','Ansah','Badu','Amoah','Sarpong','Coleman',
    'Lamptey','Agbeko','Asare','Antwi','Appiah','Nkansah','Opoku','Acheampong','Bonsu','Frimpong','Larbi','Ocansey','Nartey'];
  var TEAMS=['Choir group','Office team','Youth group','Teshie friends'];
  function nameFor(n){
    if(n===1)return pick(FIRST)+' '+pick(LAST);
    if(n===2)return R()<.5?pick(FIRST)+' & '+pick(FIRST)+' '+pick(LAST):'Mr & Mrs '+pick(LAST);
    return R()<.15?pick(TEAMS):pick(LAST)+' family';
  }
  var used={};
  function phoneFor(){var p;do{p='233'+pick(['20','24','27','54','55','59'])+String(1000000+Math.floor(R()*8999999));}while(used[p]);used[p]=1;return p;}

  var invitations=[],g=1;
  function add(v){v.grp=g++;invitations.push(v);return v;}
  FAMILY.forEach(function(f){add({host:f[0],family:true,own:'you',kids:f[2],kidsNote:f[3],status:'confirmed',table:18,chairs:f[1],seats:f[1].length,att:f[1].length});});

  /* fill each run of chairs a host has at a table with households; some chairs are not invited yet */
  for(var t=1;t<=20;t++){
    var runs=[],c=1;
    if(t===18)runs=[['mum',8,1],['dad',9,1]];
    else PLAN.filter(function(p){return p[0]===t;}).forEach(function(p){runs.push([p[1],c,p[2]]);c+=p[2];});
    runs.forEach(function(run){
      var j=0;
      while(j<run[2]){
        var first=run[1]+j,pre=PRESET[t+':'+first],n,status,att;
        if(pre){n=Math.min(pre.seats,run[2]-j);status=pre.status;att=pre.att||null;}
        else if(R()<0.2){j++;continue;}   /* not invited yet */
        else{var r=R();n=Math.min(run[2]-j,r<.42?1:r<.77?2:r<.92?3:4);status=R()<.68?'confirmed':'sent';att=status==='confirmed'?(n>1&&R()<.15?n-1:n):null;}
        var chairs=[];for(var k=0;k<n;k++)chairs.push(first+k);
        add({host:run[0],family:false,num:pre?pre.num:0,name:pre?pre.name:nameFor(n),phone:phoneFor(),status:status,table:t,
          chairs:status==='confirmed'?chairs.slice(0,att):chairs,seats:n,att:att,arrived:pre&&pre.arrived||0,arrivedAt:pre&&pre.at||null});
        j+=n;
      }
    });
  }
  /* on the night, some confirmed invitations are already in */
  invitations.forEach(function(v){
    if(v.status==='confirmed'&&!v.num&&!v.family&&R()<.42){v.arrived=v.att;v.arrivedAt=pick(['3:48 pm','3:55 pm','4:02 pm','4:06 pm','4:09 pm','4:15 pm']);}
  });
  /* honoured-guest numbers, shuffled so they say nothing about the table, and a link code for each */
  var R2=rng(418),pool=[];
  for(var n2=101;n2<=899;n2++)pool.push(n2);
  for(var q=pool.length-1;q>0;q--){var w=Math.floor(R2()*(q+1)),tmp=pool[q];pool[q]=pool[w];pool[w]=tmp;}
  var taken={950:1};invitations.forEach(function(v){if(v.num)taken[v.num]=1;});
  function token(num){var A='0123456789abcdef',x=(num*2654435761)>>>0,s='';for(var i=0;i<12;i++){s+=A[x%16];x=Math.floor(x/16)^(num*40503+i*7919);x>>>=0;}return s;}
  invitations.forEach(function(v){if(!v.num){while(taken[pool[0]])pool.shift();v.num=pool.shift();taken[v.num]=1;}v.token=token(v.num);});

  var raw={hosts:HOSTS,
    tables:NAMES.slice(1).map(function(n,i){return {num:i+1,name:n,chairs:9};}),
    plan:PLAN.map(function(p){return {table:p[0],host:p[1],chairs:p[2]};}),
    invitations:invitations,at:null};
  var D=window.LIVE.build(raw);
  D.link=function(num){return 'https://mashiteye.github.io/mibea26-dinner/?i='+token(num);};
  D.token=token;
  window.DEMO=D;
})();
