/* Calls the dinner's database functions (see supabase/schema.sql). No library: one POST per call */
(function(){
  'use strict';
  var C=window.DINNER_CONFIG||{};
  function rpc(fn,args){
    var headers={'Content-Type':'application/json','apikey':C.key};
    if(C.key&&C.key.indexOf('sb_')!==0)headers.Authorization='Bearer '+C.key;   /* the older anon keys also go here; the newer publishable keys don't */
    return fetch(C.url.replace(/\/$/,'')+'/rest/v1/rpc/'+fn,{method:'POST',headers:headers,body:JSON.stringify(args||{}),cache:'no-store'})
      .then(function(r){return r.text().then(function(t){var j=null;try{j=t?JSON.parse(t):null;}catch(e){}if(!r.ok)throw (j||{message:'HTTP '+r.status});return j;});});
  }
  window.API={ready:!!(C.url&&C.key),rpc:rpc};
})();
