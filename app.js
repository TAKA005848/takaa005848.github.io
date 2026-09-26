'use strict';
const $=id=>document.getElementById(id);
const wards=['新宿区','渋谷区','港区'];
const labels={cigarette:'紙巻き対応',heated:'加熱式対応'};
const categoryLabels={cafe:'カフェ/喫茶店',tea_cafe:'カフェ/喫茶店',cafe_bar:'カフェ/喫茶店・バー',cafe_lounge:'カフェ/喫茶店',cafe_restaurant:'カフェ/喫茶店・飲食店',restaurant:'飲食店',restaurant_bar:'飲食店・バー',bar:'バー',shisha:'シーシャ',shisha_bar:'シーシャ・バー',cafe_shisha:'カフェ/喫茶店・シーシャ'};
const modeLabels={seat:'席で吸える',booth:'喫煙ブース',mixed:'喫煙席＋ブース等',unknown:'喫煙方式：詳細不明'};
// Used only before data arrives or when a ward has no records.
const areaBounds={'新宿区':[[35.673,139.672],[35.731,139.747]],'渋谷区':[[35.640,139.661],[35.694,139.725]],'港区':[[35.621,139.708],[35.683,139.783]]};
let activeWard='新宿区';
let spots=[],filter='all',selected=null,lastMarker=null,locationMarker,accuracyCircle;
const map=L.map('map',{zoomControl:false,zoomSnap:0.25,trackResize:false});
L.control.zoom({position:'bottomright'}).addTo(map);
const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
// An inverse polygon leaves the selected ward's real geometry unmasked.
map.createPane('wardMask');
map.getPane('wardMask').style.zIndex='330';
map.getPane('wardMask').style.pointerEvents='none';
const outsideMask=L.polygon([],{pane:'wardMask',interactive:false,stroke:false,
 fillColor:'#fff',fillOpacity:0.75,fillRule:'evenodd',smoothFactor:0.5}).addTo(map);
let boundaryData=null;
let maskWard=null;

map.createPane('wardBoundaries');
map.getPane('wardBoundaries').style.zIndex='350';
map.getPane('wardBoundaries').style.pointerEvents='none';
function boundaryStyle(feature){
 const selected=feature.properties.ward===activeWard;
 return {color:selected?'#d63b12':'#8b9691',weight:selected?5:1.5,
  opacity:selected?1:0.35,fill:false};
}
const boundaryHalo=L.geoJSON(null,{pane:'wardBoundaries',interactive:false,
 style:{color:'#fff',weight:8,opacity:1,fill:false},smoothFactor:0.5}).addTo(map);
const boundaries=L.geoJSON(null,{pane:'wardBoundaries',interactive:false,
 style:boundaryStyle,smoothFactor:0.5}).addTo(map);
