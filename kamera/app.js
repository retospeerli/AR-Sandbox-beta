'use strict';
// Swiss AR Sandbox: Hardwareprobe, keine Sand-Simulation und keine Tiefendaten-Fälschung.
const $ = (id) => document.getElementById(id);
const state = {
  stream: null, raf: null, frames: 0, lastTick: performance.now(),
  fps: 0, pixel: null, usb: null, errors: [], entries: [],
  cameras: [], actualCamera: '', width: 0, height: 0
};
const sampleCanvas = document.createElement('canvas'); sampleCanvas.width = 160; sampleCanvas.height = 90;
const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
const hist = $('histogram').getContext('2d');
function log(message, type = 'info') {
  state.entries.push({ time: new Date().toISOString(), type, message });
  const entry = document.createElement('div'); entry.className = `log ${type}`;
  const time = document.createElement('time'); time.textContent = new Date().toLocaleTimeString('de-CH');
  const messageEl = document.createElement('span'); messageEl.textContent = message;
  entry.append(time, messageEl); $('logs').prepend(entry);
}
function fail(prefix, err) {
  const info = `${prefix}: ${err?.name || 'Fehler'} – ${err?.message || String(err)}`;
  state.errors.push(info); log(info, 'error');
}
function stopStream() {
  if (state.raf !== null) cancelAnimationFrame(state.raf);
  state.raf = null;
  if (state.stream) state.stream.getTracks().forEach(t => t.stop());
  state.stream = null; $('video').pause(); $('video').srcObject = null;
  $('video').classList.remove('active'); $('placeholder').hidden = false;
  $('camera-status').textContent = 'Nicht gestartet'; $('camera-status').classList.remove('ok');
  $('live-indicator').textContent = 'OFFLINE'; $('live-indicator').classList.remove('live');
  $('stream-label').textContent = 'KEIN STREAM'; $('stream-size').textContent = '–';
  $('fps').textContent = '–'; $('rgb-values').textContent = '–'; $('luma-value').textContent = '–';
  $('resolution').textContent = '–'; $('format-value').textContent = '–';
  $('stop-button').disabled = true; $('snapshot-button').disabled = true;
  state.frames = 0; state.pixel = null; state.actualCamera = ''; state.lastTick = 0;
  drawEmptyHistogram();
}
async function refreshCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) { log('Diese Browserumgebung erlaubt keine Geräteauflistung.', 'error'); return; }
  const devices = await navigator.mediaDevices.enumerateDevices();
  state.cameras = devices.filter(d => d.kind === 'videoinput').map(d => ({ id: d.deviceId, name: d.label || 'Kamera ohne Namen' }));
  const select = $('camera-select');
  const previous = select.value;
  select.replaceChildren();
  if (!state.cameras.length) {
    const option = document.createElement('option'); option.value = ''; option.textContent = 'Keine Kamera gefunden'; select.appendChild(option);
  } else {
    for (const d of state.cameras) {
      const option = document.createElement('option'); option.value = d.id; option.textContent = d.name;
      select.appendChild(option);
    }
    const wanted = state.cameras.find(d => /realsense|d415|depth camera 415/i.test(d.name));
    select.value = state.cameras.some(d => d.id === previous) ? previous : (wanted?.id || state.cameras[0].id);
  }
  select.disabled = state.cameras.length === 0;
  $('select-button').disabled = state.cameras.length === 0;
  log(`${state.cameras.length} Videoquelle(n) vom Browser gemeldet.`, 'info');
}
async function startCamera(cameraId = null) {
  if (!navigator.mediaDevices?.getUserMedia) { log('getUserMedia nicht verfügbar. HTTPS / GitHub Pages und Chrome/Edge verwenden.', 'error'); return; }
  stopStream();
  try {
    const constraints = cameraId ? {video:{deviceId:{exact:cameraId},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false}
       : {video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false};
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.stream = stream;
    $('video').srcObject = stream;
    await $('video').play();
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    state.actualCamera = track.label || '(ohne Bezeichnung)';
    state.width = settings.width || $('video').videoWidth;
    state.height = settings.height || $('video').videoHeight;
    $('camera-status').textContent = 'Videostream aktiv'; $('camera-status').classList.add('ok');
    $('live-indicator').textContent = 'LIVE'; $('live-indicator').classList.add('live');
    $('video').classList.add('active'); $('placeholder').hidden = true;
    $('resolution').textContent = `${state.width} × ${state.height}`;
    $('stream-label').textContent = state.actualCamera;
    $('stream-size').textContent = `${state.width} × ${state.height}`;
    $('format-value').textContent = 'Videopixel (RGB)';
    state.fps = settings.frameRate || null; $('fps').textContent = state.fps ? `${state.fps} (Gerät)` : 'nicht gemeldet';
    $('stop-button').disabled = false; $('snapshot-button').disabled = false;
    await refreshCameras();
    if (settings.deviceId && state.cameras.some(d => d.id === settings.deviceId)) $('camera-select').value = settings.deviceId;
    log(`Stream geöffnet: ${state.actualCamera}, ${state.width} × ${state.height}, ${settings.frameRate || '?'} fps (angefordert: max. 1280 × 720 / 30).`, 'ok');
    if (!/realsense|d415|depth camera 415/i.test(state.actualCamera)) log('Achtung: Der aktive Stream ist nicht eindeutig als D415 bezeichnet.', 'info');
    state.lastTick = 0; state.frames = 0;
    state.raf = requestAnimationFrame(updatePixels);
  } catch(err) { fail('Kamera konnte nicht geöffnet werden', err); $('camera-status').textContent = 'Verbindung fehlgeschlagen'; }
}
function drawEmptyHistogram() {hist.clearRect(0,0,640,78);hist.fillStyle='#d8e0e4';hist.fillRect(10,70,620,1);}
function updatePixels(now) {
  if (!state.stream) return;
  const video = $('video');
  if (video.readyState >= 2 && now - state.lastTick >= 100) {
    state.lastTick = now;
    sampleCtx.drawImage(video,0,0,sampleCanvas.width,sampleCanvas.height);
    const image = sampleCtx.getImageData(0,0,sampleCanvas.width,sampleCanvas.height);
    const pixels = image.data;
    const cx = (45*160+80)*4, r=pixels[cx],g=pixels[cx+1],b=pixels[cx+2];
    const luma = Math.round(.2126*r+.7152*g+.0722*b);
    state.pixel={r,g,b,luma};
    $('rgb-values').textContent = `${r}, ${g}, ${b}`;
    $('luma-value').textContent = `${luma}`;
    const bins = new Uint32Array(64);
    for(let j=0;j<pixels.length;j+=4){const l=Math.min(63,Math.floor((.2126*pixels[j]+.7152*pixels[j+1]+.0722*pixels[j+2])/4));bins[l]++;}
    const max=Math.max(...bins,1);
    hist.clearRect(0,0,640,78);hist.fillStyle='#ebf2f5';hist.fillRect(0,0,640,78);
    hist.fillStyle='#327c9a';
    for(let i=0;i<64;i++)hist.fillRect(i*10,77-bins[i]/max*67,8,bins[i]/max*67);
    state.frames++;
  }
  // Pixelanalyse auf ca. 10 Hz begrenzt. Die gemeldete Kamera-Bildrate steht separat oben.
  state.raf = requestAnimationFrame(updatePixels);
}
async function listGrantedUsb() {
  if (!navigator.usb?.getDevices) { log('WebUSB wird von diesem Browser nicht unterstützt.', 'error'); $('usb-status').textContent='WebUSB nicht unterstützt'; return; }
  try {
    const devices=await navigator.usb.getDevices();
    const found=devices.filter(d=>d.vendorId===0x8086 && d.productId===0x0AD3);
    if(found.length){state.usb=found[0]; showUsb(found[0]); log('Bereits erlaubte RealSense D415 im Browser gefunden.', 'ok');}
    else { $('usb-status').textContent='Noch kein D415-USB-Zugriff erlaubt'; log('Keine zuvor erlaubte D415 gefunden. «D415 über USB auswählen» anklicken.');}
  } catch(err){fail('USB-Berechtigung nicht abfragbar',err);}
}
function showUsb(device) {
  const hex=(x,n=4)=>x?.toString(16).toUpperCase().padStart(n,'0') ?? '?';
  $('usb-status').textContent=`${device.productName||'USB-Gerät'} erkannt`;
  const configs = device.configurations||[];
  const lines=[];
  for(const c of configs){for(const i of c.interfaces||[]){for(const a of i.alternates||[]){lines.push(`Interface ${i.interfaceNumber}: Klasse 0x${hex(a.interfaceClass,2)}, Unterklasse 0x${hex(a.interfaceSubclass,2)}`);}}}
  $('usb-details').textContent=`Hersteller: ${device.manufacturerName||'–'} · VID: 0x${hex(device.vendorId)} · PID: 0x${hex(device.productId)} · ${lines.length?lines.join(' | '):'USB-Gerät sichtbar, keine Schnittstellendetails'}\nVideo-Schnittstellen (Klasse 0x0E) sind durch WebUSB geschützt. Kein Versuch, Treiber zu verändern oder diese Sperre zu umgehen.`;
}
async function chooseUsb() {
  if (!navigator.usb?.requestDevice){log('USB-Auswahl in diesem Browser nicht verfügbar. Chrome oder Edge über HTTPS verwenden.','error');return;}
  try {
    const device=await navigator.usb.requestDevice({filters:[{vendorId:0x8086,productId:0x0AD3}]});
    state.usb=device;showUsb(device);
    log(`USB-Gerät ausgewählt: ${device.productName||'D415'} (VID 8086 / PID 0AD3). Das bestätigt noch KEINEN Z16-Tiefenzugriff.`, 'ok');
  } catch(err) {if (err.name==='NotFoundError') log('USB-Auswahl abgebrochen oder keine passende D415 gefunden.'); else fail('USB-Auswahl fehlgeschlagen',err);}
}
function report(){
  const track=state.stream?.getVideoTracks()[0];
  const settings=track?.getSettings() || {};
  const safeSettings=Object.fromEntries(Object.entries(settings).filter(([k])=>k!=='deviceId' && k!=='groupId'));
  return {
    project:'Swiss AR Sandbox',version:'0.5',stage:'1 – Browser-Diagnose',at:new Date().toISOString(),
    urlLocation:location.protocol+'//'+location.host+location.pathname,
    browser:navigator.userAgent,secureContext:isSecureContext,mediaDevices:!!navigator.mediaDevices,
    webUsb:!!navigator.usb,usbD415:state.usb?{manufacturerName:state.usb.manufacturerName,productName:state.usb.productName,vendorId:state.usb.vendorId,productId:state.usb.productId, interfaces:(state.usb.configurations||[]).flatMap(c=>c.interfaces?.flatMap(i=>i.alternates?.map(a=>({number:i.interfaceNumber,class:a.interfaceClass,subclass:a.interfaceSubclass})))||[])}:null,
    videoSources:state.cameras.map(c=>({name:c.name})),
    activeVideo:track?{name:track.label,settings:safeSettings,resolution:{width:state.width,height:state.height},measuredPreviewFps:state.fps,pixelAtCenter:state.pixel}:null,
    depthZ16:{verified:false,explanation:'Web API liefert dekodiertes Video, keine nachweisbaren 16-Bit-Z16-Tiefenwerte.'},
    errors:state.errors,logs:state.entries
  };
}
function downloadData(content,type,name){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function saveReport(){downloadData(JSON.stringify(report(),null,2),'application/json','swiss-ar-sandbox-d415-browser-diagnose.json');log('JSON-Diagnose lokal gespeichert.', 'ok');}
function saveSnapshot(){if(!state.stream)return; const c=document.createElement('canvas');c.width=$('video').videoWidth;c.height=$('video').videoHeight;c.getContext('2d').drawImage($('video'),0,0);c.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='d415-browser-videobild.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)},'image/png');log('Bild lokal als PNG gespeichert.', 'ok');}
$('permission-button').addEventListener('click',()=>startCamera());
$('select-button').addEventListener('click',()=>startCamera($('camera-select').value));
$('stop-button').addEventListener('click',()=>{stopStream();log('Videostream beendet.')});
$('usb-button').addEventListener('click',chooseUsb);
$('usb-list-button').addEventListener('click',listGrantedUsb);
$('download-button').addEventListener('click',saveReport);
$('snapshot-button').addEventListener('click',saveSnapshot);
$('clear-button').addEventListener('click',()=>{$('logs').replaceChildren();state.entries=[]});
window.addEventListener('beforeunload',stopStream);
(function init(){
  drawEmptyHistogram();
  const isChrome=/Chrome\//.test(navigator.userAgent)||/Edg\//.test(navigator.userAgent);
  $('browser-status').textContent=isChrome?'Chrome/Edge erkannt':'Browser prüfen';
  if(!isSecureContext)log('WARNUNG: Für den Kamerazugriff HTTPS verwenden (GitHub Pages).','error');
  else log('Sichere Browserumgebung vorhanden (HTTPS / localhost).','ok');
  if(!isChrome)log('Empfehlung: Auf Windows Chrome oder Edge verwenden.');
  if(!navigator.mediaDevices?.getUserMedia)log('Kein Browser-Kamerazugriff verfügbar.','error');
  if(!navigator.usb)log('WebUSB nicht vorhanden – die USB-Identifikation wird nicht verfügbar sein.');
  log('Tiefenstatus: Z16 NICHT nachgewiesen. Keine künstlichen Tiefenbilder.');
})();
