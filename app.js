'use strict';
const $=id=>document.getElementById(id);let rows=[],selected=-1,backupList=[],historyList=[];const DB='Lager_local_v1',STORE='kv';
function db(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function get(key){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readonly');const q=tx.objectStore(STORE).get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);tx.oncomplete=()=>d.close()})}
async function put(key,val){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(val,key);tx.oncomplete=()=>{d.close();resolve()};tx.onerror=()=>reject(tx.error)})}
function confirmAction(message,yesText='SICHER – ÜBERNEHMEN'){
  return new Promise(resolve=>{
    const layer=$('confirmLayer'),yes=$('confirmYes'),no=$('confirmNo');
    $('confirmText').textContent=message;yes.textContent=yesText;layer.hidden=false;
    const finish=answer=>{layer.hidden=true;yes.onclick=null;no.onclick=null;resolve(answer)};
    yes.onclick=()=>finish(true);no.onclick=()=>finish(false);no.focus();
  });
}
async function putState(nextRows,nextHistory){
  const d=await db();return new Promise((resolve,reject)=>{
    const tx=d.transaction(STORE,'readwrite');const store=tx.objectStore(STORE);
    store.put(nextRows,'rows');store.put(nextHistory,'history');
    tx.oncomplete=()=>{d.close();resolve()};tx.onerror=()=>{d.close();reject(tx.error)};
    tx.onabort=()=>{d.close();reject(tx.error||new Error('Speicherung abgebrochen'))};
  });
}
function resetToStart(){selected=-1;$('editor').hidden=true;$('newArticle').hidden=true;$('search').value='';renderResults();showPage('stock');$('search').focus()}
function historyCSV(){return csv([['Nummer','Bezeichnung','Menge','Datum','Vorher','Nachher','Lagerort','Typ'],...pruneHistory(historyList).map(x=>[x.part||'',x.name||'',x.kind==='new'?String(x.after??0):String(Number(x.after)-Number(x.before)),new Date(x.at).toISOString(),x.before??0,x.after??0,x.location||'',x.kind||'change'])])}
function parseHistoryCSV(text){const parsed=parseCSV(text);if(parsed.length<1)throw new Error('Datei ist leer');const heads=parsed[0].map(x=>x.trim().toLowerCase());const required=['nummer','bezeichnung','menge','datum'];if(required.some(x=>!heads.includes(x)))throw new Error('Spalten Nummer, Bezeichnung, Menge, Datum fehlen');const col=n=>heads.indexOf(n),result=[];for(const line of parsed.slice(1)){
 const part=String(line[col('nummer')]||'').trim(),name=String(line[col('bezeichnung')]||'').trim(),date=String(line[col('datum')]||'').trim();
 const at=Date.parse(date);if(!part||!Number.isFinite(at))throw new Error('Ungültige Nummer oder Datum in der Änderungsliste');
 const kind=col('typ')>=0&&line[col('typ')]==='new'?'new':undefined;
 const diff=Number(String(line[col('menge')]||'0').replace(',','.'));
 const before=col('vorher')>=0?Number(String(line[col('vorher')]||'0').replace(',','.')):0;
 const after=col('nachher')>=0?Number(String(line[col('nachher')]||'0').replace(',','.')):before+diff;
 if(![diff,before,after].every(Number.isFinite))throw new Error('Ungültige Menge in der Änderungsliste');
 result.push({part,name,at,before,after,kind,location:col('lagerort')>=0?line[col('lagerort')]||'':''});
 }return pruneHistory(result)}
