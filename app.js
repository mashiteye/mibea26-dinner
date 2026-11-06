/* The host page and the overall view: one page in two modes (window.MODE, set by each page).
   Host page (host.html?k=their private code): the host's tables one per screen, their list of guests, and everyone's numbers.
   Overall view (admin.html?k=Michael's code): every table and every guest, with Viewing as to open any host's page.
   Michael invites, edits, reassigns and cancels for any host with that host's own code, so each host's seats and tables
   still hold, and he moves any invitation to another table. Without a code, either page is the design preview, on sample data */
(function(){
  'use strict';
  var ADMIN=window.MODE==='admin';
  var L=window.LIVE,DEMO=window.DEMO,Q=new URLSearchParams(location.search);
  /* whose page this is: the host's, or on the overall view the host it is viewing as (null: every host) */
  var me=ADMIN?(Q.get('as')||null):(DEMO.HOSTS[Q.get('h')]?Q.get('h'):'mike');
  var B=null,O={hosts:[]},RAW={},cur=0,ready=false,night=false;
  var WORDS=['','one','two','three','four','five','six','seven','eight','nine'];
  function $(id){return document.getElementById(id);}
  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function plural(n,one,many){return n+' '+(n===1?one:(many||one+'s'));}
  function showToast(m){var t=$('toast');t.textContent=m;t.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(function(){t.classList.remove('show');},2800);}
  function day(iso){var d=new Date(iso);return d.getUTCDate()+' '+['January','February','March','April','May','June','July','August','September','October','November','December'][d.getUTCMonth()];}
  function cap1(s){return s?s.charAt(0).toUpperCase()+s.slice(1):'';}
  function byDay(){return day(O.deadline||'2026-12-12T23:59:59Z');}   /* the date to confirm by */
  function legend(keys){return '<div class="legend">'+keys.map(function(k){return '<span><i class="'+k[0]+'"></i>'+k[1]+'</span>';}).join('')+'</div>';}
  var BTN=' style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none"';

  /* ---------- the page: the tables, the list, everyone ---------- */
  $('app').innerHTML=
    '<header class="top"><div class="in">'+
      '<div class="head"><h1 id="title">'+(ADMIN?'Overall view':'Your invitations')+'</h1>'+
        (ADMIN?'<label class="as">Viewing as<select id="as"><option value="">All hosts</option></select></label>':'')+'</div>'+
      '<div class="sub">Dinner Night · Sunday 20 December</div>'+
      '<nav class="tabs" role="tablist" aria-label="Views">'+
        '<button type="button" role="tab" id="tMine" aria-selected="true" aria-controls="pMine">'+(ADMIN?'All tables':'Your tables')+'</button>'+
        '<button type="button" role="tab" id="tList" aria-selected="false" aria-controls="pList">'+(ADMIN?'The list':'Your list')+'</button>'+
        '<button type="button" role="tab" id="tAll" aria-selected="false" aria-controls="pAll">Everyone</button>'+
      '</nav></div></header>'+
    '<main class="wrap">'+
     '<div id="pMine" role="tabpanel" aria-labelledby="tMine">'+
      '<p class="intro" id="intro"></p>'+
      '<div class="sum" id="sum" aria-live="polite"></div>'+
      '<section class="card own" id="own" hidden></section>'+
      '<div class="pager" id="pager"></div>'+
      '<div class="deck" id="deck" aria-label="Tables"></div>'+
      '<div id="deckLegend"></div>'+
      '<section class="card" id="away" hidden><div class="card-head"><h2 id="awayTitle"></h2><span id="awayNote"></span></div><ul class="tlist away" id="awayList"></ul></section>'+
      '<p class="note">The table’s seats show who sits where. Guests learn their table at the gate.</p>'+
      '<p class="note" id="returns"></p>'+
      '<p class="note" id="helper" hidden></p>'+
     '</div>'+
     '<div id="pList" role="tabpanel" aria-labelledby="tList" hidden>'+
      '<input class="find" id="lFind" type="search" autocomplete="off" placeholder="Find a name, code or number" aria-label="Find a name, code or WhatsApp number">'+
      '<div class="mode" id="lOnly" role="group" aria-label="Show"><button type="button" data-o="all" aria-pressed="true">All</button><button type="button" data-o="conf" aria-pressed="false">Confirmed</button><button type="button" data-o="sent" aria-pressed="false">Sent</button></div>'+
      '<p class="lsum" id="lSum" aria-live="polite"></p>'+
      '<div class="ltools"><button class="btn" type="button" id="lDown">Download</button><button class="btn" type="button" id="lShare">Share</button></div>'+
      '<section class="card"><ul class="glist" id="lRows"></ul></section>'+
      '<p class="note">Download saves the list shown as a spreadsheet file (CSV). Share sends it as text, to WhatsApp or anywhere.</p>'+
     '</div>'+
     '<div id="pAll" role="tabpanel" aria-labelledby="tAll" hidden>'+
      (ADMIN?'<div class="mode" role="group" aria-label="When"><button type="button" id="vBefore" aria-pressed="true">Before the day</button><button type="button" id="vNight" aria-pressed="false">On the night</button></div>':'')+
      '<section class="card"><div class="card-head"><h2>The room</h2><span>'+(ADMIN?'Tap a table to open it':'Everyone’s tables')+'</span></div>'+
        '<svg id="map" viewBox="0 0 400 560" role="img" aria-label="Twenty tables of nine, every chair coloured by its answer"></svg><div id="mapLegend"></div></section>'+
      '<section class="card total"><svg class="ring" id="ring" viewBox="0 0 200 200" role="img"></svg><p class="line" id="totLine"></p><span class="when" id="when"></span><p class="line" id="pulse"></p></section>'+
      (ADMIN?'<section class="card"><div class="card-head"><h2>By host</h2><span>Tap a name to view as that host</span></div><div class="tablewrap"><table class="hosts" id="hosts"></table></div></section>'+
        '<section class="card"><div class="card-head"><h2>To follow up</h2><span id="issueCount"></span></div><ul class="issues" id="issues"></ul></section>'+
        '<section class="card" id="links" hidden><div class="card-head"><h2>Links</h2><span>Each one is private: send it only to that person</span></div><ul class="links" id="linkList"></ul></section>':
       '<section class="card"><div class="card-head"><h2>Every host</h2><span>People, not names</span></div><ul class="rows" id="rows"></ul>'+legend([['conf','Confirmed'],['sent','Sent'],['l','Free']])+'</section>')+
     '</div>'+
    '</main>'+
    '<div class="veil" id="veil"></div>'+
    '<section class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle" inert></section>'+
    '<div class="toast" id="toast" role="status" aria-live="polite"></div>';

  /* the design preview of a host page: the ribbon chooses whose page it shows */
  if(!L.on&&!ADMIN&&$('who')){
    var who=$('who');
    Object.keys(DEMO.HOSTS).forEach(function(k){var o=document.createElement('option');o.value=k;o.textContent=DEMO.HOSTS[k].name+(DEMO.HOSTS[k].role?' ('+DEMO.HOSTS[k].role+')':'');if(k===me)o.selected=true;who.appendChild(o);});
    who.addEventListener('change',function(){location.search='?h='+who.value;});
  }

  /* ---------- the data: from the database on a real page, from the sample in the preview ---------- */
  function load(){
    if(!L.on){B=DEMO;O=sampleStats();if(ADMIN)fillAs();render();return Promise.resolve();}
    if(ADMIN)return API.rpc('admin_get',{p_token:L.token}).then(function(r){
      if(!r||r.error){broken();return;}
      RAW=r;B=L.build(r);O=adminStats(r);fillAs();render();links();
    });
    return API.rpc('host_overview',{p_token:L.token}).then(function(r){
      if(!r||r.error){broken();return;}
      me=r.me;B=L.build(r);
      O={hosts:r.hosts.map(function(x){return {key:x.key,name:x.name,role:x.role,seats:x.seats,confirmed:+x.confirmed+(+x.own),waiting:+x.waiting};}),
        deadline:r.deadline,late:r.late_deadline,now:r.at,today:+r.today,last:r.last};
      render();
    });
  }
  /* each host's numbers, from the invitations themselves: the preview's, and the overall view's */
  function hostStats(){return Object.keys(B.HOSTS).map(function(k){var T=B.tally(k);return {key:k,name:B.HOSTS[k].name,role:B.HOSTS[k].role,seats:T.alloc,confirmed:T.confirmed+T.ownSeats,waiting:T.waiting};});}
  function sampleStats(){
    return {hosts:hostStats(),deadline:'2026-12-12T23:59:59Z',late:'2026-12-19T23:59:59Z',now:new Date().toISOString(),today:5,last:new Date(Date.now()-12*60000).toISOString()};
  }
  function adminStats(r){
    var now=r.at||new Date().toISOString(),t0=new Date(now),today=0,last=null;t0.setUTCHours(0,0,0,0);   /* Accra keeps UTC */
    (r.invitations||[]).forEach(function(x){
      if(x.status!=='confirmed'||x.family||!x.confirmed_at)return;
      if(new Date(x.confirmed_at)>=t0)today+=x.att||x.seats;
      if(!last||new Date(x.confirmed_at)>new Date(last))last=x.confirmed_at;
    });
    return {hosts:hostStats(),deadline:r.deadline||'2026-12-12T23:59:59Z',late:r.late_deadline||'2026-12-19T23:59:59Z',now:now,today:today,last:last};
  }
  function broken(){
    $('title').textContent='This link isn’t working';
    $('intro').textContent=ADMIN?'Check the link and open it again.':'Please ask Michael for your link again.';
    ['sum','pager','deck'].forEach(function(id){$(id).hidden=true;});
  }
  /* preview only: changes stay on this page, as if the database had made them */
  function sampleChange(fn){fn(B.raw.invitations);var link=DEMO.link,tok=DEMO.token;B=L.build(B.raw);B.link=link;B.token=tok;DEMO=B;O=sampleStats();render();}

  /* ---------- who can do what where ---------- */
  function isAll(){return ADMIN&&!me;}
  function inView(v){return isAll()||v.host===me;}   /* a guest of the host whose page this is: every guest, viewing all */
  function hostLabel(k){var h=B.HOSTS[k]||{};return (h.name||'')+(h.role?' ('+h.role+')':'');}
  function tok(k){return ADMIN?(B.HOSTS[k]||{}).token:L.token;}   /* every change is made with the host's own code */
  function freeAt(t){return B.chairsAt(t).filter(function(s){return !s.inv;}).length;}
  /* a host's free chairs at a table: their planned chairs less their guests there, and never more than are empty */
  function roomFor(k,t,skip){return Math.min(B.room(k,t,skip),freeAt(t)+(skip&&skip.table===t?B.held(skip):0));}
  function hostsAt(t){var out=[];B.plan.forEach(function(p){if(p.table===t&&out.indexOf(p.host)<0)out.push(p.host);});return out;}
  /* the free chairs this page can invite to at a table: the host's own, or (viewing all) every host's there */
  function roomView(t){
    if(me)return roomFor(me,t);
    var n=0;hostsAt(t).forEach(function(k){n+=roomFor(k,t);});return Math.min(n,freeAt(t));
  }
  /* who can invite at a table now: the host whose page this is, or each host with chairs and seats left there */
  function inviters(t){return (me?[me]:hostsAt(t)).filter(function(k){return roomFor(k,t)>0&&B.tally(k).left>0;});}
  function tablesInView(){return me?B.hostTables(me).map(function(p){return p.table;}):Object.keys(B.tables).map(Number).sort(function(a,b){return a-b;});}

  /* ---------- the tables tab: totals, then the tables one per screen ---------- */
  var pending=false;
  function render(){
    if($('sheet').classList.contains('show')){pending=true;return;}   /* redraw once the open sheet closes */
    if(ADMIN)adminHead();else hostHead();
    var tables=tablesInView();
    /* guests away from these tables: (one host) at another host's table or not seated yet; (every host) not seated yet */
    var away=B.invites.filter(function(v){return !v.family&&B.held(v)>0&&(me?v.host===me&&tables.indexOf(v.table)<0:!v.table);});
    $('away').hidden=!away.length;
    $('awayTitle').textContent=me?'At other tables':'Not seated yet';
    $('awayNote').textContent=!ADMIN?'Your guests':me?B.hostName(me)+'’s guests':'Tap one to give it a table';
    $('awayList').innerHTML=away.map(function(v){return '<li><button type="button" data-n="'+v.num+'"><b>'+v.num+'</b> '+esc(v.name||'No name yet')+
      '<small>'+esc(B.tableLabel(v.table))+(v.chairs&&v.chairs.length?' · '+L.seatWords(v.chairs):'')+' · '+(v.status==='confirmed'?'Confirmed':'Sent')+(isAll()?' · '+esc(B.hostName(v.host))+'’s guest':'')+'</small></button></li>';}).join('');
    $('pager').innerHTML='<span>'+(ADMIN?'Tables':'Your tables')+'</span>'+tables.map(function(t,i){return '<button type="button" data-i="'+i+'" aria-label="Table '+t+', '+esc(B.tableName(t))+'">'+t+'</button>';}).join('');
    var keep=$('deck').scrollLeft;
    $('deck').innerHTML=tables.map(function(t){return slide(t);}).join('');
    $('deck').scrollLeft=keep;
    cur=Math.max(0,Math.min(cur,tables.length-1));mark();
    $('deckLegend').innerHTML=legend([['conf','Confirmed'],['sent','Sent'],['open','Free']].concat(isAll()?[]:[['other','Another host’s guest']]));
    ready=true;
    if(!$('pList').hidden)list();
    if(!$('pAll').hidden)everyone();
  }
  function chips(first,conf,sent,free,extra){
    return '<span class="chip">'+first+'</span><span class="chip conf">'+conf+' confirmed</span><span class="chip sent">'+sent+' sent</span><span class="chip">'+free+' free</span>'+(extra||'');
  }
  function hostHead(){
    var H=B.HOSTS[me]||{name:''},T=B.tally(me);
    $('tMine').textContent=H.name;
    $('title').textContent=H.name+'’s invitations';
    document.title=H.name+'’s invitations · Dinner Night';
    $('intro').textContent='Swipe to a table and tap it to invite. Tap a chair to see who sits there.';
    $('returns').textContent='Seats not confirmed by '+byDay()+' come back to you.';
    if(H.role){$('helper').hidden=false;$('helper').textContent='If someone helps '+H.name+' with this, they open this same link.';}
    $('sum').innerHTML=chips(T.guestAlloc+' seats to give',T.confirmed,T.waiting,T.left);
    var own=T.own;
    if(own.length){
      var two=own.length>1||own[0].seats>1;
      $('own').hidden=false;
      $('own').innerHTML='<div class="t"><b>Honoured guest'+(own.length>1?'s ':' ')+own.map(function(o){return o.num;}).join(' and ')+'</b>Your own invitation'+(own.length>1?'s':'')+': for you'+(two?' and your wife':'')+' at the family table</div>'+
        '<a href="#" id="ownOpen">See</a>';
      $('ownOpen').onclick=function(e){e.preventDefault();ownSheet(own[0]);};
    }
  }
  function adminHead(){
    $('tMine').textContent=me?B.hostName(me):'All tables';
    document.title='Overall view · Dinner Night';
    $('own').hidden=true;
    $('intro').textContent=me?'What '+B.hostName(me)+' sees, with your powers: invite, edit, move or cancel any of their guests.':
      'Every table, one per screen. Tap a free chair to invite for its host. Tap a guest to edit, move or cancel.';
    $('returns').textContent='Seats not confirmed by '+byDay()+' go back to their host.';
    if(me){var T=B.tally(me);$('sum').innerHTML=chips(T.guestAlloc+' seats to give',T.confirmed,T.waiting,T.left);}
    else{
      var a={seats:0,conf:0,sent:0,free:0};
      Object.keys(B.HOSTS).forEach(function(k){var T=B.tally(k);a.seats+=T.alloc;a.conf+=T.confirmed+T.ownSeats;a.sent+=T.waiting;a.free+=T.left;});
      var un=B.unseated.reduce(function(n,v){return n+B.held(v);},0);
      $('sum').innerHTML=chips(a.seats+' seats',a.conf,a.sent,a.free,un?'<span class="chip warn">'+un+' not seated</span>':'');
    }
    if($('as').value!==(me||''))$('as').value=me||'';
  }
  function closedNow(){return O.late&&O.now&&new Date(O.now)>new Date(O.late);}
  /* what one chair shows: a guest of this page (sent or confirmed; the family's own seats ringed in gold), another host's
     guest, free, or free but kept for another host at a shared table */
  function stateOf(s,room){
    var v=s.inv;
    if(v)return !inView(v)?'other':(v.status==='confirmed'?'conf':'sent')+(v.family?' you':'');
    return room>0?'free':'kept';
  }
  /* the line under a table, viewing every host: whose chairs these are */
  function whose(t){
    if(t===18)return 'The family table: the family’s own seats are ringed in gold';
    var ps=B.plan.filter(function(p){return p.table===t;});
    if(!ps.length)return 'No host has chairs here';
    if(ps.length===1)return B.hostName(ps[0].host)+'’s table';
    return 'Shared: '+ps.map(function(p){return B.hostName(p.host)+' '+p.chairs;}).join(', ');
  }
  function slide(t){
    var row=B.chairsAt(t),cap=row.length,room=roomView(t),closed=closedNow(),can=room>0&&!closed;
    var mine=row.filter(function(s){return s.inv&&inView(s.inv);}),conf=0,sent=0;
    mine.forEach(function(s){if(s.inv.status==='confirmed')conf++;else sent++;});
    var C=170,R=124,out='';
    function at(c,r){var a=(-90+360/cap*(c-1))*Math.PI/180;return {x:C+r*Math.cos(a),y:C+r*Math.sin(a),deg:-90+360/cap*(c-1)};}
    /* one invitation's chairs are joined, and so are invitations sent to the same number: a family reads as one */
    function kin(a,b){return a===b||(!!a.phone&&a.phone===b.phone);}
    for(var i=0;i<cap;i++){
      var s1=row[i],s2=row[(i+1)%cap];
      if(cap>1&&s1.inv&&s2.inv&&kin(s1.inv,s2.inv)&&inView(s1.inv)&&inView(s2.inv)){
        var a1=at(s1.chair,R),a2=at(s2.chair,R);
        out+='<path d="M'+a1.x.toFixed(1)+' '+a1.y.toFixed(1)+' A'+R+' '+R+' 0 0 1 '+a2.x.toFixed(1)+' '+a2.y.toFixed(1)+'" fill="none" stroke="'+(s1.inv.status==='confirmed'?'#3e8e5a':'#e2b33a')+'" stroke-width="16" stroke-linecap="round" opacity=".38"/>';
      }
    }
    var forYou=ADMIN?'':' for you';
    out+='<g class="tablebtn" role="button" tabindex="0" data-t="'+t+'" aria-label="'+(can?'Invite to '+esc(B.tableName(t))+', '+plural(room,'seat')+' free'+forYou:'No free seats'+forYou+' at '+esc(B.tableName(t)))+'">'+
      '<circle cx="'+C+'" cy="'+C+'" r="80" fill="#fffaf2" stroke="#c9b48f" stroke-width="1.5"/>'+(t===18?'<circle cx="'+C+'" cy="'+C+'" r="86" fill="none" stroke="#c9a45e" stroke-width="1.2"/>':'')+
      '<text class="tname" x="'+C+'" y="'+(C-14)+'" text-anchor="middle">Table '+t+'</text>'+
      '<text class="tno" x="'+C+'" y="'+(C+5)+'" text-anchor="middle">'+esc(B.tableName(t).toUpperCase())+'</text>'+
      (can?'<g class="add"><rect x="'+(C-50)+'" y="'+(C+16)+'" width="100" height="32" rx="16"/><text x="'+C+'" y="'+(C+36)+'" text-anchor="middle">+ INVITE</text></g>':
        '<text class="full" x="'+C+'" y="'+(C+36)+'" text-anchor="middle">'+(closed?'CLOSED':'FULL')+'</text>')+'</g>';
    row.forEach(function(s){
      var st=stateOf(s,room),pt=at(s.chair,R),v=s.inv,lab='Seat '+s.chair;
      if(v&&inView(v))lab+=', '+(v.family?(ADMIN?B.hostName(v.host)+', family':'you'):v.name||'honoured guest '+v.num)+(isAll()&&!v.family?', '+B.hostName(v.host)+'’s guest':'')+', '+(v.status==='confirmed'?'confirmed':'sent');
      else if(v)lab+=', '+(v.family?'family':B.hostName(v.host)+'’s guest');
      else lab+=st==='free'?', free':ADMIN&&!me?', no host has it free':', kept for another host';
      out+='<g class="chair '+st+'" role="button" tabindex="0" data-t="'+t+'" data-c="'+s.chair+'" aria-label="'+esc(lab)+'">'+
        '<circle cx="'+pt.x.toFixed(1)+'" cy="'+pt.y.toFixed(1)+'" r="27" fill="transparent"/>'+
        '<g transform="translate('+pt.x.toFixed(1)+' '+pt.y.toFixed(1)+') rotate('+(pt.deg+90)+')"><rect class="back" x="-18" y="-21" width="36" height="9" rx="4"/><rect class="seat" x="-16" y="-10" width="32" height="27" rx="7"/></g>'+
        '<text class="cn" x="'+(pt.x-4*Math.cos(pt.deg*Math.PI/180)).toFixed(1)+'" y="'+(pt.y-4*Math.sin(pt.deg*Math.PI/180)+5).toFixed(1)+'">'+s.chair+'</text>';
      if(st.indexOf('conf')===0){var b=at(s.chair,R+31);
        out+='<circle cx="'+b.x.toFixed(1)+'" cy="'+b.y.toFixed(1)+'" r="8" fill="#fff" stroke="#2c6b42" stroke-width="1.4"/><path d="M'+(b.x-3.6).toFixed(1)+' '+b.y.toFixed(1)+' l2.6 2.8 l4.8 -5.4" fill="none" stroke="#2c6b42" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';}
      out+='</g>';
    });
    var line,small='';
    if(me){
      var p=B.hostTables(me).filter(function(x){return x.table===t;})[0]||{chairs:0},whom=ADMIN?B.hostName(me)+'’s ':'Your ';
      line=cap>p.chairs?whom+p.chairs+' of '+cap+' chairs':whom+plural(p.chairs,'chair');
      var fam=mine.filter(function(s){return s.inv.family;}).length;
      if(t===18&&fam)small=(ADMIN?B.hostName(me)+'’s own seat':'Your own seat')+(fam>1?'s are':' is')+' ringed in gold';
    }else{line=plural(cap,'chair');small=whose(t);}
    return '<section class="slide" data-t="'+t+'"><div class="card">'+
      '<svg class="tsvg" viewBox="0 0 340 340" role="group" aria-label="'+esc(B.tableLabel(t))+'">'+out+'</svg>'+
      '<p class="tline">'+esc(line)+': <span class="nw">'+conf+' confirmed</span> · <span class="nw">'+sent+' sent</span> · <span class="nw">'+room+' free</span>'+(small?'<small>'+esc(small)+'</small>':'')+'</p></div></section>';
  }
  /* which table is on screen, and the numbers above follow it */
  function mark(){
    var bs=$('pager').querySelectorAll('button'),P=$('pager');
    [].forEach.call(bs,function(b,i){b.setAttribute('aria-current',String(i===cur));});
    var b=bs[cur];   /* twenty tables don't fit on one line: keep the current one in sight */
    if(b&&P.scrollWidth>P.clientWidth){var x=Math.max(0,b.offsetLeft-(P.clientWidth-b.offsetWidth)/2);if(Math.abs(P.scrollLeft-x)>2)P.scrollTo({left:x,behavior:'smooth'});}
  }
  function go(i,smooth){var d=$('deck');cur=i;mark();d.scrollTo({left:i*d.clientWidth,behavior:smooth?'smooth':'auto'});}
  $('deck').addEventListener('scroll',function(){var d=$('deck');cancelAnimationFrame(mark.f);mark.f=requestAnimationFrame(function(){var i=Math.round(d.scrollLeft/Math.max(1,d.clientWidth));if(i!==cur){cur=i;mark();}});},{passive:true});
  $('pager').addEventListener('click',function(e){var b=e.target.closest('button[data-i]');if(b)go(+b.getAttribute('data-i'),true);});
  function act(e){
    var c=e.target.closest('.chair'),t=e.target.closest('.tablebtn');
    if(c)chairTap(+c.getAttribute('data-t'),+c.getAttribute('data-c'));else if(t)invite(+t.getAttribute('data-t'),null);
  }
  $('deck').addEventListener('click',act);
  $('awayList').addEventListener('click',function(e){
    var b=e.target.closest('button[data-n]'),v=b&&B.byNum[+b.getAttribute('data-n')];
    if(v){if(isAll())moveSheet(v);else details(v);}
  });
  $('deck').addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){if(e.target.closest('.chair,.tablebtn')){e.preventDefault();act(e);}}});
  window.addEventListener('resize',function(){if(ready)go(cur,false);});

  function chairTap(t,c){
    var s=B.chairsAt(t)[c-1],v=s&&s.inv;
    if(v&&(ADMIN||v.host===me))return v.family?ownSheet(v):details(v);
    if(v)return showToast('Seat '+c+': '+(v.family?'the family':B.hostName(v.host)+'’s guest'));
    if(roomView(t)<=0)return showToast(ADMIN?'Seat '+c+': no host here has a free seat':'Seat '+c+' is kept for another host’s guests');
    invite(t,c);
  }

  /* ---------- seats: the same choice as the database makes, side by side from the chosen seat ---------- */
  function pick(t,n,skip,start){
    var row=B.chairsAt(t),cap=row.length,taken={},st0=start||1,k,c;
    row.forEach(function(s){if(s.inv&&!(skip&&s.inv.num===skip.num))taken[s.chair]=1;});
    for(k=0;k<cap;k++){var st=((st0-1+k)%cap)+1,run=[];for(c=0;c<n;c++){var ch=((st-1+c)%cap)+1;if(taken[ch])break;run.push(ch);}if(run.length===n)return run;}
    var free=[];for(c=1;c<=cap;c++)if(!taken[c])free.push(c);
    free.sort(function(a,b){return ((a-st0+cap)%cap)-((b-st0+cap)%cap);});
    return free.length>=n?free.slice(0,n):null;
  }
  function canSeat(t,n,skip,start,k){return n<=4&&roomFor(k,t,skip)>=n&&B.tally(k).left+(skip?B.held(skip):0)>=n&&!!pick(t,n,skip,start);}

  /* ---------- the message: short. The seats in capitals, the date to confirm by, and the link (its preview carries the rest) ---------- */
  function linkOf(v){return L.on?L.guestLink(v.token):B.link(v.num);}
  function message(v){
    var n=B.held(v)||v.seats;
    return n+(n>1?' DINNER SEATS':' DINNER SEAT')+'\nPlease confirm by '+(v.confirmBy?day(v.confirmBy):byDay())+':\n'+linkOf(v);
  }
  function waUrl(v){return 'https://wa.me/'+v.phone+'?text='+encodeURIComponent(message(v));}

  /* ---------- sheets ---------- */
  var sheet=$('sheet'),veil=$('veil'),trigger=null;
  function openSheet(html,focus){
    if(!sheet.classList.contains('show'))trigger=document.activeElement;
    sheet.innerHTML=html;sheet.inert=false;sheet.classList.add('show');veil.classList.add('show');sheet.scrollTop=0;
    var f=focus?sheet.querySelector(focus):sheet.querySelector('button,input,a');if(f)f.focus({preventScroll:true});
  }
  function closeSheet(){sheet.classList.remove('show');veil.classList.remove('show');sheet.inert=true;clearTimeout(checkT);if(trigger&&trigger.focus)trigger.focus({preventScroll:true});if(pending){pending=false;render();}}
  veil.addEventListener('click',closeSheet);
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&sheet.classList.contains('show'))closeSheet();});
  sheet.addEventListener('click',function(e){var b=e.target.closest('[data-close]');if(b)closeSheet();});

  /* the other invitations on the same number at the same table: one family (a host only knows their own guests' numbers) */
  function family(v,p,t){return B.invites.filter(function(x){return p&&x.phone===p&&x.table===t&&B.held(x)>0&&!(v&&x.num===v.num);});}
  function familyOf(v){var f=family(v,v.phone,v.table);return f.length?'<dt>Family</dt><dd>'+f.map(function(x){return x.num+(x.name?' ('+esc(x.name)+')':'');}).join(', ')+'</dd>':'';}
  function statusWords(v){
    if(v.status==='expired')return 'Not confirmed by '+(v.confirmBy?day(v.confirmBy):byDay());
    if(v.status!=='confirmed')return 'Sent, not confirmed yet';
    return v.att<v.seats?'Confirmed '+v.att+' of '+v.seats+'; the other '+plural(v.seats-v.att,'seat')+' came back to '+(ADMIN?B.hostName(v.host):'you'):'Confirmed';
  }
  /* a chair's details: who, their number and code, then Edit only or Reassign; on the overall view, Move as well */
  function details(v){
    v=B.byNum[v.num]||v;
    var tel=v.phone?(L.on?'<a href="tel:+'+v.phone+'">'+esc(L.showPhone(v.phone))+'</a>':esc(L.showPhone(v.phone))):'<span style="color:var(--soft)">None yet</span>';
    var holds=B.held(v)>0,again=holds&&v.phone&&(!L.on||v.token),move=ADMIN&&holds;
    openSheet('<h3 id="sheetTitle">'+(v.name?esc(v.name):'No name yet')+'</h3>'+
      '<div class="meta">'+esc(B.tableLabel(v.table))+(v.chairs&&v.chairs.length?' · '+L.seatWords(v.chairs):'')+'</div>'+
      '<dl class="kv"><dt>Code</dt><dd>'+v.num+'</dd><dt>WhatsApp</dt><dd>'+tel+'</dd>'+(ADMIN?'<dt>Host</dt><dd>'+esc(hostLabel(v.host))+'</dd>':'')+familyOf(v)+
        '<dt>Seats</dt><dd>'+v.seats+'</dd><dt>Answer</dt><dd>'+esc(statusWords(v))+'</dd>'+
        (v.status==='confirmed'&&v.arrived?'<dt>In</dt><dd>'+Math.min(v.arrived,v.att)+' of '+v.att+(v.arrivedAt?', the last at '+esc(v.arrivedAt):'')+'</dd>':'')+'</dl>'+
      (holds&&v.table?'<div class="pair"><button class="btn" type="button" id="dEdit">Edit only</button><button class="btn primary" type="button" id="dRe">Reassign</button></div>'+
        '<p class="hint">Edit only fixes the name, number or seats; nothing is sent. Reassign gives the seats to someone else, with a new number.</p>':
       holds?'<div class="stack"><button class="btn" type="button" id="dEdit">Edit only</button></div><p class="hint">Edit only fixes the name or number; nothing is sent. Once it has a table, its seats can change or go to someone else.</p>':
        '<p class="hint">Its seats went back to '+(ADMIN?esc(B.hostName(v.host)):'you')+'. To have them after all, invite them again from a table.</p>')+
      '<div class="linkrow">'+(again?(L.on?'<a class="linkbtn" id="dAgain" href="'+waUrl(v)+'" target="_blank" rel="noopener">Send the invitation again</a>':'<button class="linkbtn" type="button" id="dAgain">Send the invitation again</button>'):'')+
        (move?'<button class="linkbtn" type="button" id="dMove">'+(v.table?'Move to another table':'Give it a table')+'</button>':'')+(again||move?'':'<span></span>')+
        '<button class="linkbtn danger" type="button" id="dCancel">Cancel invitation</button></div>'+
      '<div class="stack"><button class="btn wide" type="button" data-close>Close</button></div>',holds?'#dEdit':null);
    if($('dEdit'))$('dEdit').onclick=function(){form('edit',v.table,v.chairs&&v.chairs[0],v);};
    if($('dRe'))$('dRe').onclick=function(){form('reassign',v.table,v.chairs&&v.chairs[0],v);};
    if($('dMove'))$('dMove').onclick=function(){moveSheet(v);};
    $('dCancel').onclick=function(){cancelSheet(v);};
    if(!L.on&&$('dAgain'))$('dAgain').onclick=function(){showToast('Preview: WhatsApp would open in their chat');};
  }
  /* a family host's own invitation: on their page, theirs to open; on the overall view, whose it is */
  function ownSheet(v){
    v=B.byNum[v.num]||v;
    var h=B.hostName(v.host),title,note;
    if(ADMIN){
      title=h+(v.own==='wife'?'’s wife':v.seats>1?' and wife':'');
      note=(v.own==='wife'?h+'’s wife’s':h+'’s')+' own honoured-guest number, confirmed from the start. At the gate it is given like every guest’s.'+
        (v.kids?' '+cap1(WORDS[v.kids]||String(v.kids))+' children come in on it and take no chair.':'');
    }else{
      title=v.own==='wife'?'Your wife':v.seats>1?'You and your wife':'You';
      note=(v.own==='wife'?'Your wife’s own honoured-guest number. At the gate she gives it like every guest.':'Your own honoured-guest number. At the gate you give it like every guest.')+
        (v.kidsNote?' '+v.kidsNote:v.kids?' '+cap1(WORDS[v.kids]||String(v.kids))+' children come in on your number and take no chair.':'');
    }
    var link=L.on?(v.token?L.guestLink(v.token):''):'./index.html?g='+v.num+'&n='+v.seats;
    openSheet('<h3 id="sheetTitle">'+esc(title)+'</h3><div class="meta">'+esc(B.tableLabel(v.table))+' · '+L.seatWords(v.chairs)+'</div>'+
      '<div class="big">'+v.num+'</div><p class="hint">'+esc(note)+'</p>'+
      '<div class="stack">'+(link?'<a class="btn primary wide" href="'+esc(link)+'"'+BTN+'>'+(ADMIN?'Open their invitation':'Open your invitation')+'</a>':'')+'<button class="btn wide" type="button" data-close>Close</button></div>');
  }

  /* invite, Edit only and Reassign share one form: name, WhatsApp number, seats. k: the host it is for */
  var checkT=null;
  function form(kind,t,start,v,k){
    if(v){v=B.byNum[v.num]||v;k=v.host;}
    function ok(n){return (v&&n===B.held(v))||canSeat(t,n,v||null,start,k);}
    var n0=v?B.held(v):1,title=kind==='invite'?'Invite':kind==='edit'?'Edit only':'Reassign',guest=ADMIN?esc(B.hostName(k))+'’s guest':'';
    var meta=kind==='invite'?esc(B.tableLabel(t))+(ADMIN?' · for '+esc(hostLabel(k)):''):kind==='edit'?'Honoured guest '+v.num+(ADMIN?', '+guest:'')+'. Nothing is sent; the code and link stay the same.':
      L.seatWords(v.chairs)+' at '+esc(B.tableLabel(t))+' go to someone else'+(ADMIN?', still '+guest:'')+'. '+v.num+' stops working; they get a new number and link.';
    var picker='contacts' in navigator&&'select' in (navigator.contacts||{});
    openSheet('<h3 id="sheetTitle">'+title+'</h3><div class="meta">'+meta+'</div>'+
      (kind==='reassign'&&v.status==='confirmed'?'<div class="banner warn">'+esc(v.name||'They')+' confirmed. Reassigning cancels that.</div>':'')+
      (kind==='edit'&&v.status==='confirmed'?'<p class="hint">They’ve confirmed. A new number of seats counts as confirmed.</p>':'')+
      '<div class="field"><label for="fName">Name, family or team</label><input id="fName" maxlength="60" autocomplete="off" autocapitalize="words" value="'+(kind==='edit'?esc(v.name):'')+'"></div>'+
      '<div class="field"><label for="fPhone">WhatsApp number</label><div class="phone-row"><input id="fPhone" type="tel" inputmode="tel" autocomplete="off" placeholder="024 123 4567" value="'+(kind==='edit'?esc(L.showPhone(v.phone)):'')+'">'+
        (picker?'<button class="btn" type="button" id="fPick">Contacts</button>':'')+'</div><p class="hint" id="fPhoneMsg" aria-live="polite"></p></div>'+
      '<div class="field"><span class="lab" id="fSeatsLab">Seats</span><div class="seg" id="fSeats" role="group" aria-labelledby="fSeatsLab">'+
        [1,2,3,4].map(function(n){return '<button type="button" data-n="'+n+'"'+(ok(n)?'':' aria-disabled="true"')+' aria-pressed="false">'+n+'</button>';}).join('')+'</div>'+
        '<p class="hint" id="fSeatsMsg"></p></div>'+
      '<div class="stack"><button class="btn '+(kind==='edit'?'primary':'green')+' wide" type="button" id="fGo" disabled>'+(kind==='edit'?'Save':'Send on WhatsApp')+'</button><button class="btn wide" type="button" data-close>Cancel</button></div>','#fName');
    var st={n:ok(n0)?n0:0,phone:'',used:null,checked:''};
    if(!st.n)for(var j=1;j<=4;j++)if(ok(j)){st.n=j;break;}
    function same(){return v&&st.n===n0;}   /* the same number of seats: the same chairs */
    function next(){   /* beside the family already on this number, if there is one */
      var f=st.fam||[],last=0;if(v||!f.length)return start;
      f.forEach(function(x){(x.chairs||[]).forEach(function(c){if(c>last)last=c;});});
      var cap=B.chairsAt(t).length;return last%cap+1;
    }
    function chairs(){return !st.n?null:same()?(v.chairs||[]):pick(t,st.n,v||null,next());}
    /* why a number of seats can't be given here, so a tap on it is never met with silence */
    function why(n){
      var room=roomFor(k,t,v||null),left=B.tally(k).left+(v?B.held(v):0),who=ADMIN?B.hostName(k):'you';
      if(room<n)return room?'Only '+plural(room,'seat')+' '+(room>1?'are':'is')+' free for '+who+' at this table.':'No seats are free for '+who+' at this table.';
      if(left<n)return (ADMIN?B.hostName(k)+' has':'You have')+' only '+plural(left,'seat')+' left to give.';
      return 'There aren’t '+n+' free chairs at this table.';
    }
    function seatsUi(){
      [].forEach.call($('fSeats').querySelectorAll('button'),function(b){b.setAttribute('aria-pressed',String(+b.getAttribute('data-n')===st.n));});
      $('fSeatsMsg').className='hint';
      var c=chairs();$('fSeatsMsg').textContent=c&&c.length?cap1(L.seatWords(c))+' at '+B.tableLabel(t):same()?B.tableLabel(t):'No free seats '+(ADMIN?'for '+B.hostName(k):'for you')+' at this table';
    }
    function phoneUi(){
      var raw=$('fPhone').value,p=L.phone(raw),m=$('fPhoneMsg'),digits=raw.replace(/\D/g,'').length;
      var hadFam=st.fam&&st.fam.length;st.phone=p;st.used=null;st.fam=[];m.className='hint';m.textContent='';if(hadFam)seatsUi();
      if(!p){if(digits>=10){m.className='hint bad';m.textContent='Check the number. A number from abroad needs its country code, like +44.';}valid();return;}
      /* one number, one table: at this table the same number joins its family; at another table it is refused.
         The guests this page knows are checked here (on the overall view, every guest), everyone's in the database */
      var dup=B.invites.filter(function(x){return x.phone===p&&B.held(x)>0&&!(v&&x.num===v.num)&&x.table!==t;})[0];
      if(dup){
        st.used=dup.host===k||ADMIN?{mine:true,num:dup.num,name:dup.name,table:dup.table,chairs:dup.chairs,host:dup.host!==k?B.hostName(dup.host):''}:{mine:false,host:B.hostName(dup.host),table:dup.table};
        usedUi();valid();return;
      }
      var fam=family(v,p,t);st.fam=fam;
      if(fam.length){m.textContent='Same family as '+fam.map(function(x){return x.num+(x.name?' ('+x.name+')':'');}).join(', ')+'. They sit together.';seatsUi();}
      else if(L.showPhone(p).replace(/\s/g,'')!==raw.replace(/\s/g,''))m.textContent='Saved as '+L.showPhone(p);
      if(L.on&&st.checked!==p){
        clearTimeout(checkT);var asked=p;
        checkT=setTimeout(function(){API.rpc('host_phone',{p_token:tok(k),p_phone:asked,p_skip:v?v.num:null,p_table:t}).then(function(r){
          if(st.phone!==asked||!r)return;st.checked=asked;if(r.used){st.used=r.used;usedUi();}valid();}).catch(function(){});},350);
      }
      valid();
    }
    function usedUi(){
      var u=st.used,m=$('fPhoneMsg');m.className='hint warn';
      var where=u.table?' at Table '+u.table+(u.chairs&&u.chairs.length?', '+L.seatWords(u.chairs):''):', not seated yet';
      m.textContent=u.mine?'This number already has invitation '+u.num+(u.name?' ('+u.name+')':'')+(u.host?', '+u.host+'’s guest,':'')+where+'. A family sits at one table: invite them there.':
        'This number is already invited by '+u.host+(u.table?', at Table '+u.table:'')+'.';
    }
    function valid(){var c=chairs();$('fGo').disabled=!($('fName').value.trim()&&st.phone&&!st.used&&c&&(c.length||same()));}
    $('fSeats').addEventListener('click',function(e){
      var b=e.target.closest('button[data-n]');if(!b)return;
      if(b.getAttribute('aria-disabled')==='true'){var m=$('fSeatsMsg');m.className='hint warn';m.textContent=why(+b.getAttribute('data-n'));return;}
      st.n=+b.getAttribute('data-n');seatsUi();valid();
    });
    $('fName').addEventListener('input',valid);
    $('fPhone').addEventListener('input',phoneUi);
    if($('fPick'))$('fPick').onclick=function(){
      navigator.contacts.select(['name','tel'],{multiple:false}).then(function(l){
        if(!l||!l[0])return;var c=l[0];
        if(c.name&&c.name[0]&&!$('fName').value.trim())$('fName').value=c.name[0];
        if(c.tel&&c.tel[0])$('fPhone').value=c.tel[0];
        phoneUi();valid();
      }).catch(function(){});
    };
    seatsUi();if(kind==='edit')phoneUi();valid();
    $('fGo').onclick=function(){
      var name=$('fName').value.trim(),c=chairs(),go=$('fGo');
      if(!name||!st.phone||st.used||!c||(!c.length&&!same()))return;
      if(!L.on)return sampleSubmit(kind,t,v,name,st.phone,c,k);
      go.disabled=true;go.textContent=kind==='edit'?'Saving…':'Making the invitation…';
      var seats=same()?null:c;   /* name or number only: the seats stay as they are, whatever happened meanwhile */
      var call=kind==='invite'?API.rpc('host_invite',{p_token:tok(k),p_table:t,p_chairs:c,p_name:name,p_phone:st.phone}):
        kind==='edit'?API.rpc('host_edit',{p_token:tok(k),p_num:v.num,p_name:name,p_phone:st.phone,p_chairs:seats,p_seen:n0}):
        API.rpc('host_reassign',{p_token:tok(k),p_num:v.num,p_name:name,p_phone:st.phone,p_chairs:seats,p_seen:n0});
      call.then(function(r){
        if(!r||r.error){
          go.disabled=false;go.textContent=kind==='edit'?'Save':'Send on WhatsApp';problem(r);
          if(r&&r.used){st.used=r.used;usedUi();valid();return;}
          if(r&&(r.error==='phone'||r.error==='name'))return;
          closeSheet();load().catch(function(){});return;   /* the seats changed meanwhile: look again */
        }
        if(kind==='edit'){closeSheet();showToast('Saved. Nothing was sent');load().catch(function(){});return;}
        var x=r.invitations[0],nv={num:x.num,token:x.token,phone:x.phone,name:x.name,seats:x.seats,att:null,status:'sent',table:x.table,chairs:x.chairs,confirmBy:x.confirm_by||r.confirm_by};
        var w=null;try{w=window.open(waUrl(nv),'_blank');if(w)w.opener=null;}catch(e){w=null;}
        sentSheet(nv,!!w,r.replaced||null);
        load().catch(function(){});   /* a reload that fails here is not a failed invitation */
      }).catch(function(){go.disabled=false;go.textContent=kind==='edit'?'Save':'Send on WhatsApp';showToast('No connection. Try again.');});
    };
  }
  function problem(r){
    var e=r&&r.error;
    showToast(e==='used'?'That number already has an invitation':e==='taken'?'Someone just took those seats. Choose again.':e==='table'?'No free seats left'+(ADMIN?' for that host':' for you')+' at that table':
      e==='full'?(ADMIN?'That host’s seats are all given':'All your seats are given'):e==='closed'?'Invitations have closed':e==='phone'?'Check the WhatsApp number':e==='name'?'Add a name':
      e==='gone'?'That invitation has changed. Look again.':'Something went wrong. Try again.');
  }
  /* after sending: WhatsApp opened in their chat (or a button to open it, where the phone held it back) */
  function sentSheet(v,opened,replaced){
    openSheet('<h3 id="sheetTitle">'+(opened?'Sent to WhatsApp':'Ready to send')+'</h3>'+
      '<div class="meta">'+esc(v.name)+' · '+esc(B.tableLabel(v.table))+' · '+L.seatWords(v.chairs)+'</div><div class="big">'+v.num+'</div>'+
      (replaced?'<p class="hint">'+replaced+' no longer works.</p>':'')+
      '<p class="hint">'+(opened?'Press send in WhatsApp. Came back without sending? Open it again here.':'Open WhatsApp and press send.')+'</p>'+
      '<div class="stack"><a class="btn green wide" href="'+waUrl(v)+'" target="_blank" rel="noopener"'+BTN+'>'+(opened?'Open WhatsApp again':'Open WhatsApp')+'</a>'+
      '<button class="btn wide" type="button" data-close>Done</button></div>');
  }
  function cancelSheet(v){
    openSheet('<h3 id="sheetTitle">Cancel '+v.num+'?</h3><div class="meta">'+esc(v.name||'')+'</div>'+
      '<p class="hint">'+(v.chairs&&v.chairs.length?cap1(L.seatWords(v.chairs))+' at '+esc(B.tableLabel(v.table))+' become free. ':'')+'The code and link stop working.'+(v.status==='confirmed'?' They have confirmed.':'')+'</p>'+
      '<div class="stack"><button class="btn danger wide" type="button" id="cYes">Yes, cancel it</button><button class="btn wide" type="button" data-close>Keep it</button></div>');
    $('cYes').onclick=function(){
      if(!L.on){closeSheet();sampleChange(function(list){var i=list.findIndex(function(x){return x.num===v.num;});if(i>=0)list.splice(i,1);});showToast('Invitation '+v.num+' cancelled');return;}
      $('cYes').disabled=true;
      API.rpc('host_cancel',{p_token:tok(v.host),p_num:v.num}).then(function(r){closeSheet();showToast(r&&r.cancelled?'Invitation '+v.num+' cancelled':'Nothing to cancel');load().catch(function(){});})
        .catch(function(){$('cYes').disabled=false;showToast('No connection. Try again.');});
    };
  }
  /* the preview: the same steps on the sample, and the message shown instead of WhatsApp */
  function freshNumber(){var n;do{n=101+Math.floor(Math.random()*799);}while(n===950||B.byNum[n]);return n;}
  function sampleSubmit(kind,t,v,name,phone,c,k){
    if(kind==='edit'){
      sampleChange(function(list){var x=list.filter(function(i){return i.num===v.num;})[0];if(!x)return;
        var changed=c.length!==B.held(v);x.name=name;x.phone=phone;if(changed){x.chairs=c;x.seats=c.length;if(x.status==='confirmed')x.att=c.length;}});
      closeSheet();showToast('Saved. Nothing was sent');return;
    }
    var num=freshNumber(),nv={num:num,token:B.token(num),host:k,grp:'p'+num,family:false,name:name,phone:phone,status:'sent',table:t,chairs:c,seats:c.length,att:null};
    sampleChange(function(list){if(v){var i=list.findIndex(function(x){return x.num===v.num;});if(i>=0)list.splice(i,1);}list.push(nv);});
    var bv=B.byNum[num];
    openSheet('<h3 id="sheetTitle">WhatsApp opens</h3><div class="meta">On the real page, WhatsApp opens in '+esc(name)+'’s chat with this message. You press send.</div>'+
      (v?'<p class="hint">'+v.num+' no longer works.</p>':'')+
      '<div class="msg"><b>The message they’ll receive</b>'+esc(message(bv))+'</div>'+
      '<div class="linkrow"><a class="linkbtn" href="./index.html?g='+num+'&n='+c.length+'" target="_blank" rel="noopener">See the invitation they open</a><span></span></div>'+
      '<div class="stack"><button class="btn primary wide" type="button" data-close>'+(ADMIN?'Back to the tables':'Back to your tables')+'</button></div>');
  }
  /* a table tapped to invite: for the host whose page this is, or (viewing every host) its host, chosen when it is shared */
  function invite(t,start){
    if(closedNow())return showToast('Invitations have closed');
    if(!ADMIN){
      if(roomFor(me,t)<=0)return showToast('No free seats for you at '+B.tableName(t));
      if(B.tally(me).left<=0)return showToast('All your seats are given');
      return form('invite',t,start,null,me);
    }
    var ks=inviters(t);
    if(!ks.length)return showToast(roomView(t)>0?(me?B.hostName(me)+'’s seats are all given':'The hosts here have given all their seats'):'No free seats at '+B.tableName(t));
    if(ks.length===1)return form('invite',t,start,null,ks[0]);
    openSheet('<h3 id="sheetTitle">Invite for</h3><div class="meta">'+esc(B.tableLabel(t))+(start?' · seat '+start:'')+' is shared</div>'+
      '<ul class="pick">'+ks.map(function(k){return '<li><button type="button" data-k="'+k+'"><b>'+esc(hostLabel(k))+'</b><span>'+plural(roomFor(k,t),'seat')+' free here · '+B.tally(k).left+' left to give</span></button></li>';}).join('')+'</ul>'+
      '<div class="stack"><button class="btn wide" type="button" data-close>Cancel</button></div>');
    [].forEach.call(sheet.querySelectorAll('[data-k]'),function(b){b.onclick=function(){form('invite',t,start,null,b.getAttribute('data-k'));};});
  }

  /* ---------- the overall view: moving an invitation, with its family on the same number ---------- */
  function moving(v){return [v].concat(family(v,v.phone,v.table));}
  function moveSheet(v){
    v=B.byNum[v.num]||v;
    var group=moving(v),n=0;group.forEach(function(x){n+=B.held(x);});
    var from=v.table,opts=tablesAll().filter(function(t){return t!==from&&freeAt(t)>=n;});
    openSheet('<h3 id="sheetTitle">'+(from?'Move ':'Seat ')+v.num+'</h3><div class="meta">'+esc(v.name||B.hostName(v.host)+'’s guest')+' · '+(from?'now at '+esc(B.tableLabel(from)):'not seated yet')+'</div>'+
      '<p class="hint">'+(group.length>1?'With '+group.slice(1).map(function(x){return x.num;}).join(' and ')+' on the same number: '+plural(n,'seat')+' move together, side by side.':
        plural(n,'seat')+(n>1?', side by side.':'.'))+' They keep their numbers and links.</p>'+
      (opts.length?'<ul class="pick">'+opts.map(function(t){return '<li><button type="button" data-to="'+t+'"><b>'+esc(B.tableLabel(t))+'</b><span>'+freeAt(t)+' free · '+esc(tableWho(t))+'</span></button></li>';}).join('')+'</ul>':
        '<div class="banner warn">No other table has '+plural(n,'free chair')+'. Move someone else first.</div>')+
      '<div class="stack"><button class="btn wide" type="button" id="mBack">Back</button></div>');
    [].forEach.call(sheet.querySelectorAll('[data-to]'),function(b){b.onclick=function(){moveTo(v,+b.getAttribute('data-to'),group,n);};});
    $('mBack').onclick=function(){details(v);};
  }
  function moveTo(v,t,group,n){
    var what=v.num+(group.length>1?' and family':'')+(v.table?' moved to ':' seated at ')+B.tableLabel(t);
    if(!L.on){
      var ch=pick(t,n,null,1);if(!ch){closeSheet();return showToast('That table just filled up');}
      sampleChange(function(list){var k=0;group.forEach(function(g){var x=list.filter(function(i){return i.num===g.num;})[0],h=B.held(g);if(x){x.table=t;x.chairs=ch.slice(k,k+h);}k+=h;});});
      closeSheet();showToast(what);return;
    }
    [].forEach.call(sheet.querySelectorAll('[data-to]'),function(b){b.disabled=true;});
    API.rpc('admin_move',{p_token:L.token,p_grp:v.group,p_table:t}).then(function(r){
      closeSheet();
      showToast(!r||r.error?(r&&r.error==='full'?'That table just filled up':r&&r.error==='gone'?'That invitation has changed. Look again.':'Something went wrong. Try again.'):what);
      return load();
    }).catch(function(){closeSheet();showToast('No connection. Try again.');});
  }
  function tablesAll(){return Object.keys(B.tables).map(Number).sort(function(a,b){return a-b;});}

  /* ---------- the list: every guest of this page, to find, download or share ---------- */
  var lf={q:'',only:'all'};
  function listName(v){return v.name||(v.family?B.hostName(v.host)+(v.own==='wife'?'’s wife':v.seats>1?' and wife':''):'No name yet');}
  function shortAnswer(v){return v.status==='confirmed'?(v.att<v.seats?'Confirmed '+v.att+' of '+v.seats:'Confirmed'):v.status==='sent'?'Sent':'Not confirmed in time';}
  function listItems(){
    var q=lf.q.trim().toLowerCase(),dq=q.replace(/\D/g,'');
    return B.invites.filter(function(v){
      if(v.num==null||!(isAll()||v.host===me))return false;
      if(v.family&&!isAll())return false;   /* a host's own invitation is not on their list */
      if(lf.only==='conf'&&v.status!=='confirmed')return false;
      if(lf.only==='sent'&&v.status!=='sent')return false;
      if(q){
        var hay=(v.num+' '+listName(v)+' '+(v.table?'table '+v.table+' '+B.tableName(v.table):'')+' '+(isAll()?B.hostName(v.host):'')).toLowerCase();
        var tel=v.phone?v.phone+' '+(v.phone.indexOf('233')===0?'0'+v.phone.slice(3):''):'';
        if(hay.indexOf(q)<0&&!(dq.length>=3&&tel.indexOf(dq)>=0))return false;
      }
      return true;
    }).sort(function(a,b){return (a.table||99)-(b.table||99)||(((a.chairs||[])[0]||0)-((b.chairs||[])[0]||0))||a.num-b.num;});
  }
  function list(){
    if(!B)return;
    var items=listItems(),conf=0,sent=0,late=0;
    items.forEach(function(v){if(v.status==='confirmed')conf+=v.att;else if(v.status==='sent')sent+=v.seats;else late++;});
    /* people: confirmed, and sent but not confirmed yet (seats that came back are no longer counted) */
    $('lSum').textContent=items.length?plural(items.length,'invitation')+' · '+conf+' confirmed · '+sent+' sent'+(late?' · '+late+' not confirmed in time':''):'';
    $('lRows').innerHTML=items.length?items.map(function(v){
      var pill=v.family?['fam','Family']:v.status==='confirmed'?['conf','Confirmed']:v.status==='sent'?['sent','Sent']:['gone','Not in time'];
      var where=v.table?'Table '+v.table+' '+B.tableName(v.table)+(v.chairs&&v.chairs.length?' · '+L.seatWords(v.chairs):''):'Not seated yet';
      var by=isAll()?B.hostName(v.host)+(v.family?', family':'’s guest'):'';
      return '<li><button type="button" data-n="'+v.num+'"><span class="no">'+v.num+'</span><span class="d">'+
        '<span class="r1"><b>'+esc(listName(v))+'</b><span class="st '+pill[0]+'">'+pill[1]+'</span></span>'+
        '<small>'+esc(where)+'</small>'+
        '<small>'+plural(v.seats,'seat')+(v.status==='confirmed'&&v.att<v.seats?', '+v.att+' confirmed':'')+(v.phone?' · '+esc(L.showPhone(v.phone)):'')+(by?' · '+esc(by):'')+'</small>'+
        '</span></button></li>';}).join(''):
      '<li class="empty">'+(lf.q.trim()?'Nobody matches “'+esc(lf.q.trim())+'”.':lf.only!=='all'?'None yet.':ADMIN?'No invitations yet.':'No invitations yet. Swipe to a table and tap it to invite.')+'</li>';
    $('lDown').disabled=$('lShare').disabled=!items.length;
  }
  $('lFind').addEventListener('input',function(){lf.q=$('lFind').value;list();});
  $('lOnly').addEventListener('click',function(e){
    var b=e.target.closest('button[data-o]');if(!b)return;lf.only=b.getAttribute('data-o');
    [].forEach.call($('lOnly').querySelectorAll('button'),function(x){x.setAttribute('aria-pressed',String(x===b));});list();
  });
  $('lRows').addEventListener('click',function(e){var b=e.target.closest('button[data-n]'),v=b&&B.byNum[+b.getAttribute('data-n')];if(v){if(v.family)ownSheet(v);else details(v);}});
  /* a spreadsheet of the list shown: a host's own columns, and on the overall view the host, children and the gate's count too */
  /* a WhatsApp number for a spreadsheet: Ghana's as 024 123 4567; one from abroad with its country code apart, (+44) 7700900123,
     so the plus and the digits stay as typed instead of turning into a sum or a number */
  var CC2=[20,27,30,31,32,33,34,36,39,40,41,43,44,45,46,47,48,49,51,52,53,54,55,56,57,58,60,61,62,63,64,65,66,81,82,84,86,90,91,92,93,94,95,98];
  function csvPhone(d){
    if(!d)return '';if(/^233\d{9}$/.test(d))return L.showPhone(d);
    var n=/^[17]/.test(d)?1:CC2.indexOf(+d.slice(0,2))>=0?2:3;
    return '(+'+d.slice(0,n)+') '+d.slice(n);
  }
  function csvOf(items){
    var head=['Code','Name','WhatsApp'].concat(ADMIN?['Host']:[]).concat(['Seats','Confirmed for','Answer','Table','Table name','Seat numbers']).concat(ADMIN?['Children','In','Last in at']:[]);
    var rows=[head].concat(items.map(function(v){
      var r=[v.num,listName(v),csvPhone(v.phone)];
      if(ADMIN)r.push(B.hostName(v.host)+(v.family?' (family)':''));
      r=r.concat([v.seats,v.status==='confirmed'?v.att:'',shortAnswer(v),v.table||'',v.table?B.tableName(v.table):'',(v.chairs||[]).join(' ')]);
      if(ADMIN)r=r.concat([v.kids||'',v.arrived||0,v.arrivedAt||'']);
      return r;
    }));
    /* a name typed like a formula stays text in a spreadsheet */
    return rows.map(function(r){return r.map(function(c){c=String(c);if(/^[=+\-@]/.test(c))c="'"+c;return '"'+c.replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');
  }
  function listTitle(){return (isAll()?'Every guest':B.hostName(me)+'’s guests')+' · Dinner Night, Sunday 20 December';}
  function shareText(items){
    return listTitle()+'\n\n'+items.map(function(v){
      return v.num+' · '+listName(v)+(v.phone?' · '+L.showPhone(v.phone):'')+' · '+plural(v.seats,'seat')+' · '+shortAnswer(v)+' · '+
        (v.table?'Table '+v.table+' '+B.tableName(v.table)+(v.chairs&&v.chairs.length?', '+L.seatWords(v.chairs):''):'Not seated yet')+(isAll()?' · '+B.hostName(v.host):'');
    }).join('\n');
  }
  $('lDown').addEventListener('click',function(){
    if(!B)return;var items=listItems();if(!items.length)return;
    var name='dinner-night-'+(isAll()?'every-guest':(B.hostName(me)||'guests').toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-guests')+'.csv';
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+csvOf(items)],{type:'text/csv;charset=utf-8'}));a.download=name;
    document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href);},10000);
    showToast('Downloaded: '+plural(items.length,'invitation'));
  });
  $('lShare').addEventListener('click',function(){
    if(!B)return;var items=listItems();if(!items.length)return;
    var text=shareText(items);
    if(navigator.share){navigator.share({title:listTitle(),text:text}).catch(function(){});return;}
    copy(text,'List copied. Paste it anywhere',true);
  });
  /* copy, or where the browser won't, the text to copy by hand */
  function copy(text,done,long){
    (navigator.clipboard&&window.isSecureContext?navigator.clipboard.writeText(text):Promise.reject()).then(function(){showToast(done);},function(){
      if(!long){window.prompt('Copy this',text);return;}
      openSheet('<h3 id="sheetTitle">Copy the list</h3><div class="meta">Select it all, copy, then paste it anywhere</div><textarea class="copyarea" id="cText" readonly></textarea>'+
        '<div class="stack"><button class="btn wide" type="button" data-close>Done</button></div>');
      $('cText').value=text;$('cText').focus();$('cText').select();
    });
  }

  /* ---------- everyone: the room as it stands, then the totals ---------- */
  var tabs=['Mine','List','All'],view='Mine';
  function showView(v){
    view=v;
    tabs.forEach(function(t){$('t'+t).setAttribute('aria-selected',String(t===v));$('p'+t).hidden=t!==v;});
    if(ready){if(v==='All')everyone();if(v==='List')list();if(v==='Mine')go(cur,false);}
    window.scrollTo(0,0);
  }
  tabs.forEach(function(t){$('t'+t).addEventListener('click',function(){showView(t);});});
  document.querySelector('.tabs').addEventListener('keydown',function(e){
    if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;
    e.preventDefault();var n=tabs[(tabs.indexOf(view)+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];showView(n);$('t'+n).focus();
  });
  function tableWho(t){
    if(t===18)return 'Family';
    var hs=B.chairsAt(t).filter(function(s){return s.inv;}).map(function(s){return s.inv.host;});
    if(!hs.length)hs=B.chairsAt(t).map(function(s){return s.host;}).filter(Boolean);
    var u=hs.filter(function(v,i,a){return a.indexOf(v)===i;});
    return !u.length?'Free':u.length>1?'Shared':B.hostName(u[0]);
  }
  function ago(iso,now){var m=Math.max(0,Math.round((new Date(now)-new Date(iso))/60000));
    return m<1?'just now':m<60?plural(m,'minute')+' ago':m<1440?plural(Math.round(m/60),'hour')+' ago':plural(Math.round(m/1440),'day')+' ago';}
  /* the same colours as the tables: yellow sent, green confirmed; on the night (overall view), blue once they're in */
  var FILL={open:'#fff',sent:'#f2c94c',confirmed:'#3e8e5a',arrived:'#2f6690'},STROKE={open:'#b7a58c',sent:'#b8901e',confirmed:'#2c6b42',arrived:'#24506f'};
  function seatState(s){var v=s.inv;if(!v)return 'open';if(v.status!=='confirmed')return 'sent';return night&&s.k<(v.arrived||0)?'arrived':'confirmed';}
  function ring(a,b,total,big,small,color,label){
    var R=78,C=2*Math.PI*R,fa=total?a/total:0,fb=total?b/total:0;
    $('ring').setAttribute('aria-label',label);
    $('ring').innerHTML='<circle cx="100" cy="100" r="'+R+'" fill="none" stroke="#efe2cc" stroke-width="14"/>'+
      (b?'<circle cx="100" cy="100" r="'+R+'" fill="none" stroke="#f2c94c" stroke-width="14" stroke-dasharray="'+((fa+fb)*C).toFixed(1)+' '+C.toFixed(1)+'" transform="rotate(-90 100 100)"/>':'')+
      '<circle cx="100" cy="100" r="'+R+'" fill="none" stroke="'+color+'" stroke-width="14" stroke-dasharray="'+(fa*C).toFixed(1)+' '+C.toFixed(1)+'" transform="rotate(-90 100 100)"/>'+
      '<text x="100" y="104" text-anchor="middle" font-size="46" fill="#4c2f25">'+big+'</text>'+
      '<text x="100" y="130" text-anchor="middle" font-size="14" font-style="italic" fill="#7c6a5f">'+esc(small)+'</text>';
  }
  function everyone(){
    if(!B)return;
    $('map').innerHTML=ROOM.svg({chairs:function(t){return B.chairsAt(t);},label:tableWho,
      aria:function(t){var c=B.chairsAt(t);return B.tableLabel(t)+', '+c.filter(function(s){return s.inv;}).length+' of '+c.length+' taken';},
      paint:function(s){var st=seatState(s);return {fill:FILL[st],stroke:STROKE[st],dashed:st==='open'};}});
    $('mapLegend').innerHTML=legend(night?[['open','Free'],['sent','Not confirmed'],['confirmed','Confirmed, not in yet'],['arrived','In the room']]:[['conf','Confirmed'],['sent','Sent'],['open','Free']]);
    var seats=0,conf=0,wait=0;O.hosts.forEach(function(x){seats+=x.seats;conf+=x.confirmed;wait+=x.waiting;});
    if(night){
      var inn=0;B.invites.forEach(function(v){if(v.status==='confirmed')inn+=Math.min(v.att||v.seats,v.arrived||0);});
      ring(inn,0,conf,inn,'of '+conf+' in','#2f6690',inn+' of '+conf+' confirmed guests in');
      $('totLine').textContent=plural(conf-inn,'confirmed guest')+' still to come';
      $('when').textContent='Sunday 20 December · 4:00 pm';$('pulse').textContent='';
    }else{
      ring(conf,wait,seats,conf,'of '+seats+' confirmed','#3e8e5a',conf+' of '+seats+' confirmed, '+wait+' sent and not confirmed yet');
      $('totLine').textContent=wait+' sent, not confirmed yet · '+Math.max(0,seats-conf-wait)+' free';
      var days=Math.ceil((new Date(O.deadline)-new Date(O.now))/86400000);
      $('when').textContent=days>1?days+' days left to confirm · '+byDay():days===1?'Last day to confirm · '+byDay():'Confirmations closed on '+byDay();
      $('pulse').textContent=O.today?plural(O.today,'person','people')+' confirmed today'+(O.last?' · latest '+ago(O.last,O.now):''):O.last?'Latest confirmation '+ago(O.last,O.now):'No confirmations yet';
    }
    if(ADMIN){adminTotals();return;}
    $('rows').innerHTML=O.hosts.map(function(x){
      var left=Math.max(0,x.seats-x.confirmed-x.waiting);
      return '<li><div class="top2"><span><b>'+esc(x.name)+'</b>'+(x.key===me?'<span class="you">You</span>':'')+'</span><span class="num">'+x.confirmed+' <span>of '+x.seats+' confirmed</span></span></div>'+
        '<div class="bar" aria-hidden="true"><i class="c" style="width:'+(100*x.confirmed/x.seats)+'%"></i><i class="w" style="width:'+(100*x.waiting/x.seats)+'%"></i></div>'+
        '<small>'+x.waiting+' sent, not confirmed yet · '+left+' free</small></li>';}).join('');
  }
  /* the overall view's numbers: each host's people (their own family seats count as confirmed), and what to follow up */
  function adminTotals(){
    var per={},all={seats:0,invited:0,confirmed:0,waiting:0,left:0,arrived:0,late:0};
    Object.keys(B.HOSTS).forEach(function(k){
      var T=B.tally(k),o={seats:T.alloc,invited:T.invited+T.ownSeats,confirmed:T.confirmed+T.ownSeats,waiting:T.waiting,left:T.left,arrived:0,late:0};
      B.invites.forEach(function(v){if(v.host!==k)return;if(v.status==='confirmed')o.arrived+=Math.min(v.att||v.seats,v.arrived||0);if(v.status==='expired'&&!v.family)o.late++;});
      per[k]=o;Object.keys(all).forEach(function(f){all[f]+=o[f];});
    });
    var cols=night?[['confirmed','Confirmed'],['arrived','In'],['tocome','To come']]:[['seats','Seats'],['invited','Invited'],['confirmed','Confirmed'],['waiting','Sent'],['left','Left']];
    function cells(o){return cols.map(function(c){return '<td>'+(c[0]==='tocome'?o.confirmed-o.arrived:o[c[0]])+'</td>';}).join('');}
    $('hosts').innerHTML='<tr><th>Host</th>'+cols.map(function(c){return '<th>'+c[1]+'</th>';}).join('')+'</tr>'+
      Object.keys(B.HOSTS).map(function(k){return '<tr><td><button class="hl" type="button" data-as="'+k+'">'+esc(B.HOSTS[k].name)+'</button></td>'+cells(per[k])+'</tr>';}).join('')+
      '<tr class="all"><td>All</td>'+cells(all)+'</tr>';
    var f=[];
    function by(x){return Object.keys(B.HOSTS).filter(function(k){return per[k][x];}).map(function(k){return esc(B.HOSTS[k].name)+' '+per[k][x];}).join(', ');}
    if(night)f.push({cls:'',t:'Still to come · '+plural(all.confirmed-all.arrived,'guest'),m:'Each number lets in only as many people as it confirmed. The gate calls the host for anyone it doesn’t know.'});
    else{
      if(B.unseated.length){
        var people=B.unseated.reduce(function(n,v){return n+B.held(v);},0);
        f.push({cls:'warn',t:'Not seated yet · '+plural(people,'person','people'),m:'No table had room when they were invited. Tap one to give it a table.<br>'+
          B.unseated.map(function(v){var n=B.held(v);return '<button class="btn" type="button" data-seat="'+v.num+'">'+v.num+' · '+esc(B.hostName(v.host))+(n>1?' · '+n:'')+'</button>';}).join('')});
      }
      if(all.waiting)f.push({cls:'warn',t:'Not confirmed yet · '+plural(all.waiting,'person','people'),m:by('waiting')+'. Whatever isn’t confirmed by '+byDay()+' goes back to its host.'});
      if(all.late)f.push({cls:'',t:'Not confirmed in time · '+plural(all.late,'invitation'),m:by('late')+'. Their seats went back to their host. The list shows who they are.'});
      if(all.left)f.push({cls:'',t:'Left to invite · '+plural(all.left,'seat'),m:by('left')+'.'});
    }
    $('issueCount').textContent=night?'':plural(f.length,'item');
    $('issues').innerHTML=f.length?f.map(function(i){return '<li class="'+i.cls+'"><b>'+i.t+'</b>'+i.m+'</li>';}).join(''):'<li>Nothing to follow up.</li>';
  }
  /* the private links Michael sends: one per host, and the gate's */
  function links(){
    if(!L.on||!ADMIN||!RAW.gate_token)return;
    var items=Object.keys(B.HOSTS).filter(function(k){return B.HOSTS[k].token;}).map(function(k){
      var h=B.HOSTS[k],u=L.pageLink('host.html',h.token);
      return {who:h.name+(h.role?' · '+h.role:''),note:'Their invitations page',url:u,
        text:'Hello '+h.name+', this is your private link for inviting guests to Dinner Night. Swipe to a table, tap it to invite, then press send in WhatsApp. Please keep this link to yourself.\n'+u};});
    var g=L.pageLink('gate.html',RAW.gate_token);
    items.push({who:'Gate',note:'For the phone at the gate',url:g,text:'Dinner Night gate. Open this on the gate phone before guests arrive:\n'+g});
    $('linkList').innerHTML=items.map(function(it,i){return '<li><b><a href="'+esc(it.url)+'" target="_blank" rel="noopener">'+esc(it.who)+'</a><small>'+esc(it.note)+'</small></b>'+
      '<button class="btn" type="button" data-copy="'+i+'">Copy</button><a class="btn" href="https://wa.me/?text='+encodeURIComponent(it.text)+'" target="_blank" rel="noopener">WhatsApp</a></li>';}).join('');
    [].forEach.call($('linkList').querySelectorAll('[data-copy]'),function(b){b.onclick=function(){copy(items[+b.getAttribute('data-copy')].url,'Link copied');};});
    $('links').hidden=false;
  }
  /* a table in the room: one of yours opens it on the tables tab; another host's shows its counts, never names.
     On the overall view, every table opens */
  function openTable(t){
    if(me&&tablesInView().indexOf(t)<0)viewAs(null);
    var i=tablesInView().indexOf(t);
    showView('Mine');if(i>=0)go(i,false);
  }
  ROOM.onTable($('map'),function(t){
    if(ADMIN)return openTable(t);
    var i=B.hostTables(me).map(function(p){return p.table;}).indexOf(t);
    if(i>=0){showView('Mine');go(i,false);return;}
    var c=B.chairsAt(t),taken=c.filter(function(s){return s.inv;}),cf=taken.filter(function(s){return s.inv.status==='confirmed';}).length;
    openSheet('<h3 id="sheetTitle">'+esc(B.tableLabel(t))+'</h3><div class="meta">'+esc(tableWho(t))+'</div>'+
      '<ul class="tlist"><li>'+plural(cf,'seat')+' confirmed</li><li>'+plural(taken.length-cf,'seat')+' sent, not confirmed yet</li><li>'+plural(c.length-taken.length,'chair')+' free</li></ul>'+
      '<div class="stack"><button class="btn wide" type="button" data-close>Close</button></div>');
  });

  /* ---------- the overall view: viewing as one host, or all of them ---------- */
  function fillAs(){
    var s=$('as');
    if(s.options.length<2)Object.keys(B.HOSTS).forEach(function(k){var o=document.createElement('option');o.value=k;o.textContent=hostLabel(k);s.appendChild(o);});
    if(me&&!B.HOSTS[me])me=null;
    s.value=me||'';
  }
  function viewAs(k){
    me=k&&B.HOSTS[k]?k:null;cur=0;
    try{var u=new URL(location.href);if(me)u.searchParams.set('as',me);else u.searchParams.delete('as');history.replaceState(null,'',u);}catch(e){}
    $('deck').scrollLeft=0;render();
  }
  if(ADMIN){
    $('as').addEventListener('change',function(){viewAs($('as').value);if(view==='Mine')go(0,false);});
    $('hosts').addEventListener('click',function(e){var b=e.target.closest('[data-as]');if(!b)return;viewAs(b.getAttribute('data-as'));showView('Mine');});
    $('issues').addEventListener('click',function(e){var b=e.target.closest('[data-seat]'),v=b&&B.byNum[+b.getAttribute('data-seat')];if(v)moveSheet(v);});
    var setNight=function(n){night=n;$('vBefore').setAttribute('aria-pressed',String(!n));$('vNight').setAttribute('aria-pressed',String(n));everyone();};
    $('vBefore').onclick=function(){setNight(false);};$('vNight').onclick=function(){setNight(true);};
  }

  if(L.on){
    $('intro').textContent=ADMIN?'Loading every table…':'Loading your tables…';
    load().catch(function(){$('intro').textContent='No connection. Pull down to try again.';});
    setInterval(function(){if(!sheet.classList.contains('show')&&document.visibilityState==='visible')load().catch(function(){});},60000);
  }else load();
})();
