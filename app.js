const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const localDate=(d)=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`};
const STORE = 'goldfinch-workbench-v1';
let state = JSON.parse(localStorage.getItem(STORE) || 'null') || {
  inbox:[{id:crypto.randomUUID(),text:'整理下周项目的第一步',createdAt:Date.now()}],
  tasks:{q1:[],q2:[],q3:[],q4:[]}, flash:[], confirmed:[]
};
state.schedule ||= [];
state.inbox.forEach(item=>item.createdAt ||= Date.now());
const labels={q1:'重要 · 紧急',q2:'重要 · 不紧急',q3:'不重要 · 紧急',q4:'不重要 · 不紧急',flash:'每日确认'};
const save=()=>localStorage.setItem(STORE,JSON.stringify(state));
const toast=(msg)=>{const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2400)};
let activeDay=localDate(new Date());
function runDailyClose(notify=true){
  const today=localDate(new Date());
  const overdue=state.inbox.filter(item=>localDate(new Date(item.createdAt))<today);
  if(overdue.length){
    const ids=new Set(overdue.map(item=>item.id));
    state.inbox=state.inbox.filter(item=>!ids.has(item.id));
    state.flash.push(...overdue.map(item=>({...item,movedToFlashAt:Date.now(),movedBy:'daily-close'})));
    save();renderAll();
    if(notify)toast(`每日收尾：${overdue.length} 个未分类念头已转入每日确认`);
  }
  activeDay=today;
}

function renderInbox(){
  $('#inbox-count').textContent=state.inbox.length;
  const root=$('#inbox');root.innerHTML='';
  if(!state.inbox.length){root.innerHTML='<p class="empty">收入匣已清空，真漂亮。</p>';return}
  state.inbox.forEach(item=>{const el=document.createElement('div');el.className='inbox-item';el.draggable=true;el.dataset.taskId=item.id;el.setAttribute('aria-label',`${item.text}，可拖拽到四象限`);el.innerHTML=`<span></span><button class="delete-idea" aria-label="删除想法">×</button><div class="classify"><button aria-label="分类到四象限或每日确认">＋</button><div class="classify-menu"></div></div>`;$('.inbox-item>span',el).textContent=item.text;el.ondragstart=(e)=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',item.id);requestAnimationFrame(()=>el.classList.add('dragging'))};el.ondragend=()=>{el.classList.remove('dragging');$$('.quadrant.drop-target').forEach(x=>x.classList.remove('drop-target'))};$('.delete-idea',el).onclick=(e)=>{e.stopPropagation();state.inbox=state.inbox.filter(x=>x.id!==item.id);save();renderInbox();toast('想法已删除')};const menu=$('.classify-menu',el);Object.entries(labels).forEach(([zone,label])=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>classify(item.id,zone);menu.append(b)});$('.classify>button',el).onclick=(e)=>{e.stopPropagation();$$('.classify-menu.open').forEach(x=>x!==menu&&x.classList.remove('open'));menu.classList.toggle('open')};root.append(el)});
}
let pendingPlan=null;
function classify(id,zone){
  if(zone==='flash'){const i=state.inbox.findIndex(x=>x.id===id);if(i<0)return;const [item]=state.inbox.splice(i,1);state.flash.push(item);save();renderAll();toast(`已移至「${labels[zone]}」`);return}
  const item=state.inbox.find(x=>x.id===id);if(!item)return;openPlanner(item,zone);
}
function openPlanner(item,zone){pendingPlan={item,zone};$('#plan-task-name').textContent=item.text;$('#plan-zone-name').textContent=labels[zone];$('#plan-sessions').value=1;$('#plan-duration').value=25;$('#plan-date').value=localDate(new Date());$('#plan-time').value='09:00';$('#plan-cadence').value='daily';updatePlanPreview();$('#plan-dialog').showModal()}
function addDays(date,days){const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+days);return localDate(d)}
function sessionDate(start,index,cadence){if(cadence==='same-day')return start;if(cadence==='alternate')return addDays(start,index*2);if(cadence==='weekdays'){let d=start;for(let i=0;i<index;i++){d=addDays(d,1);while([0,6].includes(new Date(`${d}T12:00:00`).getDay()))d=addDays(d,1)}return d}return addDays(start,index)}
function updatePlanPreview(){const count=Math.max(1,Number($('#plan-sessions').value)||1),duration=Math.max(5,Number($('#plan-duration').value)||5);$('#plan-preview').textContent=`将创建 ${count} 个时间块，共 ${count*duration} 分钟，并同步到下方个人时间表。`}
function createPlan(){if(!pendingPlan)return;const count=Number($('#plan-sessions').value),duration=Number($('#plan-duration').value),date=$('#plan-date').value,time=$('#plan-time').value,cadence=$('#plan-cadence').value;if(!count||!duration||!date||!time)return;const {item,zone}=pendingPlan;state.inbox=state.inbox.filter(x=>x.id!==item.id);item.plan={sessions:count,duration,cadence};state.tasks[zone].push(item);for(let i=0;i<count;i++)state.schedule.push({id:crypto.randomUUID(),taskId:item.id,taskText:item.text,zone,index:i+1,total:count,duration,date:sessionDate(date,i,cadence),time,done:false});pendingPlan=null;save();renderAll();$('#plan-dialog').close();toast(`已拆分为 ${count} 次并加入时间表`)}
function renderTasks(){
  Object.keys(state.tasks).forEach(zone=>{const root=$(`[data-list="${zone}"]`);root.innerHTML='';if(!state.tasks[zone].length){root.innerHTML='<p class="empty">留白也是一种秩序</p>';return}
    state.tasks[zone].forEach(item=>{const el=$('#task-template').content.firstElementChild.cloneNode(true);$('.task-text',el).textContent=item.text;$('.task-plan',el).textContent=item.plan?`${item.plan.sessions} 次 × ${item.plan.duration} 分钟 · 已排期`:'';if(item.done)el.classList.add('done');$('.check',el).onclick=()=>{item.done=!item.done;save();renderTasks()};const remove=()=>{state.tasks[zone]=state.tasks[zone].filter(x=>x.id!==item.id);state.schedule=state.schedule.filter(x=>x.taskId!==item.id);save();renderAll();toast('任务及关联排期已删除')};$('.delete-task',el).onclick=remove;const menu=$('.move-menu',el);Object.entries(labels).filter(([z])=>z!==zone).forEach(([z,label])=>{const b=document.createElement('button');b.textContent=`移至 ${label}`;b.onclick=()=>moveTask(item.id,zone,z);menu.append(b)});const del=document.createElement('button');del.textContent='删除任务';del.onclick=remove;menu.append(del);$('.move',el).onclick=(e)=>{e.stopPropagation();menu.classList.toggle('open')};root.append(el)})
  })
}
function moveTask(id,from,to){const i=state.tasks[from].findIndex(x=>x.id===id);const [item]=state.tasks[from].splice(i,1);if(to==='flash'){state.flash.push(item);state.schedule=state.schedule.filter(x=>x.taskId!==id)}else{state.tasks[to].push(item);state.schedule.filter(x=>x.taskId===id).forEach(x=>x.zone=to)}save();renderAll();toast(`已移至「${labels[to]}」`)}
function renderSchedule(){const root=$('#schedule-list');root.innerHTML='';const scheduled=[...state.schedule].sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));$('#planned-count').textContent=scheduled.filter(x=>!x.done).length;$('#planned-minutes').textContent=scheduled.filter(x=>!x.done).reduce((n,x)=>n+x.duration,0);if(!scheduled.length){root.innerHTML='<p class="empty">任务完成拆分后，会自动出现在这里。</p>';return}const groups=Object.groupBy?Object.groupBy(scheduled,x=>x.date):scheduled.reduce((g,x)=>((g[x.date]||=[]).push(x),g),{});Object.entries(groups).forEach(([date,items])=>{const day=document.createElement('section');day.className='schedule-day';const d=new Date(`${date}T12:00:00`);day.innerHTML=`<div class="day-title"><strong>${new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'short'}).format(d)}</strong><span>${items.length} SESSIONS</span></div>`;items.forEach(item=>{const card=document.createElement('div');card.className=`session-card${item.done?' done':''}`;card.innerHTML=`<span class="session-time"></span><div class="session-copy"><strong></strong><small></small></div><button class="session-check" aria-label="完成此时间块">${item.done?'✓':''}</button><div class="session-edit"><input type="date" aria-label="调整日期"><input type="time" aria-label="调整时间"></div>`;$('.session-time',card).textContent=item.time;$('.session-copy strong',card).textContent=item.taskText;$('.session-copy small',card).textContent=`第 ${item.index}/${item.total} 次 · ${item.duration} 分钟 · ${labels[item.zone]}`;$('.session-check',card).onclick=()=>{item.done=!item.done;save();renderSchedule()};const [dateInput,timeInput]=$$('input',card);dateInput.value=item.date;timeInput.value=item.time;dateInput.onchange=()=>{item.date=dateInput.value;save();renderSchedule()};timeInput.onchange=()=>{item.time=timeInput.value;save();renderSchedule()};day.append(card)});root.append(day)})}
let flashCursor=0;
function renderFlash(){const total=state.flash.length;flashCursor=Math.min(flashCursor,Math.max(0,total-1));$('#flash-text').textContent=total?state.flash[flashCursor].text:'收入匣中暂时没有无法分类的念头。';$('#flash-index').textContent=`${total?flashCursor+1:0} / ${total}`;$('#flash-progress').style.width=total?`${((flashCursor+1)/total)*100}%`:'0%';$('#flash-done').disabled=!total;$('#flash-delete').disabled=!total}
function renderAll(){renderInbox();renderTasks();renderFlash();renderSchedule()}
$('#capture-form').onsubmit=(e)=>{e.preventDefault();const input=$('#task-input');const text=input.value.trim();if(!text)return;state.inbox.unshift({id:crypto.randomUUID(),text,createdAt:Date.now()});input.value='';save();renderInbox();toast('已收入，稍后再整理')};
const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
let recognition=null,voiceBase='',isListening=false;
function setListening(value){isListening=value;$('#voice-input').classList.toggle('listening',value);$('#voice-input').setAttribute('aria-label',value?'停止语音输入':'语音输入');$('#voice-status').textContent=value?'正在聆听，请说出念头、任务或提醒':'语音输入已停止'}
$('#voice-input').onclick=()=>{
  if(!SpeechRecognition){toast('此浏览器不支持语音识别，请使用手机键盘听写');return}
  if(isListening){recognition.stop();return}
  recognition=new SpeechRecognition();recognition.lang='zh-CN';recognition.continuous=false;recognition.interimResults=true;voiceBase=$('#task-input').value.trim();
  recognition.onstart=()=>{setListening(true);toast('正在聆听…')};
  recognition.onresult=(event)=>{let words='';for(let i=event.resultIndex;i<event.results.length;i++)words+=event.results[i][0].transcript;$('#task-input').value=[voiceBase,words.trim()].filter(Boolean).join(' ')};
  recognition.onerror=(event)=>{const messages={not_allowed:'请允许麦克风权限后重试','no-speech':'没有听到声音，请再试一次','audio-capture':'未找到可用麦克风'};toast(messages[event.error]||'语音识别暂时不可用')};
  recognition.onend=()=>{setListening(false);$('#task-input').focus()};recognition.start();
};
let installPrompt=null;
window.addEventListener('beforeinstallprompt',(event)=>{event.preventDefault();installPrompt=event;$('#install-app').classList.add('ready')});
window.addEventListener('appinstalled',()=>{installPrompt=null;$('#install-app').hidden=true;toast('金雀工作台已安装')});
$('#install-app').onclick=async()=>{if(window.matchMedia('(display-mode: standalone)').matches){toast('工作台已经以 APP 模式运行');return}if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;return}const ios=/iPad|iPhone|iPod/.test(navigator.userAgent);toast(ios?'请点击 Safari 分享按钮，再选择“添加到主屏幕”':'请在浏览器菜单中选择“安装应用”或“添加到主屏幕”')};
$('#flash-next').onclick=()=>{if(state.flash.length){flashCursor=(flashCursor+1)%state.flash.length;renderFlash()}};
$('#flash-done').onclick=()=>{if(!state.flash.length)return;const [item]=state.flash.splice(flashCursor,1);state.confirmed.push({...item,confirmedAt:Date.now()});save();renderFlash();toast('今日已确认')};
$('#flash-delete').onclick=()=>{if(!state.flash.length)return;state.flash.splice(flashCursor,1);save();renderFlash();toast('确认卡已删除')};
$('#plan-form').onsubmit=(e)=>{e.preventDefault();createPlan()};
$('#plan-cancel').onclick=()=>{pendingPlan=null;$('#plan-dialog').close()};
['#plan-sessions','#plan-duration','#plan-date','#plan-time','#plan-cadence'].forEach(id=>$(id).addEventListener('input',updatePlanPreview));
$$('.quadrant').forEach(zone=>{zone.ondragenter=(e)=>{if(e.dataTransfer.types.includes('text/plain'))zone.classList.add('drop-target')};zone.ondragover=(e)=>{e.preventDefault();e.dataTransfer.dropEffect='move'};zone.ondragleave=(e)=>{if(!zone.contains(e.relatedTarget))zone.classList.remove('drop-target')};zone.ondrop=(e)=>{e.preventDefault();zone.classList.remove('drop-target');const id=e.dataTransfer.getData('text/plain');if(id)classify(id,zone.dataset.zone)}});
document.addEventListener('click',()=>$$('.classify-menu.open,.move-menu.open').forEach(x=>x.classList.remove('open')));
document.addEventListener('keydown',(e)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#task-input').focus()}});

let timer={seconds:1500,total:1500,running:false,mode:'focus',tick:null};
function updateTimer(){const m=String(Math.floor(timer.seconds/60)).padStart(2,'0'),s=String(timer.seconds%60).padStart(2,'0');$('#timer-display').textContent=`${m}:${s}`;$('#timer-mode').textContent=timer.mode==='focus'?'专注':'休息';$('#timer-toggle').textContent=timer.running?'暂停':timer.mode==='focus'?'开始专注':'开始休息';$('#progress').style.strokeDashoffset=339.292*(1-timer.seconds/timer.total);document.title=`${m}:${s} · 金雀工作台`}
function chime(){const ctx=new (window.AudioContext||window.webkitAudioContext)();[0,0.18,0.36].forEach((delay,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=[523.25,659.25,783.99][i];g.gain.setValueAtTime(.0001,ctx.currentTime+delay);g.gain.exponentialRampToValueAtTime(.18,ctx.currentTime+delay+.02);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+delay+.6);o.connect(g).connect(ctx.destination);o.start(ctx.currentTime+delay);o.stop(ctx.currentTime+delay+.65)});toast(timer.mode==='focus'?'专注完成，请休息 5 分钟':'休息结束，可以开始下一轮了')}
function advance(){chime();timer.mode=timer.mode==='focus'?'break':'focus';timer.total=timer.seconds=timer.mode==='focus'?1500:300;timer.running=false;clearInterval(timer.tick);updateTimer()}
$('#timer-toggle').onclick=()=>{timer.running=!timer.running;if(timer.running){timer.tick=setInterval(()=>{timer.seconds--;if(timer.seconds<=0)advance();updateTimer()},1000)}else clearInterval(timer.tick);updateTimer()};
$('#timer-reset').onclick=()=>{clearInterval(timer.tick);timer={seconds:1500,total:1500,running:false,mode:'focus',tick:null};updateTimer();toast('计时器已重置')};
function updateClock(){const now=new Date();$('#date').textContent=new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(now);$('#time').textContent=now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));setInterval(updateClock,1000);setInterval(()=>{if(localDate(new Date())!==activeDay)runDailyClose(true)},60000);save();runDailyClose(false);updateClock();updateTimer();renderAll();
