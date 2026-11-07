/* The home-screen app's helper: every page and script a host, the gate or the overall view has opened is kept, so the
   page itself opens with no signal (the gate keeps its list on the phone already). Online, nothing changes: the network
   is always asked first, and the copy is only used when it fails. Calls to the database are never touched */
var CACHE='mibea26-staff-v1';
self.addEventListener('install',function(){self.skipWaiting();});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  var r=e.request;
  if(r.method!=='GET')return;
  var u=new URL(r.url);
  if(u.origin!==self.location.origin)return;              /* the database, fonts, WhatsApp: straight through */
  if(/\.(mp3|jpe?g)$/i.test(u.pathname))return;           /* the invitation's music and photos: not kept */
  e.respondWith(fetch(r).then(function(res){
    if(res&&res.ok){var copy=res.clone();caches.open(CACHE).then(function(c){c.put(r,copy);});}
    return res;
  }).catch(function(){
    return caches.match(r).then(function(hit){
      if(hit)return hit;
      if(r.mode==='navigate')return caches.match(r,{ignoreSearch:true});   /* the same page opened with another code */
    }).then(function(hit){return hit||Response.error();});
  }));
});