function parseCSV(text){const first=text.replace(/^\uFEFF/,'').split(/\r?\n/,1)[0];const separator=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';text=text.replace(/^\uFEFF/,'');let out=[],line=[],cell='',quoted=false;for(let i=0;i<text.length;i++){let c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}else if(c==='"')quoted=true;else if(c===separator){line.push(cell);cell=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;line.push(cell);if(line.some(x=>x!==''))out.push(line);line=[];cell=''}else cell+=c}line.push(cell);if(line.some(x=>x!==''))out.push(line);return out}
function csv(rows){return '\uFEFF'+rows.map(r=>r.map(x=>{const s=String(x??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(',')).join('\r\n')+'\r\n'}
function download(filename,content){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function timestamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return p(d.getDate())+p(d.getMonth()+1)+String(d.getFullYear()).slice(2)+'_'+p(d.getHours())+p(d.getMinutes())}
function backupName(){let name='Lager_sicherung_'+timestamp()+'.csv';let n=2;while(backupList.some(b=>b.name===name)){name='Lager_sicherung_'+timestamp()+'_'+n+'.csv';n++}return name}
async function backup(silent=false){if(!rows.length)return;backupList.unshift({name:backupName(),content:csv(rows)});backupList=backupList.slice(0,10);await put('backups',backupList);renderBackups();if(!silent)alert('Sicherung lokal erstellt. Zum externen Sichern bitte herunterladen.')}
function renderBackups(){const area=$('backups');area.replaceChildren();$('backupCount').textContent='('+backupList.length+'/10)';backupList.forEach((b,i)=>{const d=document.createElement('div');d.className='backupitem';const s=document.createElement('span');s.textContent=b.name;const btn=document.createElement('button');btn.textContent='Herunterladen';btn.onclick=()=>download(b.name,b.content);d.append(s,btn);area.append(d)})}
function number(s){let n=Number(String(s).trim().replace(',','.'));return Number.isFinite(n)?n:0}
function format(n,old){return String(old??'').includes(',')?n.toFixed(Number.isInteger(n)?2:2).replace('.',','):String(n)}
function renderResults(){const term=$('search').value.trim().toLocaleLowerCase(),box=$('results');box.replaceChildren();$('newArticle').hidden=true;const add=$('addUnknown');add.hidden=true;if(!term){$('count').textContent=rows.length>1?(rows.length-1)+' Artikel geladen · Suche eingeben':'Keine Artikel geladen';return}const hits=[];for(let i=1;i<rows.length;i++){const r=rows[i];if(String(r[4]??'').toLocaleLowerCase().includes(term)||String(r[9]??'').toLocaleLowerCase().includes(term)){hits.push(i);if(hits.length>=100)break}}$('count').textContent=hits.length+(hits.length===100?' (max. 100 angezeigt)':'')+' Treffer';for(const i of hits){const r=rows[i],b=document.createElement('button');b.className='result';const strong=document.createElement('b');strong.textContent=r[4]||'(ohne Teilenummer)';const small=document.createElement('small');small.textContent=(r[9]||'')+' · Menge: '+(r[6]||'0')+' · Lagerort: '+(r[7]||'—');b.append(strong,small);b.onclick=()=>selectRow(i);box.append(b)}if(!hits.length&&term){add.hidden=false}}
function selectRow(i){selected=i;const r=rows[i];$('part').value=r[4]||'';$('name').value=r[9]||'';$('location').value=r[7]||'';$('qty').value=r[6]||'0';$('editor').hidden=false;$('editor').scrollIntoView({behavior:'smooth',block:'start'})}
async function save(){if(selected<1)return;const raw=$('qty').value.trim().replace(',','.');const n=Number(raw);if(!raw||!Number.isFinite(n)||n<0){alert('Bitte gültige Menge ab 0 eingeben');return}
 const r=rows[selected],before=number(r[6]),oldLocation=r[7]||'',oldName=r[9]||'';
 const newLocation=$('location').value,newName=$('name').value;
 if(before===n&&oldLocation===newLocation&&oldName===newName){resetToStart();return}
 if(!await confirmAction('Ist diese Artikeländerung richtig und soll sie jetzt gespeichert werden?'))return;
 const nextRows=rows.map(row=>row.slice());nextRows[selected][6]=format(n,r[6]);nextRows[selected][7]=newLocation;nextRows[selected][9]=newName;
 const nextHistory=pruneHistory([{at:Date.now(),part:r[4]||'',name:newName,before,after:n,location:newLocation},...historyList]);
 try{await putState(nextRows,nextHistory);rows=nextRows;historyList=nextHistory;renderHistory();$('info').textContent='Änderung lokal gespeichert · '+new Date().toLocaleString('de-AT');resetToStart()}
 catch(err){alert('Speichern fehlgeschlagen: '+err.message);console.error(err)}
}
function changeQty(delta){const n=Math.max(0,number($('qty').value)+delta);$('qty').value=format(n,$('qty').value)}
async function init(){try{rows=await get('rows');backupList=await get('backups')||[];historyList=pruneHistory(await get('history')||[]);await put('history',historyList);renderHistory();if(!rows){rows=[];await put('rows',rows)}$('status').textContent='Lokal bereit';$('info').textContent=rows.length?((rows.length-1)+' Artikel lokal gespeichert'):'Noch keine Artikelliste geladen. Bitte CSV-Datei importieren.';renderResults();renderBackups()}catch(e){$('status').textContent='Fehler';$('info').textContent='Daten konnten nicht geladen werden: '+e.message;console.error(e)}}
const HISTORY_DAYS=400;
function pruneHistory(items){const cutoff=Date.now()-HISTORY_DAYS*86400000;return (Array.isArray(items)?items:[]).filter(x=>x&&Number.isFinite(x.at)&&x.at>=cutoff).sort((a,b)=>b.at-a.at)}
async function recordChange(item){historyList=pruneHistory([item,...historyList]);await put('history',historyList);renderHistory()}
function renderHistory(){const area=$('historyList');area.replaceChildren();historyList=pruneHistory(historyList);if(!historyList.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent='Noch keine Änderungen vorhanden.';tr.append(td);area.append(tr);return}for(const item of historyList){const tr=document.createElement('tr'),diff=Number(item.after)-Number(item.before);tr.className=item.kind==='new'?'history-new':diff<0?'history-minus':diff>0?'history-plus':'history-neutral';const values=[item.part||'',item.name||'',item.kind==='new'?String(item.after??0)+' (neu)':(diff>0?'+':'')+String(diff),new Date(item.at).toLocaleString('de-AT',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})];for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td)}area.append(tr)}}
function showPage(page){$('stockPage').hidden=page!=='stock';$('filesPage').hidden=page!=='files';$('historyPage').hidden=page!=='history';$('openFiles').hidden=page==='files';$('openHistory').hidden=page==='history';$('backToStock').hidden=page==='stock';if(page==='history')renderHistory();window.scrollTo({top:0,behavior:'instant'})}
$('openFiles').onclick=()=>showPage('files');$('openHistory').onclick=()=>showPage('history');$('backToStock').onclick=()=>showPage('stock');
$('addUnknown').onclick=()=>{const part=$('search').value.trim();if(!part)return;$('newPart').value=part.toUpperCase();$('newName').value='';$('newQty').value='0';$('newArticle').hidden=false;$('newArticle').scrollIntoView({behavior:'smooth',block:'start'})};
$('cancelNew').onclick=()=>{$('newArticle').hidden=true};
$('saveNew').onclick=async()=>{const part=$('newPart').value.trim().toUpperCase(),name=$('newName').value.trim(),raw=$('newQty').value.trim().replace(',','.'),qty=Number(raw);if(!part||!name||raw===''||!Number.isFinite(qty)||qty<0){alert('Bitte Nummer, Bezeichnung und gültige Menge eingeben.');return}if(rows.slice(1).some(r=>String(r[4]||'').trim().toUpperCase()===part)){alert('Diese Nummer ist bereits in der Hauptliste. Bitte dort bearbeiten.');return}if(historyList.some(h=>h.kind==='new'&&String(h.part).toUpperCase()===part)){if(!confirm('Diese Nummer wurde bereits vorgemerkt. Trotzdem nochmals eintragen?'))return}await recordChange({at:Date.now(),part,name,before:0,after:qty,kind:'new'});$('newArticle').hidden=true;alert('Neuer Artikel nur in „Letzte Änderungen“ vorgemerkt. Die Hauptliste wurde nicht verändert.');showPage('history')};
$('search').addEventListener('input',renderResults);$('plus').onclick=()=>changeQty(1);$('minus').onclick=()=>changeQty(-1);$('save').onclick=save;$('cancel').onclick=()=>{$('editor').hidden=true;selected=-1};
$('export').onclick=()=>download('Lager_aktuell.csv',csv(rows));
$('exportHistory').onclick=()=>download('Lager_Aenderungen.csv',historyCSV());
$('exportBoth').onclick=()=>{download('Lager_aktuell.csv',csv(rows));setTimeout(()=>download('Lager_Aenderungen.csv',historyCSV()),450)};
$('backup').onclick=()=>backup();
$('import').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{
 let parsed=parseCSV(await f.text());if(parsed.length<2||parsed[0].length<10||parsed.slice(1).some(r=>r.length<10)){alert('Ungültige Hauptlisten-CSV: Mindestens 10 Spalten pro Zeile erforderlich.');return}
 if(/^(AutoS12|Lager)_/i.test(f.name)&&!f.name.toLowerCase().startsWith('lager_')){if(!await confirmAction('WARNUNG: Diese Datei stammt offenbar aus der anderen App! Trotzdem fuer Lager verwenden?','TROTZDEM WEITER'))return;}
 if(!await confirmAction('ACHTUNG: Die bisherige Hauptliste wird ersetzt! Ist '+f.name+' richtig und wirklich der neueste Datenstand?','JA – NEUESTEN STAND ÜBERNEHMEN'))return;
 await backup(true);await put('rows',parsed);rows=parsed;resetToStart();$('info').textContent=(rows.length-1)+' Artikel importiert und lokal gespeichert';
 }catch(err){alert('Import fehlgeschlagen: '+err.message);console.error(err)}finally{e.target.value=''}};
