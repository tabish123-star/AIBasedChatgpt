let chats = [];   // {id,title,messages:[{role,content}]}
let current = null;
let sample = null, busy = false;

// ---- Standalone settings (only used when NOT running inside claude.ai) ----
const API_KEY = "";                       // paste your Anthropic API key here (local use only!)
const MODEL   = "claude-sonnet-5-5";
const SYSTEM  = "You are MiniChat, a friendly, concise assistant. Answer helpfully. Use ``` code fences for code.";

// Calls the Anthropic API directly from the browser. Fine for local testing;
// for a public site, put the key on a server instead.
async function apiSample(turns, opts){
  const r = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{
      "content-type":"application/json",
      "x-api-key":API_KEY,
      "anthropic-version":"2023-06-01",
      "anthropic-dangerous-direct-browser-access":"true"
    },
    body:JSON.stringify({model:MODEL,max_tokens:1000,system:SYSTEM,messages:turns})
  });
  if(!r.ok) throw {code:"api_error",message:await r.text()};
  const data=await r.json();
  const text=data.content.map(c=>c.text||"").join("");
  opts.onText && opts.onText({text,delta:text});
  return {text,truncated:false};
}

const $ = id => document.getElementById(id);
const wrap = $('wrap'), input = $('input'), sendBtn = $('send');

function save(){ try{ localStorage.setItem('minichat', JSON.stringify(chats)); }catch(e){} }
function load(){ try{ chats = JSON.parse(localStorage.getItem('minichat')||'[]'); }catch(e){ chats=[]; } }

function newChat(){
  current = {id:Date.now(), title:'New chat', messages:[]};
  chats.unshift(current);
  render(); renderList();
}

function esc(s){ return s.replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function fmt(text){
  // minimal markdown: code blocks, inline code, bold
  const parts = text.split(/```/);
  return parts.map((p,i)=>{
    if(i%2===1){ return '<pre><code>'+esc(p.replace(/^\w*\n/,''))+'</code></pre>'; }
    if(i>0) p=p.replace(/^\n+/,''); if(i<parts.length-1) p=p.replace(/\n+$/,'');
    return esc(p).replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>');
  }).join('');
}

function render(){
  wrap.innerHTML='';
  $('title').textContent = current.title;
  if(!current.messages.length){
    wrap.innerHTML = '<div class="empty"><h2>What can I help with?</h2><div>Ask me anything.</div><div class="chips" id="chips"></div></div>';
    ['Explain recursion simply','Write a haiku about rain','Give me a 3-day workout plan','Debug: why is my JS "undefined"?'].forEach(t=>{
      const b=document.createElement('button'); b.className='chip'; b.textContent=t; b.onclick=()=>{input.value=t;send();};
      $('chips').appendChild(b);
    });
    return;
  }
  current.messages.forEach(m=>addRow(m.role,m.content));
  $('msgs').scrollTop = $('msgs').scrollHeight;
}

function addRow(role,content,typing){
  const row=document.createElement('div'); row.className='row '+role;
  if(role==='assistant'){ const a=document.createElement('div'); a.className='avatar'; a.textContent='M'; row.appendChild(a); }
  const b=document.createElement('div'); b.className='bubble';
  if(typing) b.innerHTML='<span class="dots"><span></span><span></span><span></span></span>';
  else if(role==='user') b.textContent=content; else b.innerHTML=fmt(content);
  row.appendChild(b); wrap.appendChild(row);
  return b;
}

function renderList(){
  const l=$('list'); l.innerHTML='';
  chats.forEach(c=>{
    const b=document.createElement('button'); b.className='chat-item'+(c===current?' active':''); b.textContent=c.title;
    b.onclick=()=>{current=c;render();renderList();$('side').classList.remove('open');};
    l.appendChild(b);
  });
}

async function send(){
  const text=input.value.trim();
  if(!text||busy) return;
  if(!sample){ $('note').textContent='AI replies are unavailable in this view.'; return; }
  busy=true; sendBtn.disabled=true;
  if(!current.messages.length) current.title=text.slice(0,40);
  current.messages.push({role:'user',content:text});
  input.value=''; autosize();
  render(); renderList();
  const bubble=addRow('assistant','',true);
  $('msgs').scrollTop=$('msgs').scrollHeight;
  try{
    const history=current.messages.map(m=>({role:m.role,content:m.content}));
    const turns=window.claude ? [{role:'user',content:SYSTEM},{role:'assistant',content:'Understood.'}].concat(history) : history;
    const res=await sample(turns,{cache:false,onText:({text})=>{ bubble.innerHTML=fmt(text); $('msgs').scrollTop=$('msgs').scrollHeight; }});
    current.messages.push({role:'assistant',content:res.text});
  }catch(e){
    const msg = (e && e.code==='not_granted') ? 'Permission to use AI was declined.' : 'Sorry, something went wrong. Please try again.';
    current.messages.push({role:'assistant',content:msg});
  }
  busy=false; save(); render(); renderList(); updateBtn();
}

function autosize(){ input.style.height='auto'; input.style.height=Math.min(input.scrollHeight,180)+'px'; updateBtn(); }
function updateBtn(){ sendBtn.disabled = busy || !input.value.trim(); }

input.addEventListener('input',autosize);
input.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();} });
sendBtn.onclick=send;
$('new').onclick=()=>{ if(current.messages.length) newChat(); $('side').classList.remove('open'); };
$('menu').onclick=()=>$('side').classList.toggle('open');

load();
if(chats.length && chats[0].messages.length){ current=chats[0]; } else { chats=chats.filter(c=>c.messages.length); newChat(); }
render(); renderList();

(async()=>{
  try{ sample = window.claude ? await claude.use('sample') : (API_KEY ? apiSample : null); }catch(e){ sample=null; }
  if(!sample) $('note').textContent = window.claude ? 'AI replies are unavailable in this view.' : 'Add your API key in app.js to enable replies.';
})();
