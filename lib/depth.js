/** Depth is held in millimetres, 0 means no valid measurement. This module never derives depth from image brightness. */
export function rawZ16(buffer, width, height, mmPerUnit=1) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width*height>12000000) throw new Error('RAW-Bildmasse ungültig.');
  if (!Number.isFinite(mmPerUnit) || mmPerUnit<=0) throw new Error('Ungültiger Z16-Massstab.');
  const expected=width*height*2;
  if(buffer.byteLength!==expected) throw new Error(`RAW-Grösse stimmt nicht: ${buffer.byteLength.toLocaleString('de-CH')} Byte; erwartet ${expected.toLocaleString('de-CH')} Byte für ${width}×${height}. Masse korrigieren oder richtige Aufnahme wählen.`);
  const input=new DataView(buffer), data=new Uint16Array(width*height);
  for(let i=0;i<data.length;i++){const val=input.getUint16(i*2,true); data[i]=val?Math.min(65535,Math.max(1,Math.round(val*mmPerUnit))):0;}
  return {data,width,height,format:'Z16 RAW · Little Endian',note:`Z16-Skalierung: ${mmPerUnit} mm/Einheit`};
}
export function stats(data){
  const hist = new Uint32Array(65536);let valid=0, minimum=65536,maximum=0;
  for(let i=0;i<data.length;i++){const v=data[i]; if(v>0){valid++;hist[v]++;if(v<minimum)minimum=v;if(v>maximum)maximum=v;}}
  const pct=(p)=>{if(!valid)return 0;let target=Math.max(1,Math.ceil(valid*p)),sum=0;for(let v=1;v<65536;v++){sum+=hist[v];if(sum>=target)return v;}return maximum;};
  return {valid,total:data.length,ratio:valid/data.length,min:valid?minimum:0,max:maximum,near:pct(.02),far:pct(.98)};
}
export function median3(data,w,h){
  const out=new Uint16Array(data.length), v=new Uint16Array(9);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=y*w+x; if(!data[i])continue; let count=0;
    for(let yy=Math.max(0,y-1); yy<=Math.min(h-1,y+1);yy++) for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){
      const raw=data[yy*w+xx];if(raw) {let j=count;while(j>0&&v[j-1]>raw){v[j]=v[j-1];j--;}v[j]=raw;count++;}
    }
    out[i]=v[count>>1];
  }
  return out;
}
const stops=[
  [0,[48,25,119]], [.17,[29,89,179]], [.34,[35,183,222]], [.50,[53,201,159]],
  [.66,[207,228,108]], [.83,[246,170,62]], [1,[223,54,48]]
];
export function ramp(t){const s=Math.max(0,Math.min(1,t));let k=0;while(k<stops.length-2 && s>stops[k+1][0])k++;const a=stops[k],b=stops[k+1],p=(s-a[0])/(b[0]-a[0]);return [Math.round(a[1][0]+(b[1][0]-a[1][0])*p),Math.round(a[1][1]+(b[1][1]-a[1][1])*p),Math.round(a[1][2]+(b[1][2]-a[1][2])*p)];}
export function colorize(canvas,frame,rangeMin,rangeMax,filter=false){
  const {width:w,height:h,data}=frame;canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{alpha:false});const pix=ctx.createImageData(w,h);const src=filter?median3(data,w,h):data;
  const span=Math.max(1,rangeMax-rangeMin);let lut=new Uint8Array(65536*3);
  for(let v=1;v<65536;v++){let rgb=ramp((rangeMax-v)/span),i=v*3;lut[i]=rgb[0];lut[i+1]=rgb[1];lut[i+2]=rgb[2];}
  for(let i=0;i<src.length;i++){
    const v=src[i],j=i*4,k=v*3;
    if(v){pix.data[j]=lut[k];pix.data[j+1]=lut[k+1];pix.data[j+2]=lut[k+2];}else{pix.data[j]=5;pix.data[j+1]=9;pix.data[j+2]=14;}
    pix.data[j+3]=255;
  }
  ctx.putImageData(pix,0,0);return src;
}