function updateBoundaryFocus(){
 if(!boundaryData||maskWard===activeWard)return;
 maskWard=activeWard;
 const selectedFeatures=boundaryData.features.filter(f=>f.properties.ward===activeWard);
 const rings=selectedFeatures.flatMap(f=>f.geometry.type==='MultiPolygon'
  ?f.geometry.coordinates.flat():f.geometry.coordinates);
 // Even-odd fill preserves disconnected islands and any interior holes.
 outsideMask.setLatLngs([[[90,-360],[90,360],[-90,360],[-90,-360]],
  ...rings.map(ring=>ring.map(([lng,lat])=>[lat,lng]))]);
 boundaryHalo.clearLayers();
 boundaryHalo.addData({type:'FeatureCollection',features:selectedFeatures});
 boundaryHalo.bringToBack();
 boundaries.setStyle(boundaryStyle);
 boundaries.eachLayer(layer=>{if(layer.feature.properties.ward===activeWard)layer.bringToFront();});
}
fetch('./wards.geojson').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
 if(data.type!=='FeatureCollection'||!data.features.length||!data.features.every(f=>wards.includes(f.properties.ward)))throw Error();
 boundaryData=data;
 boundaries.addData(data);
 updateBoundaryFocus();
 map.attributionControl.addAttribution('行政界: <a href="https://github.com/geolonia/japanese-admins">国土数値情報・Geolonia加工</a>');
}).catch(()=>status('区境界を読み込めません。再読み込みしてください。'));
const markers=L.layerGroup().addTo(map);
function status(message){$('status').textContent=message;$('status').hidden=!message;}
tiles.on('tileerror',()=>status('地図を読み込めません。通信状態を確認して再読み込みしてください。'));
function visible(){return spots.filter(s=>s.ward===activeWard&&(filter==='all'||s.types.includes(filter)));}
function closeDetail(focus=false){$('detail').hidden=true;selected=null;if(focus&&lastMarker)lastMarker.getElement()?.focus();}
function show(s,m){
 selected=s.id;lastMarker=m;
 for(const key of ['name','address'])$(key).textContent=s[key];
 $('venue').textContent=categoryLabels[s.category];
 $('ward').textContent=s.area?`${s.ward} / ${s.area}`:s.ward;
 // Show only hours explicitly present in the existing record.
 const notedHours=s.notes.match(/(?:公式営業\s*|公式[:：]\s*)(24時間営業|\d{1,2}:\d{2}\s*[-–〜～]\s*\d{1,2}:\d{2})/);
 const hours=s.opening_hours&&s.opening_hours!=='unknown'?s.opening_hours:(notedHours?.[1]||'');
 $('hours').textContent=hours;$('hours').hidden=!hours;$('hours').previousElementSibling.hidden=!hours;
 const tags=[...(s.types.length?s.types.map(t=>labels[t]):['たばこの種類：詳細不明']),modeLabels[s.smoking_mode]];
 $('types').replaceChildren(...tags.map(t=>{const e=document.createElement('span');e.textContent=t;return e;}));
 $('detail').hidden=false;$('name').focus({preventScroll:true});map.panTo([s.lat,s.lng]);
}
function draw(){updateBoundaryFocus();markers.clearLayers();const list=visible();$('count').textContent=`${activeWard} · ${list.length} 件の店舗`;for(const s of list){
 const unknown=s.smoking_type==='unknown',heated=s.smoking_type==='heated';
 const typeLabel=({cigarette:'紙巻き対応',heated:'加熱式対応',both:'紙巻き・加熱式対応',unknown:'詳細不明'})[s.smoking_type];
 const title=`${s.name} / ${typeLabel} / ${modeLabels[s.smoking_mode]} / ${categoryLabels[s.category]}`;
 const m=L.marker([s.lat,s.lng],{title,alt:`${s.name}の詳細を表示`,icon:L.divIcon({className:'spot-marker',html:`<div class="pin ${heated?'heated':''}"${unknown?' style="background:#64716c"':''}><span>${unknown?'?':heated?'加':'紙'}</span></div><b class="venue-badge">店</b>`,iconSize:[38,38],iconAnchor:[19,38]})}).addTo(markers);
 m.getElement()?.setAttribute('aria-label',title);m.on('click',()=>show(s,m));
 }if(selected&&!list.some(s=>s.id===selected))closeDetail();if(!list.length)status('この種類に対応する掲載店舗はありません。');else status('');}
