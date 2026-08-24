const STORAGE_KEY = 'kway_trips_v1';
let currentFilter = 'active';
let currentTripId = null;
let currentSection = null;
let editingItemId = null;
let cloudUser = null;
let cloudUnsubscribe = null;
let cloudApplying = false;
let cloudReady = false;
let cloudInitialSnapshot = true;
let cloudSyncTimer = null;

const $ = (id) => document.getElementById(id);
const tripList = $('tripList');
const emptyState = $('emptyState');
const emptyText = $('emptyText');
const dialog = $('tripDialog');
const itemDialog = $('itemDialog');

const SECTION_META = {
  transport: { label:'Transport', icon:'✈️', empty:'Ajoute un vol, un train, un trajet en voiture…' },
  stays: { label:'Hébergements', icon:'🏨', empty:'Ajoute tes hôtels, Airbnb ou autres hébergements.' },
  activities: { label:'Activités', icon:'🎟️', empty:'Ajoute les visites, restaurants, spectacles et activités.' },
  car: { label:'Location de voiture', icon:'🚗', empty:'Ajoute les informations de ta location de voiture.' },
  itinerary: { label:'Programme', icon:'📅', empty:'Ajoute ton programme jour par jour avec horaires, adresses et billets.' },
  checklist: { label:'Checklist', icon:'✅', empty:'Ajoute ce que tu ne veux surtout pas oublier.' }
};

function loadTrips(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveTripsLocal(trips){ localStorage.setItem(STORAGE_KEY, JSON.stringify(trips)); }
function stripLocalOnlyData(trips){
  return trips.map(t=>{
    const copy=JSON.parse(JSON.stringify(t));
    delete copy.coverData;
    // Ticket metadata can sync, but the actual PDF/photo blobs remain in IndexedDB on each device.
    return copy;
  });
}
function mergeLocalMedia(cloudTrips,localTrips){
  const localById=new Map(localTrips.map(t=>[t.id,t]));
  return cloudTrips.map(t=>{
    const local=localById.get(t.id);
    return {...t, coverData:local?.coverData||''};
  });
}
function saveTrips(trips){
  saveTripsLocal(trips);
  if(!cloudApplying && cloudUser && window.KwayCloud){
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer=setTimeout(async ()=>{
      try{
        showSyncState('syncing');
        await window.KwayCloud.syncTrips(cloudUser.uid,stripLocalOnlyData(trips));
        showSyncState('ok');
      }catch(err){ console.error(err); showSyncState('error'); }
    },250);
  }
}
function uid(){ return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2)); }
function esc(v=''){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function sectionItems(t,key){ return Array.isArray(t.sections?.[key]) ? t.sections[key] : []; }
function formatDateRange(start,end){
  const f = new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric'});
  const s = new Date(start+'T12:00:00'); const e = new Date(end+'T12:00:00');
  if(Number.isNaN(s.getTime())||Number.isNaN(e.getTime())) return '';
  return `${f.format(s)} → ${f.format(e)}`;
}
function formatDate(v){
  if(!v) return '';
  const d = new Date(v+'T12:00:00');
  if(Number.isNaN(d.getTime())) return v;
  return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric'}).format(d);
}
function defaultCover(name=''){
  const hues = [[168,44,72],[202,45,65],[28,55,70],[278,31,70],[145,35,68]];
  const idx=[...name].reduce((a,c)=>a+c.charCodeAt(0),0)%hues.length;
  const [h,s,l]=hues[idx]; return `linear-gradient(135deg,hsl(${h} ${s}% ${l+12}%),hsl(${h} ${s}% ${l-15}%))`;
}

function mapsUrl(address){ return `https://maps.apple.com/?q=${encodeURIComponent(address||'')}`; }
function todayISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function daysUntil(date){ const a=new Date(todayISO()+'T12:00:00'),b=new Date(date+'T12:00:00'); return Math.ceil((b-a)/86400000); }
function countdownLabel(t){ const n=daysUntil(t.startDate); if(n>1)return `Départ dans ${n} jours`; if(n===1)return 'Départ demain'; if(n===0)return 'Départ aujourd’hui'; if(todayISO()<=t.endDate)return 'Voyage en cours'; return 'Voyage terminé'; }
async function imageFileToDataUrl(file){
  if(!file) return '';
  if(!file.type.startsWith('image/')) throw new Error('Choisis une image valide.');
  const raw=await new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=()=>reject(r.error); r.readAsDataURL(file); });
  const img=await new Promise((resolve,reject)=>{ const i=new Image(); i.onload=()=>resolve(i); i.onerror=reject; i.src=raw; });
  const max=1400, scale=Math.min(1,max/Math.max(img.width,img.height));
  const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(img.width*scale)); canvas.height=Math.max(1,Math.round(img.height*scale));
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',0.78);
}
function tripCoverValue(t){ return t?.coverData || t?.coverUrl || ''; }
function updateCoverPreview(src=''){
  const wrap=$('coverPreviewWrap'), img=$('coverPreview'); if(!wrap||!img) return;
  if(src){ img.src=src; wrap.classList.remove('hidden'); } else { img.removeAttribute('src'); wrap.classList.add('hidden'); }
}


