/* Sample data for the design previews (host page, gate, overall view). Every number here is invented.
   Like the real system, it keeps no names and no phone numbers: an invitation is a number, its seats and its answer */
(function(){
  'use strict';
  function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  var R=rng(20261220);
  function pick(a){return a[Math.floor(R()*a.length)];}

  /* the hosts and their seats, 180 in all. The family hosts' own seats come out of their 20 */
  var HOSTS={
    mike:{name:'Michael',seats:43},
    bea:{name:'Beatrice',seats:37},
    mum:{name:'Juliana',role:'Mum',seats:20},
    dad:{name:'Samuel',role:'Dad',seats:20},
    joshua:{name:'Joshua',seats:20},
    isaac:{name:'Isaac',seats:20},
    benjamin:{name:'Benjamin',seats:20}
  };
  /* where each host's guests sit to begin with; a trailing * marks the host's own chair, all at the family table (18).
     Every chair is used. Outside the 180: Michael, Beatrice, Michael's cousin and the seven children */
  var PLAN={1:'joshua',2:'joshua',3:'isaac',4:'isaac',5:'benjamin',6:'benjamin',
    7:['benjamin','mike','mike','mike','mike','mike','mike','mike','bea'],
    8:'bea',9:'bea',10:'mike',11:'mike',12:'bea',13:'bea',14:'mike',15:'mike',
    16:'dad',17:'mum',
    18:['mum*','dad*','joshua*','joshua*','isaac*','isaac*','benjamin*','mum','dad'],
    19:'dad',20:'mum'};
  /* every table has a name and a number; guests learn theirs at the gate, so tables can still move */
  var NAMES=[null,'Rose','Lily','Jasmine','Orchid','Hibiscus','Frangipani','Bougainvillea','Magnolia','Gardenia','Camellia',
    'Lavender','Peony','Tulip','Dahlia','Iris','Daisy','Violet','Sunflower','Azalea','Freesia'];
  function tableName(t){return NAMES[t]||'';}
  function tableLabel(t){return NAMES[t]+' · '+t;}
  /* the family hosts' own invitations, at the family table, with numbers like every guest.
     Children come in with an adult and take no chair: Joshua's four with him, Michael's three with Isaac's wife */
  var FAMILY={
    '18mum':{label:'You',size:1},
    '18dad':{label:'You',size:1},
    '18joshua':{label:'You & wife',size:2,kids:4,kidsNote:'Your four children come in with you and take no chair.'},
    '18isaac':{label:'You & wife',size:2,kids:3,kidsNote:'Michael’s three children come in with you and take no chair.'},
    '18benjamin':{label:'You',size:1}
  };
  /* invitations the gate preview points at, by number:
     418 nobody in yet, 350 one of three in, 777 both in, 263 never confirmed (950 matches nothing).
     There is no declining: an invitation is confirmed, or still waiting until 10 December */
  var PRESET={
    11001:{num:418,size:4,status:'confirmed',att:4},
    14001:{num:350,size:3,status:'confirmed',att:3,arrived:1,at:'4:05 pm'},
    12001:{num:777,size:2,status:'confirmed',att:2,arrived:2,at:'4:12 pm'},
    15001:{num:263,size:2,status:'sent',att:0}
  };

  var seats=[],households=[];
  for(var t=1;t<=20;t++){
    for(var c=1;c<=9;c++){
      var p=PLAN[t],owner=Array.isArray(p)?p[c-1]:p,family=false;
      if(owner&&owner.slice(-1)==='*'){owner=owner.slice(0,-1);family=true;}
      seats.push({table:t,chair:c,code:t*1000+c,host:owner,family:family,hh:null});
    }
  }

  /* walk each run of chairs that one host owns at one table and fill it with invitations */
  for(var tt=1;tt<=20;tt++){
    var row=seats.filter(function(s){return s.table===tt;});
    var i=0;
    while(i<row.length){
      var s0=row[i];
      if(!s0.host){i++;continue;}
      var run=0;while(i+run<row.length&&row[i+run].host===s0.host&&row[i+run].family===s0.family)run++;
      var j=0;
      while(j<run){
        var start=row[i+j],pre=PRESET[start.code],fam=null,size,status,att;
        if(start.family){fam=FAMILY[tt+start.host];if(!fam||fam.used){j++;continue;}fam.used=true;size=Math.min(fam.size,run-j);}
        else if(pre){size=Math.min(pre.size,run-j);}
        else if(R()<0.13){j++;continue;}   /* not invited yet */
        else{var r=R();size=Math.min(run-j,r<.42?1:r<.77?2:r<.92?3:4);}
        if(fam){status='confirmed';att=size;}
        else if(pre){status=pre.status;att=pre.att;}
        else{var r2=R();status=r2<.68?'confirmed':'sent';att=status==='confirmed'?(size>1&&R()<.15?size-1:size):0;}
        var hh={host:start.host,family:start.family,table:tt,chairs:[],label:fam?fam.label:null,kids:fam&&fam.kids||0,kidsNote:fam&&fam.kidsNote||'',
          num:pre?pre.num:0,size:size,status:status,att:att,arrived:pre&&pre.arrived||0,arrivedAt:pre&&pre.at||null};
        for(var k=0;k<size;k++){var st=row[i+j+k];st.hh=hh;hh.chairs.push(st.code);}
        households.push(hh);
        j+=size;
      }
      i+=run;
    }
  }
  /* on the night, some confirmed invitations are already in */
  households.forEach(function(h){
    if(h.status==='confirmed'&&!h.arrived&&!h.num&&R()<.42){h.arrived=h.att;h.arrivedAt=pick(['3:48 pm','3:55 pm','4:02 pm','4:06 pm','4:09 pm','4:15 pm']);}
  });

  /* every invitation gets an honoured-guest number, shuffled so it says nothing about the table */
  var R2=rng(418),pool=[],byNum={};
  for(var n=101;n<=899;n++)pool.push(n);
  for(var q=pool.length-1;q>0;q--){var w=Math.floor(R2()*(q+1)),tmp=pool[q];pool[q]=pool[w];pool[w]=tmp;}
  var taken={950:1};households.forEach(function(h){if(h.num)taken[h.num]=1;});
  households.forEach(function(h){if(!h.num){while(taken[pool[0]])pool.shift();h.num=pool.shift();taken[h.num]=1;}byNum[h.num]=h;});

  /* each invitation's link carries a random-looking code that says nothing about the number or the table (sample only) */
  function token(num){var A='ABCDEFGHJKMNPQRSTUVWXYZ23456789',x=(num*2654435761)>>>0,s='';for(var i=0;i<6;i++){s+=A[x%A.length];x=Math.floor(x/A.length)^(num*40503+i*7919);x>>>=0;}return s;}

  /* a host's seats: invited (confirmed or not yet), confirmed, waiting, back with them (a guest confirmed
     for fewer people than invited), left to invite, and their own invitation if family */
  function tally(k){
    var t={alloc:HOSTS[k].seats,invited:0,confirmed:0,waiting:0,back:0,own:null};
    households.forEach(function(h){
      if(h.host!==k)return;
      if(h.family){t.own=h;return;}
      if(h.status==='sent'){t.invited+=h.size;t.waiting+=h.size;}
      else if(h.status==='confirmed'){t.invited+=h.att;t.confirmed+=h.att;t.back+=h.size-h.att;}
    });
    t.guestAlloc=t.alloc-(t.own?t.own.size:0);
    t.left=Math.max(0,t.guestAlloc-t.invited);
    return t;
  }
  window.DEMO={HOSTS:HOSTS,PLAN:PLAN,seats:seats,households:households,byNum:byNum,tally:tally,
    hostName:function(k){return k&&HOSTS[k]?HOSTS[k].name:'';},tableName:tableName,tableLabel:tableLabel,
    link:function(num){return 'https://mashiteye.github.io/mibea26-dinner/?i='+token(num);}};
})();
