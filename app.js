import {rawZ16,stats,colorize} from './lib/depth.js';
import {readPNG16} from './lib/png16.js';
import {readPLY} from './lib/ply.js';
import {readNPY} from './lib/npy.js';
import {readCSV} from './lib/csv.js';
const $=(id)=>document.getElementById(id);
const fileInput=$('file'), canvas=$('depth-canvas');
let loaded=null,filtered=null,computedStats=null,currentFile=null,rangeMin=0,rangeMax=0;
function status(message,isError=false){$('status').textContent=message;$('status').className='status'+(isError?' error':loaded?' good':'');}
function nice(x){return Number(x).toLocaleString('de-CH');}
function enable(active){for(const id of ['autorange','median','save-png','save-json'])$(id).disabled=!active; $('min').disabled=!active || $('autorange').checked; $('max').disabled=!active || $('autorange').checked;}
function updateStats(){if(!loaded){$('m-format').textContent='–';$('m-size').textContent='–';$('m-valid').textContent='–';$('m-depth').textContent='–';return;}
  $('m-format').textContent=loaded.format;$('m-size').textContent=`${nice(loaded.width)} × ${nice(loaded.height)}`;
  $('m-valid').textContent=`${nice(computedStats.valid)} / ${nice(computedStats.total)} (${(computedStats.ratio*100).toFixed(1)} %)`;
  $('m-depth').textContent=`${nice(computedStats.min)}–${nice(computedStats.max)} mm`;
}
function render(){if(!loaded)return;
  if(!$('autorange').checked){rangeMin=Number($('min').value);rangeMax=Number($('max').value);}
  if(!Number.isFinite(rangeMin)||!Number.isFinite(rangeMax)||rangeMin>=rangeMax){status('Der Farbbereich benötigt einen kleineren Anfangs- als Endwert.',true);return;}
  filtered=colorize(canvas,loaded,rangeMin,rangeMax,$('median').checked);
  $('scale-far').textContent=`${nice(rangeMax)} mm · weit`;$('scale-near').textContent=`${nice(rangeMin)} mm · nah`;
}
function defaultsFromStats(){const min=computedStats.near, max=computedStats.far;rangeMin=Math.max(1,min-((max-min)<30?15:0));rangeMax=Math.max(rangeMin+30,max+((max-min)<30?15:0));$('min').value=rangeMin;$('max').value=rangeMax;}
async function loadFile(file){if(!file)return;
  // Reset before each import so a failed file cannot masquerade as the previous result.
  loaded=null;filtered=null;computedStats=null;currentFile=null;enable(false);$('data-pill').textContent='LADE …';$('data-pill').className='pill';$('empty').hidden=false;$('scale').hidden=true;$('readout').hidden=true;
  status(`Lese ${file.name} …`);await new Promise(resolve=>requestAnimationFrame(resolve));
  try{
    const ext=file.name.split('.').pop().toLowerCase();let result;
    const units=Number($('units').value),width=Number($('raw-width').value),height=Number($('raw-height').value);
    if(['raw','bin','z16'].includes(ext))result=rawZ16(await file.arrayBuffer(),width,height,units);
    else if(ext==='png')result=await readPNG16(await file.arrayBuffer(),units);
    else if(ext==='npy')result=readNPY(await file.arrayBuffer(),units);
    else if(ext==='ply')result=readPLY(await file.arrayBuffer());
    else if(ext==='csv'||ext==='txt')result=readCSV(await file.text());
    else throw new Error('Dateityp nicht unterstützt. Bitte RAW, PLY, 16-Bit-Graustufen-PNG, NPY oder CSV auswählen.');
    const measurements=stats(result.data);
    if(!measurements.valid)throw new Error('Die Datei enthält keine gültigen Tiefenmesswerte (alle Pixel sind 0).');
    loaded=result;currentFile=file;computedStats=measurements;
    $('autorange').checked=true;$('median').checked=false;defaultsFromStats();enable(true);
    $('empty').hidden=true;$('scale').hidden=false;$('data-pill').textContent='ECHTE MESSWERTE';$('data-pill').className='pill good';
    $('subtitle').textContent=`${file.name} · ${result.note}`;updateStats();render();
    let warning=measurements.ratio<.5?`Achtung: Nur ${(measurements.ratio*100).toFixed(1)} % der Rasterzellen enthalten Messwerte. `:'';
    status(`${warning}${file.name} eingelesen: ${nice(measurements.valid)} gültige Messpunkte. Entfernungen werden in Millimetern dargestellt. ${result.note}`);
  }catch(error){$('data-pill').textContent='IMPORTFEHLER';$('subtitle').textContent='Noch keine gültige Tiefenmessung geladen';updateStats();status(error.message||String(error),true);}
}
function filenameSuffix(ext){const basename=(currentFile?.name||'tiefendaten').replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]+/g,'_');return `${basename}_swissar_depth.${ext}`;}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('dropzone').addEventListener('click',()=>fileInput.click());$('dropzone').addEventListener('keydown',(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fileInput.click();}});
fileInput.addEventListener('change',()=>{const file=fileInput.files?.[0];if(file)loadFile(file);fileInput.value='';});
$('dropzone').addEventListener('dragover',(e)=>{e.preventDefault();$('dropzone').classList.add('drag');});
$('dropzone').addEventListener('dragleave',()=>$('dropzone').classList.remove('drag'));
$('dropzone').addEventListener('drop',(e)=>{e.preventDefault();$('dropzone').classList.remove('drag');if(e.dataTransfer?.files?.[0])loadFile(e.dataTransfer.files[0]);});
$('autorange').addEventListener('change',()=>{const auto=$('autorange').checked;$('min').disabled=auto;$('max').disabled=auto;if(auto)defaultsFromStats();render();});
$('min').addEventListener('change',render);$('max').addEventListener('change',render);$('median').addEventListener('change',render);
canvas.addEventListener('pointermove',(e)=>{
  if(!loaded)return;
  const r=canvas.getBoundingClientRect(),x=Math.min(loaded.width-1,Math.max(0,Math.floor((e.clientX-r.left)/r.width*loaded.width))),y=Math.min(loaded.height-1,Math.max(0,Math.floor((e.clientY-r.top)/r.height*loaded.height))),index=y*loaded.width+x;
  const d=loaded.data[index],f=filtered?.[index];
  $('readout').hidden=false;$('readout').textContent=`x ${x}, y ${y} · ${d?`${nice(d)} mm`:'ungültig'}${f&&f!==d?` · gefiltert ${nice(f)} mm`:''}`;
});
canvas.addEventListener('pointerleave',()=>$('readout').hidden=true);
$('save-png').addEventListener('click',()=>{if(!loaded)return;canvas.toBlob(blob=>{if(blob)download(blob,filenameSuffix('png'));},'image/png');});
$('save-json').addEventListener('click',()=>{if(!loaded)return;
  const report={project:'Swiss AR Sandbox',version:'0.6',step:'1 · Echte Tiefendaten visualisieren',time:new Date().toISOString(),file:currentFile?.name,bytes:currentFile?.size,format:loaded.format,sourceNote:loaded.note,width:loaded.width,height:loaded.height,validPixels:computedStats.valid,totalPixels:computedStats.total,validPercent:Math.round(computedStats.ratio*10000)/100,depthMinMm:computedStats.min,depthMaxMm:computedStats.max,percentile02Mm:computedStats.near,percentile98Mm:computedStats.far,colorRangeMm:{near:rangeMin,far:rangeMax},median3x3:$('median').checked,limitations:['Bildschirmgrafik ist keine Original-Z16-Datei','Kein Live-Z16-Zugriff über GitHub Pages nachgewiesen','Kein kalibriertes Höhenmodell','PLY wird anhand der X/Y-Positionen orthografisch gerastert']};
  download(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),filenameSuffix('json'));
});
if(!(window.DecompressionStream)){status('Hinweis: 16-Bit-PNG benötigt einen aktuellen Chrome- oder Edge-Browser.',true);}
