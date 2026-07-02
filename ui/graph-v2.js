import { assetUrl, escapeHtml, pageUrl } from './core-data.js';
import { footer, sidebar, topbar } from './shell.js';
import { buildCoreGraph, RELATIONSHIPS } from './graph-data.js';

const COLORS={
  'dream-surreal':'#6677cc','nature-rustic':'#5f8f68','cute-playful':'#d77ca6',
  'digital-internet':'#4f91ad','fantasy-mythic':'#8b6fc1','dark-horror':'#776b6b',
  'fashion-identity':'#c07b63','cosmic-futurist':'#50658f','lifestyle-sport':'#8e8a54','hope-emotion':'#d19b3f'
};
const fmt=(value)=>new Intl.NumberFormat().format(value||0);

export function graphView(stats,recent){
  return `<div class="app-shell">${sidebar('graph',recent)}<main class="content-shell">${topbar()}<section class="main-card graph-page">
    <header class="graph-header"><div><p class="kicker">Core Wiki</p><h1 class="section-page-title">Core Graph</h1><p class="section-description">Search a core and see its world: visual overlap, emotional overlap, historical influence, category relationships, and shared user interest.</p></div><div class="graph-summary"><strong id="graphNodeCount">0</strong><span>nodes</span><strong id="graphEdgeCount">0</strong><span>edges</span></div></header>
    <div class="graph-controls"><label class="graph-search"><span>⌕</span><input id="graphSearch" type="search" placeholder="Search the graph..."></label><select id="graphRelationship"><option value="all">All relationships</option>${Object.entries(RELATIONSHIPS).map(([key,value])=>`<option value="${key}">${escapeHtml(value.label)}</option>`).join('')}</select><button id="graphFit" type="button">Fit graph</button><button id="graphExport" type="button">Export JSON</button></div>
    <div class="graph-layout"><div class="graph-stage" id="graphStage"><canvas id="graphCanvas"></canvas><div class="graph-help">Left-click a node to select · Left-click empty space to clear · Right-click and drag to move · Scroll to zoom</div><div class="graph-legend">${Object.values(RELATIONSHIPS).map((value)=>`<span><i style="background:${value.color}"></i>${escapeHtml(value.label)}</span>`).join('')}</div></div><aside class="graph-detail" id="graphDetail"></aside></div>
  </section>${footer()}</main></div>`;
}

function emptyDetail(){return '<div class="graph-detail-empty"><span>✦</span><h3>Select a core</h3><p>Left-click any node to inspect its metadata and connections.</p></div>';}

function detailHtml(node,graph,edgeMap){
  const connections=edgeMap.get(node.id)||[];
  const rows=connections.slice(0,14).map(({edge,other})=>{const relation=graph.relationships[edge.relationship]||{label:edge.relationship,color:'#999'};return `<button class="connection-row" data-graph-node="${other.id}" type="button"><i style="background:${relation.color}"></i><span><b>${escapeHtml(other.name)}</b><small>${escapeHtml(relation.label)}</small></span><em>→</em></button>`;}).join('');
  return `<div class="graph-detail-content">${node.thumbnail?`<img class="graph-detail-image" src="${assetUrl(node.thumbnail)}" alt="${escapeHtml(node.name)}">`:''}<p class="graph-detail-cluster">${escapeHtml(node.clusterLabel)}</p><h2>${escapeHtml(node.name)}</h2><p class="graph-detail-description">${escapeHtml(node.description)}</p><dl class="graph-meta"><div><dt>Parent</dt><dd>${escapeHtml(node.parent)}</dd></div><div><dt>Era</dt><dd>${escapeHtml(node.era)}</dd></div><div><dt>Graphics</dt><dd>${fmt(node.graphicCount)}</dd></div><div><dt>Connections</dt><dd>${fmt(connections.length)}</dd></div></dl><div class="graph-tags"><h4>Keywords</h4><p>${node.keywords.map((item)=>`<span>${escapeHtml(item)}</span>`).join('')}</p><h4>Visuals</h4><p>${node.visuals.map((item)=>`<span>${escapeHtml(item)}</span>`).join('')}</p><h4>Emotions</h4><p>${node.emotions.map((item)=>`<span>${escapeHtml(item)}</span>`).join('')}</p></div><a class="graph-open-core" href="${pageUrl(node.name)}">Open ${escapeHtml(node.name)} →</a><h4 class="connections-title">Connected cores</h4><div class="connection-list">${rows||'<p class="graph-detail-description">No curated connections yet.</p>'}</div></div>`;
}

