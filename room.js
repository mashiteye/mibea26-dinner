/* The room: twenty tables of nine, numbered from the entrance up (tables 1 to 4 by the door, 17 to 20 at the front),
   with the high table at the front and the family table (18) ringed in gold. Drawn by the overall view and the host pages */
(function(){
  'use strict';
  var COLS=[62,154,246,338],ROWS={1:470,2:380,3:290,4:200,5:110};
  function pos(t){var r=Math.ceil(t/4),c=(t-1)%4;return {x:COLS[c],y:ROWS[r]};}
  function esc(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  /* o.chairs(t): the chairs at table t; o.paint(chair): {fill,stroke,dashed,width}; o.label(t): the line under the table;
     o.aria(t): what a screen reader hears for the table */
  function svg(o){
    var out='<rect x="110" y="18" width="180" height="30" rx="4" fill="#fffaf2" stroke="#c9a45e" stroke-width="1"/>'+
      '<text x="200" y="37" text-anchor="middle" font-size="12" font-weight="600" fill="#4c2f25">High table</text>';
    for(var t=1;t<=20;t++){
      var p=pos(t);
      out+='<g class="tbl" tabindex="0" role="button" aria-label="'+esc(o.aria(t))+'" data-t="'+t+'">';
      out+='<circle class="t" cx="'+p.x+'" cy="'+p.y+'" r="20" fill="#fffaf2" stroke="#c9b48f" stroke-width="1"/>';
      if(t===18)out+='<circle cx="'+p.x+'" cy="'+p.y+'" r="24" fill="none" stroke="#c9a45e" stroke-width="1"/>';
      out+='<text x="'+p.x+'" y="'+(p.y+5)+'" text-anchor="middle" font-size="14" font-weight="600" fill="#4c2f25">'+t+'</text>';
      o.chairs(t).forEach(function(s,k){
        var a=(-90+40*k)*Math.PI/180,cx=p.x+31*Math.cos(a),cy=p.y+31*Math.sin(a),c=o.paint(s);
        out+='<circle cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" r="4.6" fill="'+c.fill+'" stroke="'+c.stroke+'" stroke-width="'+(c.width||1)+'"'+(c.dashed?' stroke-dasharray="2 1.6"':'')+'/>';
      });
      out+='<text x="'+p.x+'" y="'+(p.y+50)+'" text-anchor="middle" font-size="10.5" fill="#7c6a5f">'+esc(o.label(t))+'</text></g>';
    }
    return out+'<text x="200" y="545" text-anchor="middle" font-size="11" font-weight="600" letter-spacing="2" fill="#7c6a5f">ENTRANCE</text>';
  }
  /* tap or Enter on a table */
  function onTable(el,fn){
    el.addEventListener('click',function(e){var g=e.target.closest('.tbl');if(g)fn(+g.getAttribute('data-t'));});
    el.addEventListener('keydown',function(e){var g=e.target.closest('.tbl');if(g&&(e.key==='Enter'||e.key===' ')){e.preventDefault();fn(+g.getAttribute('data-t'));}});
  }
  window.ROOM={svg:svg,pos:pos,onTable:onTable};
})();
