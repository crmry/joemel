'use strict';
const ui={input:document.getElementById('files'),drop:document.getElementById('drop'),button:document.getElementById('process'),names:document.getElementById('names'),status:document.getElementById('status'),progress:document.getElementById('meter'),results:document.getElementById('results'),mode:document.getElementById('mode'),paper:document.getElementById('paper')};
let selected=[],processing=false,libPromise=null;
function sequence(name){const match=/^\s*(\d+)\s*\)/.exec(name);return match?Number(match[1]):Number.MAX_SAFE_INTEGER;}
function choose(files){if(processing)return;selected=[...files].filter(f=>/\.xlsx$/i.test(f.name)&&!f.name.startsWith('~$')).sort((a,b)=>sequence(a.name)-sequence(b.name)||a.name.localeCompare(b.name,undefined,{numeric:true}));ui.names.textContent=selected.length?`${selected.length} workbook(s) selected — ${selected.map(f=>f.name).join(', ')}`:'No Excel files selected';ui.status.textContent='';ui.results.replaceChildren();ui.progress.hidden=true;ui.button.disabled=!selected.length;}
ui.input.addEventListener('change',()=>choose(ui.input.files));
ui.drop.addEventListener('click',e=>{if(e.target!==ui.input&&!processing)ui.input.click();});
ui.drop.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!processing){e.preventDefault();ui.input.click();}});
for(const type of ['dragenter','dragover'])ui.drop.addEventListener(type,e=>{e.preventDefault();if(!processing)ui.drop.classList.add('drag');});
for(const type of ['dragleave','drop'])ui.drop.addEventListener(type,e=>{e.preventDefault();ui.drop.classList.remove('drag');});
ui.drop.addEventListener('drop',e=>{if(!processing)choose(e.dataTransfer.files);});
async function library(){if(window.JSZip)return window.JSZip;if(!libPromise)libPromise=new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src='../vendor/jszip.min.js';tag.onload=()=>window.JSZip?resolve(window.JSZip):reject(new Error('Could not initialize Excel library'));tag.onerror=()=>reject(new Error('Could not load Excel library'));document.head.appendChild(tag);}).catch(e=>{libPromise=null;throw e;});return libPromise;}
function renderReports(rows){ui.results.replaceChildren();for(const r of rows){const item=document.createElement('div');item.className='report-entry';if(r.mode==='ERROR'||r.mode==='REVIEW REQUIRED')item.classList.add('needs-review');const label=document.createElement('strong');label.textContent=r.file;const detail=document.createElement('span');detail.textContent=`${r.mode.toUpperCase()} • ${r.rules||0} automatic coloring rules • ${r.basis}`;item.append(label,detail);ui.results.append(item);}}
function download(bytes,fileName,mime){const blob=new Blob([bytes],{type:mime});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=fileName;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function csv(rows){const headers=['file','mode','basis','items','suppliers','rules','cleared','printArea'];return '\ufeff'+[headers.join(','),...rows.map(row=>headers.map(key=>'"'+String(row[key]??'').replaceAll('"','""')+'"').join(','))].join('\r\n');}
const yieldUi=()=>new Promise(resolve=>setTimeout(resolve,0));
ui.button.addEventListener('click',async()=>{
 if(!selected.length||processing)return;
 processing=true;ui.input.disabled=true;ui.button.disabled=true;ui.drop.setAttribute('aria-busy','true');ui.results.replaceChildren();ui.progress.hidden=false;ui.progress.value=0;
 let rows=[],outputs=[];
 try{
  ui.status.textContent='Loading local Excel formatter…';
  const [JSZip,{transformWorkbook}]=await Promise.all([library(),import('./engine.js?v=1.0.3')]);
  for(let i=0;i<selected.length;i++){
   const file=selected[i];ui.status.textContent=`Formatting ${i+1} of ${selected.length}: ${file.name}`;
   await yieldUi();
   try{const buffer=await file.arrayBuffer();const result=await transformWorkbook(file.name,buffer,ui.mode.value,ui.paper.value);outputs.push({name:file.name,data:result.data});rows.push(result.report);}
   catch(error){rows.push({file:file.name,mode:'ERROR',basis:error.message||String(error),items:0,suppliers:0,rules:0,cleared:0,printArea:''});}
   ui.progress.value=(i+1)/selected.length*100;
  }
  if(outputs.length===1){download(outputs[0].data,outputs[0].name.replace(/\.xlsx$/i,'')+'_formatted.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}
  else if(outputs.length){const zip=new JSZip();for(const output of outputs)zip.file(output.name,output.data);zip.file('Processing_Report.csv',csv(rows));const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:2}});download(bytes,'BAC_PR_AutoFormatted.zip','application/zip');}
  ui.status.textContent=`Completed ${outputs.length} of ${selected.length} workbook(s). ${rows.filter(row=>row.mode==='REVIEW REQUIRED').length} need classification review.${outputs.length?' Download started.':''}`;
  renderReports(rows);
 }catch(error){ui.status.textContent=`Could not process files: ${error.message||String(error)}`;renderReports(rows);}
 finally{processing=false;ui.input.disabled=false;ui.button.disabled=!selected.length;ui.drop.removeAttribute('aria-busy');}
});