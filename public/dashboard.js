(function () {
  let me = null;
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const money = (n) => 'R' + (Number(n) || 0).toLocaleString();

  const PAGES = {
    dash: ['Dashboard', 'Plan and teach your classes.'],
    analytics: ['Analytics', 'How your academy is doing.'],
    classes: ['Classes', 'Schedule and run live classes.'],
    library: ['Library', 'Everything you have published.'],
    assess: ['Assessments', 'Create tests for your learners.'],
    chats: ['Chats', 'Your academy group chat.'],
    learners: ['Learners', 'Manage students, fees and reminders.'],
    money: ['Money', 'What your academy has collected.'],
    profile: ['Profile', 'Your details and picture.'],
  };

  function fmtWhen(iso){ if(!iso) return 'Not scheduled'; const d=new Date(iso); return isNaN(d)?iso:d.toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
  function fmtDate(iso){ const d=new Date(iso); return isNaN(d)?'':d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); }
  function fmtSize(n){ if(!n) return ''; if(n<1024) return n+' B'; if(n<1048576) return (n/1024).toFixed(0)+' KB'; return (n/1048576).toFixed(1)+' MB'; }

  // ---- nav ----
  const side=el('side'), scrim=el('scrim');
  const closeMenu=()=>{side.classList.remove('open');scrim.classList.remove('show');};
  el('hamburger').addEventListener('click',()=>{side.classList.add('open');scrim.classList.add('show');});
  scrim.addEventListener('click',closeMenu);
  function showPage(p){
    Object.keys(PAGES).forEach((k)=>el('page-'+k).classList.toggle('on',k===p));
    document.querySelectorAll('#nav a').forEach((a)=>a.classList.toggle('on',a.dataset.page===p));
    el('pageTitle').textContent=PAGES[p][0]; el('pageSub').textContent=PAGES[p][1];
    closeMenu(); loadPage(p);
  }
  document.querySelectorAll('#nav a').forEach((a)=>a.addEventListener('click',()=>showPage(a.dataset.page)));
  el('avatarInitial').addEventListener('click',()=>showPage('profile'));

  // ---- stats ----
  const statCard=(n,l,target)=>`<div class="stat${target?' clickable':''}"${target?` data-goto="${target}"`:''}><div class="n">${n}</div><div class="l">${esc(l)}</div></div>`;
  async function loadStats(target){
    try{ const s=await apiFetch('/api/learners/analytics');
      const cards=[
        [s.studentCount,'Learners','learners'],
        [s.classCount,'Classes','classes'],
        [s.liveNow,'Live now','classes'],
        [money(s.collectedThisMonth),'Collected (month)', me.role==='tutor'?'money':null],
        [s.libraryCount,'Library items','library'],
        [s.assessmentCount,'Tests','assess'],
        [s.messageCount,'Messages','chats'],
        [me.academy?me.academy.inviteCode:'-','Invite code','__invite'],
      ];
      const box=el(target);
      box.innerHTML=cards.map(([n,l,t])=>statCard(n,l,t)).join('');
      box.querySelectorAll('.stat.clickable').forEach(c=>c.addEventListener('click',()=>{
        const g=c.dataset.goto;
        if(g==='__invite'){ const code=me.academy?.inviteCode||''; navigator.clipboard?.writeText(code).then(()=>toast('Invite code copied.')).catch(()=>toast(code)); }
        else showPage(g);
      }));
    }catch(e){ el(target).innerHTML=statCard('-','Could not load'); }
  }

  // ---- classes ----
  function classRow(c){
    let a='';
    if(me.role==='tutor'){
      if(c.status==='live') a=`<button class="pillbtn live" data-go="${c.id}">Rejoin</button> <button class="cont" data-end="${c.id}">End</button>`;
      else if(c.status==='scheduled') a=`<button class="pillbtn" data-go="${c.id}">Go live</button>`;
      else a=`<button class="cont" disabled>Ended</button>`;
    } else {
      if(c.status==='live') a=`<button class="pillbtn live" data-join="${c.id}">Join</button>`;
      else if(c.status==='scheduled') a=`<button class="cont" disabled>Not live yet</button>`;
      else a=`<button class="cont" disabled>Ended</button>`;
    }
    return `<div class="list-row"><div class="grow"><b>${esc(c.title)}</b><small>${esc(c.subject||'General')} &middot; ${fmtWhen(c.scheduledAt)} &middot; ${c.durationMinutes} min</small></div><span class="badge ${c.status}">${c.status}</span><div>${a}</div></div>`;
  }
  function wireClasses(box){
    box.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>goLive(b.dataset.go)));
    box.querySelectorAll('[data-join]').forEach(b=>b.addEventListener('click',()=>joinClass(b.dataset.join)));
    box.querySelectorAll('[data-end]').forEach(b=>b.addEventListener('click',()=>endClass(b.dataset.end)));
  }
  async function loadClasses(){
    const {classes}=await apiFetch('/api/classes');
    const l=el('classList'); l.innerHTML=classes.length?classes.map(classRow).join(''):'<div class="empty">No classes yet.</div>'; wireClasses(l);
    const up=classes.filter(c=>c.status!=='ended'); const d=el('dashClasses');
    d.innerHTML=up.length?up.map(classRow).join(''):'<div class="empty">Nothing scheduled.</div>'; wireClasses(d);
  }
  async function goLive(id){ try{ const {roomUrl,token}=await apiFetch(`/api/classes/${id}/go-live`,{method:'POST'}); location.href=`/live.html?roomUrl=${encodeURIComponent(roomUrl)}&token=${encodeURIComponent(token)}`; }catch(e){toast(e.message);} }
  async function joinClass(id){ try{ const {roomUrl,token}=await apiFetch(`/api/classes/${id}/join`,{method:'POST'}); location.href=`/live.html?roomUrl=${encodeURIComponent(roomUrl)}&token=${encodeURIComponent(token)}`; }catch(e){toast(e.message);} }
  async function endClass(id){ try{ await apiFetch(`/api/classes/${id}/end`,{method:'POST'}); toast('Class ended.'); loadClasses(); }catch(e){toast(e.message);} }

  // ---- library gallery (groups + sort + filter + trash + media) ----
  let viewingTrash=false;
  function mediaClass(i){
    const m=i.mimeType||'';
    if(i.hasFile && m.startsWith('video/')) return 'video';
    if(i.hasFile && m.startsWith('image/')) return 'image';
    if(i.hasFile && m.startsWith('audio/')) return 'audio';
    return 'doc';
  }
  function thumbHtml(i){
    const src=`/api/library/${i.id}/download`;
    const cls=mediaClass(i);
    if(cls==='image') return `<div class="thumb"><span class="typetag">Image</span><img src="${src}" alt="${esc(i.title)}" loading="lazy"></div>`;
    if(cls==='video') return `<div class="thumb"><span class="typetag">Video</span><video src="${src}#t=0.1" preload="metadata" muted playsinline></video></div>`;
    if(cls==='audio') return `<div class="thumb"><span class="typetag">Audio</span><span class="ficon">&#127925;</span></div>`;
    const icon=i.kind==='Past paper'?'&#128209;':i.kind==='Worksheet'?'&#128221;':i.kind==='Video'?'&#127909;':'&#128196;';
    return `<div class="thumb"><span class="typetag">${esc(i.kind||'Doc')}</span><span class="ficon">${icon}</span></div>`;
  }
  function libCardHtml(i){
    const bits=[fmtDate(i.createdAt)];
    if(i.hasFile && i.sizeBytes) bits.push(fmtSize(i.sizeBytes));
    let actions='';
    if(i.hasFile && !viewingTrash) actions+=`<a class="cont" href="/api/library/${i.id}/download" target="_blank" rel="noopener">Open</a>`;
    if(me.role==='tutor'){
      if(viewingTrash) actions+=`<button class="cont" data-restore="${i.id}">Restore</button><button class="cont" data-del="${i.id}">Delete forever</button>`;
      else actions+=`<button class="cont" data-trash="${i.id}">Remove</button>`;
    }
    return `<div class="libcard">${thumbHtml(i)}<div class="body"><b>${esc(i.title)}</b><small>${bits.join(' &middot; ')}</small>${i.note?`<small>${esc(i.note)}</small>`:''}</div>${actions?`<div class="actions">${actions}</div>`:''}</div>`;
  }
  function sortItems(items){
    const how=el('libSort')?el('libSort').value:'new';
    const arr=items.slice();
    if(how==='new') arr.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
    else if(how==='old') arr.sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||''));
    else if(how==='name') arr.sort((a,b)=>(a.title||'').localeCompare(b.title||''));
    else if(how==='type') arr.sort((a,b)=>mediaClass(a).localeCompare(mediaClass(b))||(a.title||'').localeCompare(b.title||''));
    return arr;
  }
  function filterItems(items){
    const f=el('libTypeFilter')?el('libTypeFilter').value:'all';
    if(f==='all') return items;
    return items.filter(i=>{ const c=mediaClass(i); return f==='doc'?(c==='doc'||c==='audio'):c===f; });
  }
  let libItemsCache=[];
  function renderLibrary(){
    const box=el('libList');
    let items=filterItems(sortItems(libItemsCache));
    if(!libItemsCache.length){ box.innerHTML=`<div class="empty">${viewingTrash?'Trash is empty.':'Nothing published yet.'}</div>`; return; }
    if(!items.length){ box.innerHTML='<div class="empty">Nothing matches this filter.</div>'; return; }
    if(viewingTrash){
      box.innerHTML=`<div class="libgallery">${items.map(libCardHtml).join('')}</div>`;
    } else {
      const groups={}; items.forEach(i=>{ (groups[i.group]=groups[i.group]||[]).push(i); });
      box.innerHTML=Object.keys(groups).sort().map(g=>`<div class="libgroup-title">${esc(g)} <span class="count">${groups[g].length}</span></div><div class="libgallery">${groups[g].map(libCardHtml).join('')}</div>`).join('');
    }
    box.querySelectorAll('[data-trash]').forEach(b=>b.addEventListener('click',async()=>{try{await apiFetch(`/api/library/${b.dataset.trash}/trash`,{method:'POST'});toast('Moved to trash.');loadLibrary();}catch(e){toast(e.message);}}));
    box.querySelectorAll('[data-restore]').forEach(b=>b.addEventListener('click',async()=>{try{await apiFetch(`/api/library/${b.dataset.restore}/restore`,{method:'POST'});toast('Restored.');loadLibrary();}catch(e){toast(e.message);}}));
    box.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{ if(!confirm('Delete this permanently? This cannot be undone.'))return; try{await apiFetch(`/api/library/${b.dataset.del}`,{method:'DELETE'});toast('Deleted permanently.');loadLibrary();}catch(e){toast(e.message);}}));
  }
  async function loadLibrary(){
    const {items}=await apiFetch('/api/library'+(viewingTrash?'?trash=1':''));
    el('libHeading').textContent=viewingTrash?'Trash':'Library';
    el('trashToggle').textContent=viewingTrash?'Back to library':'View trash';
    libItemsCache=items;
    const dl=el('libGroups'); if(dl){ const gs=[...new Set(items.map(i=>i.group))]; dl.innerHTML=gs.map(g=>`<option value="${esc(g)}">`).join(''); }
    renderLibrary();
  }
  el('trashToggle').addEventListener('click',()=>{viewingTrash=!viewingTrash;loadLibrary();});
  el('libSort')&&el('libSort').addEventListener('change',renderLibrary);
  el('libTypeFilter')&&el('libTypeFilter').addEventListener('change',renderLibrary);

  // ---- assessments ----
  async function loadAssessments(){
    const {assessments}=await apiFetch('/api/assessments'); const l=el('testList');
    l.innerHTML=assessments.length?assessments.map(a=>`<div class="list-row"><div class="grow"><b>${esc(a.title)}</b><small>${a.questionCount} questions &middot; ${a.durationMinutes} min</small></div><span class="badge ${a.status}">${a.status}</span><div>${me.role==='tutor'&&a.status==='open'?`<button class="cont" data-close="${a.id}">Close</button>`:''}</div></div>`).join(''):'<div class="empty">No tests yet.</div>';
    l.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',async()=>{try{await apiFetch(`/api/assessments/${b.dataset.close}/close`,{method:'POST'});toast('Test closed.');loadAssessments();}catch(e){toast(e.message);}}));
  }

  // ---- chat ----
  function bubble(m){
    const mime=m.mimeType||''; const src=`/api/chat/${m.id}/file`;
    if(m.hasFile){
      if(m.kind==='voice') return `<div class="bubble"><audio controls preload="none" src="${src}"></audio></div>`;
      if(mime.startsWith('image/')) return `<a class="bubble mediabubble" href="${src}" target="_blank" rel="noopener"><img src="${src}" alt=""></a>`;
      if(mime.startsWith('video/')) return `<div class="bubble mediabubble"><video controls preload="metadata" src="${src}"></video></div>`;
      if(mime.startsWith('audio/')) return `<div class="bubble"><audio controls preload="none" src="${src}"></audio></div>`;
      const size=m.sizeBytes?`<span class="fs">${fmtSize(m.sizeBytes)}</span>`:'';
      return `<a class="bubble filebubble" href="${src}" target="_blank" rel="noopener"><span class="fi">&#128196;</span><span><span class="fn">${esc(m.fileName||'file')}</span><br>${size}</span></a>`;
    }
    return `<div class="bubble">${esc(m.body)}</div>`;
  }
  async function loadChat(){
    const {messages}=await apiFetch('/api/chat'); const box=el('chatBox');
    box.innerHTML=messages.length?messages.map(m=>`<div class="msg ${m.mine?'mine':''}">${m.mine?'':`<div class="who" style="color:${m.authorRole==='tutor'?'#B07E0A':'var(--blue)'}">${esc(m.author)}</div>`}${bubble(m)}</div>`).join(''):'<div class="empty">No messages yet. Say hello, share a file, or send a voice note.</div>';
    box.scrollTop=box.scrollHeight;
  }
  async function postChatForm(fd){ const res=await fetch('/api/chat',{method:'POST',body:fd,credentials:'include'}); if(!res.ok){const j=await res.json().catch(()=>({}));throw new Error(j.error||('Send failed ('+res.status+')'));} }
  async function sendChat(){ const i=el('chatIn'); const b=i.value.trim(); if(!b)return; i.value=''; const fd=new FormData(); fd.append('body',b); try{await postChatForm(fd);loadChat();}catch(e){toast(e.message);} }
  el('chatSend').addEventListener('click',sendChat);
  el('chatIn').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat();});
  el('chatAttach').addEventListener('click',()=>el('chatFile').click());
  el('chatFile').addEventListener('change',async()=>{ const f=el('chatFile').files[0]; if(!f)return; const fd=new FormData(); fd.append('kind','file'); fd.append('file',f); el('chatFile').value=''; try{await postChatForm(fd);toast('Sent.');loadChat();}catch(e){toast(e.message);} });
  let mr=null,chunks=[],recStart=0,recTimer=null;
  function stopTracks(){ if(mr&&mr.stream) mr.stream.getTracks().forEach(t=>t.stop()); }
  async function startRec(){ if(!navigator.mediaDevices?.getUserMedia) return toast('This browser cannot record audio.'); try{ const s=await navigator.mediaDevices.getUserMedia({audio:true}); mr=new MediaRecorder(s); chunks=[]; mr.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);}; mr.start(); recStart=Date.now(); el('recBar').style.display='flex'; recTimer=setInterval(()=>{const t=Math.floor((Date.now()-recStart)/1000);el('recTime').textContent=' '+Math.floor(t/60)+':'+String(t%60).padStart(2,'0');},500);}catch(e){toast('Could not start microphone: '+(e.name||e.message));} }
  function finishRec(send){ if(!mr)return; clearInterval(recTimer); el('recBar').style.display='none'; const dur=Date.now()-recStart; mr.onstop=async()=>{ stopTracks(); if(!send){mr=null;return;} const blob=new Blob(chunks,{type:'audio/webm'}); const fd=new FormData(); fd.append('kind','voice'); fd.append('durationMs',String(dur)); fd.append('file',blob,'voice-note.webm'); try{await postChatForm(fd);loadChat();}catch(e){toast(e.message);} mr=null; }; mr.stop(); }
  el('chatMic').addEventListener('click',startRec);
  el('recStop').addEventListener('click',()=>finishRec(true));
  el('recCancel').addEventListener('click',()=>finishRec(false));

  // ---- learners console ----
  let roster={students:[],tutors:[]};
  function studentRow(s){
    const badge=s.status==='paid'?'<span class="badge paid">paid</span>':s.status==='partial'?'<span class="badge scheduled">part-paid</span>':s.status==='no-fee'?'<span class="badge ended">no fee</span>':'<span class="badge live">unpaid</span>';
    let tutorTools='';
    if(me.role==='tutor'){
      tutorTools=`<button class="cont" data-pay="${s.id}">Mark paid</button> <button class="cont" data-fee="${s.id}">Fee</button> <button class="cont" data-remind="${s.id}">Remind</button> <button class="cont" data-remove="${s.id}">Remove</button>`;
    }
    const feeInfo=s.monthlyFee?`R${s.monthlyFee}/mo &middot; paid R${s.paidThisMonth} this month`:'no fee set';
    return `<div class="list-row"><div class="grow"><b>${esc(s.name)}</b><small>${esc(s.email)} &middot; ${feeInfo}</small></div>${badge}<div>${tutorTools}</div></div>`;
  }
  function renderRoster(){
    const filter=el('rosterFilter')?el('rosterFilter').value:'all';
    let list=roster.students.slice();
    if(filter==='unpaid') list=list.filter(s=>s.status==='unpaid'||s.status==='partial');
    if(filter==='paid') list=list.filter(s=>s.status==='paid');
    el('rosterTitle').textContent=`Learners (${roster.students.length})`;
    const box=el('learnerList');
    box.innerHTML=list.length?list.map(studentRow).join(''):'<div class="empty">No students match this filter.</div>';
    box.querySelectorAll('[data-pay]').forEach(b=>b.addEventListener('click',()=>payStudent(b.dataset.pay)));
    box.querySelectorAll('[data-fee]').forEach(b=>b.addEventListener('click',()=>setFee(b.dataset.fee)));
    box.querySelectorAll('[data-remind]').forEach(b=>b.addEventListener('click',()=>remindStudent(b.dataset.remind)));
    box.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>removeStudent(b.dataset.remove)));
    el('tutorList').innerHTML=roster.tutors.map(t=>`<div class="list-row"><div class="grow"><b>${esc(t.name)}</b><small>${esc(t.email)}</small></div></div>`).join('');
  }
  async function loadLearners(){ roster=await apiFetch('/api/learners'); renderRoster(); }
  el('rosterFilter')&&el('rosterFilter').addEventListener('change',renderRoster);
  function findStudent(id){ return roster.students.find(s=>String(s.id)===String(id)); }
  async function payStudent(id){ const s=findStudent(id); const def=s&&s.monthlyFee?s.monthlyFee:''; const amt=prompt(`Amount paid by ${s?s.name:'student'} (R):`,def); if(amt===null)return; try{await apiFetch(`/api/learners/${id}/pay`,{method:'POST',body:JSON.stringify({amount:Number(amt)})});toast('Payment recorded.');loadLearners();}catch(e){toast(e.message);} }
  async function setFee(id){ const s=findStudent(id); const fee=prompt(`Monthly fee for ${s?s.name:'student'} (R):`,s?s.monthlyFee:0); if(fee===null)return; try{await apiFetch(`/api/learners/${id}/fee`,{method:'PATCH',body:JSON.stringify({monthlyFee:Number(fee)})});toast('Fee updated.');loadLearners();}catch(e){toast(e.message);} }
  async function remindStudent(id){ const msg=prompt('Reminder message:','Please settle your outstanding fees.'); if(msg===null)return; try{await apiFetch(`/api/learners/${id}/remind`,{method:'POST',body:JSON.stringify({body:msg})});toast('Reminder sent.');}catch(e){toast(e.message);} }
  async function removeStudent(id){ const s=findStudent(id); if(!confirm(`Remove ${s?s.name:'this student'}? Their payment history is deleted too.`))return; try{await apiFetch(`/api/learners/${id}`,{method:'DELETE'});toast('Student removed.');loadLearners();}catch(e){toast(e.message);} }
  el('remindAll')&&el('remindAll').addEventListener('click',async()=>{ const msg=prompt('Message to all unpaid students:','Your fees for this month are outstanding.'); if(msg===null)return; try{const r=await apiFetch('/api/learners/remind-unpaid',{method:'POST',body:JSON.stringify({body:msg})});toast(`Reminded ${r.remindedCount} student(s).`);}catch(e){toast(e.message);} });
  el('addStudentForm').addEventListener('submit',async(e)=>{ e.preventDefault(); const name=el('asName').value.trim(),email=el('asEmail').value.trim(); if(!name||!email)return toast('Name and email required.'); try{ const r=await apiFetch('/api/learners',{method:'POST',body:JSON.stringify({name,email,monthlyFee:Number(el('asFee').value)||0})}); e.target.reset(); toast('Student added.'); alert(`${name} added.\n\nTemporary password: ${r.tempPassword}\n\nShare this so they can log in, then they can change it in Profile.`); loadLearners(); }catch(err){toast(err.message);} });

  // ---- money ----
  async function loadMoney(){
    try{ const r=await apiFetch('/api/learners/revenue');
      el('moneyStats').innerHTML=[[money(r.collectedThisMonth),'Collected this month'],[money(r.outstandingThisMonth),'Outstanding this month'],[money(r.expectedThisMonth),'Expected this month'],[money(r.collectedAllTime),'Collected all-time']].map(([n,l])=>statCard(n,l)).join('');
      el('paymentsList').innerHTML=r.recent.length?r.recent.map(p=>`<div class="list-row"><div class="grow"><b>${esc(p.student)}</b><small>${p.period} &middot; ${fmtDate(p.at)}</small></div><b class="pct" style="color:var(--mint)">${money(p.amount)}</b></div>`).join(''):'<div class="empty">No payments recorded yet.</div>';
    }catch(e){ el('paymentsList').innerHTML='<div class="empty">Could not load.</div>'; }
  }

  // ---- library forms + AI ----
  el('newLibForm').addEventListener('submit',async(e)=>{ e.preventDefault(); const title=el('lbTitle').value.trim(); if(!title)return toast('Give it a title.'); const fd=new FormData(); fd.append('title',title); fd.append('kind',el('lbKind').value); fd.append('note',el('lbNote').value.trim()); fd.append('group',el('lbGroup').value.trim()); const fi=el('lbFile'); if(fi.files[0])fd.append('file',fi.files[0]); try{ const res=await fetch('/api/library',{method:'POST',body:fd,credentials:'include'}); if(!res.ok){const j=await res.json().catch(()=>({}));throw new Error(j.error||('Upload failed ('+res.status+')'));} e.target.reset(); toast('Published.'); viewingTrash=false; loadLibrary(); }catch(err){toast(err.message);} });
  el('aiForm').addEventListener('submit',async(e)=>{ e.preventDefault(); const prompt2=el('aiPrompt').value.trim(); if(!prompt2)return toast('Describe the image.'); const btn=el('aiBtn'); btn.disabled=true; const old=btn.textContent; btn.textContent='Generating...'; try{ await apiFetch('/api/library/generate',{method:'POST',body:JSON.stringify({prompt:prompt2,group:el('aiGroup').value.trim()})}); el('aiPrompt').value=''; toast('Image generated and saved to Library.'); viewingTrash=false; loadLibrary(); }catch(err){toast(err.message);} finally{ btn.disabled=false; btn.textContent=old; } });

  // ---- profile ----
  async function loadProfile(){
    const {profile}=await apiFetch('/api/profile');
    el('pfName').value=profile.name||''; el('pfEmail').value=profile.email||''; el('pfPhone').value=profile.phone||''; el('pfBio').value=profile.bio||'';
    const av=el('profileAvatar');
    if(profile.hasAvatar){ av.innerHTML=`<img src="/api/profile/avatar/${profile.id}?t=${Date.now()}" style="width:100%;height:100%;object-fit:cover;border-radius:20px">`; }
    else { av.textContent=(profile.name||'?').charAt(0).toUpperCase(); }
  }
  el('profileForm').addEventListener('submit',async(e)=>{ e.preventDefault(); try{ await apiFetch('/api/profile',{method:'PATCH',body:JSON.stringify({name:el('pfName').value.trim(),email:el('pfEmail').value.trim(),phone:el('pfPhone').value.trim(),bio:el('pfBio').value.trim()})}); toast('Details saved.'); refreshTopAvatar(); }catch(err){toast(err.message);} });
  el('pwForm').addEventListener('submit',async(e)=>{ e.preventDefault(); try{ await apiFetch('/api/profile/password',{method:'POST',body:JSON.stringify({current:el('pwCur').value,next:el('pwNew').value})}); e.target.reset(); toast('Password updated.'); }catch(err){toast(err.message);} });
  el('avatarBtn').addEventListener('click',()=>el('avatarFile').click());
  el('avatarFile').addEventListener('change',async()=>{ const f=el('avatarFile').files[0]; if(!f)return; const fd=new FormData(); fd.append('avatar',f); try{ const res=await fetch('/api/profile/avatar',{method:'POST',body:fd,credentials:'include'}); if(!res.ok){const j=await res.json().catch(()=>({}));throw new Error(j.error||'Upload failed');} el('avatarFile').value=''; toast('Picture updated.'); loadProfile(); refreshTopAvatar(); }catch(e){toast(e.message);} });
  function refreshTopAvatar(){ const a=el('avatarInitial'); a.innerHTML=`<img src="/api/profile/avatar/${me.id}?t=${Date.now()}" style="width:100%;height:100%;object-fit:cover;border-radius:14px" onerror="this.replaceWith(document.createTextNode('${(me.name||'?').charAt(0).toUpperCase()}'))">`; }

  // ---- reminders (students) ----
  async function checkReminders(){
    if(me.role!=='student')return;
    try{ const {reminders,unseen}=await apiFetch('/api/reminders');
      if(unseen>0){ el('reminderBanner').style.display='block'; el('reminderList').innerHTML=reminders.filter(r=>!r.seen).map(r=>`<div style="padding:6px 0"><b>${esc(r.body)}</b><br><small style="color:var(--sub)">${fmtDate(r.createdAt)}</small></div>`).join(''); }
      else el('reminderBanner').style.display='none';
    }catch(e){}
  }
  el('dismissReminders').addEventListener('click',async()=>{ try{ await apiFetch('/api/reminders/seen',{method:'POST'}); el('reminderBanner').style.display='none'; }catch(e){} });

  // ---- AI academy report ----
  function renderReport(text){
    // lightweight markdown: headings (lines ending with ':' or #), bold **x**, bullets - / *
    const lines=text.split('\n'); let html=''; let inUl=false;
    const closeUl=()=>{ if(inUl){ html+='</ul>'; inUl=false; } };
    for(let raw of lines){
      let line=raw.trim();
      if(!line){ closeUl(); continue; }
      line=esc(line).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
      if(/^#{1,4}\s+/.test(raw) || /^\d+\.\s+[A-Z]/.test(raw) && line.length<60){
        closeUl(); html+='<h4>'+line.replace(/^#{1,4}\s+/,'').replace(/^\d+\.\s+/,'')+'</h4>'; continue;
      }
      if(/^[-*]\s+/.test(raw)){ if(!inUl){html+='<ul>';inUl=true;} html+='<li>'+line.replace(/^[-*]\s+/,'')+'</li>'; continue; }
      closeUl(); html+='<p>'+line+'</p>';
    }
    closeUl(); return html;
  }
  async function generateReport(){
    const btn=el('genReport'); btn.disabled=true; const old=btn.textContent; btn.textContent='Analyzing...';
    el('reportBody').innerHTML='<div class="empty">Reading your academy data and writing the report...</div>';
    try{
      const r=await apiFetch('/api/report');
      el('reportBody').innerHTML=renderReport(r.report)+`<div class="report-meta">Generated ${new Date(r.generatedAt).toLocaleString()}</div>`;
    }catch(e){ el('reportBody').innerHTML='<div class="empty">'+esc(e.message)+'</div>'; }
    finally{ btn.disabled=false; btn.textContent=old; }
  }
  el('genReport')&&el('genReport').addEventListener('click',generateReport);

  // ---- other forms ----
  el('newClassForm').addEventListener('submit',async(e)=>{ e.preventDefault(); const title=el('ncTitle').value.trim(); if(!title)return toast('Give the class a title.'); const when=el('ncWhen').value; try{ await apiFetch('/api/classes',{method:'POST',body:JSON.stringify({title,subject:el('ncSubject').value.trim(),scheduledAt:when?new Date(when).toISOString():null,durationMinutes:Number(el('ncDuration').value)||30})}); e.target.reset(); toast('Class scheduled.'); loadClasses(); }catch(err){toast(err.message);} });
  el('newTestForm').addEventListener('submit',async(e)=>{ e.preventDefault(); const title=el('tbName').value.trim(); if(!title)return toast('Name the test.'); try{ await apiFetch('/api/assessments',{method:'POST',body:JSON.stringify({title,questionCount:Number(el('tbQ').value)||0,durationMinutes:Number(el('tbMin').value)||30})}); e.target.reset(); toast('Test published.'); loadAssessments(); }catch(err){toast(err.message);} });

  el('signOutBtn').addEventListener('click',async()=>{ await apiFetch('/api/auth/logout',{method:'POST'}); location.href='/'; });
  el('copyInvite')&&el('copyInvite').addEventListener('click',()=>{ const c=me.academy?.inviteCode||''; navigator.clipboard?.writeText(c).then(()=>toast('Copied.')).catch(()=>toast(c)); });

  function loadPage(p){
    const jobs={ dash:async()=>{await loadStats('dashStats');await loadClasses();}, analytics:()=>loadStats('analyticsStats'), classes:()=>loadClasses(), library:()=>loadLibrary(), assess:()=>loadAssessments(), chats:()=>loadChat(), learners:()=>loadLearners(), money:()=>loadMoney(), profile:()=>loadProfile() };
    const job=jobs[p]; if(job) Promise.resolve().then(job).catch(e=>toast(e.message));
  }

  (async function init(){
    me=await requireSession(); if(!me)return;
    el('academyName').textContent=me.academy?me.academy.name:'';
    el('avatarInitial').textContent=(me.name||'?').charAt(0).toUpperCase();
    const tutor=me.role==='tutor';
    ['newClassCard','newLibCard','aiCard','newTestCard','addStudentCard'].forEach(id=>el(id)&&(el(id).style.display=tutor?'block':'none'));
    if(el('rosterTools')) el('rosterTools').style.display=tutor?'flex':'none';
    if(tutor){ el('nav-money').style.display='flex'; const rc=el('aiReportCard'); if(rc) rc.style.display='block'; if(me.academy){ el('inviteBox').style.display='block'; el('inviteCode').textContent=me.academy.inviteCode; } }
    refreshTopAvatar();
    // AI availability hint
    if(tutor){ try{ const {configured}=await apiFetch('/api/library/ai-status'); const msg=configured?'Powered by Google Gemini.':'To turn this on, add a GEMINI_API_KEY (free at aistudio.google.com/apikey) to your settings.'; el('aiHint').textContent=msg; const rh=el('reportHint'); if(rh) rh.textContent=configured?'The AI reads your students, payments, classes, library, assessments and chat, then writes a report with recommendations.':'Add a GEMINI_API_KEY to enable AI reports.'; const gb=el('genReport'); if(gb&&!configured) gb.disabled=true; }catch(e){} }
    checkReminders();
    showPage('dash');
    setInterval(()=>{ const active=document.querySelector('.page.on')?.id?.replace('page-',''); if(active==='chats')loadChat().catch(()=>{}); else if(active==='dash'||active==='classes')loadClasses().catch(()=>{}); checkReminders(); },12000);
  })();
})();
