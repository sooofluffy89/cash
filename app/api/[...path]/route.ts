import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { authorize, state, saveEntry, manage, mapDBError, entrySQL, entryDetail } from '../../../lib/cash';
import { CashError, imageType, requestId } from '../../../lib/domain';
import { csvExport, backup } from '../../../lib/export';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function limitedBody(request:Request,limit:number){
  const reader=request.body?.getReader();if(!reader)throw new CashError('request');const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>limit){await reader.cancel();throw new CashError('request',413);}chunks.push(item.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}return bytes;
}
async function handle(request:Request){
  try{
    const db=env.DB;if(!db)throw new CashError('server',503);
    const identity=await getChatGPTUser();const user=await authorize(db,identity);
    const url=new URL(request.url);const path=url.pathname.slice(5);
    const safe=async(response:Response)=>{
      const current=await db.prepare('SELECT role FROM users WHERE id=? AND active=1 AND subject=?').bind(user.id,identity!.userId).first<{role:string}>();
      if(!current||current.role!==user.role||path==='backup'&&current.role!=='admin'||path==='export'&&!['admin','manager'].includes(current.role))throw new CashError('denied',403);
      return response;
    };
    if(request.method==='GET'){
      if(path==='state')return await safe(json(await state(db,user)));
      if(path==='history'){
        const kind=url.searchParams.get('kind')||'';const cursor=Number(url.searchParams.get('cursor')||Number.MAX_SAFE_INTEGER);
        if(!Number.isSafeInteger(cursor)||cursor<0||!['','opening','in','out','count','adjustment','reversal','resolution'].includes(kind))throw new CashError('request');
        const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
        if([from,to].some(d=>d&&!/^\d{4}-\d{2}-\d{2}$/.test(d)))throw new CashError('request');
        // Prague day boundaries are resolved with actual timezone/DST by the JS filter.
        const all=await db.prepare(entrySQL+" WHERE e.seq<? AND (?='' OR e.kind=?) ORDER BY e.seq DESC LIMIT 500")
          .bind(cursor,kind,kind).all<any>();
        const date=(s:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
        const rows=all.results.filter(r=>(!from||date(r.created_at)>=from)&&(!to||date(r.created_at)<=to));
        return await safe(json({rows,next:all.results.length===500?all.results.at(-1)?.seq:null}));
      }
      if(path.startsWith('entries/')){
        return await safe(json(await entryDetail(db,decodeURIComponent(path.slice(8)))));
      }
      if(path.startsWith('requests/')){
        const id=requestId(path.slice(9));return await safe(json({entry:await db.prepare('SELECT * FROM entries WHERE request_id=? AND actor_id=?').bind(id,user.id).first()}));
      }
      if(path.startsWith('photos/')){
        const photo=await db.prepare('SELECT * FROM media WHERE id=? AND entry_id IS NOT NULL').bind(path.slice(7)).first<any>();
        if(!photo||!env.BUCKET)throw new CashError('missing',404);const file=await env.BUCKET.get(photo.key);if(!file)throw new CashError('missing',404);
        return await safe(new Response(file.body,{headers:{'Content-Type':photo.content_type,'Content-Length':String(file.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}}));
      }
      if(path==='export')return await safe(await csvExport(db,user,url));
      if(path==='backup'){if(!env.BUCKET)throw new CashError('server',503);return await safe(await backup(db,env.BUCKET,user));}
    }
    if(request.method==='POST'){
      if(request.headers.get('origin')!==url.origin || request.headers.get('sec-fetch-site')==='cross-site')throw new CashError('denied',403);
      if(path==='photos'){
        if(!env.BUCKET)throw new CashError('server',503);
        if(Number(request.headers.get('content-length'))>8*1024*1024)throw new CashError('photoSize',413);
        const raw=await limitedBody(request,8*1024*1024+65536);
        const body=await new Response(raw,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();const file=body.get('photo');const id=requestId(body.get('uploadId'));
        if(!(file instanceof File)||file.size===0||file.size>8*1024*1024)throw new CashError('photoSize',413);
        const existing=await db.prepare('SELECT id,owner_id FROM media WHERE id=?').bind(id).first<any>();
        if(existing){if(existing.owner_id!==user.id)throw new CashError('denied',403);return json({id});}
        const bytes=new Uint8Array(await file.arrayBuffer());const type=imageType(bytes);if(!type)throw new CashError('photoType',415);
        const key='cash/'+user.id+'/'+crypto.randomUUID();await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:type}});
        try{await db.prepare('INSERT INTO media(id,owner_id,key,content_type,size,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND active=1)').bind(id,user.id,key,type,bytes.length,new Date().toISOString(),user.id).run();}
        catch(e){await env.BUCKET.delete(key);const retry=await db.prepare('SELECT id FROM media WHERE id=? AND owner_id=?').bind(id,user.id).first();if(retry)return await safe(json({id}));throw mapDBError(e);}
        if(!await db.prepare('SELECT id FROM media WHERE id=?').bind(id).first()){await env.BUCKET.delete(key);throw new CashError('denied',403);}return json({id});
      }
      if(!request.headers.get('content-type')?.includes('application/json'))throw new CashError('request');
      if(Number(request.headers.get('content-length'))>128000)throw new CashError('request',413);
      let input:any;const raw=await limitedBody(request,128000);try{input=JSON.parse(new TextDecoder().decode(raw));}catch{throw new CashError('request');}
      if(path==='entries')return json({entry:await saveEntry(db,user,input)});
      if(path==='manage')return json(await manage(db,user,input));
    }
    throw new CashError('missing',404);
  }catch(e){if(e instanceof CashError)return json({error:e.code},e.status);console.error('CASH request failed',String(e));return json({error:'server'},500);}
}
export const GET=handle;
export const POST=handle;
