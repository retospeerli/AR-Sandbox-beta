/** Reads true 16-bit greyscale PNG without reducing to Canvas 8-bit values. Interlaced / colour PNGs are explicitly rejected. */
import {rawZ16} from './depth.js';
const signature=[137,80,78,71,13,10,26,10];
export async function readPNG16(buffer,mmPerUnit=1){
  const input=new Uint8Array(buffer),dv=new DataView(buffer);
  if(input.length<33||!signature.every((v,i)=>input[i]===v))throw new Error('Keine gültige PNG-Datei.');
  let width=0,height=0,bitDepth=0,colorType=0,interlace=0,parts=[],position=8;
  while(position+12<=input.length){
    const len=dv.getUint32(position,false),type=String.fromCharCode(...input.subarray(position+4,position+8));
    if(position+12+len>input.length)throw new Error('PNG-Daten sind unvollständig.');
    const payload=input.subarray(position+8,position+8+len);
    if(type==='IHDR'){
      width=dv.getUint32(position+8,false);height=dv.getUint32(position+12,false);bitDepth=payload[8];colorType=payload[9];interlace=payload[12];
    }else if(type==='IDAT')parts.push(payload);
    position+=12+len;if(type==='IEND')break;
  }
  if(!width||!height||width*height>12000000) throw new Error('Ungültige PNG-Abmessungen.');
  if(bitDepth!==16||colorType!==0)throw new Error(`PNG mit ${bitDepth} Bit und Farbtyp ${colorType} ist kein 16-Bit-Graustufen-Tiefenbild. Ein Screenshot oder koloriertes Viewer-PNG enthält keine originalen Z16-Messwerte. Bitte RAW Z16 oder PLY verwenden.`);
  if(interlace!==0) throw new Error('Interlaced PNG wird für originale Tiefenmesswerte nicht unterstützt.');
  const size=parts.reduce((s,p)=>s+p.length,0),packed=new Uint8Array(size);let offset=0;
  for(const part of parts){packed.set(part,offset);offset+=part.length;}
  if(typeof DecompressionStream!=='function')throw new Error('Dieser Browser unterstützt DecompressionStream nicht. Bitte Chrome oder Edge verwenden.');
  const inflated=new Uint8Array(await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const stride=width*2;if(inflated.length!==(stride+1)*height)throw new Error('Die PNG-Rohdaten haben eine unerwartete Länge.');
  const out=new Uint16Array(width*height);let pos=0,previous=new Uint8Array(stride),current=new Uint8Array(stride);
  for(let y=0;y<height;y++){
    const filter=inflated[pos++];
    for(let i=0;i<stride;i++){
      const raw=inflated[pos++],a=i>=2?current[i-2]:0,b=previous[i],c=i>=2?previous[i-2]:0;
      let value;
      switch(filter){
        case 0:value=raw;break;
        case 1:value=raw+a;break;
        case 2:value=raw+b;break;
        case 3:value=raw+Math.floor((a+b)/2);break;
        case 4:{let p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);value=raw+(da<=db&&da<=dc?a:db<=dc?b:c);break;}
        default:throw new Error('Unbekannter PNG-Zeilenfilter.');
      }
      current[i]=value&255;
    }
    for(let x=0;x<width;x++){const n=(current[2*x]<<8)|current[2*x+1];out[y*width+x]=n?Math.max(1,Math.min(65535,Math.round(n*mmPerUnit))):0;}
    [previous,current]=[current,previous];
  }
  return {width,height,data:out,format:'PNG · 16-Bit Graustufen',note:`16-Bit-Graustufenwerte × ${mmPerUnit} mm; nur gültig, wenn Quell-PNG echte Z16-Werte enthält`};
}