$('importHistory').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{
 const parsed=parseHistoryCSV(await f.text());
 if(/^(AutoS12|Lager)_/i.test(f.name)&&!f.name.toLowerCase().startsWith('lager_')){if(!await confirmAction('WARNUNG: Diese Datei stammt offenbar aus der anderen App! Trotzdem fuer Lager verwenden?','TROTZDEM WEITER'))return;}
 if(!await confirmAction('ACHTUNG: Die bisherige Änderungsliste wird ersetzt! Ist '+f.name+' richtig und wirklich der neueste Datenstand?','JA – NEUESTEN STAND ÜBERNEHMEN'))return;
 await put('history',parsed);historyList=parsed;renderHistory();resetToStart();
 }catch(err){alert('Import fehlgeschlagen: '+err.message);console.error(err)}finally{e.target.value=''}};

if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(console.warn);init();

// OCR fuer gedruckte Teilenummern. Das Foto wird nur im Arbeitsspeicher verarbeitet.
const OCR_URL='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let ocrWorker=null;
function setScanStatus(message){$('scanStatus').textContent=message;}
function loadOCRScript(){return new Promise((resolve,reject)=>{if(window.Tesseract)return resolve();const s=document.createElement('script');s.src=OCR_URL;s.onload=resolve;s.onerror=()=>reject(new Error('OCR-Bibliothek nicht erreichbar. Bitte fuer den ersten Scan Internet einschalten.'));document.head.append(s);});}
async function getOCRWorker(){
  if(ocrWorker)return ocrWorker;
  await loadOCRScript();
  setScanStatus('Texterkennung wird vorbereitet (beim ersten Mal mit Internet) …');
  ocrWorker=await Tesseract.createWorker('eng',1,{
    workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    langPath:'https://tessdata.projectnaptha.com/4.0.0',
    cacheMethod:'write'
  });
  await ocrWorker.setParameters({tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.',preserve_interword_spaces:'1'});
  return ocrWorker;
}
function normalizePart(s){return String(s||'').toUpperCase().replace(/\s+/g,'').trim();}
function findPartInText(text){
  const t=String(text||'').toUpperCase();
  const candidates=[];
  // OCR kann Leerzeichen zwischen den Zeichen setzen.
  const condensed=t.replace(/\s+/g,'');
  for(const m of condensed.matchAll(/LAT[0-9]{2,8}/g))candidates.push(m[0]);
  for(const m of condensed.matchAll(/[0-9]+(?:\.[0-9]+){3}/g))candidates.push(m[0]);
  if(!candidates.length)return null;
  const known=new Set(rows.slice(1).map(r=>normalizePart(r[4])));
  return candidates.find(c=>known.has(c))||candidates[0];
}
// Live-Kamera mit Suchrahmen. Bei inkompatiblen Handys normale Android-Kamera.
let cameraStream=null;
function closeCamera(){
  if(cameraStream){cameraStream.getTracks().forEach(track=>track.stop());cameraStream=null;}
  $('cameraVideo').srcObject=null;$('cameraPanel').hidden=true;
}
$('scan').onclick=async()=>{
  closeCamera();setScanStatus('Kamera wird geöffnet …');
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Keine Live-Kamera');
    cameraStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
    $('cameraVideo').srcObject=cameraStream;$('cameraPanel').hidden=false;
    await $('cameraVideo').play();setScanStatus('Nummer im grünen Rahmen ausrichten.');
  }catch(err){
    console.warn('Live-Kamera nicht verfügbar, Android-Kamera wird verwendet:',err);
    closeCamera();setScanStatus('Normale Android-Kamera wird geöffnet.');
    $('scanPhoto').value='';$('scanPhoto').click();
  }
};
$('cancelScan').onclick=()=>{closeCamera();setScanStatus('Kamera geschlossen.')};
$('takeScan').onclick=async()=>{
  const video=$('cameraVideo');
  if(!cameraStream||!video.videoWidth){setScanStatus('Bitte kurz warten, bis die Kamera bereit ist.');return;}
  const canvas=document.createElement('canvas');
  // Das Suchfenster umfasst die mittleren 82% der Bildbreite und 30% der Bildhöhe.
  const w=video.videoWidth,h=video.videoHeight;
  const cropW=Math.round(w*.82),cropH=Math.round(h*.30);
  canvas.width=cropW;canvas.height=cropH;
  canvas.getContext('2d').drawImage(video,Math.round((w-cropW)/2),Math.round((h-cropH)/2),cropW,cropH,0,0,cropW,cropH);
  closeCamera();await recognizeScan(canvas);
};
async function prepareScanImage(source,mode){
  const bitmap=await createImageBitmap(source);
  const canvas=document.createElement('canvas');
  // Keine kuenstliche Hochskalierung: OCR bekommt echte Bildpixel.
  const scale=Math.min(1,3000/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  if(mode===1){const img=ctx.getImageData(0,0,canvas.width,canvas.height);const data=img.data;for(let i=0;i<data.length;i+=4){const v=.299*data[i]+.587*data[i+1]+.114*data[i+2];const sharp=v>155?255:0;data[i]=data[i+1]=data[i+2]=sharp}ctx.putImageData(img,0,0)}
  return canvas;
}
async function recognizeScan(source){
  $('scan').disabled=true;
  try{
    setScanStatus('Texterkennung wird vorbereitet …');
    const worker=await getOCRWorker();let code=null;
    for(let mode=0;mode<2&&!code;mode++){
      setScanStatus(mode===0?'Teilenummer wird gelesen …':'Zweiter Versuch mit höherem Kontrast …');
      const image=await prepareScanImage(source,mode);
      const result=await worker.recognize(image);code=findPartInText(result.data.text);
    }
    if(!code){setScanStatus('Keine Nummer erkannt. Abstand oder Beleuchtung ändern und erneut versuchen.');return}
    $('search').value=code;renderResults();
    const hits=$('results').querySelectorAll('button.result');
    setScanStatus('Erkannt: '+code+(hits.length?' – passenden Artikel antippen.':' – kein passender Artikel gefunden.'));
    await closeCamera();$('search').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){console.error(err);setScanStatus('Scan fehlgeschlagen: '+(err.message||err));}
  finally{$('scan').disabled=false}
}
$('scanPhoto').onchange=async e=>{const f=e.target.files?.[0];if(f)await recognizeScan(f);e.target.value=''};

