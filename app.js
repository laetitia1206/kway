const STORAGE_KEY = 'kway_trips_v1';
let currentFilter = 'active';
let currentTripId = null;
let currentSection = null;
let editingItemId = null;

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
  itinerary: { label:'Itinéraire', icon:'🗺️', empty:'Ajoute les étapes de ton programme jour par jour.' },
  checklist: { label:'Checklist', icon:'✅', empty:'Ajoute ce que tu ne veux surtout pas oublier.' }
};

function loadTrips(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveTrips(trips){ localStorage.setItem(STORAGE_KEY, JSON.stringify(trips)); }
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

function renderTrips(){
  const trips=loadTrips();
  const visible=trips.filter(t => currentFilter==='archived' ? t.archived : !t.archived).sort((a,b)=> new Date(a.startDate)-new Date(b.startDate));
  tripList.innerHTML='';
  emptyState.classList.toggle('hidden',visible.length>0);
  emptyText.textContent=currentFilter==='archived' ? 'Tes voyages archivés apparaîtront ici.' : 'Ajoute ton premier voyage pour commencer.';
  visible.forEach(t=>{
    const card=document.createElement('article'); card.className='trip-card';
    const cover = t.coverUrl ? `url("${esc(t.coverUrl)}")` : defaultCover(t.name);
    card.innerHTML=`
      <div class="trip-cover" style="background-image:${cover}"></div>
      <div class="trip-body">
        <div class="trip-title-row">
          <div><h3 class="trip-title">${esc(t.name)}</h3><div class="trip-dates">${esc(formatDateRange(t.startDate,t.endDate))}</div></div>
          ${t.archived?'<span class="badge">Archivé</span>':''}
        </div>
        ${t.destinations?`<div class="trip-dest">📍 ${esc(t.destinations)}</div>`:''}
        <div class="trip-actions">
          <button class="small-btn primary" data-action="open" data-id="${t.id}">Ouvrir</button>
          <button class="small-btn" data-action="edit" data-id="${t.id}">Modifier</button>
          <button class="small-btn" data-action="archive" data-id="${t.id}">${t.archived?'Restaurer':'Archiver'}</button>
        </div>
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
  $('coverUrl').value=trip?.coverUrl||'';
  $('tripNotes').value=trip?.notes||'';
  dialog.showModal();
}
function closeForm(){ dialog.close(); }

$('tripForm').addEventListener('submit',(e)=>{
  e.preventDefault();
  const start=$('startDate').value,end=$('endDate').value;
  if(end<start){ alert('La date de fin doit être après la date de début.'); return; }
  const trips=loadTrips(); const id=$('tripId').value;
  const existing=trips.find(t=>t.id===id);
  const trip={
    id:id||uid(), name:$('tripName').value.trim(), startDate:start, endDate:end,
    destinations:$('destinations').value.trim(), coverUrl:$('coverUrl').value.trim(), notes:$('tripNotes').value.trim(),
    sections:existing?.sections||{}, archived:existing?.archived||false, createdAt:existing?.createdAt||Date.now(), updatedAt:Date.now()
  };
  const next=existing?trips.map(t=>t.id===id?trip:t):[...trips,trip]; saveTrips(next); closeForm(); renderTrips();
  if(currentTripId===trip.id) showDetail(trip.id);
});

function showDetail(id){
  const t=loadTrips().find(x=>x.id===id); if(!t) return;
  currentTripId=id; currentSection=null;
  $('homeView').classList.remove('active'); $('detailView').classList.add('active');
  const cover=t.coverUrl?`url("${esc(t.coverUrl)}")`:defaultCover(t.name);
  const sectionButtons=Object.entries(SECTION_META).map(([key,m])=>{
    const count=sectionItems(t,key).length;
    return `<button class="menu-item" data-section="${key}"><span>${m.icon}</span><strong>${m.label}</strong>${count?`<em>${count}</em>`:''}</button>`;
  }).join('');
  $('detailContent').innerHTML=`
    <div class="detail-hero" style="background-image:${cover}">
      <div class="detail-overlay"><h2>${esc(t.name)}</h2><p>${esc(formatDateRange(t.startDate,t.endDate))}${t.destinations?` · ${esc(t.destinations)}`:''}</p></div>
    </div>
    <div class="section-card"><h3>Organiser le voyage</h3><div class="menu-grid">${sectionButtons}</div></div>
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
  if(item.notes) lines.push(esc(item.notes));
  return `<article class="item-card">
    <div class="item-main"><h3>${esc(item.title||'Sans titre')}</h3>${lines.map(x=>`<p>${x}</p>`).join('')}</div>
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
    fieldHtml('text','Étape / programme','itemTitle',item.title||'','required placeholder="Ex. Jour 3 · Ottawa"'),
    fieldHtml('date','Date','itemDate',item.date||''),
    fieldHtml('textarea','Programme','itemDetails',item.details||'','placeholder="Matin, midi, après-midi…"')
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
  if(key==='transport') return {...base,company:val('itemCompany'),from:val('itemFrom'),to:val('itemTo'),date:val('itemDate'),time:val('itemTime'),reference:val('itemReference'),notes:val('itemNotes')};
  if(key==='stays') return {...base,address:val('itemAddress'),startDate:val('itemStartDate'),endDate:val('itemEndDate'),reference:val('itemReference'),notes:val('itemNotes')};
  if(key==='activities') return {...base,date:val('itemDate'),time:val('itemTime'),location:val('itemLocation'),reference:val('itemReference'),notes:val('itemNotes')};
  if(key==='car') return {...base,company:val('itemCompany'),from:val('itemFrom'),to:val('itemTo'),startDate:val('itemStartDate'),endDate:val('itemEndDate'),reference:val('itemReference'),notes:val('itemNotes')};
  if(key==='itinerary') return {...base,date:val('itemDate'),details:val('itemDetails')};
  if(key==='checklist') return {...base,notes:val('itemNotes'),done:existing?.done||false};
  return base;
}

$('itemForm').addEventListener('submit',(e)=>{
  e.preventDefault();
  const trips=loadTrips(); const trip=trips.find(t=>t.id===currentTripId); if(!trip) return;
  const items=sectionItems(trip,currentSection); const existing=items.find(x=>x.id===editingItemId);
  const item=collectItem(currentSection,existing);
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

$('detailContent').addEventListener('click',(e)=>{
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

if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{})); }
renderTrips();