function allDatedItems(t){
  const out=[];
  for(const key of ['transport','activities','itinerary']) for(const x of sectionItems(t,key)) if(x.date) out.push({...x,_section:key});
  return out.sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
}
function weatherCode(code){
  if(code===0) return '☀️ Dégagé'; if([1,2].includes(code)) return '🌤️ Éclaircies'; if(code===3) return '☁️ Couvert';
  if([45,48].includes(code)) return '🌫️ Brouillard'; if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '🌧️ Pluie';
  if([71,73,75,77,85,86].includes(code)) return '🌨️ Neige'; if([95,96,99].includes(code)) return '⛈️ Orage'; return '🌤️ Météo';
}
async function getWeatherForTrip(t){
  const place=(t.destinations||'').split(/[•,]/)[0].trim(); if(!place) throw new Error('Ajoute une destination au voyage.');
  const geo=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=fr&format=json`).then(r=>r.json());
  if(!geo.results?.length) throw new Error('Destination introuvable.');
  const g=geo.results[0];
  const w=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16`).then(r=>r.json());
  const rows=(w.daily?.time||[]).map((d,i)=>({date:d,code:w.daily.weather_code[i],max:w.daily.temperature_2m_max[i],min:w.daily.temperature_2m_min[i]}));
  return {place:g.name, rows:rows.filter(x=>x.date>=t.startDate && x.date<=t.endDate)};
}
function openTicketDB(){ return new Promise((resolve,reject)=>{ const r=indexedDB.open('kway_files_v1',1); r.onupgradeneeded=()=>r.result.createObjectStore('tickets',{keyPath:'id'}); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); }
async function saveTicket(id,file){ const db=await openTicketDB(); return new Promise((res,rej)=>{ const tx=db.transaction('tickets','readwrite'); tx.objectStore('tickets').put({id,name:file.name,type:file.type,blob:file}); tx.oncomplete=()=>res({id,name:file.name,type:file.type}); tx.onerror=()=>rej(tx.error); }); }
async function getTicket(id){ const db=await openTicketDB(); return new Promise((res,rej)=>{ const r=db.transaction('tickets').objectStore('tickets').get(id); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function deleteTicket(id){ const db=await openTicketDB(); return new Promise((res,rej)=>{ const tx=db.transaction('tickets','readwrite'); tx.objectStore('tickets').delete(id); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); }); }
function ticketMeta(item){ const list=Array.isArray(item.tickets)?item.tickets.slice():[]; if(item.ticketName&&!list.some(x=>x.id===item.id)) list.unshift({id:item.id,name:item.ticketName}); return list; }

function renderTrips(){
  const trips=loadTrips();
  const visible=trips.filter(t => currentFilter==='archived' ? t.archived : !t.archived).sort((a,b)=> new Date(a.startDate)-new Date(b.startDate));
  tripList.innerHTML='';
  emptyState.classList.toggle('hidden',visible.length>0);
  emptyText.textContent=currentFilter==='archived' ? 'Tes voyages archivés apparaîtront ici.' : 'Ajoute ton premier voyage pour commencer.';
  visible.forEach(t=>{
    const card=document.createElement('article'); card.className='trip-card travel-tile';
    const coverValue=tripCoverValue(t); const cover = coverValue ? `url("${coverValue.replace(/"/g,'%22')}")` : defaultCover(t.name);
    card.innerHTML=`
      <div class="trip-cover" style="background-image:${cover}">
        <span class="countdown-pill">${esc(countdownLabel(t))}</span>
        <div class="cover-copy"><h3>${esc(t.name)}</h3><p>${esc(formatDateRange(t.startDate,t.endDate))}</p>${t.destinations?`<small>📍 ${esc(t.destinations)}</small>`:''}</div>
      </div>
      <div class="trip-actions compact">
        <button class="small-btn primary" data-action="open" data-id="${t.id}">Ouvrir</button>
        <button class="small-btn" data-action="edit" data-id="${t.id}">Modifier</button>
        <button class="small-btn" data-action="archive" data-id="${t.id}">${t.archived?'Restaurer':'Archiver'}</button>
      </div>`;
    tripList.appendChild(card);
  });
}
function openForm(trip=null){
  $('formTitle').textContent=trip?'Modifier le voyage':'Nouveau voyage';
  $('tripId').value=trip?.id||'';
  $('tripName').value=trip?.name||'';
  $('startDate').value=trip?.startDate||'';
  $('endDate').value=trip?.endDate||'';
  $('destinations').value=trip?.destinations||'';
  $('tripNotes').value=trip?.notes||'';
  $('coverPhoto').value='';
  $('coverPhoto').dataset.remove='0';
  updateCoverPreview(tripCoverValue(trip));
  dialog.showModal();
}
function closeForm(){ dialog.close(); }

$('tripForm').addEventListener('submit',async (e)=>{
  e.preventDefault();
  const start=$('startDate').value,end=$('endDate').value;
  if(end<start){ alert('La date de fin doit être après la date de début.'); return; }
  const trips=loadTrips(); const id=$('tripId').value;
  const existing=trips.find(t=>t.id===id);
  let coverData=existing?.coverData||'';
  let coverUrl=existing?.coverUrl||'';
  if($('coverPhoto').dataset.remove==='1'){ coverData=''; coverUrl=''; }
  const photo=$('coverPhoto').files?.[0];
  if(photo){
    try{ coverData=await imageFileToDataUrl(photo); coverUrl=''; }
    catch(err){ alert(err?.message||'Impossible de lire cette photo.'); return; }
  }
  const trip={
    id:id||uid(), name:$('tripName').value.trim(), startDate:start, endDate:end,
    destinations:$('destinations').value.trim(), coverData, coverUrl, notes:$('tripNotes').value.trim(),
    sections:existing?.sections||{}, archived:existing?.archived||false, createdAt:existing?.createdAt||Date.now(), updatedAt:Date.now()
  };
  try{
    const next=existing?trips.map(t=>t.id===id?trip:t):[...trips,trip]; saveTrips(next); closeForm(); renderTrips();
    if(currentTripId===trip.id) showDetail(trip.id);
  }catch(err){ alert('La photo est trop volumineuse pour être enregistrée. Essaie une photo plus légère.'); }
});

function showDetail(id){
  const t=loadTrips().find(x=>x.id===id); if(!t) return;
  currentTripId=id; currentSection=null;
  $('homeView').classList.remove('active'); $('detailView').classList.add('active');
  const coverValue=tripCoverValue(t); const cover=coverValue?`url("${coverValue.replace(/"/g,'%22')}")`:defaultCover(t.name);
  const sectionButtons=Object.entries(SECTION_META).map(([key,m])=>{
    const count=sectionItems(t,key).length;
    return `<button class="menu-item" data-section="${key}"><span>${m.icon}</span><strong>${m.label}</strong>${count?`<em>${count}</em>`:''}</button>`;
  }).join('');
  $('detailContent').innerHTML=`
    <div class="detail-hero" style="background-image:${cover}">
      <div class="detail-overlay"><h2>${esc(t.name)}</h2><p>${esc(formatDateRange(t.startDate,t.endDate))}${t.destinations?` · ${esc(t.destinations)}`:''}</p></div>
    </div>
    <div class="journey-status"><span>${esc(countdownLabel(t))}</span><strong>${esc(t.destinations||'Ton prochain voyage')}</strong></div>
    <div class="section-card quick-grid"><button class="feature-btn mint" data-feature="today"><span>☀️</span><strong>Aujourd’hui</strong><small>Mon planning du jour</small></button><button class="feature-btn sky" data-feature="weather"><span>🌤️</span><strong>Météo</strong><small>Prévisions du séjour</small></button></div>
    <div class="section-card"><div class="card-heading"><div><div class="eyebrow">ACCÈS RAPIDE</div><h3>Organiser le voyage</h3></div></div><div class="menu-grid">${sectionButtons}</div></div>
    ${t.notes?`<div class="section-card"><h3>Notes</h3><div class="note-box">${esc(t.notes)}</div></div>`:''}
    <div class="detail-actions">
      <button class="small-btn primary" data-detail="edit">Modifier</button>
      <button class="small-btn" data-detail="archive">${t.archived?'Restaurer':'Archiver ce voyage'}</button>
      <button class="small-btn danger" data-detail="delete">Supprimer</button>
    </div>`;
}

function showSection(key){
  const t=loadTrips().find(x=>x.id===currentTripId); if(!t || !SECTION_META[key]) return;
  currentSection=key;
  const meta=SECTION_META[key];
  const items=sectionItems(t,key);
  const cards=items.length ? items.map(item=>renderItemCard(key,item)).join('') : `<div class="sub-empty"><div>${meta.icon}</div><p>${meta.empty}</p></div>`;
  $('detailContent').innerHTML=`
    <button class="back-btn" data-section-back>← ${esc(t.name)}</button>
    <div class="section-title-row"><div><div class="eyebrow">${meta.icon} ${meta.label.toUpperCase()}</div><h2>${meta.label}</h2></div><button class="round-btn mini" data-add-item>+</button></div>
    <div class="item-list">${cards}</div>`;
}

function renderItemCard(key,item){
  if(key==='checklist'){
    return `<article class="item-card checklist-card ${item.done?'done':''}">
      <button class="check-toggle" data-toggle-item="${item.id}" aria-label="Terminer">${item.done?'✓':''}</button>
      <div class="item-main"><h3>${esc(item.title)}</h3>${item.notes?`<p>${esc(item.notes)}</p>`:''}</div>
      <button class="more-btn" data-edit-item="${item.id}">✎</button>
    </article>`;
  }
  const lines=[];
  if(item.date) lines.push(formatDate(item.date)+(item.time?` · ${esc(item.time)}`:''));
  if(item.startDate || item.endDate) lines.push([item.startDate?formatDate(item.startDate):'',item.endDate?formatDate(item.endDate):''].filter(Boolean).join(' → '));
  if(item.from || item.to) lines.push([item.from,item.to].filter(Boolean).map(esc).join(' → '));
  if(item.location) lines.push(`📍 ${esc(item.location)}`);
  if(item.address) lines.push(`📍 ${esc(item.address)}`);
  if(item.company) lines.push(esc(item.company));
  if(item.reference) lines.push(`Réf. ${esc(item.reference)}`);
  if(item.details) lines.push(esc(item.details));
  if(item.duration) lines.push(`⏱️ ${esc(item.duration)}`);
  if(item.notes) lines.push(esc(item.notes));
  return `<article class="item-card">
    <div class="item-main"><h3>${esc(item.title||'Sans titre')}</h3>${lines.map(x=>`<p>${x}</p>`).join('')}</div>
    <div class="item-links">${(item.address||item.to)?`<a class="small-btn" href="${mapsUrl(item.address||item.to)}" target="_blank">🗺️ Plans</a>`:''}${ticketMeta(item).map((t,i)=>`<button class="small-btn ticket-chip" data-ticket="${t.id}" title="${esc(t.name||'Billet')}">🎫 ${ticketMeta(item).length>1?`Billet ${i+1}`:'Billet'}</button>`).join('')}</div>
    <div class="item-actions"><button class="more-btn" data-edit-item="${item.id}">✎</button><button class="more-btn danger-text" data-delete-item="${item.id}">×</button></div>
  </article>`;
}

function fieldHtml(type,label,id,value='',extra=''){
  if(type==='textarea') return `<label>${label}<textarea id="${id}" rows="3" ${extra}>${esc(value)}</textarea></label>`;
  if(type==='select') return `<label>${label}<select id="${id}" ${extra}>${value}</select></label>`;
  return `<label>${label}<input id="${id}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}

function openItemForm(key,item=null){
  currentSection=key; editingItemId=item?.id||null;
  const m=SECTION_META[key];
  $('itemFormTitle').textContent=item?`Modifier · ${m.label}`:`Ajouter · ${m.label}`;
  $('itemFormFields').innerHTML=getFieldsForSection(key,item||{});
  itemDialog.showModal();
}
function closeItemForm(){ itemDialog.close(); editingItemId=null; }

function getFieldsForSection(key,item){
  if(key==='transport') return [
    fieldHtml('text','Transport / trajet','itemTitle',item.title||'','required placeholder="Ex. Vol Paris → Montréal"'),
    fieldHtml('text','Compagnie / opérateur','itemCompany',item.company||'','placeholder="Air Canada, SNCF…"'),
    `<div class="two-cols">${fieldHtml('text','Départ','itemFrom',item.from||'','placeholder="Paris CDG"')}${fieldHtml('text','Arrivée','itemTo',item.to||'','placeholder="Montréal YUL"')}</div>`,
    `<div class="two-cols">${fieldHtml('date','Date','itemDate',item.date||'')}${fieldHtml('time','Heure','itemTime',item.time||'')}</div>`,
    fieldHtml('text','Numéro / référence','itemReference',item.reference||'','placeholder="Vol, train ou réservation"'),
    fieldHtml('text','Durée estimée','itemDuration',item.duration||'','placeholder="Ex. 1 h 25"'),
    fieldHtml('textarea','Notes','itemNotes',item.notes||'','placeholder="Terminal, bagages, siège…"')
  ].join('');
  if(key==='stays') return [
    fieldHtml('text','Nom de l’hébergement','itemTitle',item.title||'','required placeholder="Ex. Town Inn Suites"'),
    fieldHtml('text','Adresse','itemAddress',item.address||'','placeholder="Adresse ou quartier"'),
    `<div class="two-cols">${fieldHtml('date','Arrivée','itemStartDate',item.startDate||'')}${fieldHtml('date','Départ','itemEndDate',item.endDate||'')}</div>`,
    fieldHtml('text','Référence de réservation','itemReference',item.reference||''),
    fieldHtml('textarea','Notes','itemNotes',item.notes||'','placeholder="Petit-déjeuner, parking, check-in…"')
  ].join('');
  if(key==='activities') return [
    fieldHtml('text','Activité','itemTitle',item.title||'','required placeholder="Ex. Match NBA"'),
    `<div class="two-cols">${fieldHtml('date','Date','itemDate',item.date||'')}${fieldHtml('time','Heure','itemTime',item.time||'')}</div>`,
    fieldHtml('text','Lieu','itemLocation',item.location||'','placeholder="Scotiabank Arena"'),
    fieldHtml('text','Référence / billet','itemReference',item.reference||''),
    fieldHtml('textarea','Notes','itemNotes',item.notes||'')
  ].join('');
  if(key==='car') return [
    fieldHtml('text','Location','itemTitle',item.title||'','required placeholder="Ex. Voiture Toronto → Cleveland"'),
    fieldHtml('text','Loueur','itemCompany',item.company||'','placeholder="Thrifty, Hertz…"'),
    `<div class="two-cols">${fieldHtml('text','Prise en charge','itemFrom',item.from||'')}${fieldHtml('text','Retour','itemTo',item.to||'')}</div>`,
    `<div class="two-cols">${fieldHtml('date','Date de prise en charge','itemStartDate',item.startDate||'')}${fieldHtml('date','Date de retour','itemEndDate',item.endDate||'')}</div>`,
    fieldHtml('text','Référence de réservation','itemReference',item.reference||''),
    fieldHtml('textarea','Notes','itemNotes',item.notes||'','placeholder="Assurance, frontière, modèle…"')
  ].join('');
  if(key==='itinerary') return [
    fieldHtml('text','Activité / étape','itemTitle',item.title||'','required placeholder="Ex. Visite de Nausicaá"'),
    `<div class="two-cols">${fieldHtml('date','Date','itemDate',item.date||'')}${fieldHtml('time','Heure','itemTime',item.time||'')}</div>`,
    fieldHtml('text','Adresse','itemAddress',item.address||'','placeholder="Adresse complète"'),
    fieldHtml('text','Lien / réservation','itemReference',item.reference||'','placeholder="Numéro ou lien facultatif"'),
    `<label>Billets & documents <input id="itemTickets" type="file" accept="application/pdf,image/*" multiple><small>${ticketMeta(item).length?`${ticketMeta(item).length} document(s) déjà enregistré(s). Tu peux en ajouter d’autres.`:'Tu peux sélectionner plusieurs PDF ou photos. Ils restent uniquement sur cet appareil.'}</small></label>`,
    fieldHtml('textarea','Notes','itemNotes',item.notes||'','placeholder="Informations utiles…"')
  ].join('');
  if(key==='checklist') return [
    fieldHtml('text','À ne pas oublier','itemTitle',item.title||'','required placeholder="Ex. Faire l’AVE"'),
    fieldHtml('textarea','Note','itemNotes',item.notes||'')
  ].join('');
  return '';
}

function collectItem(key,existing){
  const val=id=>$(id)?.value?.trim?.()||'';
  const base={id:existing?.id||uid(),title:val('itemTitle'),updatedAt:Date.now(),createdAt:existing?.createdAt||Date.now()};
  if(key==='transport') return {...base,company:val('itemCompany'),from:val('itemFrom'),to:val('itemTo'),date:val('itemDate'),time:val('itemTime'),reference:val('itemReference'),duration:val('itemDuration'),notes:val('itemNotes')};
  if(key==='stays') return {...base,address:val('itemAddress'),startDate:val('itemStartDate'),endDate:val('itemEndDate'),reference:val('itemReference'),notes:val('itemNotes')};
  if(key==='activities') return {...base,date:val('itemDate'),time:val('itemTime'),location:val('itemLocation'),reference:val('itemReference'),notes:val('itemNotes')};
  if(key==='car') return {...base,company:val('itemCompany'),from:val('itemFrom'),to:val('itemTo'),startDate:val('itemStartDate'),endDate:val('itemEndDate'),reference:val('itemReference'),notes:val('itemNotes')};
  if(key==='itinerary') return {...base,date:val('itemDate'),time:val('itemTime'),address:val('itemAddress'),reference:val('itemReference'),notes:val('itemNotes'),tickets:ticketMeta(existing||{}),ticketName:existing?.ticketName||''};
  if(key==='checklist') return {...base,notes:val('itemNotes'),done:existing?.done||false};
  return base;
}

$('itemForm').addEventListener('submit',async (e)=>{
  e.preventDefault();
  const trips=loadTrips(); const trip=trips.find(t=>t.id===currentTripId); if(!trip) return;
  const items=sectionItems(trip,currentSection); const existing=items.find(x=>x.id===editingItemId);
  const item=collectItem(currentSection,existing);
  if(currentSection==='itinerary'){
    const files=Array.from($('itemTickets')?.files||[]);
    if(files.length){
      const added=[];
      for(const f of files){ const fid=uid(); await saveTicket(fid,f); added.push({id:fid,name:f.name,type:f.type}); }
      item.tickets=[...ticketMeta(existing||{}),...added];
      item.ticketName='';
    }
  }
  const nextItems=existing?items.map(x=>x.id===existing.id?item:x):[...items,item];
  const updated={...trip,sections:{...(trip.sections||{}),[currentSection]:nextItems},updatedAt:Date.now()};
  saveTrips(trips.map(t=>t.id===trip.id?updated:t)); closeItemForm(); showSection(currentSection);
});

tripList.addEventListener('click',(e)=>{
  const b=e.target.closest('button[data-action]'); if(!b) return; const {action,id}=b.dataset;
  const trips=loadTrips(), trip=trips.find(t=>t.id===id); if(!trip) return;
  if(action==='open') showDetail(id);
  if(action==='edit') openForm(trip);
  if(action==='archive'){ saveTrips(trips.map(t=>t.id===id?{...t,archived:!t.archived,updatedAt:Date.now()}:t)); renderTrips(); }
});

$('detailContent').addEventListener('click',async (e)=>{
  const feature=e.target.closest('[data-feature]');
  if(feature){
    const t=loadTrips().find(x=>x.id===currentTripId); if(!t) return;
    if(feature.dataset.feature==='today'){
      const day=todayISO(); const items=allDatedItems(t).filter(x=>x.date===day);
      $('detailContent').innerHTML=`<button class="back-btn" data-section-back>← ${esc(t.name)}</button><div class="section-title-row"><div><div class="eyebrow">☀️ AUJOURD’HUI</div><h2>${formatDate(day)}</h2></div></div>${items.length?`<div class="item-list">${items.map(x=>renderItemCard(x._section,x)).join('')}</div>`:`<div class="sub-empty"><div>🧳</div><p>${day<t.startDate?'Le voyage n’a pas encore commencé.':day>t.endDate?'Ce voyage est terminé.':'Rien de prévu aujourd’hui.'}</p></div>`}`;
    } else {
      $('detailContent').innerHTML=`<button class="back-btn" data-section-back>← ${esc(t.name)}</button><div class="section-title-row"><div><div class="eyebrow">🌤️ MÉTÉO</div><h2>Pendant le voyage</h2></div></div><div class="sub-empty"><div>⏳</div><p>Chargement de la météo…</p></div>`;
      try{ const w=await getWeatherForTrip(t); $('detailContent').innerHTML=`<button class="back-btn" data-section-back>← ${esc(t.name)}</button><div class="section-title-row"><div><div class="eyebrow">🌤️ MÉTÉO · ${esc(w.place)}</div><h2>Pendant le voyage</h2></div></div>${w.rows.length?`<div class="weather-grid">${w.rows.map(x=>`<article class="weather-card"><strong>${formatDate(x.date)}</strong><span>${weatherCode(x.code)}</span><b>${Math.round(x.max)}°</b><small>${Math.round(x.min)}° min.</small></article>`).join('')}</div>`:`<div class="sub-empty"><div>📅</div><p>Les prévisions détaillées ne sont pas encore disponibles pour ces dates. Reviens à l’approche du voyage.</p></div>`}`; }catch(err){ $('detailContent').innerHTML+=`<p class="error-box">${esc(err.message)}</p>`; }
    }
    return;
  }
  const ticketBtn=e.target.closest('[data-ticket]');
  if(ticketBtn){ const f=await getTicket(ticketBtn.dataset.ticket); if(!f){ alert('Billet introuvable sur cet appareil.'); return; } const url=URL.createObjectURL(f.blob); window.open(url,'_blank'); setTimeout(()=>URL.revokeObjectURL(url),60000); return; }
  const sectionBtn=e.target.closest('[data-section]');
  if(sectionBtn){ showSection(sectionBtn.dataset.section); return; }
  if(e.target.closest('[data-section-back]')){ showDetail(currentTripId); return; }
  if(e.target.closest('[data-add-item]')){ openItemForm(currentSection); return; }
  const editBtn=e.target.closest('[data-edit-item]');
  if(editBtn){
    const trip=loadTrips().find(t=>t.id===currentTripId); const item=sectionItems(trip,currentSection).find(x=>x.id===editBtn.dataset.editItem); if(item) openItemForm(currentSection,item); return;
  }
  const delBtn=e.target.closest('[data-delete-item]');
  if(delBtn){
    const trips=loadTrips(); const trip=trips.find(t=>t.id===currentTripId); if(!trip) return;
    if(confirm('Supprimer cet élément ?')){
      if(currentSection==='itinerary'){ const doomed=sectionItems(trip,currentSection).find(x=>x.id===delBtn.dataset.deleteItem); for(const tk of ticketMeta(doomed||{})) deleteTicket(tk.id).catch(()=>{}); }
      const next=sectionItems(trip,currentSection).filter(x=>x.id!==delBtn.dataset.deleteItem);
      const updated={...trip,sections:{...(trip.sections||{}),[currentSection]:next}};
      saveTrips(trips.map(t=>t.id===trip.id?updated:t)); showSection(currentSection);
    }
    return;
  }
  const toggleBtn=e.target.closest('[data-toggle-item]');
  if(toggleBtn){
    const trips=loadTrips(); const trip=trips.find(t=>t.id===currentTripId); if(!trip) return;
    const next=sectionItems(trip,'checklist').map(x=>x.id===toggleBtn.dataset.toggleItem?{...x,done:!x.done}:x);
    const updated={...trip,sections:{...(trip.sections||{}),checklist:next}};
    saveTrips(trips.map(t=>t.id===trip.id?updated:t)); showSection('checklist'); return;
  }
  const b=e.target.closest('button[data-detail]'); if(!b) return;
  const trips=loadTrips(), trip=trips.find(t=>t.id===currentTripId); if(!trip) return;
  if(b.dataset.detail==='edit') openForm(trip);
  if(b.dataset.detail==='archive'){
    saveTrips(trips.map(t=>t.id===trip.id?{...t,archived:!t.archived,updatedAt:Date.now()}:t));
    showDetail(trip.id);
  }
  if(b.dataset.detail==='delete'){
    if(confirm(`Supprimer définitivement « ${trip.name} » ?`)){
      saveTrips(trips.filter(t=>t.id!==trip.id)); currentTripId=null; $('detailView').classList.remove('active'); $('homeView').classList.add('active'); renderTrips();
    }
  }
});

[...document.querySelectorAll('.segment')].forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.segment').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); currentFilter=btn.dataset.filter; renderTrips();
}));
$('newTripBtn').addEventListener('click',()=>openForm()); $('emptyAddBtn').addEventListener('click',()=>openForm());
$('closeDialogBtn').addEventListener('click',closeForm); $('cancelBtn').addEventListener('click',closeForm);
$('closeItemDialogBtn').addEventListener('click',closeItemForm); $('cancelItemBtn').addEventListener('click',closeItemForm);
$('backBtn').addEventListener('click',()=>{currentTripId=null;currentSection=null;$('detailView').classList.remove('active');$('homeView').classList.add('active');renderTrips();});
$('coverPhoto').addEventListener('change',async ()=>{
  const f=$('coverPhoto').files?.[0]; if(!f) return;
  try{ updateCoverPreview(await imageFileToDataUrl(f)); $('coverPhoto').dataset.remove='0'; }catch(err){ alert(err?.message||'Impossible de lire cette photo.'); $('coverPhoto').value=''; }
});
$('removeCoverBtn').addEventListener('click',()=>{ $('coverPhoto').value=''; $('coverPhoto').dataset.remove='1'; updateCoverPreview(''); });



function humanAuthError(err){
  const code=err?.code||'';
  if(code.includes('invalid-credential')||code.includes('wrong-password')) return 'Adresse e-mail ou mot de passe incorrect.';
  if(code.includes('email-already-in-use')) return 'Un compte existe déjà avec cette adresse e-mail.';
  if(code.includes('weak-password')) return 'Le mot de passe doit contenir au moins 6 caractères.';
  if(code.includes('invalid-email')) return 'Cette adresse e-mail n’est pas valide.';
  if(code.includes('too-many-requests')) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  return err?.message||'Une erreur est survenue.';
}
function showSyncState(state){
  const btn=$('accountBtn'); const toast=$('syncToast');
  if(!btn) return;
  if(!cloudUser){ btn.textContent='Compte'; btn.classList.remove('synced'); return; }
  if(state==='syncing'){ btn.textContent='☁️ …'; }
  else if(state==='error'){ btn.textContent='☁️ !'; }
  else { btn.textContent='☁️'; btn.classList.add('synced'); if(toast){ toast.textContent='☁️ Synchronisé'; toast.classList.remove('hidden'); setTimeout(()=>toast.classList.add('hidden'),1400); } }
}
function updateAccountUi(user){
  cloudUser=user||null;
  const out=$('authLoggedOut'), inside=$('authLoggedIn');
  if(user){
    out?.classList.add('hidden'); inside?.classList.remove('hidden');
    if($('accountEmail')) $('accountEmail').textContent=user.email||'Compte Kway';
    showSyncState('ok');
  }else{
    inside?.classList.add('hidden'); out?.classList.remove('hidden');
    if($('accountBtn')){ $('accountBtn').textContent='Compte'; $('accountBtn').classList.remove('synced'); }
  }
}
async function connectCloudUser(user){
  updateAccountUi(user);
  if(cloudUnsubscribe){ cloudUnsubscribe(); cloudUnsubscribe=null; }
  if(!user){ cloudReady=false; renderTrips(); return; }
  cloudInitialSnapshot=true;
  const localAtLogin=loadTrips();
  cloudUnsubscribe=window.KwayCloud.subscribeTrips(user.uid,async cloudTrips=>{
    try{
      if(cloudInitialSnapshot){
        cloudInitialSnapshot=false;
        if(cloudTrips.length===0 && localAtLogin.length>0){
          showSyncState('syncing');
          await window.KwayCloud.syncTrips(user.uid,stripLocalOnlyData(localAtLogin));
          cloudReady=true; showSyncState('ok'); return;
        }
      }
      cloudApplying=true;
      const merged=mergeLocalMedia(cloudTrips,loadTrips());
      saveTripsLocal(merged);
      cloudApplying=false;
      cloudReady=true;
      renderTrips();
      if(currentTripId){ const exists=merged.some(t=>t.id===currentTripId); if(exists) showDetail(currentTripId); }
      showSyncState('ok');
    }catch(err){ cloudApplying=false; console.error(err); showSyncState('error'); }
  },err=>{ console.error(err); showSyncState('error'); });
}
function initCloud(){
  if(!window.KwayCloud) return;
  window.KwayCloud.onUser(connectCloudUser);
}
if(window.KwayCloud) initCloud(); else window.addEventListener('kway-cloud-ready',initCloud,{once:true});

$('accountBtn')?.addEventListener('click',()=>{ updateAccountUi(cloudUser); $('authError')?.classList.add('hidden'); $('authDialog').showModal(); });
$('closeAuthBtn')?.addEventListener('click',()=>$('authDialog').close());
$('authForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); if(cloudUser) return;
  const email=$('authEmail').value.trim(), password=$('authPassword').value;
  const box=$('authError'); box.classList.add('hidden');
  try{ await window.KwayCloud.login(email,password); $('authDialog').close(); }
  catch(err){ box.textContent=humanAuthError(err); box.classList.remove('hidden'); }
});
$('registerBtn')?.addEventListener('click',async ()=>{
  const email=$('authEmail').value.trim(), password=$('authPassword').value;
  const box=$('authError'); box.classList.add('hidden');
  if(!email||password.length<6){ box.textContent='Entre une adresse e-mail et un mot de passe d’au moins 6 caractères.'; box.classList.remove('hidden'); return; }
  try{ await window.KwayCloud.register(email,password); $('authDialog').close(); }
  catch(err){ box.textContent=humanAuthError(err); box.classList.remove('hidden'); }
});
$('logoutBtn')?.addEventListener('click',async ()=>{ if(window.KwayCloud) await window.KwayCloud.logout(); $('authDialog').close(); });

if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{})); }
renderTrips();
