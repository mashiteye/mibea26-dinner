/* The host page, the overall view and the gate as an app on the phone: an icon on the home screen that opens the
   page with no link to find. Android (Chrome) installs it from the page; iPhone adds it from Safari's Share menu, with a
   guide here. The phone remembers whose page it is (live.js), so the icon opens straight to it */
(function(){
  'use strict';
  var L=window.LIVE;
  if(!L||!L.on||!L.page)return;   /* the design preview, or a link that isn't working: nothing to install */
  var page=L.page,NAME={host:'Dinner Night',admin:'Overall view',gate:'Gate'}[page]||'Dinner Night';
  var ua=navigator.userAgent,iOS=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  var standalone=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
  /* Android: the manifest makes the page installable, and the installed app opens the page, which the phone remembers.
     iPhone: no manifest, so Safari keeps this page's own address (with the code) behind the icon */
  if(!iOS){var l=document.createElement('link');l.rel='manifest';l.href='./manifest-'+page+'.webmanifest';document.head.appendChild(l);}
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(function(){});
  if(standalone)return;   /* already opened from the icon */
  var SNOOZE='mibea26-install-'+page,now=Date.now();
  function later(){try{return +(localStorage.getItem(SNOOZE)||0)>now;}catch(e){return false;}}
  function snooze(days){try{localStorage.setItem(SNOOZE,String(now+days*864e5));}catch(e){}}
  if(later())return;
  var box=null,deferred=null;
  function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  var SHARE='<svg class="ishare" viewBox="0 0 20 24" aria-hidden="true"><path d="M10 2v13M6 6l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 10H3v12h14V10h-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  function show(kind){
    if(box)return;
    box=document.createElement('div');box.className='install';box.setAttribute('role','region');box.setAttribute('aria-label','Add to your home screen');
    box.innerHTML='<img src="./icon-192.png" alt="" width="48" height="48"><div class="t"><b>Put '+esc(NAME)+' on your home screen</b>'+
      (kind==='ios'?'<span>Tap Share '+SHARE+', then <b>Add to Home Screen</b>. One tap opens your page, with no link to find.</span>':
        '<span>One tap opens your page, with no link to find.</span>')+'</div>'+
      '<div class="b">'+(kind==='ios'?'<button class="btn primary" type="button" data-i="ok">Got it</button>':'<button class="btn primary" type="button" data-i="add">Add</button>')+
      '<button class="btn" type="button" data-i="later">Not now</button></div>';
    document.body.appendChild(box);
    box.addEventListener('click',function(e){
      var b=e.target.closest('button[data-i]');if(!b)return;
      var k=b.getAttribute('data-i');
      if(k==='add'&&deferred){var d=deferred;deferred=null;d.prompt();d.userChoice.then(function(c){if(c&&c.outcome==='accepted'){snooze(3650);hide();}}).catch(function(){});return;}
      snooze(k==='ok'?3650:3);hide();
    });
  }
  function hide(){if(box){box.remove();box=null;}}
  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferred=e;show('android');});
  window.addEventListener('appinstalled',function(){snooze(3650);hide();});
  if(iOS)setTimeout(function(){show('ios');},1200);
})();
