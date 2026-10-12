import { CashError, MAX_MONEY, moneyInput, textInput, emailInput, requestId } from './domain';
export type Identity={userId:string; email:string; displayName:string};
export type Role='staff'|'manager'|'admin';
export type User={id:string;email:string;subject:string|null;name:string;role:Role;active:number};
export type DB=D1Database;
// Verified owner from Sites get_site access_policy; never a first-visitor bootstrap.
export const OWNER_EMAIL='jan@bananasport.cz';
const at=()=>new Date().toISOString();
const uuid=()=>crypto.randomUUID();
type Rule=[string,...any[]];
function guard(db:DB,id:string,rules:Record<string,Rule>){
  const columns=Object.keys(rules);const values:any[]=[id];
  const selects=columns.map(k=>{const [sql,...args]=rules[k];values.push(...args);return `CASE WHEN (${sql}) THEN 1 ELSE 0 END`;});
  return db.prepare(`INSERT INTO write_guards(id,${columns.join(',')}) SELECT ?,${selects.join(',')}`).bind(...values);
}
export async function authorize(db:DB, identity:Identity|null):Promise<User> {
  if(!identity?.userId || !identity.email)throw new CashError('signin',401);
  const email=identity.email.trim().toLowerCase();
  if(email===OWNER_EMAIL){
    await db.prepare("INSERT INTO users(id,email,subject,name,role,active,created_at,updated_at) SELECT ?,?,?,?,'admin',1,?,? WHERE NOT EXISTS(SELECT 1 FROM users)")
      .bind(uuid(),email,identity.userId,identity.displayName,at(),at()).run();
  }
  await db.prepare('UPDATE users SET subject=? WHERE email=? AND subject IS NULL AND active=1 AND NOT EXISTS(SELECT 1 FROM users WHERE subject=?)')
    .bind(identity.userId,email,identity.userId).run();
  const u=await db.prepare('SELECT * FROM users WHERE subject=? AND active=1').bind(identity.userId).first<User>();
  if(!u)throw new CashError('denied',403);
  await db.prepare('INSERT OR IGNORE INTO cash(id,balance,initialized,revision,weekday) VALUES(1,0,0,0,1)').run();
  return u;
}
export function admin(u:User){if(u.role!=='admin')throw new CashError('denied',403);}
export function supervisor(u:User){if(!['admin','manager'].includes(u.role))throw new CashError('denied',403);}
// Legacy resolutions remain readable; new closures are immutable, shared links to one final count.
export const openCountSQL="e.kind='count' AND e.difference<>0 AND NOT EXISTS(SELECT 1 FROM entries r WHERE r.kind='resolution' AND r.linked_id=e.id) AND NOT EXISTS(SELECT 1 FROM count_closures cc WHERE cc.count_id=e.id)";
export const entrySQL=`SELECT e.*,
 EXISTS(SELECT 1 FROM entries v WHERE v.linked_id=e.id AND v.kind='reversal') AS reversed,
 (cc.count_id IS NOT NULL OR lr.id IS NOT NULL) AS resolved,
 cc.closing_count_id,COALESCE(cc.resolution_id,lr.id) AS resolution_id,
 COALESCE(cc.closed_name,lr.actor_name) AS closed_name,COALESCE(cc.closed_role,lr.actor_role) AS closed_role,
 COALESCE(cc.created_at,lr.created_at) AS closed_at,COALESCE(cc.reason,lr.reason) AS closed_reason,
 COALESCE(cr.delta,lr.delta,0) AS closure_delta
 FROM entries e LEFT JOIN count_closures cc ON cc.count_id=e.id
 LEFT JOIN entries cr ON cr.id=cc.resolution_id
 LEFT JOIN entries lr ON lr.linked_id=e.id AND lr.kind='resolution' AND cc.count_id IS NULL`;
