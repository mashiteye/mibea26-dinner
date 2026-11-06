/* Turns what the database sends (gate_list, admin_get, host_overview) into the same shape as the design preview's
   sample data, so the gate, the overall view and the host pages draw real invitations with the same code.
   Each invitation is one number for one to four seats; it takes as many chairs as it holds */
(function(){
  'use strict';
  var Q=new URLSearchParams(location.search);
  function clock(iso){if(!iso)return null;var d=new Date(iso),h=d.getHours(),m=d.getMinutes();return (h%12||12)+':'+(m<10?'0':'')+m+(h<12?' am':' pm');}
  /* the chairs an invitation holds: what was confirmed, or all its seats while it waits */
  function held(v){return v.status==='confirmed'?(v.att||v.seats):v.status==='sent'?v.seats:0;}
  function build(json){
    var HOSTS={},names={},invites=[],groups={},byNum={},seats=[],unseated=[];
    (Array.isArray(json.hosts)?json.hosts:Object.keys(json.hosts||{}).map(function(k){var h=json.hosts[k];h.key=k;return h;}))
      .forEach(function(h){HOSTS[h.key]={name:h.name,role:h.role||null,seats:h.seats||0,token:h.token||null,phone:h.phone||null};});
    (Array.isArray(json.tables)?json.tables:Object.keys(json.tables||{}).map(function(k){return {num:+k,name:json.tables[k],chairs:9};}))
      .forEach(function(t){names[t.num]={name:t.name,chairs:t.chairs||9};});
    (json.invitations||[]).forEach(function(r){
      var v={num:r.num,host:r.host,group:r.grp,family:!!r.family,own:r.own||null,kids:r.kids||0,
        status:r.status==='confirmed'?'confirmed':r.status==='sent'?'sent':'expired',
        seats:r.seats||1,att:r.att||null,arrived:r.arrived||0,arrivedAt:clock(r.arrived_at),table:r.table||null,kidsNote:''};
      if(v.status==='confirmed'&&!v.att)v.att=v.seats;
      invites.push(v);if(v.num!=null)byNum[v.num]=v;groups[v.group]=[v];
    });
    /* chairs: each table's planned owners, then the invitations seated there, one after another */
    Object.keys(names).map(Number).sort(function(a,b){return a-b;}).forEach(function(t){
      var owners=[];(json.plan||[]).filter(function(p){return p.table===t;}).forEach(function(p){for(var i=0;i<p.chairs;i++)owners.push(p.host);});
      var here=[];
      invites.forEach(function(v){if(v.table===t)for(var k=0;k<held(v);k++)here.push({v:v,k:k});});
      for(var c=1;c<=names[t].chairs;c++){var x=here[c-1];seats.push({table:t,chair:c,code:t*1000+c,host:owners[c-1]||null,family:t===18,inv:x?x.v:null,k:x?x.k:0});}
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
    return {HOSTS:HOSTS,invites:invites,groups:groups,byNum:byNum,seats:seats,unseated:unseated,tally:tally,held:held,at:json.at||null,
      group:function(v){return groups[v.group]||[v];},
      hostName:function(k){return k&&HOSTS[k]?HOSTS[k].name:'';},
      tableName:function(t){return names[t]?names[t].name:'';},
      tableLabel:function(t){return names[t]?names[t].name+' · '+t:'Not seated yet';}};
  }
  var token=Q.get('k');
  window.LIVE={on:!!(token&&window.API&&API.ready),token:token,build:build,clock:clock,held:held,
    /* the guest's link, on whatever address the site is served from */
    guestLink:function(t){return location.origin+location.pathname.replace(/[^\/]*$/,'')+'?i='+encodeURIComponent(t);},
    pageLink:function(page,t){return location.origin+location.pathname.replace(/[^\/]*$/,'')+page+'?k='+encodeURIComponent(t);}};
  if(window.LIVE.on)document.documentElement.classList.add('live');
})();
