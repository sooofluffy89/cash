import { admin, supervisor, entrySQL, type DB, type User } from './cash';
import { CashError } from './domain';
export function csvCell(value:unknown){let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export async function csvExport(db:DB,u:User,url:URL){
  supervisor(u);const from=url.searchParams.get('from')||'';const to=url.searchParams.get('to')||'';const kind=url.searchParams.get('kind')||'';
  if(!['','opening','in','out','count','adjustment','reversal','resolution'].includes(kind))throw new CashError('request');
  for(const d of [from,to])if(d&&!/^\d{4}-\d{2}-\d{2}$/.test(d))throw new CashError('request');
  const rows=await db.prepare(entrySQL+" WHERE (?='' OR e.kind=?) ORDER BY e.seq").bind(kind,kind).all<any>();
  // Actual period filtering uses Prague date (including DST), not a fixed UTC offset.
  const keys=['seq','id','kind','created_at','actor_name','actor_email','actor_role','reason','note','delta','expected','counted','difference','balance_after','linked_id','photo_id','resolved','closing_count_id','resolution_id','closed_name','closed_role','closed_at','closed_reason'];
  const date=(at:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
  const data=rows.results.filter(r=>(!from||date(r.created_at)>=from)&&(!to||date(r.created_at)<=to));
  const moneyKeys=new Set(['delta','expected','counted','difference','balance_after']);
  const text='\uFEFF'+keys.map(csvCell).join(';')+'\r\n'+data.map(r=>keys.map(k=>csvCell(moneyKeys.has(k)&&r[k]!=null?(r[k]/100).toFixed(2):r[k])).join(';')).join('\r\n');
  return new Response(text,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="cash-history.csv"','Cache-Control':'private, no-store'}});
}
const encode=new TextEncoder();
export function tarHeader(name:string,size:number){
  const h=new Uint8Array(512);const set=(s:string,p:number,n:number)=>h.set(encode.encode(s).slice(0,n),p);
  set(name,0,100);set('0000600\0',100,8);set('0000000\0',108,8);set('0000000\0',116,8);set(size.toString(8).padStart(11,'0')+'\0',124,12);set(Math.floor(Date.now()/1000).toString(8).padStart(11,'0')+'\0',136,12);h.fill(32,148,156);h[156]=48;set('ustar\0',257,6);set('00',263,2);const sum=h.reduce((a,b)=>a+b,0);set(sum.toString(8).padStart(6,'0')+'\0 ',148,8);return h;
}
export async function backup(db:DB,bucket:R2Bucket,u:User){
  admin(u);const names=['cash','users','entries','audit','media','count_closures'];
  const queries=names.map(n=>db.prepare('SELECT * FROM '+n+(n==='media'?' WHERE entry_id IS NOT NULL':'')));
  const result=await db.batch(queries);
  const tables=Object.fromEntries(names.map((n,i)=>[n,result[i].results]));
  const metadata=encode.encode(JSON.stringify({format:'labula-cash-v2',createdAt:new Date().toISOString(),currency:'CZK',unit:'haler',tables},null,2));
  const photos:any[]=tables.media;
  async function* chunks(){
    yield tarHeader('cash.json',metadata.length);yield metadata;if(metadata.length%512)yield new Uint8Array(512-metadata.length%512);
    for(const photo of photos){
      const object=await bucket.get(photo.key);if(!object||object.size!==photo.size)throw new Error('Backup attachment missing');
      yield tarHeader('photos/'+photo.id,object.size);const reader=object.body.getReader();
      try{while(true){const chunk=await reader.read();if(chunk.done)break;yield chunk.value;}}finally{await reader.cancel();}
      if(object.size%512)yield new Uint8Array(512-object.size%512);
    }
    yield new Uint8Array(1024);
  }
  const iterator=chunks();
  const stream=new ReadableStream({async pull(controller){try{const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(next.value);}catch(e){controller.error(e);}},async cancel(){await iterator.return();}});
  return new Response(stream,{headers:{'Content-Type':'application/x-tar','Content-Disposition':'attachment; filename="cash-backup-'+new Date().toISOString().slice(0,10)+'.tar"','Cache-Control':'private, no-store'}});
}
