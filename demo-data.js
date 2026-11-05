/* Sample data for the design previews (host board, gate, overall view). Every name and number here is invented. */
(function(){
  'use strict';
  function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  var R=rng(20261220);
  function pick(a){return a[Math.floor(R()*a.length)];}

  var HOSTS={
    mike:{name:'Michael',seats:43},
    bea:{name:'Beatrice',seats:37},
    mum:{name:'Mum',seats:10},
    dad:{name:'Dad',seats:10},
    b1:{name:'Brother 1',seats:20},
    b2:{name:'Brother 2',seats:20},
    b3:{name:'Brother 3',seats:20}
  };
  /* which host owns each chair; a trailing * marks a family table */
  var PLAN={1:'b1',2:'b2',3:'b3',4:'b3',5:'b1',6:'b2',
    7:['mum','dad','b1','b1','b2','b2','b3','b3',null],
    8:['mike','mike','mike','mike','mike','mike','mike','bea',null],
    9:'bea',10:'bea',11:'mike',12:'mike',13:'bea',14:'bea',15:'mike',16:'mike',17:'mum',18:'bea*',19:'mike*',20:'dad'};

  var FIRST=['Ama','Kofi','Akosua','Kwame','Efua','Yaw','Abena','Kojo','Adwoa','Kwesi','Esi','Kwabena','Afua','Kweku','Akua','Yaa','Selorm','Edem','Dzifa','Naa','Nii','Ayele','Elikem','Dela','Korkor','Aku','Fiifi','Araba','Ekow','Nana'];
  var LAST=['Mensah','Owusu','Boateng','Asante','Addo','Tetteh','Quaye','Lartey','Ofori','Agyeman','Ansah','Darko','Amoah','Quartey','Nortey','Armah','Adjei','Lamptey','Annan','Otoo','Sowah','Ankrah','Odoi','Clottey'];
  function phone(){var s=pick(['024','054','055','020','050','026','027','059']);for(var i=0;i<7;i++)s+=Math.floor(R()*10);return s;}
  function initials(n){return n.split(' ').map(function(w){return w.charAt(0);}).join('').slice(0,2).toUpperCase();}
  var SENT_ON=['1 Dec','2 Dec','3 Dec','4 Dec','6 Dec','7 Dec'];

  /* named households the previews point at: a single match, a shared four digits, an already admitted pair, a number mismatch */
  var PRESET={
    11001:{name:'Ama Mensah',size:4,status:'confirmed',att:4,host:'0244122580'},
    15001:{name:'Kofi Owusu',size:2,status:'confirmed',att:2,host:'0551234417'},
    3001:{name:'Edem Tetteh',size:2,status:'confirmed',att:2,host:'0207784417'},
    12001:{name:'Esi Quaye',size:2,status:'confirmed',att:2,host:'0246667777',arrived:2,at:'4:12 pm'},
    16001:{name:'Yaw Boateng',size:3,status:'confirmed',att:3,host:'0245551290',guest:'0245551209'}
  };

  var seats=[],households=[],byCode={};
  for(var t=1;t<=20;t++){
    for(var c=1;c<=9;c++){
      var p=PLAN[t],owner=Array.isArray(p)?p[c-1]:p,family=false;
      if(owner&&owner.slice(-1)==='*'){owner=owner.slice(0,-1);family=true;}
      var seat={table:t,chair:c,code:t*1000+c,host:owner,family:family,hh:null};
      seats.push(seat);byCode[seat.code]=seat;
    }
  }

  /* walk each run of chairs that one host owns at one table and fill it with households */
  for(var tt=1;tt<=20;tt++){
    var row=seats.filter(function(s){return s.table===tt;});
    var i=0;
    while(i<row.length){
      var s0=row[i];
      if(!s0.host){i++;continue;}
      var run=0;while(i+run<row.length&&row[i+run].host===s0.host&&row[i+run].family===s0.family)run++;
      var j=0;
      while(j<run){
        var start=row[i+j],pre=PRESET[start.code],size,hh;
        if(pre){size=Math.min(pre.size,run-j);}
        else if(!start.family&&R()<0.13){j++;continue;}   /* left open */
        else{var r=R();size=Math.min(run-j,r<.42?1:r<.77?2:r<.92?3:4);}
        var name=pre?pre.name:pick(FIRST)+' '+pick(LAST);
        var status,att;
        if(pre){status=pre.status;att=pre.att;}
        else if(start.family){status='confirmed';att=size;}
        else{var r2=R();status=r2<.6?'confirmed':r2<.88?'sent':'declined';att=status==='confirmed'?(size>1&&R()<.15?size-1:size):0;}
        var hostPhone=pre?pre.host:phone();
        var guestPhone=status!=='confirmed'?null:pre?(pre.guest||hostPhone):(R()<.03?phone():hostPhone);
        hh={id:households.length+1,host:start.host,family:start.family,table:tt,chairs:[],name:name,initials:initials(name),
            hostPhone:hostPhone,guestPhone:guestPhone,size:size,status:status,att:att,
            sentOn:pick(SENT_ON),arrived:pre&&pre.arrived?pre.arrived:0,arrivedAt:pre&&pre.at?pre.at:null};
        for(var k=0;k<size;k++){var st=row[i+j+k];st.hh=hh;hh.chairs.push(st.code);}
        households.push(hh);
        j+=size;
      }
      i+=run;
    }
  }
  /* on the night, some confirmed households are already in */
  households.forEach(function(h){
    if(h.status==='confirmed'&&!h.arrived&&!PRESET[h.chairs[0]]&&R()<.42){h.arrived=h.att;h.arrivedAt=pick(['3:48 pm','3:55 pm','4:02 pm','4:06 pm','4:09 pm','4:15 pm']);}
  });

  function last4(h){return (h.guestPhone||h.hostPhone).slice(-4);}
  function mismatch(h){return !!(h.guestPhone&&h.guestPhone!==h.hostPhone);}
  /* the state one chair shows: open, sent, confirmed, declined, freed (a household seat not being used), arrived, spare */
  function seatState(s,night){
    if(!s.host)return 'spare';
    var h=s.hh;if(!h)return 'open';
    if(h.status==='sent')return 'sent';
    if(h.status==='declined')return 'declined';
    var idx=h.chairs.indexOf(s.code);
    if(idx>=h.att)return 'freed';
    if(night&&idx<h.arrived)return 'arrived';
    return 'confirmed';
  }
  function fmtPhone(p){return p?p.slice(0,3)+' '+p.slice(3,6)+' '+p.slice(6):'';}

  window.DEMO={HOSTS:HOSTS,PLAN:PLAN,seats:seats,households:households,byCode:byCode,
    last4:last4,mismatch:mismatch,seatState:seatState,fmtPhone:fmtPhone,initials:initials,
    hostName:function(k){return k&&HOSTS[k]?HOSTS[k].name:'';},
    link:function(code){return 'https://mashiteye.github.io/mibea26-dinner/?s='+code+'&k=KX7Q';}};
})();