export async function entryDetail(db:DB,id:string){
 const entry=await db.prepare(entrySQL+' WHERE e.id=?').bind(id).first<any>();
 if(!entry)throw new CashError('missing',404);
 const links=await db.prepare(entrySQL+' WHERE e.linked_id=? ORDER BY e.seq').bind(id).all();
 const closedCounts=await db.prepare(entrySQL+' WHERE cc.closing_count_id=? AND e.id<>? ORDER BY e.seq').bind(id,id).all();
 return {entry,links:links.results,closedCounts:closedCounts.results};
}
export async function state(db:DB,u:User) {
  const r=await db.batch([
    db.prepare('SELECT * FROM cash WHERE id=1'),
    db.prepare(entrySQL+' ORDER BY e.seq DESC LIMIT 12'),
    db.prepare(entrySQL+" WHERE e.kind='count' ORDER BY e.seq DESC LIMIT 1"),
    db.prepare(entrySQL+' WHERE '+openCountSQL+' ORDER BY e.seq DESC'),
    db.prepare('SELECT id,email,name,role,active,subject IS NOT NULL AS joined FROM users ORDER BY name'),
    db.prepare('SELECT * FROM audit ORDER BY seq DESC LIMIT 30'),
  ]);
  return {user:{id:u.id,name:u.name,email:u.email,role:u.role},cash:r[0].results[0],recent:r[1].results,lastCount:r[2].results[0]||null,
    unresolved:r[3].results,users:u.role==='admin'?r[4].results:[],audit:u.role==='admin'?r[5].results:[]};
}
async function hash(value:unknown){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');}
export async function saveEntry(db:DB,u:User,input:any){
  const rid=requestId(input.requestId);
  const current=await db.prepare('SELECT role FROM users WHERE id=? AND subject=? AND active=1').bind(u.id,u.subject).first<{role:string}>();
  if(!current)throw new CashError('denied',403);
  if(current.role!==u.role)throw new CashError('roleChanged',409);
  const kind=String(input.kind);if(!['opening','in','out','count','adjustment','reversal','resolution'].includes(kind))throw new CashError('request');
  const reason=textInput(input.reason,240,kind!=='count'); const note=textInput(input.note,1000);
  const linkedId=input.linkedId?textInput(input.linkedId,80):null;
  const photoId=input.photoId?textInput(input.photoId,80):null;
  const revision=Number(input.revision);if(!Number.isSafeInteger(revision)||revision<0)throw new CashError('request');
  let closingIds:string[]=[];
  if(kind==='count'){
    if(input.closingIds!==undefined&&!Array.isArray(input.closingIds))throw new CashError('request');
    closingIds=(input.closingIds||[]).map(requestId).sort();
    if(new Set(closingIds).size!==closingIds.length)throw new CashError('request');
  }
  const intent={kind,amount:input.amount,reason,note,linkedId,photoId,revision,subtract:!!input.subtract,mode:input.mode,actorRole:input.actorRole,...(kind==='count'&&input.closingIds!==undefined?{closingIds}: {})};
  const rh=await hash(intent);
  const existing=await db.prepare('SELECT * FROM entries WHERE request_id=?').bind(rid).first<any>();
  if(existing){if(existing.actor_id!==u.id||existing.request_hash!==rh)throw new CashError('requestConflict',409);return db.prepare(entrySQL+' WHERE e.id=?').bind(existing.id).first();}
  if(['opening','adjustment'].includes(kind))admin(u);
  if(['reversal','resolution'].includes(kind))supervisor(u);
  // Already saved legacy receipts remain retryable; new adjust/explain writes are refused.
  if(kind==='resolution')throw new CashError('recountRequired',409);
  if(input.actorRole!==undefined&&input.actorRole!==u.role || kind==='count'&&input.actorRole!==u.role)throw new CashError('roleChanged',409);
  if(kind==='count'&&input.closingIds===undefined)throw new CashError('request');
  const c=await db.prepare('SELECT * FROM cash WHERE id=1').first<any>();
  if(!c.initialized&&kind!=='opening')throw new CashError('uninitialized',409);
  if(kind==='opening'&&c.initialized)throw new CashError('alreadyInitialized',409);
  if(c.revision!==revision)throw new CashError('stale',409);
  let delta=0,counted:number|null=null,difference:number|null=null;
  if(kind==='opening'||kind==='in')delta=moneyInput(input.amount,kind==='opening');
  if(kind==='out')delta=-moneyInput(input.amount);
  if(kind==='adjustment')delta=moneyInput(input.amount)*(input.subtract?-1:1);
  const finalCount=kind==='count'&&u.role!=='staff';
  if(kind==='count'){
    counted=moneyInput(input.amount,true);difference=counted-c.balance;
    if((difference||finalCount&&closingIds.length)&&!reason)throw new CashError('reason');
    if(u.role==='staff'&&closingIds.length)throw new CashError('denied',403);
    if(linkedId&&(!finalCount||!closingIds.includes(linkedId)))throw new CashError('linked',409);
  }
  if(kind==='reversal'){
    const original=await db.prepare('SELECT * FROM entries WHERE id=?').bind(linkedId).first<any>();
    if(!original)throw new CashError('missing',404);
    if(!['in','out','adjustment'].includes(original.kind))throw new CashError('request');
    delta=-original.delta;
  }
  if(c.balance+delta<0)throw new CashError('overdraft',409);
  if(c.balance+delta>MAX_MONEY)throw new CashError('amount');
  const id=uuid(),timestamp=at();
  const correction=finalCount?difference||0:0;
  const resolutionId=correction?uuid():null;
  const finalBalance=c.balance+delta+correction;
  const insert=(eid:string,request:string,hash:string,k:string,d:number,exp:number,cnt:number|null,diff:number|null,after:number,rev:number,link:string|null,photo:string|null)=>db.prepare('INSERT INTO entries(id,request_id,request_hash,kind,delta,expected,counted,difference,balance_after,expected_revision,reason,note,linked_id,photo_id,actor_id,actor_name,actor_email,actor_role,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
   .bind(eid,request,hash,k,d,exp,cnt,diff,after,rev,reason,note,link,photo,u.id,u.name,u.email,u.role,timestamp);
  try {
    const gid=uuid();
    const checks:Record<string,Rule>={
      access_ok:["EXISTS(SELECT 1 FROM users WHERE id=? AND subject=? AND active=1 AND role=?)",u.id,u.subject,u.role],
      revision_ok:['EXISTS(SELECT 1 FROM cash WHERE id=1 AND revision=? AND balance=?)',revision,c.balance],
      balance_ok:['? BETWEEN 0 AND 9999999999',finalBalance],
      init_ok:['EXISTS(SELECT 1 FROM cash WHERE id=1 AND initialized=?)',kind==='opening'?0:1],
      photo_ok:["? IS NULL OR EXISTS(SELECT 1 FROM media WHERE id=? AND owner_id=? AND entry_id IS NULL)",photoId,photoId,u.id],
    };
    if(kind==='reversal')checks.link_ok=["EXISTS(SELECT 1 FROM entries e WHERE e.id=? AND e.kind IN ('in','out','adjustment') AND e.delta=-? AND NOT EXISTS(SELECT 1 FROM entries r WHERE r.kind='reversal' AND r.linked_id=e.id))",linkedId,delta];
    if(finalCount)checks.link_ok=[`(SELECT COUNT(*) FROM entries e WHERE ${openCountSQL})=? AND NOT EXISTS(SELECT 1 FROM entries e WHERE ${openCountSQL} AND e.id NOT IN(SELECT value FROM json_each(?)))`,closingIds.length,JSON.stringify(closingIds)];
    const statements=[
      guard(db,gid,checks),
      insert(id,rid,rh,kind,delta,c.balance,counted,difference,c.balance+delta,revision,linkedId,photoId),
    ];
    if(resolutionId)statements.push(insert(resolutionId,uuid(),rh,'resolution',correction,c.balance,null,null,finalBalance,revision+1,id,null));
    if(finalCount)statements.push(db.prepare('INSERT INTO count_closures(count_id,closing_count_id,resolution_id,closed_by,closed_name,closed_role,reason,created_at) SELECT e.id,?,?,?,?,?,?,? FROM entries e WHERE e.id=? OR e.id IN(SELECT value FROM json_each(?))')
      .bind(id,resolutionId,u.id,u.name,u.role,reason,timestamp,id,JSON.stringify(closingIds)));
    statements.push(
      db.prepare('UPDATE cash SET balance=?,revision=?,initialized=1 WHERE id=1').bind(finalBalance,revision+1+(resolutionId?1:0)),
      db.prepare('UPDATE media SET entry_id=? WHERE id=? AND owner_id=? AND entry_id IS NULL').bind(id,photoId,u.id),
      db.prepare('DELETE FROM write_guards WHERE id=?').bind(gid));
    await db.batch(statements);
  }catch(e){
    const saved=await db.prepare('SELECT * FROM entries WHERE request_id=?').bind(rid).first<any>();
    if(saved&&saved.actor_id===u.id&&saved.request_hash===rh)return db.prepare(entrySQL+' WHERE e.id=?').bind(saved.id).first();
    throw mapDBError(e);
  }
  return db.prepare(entrySQL+' WHERE e.id=?').bind(id).first();
}
export function mapDBError(e:unknown){
  const s=String(e);for(const code of ['stale','overdraft','denied','lastAdmin','alreadyInitialized','uninitialized','linked','photo','amount','reason','correctionSinceCount'])if(s.includes('cash_'+code))return new CashError(code,code==='denied'?403:409);
  if(s.includes('UNIQUE constraint'))return new CashError('requestConflict',409);
  console.error('CASH database operation failed',s);return new CashError('server',500);
}
export async function manage(db:DB,u:User,input:any){
  admin(u);const rid=requestId(input.requestId);const timestamp=at();
  if(await db.prepare('SELECT id FROM audit WHERE request_id=? AND actor_id=?').bind(rid,u.id).first())return {ok:true};
  let before:any,after:any,target:string,command:D1PreparedStatement;let beforeSQL:string;
  if(input.action==='weekday'){
    const n=Number(input.weekday);if(!Number.isInteger(n)||n<1||n>7)throw new CashError('request');
    before=await db.prepare('SELECT weekday FROM cash WHERE id=1').first();after={weekday:n};target='cash';command=db.prepare('UPDATE cash SET weekday=? WHERE id=1').bind(n);
    beforeSQL="(SELECT json_object('weekday',weekday) FROM cash WHERE id=1)";
  }else if(input.action==='user'){
    const name=textInput(input.name,100,true);const email=emailInput(input.email);
    const role=input.role;if(!['staff','manager','admin'].includes(role)||typeof input.active!=='boolean')throw new CashError('request');
    const id=input.id?textInput(input.id,80):uuid();
    before=await db.prepare('SELECT id,email,name,role,active FROM users WHERE id=?').bind(id).first<any>();
    if(input.id&&!before)throw new CashError('missing',404);
    if(before&&email!==before.email)throw new CashError('emailImmutable');
    after={id,email,name,role,active:input.active?1:0};target=id;
    beforeSQL="COALESCE((SELECT json_object('id',id,'email',email,'name',name,'role',role,'active',active) FROM users WHERE id=?),'null')";
    command=before?db.prepare('UPDATE users SET name=?,role=?,active=?,updated_at=? WHERE id=?').bind(name,role,after.active,timestamp,id):
      db.prepare('INSERT INTO users(id,email,name,role,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,email,name,role,after.active,timestamp,timestamp);
  }else throw new CashError('request');
  const gid=uuid();const checks:Record<string,Rule>={access_ok:["EXISTS(SELECT 1 FROM users WHERE id=? AND subject=? AND role='admin' AND active=1)",u.id,u.subject]};
  if(input.action==='user')checks.last_admin_ok=["NOT EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin' AND active=1 AND (?<>'admin' OR ?=0)) OR (SELECT COUNT(*) FROM users WHERE role='admin' AND active=1)>1",target,after.role,after.active];
  const auditArgs:any[]=[uuid(),rid,u.id,u.name,String(input.action),target];if(input.action==='user')auditArgs.push(target);auditArgs.push(JSON.stringify(after),timestamp);
  try{await db.batch([
    guard(db,gid,checks),
    db.prepare(`INSERT INTO audit(id,request_id,actor_id,actor_name,action,target_id,before_json,after_json,created_at,actor_role) SELECT ?,?,?,?,?,?,${beforeSQL},?,?,'admin'`).bind(...auditArgs),command,
    db.prepare('DELETE FROM write_guards WHERE id=?').bind(gid),
  ]);}catch(e){throw mapDBError(e);}
  return {ok:true};
}
