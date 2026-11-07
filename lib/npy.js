export function readNPY(buffer,mmPerUnit=1){
  const u=new Uint8Array(buffer),dv=new DataView(buffer);
  if(u.length<16||String.fromCharCode(...u.subarray(0,6))!=='\x93NUMPY')throw new Error('Keine NumPy-NPY-Datei.');
  const major=u[6],headerLength=major>=2?dv.getUint32(8,true):dv.getUint16(8,true),start=major>=2?12:10;
  const header=new TextDecoder().decode(u.subarray(start,start+headerLength));
  const dtype=header.match(/['"]descr['"]\s*:\s*['"]([^'"]+)['"]/),shape=header.match(/['"]shape['"]\s*:\s*\(\s*(\d+)\s*,\s*(\d+)/);
  if(!dtype||!shape)throw new Error('NPY erwartet eine zweidimensionale Matrix.');
  if(/fortran_order['"]?\s*:\s*True/.test(header))throw new Error('Fortran-geordnete NPY-Matrizen sind nicht unterstützt.');
  const height=+shape[1],width=+shape[2],fmt=dtype[1],count=width*height;
  if(count<=0||count>12000000)throw new Error('NPY-Masse ungültig.');
  const startData=start+headerLength, out=new Uint16Array(count);
  if(fmt==='<u2'||fmt==='|u2'){
    if(startData+count*2>u.length)throw new Error('NPY-Daten abgeschnitten.');
    for(let i=0;i<count;i++){const n=dv.getUint16(startData+i*2,true);out[i]=n?Math.max(1,Math.min(65535,Math.round(n*mmPerUnit))):0;}
    return {width,height,data:out,format:'NPY · UInt16 Z16',note:`Z16-Skalierung: ${mmPerUnit} mm/Einheit`};
  }
  if(fmt==='<f4'){
    if(startData+count*4>u.length)throw new Error('NPY-Daten abgeschnitten.');
    for(let i=0;i<count;i++){const n=dv.getFloat32(startData+i*4,true);out[i]=Number.isFinite(n)&&n>0?Math.max(1,Math.min(65535,Math.round(n*1000))):0;}
    return {width,height,data:out,format:'NPY · Float32 Meter',note:'Float32 als Meter interpretiert und in Millimeter umgerechnet'};
  }
  throw new Error(`NPY-Datentyp ${fmt} nicht unterstützt (erwartet <u2 oder <f4).`);
}