function fit(){
 const rect=$('map').getBoundingClientRect();
 if(rect.width<=0||rect.height<=0)return;
 // Leaflet must discard its cached size after a sidebar or viewport change.
 map.invalidateSize({pan:false,animate:false});
 const inset=32;
 let top=inset+12,bottom=inset;
 // Reserve only UI that actually overlaps the map. The desktop sidebar is
 // already excluded by the map container's measured width.
 for(const selector of ['.map-actions','.map-key','.controls']){
  const el=document.querySelector(selector);
  const r=el.getBoundingClientRect();
  if(!el.getClientRects().length||r.right<=rect.left||r.left>=rect.right||r.bottom<=rect.top||r.top>=rect.bottom)continue;
  if((r.top+r.bottom)/2<(rect.top+rect.bottom)/2)top=Math.max(top,r.bottom-rect.top+inset+12);
  else bottom=Math.max(bottom,rect.bottom-r.top+inset);
 }
 // Keep positive fitting space even in a very short window.
 const scale=Math.min(1,rect.height*0.7/(top+bottom));
 const x=Math.min(inset,rect.width*0.15);
 const shown=visible();
 const wardSpots=spots.filter(s=>s.ward===activeWard);
 const points=(shown.length?shown:wardSpots).map(s=>[s.lat,s.lng]);
 map.fitBounds(points.length?points:areaBounds[activeWard],{
  paddingTopLeft:[x,top*scale],paddingBottomRight:[x,bottom*scale],
  maxZoom:16,animate:false
 });
}
let fitFrame=0;
function scheduleFit(){
 cancelAnimationFrame(fitFrame);
 fitFrame=requestAnimationFrame(()=>{fitFrame=0;fit();});
}
// Observe the actual map, not just the window: this also covers sidebar changes.
new ResizeObserver(scheduleFit).observe($('map'));
window.addEventListener('resize',scheduleFit);
scheduleFit();
document.querySelectorAll('[data-area]').forEach(b=>b.addEventListener('click',()=>{activeWard=b.dataset.area;document.querySelectorAll('[data-area]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));closeDetail();draw();fit();}));
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));closeDetail();draw();fit();}));
$('close').onclick=()=>closeDetail(true);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDetail(true);});
$('locate').onclick=()=>{if(!navigator.geolocation){status('このブラウザは現在地の取得に対応していません。');return;}const b=$('locate');b.disabled=true;b.textContent='取得中…';status('');navigator.geolocation.getCurrentPosition(p=>{b.disabled=false;b.textContent='◎ 現在地';const point=[p.coords.latitude,p.coords.longitude];if(locationMarker)map.removeLayer(locationMarker);if(accuracyCircle)map.removeLayer(accuracyCircle);accuracyCircle=L.circle(point,{radius:p.coords.accuracy,color:'#2679d3',weight:1,fillOpacity:.08}).addTo(map);locationMarker=L.circleMarker(point,{radius:8,color:'#fff',weight:3,fillColor:'#2679d3',fillOpacity:1}).addTo(map).bindTooltip('現在地');closeDetail();map.setView(point,16);status('現在地を表示しました。ピンは選択中の区が対象です。区ボタンで戻れます。');},e=>{b.disabled=false;b.textContent='◎ 現在地';status(e.code===1?'位置情報が許可されていません。ブラウザの設定で許可してください。':e.code===3?'現在地の取得がタイムアウトしました。もう一度お試しください。':'現在地を取得できません。通信や位置情報の設定をご確認ください。');},{enableHighAccuracy:true,timeout:10000,maximumAge:60000});};
fetch('./spots.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
 if(!Array.isArray(data))throw Error();const ids=new Set();
 spots=data.filter(s=>s.status==='live'&&s.verification==='verified_current'&&s.dataset==='Production'&&s.category in categoryLabels);
 for(const s of spots){
  if(!['id','name','address','area','notes','source_smoking','checked_at'].every(k=>typeof s[k]==='string')||ids.has(s.id)||!wards.includes(s.ward)||!Number.isFinite(s.latitude)||!Number.isFinite(s.longitude)||Math.abs(s.latitude)>90||Math.abs(s.longitude)>180||!['unknown','both','heated','cigarette'].includes(s.smoking_type)||!(s.smoking_mode in modeLabels)||!/^https:\/\//.test(s.source_smoking))throw Error();
  ids.add(s.id);s.lat=s.latitude;s.lng=s.longitude;s.types=s.smoking_type==='both'?['cigarette','heated']:s.smoking_type==='unknown'?[]:[s.smoking_type];
 }draw();fit();
}).catch(()=>{$('count').textContent='読み込みエラー';status('店舗データを読み込めません。データと通信状態を確認して再読み込みしてください。');});
