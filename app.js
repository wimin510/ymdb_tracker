import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDocs, onSnapshot,
  writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const $ = id => document.getElementById(id);
const STORAGE_KEY = "watch-read-tracker-v1";
const platforms = {
  screen: ["Netflix","Prime Video","Catchplay","MyVideo","LINE TV","Disney+","巴哈姆特動畫瘋","Hami Video","KKTV","friDay影音","電視台／有線頻道","其他／不固定"],
  comic: ["實體書","Readmoo","Kobo","HyRead","LINE WEBTOON","CCC追漫台","BookWalker","少年Jump+","漫畫人／網頁","其他"]
};
let works = loadWorks();
let activeKind = "all";
let firebaseApp = null;
let auth = null;
let db = null;
let unsubscribeWorks = null;
let currentUser = null;
let cloudReady = false;
let syncTimer = null;
let toastTimer;
function loadWorks(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")}catch(e){return []}}
function persist(){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(works));render();
  if(currentUser && cloudReady)queueCloudSync()
}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function pct(w){return w.total>0?Math.min(100,Math.round(w.current/w.total*100)):0}
function fmtDate(s){if(!s)return "未設定開始日期";const [y,m,d]=s.split("-");return `${y}/${m}/${d}`}
function statusText(s){return ({想看:"待觀看／待閱讀",進行中:"進行中",暫停:"暫停",已完結:"已完結",棄追:"棄追"})[s]||s}
function render(){
  const active=works.filter(w=>w.status==="進行中").length;
  $("activeCount").textContent=active;
  const screens=works.filter(w=>w.kind==="screen"), comics=works.filter(w=>w.kind==="comic");
  const done=works.filter(w=>w.status==="已完結").length;
  $("summaryCards").innerHTML=[
    ["作品總數",works.length,"部作品"],["影劇",screens.length,"部作品"],["漫畫",comics.length,"部作品"],["已完結",done,"部作品"]
  ].map(x=>`<div class="summary-card"><span>${x[0]}</span><strong>${x[1]}<em>${x[2]}</em></strong></div>`).join("");
  const q=$("searchInput").value.trim().toLowerCase(), st=$("statusFilter").value, sort=$("sortFilter").value;
  let list=works.filter(w=>(activeKind==="all"||w.kind===activeKind)&&(st==="all"||w.status===st)&&(!q||w.title.toLowerCase().includes(q)||w.platform.toLowerCase().includes(q)||w.genre.toLowerCase().includes(q)));
  list.sort((a,b)=>sort==="name"?a.title.localeCompare(b.title,"zh-Hant"):sort==="progress"?pct(b)-pct(a):sort==="started"?(b.started||"").localeCompare(a.started||""):b.updated-a.updated);
  $("workGrid").innerHTML=list.map(w=>{
    const p=pct(w), unknown=!(w.total>0);
    return `<article class="work-card">
      <div class="card-top"><span class="kind-badge ${w.kind==="comic"?"comic":""}">${w.kind==="comic"?"漫畫":"影劇"} · ${esc(w.genre)}</span><button class="menu-btn" data-action="edit" data-id="${w.id}" aria-label="編輯作品">⋯</button></div>
      <h3 class="work-title">${esc(w.title)}</h3>
      <div class="work-meta"><span>${esc(w.platform||"未指定平台")}</span><span>·</span><span class="status ${esc(w.status)}">${statusText(w.status)}</span></div>
      <div class="progress-row"><span class="progress-numbers">${w.current}${unknown?"":` <small>/ ${w.total}</small>`} <small>${esc(w.unit)}</small></span><span class="progress-percent">${unknown?(w.current?`${w.current} ${esc(w.unit)}`:"未設定總數"):`${p}%`}</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${unknown?0:p}%"></div></div>
      <div class="card-bottom"><span class="started">${w.started?`開始於 ${fmtDate(w.started)}`:"尚未設定開始日期"}</span><div class="card-actions"><button class="mini-btn" data-action="minus" data-id="${w.id}" ${w.current<=0?"disabled":""}>−1</button><button class="mini-btn bump" data-action="plus" data-id="${w.id}">＋1 ${esc(w.unit)}</button></div></div>
      ${w.notes?`<p class="work-meta" style="margin-top:13px;line-height:1.6;display:block;overflow-wrap:anywhere">${esc(w.notes)}</p>`:""}
    </article>`;
  }).join("");
  $("emptyState").classList.toggle("hidden",list.length>0);
  $("workGrid").classList.toggle("hidden",list.length===0);
}
function updatePlatformOptions(selected=""){
  const kind=$("kind").value, opts=platforms[kind];
  $("platform").innerHTML=opts.map(p=>`<option>${esc(p)}</option>`).join("");
  if(selected&&opts.includes(selected))$("platform").value=selected;
  $("unit").value=kind==="comic"?"話":"集";
  $("genre").value=kind==="comic"?"漫畫":"動畫";
}
function openForm(w=null){
  $("workForm").reset();$("formError").textContent="";
  $("dialogTitle").textContent=w?"編輯作品":"新增作品";
  $("workId").value=w?.id||"";
  $("kind").value=w?.kind||"screen";updatePlatformOptions(w?.platform||"");
  if(w){$("title").value=w.title;$("genre").value=w.genre;$("unit").value=w.unit;$("total").value=w.total||"";$("current").value=w.current;$("started").value=w.started||"";$("status").value=w.status;$("notes").value=w.notes||""}
  else {$("current").value=0;$("status").value="想看";$("started").value=new Date().toISOString().slice(0,10)}
  $("workDialog").showModal();$("title").focus();
}
function showToast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2300)}
$("addBtn").onclick=()=>openForm();$("emptyAddBtn").onclick=()=>openForm();$("closeDialog").onclick=()=>$("workDialog").close();$("cancelBtn").onclick=()=>$("workDialog").close();
$("kind").onchange=()=>updatePlatformOptions();
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");activeKind=b.dataset.kind;render()});
["searchInput","statusFilter","sortFilter"].forEach(id=>$(id).addEventListener(id==="searchInput"?"input":"change",render));
$("workGrid").addEventListener("click",e=>{
  const b=e.target.closest("button[data-action]");if(!b)return;
  const w=works.find(x=>x.id===b.dataset.id);if(!w)return;
  if(b.dataset.action==="edit"){openForm(w);return}
  if(b.dataset.action==="plus"){w.current++;if(w.total>0&&w.current>=w.total){w.current=w.total;w.status="已完結";showToast("已達總數，作品標記為已完結")}else if(w.status==="想看")w.status="進行中"}
  if(b.dataset.action==="minus"){w.current=Math.max(0,w.current-1);if(w.status==="已完結"&&w.current<w.total)w.status="進行中"}
  w.updated=Date.now();persist();
});
$("workForm").addEventListener("submit",e=>{
  e.preventDefault();const title=$("title").value.trim(), totalRaw=$("total").value, total=totalRaw===""?0:Number(totalRaw), current=Number($("current").value||0);
  if(!title){$("formError").textContent="請輸入作品名稱。";return}
  if(total<0||current<0||!Number.isInteger(total)||!Number.isInteger(current)){$("formError").textContent="總數與目前進度必須是大於或等於 0 的整數。";return}
  if(total>0&&current>total){$("formError").textContent="目前進度不能大於總數。";return}
  const id=$("workId").value||crypto.randomUUID();
  const old=works.find(w=>w.id===id);
  const obj={id,title,kind:$("kind").value,platform:$("platform").value,genre:$("genre").value,unit:$("unit").value,total,current,started:$("started").value,status:$("status").value,notes:$("notes").value.trim(),updated:Date.now(),created:old?.created||Date.now()};
  if(total>0&&current===total&&current>0)obj.status="已完結";
  const idx=works.findIndex(w=>w.id===id);if(idx>=0)works[idx]=obj;else works.unshift(obj);
  $("workDialog").close();persist();showToast(old?"作品資料已更新":"已新增作品");
});
$("exportBtn").onclick=()=>{
  const blob=new Blob([JSON.stringify({app:"追劇讀漫",version:1,exportedAt:new Date().toISOString(),works},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`追劇讀漫備份-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);showToast("備份檔已匯出");
};
$("importFile").onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{const data=JSON.parse(await file.text()),incoming=Array.isArray(data)?data:data.works;if(!Array.isArray(incoming))throw new Error("格式不正確");
    if(!confirm(`備份內有 ${incoming.length} 部作品。要匯入並合併到目前清單嗎？同 ID 的作品會以備份內容覆蓋。`))return;
    const map=new Map(works.map(w=>[w.id,w]));incoming.forEach(w=>{if(w&&w.id&&w.title)map.set(w.id,{...w,updated:w.updated||Date.now()})});works=[...map.values()];persist();showToast("備份匯入完成");
  }catch(err){alert("無法匯入：請確認選擇的是本 App 匯出的 JSON 備份檔。")}finally{e.target.value=""}
};
// Firebase Authentication + Cloud Firestore. Configure firebase-config.js first.
function setSyncStatus(msg){const el=$("syncStatus");if(el)el.textContent=msg}
function hasFirebaseConfig(){
  const c=window.APP_CONFIG||{};
  return ["apiKey","authDomain","projectId","appId"].every(k=>c.FIREBASE_CONFIG?.[k] && !String(c.FIREBASE_CONFIG[k]).includes("YOUR_"));
}
function userWorksCollection(uid){return collection(db,"users",uid,"works")}
async function writeWorksToCloud(items){
  if(!db||!currentUser||!cloudReady||!items.length)return;
  for(let i=0;i<items.length;i+=450){
    const batch=writeBatch(db);
    items.slice(i,i+450).forEach(w=>{
      const ref=doc(db,"users",currentUser.uid,"works",String(w.id));
      batch.set(ref,{...w,updated:Number(w.updated||Date.now()),serverUpdatedAt:serverTimestamp()},{merge:true});
    });
    await batch.commit();
  }
}
async function syncToCloud(){
  if(!db||!currentUser||!cloudReady)return;
  setSyncStatus("同步中…");
  try{await writeWorksToCloud(works);setSyncStatus("已同步")}
  catch(err){console.error(err);setSyncStatus("同步失敗");showToast("雲端同步失敗，請確認 Firebase 設定與網路")}
}
function queueCloudSync(){
  if(!currentUser||!cloudReady)return;
  clearTimeout(syncTimer);syncTimer=setTimeout(syncToCloud,650);
}
async function mergeCloudSnapshot(snapshot){
  if(!currentUser)return;
  const cloudItems=snapshot.docs.map(d=>({...d.data(),id:d.id}));
  const map=new Map(works.map(w=>[String(w.id),w]));
  let changed=false;
  for(const incoming of cloudItems){
    const local=map.get(String(incoming.id));
    if(!local || Number(incoming.updated||0)>Number(local.updated||0)){
      const clean={...incoming};delete clean.serverUpdatedAt;
      map.set(String(incoming.id),clean);changed=true;
    }
  }
  if(changed){
    works=[...map.values()].sort((a,b)=>(b.updated||0)-(a.updated||0));
    localStorage.setItem(STORAGE_KEY,JSON.stringify(works));render();
  }
  setSyncStatus("已同步");
}
async function loadCloudAndMerge(){
  if(!db||!currentUser)return;
  setSyncStatus("載入雲端…");
  try{
    const snap=await getDocs(userWorksCollection(currentUser.uid));
    const map=new Map(works.map(w=>[String(w.id),w]));
    snap.docs.forEach(d=>{
      const incoming={...d.data(),id:d.id};delete incoming.serverUpdatedAt;
      const local=map.get(String(incoming.id));
      if(!local||Number(incoming.updated||0)>Number(local.updated||0))map.set(String(incoming.id),incoming);
    });
    works=[...map.values()].sort((a,b)=>(b.updated||0)-(a.updated||0));
    localStorage.setItem(STORAGE_KEY,JSON.stringify(works));render();
    cloudReady=true;
    await syncToCloud();
    if(unsubscribeWorks)unsubscribeWorks();
    unsubscribeWorks=onSnapshot(userWorksCollection(currentUser.uid),snap=>{
      mergeCloudSnapshot(snap).catch(err=>{console.error(err);setSyncStatus("同步失敗")});
    },err=>{console.error(err);setSyncStatus("同步失敗")});
    $("loginBtn").classList.add("hidden");$("logoutBtn").classList.remove("hidden");
    const note=$("storageNote");if(note)note.textContent="已使用 Google 登入，作品會同步到 Firebase 雲端。建議仍定期匯出備份。";
  }catch(err){console.error(err);cloudReady=false;setSyncStatus("雲端連線失敗");showToast("讀取雲端失敗，請檢查 Firestore Rules")}
}
async function setupCloud(){
  if(!hasFirebaseConfig()){
    setSyncStatus("本機模式");
    $("loginBtn").title="請先依 README 設定 Firebase";
    return;
  }
  try{
    firebaseApp=initializeApp(window.APP_CONFIG.FIREBASE_CONFIG);
    auth=getAuth(firebaseApp);db=getFirestore(firebaseApp);
    await getRedirectResult(auth).catch(err=>console.warn("Redirect result:",err));
    onAuthStateChanged(auth,async user=>{
      currentUser=user||null;
      if(user)await loadCloudAndMerge();
      else{
        cloudReady=false;
        if(unsubscribeWorks){unsubscribeWorks();unsubscribeWorks=null}
        setSyncStatus("本機模式");
        $("loginBtn").classList.remove("hidden");$("logoutBtn").classList.add("hidden");
        const note=$("storageNote");if(note)note.textContent="目前資料儲存在這個瀏覽器。登入 Google 後可同步到 Firebase；請定期匯出備份。";
      }
    });
  }catch(err){console.error(err);setSyncStatus("設定有誤")}
}
$("loginBtn").addEventListener("click",async()=>{
  if(!hasFirebaseConfig()||!auth){
    alert("尚未設定 Firebase。請依 README 建立 Firebase 專案、啟用 Google Authentication 與 Firestore，並填入 firebase-config.js。");
    return;
  }
  try{
    const provider=new GoogleAuthProvider();
    provider.setCustomParameters({prompt:"select_account"});
    await signInWithPopup(auth,provider);
  }catch(err){
    console.error(err);
    if(["auth/popup-blocked","auth/operation-not-supported-in-this-environment"].includes(err.code)){
      try{await signInWithRedirect(auth,new GoogleAuthProvider())}
      catch(redirectErr){alert("Google 登入失敗："+redirectErr.message)}
    }else if(err.code!=="auth/popup-closed-by-user"){
      alert("Google 登入失敗："+err.message);
    }
  }
});
$("logoutBtn").addEventListener("click",async()=>{if(auth)await signOut(auth)});

if("serviceWorker" in navigator && location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
render();
setupCloud();