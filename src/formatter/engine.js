/* BAC PR Auto-Formatter — native browser XML engine; loads on demand. */
'use strict';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RANKS = [
  ['Above ABC', 'FFFF66FF'], ['1st', 'FF00B050'],
  ['2nd', 'FFFFFF00'], ['3rd', 'FFFF6600']
];
const COLORS = new Set(RANKS.map(v => v[1]));
const PAPERS = {letter:'1',legal:'5',a4:'9',folio:'14'};
const XML = new XMLSerializer();
const parser = new DOMParser();
const decoder = new TextDecoder();
const encoder = new TextEncoder();

function parse(xml, label) {
  const doc = parser.parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid Excel XML: '+label);
  return doc;
}
function children(parent, name) {
  return parent ? Array.from(parent.childNodes).filter(e=>e.nodeType===1 && e.localName===name && e.namespaceURI===NS) : [];
}
function child(parent, name) {return children(parent,name)[0]||null;}
function node(doc, name, attrs={}) {
  const el=doc.createElementNS(NS,name);
  for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,String(value));
  return el;
}
function insertOrdered(parent, nextNames, element) {
  const next = Array.from(parent.childNodes).find(e=>e.nodeType===1&&nextNames.includes(e.localName));
  if(next) parent.insertBefore(element,next); else parent.appendChild(element);
  return element;
}
function upsert(parent,name,afterNames=[],nextNames=[]) {
  let e=child(parent,name);
  if(!e){e=node(parent.ownerDocument,name);insertOrdered(parent,nextNames,e);}
  return e;
}
function serialize(doc){const xml=XML.serializeToString(doc);return xml.trimStart().startsWith('<?xml')?xml:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+xml;}
function colNumber(name){let n=0;for(const c of name) n=n*26+c.charCodeAt(0)-64;return n;}
function columnName(n){let s='';while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
function parseRef(ref){const m=/^([A-Z]+)(\d+)$/.exec(ref);return m?{col:m[1],row:Number(m[2])}:null;}
function readString(cell,shared){
  if(!cell)return '';
  const v=child(cell,'v');
  if(v){let t=v.textContent||'';return cell.getAttribute('t')==='s'?(shared[Number(t)]||''):t;}
  return child(cell,'is')?.textContent||'';
}
function positive(cell,shared){return Number(readString(cell,shared))>0;}
function findByName(root,name){return Array.from(root.getElementsByTagNameNS(NS,name));}
function readColors(cell,xfs,fills){
  if(!cell)return '';
  const index=Number(cell.getAttribute('s')||0),xf=xfs[index];
  const fill=fills[Number(xf?.getAttribute('fillId')||0)];
  return child(child(fill,'patternFill'),'fgColor')?.getAttribute('rgb')?.toUpperCase()||'';
}
function filenameNumber(name){const m=/^(\d+)\)/.exec(name);return m?Number(m[1]):null;}
function getMetadata(wb,name){
  const defs=child(wb.documentElement,'definedNames');
  const el=children(defs,'definedName').find(n=>n.getAttribute('name')===name&&n.getAttribute('localSheetId')==='0');
  return el?.textContent?.trim().replace(/^"|"$/g,'')||null;
}
function ensureDefinedNames(wb){
  const root=wb.documentElement;
  return child(root,'definedNames')||insertOrdered(root,['calcPr','oleSize','customWorkbookViews','pivotCaches','smartTagPr','webPublishing','extLst'],node(wb,'definedNames'));
}
function setMetadata(wb,name,val){
  const defs=ensureDefinedNames(wb);
  let el=children(defs,'definedName').find(n=>n.getAttribute('name')===name&&n.getAttribute('localSheetId')==='0');
  if(!el){el=node(wb,'definedName',{name,localSheetId:'0',hidden:'1'});defs.appendChild(el);}
  el.textContent='"'+val+'"';
}
function setDefinedName(wb,name,val){
  const defs=ensureDefinedNames(wb);
  let el=children(defs,'definedName').find(n=>n.getAttribute('name')===name&&n.getAttribute('localSheetId')==='0');
  if(!el){el=node(wb,'definedName',{name,localSheetId:'0'});defs.appendChild(el);}
  el.textContent=val;
}
function getBidCols(cells,shared){
  return [...cells].filter(([ref,c])=>{
    const p=parseRef(ref);
    return p&&p.row===12&&colNumber(p.col)>=7&&colNumber(p.col)%2===1&&readString(c,shared).toUpperCase().includes('TOTAL COST');
  }).map(([ref])=>parseRef(ref).col).sort((a,b)=>colNumber(a)-colNumber(b));
}
function findRows(cells,shared,cols){
  let footer=Infinity;
  for(const [ref,c] of cells){
    const row=parseRef(ref)?.row;
    if(row&&readString(c,shared).toUpperCase().includes('RECOMMENDING APPROVAL')) footer=Math.min(footer,row);
  }
  const items=[],totals=[], seenRows=new Set([...cells].map(([ref])=>parseRef(ref)?.row).filter(r=>r>=14&&r<footer));
  for(const r of [...seenRows].sort((a,b)=>a-b)){
    if(/^\d+(?:\.0+)?$/.test(readString(cells.get('A'+r),shared).trim())&&cells.has('E'+r)) items.push(r);
    else if(cells.has('E'+r)&&child(cells.get('E'+r),'f')&&cols.some(c=>cells.has(c+r))) totals.push(r);
  }
  return {footer,items,totals};
}
// Confirmed bidding basis from the 25 original BAC PR workbooks.
const KNOWN_BASIS=new Map([
 ['2026-08-1502','line'],['2026-08-1503','lot'],['2026-08-1504','line'],
 ['2026-08-1505','lot'],['2026-08-1506','lot'],['2026-08-1509','line'],
 ['2026-08-1510','line'],['2026-08-1514','lot'],['2026-08-1515','lot'],
 ['2026-09-1516','line'],['2026-09-1520','lot'],['2026-08-1512','line'],
 ['2026-08-1391','lot'],['2026-08-1392','line'],['2026-08-1359','lot'],
 ['2026-08-1390','lot']
]);
function inferMode(wb,cells,shared,cols,items,totals,xfs,fills,number,override,sheetForClassification,workbookName){
  if(override!=='auto')return {mode:override,basis:'Selected by user'};
  const persisted=getMetadata(wb,'_BAC_Bid_Mode')?.toLowerCase();
  if(persisted==='lot'||persisted==='line')return {mode:persisted,basis:'Existing workbook classification'};
  if(number>=1&&number<=9)return {mode:number===9?'lot':'line',basis:'Confirmed PR 1–9 classification'};
  const markedItems=items.reduce((acc,r)=>acc+cols.filter(c=>COLORS.has(readColors(cells.get(c+r),xfs,fills))).length,0);
  const markedTotals=totals.reduce((acc,r)=>acc+cols.filter(c=>COLORS.has(readColors(cells.get(c+r),xfs,fills))).length,0);
  if(markedItems&&!markedTotals)return {mode:'line',basis:`Existing item highlights (${markedItems})`};
  if(markedTotals&&!markedItems)return {mode:'lot',basis:`Existing lot-total highlights (${markedTotals})`};

  // Recover classification from previously formatted workbooks whose normal
  // cell fills were stripped by an older version of this formatter.
  const cfCells=new Set();
  for(const block of children(sheetForClassification,'conditionalFormatting')){
    const refs=(block.getAttribute('sqref')||'').split(/\s+/);
    for(const ref of refs){
      const pair=ref.split(':');
      const a=parseRef(pair[0]),b=parseRef(pair[1]||pair[0]);
      if(!a||!b)continue;
      const left=colNumber(a.col),right=colNumber(b.col);
      for(const col of cols)if(colNumber(col)>=left&&colNumber(col)<=right){
        for(const row of [...items,...totals])if(row>=a.row&&row<=b.row)cfCells.add(col+row);
      }
    }
  }
  const cfItems=items.some(row=>cols.some(col=>cfCells.has(col+row)));
  const cfTotals=totals.some(row=>cols.some(col=>cfCells.has(col+row)));
  if(cfItems&&!cfTotals)return {mode:'line',basis:'Recovered item-ranking rules from an older formatted workbook'};
  if(cfTotals&&!cfItems)return {mode:'lot',basis:'Recovered lot-ranking rules from an older formatted workbook'};

  // Verified PR identifiers from the current 25 BAC source workbooks.
  // This is ONLY a recovery fallback when a previously formatted copy has
  // no usable colors or classification metadata.
  const referenceNumber=(workbookName.match(/2026-\d{2}-\d{4}/)||[])[0];
  const verifiedBasis=KNOWN_BASIS.get(referenceNumber);
  if(!markedItems&&!markedTotals&&verifiedBasis)
    return {mode:verifiedBasis,basis:'Recovered classification from verified original BAC PR'};
  return {mode:null,basis:markedItems?'Ambiguous existing ranking colors':'No reliable Line/Lot classification found'};
}
function ensureDxf(styles){
  const root=styles.documentElement;
  const dxfparent=child(root,'dxfs')||insertOrdered(root,['tableStyles','colors','extLst'],node(styles,'dxfs',{count:'0'}));
  const dxfs=children(dxfparent,'dxf'), ids=[];
  const allRanks=[...RANKS,['Neutral','FFFFFFFF']];
  for(const [,rgb] of allRanks){
    // Differential fills (conditional formatting) are NOT ordinary cell fills.
    // Excel for Mac may render <patternFill patternType="solid"><fgColor ...>
    // as black. Excel's own conditional fill markup uses bgColor alone.
    let idx=dxfs.findIndex(dxf=>{
      const pattern=child(child(dxf,'fill'),'patternFill');
      return [child(pattern,'bgColor')?.getAttribute('rgb'),child(pattern,'fgColor')?.getAttribute('rgb')]
        .some(color=>color?.toUpperCase()===rgb);
    });
    if(idx===-1){
      const dxf=node(styles,'dxf');dxfparent.appendChild(dxf);
      idx=dxfs.length;dxfs.push(dxf);
    }
    const dxf=dxfs[idx];
    let fill=child(dxf,'fill');if(!fill){fill=node(styles,'fill');dxf.appendChild(fill);}
    let pattern=child(fill,'patternFill');if(!pattern){pattern=node(styles,'patternFill');fill.appendChild(pattern);}
    // Do not set patternType="solid" here: that is correct for a normal
    // cell style, but incompatible with conditional fill rendering on Mac.
    pattern.removeAttribute('patternType');
    for(const fg of children(pattern,'fgColor'))pattern.removeChild(fg);
    let bg=child(pattern,'bgColor');if(!bg){bg=node(styles,'bgColor');pattern.appendChild(bg);}
    for(const attr of ['indexed','theme','tint','auto'])bg.removeAttribute(attr);
    bg.setAttribute('rgb',rgb);
    ids.push(idx);
  }
  dxfparent.setAttribute('count',String(dxfs.length));
  return ids;
}
function ensureFill(styles, rgb) {
  const parent=child(styles.documentElement,'fills');
  if(!parent)throw new Error('Workbook styles are missing fills');
  const fills=children(parent,'fill');
  let id=fills.findIndex(fill=>{
    const pattern=child(fill,'patternFill');
    return pattern?.getAttribute('patternType')==='solid' &&
      child(pattern,'fgColor')?.getAttribute('rgb')?.toUpperCase()===rgb;
  });
  if(id<0){
    const fill=node(styles,'fill'),pattern=node(styles,'patternFill',{patternType:'solid'});
    pattern.appendChild(node(styles,'fgColor',{rgb}));
    pattern.appendChild(node(styles,'bgColor',{indexed:'64'}));
    fill.appendChild(pattern);parent.appendChild(fill);
    id=fills.length; parent.setAttribute('count',String(id+1));
  }
  return id;
}
function ensureStaticStyle(styles,xfs,oldStyle,fillId,cache){
  const key=oldStyle+':'+fillId;
  if(cache.has(key))return cache.get(key);
  const parent=child(styles.documentElement,'cellXfs');
  const original=xfs[oldStyle];if(!original)throw Error('Unknown cell style: '+oldStyle);
  if(Number(original.getAttribute('fillId')||0)===fillId&&original.getAttribute('applyFill')==='1'){
    cache.set(key,oldStyle);return oldStyle;
  }
  const clone=original.cloneNode(true);
  clone.setAttribute('fillId',String(fillId));
  clone.setAttribute('applyFill','1');
  const index=xfs.length;parent.appendChild(clone);xfs.push(clone);
  parent.setAttribute('count',String(xfs.length));
  cache.set(key,index);return index;
}
function applyStaticFallback(cells,styles,xfs,fills,cols,items,targets,mode,shared){
  // Excel for Mac can show previously painted bid cells as black when their
  // fill is removed and no conditional-format result is ready on first open.
  // Write the correct visible color as a fallback, then apply live CF rules
  // (including a neutral catch-all) so edits update correctly in Excel.
  const white=ensureFill(styles,'FFFFFFFF'), fillIDs=new Map();
  for(const [,rgb] of RANKS)fillIDs.set(rgb,ensureFill(styles,rgb));
  const cache=new Map(), updates=new Map();let changed=0,cleared=0,uncached=0;
  for(const row of targets){
    const budget=Number(readString(cells.get('E'+row),shared));
    const numeric=cols.map(col=>({col,cell:cells.get(col+row),amount:Number(readString(cells.get(col+row),shared))}))
      .filter(x=>x.cell&&Number.isFinite(x.amount)&&x.amount>0);
    const ranks=[...new Set(numeric.filter(x=>!budget||x.amount<=budget).map(x=>x.amount))].sort((a,b)=>a-b);
    for(const col of cols){
      const cell=cells.get(col+row);if(!cell)continue;
      const value=readString(cell,shared);
      const amount=Number(value);
      const originalStyle=Number(cell.getAttribute('s')||0);
      const oldRgb=readColors(cell,xfs,fills);
      const hasOldColor=COLORS.has(oldRgb);
      if(child(cell,'f')&&!value.trim())uncached++;
      let color=null;
      if(Number.isFinite(budget)&&budget>0&&value.trim()&&Number.isFinite(amount)&&amount>0){
        if(amount>budget)color='FFFF66FF';
        else color=['FF00B050','FFFFFF00','FFFF6600'][ranks.indexOf(amount)]||null;
      }
      if(!color&&!hasOldColor)continue;
      const id=ensureStaticStyle(styles,xfs,originalStyle,color?fillIDs.get(color):white,cache);
      if(id!==originalStyle){cell.setAttribute('s',String(id));updates.set(cell.getAttribute('r'),id);changed++;}
      if(!color&&hasOldColor)cleared++;
    }
  }
  // Never report a workbook as successfully formatted unless its ranking
  // cells contain real, verifiable solid fills (not only conditional rules).
  const actualFills=children(child(styles.documentElement,'fills'),'fill');
  let expected=0,verified=0;
  for(const row of targets){
    const budget=Number(readString(cells.get('E'+row),shared));
    if(!Number.isFinite(budget)||budget<=0)continue;
    const offers=cols.map(col=>({col,amount:Number(readString(cells.get(col+row),shared))}))
      .filter(x=>cells.has(x.col+row)&&Number.isFinite(x.amount)&&x.amount>0);
    const ranked=[...new Set(offers.filter(x=>x.amount<=budget).map(x=>x.amount))].sort((a,b)=>a-b);
    for(const offer of offers){
      const expectedColor=offer.amount>budget?'FFFF66FF':['FF00B050','FFFFFF00','FFFF6600'][ranked.indexOf(offer.amount)];
      if(!expectedColor)continue;
      expected++;
      if(readColors(cells.get(offer.col+row),xfs,actualFills)===expectedColor)verified++;
    }
  }
  if(expected===0)throw Error('No verifiable ranked bid amounts were found. Check this template and its cached formulas.');
  if(verified!==expected)throw Error(`Bid colors were not written correctly (${verified}/${expected}). No download was generated.`);
  return {changed,cleared,uncached,updates,verified};
}
function rankFormula(row,cols,current){
  return 'SUM('+cols.map((col,index)=>{
    const ref='$'+col+row;
    const guards=[`ISNUMBER(${ref})`,`${ref}>0`,`${ref}<${current}`,...cols.slice(0,index).map(prior=>`${ref}<>$${prior}${row}`)];
    return `IF(AND(${guards.join(',')}),1,0)`;
  }).join(',')+')';
}
function candidateFormula(row,cols,col,label,requiresItem){
  const price=col+row,budget='$E'+row;
  let f=`ISNUMBER(${price}),${price}>0,ISNUMBER(${budget}),${budget}>0`;
  if(label==='Above ABC')f=`AND(${f},${price}>${budget})`;
  else f=`AND(${f},${price}<=${budget},${rankFormula(row,cols,price)}=${{'1st':0,'2nd':1,'3rd':2}[label]})`;
  return requiresItem?`AND(ISNUMBER($A${row}),${f})`:f;
}
function clearGeneratedRules(sheet){
  const root=sheet.documentElement;
  for(const el of children(root,'conditionalFormatting')){
    const text=children(el,'cfRule').flatMap(r=>children(r,'formula').map(n=>n.textContent||'')).join(' ');
    if(text.includes('ISNUMBER($E')&&(text.includes('SUM(IF(')||text.includes('ISNUMBER($')))root.removeChild(el);
  }
}
function writeRules(sheet,styles,cols,items,totals,mode,targets){
  clearGeneratedRules(sheet);
  const root=sheet.documentElement;
  const prev=Math.max(0,...children(root,'conditionalFormatting').flatMap(e=>children(e,'cfRule').map(r=>Number(r.getAttribute('priority')||0))));
  let priority=prev+1, count=0;
  const ids=ensureDxf(styles),segments=[];
  if(mode==='line'){
    const start=Math.min(...items),end=Math.max(...items);
    for(const col of cols){segments.push({col,start,end,item:true});for(const r of totals.filter(t=>targets.includes(t)))segments.push({col,start:r,end:r,item:false});}
  }else for(const col of cols)for(const r of targets)segments.push({col,start:r,end:r,item:false});
  for(const segment of segments){
    const {col,start,end,item}=segment;
    const sqref=start===end?`${col}${start}`:`${col}${start}:${col}${end}`;
    const cf=node(sheet,'conditionalFormatting',{sqref});
    for(let i=0;i<RANKS.length+1;i++){
      const rule=node(sheet,'cfRule',{type:'expression',dxfId:ids[i],priority:priority++,stopIfTrue:'1'});
      const formula=node(sheet,'formula');formula.textContent=i===RANKS.length?'TRUE':candidateFormula(start,cols,col,RANKS[i][0],item);
      rule.appendChild(formula);cf.appendChild(rule);count++;
    }
    const following=['dataValidations','hyperlinks','printOptions','pageMargins','pageSetup','headerFooter','rowBreaks','colBreaks','drawing','legacyDrawing','legacyDrawingHF','picture','oleObjects','controls','webPublishItems','tableParts','extLst'];
    insertOrdered(root,following,cf);
  }
  return count;
}
function configurePrint(sheet,wb,sheetname,lastCol,lastRow,paper,pageOptions={}){
  const root=sheet.documentElement;
  let prop=child(root,'sheetPr');if(!prop){prop=node(sheet,'sheetPr');root.insertBefore(prop,root.firstChild);}
  let setupProp=child(prop,'pageSetUpPr');if(!setupProp){setupProp=node(sheet,'pageSetUpPr');prop.appendChild(setupProp);}
  const scaling=pageOptions.scaling==='adjust'?'adjust':'fit';
  const percent=Math.min(400,Math.max(10,Number(pageOptions.scalePercent)||70));
  setupProp.setAttribute('fitToPage',scaling==='fit'?'1':'0');setupProp.setAttribute('autoPageBreaks','1');
  let margins=child(root,'pageMargins');
  if(!margins){margins=node(sheet,'pageMargins',{left:'0.25',right:'0.25',top:'0.25',bottom:'0.75',header:'0',footer:'0'});insertOrdered(root,['pageSetup','headerFooter','rowBreaks','colBreaks','drawing','extLst'],margins);}
  let page=child(root,'pageSetup');if(!page){page=node(sheet,'pageSetup');insertOrdered(root,['headerFooter','rowBreaks','colBreaks','drawing','extLst'],page);}
  if(paper!=='preserve')page.setAttribute('paperSize',PAPERS[paper]);
  else if(!page.getAttribute('paperSize'))page.setAttribute('paperSize','14');
  page.setAttribute('orientation',pageOptions.orientation==='portrait'?'portrait':'landscape');
  page.setAttribute('pageOrder','overThenDown');
  if(scaling==='fit'){
    page.setAttribute('fitToWidth','1');
    page.setAttribute('fitToHeight','0');
    page.removeAttribute('scale');
  }else{
    page.setAttribute('scale',String(percent));
    page.removeAttribute('fitToWidth');
    page.removeAttribute('fitToHeight');
  }
  // Old BAC templates embed a printerSettings1.bin relationship holding their
  // legacy print configuration. Stop it overriding the chosen options on Mac.
  page.removeAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
  page.removeAttribute('r:id');
  const headerSelection=pageOptions.header||'original';
  const footerSelection=pageOptions.footer||'original';
  let hf=child(root,'headerFooter');
  if(!hf&&footerSelection==='page'){
    hf=node(sheet,'headerFooter');
    insertOrdered(root,['rowBreaks','colBreaks','drawing','extLst'],hf);
  }
  if(hf){
    if(headerSelection==='none'){
      const existingHeader=child(hf,'oddHeader');
      if(existingHeader)existingHeader.textContent='';
    }
    let footer=child(hf,'oddFooter');
    if(footerSelection==='page'&&!footer){
      footer=node(sheet,'oddFooter');
      hf.appendChild(footer);
    }
    if(footerSelection==='none'&&footer)footer.textContent='';
    else if(footerSelection==='page')footer.textContent='&CPage &P of &N';
    else if(footer&&/^Page\s*&P\s+of\s+&N$/i.test((footer.textContent||'').trim())){
      // Original page-number footer lacked its alignment marker.
      footer.textContent='&CPage &P of &N';
    }
    hf.setAttribute('alignWithMargins','1');
    hf.setAttribute('scaleWithDoc','1');
    if(footer&&(footer.textContent||'').trim()&&margins&&
       Number(margins.getAttribute('footer')||0)<0.25)margins.setAttribute('footer','0.3');
  }
  const breaks=child(root,'colBreaks');if(breaks)root.removeChild(breaks);
  const escaped="'"+sheetname.replace(/'/g,"''")+"'";
  const area=`${escaped}!$A$1:$${lastCol}$${lastRow}`;
  setDefinedName(wb,'_xlnm.Print_Area',area);
  if(lastRow>75)setDefinedName(wb,'_xlnm.Print_Titles',`${escaped}!$11:$13`);
  return area;
}
// Preserve the original worksheet XML instead of reserializing all rows,
// columns, merges, and layout metadata. Some Excel for Mac builds misrender
// the entire sheet after a generic DOM serializer rewrites its worksheet XML.
function serializePatchedSheet(original,doc,updates){
  const root=doc.documentElement;
  const markup=(element)=>XML.serializeToString(element);
  let xml=original;

  // Only update s= for cells whose initial static legend colors actually change.
  if(updates&&updates.size){
    xml=xml.replace(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*>/g,(tag,ref)=>{
      if(!updates.has(ref))return tag;
      const id=updates.get(ref);
      return /\bs="\d+"/.test(tag)
        ? tag.replace(/\bs="\d+"/,'s="'+id+'"')
        : tag.replace(/^(<c\b)/,'$1 s="'+id+'"');
    });
  }

  function singleton(name,next){
    const updated=child(root,name);
    if(!updated)return;
    const replacement=markup(updated);
    const pair=new RegExp('<'+name+'\\b[^>]*>[\\s\\S]*?<\\/'+name+'>');
    const selfClosing=new RegExp('<'+name+'\\b[^>]*/>');
    if(pair.test(xml))xml=xml.replace(pair,replacement);
    else if(selfClosing.test(xml))xml=xml.replace(selfClosing,replacement);
    else{
      const marker=next.find(n=>new RegExp('<'+n+'\\b').test(xml));
      if(marker)xml=xml.replace(new RegExp('(<'+marker+'\\b)'),replacement+'$1');
      else xml=xml.replace('</worksheet>',replacement+'</worksheet>');
    }
  }
  singleton('sheetPr',['dimension','sheetViews','sheetFormatPr','cols','sheetData']);
  singleton('pageMargins',['pageSetup','headerFooter','rowBreaks','colBreaks','drawing','extLst']);
  singleton('pageSetup',['headerFooter','rowBreaks','colBreaks','drawing','extLst']);
  singleton('headerFooter',['rowBreaks','colBreaks','drawing','extLst']);

  // Replace just the conditional-formatting blocks; keep all other XML verbatim.
  xml=xml.replace(/<conditionalFormatting\b[^>]*>[\s\S]*?<\/conditionalFormatting>/g,'')
    .replace(/<conditionalFormatting\b[^>]*\/>/g,'');
  const rules=children(root,'conditionalFormatting').map(markup).join('');
  if(rules){
    const next=['dataValidations','hyperlinks','printOptions','pageMargins','pageSetup','headerFooter','rowBreaks','colBreaks','drawing','extLst']
      .find(n=>new RegExp('<'+n+'\\b').test(xml));
    if(next)xml=xml.replace(new RegExp('(<'+next+'\\b)'),rules+'$1');
    else xml=xml.replace('</worksheet>',rules+'</worksheet>');
  }
  if(!child(root,'colBreaks'))xml=xml.replace(/<colBreaks\b[^>]*>[\s\S]*?<\/colBreaks>/g,'')
    .replace(/<colBreaks\b[^>]*\/>/g,'');
  // Keep all original <cols>, <row>, <mergeCell>, drawings and cached values byte-for-byte.
  const finalSheet=parse(xml,'preserved sheet');
  if(updates?.size){
    const finalCells=new Map(findByName(finalSheet,'sheetData')
      .flatMap(data=>findByName(data,'c')).map(c=>[c.getAttribute('r'),c]));
    for(const [ref,id] of updates)if(finalCells.get(ref)?.getAttribute('s')!==String(id))
      throw Error('Failed to preserve ranking color on cell '+ref);
  }
  return xml;
}

export async function transformWorkbook(name,buffer,mode,paper,colorMode="static",pageOptions={}){
  const zip=await window.JSZip.loadAsync(buffer);
  for(const path of ['xl/workbook.xml','xl/styles.xml','xl/worksheets/sheet1.xml'])if(!zip.file(path))throw Error('Unsupported BAC template: '+path+' missing');
  const [workbookText,stylesText,sheetText,sharedText]=await Promise.all([
    zip.file('xl/workbook.xml').async('string'),zip.file('xl/styles.xml').async('string'),zip.file('xl/worksheets/sheet1.xml').async('string'),
    zip.file('xl/sharedStrings.xml')?.async('string')||Promise.resolve(null)
  ]);
  const wb=parse(workbookText,'workbook'),styles=parse(stylesText,'styles'),sheet=parse(sheetText,'sheet1');
  const shared=sharedText?findByName(parse(sharedText,'shared strings'),'si').map(n=>n.textContent||''):[];
  const cells=new Map(findByName(sheet,'sheetData').flatMap(data=>findByName(data,'c')).map(c=>[c.getAttribute('r'),c]));
  const cols=getBidCols(cells,shared);if(!cols.length)throw Error('No supplier TOTAL COST columns in row 12');
  const {footer,items,totals}=findRows(cells,shared,cols);if(!items.length)throw Error('No numbered line items found');
  const fills=children(child(styles.documentElement,'fills'),'fill');
  const xfs=children(child(styles.documentElement,'cellXfs'),'xf');
  const meta=inferMode(wb,cells,shared,cols,items,totals,xfs,fills,filenameNumber(name),mode,sheet,name);
  if(!meta.mode)throw Error('Bid classification could not be recovered. Select Line Bid or Lot Bid before downloading.');
  const priorTotals=(getMetadata(wb,'_BAC_Ranked_Totals')||'').split(',').map(Number).filter(v=>totals.includes(v));
  const markedTotals=totals.filter(r=>cols.some(c=>COLORS.has(readColors(cells.get(c+r),xfs,fills))));
  const grouped=[...new Set([...priorTotals,...markedTotals])].sort((a,b)=>a-b);
  let targets=[];
  if(meta.mode==='line')targets=[...new Set([...items,...grouped])].sort((a,b)=>a-b);
  if(meta.mode==='lot')targets=grouped.length?grouped:[totals.length?totals[totals.length-1]:items[items.length-1]];
  if(meta.mode){setMetadata(wb,'_BAC_Bid_Mode',meta.mode.toUpperCase());if(grouped.length)setMetadata(wb,'_BAC_Ranked_Totals',grouped.join(','));}
  let lastRow=Math.max(Number.isFinite(footer)?footer:0,14);
  for(const [ref,c] of cells){
    if(readString(c,shared).trim()||child(c,'f'))lastRow=Math.max(lastRow,parseRef(ref)?.row||0);
  }
  const lastCol=columnName(Math.max(colNumber(cols[cols.length-1]),5));
  const sheetname=child(wb.documentElement,'sheets')?child(child(wb.documentElement,'sheets'),'sheet')?.getAttribute('name')||'Sheet1':'Sheet1';
  const area=configurePrint(sheet,wb,sheetname,lastCol,lastRow,paper,pageOptions);
  let rules=0,cleared=0,staticColors=0,verifiedColors=0,uncached=0,styleUpdates=new Map();
  if(meta.mode){
    const fallback=applyStaticFallback(cells,styles,xfs,fills,cols,items,targets,meta.mode,shared);
    ({cleared,uncached}=fallback);staticColors=fallback.changed;verifiedColors=fallback.verified;styleUpdates=fallback.updates;
    if(colorMode==="static")clearGeneratedRules(sheet);
    else rules=writeRules(sheet,styles,cols,items,totals,meta.mode,targets);
  }
  let calc=child(wb.documentElement,'calcPr');if(!calc){calc=node(wb,'calcPr');wb.documentElement.appendChild(calc);}
  calc.setAttribute('calcMode','auto');calc.setAttribute('fullCalcOnLoad','0');calc.setAttribute('forceFullCalc','0');
  zip.file('xl/workbook.xml',serialize(wb),{createFolders:false});zip.file('xl/worksheets/sheet1.xml',serializePatchedSheet(sheetText,sheet,styleUpdates),{createFolders:false});
  if(meta.mode)zip.file('xl/styles.xml',serialize(styles),{createFolders:false});
  // Unlink obsolete binary printer settings, which may otherwise restore a
  // cached percent scale even though pageSetup now requests fit-to-width.
  const relsPath='xl/worksheets/_rels/sheet1.xml.rels';
  if(zip.file(relsPath)){
    const relDoc=parse(await zip.file(relsPath).async('string'),'sheet relationships');
    const stale=Array.from(relDoc.documentElement.children).filter(e=>
      e.localName==='Relationship'&&/\/printerSettings$/.test(e.getAttribute('Type')||''));
    for(const relation of stale)relation.remove();
    if(stale.length)zip.file(relsPath,serialize(relDoc),{createFolders:false});
  }
  const data=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:3}});
  return {data,report:{file:name,mode:meta.mode||'REVIEW REQUIRED',basis:meta.basis,colorMode,items:items.length,suppliers:cols.length,rules,cleared,staticColors,verifiedColors,uncached,printArea:area}};
}