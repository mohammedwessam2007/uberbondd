export function parseCsv(text='') {
  const rows=[]; let row=[]; let field=''; let quoted=false;
  const s=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<s.length;i++){
    const c=s[i], n=s[i+1];
    if(quoted){
      if(c==='"'&&n==='"'){field+='"';i++;}
      else if(c==='"') quoted=false;
      else field+=c;
    } else if(c==='"') quoted=true;
    else if(c===','){row.push(field);field='';}
    else if(c==='\n'){row.push(field);rows.push(row);row=[];field='';}
    else if(c!=='\r') field+=c;
  }
  if(field.length||row.length){row.push(field);rows.push(row);}
  const clean=rows.filter(r=>r.some(x=>String(x).trim()));
  if(!clean.length) return [];
  const headers=clean[0].map(h=>String(h).trim());
  return clean.slice(1).map((r,idx)=>Object.fromEntries(headers.map((h,i)=>[h,String(r[i]??'').trim()]))).map((x,idx)=>({...x,__row:idx+2}));
}
