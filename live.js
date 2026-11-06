/* Turns what the database sends (host_overview, gate_list, admin_get) into the shape the host pages, the gate and the
   overall view draw from. The design preview's sample data goes through the same builder, so both draw with the same code.
   Each invitation is one number for one to four seats, sitting in numbered chairs at one table */
(function(){
  'use strict';
  var Q=new URLSearchParams(location.search);
  function clock(iso){if(!iso)return null;var d=new Date(iso),h=d.getHours(),m=d.getMinutes();return (h%12||12)+':'+(m<10?'0':'')+m+(h<12?' am':' pm');}
  /* the chairs an invitation holds: what was confirmed, or all its seats while it waits */
  function held(v){return v.status==='confirmed'?(v.att||v.seats):v.status==='sent'?v.seats:0;}
  function build(json){
    var HOSTS={},names={},invites=[],groups={},byNum={},seats=[],unseated=[],plan=[];
    (Array.isArray(json.hosts)?json.hosts:Object.keys(json.hosts||{}).map(function(k){var h=json.hosts[k];h.key=k;return h;}))
      .forEach(function(h){HOSTS[h.key]={name:h.name,role:h.role||null,seats:h.seats||0,token:h.token||null,phone:h.phone||null};});
    (Array.isArray(json.tables)?json.tables:Object.keys(json.tables||{}).map(function(k){return {num:+k,name:json.tables[k],chairs:9};}))
      .forEach(function(t){names[t.num]={name:t.name,chairs:t.chairs||9};});
    (json.plan||[]).forEach(function(p){plan.push({table:p.table,host:p.host,chairs:p.chairs});});
    (json.invitations||[]).forEach(function(r){
      var v={num:r.num,host:r.host,group:r.grp,family:!!r.family,own:r.own||null,kids:r.kids||0,name:r.name||'',phone:r.phone||'',token:r.token||null,
        status:r.status==='confirmed'?'confirmed':r.status==='sent'?'sent':'expired',
        seats:r.seats||1,att:r.att||null,arrived:r.arrived||0,arrivedAt:r.arrivedAt||clock(r.arrived_at),table:r.table||null,
        chairs:Array.isArray(r.chairs)?r.chairs.slice():null,created:r.created_at||null,confirmBy:r.confirm_by||null,kidsNote:r.kidsNote||''};
      if(v.status==='confirmed'&&!v.att)v.att=v.seats;
      invites.push(v);if(v.num!=null)byNum[v.num]=v;groups[v.group]=[v];
    });
    /* chairs: each table's planned owners (for the line under an empty table), then the invitations in their numbered
       chairs. An invitation from before chairs were numbered takes the next free ones */
    Object.keys(names).map(Number).sort(function(a,b){return a-b;}).forEach(function(t){
      var owners=[],row=[],cap=names[t].chairs;
      plan.filter(function(p){return p.table===t;}).forEach(function(p){for(var i=0;i<p.chairs;i++)owners.push(p.host);});
      for(var c=1;c<=cap;c++)row[c]={table:t,chair:c,code:t*1000+c,host:owners[c-1]||null,family:t===18,inv:null,k:0};
      invites.forEach(function(v){
        var n=held(v);if(v.table!==t||!n||!v.chairs||!v.chairs.length)return;
        v.chairs=v.chairs.slice(0,n);
        v.chairs.forEach(function(c,k){if(row[c]&&!row[c].inv){row[c].inv=v;row[c].k=k;}});
      });
      invites.forEach(function(v){
        var n=held(v);if(v.table!==t||!n||(v.chairs&&v.chairs.length))return;
        v.chairs=[];for(var c=1;c<=cap&&v.chairs.length<n;c++)if(!row[c].inv){row[c].inv=v;row[c].k=v.chairs.length;v.chairs.push(c);}
      });
      for(var c2=1;c2<=cap;c2++)seats.push(row[c2]);
    });
    invites.forEach(function(v){if(!v.table&&held(v))unseated.push(v);});
    function tally(k){
      var t={alloc:(HOSTS[k]||{}).seats||0,invited:0,confirmed:0,waiting:0,own:[],ownSeats:0};
      invites.forEach(function(v){
        if(v.host!==k||v.status==='expired')return;
        if(v.family){t.own.push(v);t.ownSeats+=v.seats;return;}
        t.invited+=held(v);if(v.status==='confirmed')t.confirmed+=v.att;else t.waiting+=v.seats;
      });
      t.guestAlloc=t.alloc-t.ownSeats;t.left=Math.max(0,t.guestAlloc-t.invited);
      return t;
    }
    /* a host's tables, and their chairs still free at one of them */
    function hostTables(k){return plan.filter(function(p){return p.host===k;}).sort(function(a,b){return a.table-b.table;});}
    function room(k,t,skip){
      var p=plan.filter(function(x){return x.host===k&&x.table===t;})[0],n=p?p.chairs:0;
      invites.forEach(function(v){if(v.host===k&&v.table===t&&!(skip&&v.num===skip.num))n-=held(v);});
      return Math.max(0,n);
    }
    function chairsAt(t){return seats.filter(function(s){return s.table===t;});}
    return {HOSTS:HOSTS,invites:invites,groups:groups,byNum:byNum,seats:seats,unseated:unseated,plan:plan,tables:names,
      tally:tally,held:held,hostTables:hostTables,room:room,chairsAt:chairsAt,at:json.at||null,raw:json,
      group:function(v){return groups[v.group]||[v];},
      hostName:function(k){return k&&HOSTS[k]?HOSTS[k].name:'';},
      tableName:function(t){return names[t]?names[t].name:'';},
      tableLabel:function(t){return names[t]?names[t].name+' · '+t:'Not seated yet';}};
  }
  /* WhatsApp numbers: however they're typed, digits with the country code (Ghana's when there's none), and back again
     for reading. The same rules as the database's _phone() */
  function phone(s){
    var d=String(s||'').replace(/\D/g,'').replace(/^00/,'');
    if(/^2330\d{9}$/.test(d))return '233'+d.slice(4);
    if(/^0\d{9}$/.test(d))return '233'+d.slice(1);
    if(/^[235]\d{8}$/.test(d))return '233'+d;
    if(/^233[1-9]\d{8}$/.test(d))return d;
    if(/^233/.test(d))return '';                 /* Ghana's code with a digit too many or too few */
    if(/^[1-9]\d{10,14}$/.test(d))return d;
    return '';
  }
  function showPhone(d){
    if(!d)return '';
    if(/^233\d{9}$/.test(d)){var l='0'+d.slice(3);return l.slice(0,3)+' '+l.slice(3,6)+' '+l.slice(6);}
    return '+'+d;
  }
  /* seat numbers for reading: "seat 4", "seats 3 to 5", "seats 2, 6 and 7" */
  function seatWords(c){
    if(!c||!c.length)return '';
    var s=c.slice().sort(function(a,b){return a-b;}),run=true;
    for(var i=1;i<s.length;i++)if(s[i]!==s[i-1]+1)run=false;
    if(s.length===1)return 'seat '+s[0];
    if(run)return 'seats '+s[0]+' to '+s[s.length-1];
    return 'seats '+s.slice(0,-1).join(', ')+' and '+s[s.length-1];
  }
  var token=Q.get('k');
  window.LIVE={on:!!(token&&window.API&&API.ready),token:token,build:build,clock:clock,held:held,phone:phone,showPhone:showPhone,seatWords:seatWords,
    /* the guest's link, on whatever address the site is served from */
    guestLink:function(t){return location.origin+location.pathname.replace(/[^\/]*$/,'')+'?i='+encodeURIComponent(t);},
    pageLink:function(page,t){return location.origin+location.pathname.replace(/[^\/]*$/,'')+page+'?k='+encodeURIComponent(t);}};
  if(window.LIVE.on)document.documentElement.classList.add('live');
})();
