/* Sample data for the design previews (host page, gate, overall view). Every number here is invented.
   Like the real system, it keeps no names and no phone numbers. Each invitation is one person with one number;
   invitations a host makes together (a couple, a family) share a group, arrive in one message and sit together */
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
    '18mum':{size:1},
    '18dad':{size:1},
    '18joshua':{size:2,kids:4,kidsWith:0,kidsNote:'Your four children come in with you and take no chair.'},
    '18isaac':{size:2,kids:3,kidsWith:1,kidsNote:'Michael’s three children come in with your wife and take no chair.'},
    '18benjamin':{size:1}
  };
  /* invitations the gate preview points at, keyed by their first chair:
     418 and 419 a couple, neither in yet; 350, 351 and 352 a family with 351 already in;
     777 already in; 263 never confirmed (950 matches nothing). There is no declining */
  var PRESET={
    11001:{nums:[418,419],status:'confirmed'},
    14001:{nums:[350,351,352],status:'confirmed',arrived:{351:'4:05 pm'}},
    12001:{nums:[777],status:'confirmed',arrived:{777:'4:12 pm'}},
    15001:{nums:[263],status:'sent'}
  };

  var seats=[],invites=[],groups={},byNum={},nextGroup=1;
  for(var t=1;t<=20;t++){
    for(var c=1;c<=9;c++){
      var p=PLAN[t],owner=Array.isArray(p)?p[c-1]:p,family=false;
      if(owner&&owner.slice(-1)==='*'){owner=owner.slice(0,-1);family=true;}
      seats.push({table:t,chair:c,code:t*1000+c,host:owner,family:family,inv:null});
    }
  }

  /* walk each run of chairs that one host owns at one table and fill it with groups of invitations */
  for(var tt=1;tt<=20;tt++){
    var row=seats.filter(function(s){return s.table===tt;});
    var i=0;
    while(i<row.length){
      var s0=row[i];
      if(!s0.host){i++;continue;}
      var run=0;while(i+run<row.length&&row[i+run].host===s0.host&&row[i+run].family===s0.family)run++;
      var j=0;
      while(j<run){
        var start=row[i+j],pre=PRESET[start.code],fam=null,size,status;
        if(start.family){fam=FAMILY[tt+start.host];if(!fam||fam.used){j++;continue;}fam.used=true;size=Math.min(fam.size,run-j);status='confirmed';}
        else if(pre){size=Math.min(pre.nums.length,run-j);status=pre.status;}
        else if(R()<0.2){j++;continue;}   /* not invited yet */
        else{var r=R();size=Math.min(run-j,r<.42?1:r<.77?2:r<.92?3:4);status=R()<.68?'confirmed':'sent';}
        var g=nextGroup++;groups[g]=[];
        for(var k=0;k<size;k++){
          var st=row[i+j+k],s2=status;
          if(!fam&&!pre&&k>0&&status==='confirmed'&&R()<.15)s2='sent';   /* one of a couple or family hasn't confirmed yet */
          var v={group:g,host:start.host,family:start.family,table:tt,chair:st.code,num:pre?pre.nums[k]:0,status:s2,arrived:false,arrivedAt:null,
            own:fam?(k===0?'you':'wife'):null,kids:fam&&fam.kids&&k===fam.kidsWith?fam.kids:0,kidsNote:fam&&fam.kidsNote||''};
          if(pre&&pre.arrived&&pre.arrived[v.num]){v.arrived=true;v.arrivedAt=pre.arrived[v.num];}
          st.inv=v;invites.push(v);groups[g].push(v);
        }
        j+=size;
      }
      i+=run;
    }
  }
  /* on the night, some groups are already in */
  Object.keys(groups).forEach(function(g){
    var list=groups[g];if(list[0].num)return;   /* the preview numbers stay as they are */
    if(R()<.42){var at=pick(['3:48 pm','3:55 pm','4:02 pm','4:06 pm','4:09 pm','4:15 pm']);list.forEach(function(v){if(v.status==='confirmed'){v.arrived=true;v.arrivedAt=at;}});}
  });

  /* every invitation gets an honoured-guest number, shuffled so it says nothing about the table or the group */
  var R2=rng(418),pool=[];
  for(var n=101;n<=899;n++)pool.push(n);
  for(var q=pool.length-1;q>0;q--){var w=Math.floor(R2()*(q+1)),tmp=pool[q];pool[q]=pool[w];pool[w]=tmp;}
  var taken={950:1};invites.forEach(function(v){if(v.num)taken[v.num]=1;});
  invites.forEach(function(v){if(!v.num){while(taken[pool[0]])pool.shift();v.num=pool.shift();taken[v.num]=1;}byNum[v.num]=v;});

  /* each invitation's link carries a random-looking code that says nothing about the number or the table (sample only) */
  function token(num){var A='ABCDEFGHJKMNPQRSTUVWXYZ23456789',x=(num*2654435761)>>>0,s='';for(var i=0;i<6;i++){s+=A[x%A.length];x=Math.floor(x/A.length)^(num*40503+i*7919);x>>>=0;}return s;}

  /* a host's people: invited (confirmed or not yet), confirmed, not confirmed yet, left to invite,
     and their own invitations if family (you, and your wife) */
  function tally(k){
    var t={alloc:HOSTS[k].seats,invited:0,confirmed:0,waiting:0,own:[]};
    invites.forEach(function(v){
      if(v.host!==k)return;
      if(v.family){t.own.push(v);return;}
      t.invited++;if(v.status==='confirmed')t.confirmed++;else t.waiting++;
    });
    t.guestAlloc=t.alloc-t.own.length;
    t.left=Math.max(0,t.guestAlloc-t.invited);
    return t;
  }
  window.DEMO={HOSTS:HOSTS,PLAN:PLAN,seats:seats,invites:invites,groups:groups,byNum:byNum,tally:tally,
    group:function(v){return groups[v.group]||[v];},
    hostName:function(k){return k&&HOSTS[k]?HOSTS[k].name:'';},tableName:tableName,tableLabel:tableLabel,
    link:function(num){return 'https://mashiteye.github.io/mibea26-dinner/?i='+token(num);}};
})();
