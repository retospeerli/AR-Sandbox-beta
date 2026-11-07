export function readCSV(text){
  const rows=text.trim().split(/\r?\n/).filter(l=>l.trim()&&!l.trim().startsWith('#'));
  if(!rows.length)throw new Error('CSV ist leer.');
  const parse=(s)=>s.trim().split(/[;,\t ]+/).filter(Boolean).map(v=>Number(v));
  const first=parse(rows[0]),width=first.length,height=rows.length;
  if(width<2||height<2||width*height>12000000)throw new Error('CSV benötigt eine 2D-Matrix mit mindestens 2 × 2 Messwerten.');
  const data=new Uint16Array(width*height);
  for(let y=0;y<height;y++){
    const r=parse(rows[y]);if(r.length!==width)throw new Error(`CSV Zeile ${y+1}: ${r.length} Werte statt ${width}.`);
    for(let x=0;x<width;x++){const n=r[x];if(!Number.isFinite(n)||n<0)throw new Error(`CSV Zeile ${y+1}: ungültige Zahl.`);data[y*width+x]=Math.min(65535,Math.round(n));}
  }
  return {width,height,data,format:'CSV · Millimeter-Matrix',note:'CSV-Werte werden als Millimeter interpretiert; 0 = fehlender Messwert'};
}
