/* Saldo · cliente Supabase v2, sin claves privadas en el navegador. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const config = window.SALDO_CONFIG || {};
if (!config.supabaseUrl?.startsWith('https://') || !config.supabaseAnonKey || config.supabaseAnonKey.startsWith('PEGA_') || !window.supabase?.createClient) {
  $('setup').classList.remove('hidden');
  return;
}
const db = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
});
const cats = {
 expense: ['Alimentación','Vivienda','Servicios','Transporte','Salud','Educación','Salidas','Compras','Suscripciones','Mascotas','Otros gastos'],
 income: ['Sueldo','Freelance','Ventas','Reintegros','Regalos','Inversiones','Otros ingresos']
};
const icons = {'Alimentación':'◈','Vivienda':'⌂','Servicios':'✳','Transporte':'↗','Salud':'♡','Educación':'▤','Salidas':'✦','Compras':'▣','Suscripciones':'↻','Mascotas':'♧','Sueldo':'↙','Freelance':'⌘','Ventas':'◇','Regalos':'✳','Otros gastos':'•','Otros ingresos':'•'};
let user = null, profile = null, partner = null, myMoves = [], partnerMoves = [], month = new Date(), editingId = null, authMode = 'login', currentPanel='dashboard', loading=false;
month.setDate(1);
const fmt = n => '$ ' + Number(n||0).toLocaleString('es-UY',{minimumFractionDigits:0,maximumFractionDigits:2});
const escapeHtml = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localToday = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const monthKey = () => `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`;
const inMonth = m => m.movement_date?.startsWith(monthKey());
const errorText = err => err?.message || 'Ocurrió un error. Intentá nuevamente.';
let toastTimer;
function toast(msg) { const el=$('toast'); el.textContent=msg; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('visible'),4200); }
const show = (id,yes) => $(id).classList.toggle('hidden',!yes);
function setBusy(button,busy) {if(button){button.disabled=busy;button.dataset.oldLabel ||= button.textContent;if(!busy){button.textContent=button.dataset.oldLabel;delete button.dataset.oldLabel;}else{button.textContent='Procesando...';}}}
function showAuth() { show('authView',true);show('appView',false);show('setup',false); }
function showApp() { show('authView',false);show('appView',true);show('setup',false); }
function setAuthMode(mode){ authMode=mode; $('authHeading').textContent=mode==='register'?'Creá tu cuenta':'Iniciá sesión';$('authSubtitle').textContent=mode==='register'?'Tus finanzas, a tu manera.':'Tus movimientos te esperan.';$('nameField').hidden=mode!=='register';$('authName').required=mode==='register';$('authSubmit').innerHTML=mode==='register'?'Crear cuenta →':'Entrar a Saldo →';$('authSwitch').textContent=mode==='register'?'Ya tengo cuenta':'Crear cuenta';$('authPassword').autocomplete=mode==='register'?'new-password':'current-password';}
$('authSwitch').addEventListener('click',()=>setAuthMode(authMode==='register'?'login':'register'));
$('authForm').addEventListener('submit',async e=>{e.preventDefault();const btn=$('authSubmit');setBusy(btn,true);const email=$('authEmail').value.trim(),password=$('authPassword').value;try{
 if(authMode==='register') {const name=$('authName').value.trim();if(!name)throw new Error('Ingresá tu nombre.');const {data,error}=await db.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:new URL('./',location.href).href}});if(error)throw error;toast(data.session?'Cuenta creada. ¡Bienvenido!':'Revisá tu correo y confirmá el registro para entrar.');if(!data.session)setAuthMode('login');}
 else {const {error}=await db.auth.signInWithPassword({email,password});if(error)throw error;}
 }catch(err){toast(errorText(err));}finally{setBusy(btn,false);}});
$('forgotPassword').addEventListener('click',async()=>{const email=$('authEmail').value.trim();if(!email){toast('Primero escribí tu correo electrónico.');return;}try{const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:new URL('./',location.href).href});if(error)throw error;toast('Revisá tu correo para restablecer la contraseña.');}catch(err){toast(errorText(err));}});
$('resetClose').addEventListener('click',()=> $('resetDialog').close());
$('resetForm').addEventListener('submit',async e=>{e.preventDefault();const password=$('newPassword').value;try{const {error}=await db.auth.updateUser({password});if(error)throw error;$('resetDialog').close();$('newPassword').value='';toast('Contraseña actualizada.');}catch(err){toast(errorText(err));}});
$('logout').addEventListener('click',async()=>{const {error}=await db.auth.signOut();if(error)toast(errorText(error));});
function setPanel(panel){currentPanel=panel;for(const id of ['dashboard','movements','partner'])show(id+'Panel',panel===id);document.querySelectorAll('.navitem').forEach(el=>el.classList.toggle('active',el.dataset.panel===panel));window.scrollTo({top:0,behavior:'smooth'});render();}
document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>setPanel(b.dataset.panel)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>setPanel(b.dataset.go)));
document.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>openMove()));
function monthChange(delta){month.setMonth(month.getMonth()+delta);render();}
for(const [a,b,delta] of [['monthPrev','listPrev',-1],['monthNext','listNext',1]]){ $(a).addEventListener('click',()=>monthChange(delta));$(b).addEventListener('click',()=>monthChange(delta));}
$('search').addEventListener('input',render);
$('kindFilter').addEventListener('change',render);
function movementCard(m,opts={}){
 const income=m.kind==='income';const meta=`${escapeHtml(m.category)} · ${new Date(m.movement_date+'T12:00:00').toLocaleDateString('es-UY',{day:'2-digit',month:'short'})}`;
 const edit=opts.editable?`<button class="edit-btn" data-edit="${escapeHtml(m.id)}" aria-label="Editar movimiento" title="Editar">✎</button>`:'';
 return `<div class="movement-row"><span class="movement-icon ${income?'is-income':''}">${icons[m.category]|| (income?'↙':'↗')}</span><div class="movement-main"><strong>${escapeHtml(m.title)}</strong><small>${meta}${m.shared_with_partner&&opts.editable?' · <span class="shared-label">♡ Compartido</span>':''}</small></div><div class="row-actions"><span class="movement-value ${income?'income':''}">${income?'+':'−'}${fmt(m.amount)}</span>${edit}</div></div>`;
}
function renderList(container,data,empty,editable=false){$(container).innerHTML=data.length?data.map(m=>movementCard(m,{editable})).join(''):`<div class="empty"><span>✳</span>${escapeHtml(empty)}</div>`;}
function render(){
 if(!user)return;
 const label=month.toLocaleDateString('es-UY',{month:'long',year:'numeric'});$('monthLabel').textContent=label;$('listMonth').textContent=label;
 const own=myMoves.filter(inMonth),income=own.filter(m=>m.kind==='income').reduce((s,m)=>s+Number(m.amount),0),expense=own.filter(m=>m.kind==='expense').reduce((s,m)=>s+Number(m.amount),0);
 $('balanceAmount').textContent=fmt(income-expense);$('incomeAmount').textContent=fmt(income);$('expenseAmount').textContent=fmt(expense);
 const totals={};for(const m of own.filter(m=>m.kind==='expense'))totals[m.category]=(totals[m.category]||0)+Number(m.amount);
 const groups=Object.entries(totals).sort((a,b)=>b[1]-a[1]);$('categoryList').innerHTML=groups.length?groups.map(([name,n])=>`<div><div class="catrow"><span>${escapeHtml(name)}</span><strong>${fmt(n)}</strong></div><div class="track"><div class="fill" style="width:${Math.max(1,Math.round(n/expense*100))}%"></div></div></div>`).join(''):'<div class="empty"><span>◌</span>Cuando cargues gastos, vas a verlos por categoría.</div>';
 renderList('recentList',own.slice(0,5),'Todavía no tenés movimientos este mes.',false);
 const q=$('search').value.trim().toLocaleLowerCase('es'),kind=$('kindFilter').value;
 const list=own.filter(m=>(kind==='all'||m.kind===kind)&&`${m.title} ${m.category} ${m.note}`.toLocaleLowerCase('es').includes(q));
 renderList('allList',list,'No hay movimientos con esos filtros.',true);
 show('partnerConnected',!!partner);show('partnerDisconnected',!partner);$('partnerDot').textContent=partner?'✓':'•';
 if(partner){$('partnerName').textContent=partner.name;$('partnerName2').textContent=partner.name;
 const sharedMine=own.filter(m=>m.shared_with_partner),sharedThem=partnerMoves.filter(inMonth);
 $('partnerSharedCount').textContent=String(sharedThem.length);$('partnerIncome').textContent=fmt(sharedThem.filter(m=>m.kind==='income').reduce((s,m)=>s+Number(m.amount),0));$('partnerExpense').textContent=fmt(sharedThem.filter(m=>m.kind==='expense').reduce((s,m)=>s+Number(m.amount),0));
 renderList('sharedMine',sharedMine,'No compartiste movimientos este mes.',true);renderList('sharedPartner',sharedThem,'Tu pareja todavía no compartió movimientos este mes.',false);
 }
 document.querySelectorAll('[data-edit]').forEach(el=>el.addEventListener('click',()=>{const m=myMoves.find(m=>m.id===el.dataset.edit);if(m)openMove(m);}));
}
function categoriesFor(kind,selected){$('moveCategory').innerHTML=cats[kind].map(c=>`<option value="${escapeHtml(c)}" ${c===selected?'selected':''}>${escapeHtml(c)}</option>`).join('');}
function openMove(m=null){editingId=m?.id||null;$('moveForm').reset();$('moveTitle').textContent=m?'Editar movimiento':'Nuevo movimiento';const kind=m?.kind||'expense';document.querySelector(`input[name="kind"][value="${kind}"]`).checked=true;categoriesFor(kind,m?.category);$('moveAmount').value=m?.amount||'';$('moveDesc').value=m?.title||'';$('moveDate').value=m?.movement_date||localToday();$('moveNote').value=m?.note||'';$('moveShared').checked=!!m?.shared_with_partner;$('moveShared').disabled=!partner;$('shareHelp').textContent=partner?'La otra persona podrá ver este movimiento.':'Vinculá tu cuenta primero en «En pareja» para compartir.';$('moveShared').closest('.share-toggle').classList.toggle('disabled',!partner);show('deleteMovement',!!m);$('moveDialog').showModal();}
document.querySelectorAll('input[name="kind"]').forEach(el=>el.addEventListener('change',()=>{if(el.checked)categoriesFor(el.value);}));
$('closeDialog').addEventListener('click',()=> $('moveDialog').close());
$('moveDialog').addEventListener('click',e=>{if(e.target===$('moveDialog'))$('moveDialog').close();});
$('moveForm').addEventListener('submit',async e=>{e.preventDefault();if(loading)return;loading=true;setBusy($('saveMovement'),true);const kind=document.querySelector('input[name="kind"]:checked').value;
 const move={owner_id:user.id,kind,amount:Number($('moveAmount').value),title:$('moveDesc').value.trim(),category:$('moveCategory').value,movement_date:$('moveDate').value,note:$('moveNote').value.trim(),shared_with_partner:!!partner&&$('moveShared').checked};
 try{if(!Number.isFinite(move.amount)||move.amount<=0)throw Error('Ingresá un monto válido.');
 const query=editingId?db.from('movements').update(move).eq('id',editingId).eq('owner_id',user.id):db.from('movements').insert(move);
 const {error}=await query;if(error)throw error;$('moveDialog').close();await loadData();toast(editingId?'Movimiento actualizado.':'Movimiento guardado.');}
 catch(err){toast(errorText(err));}finally{loading=false;setBusy($('saveMovement'),false);}
});
$('deleteMovement').addEventListener('click',async()=>{if(!editingId||!confirm('¿Eliminar este movimiento? No se puede deshacer.'))return;try{const {error}=await db.from('movements').delete().eq('id',editingId).eq('owner_id',user.id);if(error)throw error;$('moveDialog').close();await loadData();toast('Movimiento eliminado.');}catch(err){toast(errorText(err));}});
$('generateCode').addEventListener('click',async()=>{const btn=$('generateCode');setBusy(btn,true);try{const {data,error}=await db.rpc('generate_partner_invite');if(error)throw error;$('inviteCode').textContent=data;show('inviteBox',true);toast('Compartí este código solo con tu pareja.');}catch(err){toast(errorText(err));}finally{setBusy(btn,false);}});
$('copyCode').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('inviteCode').textContent);toast('Código copiado.');}catch{toast('Seleccioná y copiá el código manualmente.');}});
$('joinForm').addEventListener('submit',async e=>{e.preventDefault();const code=$('joinCode').value.replace(/\s+/g,'').toUpperCase();if(!/^[A-F0-9]{12}$/.test(code)){toast('Ingresá un código válido de 12 caracteres.');return;}const btn=$('joinForm').querySelector('button');setBusy(btn,true);try{const {error}=await db.rpc('accept_partner_invite',{invite_code:code});if(error)throw error;$('joinCode').value='';await loadData();toast('¡Cuentas vinculadas!');}catch(err){toast(errorText(err));}finally{setBusy(btn,false);}});
$('disconnect').addEventListener('click',async()=>{if(!confirm('¿Desvincular las cuentas? Los movimientos compartidos de ambos volverán a ser privados.'))return;const btn=$('disconnect');setBusy(btn,true);try{const {error}=await db.rpc('disconnect_partner');if(error)throw error;await loadData();toast('Cuentas desvinculadas. Los movimientos volvieron a ser privados.');}catch(err){toast(errorText(err));}finally{setBusy(btn,false);}});
$('exportCsv').addEventListener('click',()=>{const rows=myMoves.filter(inMonth);const cols=['Fecha','Tipo','Descripción','Categoría','Monto (UYU)','Nota','Compartido'];const csv=[cols,...rows.map(m=>[m.movement_date,m.kind==='income'?'Ingreso':'Gasto',m.title,m.category,m.amount,m.note,m.shared_with_partner?'Sí':'No'])].map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\r\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`saldo-${monthKey()}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),500);});
async function loadData(){if(!user)return;
 // Los datos privados y compartidos se filtran en la base, no en el cliente.
 const [pResult,lResult] = await Promise.all([db.from('profiles').select('id,display_name').eq('id',user.id).maybeSingle(),db.from('partner_links').select('user_low,user_high').limit(1).maybeSingle()]);
 if(pResult.error)throw pResult.error;if(lResult.error)throw lResult.error;
 profile=pResult.data||{display_name:user.user_metadata?.display_name||'Usuario'};
 const link=lResult.data; partner=null;
 if(link){const id=link.user_low===user.id?link.user_high:link.user_low;const {data,error}=await db.from('profiles').select('id,display_name').eq('id',id).single();if(error)throw error;partner={id,name:data.display_name};}
 const {data,error}=await db.from('movements').select('id,owner_id,movement_date,kind,amount,title,category,note,shared_with_partner').order('movement_date',{ascending:false}).order('created_at',{ascending:false});if(error)throw error;
 myMoves=(data||[]).filter(m=>m.owner_id===user.id);partnerMoves=(data||[]).filter(m=>partner&&m.owner_id===partner.id);
 $('hello').textContent=`Hola, ${profile.display_name}`;$('avatar').textContent=(profile.display_name||'S').charAt(0).toUpperCase();render();
}
async function applySession(session){if(!session?.user){user=null;profile=null;partner=null;myMoves=[];partnerMoves=[];showAuth();return;}const changed=user?.id!==session.user.id;user=session.user;showApp();if(changed){try{await loadData();}catch(err){toast('No se pudieron cargar los datos: '+errorText(err));}}}
let initDone=false;
(async()=>{try{const {data,error}=await db.auth.getSession();if(error)throw error;await applySession(data.session);initDone=true;db.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){$('resetDialog').showModal();return;}if(!initDone)return;setTimeout(()=>applySession(session),0);});}
catch(err){toast('No se pudo conectar: '+errorText(err));showAuth();}})();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
