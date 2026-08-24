const STORAGE_KEY = 'kway_trips_v1';
let currentFilter = 'active';
let currentTripId = null;

const $ = (id) => document.getElementById(id);
const tripList = $('tripList');
const emptyState = $('emptyState');
const emptyText = $('emptyText');
const dialog = $('tripDialog');

function loadTrips(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveTrips(trips){ localStorage.setItem(STORAGE_KEY, JSON.stringify(trips)); }
function uid(){ return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2)); }
function esc(v=''){ return v.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function formatDateRange(start,end){
  const f = new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric'});
  const s = new Date(start+'T12:00:00'); const e = new Date(end+'T12:00:00');
  if(Number.isNaN(s.getTime())||Number.isNaN(e.getTime())) return '';
  return `${f.format(s)} → ${f.format(e)}`;
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
    archived:existing?.archived||false, createdAt:existing?.createdAt||Date.now(), updatedAt:Date.now()
  };
  const next=existing?trips.map(t=>t.id===id?trip:t):[...trips,trip]; saveTrips(next); closeForm(); renderTrips();
  if(currentTripId===trip.id) showDetail(trip.id);
});

function showDetail(id){
  const t=loadTrips().find(x=>x.id===id); if(!t) return;
  currentTripId=id; $('homeView').classList.remove('active'); $('detailView').classList.add('active');
  const cover=t.coverUrl?`url("${esc(t.coverUrl)}")`:defaultCover(t.name);
  $('detailContent').innerHTML=`
    <div class="detail-hero" style="background-image:${cover}">
      <div class="detail-overlay"><h2>${esc(t.name)}</h2><p>${esc(formatDateRange(t.startDate,t.endDate))}${t.destinations?` · ${esc(t.destinations)}`:''}</p></div>
    </div>
    <div class="section-card"><h3>Organiser le voyage</h3><div class="menu-grid">
      <div class="menu-item"><span>✈️</span>Transport</div><div class="menu-item"><span>🏨</span>Hébergements</div>
      <div class="menu-item"><span>🎟️</span>Activités</div><div class="menu-item"><span>🚗</span>Location de voiture</div>
      <div class="menu-item"><span>🗺️</span>Itinéraire</div><div class="menu-item"><span>✅</span>Checklist</div>
    </div></div>
    ${t.notes?`<div class="section-card"><h3>Notes</h3><div class="note-box">${esc(t.notes)}</div></div>`:''}
    <div class="detail-actions">
      <button class="small-btn primary" data-detail="edit">Modifier</button>
      <button class="small-btn" data-detail="archive">${t.archived?'Restaurer':'Archiver ce voyage'}</button>
      <button class="small-btn danger" data-detail="delete">Supprimer</button>
    </div>`;
}

tripList.addEventListener('click',(e)=>{
  const b=e.target.closest('button[data-action]'); if(!b) return; const {action,id}=b.dataset;
  const trips=loadTrips(), trip=trips.find(t=>t.id===id); if(!trip) return;
  if(action==='open') showDetail(id);
  if(action==='edit') openForm(trip);
  if(action==='archive'){ saveTrips(trips.map(t=>t.id===id?{...t,archived:!t.archived,updatedAt:Date.now()}:t)); renderTrips(); }
});

$('detailContent').addEventListener('click',(e)=>{
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
$('backBtn').addEventListener('click',()=>{currentTripId=null;$('detailView').classList.remove('active');$('homeView').classList.add('active');renderTrips();});

if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{})); }
renderTrips();
