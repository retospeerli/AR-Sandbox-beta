/** Import camera-frame PLY point cloud exported by RealSense Viewer.
 * Reprojects 3D coordinates to an orthographic x/y raster. This is not an original Z16 camera frame.
 */
const typeMap={char:[1,'getInt8'],int8:[1,'getInt8'],uchar:[1,'getUint8'],uint8:[1,'getUint8'],short:[2,'getInt16'],int16:[2,'getInt16'],ushort:[2,'getUint16'],uint16:[2,'getUint16'],int:[4,'getInt32'],int32:[4,'getInt32'],uint:[4,'getUint32'],uint32:[4,'getUint32'],float:[4,'getFloat32'],float32:[4,'getFloat32'],double:[8,'getFloat64'],float64:[8,'getFloat64']};
function percentile(sorted,p){return sorted[Math.min(sorted.length-1,Math.max(0,Math.floor(sorted.length*p)))];}
export function readPLY(buffer){
  const bytes=new Uint8Array(buffer);if(bytes.length<40)throw new Error('PLY-Datei ist zu klein.');
  const headerLimit=Math.min(1024*1024,bytes.length);
  const headerText=new TextDecoder('ascii').decode(bytes.subarray(0,headerLimit));
  const match=headerText.match(/end_header\r?\n/);
  if(!match||!headerText.startsWith('ply\n')&&!headerText.startsWith('ply\r\n'))throw new Error('Keine unterstützte PLY-Datei (Header fehlt).');
  const header=headerText.slice(0,match.index+match[0].length),dataOffset=new TextEncoder().encode(header).length;
  const lines=header.split(/\r?\n/);let encoding='',vertexCount=0,element='',vertexProps=[];
  for(const line of lines){const s=line.trim().split(/\s+/);
    if(s[0]==='format')encoding=s[1];
    if(s[0]==='element'){element=s[1];if(element==='vertex')vertexCount=+s[2];}
    if(s[0]==='property'&&element==='vertex'){
      if(s[1]==='list')throw new Error('PLY-Vertices mit Listenfeldern werden nicht unterstützt.');
      if(!typeMap[s[1]])throw new Error(`PLY-Feldtyp unbekannt: ${s[1]}`);
      vertexProps.push({name:s[2],type:s[1],length:typeMap[s[1]][0],read:typeMap[s[1]][1]});
    }
  }
  if(vertexCount<1||vertexCount>4000000)throw new Error('PLY-Vertexzahl ausserhalb des unterstützten Bereichs (1–4 Mio.).');
  for(const name of ['x','y','z'])if(!vertexProps.some(p=>p.name===name))throw new Error(`PLY enthält kein Feld ${name}.`);
  const xs=new Float32Array(vertexCount),ys=new Float32Array(vertexCount),zs=new Float32Array(vertexCount);let count=0;
  if(encoding==='binary_little_endian'){
    const stride=vertexProps.reduce((s,p)=>s+p.length,0);
    if(dataOffset+stride*vertexCount>bytes.length)throw new Error('PLY-Binärdaten sind abgeschnitten.');
    const dv=new DataView(buffer);let p=dataOffset;
    for(let i=0;i<vertexCount;i++){
      let x=0,y=0,z=0;
      for(const field of vertexProps){const value=dv[field.read](p,true);p+=field.length;if(field.name==='x')x=value;else if(field.name==='y')y=value;else if(field.name==='z')z=value;}
      if(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z)&&z>0){xs[count]=x;ys[count]=y;zs[count]=z;count++;}
    }
  }else if(encoding==='ascii'){
    const body=new TextDecoder().decode(bytes.subarray(dataOffset));let lineStart=0;
    const indexX=vertexProps.findIndex(p=>p.name==='x'),indexY=vertexProps.findIndex(p=>p.name==='y'),indexZ=vertexProps.findIndex(p=>p.name==='z');
    for(let i=0;i<vertexCount;i++){
      let lineEnd=body.indexOf('\n',lineStart);if(lineEnd<0)lineEnd=body.length;
      const values=body.slice(lineStart,lineEnd).trim().split(/\s+/);lineStart=lineEnd+1;
      const x=+values[indexX],y=+values[indexY],z=+values[indexZ];
      if(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z)&&z>0){xs[count]=x;ys[count]=y;zs[count]=z;count++;}
    }
  }else throw new Error(`PLY-Kodierung '${encoding}' wird nicht unterstützt. Bitte ASCII oder Binary Little Endian exportieren.`);
  if(count<4)throw new Error('In der PLY-Punktwolke sind keine brauchbaren 3D-Messpunkte vorhanden.');
  const stride=Math.max(1,Math.floor(count/12000)),rangeX=[],rangeY=[];
  for(let i=0;i<count;i+=stride){rangeX.push(xs[i]);rangeY.push(ys[i]);}
  rangeX.sort((a,b)=>a-b);rangeY.sort((a,b)=>a-b);
  let left=percentile(rangeX,.005),right=percentile(rangeX,.995),top=percentile(rangeY,.005),bottom=percentile(rangeY,.995);
  if(right-left<.001||bottom-top<.001)throw new Error('PLY enthält keine auswertbare 2D-Ausdehnung.');
  const width=960,height=540;let spanX=right-left,spanY=bottom-top;
  // Keep metres per pixel identical in X/Y; do not stretch measured geometry.
  const ratio=width/height;if(spanX/spanY>ratio){const newY=spanX/ratio,mid=(top+bottom)/2;top=mid-newY/2;bottom=mid+newY/2;}
  else{const newX=spanY*ratio,mid=(left+right)/2;left=mid-newX/2;right=mid+newX/2;}
  spanX=right-left;spanY=bottom-top;
  const data=new Uint16Array(width*height);
  for(let i=0;i<count;i++){
    const px=Math.round((xs[i]-left)/spanX*(width-1)),py=Math.round((ys[i]-top)/spanY*(height-1));
    if(px<0||px>=width||py<0||py>=height)continue;
    const mm=Math.max(1,Math.min(65535,Math.round(zs[i]*1000))),idx=py*width+px;
    if(data[idx]===0||mm<data[idx])data[idx]=mm;
  }
  return {width,height,data,format:`PLY · ${encoding==='ascii'?'ASCII':'binär'}`,note:`${count.toLocaleString('de-CH')} gültige 3D-Punkte; aus X/Y orthografisch auf 960×540 gerastert. Keine originale Z16-Bildmatrix. Nicht als exakt kalibrierte Projektion verwenden.`,pointCount:count};
}