function placeNodes(graph,edgeMap){
  const groups=new Map();
  graph.nodes.forEach((node)=>{if(!groups.has(node.cluster))groups.set(node.cluster,[]);groups.get(node.cluster).push(node);});
  const entries=[...groups.entries()];
  entries.forEach(([,nodes],clusterIndex)=>{
    const angle=clusterIndex/Math.max(1,entries.length)*Math.PI*2-Math.PI/2;
    const cx=Math.cos(angle)*420;
    const cy=Math.sin(angle)*320;
    [...nodes].sort((a,b)=>(edgeMap.get(b.id)?.length||0)-(edgeMap.get(a.id)?.length||0)).forEach((node,index)=>{
      if(index===0){node.x=cx;node.y=cy;}else{const ring=Math.floor((index-1)/7);const slot=(index-1)%7;const count=Math.min(7,nodes.length-1-ring*7);const a=slot/Math.max(1,count)*Math.PI*2+ring*.31;const radius=105+ring*68;node.x=cx+Math.cos(a)*radius;node.y=cy+Math.sin(a)*radius;}
      node.radius=7+Math.min(5,(edgeMap.get(node.id)?.length||0)*.35);
    });
  });
}

export function mountCoreGraph(records){
  const graph=buildCoreGraph(records);
  const canvas=document.getElementById('graphCanvas');
  const stage=document.getElementById('graphStage');
  const detail=document.getElementById('graphDetail');
  const search=document.getElementById('graphSearch');
  const relationshipSelect=document.getElementById('graphRelationship');
  if(!canvas||!stage||!detail)return;

  document.getElementById('graphNodeCount').textContent=fmt(graph.nodes.length);
  document.getElementById('graphEdgeCount').textContent=fmt(graph.edges.length);
  detail.innerHTML=emptyDetail();

  const nodeById=new Map(graph.nodes.map((node)=>[node.id,node]));
  const edgeMap=new Map(graph.nodes.map((node)=>[node.id,[]]));
  graph.edges.forEach((edge)=>{const from=nodeById.get(edge.from);const to=nodeById.get(edge.to);if(!from||!to)return;edgeMap.get(from.id).push({edge,other:to});edgeMap.get(to.id).push({edge,other:from});});
  placeNodes(graph,edgeMap);

  const ctx=canvas.getContext('2d');
  let width=1,height=1,ratio=1,zoom=1,panX=0,panY=0;
  let selected=null,hovered=null,relationship='all',searchTerm='';
  let rightPanning=false,last=null;

  const worldToScreen=(x,y)=>({x:x*zoom+panX+width/2,y:y*zoom+panY+height/2});
  const screenToWorld=(x,y)=>({x:(x-panX-width/2)/zoom,y:(y-panY-height/2)/zoom});
  const visibleEdges=()=>relationship==='all'?graph.edges:graph.edges.filter((edge)=>edge.relationship===relationship);

  function updateCursor(){canvas.classList.toggle('is-over-node',Boolean(hovered)&&!rightPanning);canvas.classList.toggle('is-right-panning',rightPanning);}
  function resize(){const rect=stage.getBoundingClientRect();width=Math.max(320,rect.width);height=Math.max(420,rect.height);ratio=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;ctx.setTransform(ratio,0,0,ratio,0,0);draw();}
  function draw(){ctx.clearRect(0,0,width,height);ctx.save();ctx.lineCap='round';const connected=selected?new Set((edgeMap.get(selected.id)||[]).map(({other})=>other.id)):null;visibleEdges().forEach((edge)=>{const from=nodeById.get(edge.from);const to=nodeById.get(edge.to);if(!from||!to)return;const a=worldToScreen(from.x,from.y);const b=worldToScreen(to.x,to.y);const relation=graph.relationships[edge.relationship]||{color:'#aaa'};const active=selected&&(selected.id===from.id||selected.id===to.id);ctx.globalAlpha=selected?(active?.75:.06):.22;ctx.strokeStyle=relation.color;ctx.lineWidth=active?2:.9;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();});graph.nodes.forEach((node)=>{const point=worldToScreen(node.x,node.y);const matches=!searchTerm||node.name.toLowerCase().includes(searchTerm);const isConnected=!selected||selected.id===node.id||connected?.has(node.id);ctx.globalAlpha=matches&&isConnected?1:.12;ctx.fillStyle=COLORS[node.cluster]||'#888';ctx.beginPath();ctx.arc(point.x,point.y,node.radius*Math.max(.75,zoom),0,Math.PI*2);ctx.fill();if(selected?.id===node.id||hovered?.id===node.id){ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.stroke();}if(zoom>.68||selected?.id===node.id||hovered?.id===node.id||(searchTerm&&matches)){ctx.globalAlpha=matches&&isConnected?.96:.14;ctx.fillStyle='#171717';ctx.font=`${selected?.id===node.id?700:600} ${Math.max(10,Math.min(13,11*zoom))}px Inter, sans-serif`;ctx.fillText(node.name,point.x+node.radius*zoom+5,point.y+4);}});ctx.restore();}
  function nodeAt(clientX,clientY){const rect=canvas.getBoundingClientRect();const x=clientX-rect.left;const y=clientY-rect.top;let best=null;let distance=Infinity;graph.nodes.forEach((node)=>{const point=worldToScreen(node.x,node.y);const current=Math.hypot(point.x-x,point.y-y);if(current<=Math.max(12,node.radius*zoom+5)&&current<distance){best=node;distance=current;}});return best;}
  function selectNode(node,center=false){selected=node||null;detail.innerHTML=node?detailHtml(node,graph,edgeMap):emptyDetail();detail.querySelectorAll('[data-graph-node]').forEach((button)=>button.addEventListener('click',()=>selectNode(nodeById.get(button.dataset.graphNode),true)));if(node&&center){panX=-node.x*zoom;panY=-node.y*zoom;}draw();}
  function fitGraph(){if(!graph.nodes.length)return;const xs=graph.nodes.map((node)=>node.x);const ys=graph.nodes.map((node)=>node.y);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);const spanX=Math.max(1,maxX-minX),spanY=Math.max(1,maxY-minY);const cx=(minX+maxX)/2,cy=(minY+maxY)/2;zoom=Math.min(1.15,Math.max(.32,Math.min((width-120)/spanX,(height-120)/spanY)));panX=-cx*zoom;panY=-cy*zoom;draw();}

  canvas.addEventListener('contextmenu',(event)=>event.preventDefault());
  canvas.addEventListener('pointerdown',(event)=>{
    if(event.button===0){const node=nodeAt(event.clientX,event.clientY);selectNode(node||null);return;}
    if(event.button!==2)return;
    event.preventDefault();
    rightPanning=true;
    last={x:event.clientX,y:event.clientY};
    try{canvas.setPointerCapture(event.pointerId);}catch{}
    updateCursor();
  });
  canvas.addEventListener('pointermove',(event)=>{
    hovered=nodeAt(event.clientX,event.clientY);
    if(rightPanning&&last){panX+=event.clientX-last.x;panY+=event.clientY-last.y;last={x:event.clientX,y:event.clientY};}
    updateCursor();draw();
  });
  function endRightPan(event){if(event.button!==2&&rightPanning===false)return;rightPanning=false;last=null;try{canvas.releasePointerCapture(event.pointerId);}catch{}hovered=nodeAt(event.clientX,event.clientY);updateCursor();draw();}
  canvas.addEventListener('pointerup',endRightPan);
  canvas.addEventListener('pointercancel',()=>{rightPanning=false;last=null;updateCursor();draw();});
  canvas.addEventListener('pointerleave',()=>{if(!rightPanning){hovered=null;updateCursor();draw();}});
  canvas.addEventListener('dblclick',(event)=>{if(event.button!==0)return;const node=nodeAt(event.clientX,event.clientY);if(node)location.href=pageUrl(node.name);});
  canvas.addEventListener('wheel',(event)=>{event.preventDefault();const rect=canvas.getBoundingClientRect();const x=event.clientX-rect.left;const y=event.clientY-rect.top;const before=screenToWorld(x,y);zoom=Math.max(.28,Math.min(2.4,zoom*(event.deltaY>0?.9:1.1)));panX=x-width/2-before.x*zoom;panY=y-height/2-before.y*zoom;draw();},{passive:false});
  search?.addEventListener('input',()=>{searchTerm=search.value.toLowerCase().trim();const match=searchTerm?(graph.nodes.find((node)=>node.name.toLowerCase()===searchTerm)||graph.nodes.find((node)=>node.name.toLowerCase().startsWith(searchTerm))):null;if(match)selectNode(match,true);draw();});
  relationshipSelect?.addEventListener('change',()=>{relationship=relationshipSelect.value;draw();});
  document.getElementById('graphFit')?.addEventListener('click',fitGraph);
  document.getElementById('graphExport')?.addEventListener('click',()=>{const payload=JSON.stringify({nodes:graph.nodes.map(({x,y,radius,...node})=>node),edges:graph.edges},null,2);const url=URL.createObjectURL(new Blob([payload],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='core-graph.json';link.click();URL.revokeObjectURL(url);});

  const observer=new ResizeObserver(resize);observer.observe(stage);resize();requestAnimationFrame(fitGraph);updateCursor();
  return()=>observer.disconnect();
}
