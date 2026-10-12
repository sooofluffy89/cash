import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
mkdirSync('.sites-runtime/test',{recursive:true});
for(const file of ['domain','cash','export']){const source=readFileSync('lib/'+file+'.ts','utf8').replaceAll("'./domain'","'./domain.mjs'").replaceAll("'./cash'","'./cash.mjs'");writeFileSync('.sites-runtime/test/'+file+'.mjs',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);}
const domain=await import('../.sites-runtime/test/domain.mjs');
const {authorize,saveEntry,manage,state,entryDetail,openCountSQL}=await import('../.sites-runtime/test/cash.mjs');
const {backup,csvExport,tarHeader}=await import('../.sites-runtime/test/export.mjs');
let passed=0;async function test(name,fn){await fn();passed++;process.stdout.write('✓ '+name+'\n');}
class LocalDB{
 constructor(legacy=false){this.failAt=-1;this.queue=Promise.resolve();this.sql=new DatabaseSync(':memory:');this.sql.exec('PRAGMA foreign_keys=ON');for(const f of ['0000_flippant_black_tarantula','0001_cash_guards','0002_resolution_review','0003_clever_terror',...(legacy?[]:['0004_many_shinko_yamashiro'])])this.sql.exec(readFileSync('drizzle/'+f+'.sql','utf8'));}
 prepare(query){const db=this;const statement=db.sql.prepare(query);let args=[];return{bind(...a){args=a;return this;},async run(){const r=statement.run(...args);return{success:true,meta:{changes:r.changes}};},async all(){return{success:true,results:statement.all(...args)};},async first(){return statement.get(...args)||null;}};}
 async batch(stmts){const task=this.queue.then(async()=>{this.sql.exec('BEGIN');try{const out=[];for(const [i,s] of stmts.entries()){if(i===this.failAt){this.failAt=-1;throw new Error('CHECK constraint failed: cash_linked');}out.push(await s.all());}this.sql.exec('COMMIT');return out;}catch(e){this.sql.exec('ROLLBACK');throw e;}});this.queue=task.catch(()=>{});return task;}
}
const db=new LocalDB();const owner={userId:'test_owner',email:'jan@bananasport.cz',displayName:'Owner'};
await test('anonymous and unknown identities cannot bootstrap',async()=>{await assert.rejects(authorize(db,null),{code:'signin'});await assert.rejects(authorize(db,{userId:'stranger',email:'stranger@example.test',displayName:'Stranger'}),{code:'denied'});assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM users').get().n,0);});
const u=await authorize(db,owner);
const c=()=>db.sql.prepare('SELECT * FROM cash').get();
const pending=()=>db.sql.prepare('SELECT e.id FROM entries e WHERE '+openCountSQL+' ORDER BY e.id').all().map(e=>e.id);
const input=(kind,amount,extra={})=>({kind,amount,reason:'Test reason',note:'',revision:c().revision,requestId:crypto.randomUUID(),actorRole:u.role,...(kind==='count'?{closingIds:pending()}:{}),...extra});
await manage(db,u,{action:'user',name:'Staff',email:'staff@example.test',role:'staff',active:true,requestId:crypto.randomUUID()});
const staff=await authorize(db,{userId:'test_staff',email:'staff@example.test',displayName:'Staff'});
const staffCount=(amount,extra={})=>input('count',amount,{actorRole:'staff',closingIds:[],...extra});
await manage(db,u,{action:'user',name:'Manager',email:'manager@example.test',role:'manager',active:true,requestId:crypto.randomUUID()});
const manager=await authorize(db,{userId:'test_manager',email:'manager@example.test',displayName:'Manager'});
const managerCount=(amount,extra={})=>input('count',amount,{actorRole:'manager',...extra});
await test('zero allowed only for count/opening; decimal precision and ambiguous values',async()=>{assert.equal(domain.moneyInput('10,01'),1001);assert.equal(domain.moneyInput('10.1'),1010);assert.equal(domain.moneyInput('0',true),0);for(const v of ['0','-1','1,000','1.001','1e3','1 000','NaN',''])assert.throws(()=>domain.moneyInput(v));assert.equal(domain.weekInfo(new Date('2026-10-25T23:30:00Z')).today,'2026-10-26');});
await test('movements disabled until opening; zero opening valid and immutable',async()=>{await assert.rejects(saveEntry(db,u,input('in','10')),{code:'uninitialized'});await saveEntry(db,u,input('opening','0'));assert.equal(c().initialized,1);assert.equal(c().balance,0);await assert.rejects(saveEntry(db,u,input('opening','3')),{code:'alreadyInitialized'});});
await test('blank/whitespace reason rejected',async()=>{for(const reason of ['','   ','\n\t','\u00a0'])await assert.rejects(saveEntry(db,u,input('in','10',{reason})),{code:'reason'});});
let deposit;
await test('duplicate/retry is idempotent even after later entries',async()=>{const v=input('in','100.01');const [a,b]=await Promise.all([saveEntry(db,u,v),saveEntry(db,u,v)]);assert.equal(a.id,b.id);deposit=a;await saveEntry(db,u,input('in','10'));assert.equal((await saveEntry(db,u,v)).id,a.id);assert.equal(c().balance,11001);await assert.rejects(saveEntry(db,u,{...v,amount:'101'}),{code:'requestConflict'});});
await test('concurrent withdrawals cannot overspend or lose updates',async()=>{const revision=c().revision;const r=await Promise.allSettled([saveEntry(db,u,input('out','80',{revision})),saveEntry(db,u,input('out','80',{revision}))]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(c().balance,3001);await assert.rejects(saveEntry(db,u,input('out','40')),{code:'overdraft'});});
let count;
await test('count difference requires explanation and never changes balance',async()=>{const before=c().balance;await assert.rejects(saveEntry(db,staff,staffCount('20',{reason:''})),{code:'reason'});count=await saveEntry(db,staff,staffCount('20'));assert.equal(count.difference,-1001);assert.equal(c().balance,before);assert.equal((await state(db,u)).unresolved.length,1);});
await test('stale count rejected after another movement',async()=>{const v=input('count','30.01');await saveEntry(db,u,input('in','10'));await assert.rejects(saveEntry(db,u,v),{code:'stale'});});
await test('new physical count closes pending case and applies only current difference',async()=>{const final=await saveEntry(db,manager,managerCount('30'));assert.equal(c().balance,3000);assert.equal(final.difference,-1001);assert.equal((await state(db,u)).unresolved.length,0);const detail=await entryDetail(db,count.id);assert.equal(detail.entry.difference,-1001);assert.equal(detail.entry.closing_count_id,final.id);assert.equal(detail.entry.closed_role,'manager');await assert.rejects(saveEntry(db,u,input('resolution',undefined,{linkedId:count.id,mode:'explain'})),{code:'recountRequired'});});
await test('matched and zero counts accepted without reason',async()=>{await saveEntry(db,staff,staffCount('30',{reason:''}));await saveEntry(db,staff,staffCount('0'));assert.equal(c().balance,3000);});
await test('linked reversal preserves original and reverses amount exactly',async()=>{const e=await saveEntry(db,u,input('out','5'));await saveEntry(db,u,input('reversal',undefined,{linkedId:e.id}));assert.equal(c().balance,3000);const original=db.sql.prepare('SELECT * FROM entries WHERE id=?').get(e.id);assert.equal(original.delta,e.delta);assert.equal(original.reason,e.reason);await assert.rejects(saveEntry(db,u,input('reversal',undefined,{linkedId:e.id})),{code:'linked'});});
await test('last active admin protection rolls back audit',async()=>{const n=db.sql.prepare('SELECT COUNT(*) n FROM audit').get().n;await assert.rejects(manage(db,u,{action:'user',id:u.id,name:u.name,email:u.email,role:'staff',active:true,requestId:crypto.randomUUID()}),{code:'lastAdmin'});assert.equal(db.sql.prepare('SELECT role FROM users WHERE id=?').get(u.id).role,'admin');assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM audit').get().n,n);});
await test('allowlist binds once and stable identity cannot be hijacked',async()=>{await assert.rejects(authorize(db,{userId:'other_subject',email:'staff@example.test',displayName:'Other'}),{code:'denied'});assert.equal((await authorize(db,{userId:'test_staff',email:'changed@example.test',displayName:'Staff'})).id,staff.id);});
await test('staff cannot manage, correct, reverse, resolve or set opening',async()=>{for(const kind of ['opening','adjustment','reversal','resolution'])await assert.rejects(saveEntry(db,staff,input(kind,'1')),{code:'denied'});await assert.rejects(manage(db,staff,{action:'weekday',weekday:2,requestId:crypto.randomUUID()}),{code:'denied'});await assert.rejects(csvExport(db,staff,new URL('http://test/api/export')),{code:'denied'});});
await test('deactivation revokes current identity and stale user write objects',async()=>{await manage(db,u,{action:'user',id:staff.id,name:staff.name,email:staff.email,role:'staff',active:false,requestId:crypto.randomUUID()});await assert.rejects(authorize(db,{userId:'test_staff',email:'staff@example.test',displayName:'Staff'}),{code:'denied'});await assert.rejects(saveEntry(db,staff,input('in','1')),{code:'denied'});});
await test('photo ownership/one attachment protects atomic cash state',async()=>{db.sql.prepare('INSERT INTO media(id,owner_id,key,content_type,size,created_at) VALUES(?,?,?,?,?,?)').run('photo1',staff.id,'private1','image/png',10,new Date().toISOString());const before=c().balance;await assert.rejects(saveEntry(db,u,input('in','10',{photoId:'photo1'})),{code:'photo'});assert.equal(c().balance,before);db.sql.prepare('INSERT INTO media(id,owner_id,key,content_type,size,created_at) VALUES(?,?,?,?,?,?)').run('photo2',u.id,'private2','image/png',8,new Date().toISOString());await saveEntry(db,u,input('in','1',{photoId:'photo2'}));assert.ok(db.sql.prepare('SELECT entry_id FROM media WHERE id=?').get('photo2').entry_id);await assert.rejects(saveEntry(db,u,input('in','1',{photoId:'photo2'})),{code:'photo'});});
await test('CSV exact money and spreadsheet formula escaping',async()=>{await saveEntry(db,u,input('in','0,01',{reason:'=HYPERLINK("evil")'}));const r=await csvExport(db,u,new URL('http://test/api/export'));const txt=await r.text();assert.ok(txt.includes("'="));assert.ok(txt.includes('0.01'));});
await test('private backup TAR contains snapshot and linked photo; unlinked photos excluded',async()=>{const bucket={async get(key){assert.equal(key,'private2');return{size:8,body:new ReadableStream({start(c){c.enqueue(new Uint8Array([137,80,78,71,13,10,26,10]));c.close();}})};}};const r=await backup(db,bucket,u);const bytes=new Uint8Array(await r.arrayBuffer());writeFileSync('.sites-runtime/test/backup.tar',bytes);assert.equal(new TextDecoder().decode(bytes.slice(0,9)),'cash.json');assert.ok(new TextDecoder().decode(bytes).includes('photos/photo2'));});
await test('backup restores ledger, permissions and photo into new isolated database',async()=>{
 const {restoreBackup}=await import('./restore-backup.mjs');
 const restored=restoreBackup('.sites-runtime/test/backup.tar',':memory:');
 assert.equal(restored.db.prepare('SELECT balance FROM cash').get().balance,c().balance);
 assert.equal(restored.db.prepare('SELECT active FROM users WHERE id=?').get(staff.id).active,0);
 assert.equal(restored.photos.length,1);assert.equal(restored.photos[0].bytes.length,8);
 assert.equal(restored.db.prepare('SELECT COUNT(*) n FROM entries').get().n,db.sql.prepare('SELECT COUNT(*) n FROM entries').get().n);
 restored.db.close();
});
await test('overlapping older counts cannot apply the same shortage twice',async()=>{
 await manage(db,u,{action:'user',id:staff.id,name:staff.name,email:staff.email,role:'staff',active:true,requestId:crypto.randomUUID()});
 const before=c().balance;const amount=((before-100)/100).toFixed(2);
 const a=await saveEntry(db,staff,staffCount(amount));const b=await saveEntry(db,staff,staffCount(amount));
 const root=await saveEntry(db,manager,managerCount(amount));assert.equal(c().balance,before-100);
 assert.equal(pending().length,0);assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM entries WHERE kind='resolution' AND linked_id=?").get(root.id).n,1);
 for(const original of [a,b])assert.equal((await entryDetail(db,original.id)).entry.closing_count_id,root.id);
});
await test('manager cannot manage people, settings, opening, standalone corrections or backup',async()=>{
 for(const action of [{action:'weekday',weekday:3},{action:'user',name:'Forged',email:'forged@example.test',role:'admin',active:true}])await assert.rejects(manage(db,manager,{...action,requestId:crypto.randomUUID()}),{code:'denied'});
 for(const kind of ['opening','adjustment'])await assert.rejects(saveEntry(db,manager,input(kind,'1',{actorRole:'manager'})),{code:'denied'});
 await assert.rejects(backup(db,{},manager),{code:'denied'});assert.equal((await state(db,manager)).users.length,0);assert.equal((await state(db,manager)).audit.length,0);
 assert.equal((await csvExport(db,manager,new URL('http://test/api/export'))).status,200);
});
await test('manager can reverse an actual movement while preserving actor role',async()=>{
 const e=await saveEntry(db,staff,input('out','1',{actorRole:'staff'}));const before=c().balance;
 const reversal=await saveEntry(db,manager,input('reversal',undefined,{actorRole:'manager',linkedId:e.id}));assert.equal(c().balance,before+100);assert.equal(reversal.actor_role,'manager');
});
await test('staff matched count leaves older pending cases visible',async()=>{
 const amount=((c().balance-200)/100).toFixed(2);await saveEntry(db,staff,staffCount(amount));
 const before=c().balance;await saveEntry(db,staff,staffCount((before/100).toFixed(2),{reason:''}));assert.equal(c().balance,before);assert.equal(pending().length,1);
});
await test('closing previous cases at a current match still requires an explanation',async()=>{
 const body=managerCount((c().balance/100).toFixed(2),{reason:'   '});await assert.rejects(saveEntry(db,manager,body),{code:'reason'});assert.equal(pending().length,1);
 const before=c().balance;const root=await saveEntry(db,manager,{...body,reason:'Recount verified the current matching balance'});assert.equal(c().balance,before);assert.equal(root.resolved,1);assert.equal(pending().length,0);assert.equal((await entryDetail(db,root.id)).closedCounts.length,1);
});
await test('missing withdrawal recorded first is not deducted again during closure',async()=>{
 const actual=c().balance-500;const first=await saveEntry(db,staff,staffCount((actual/100).toFixed(2)));
 await saveEntry(db,manager,input('out','5',{actorRole:'manager',reason:'Found missing withdrawal'}));
 const before=c().balance;const root=await saveEntry(db,manager,managerCount((actual/100).toFixed(2)));assert.equal(root.difference,0);assert.equal(c().balance,before);assert.equal((await entryDetail(db,first.id)).entry.closure_delta,0);
});
await test('manager shortage, surplus, zero and matched own counts close immediately',async()=>{
 for(const haler of [c().balance-10,c().balance+20,0,0]){
  const before=c().balance;const root=await saveEntry(db,manager,managerCount((haler/100).toFixed(2),{reason:haler===before?'':'Verified physical count'}));
  assert.equal(c().balance,haler);assert.equal(root.difference,haler-before);assert.equal(root.resolved,1);assert.equal(pending().length,0);
  assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM entries WHERE kind='resolution' AND linked_id=?").get(root.id).n,haler===before?0:1);
 }
 await saveEntry(db,u,input('in','100'));
});
await test('privileged own count retry remains exactly once after later movements',async()=>{
 const body=managerCount('90');const root=await saveEntry(db,manager,body);await saveEntry(db,u,input('in','1'));const before=c().balance;
 const retry=await saveEntry(db,manager,body);assert.equal(retry.id,root.id);assert.equal(retry.resolved,1);assert.equal(c().balance,before);
 assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM entries WHERE kind='resolution' AND linked_id=?").get(root.id).n,1);
 await assert.rejects(saveEntry(db,manager,{...body,amount:'89'}),{code:'requestConflict'});
});
await test('two supervisors closing the same revision produce only one correction',async()=>{
 const target=((c().balance-100)/100).toFixed(2);await saveEntry(db,staff,staffCount(target));const a=managerCount(target),b=input('count',target);
 const before=db.sql.prepare("SELECT COUNT(*) n FROM entries WHERE kind='resolution'").get().n;
 const results=await Promise.allSettled([saveEntry(db,manager,a),saveEntry(db,u,b)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(pending().length,0);
 assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM entries WHERE kind='resolution'").get().n,before+1);
});
await test('closure refuses missing, invented or duplicate cases from client',async()=>{
 await saveEntry(db,staff,staffCount('85'));const body=managerCount('85');
 await assert.rejects(saveEntry(db,manager,{...body,closingIds:[]}),{code:'linked'});
 await assert.rejects(saveEntry(db,manager,{...body,closingIds:[crypto.randomUUID()]}),{code:'linked'});
 await assert.rejects(saveEntry(db,manager,{...body,closingIds:[...body.closingIds,...body.closingIds]}),{code:'request'});
 await assert.rejects(saveEntry(db,staff,staffCount('85',{closingIds:body.closingIds})),{code:'denied'});
});
await test('a new pending count cannot be silently added to an already prepared closure',async()=>{
 const body=managerCount('85');await saveEntry(db,staff,staffCount('84'));await assert.rejects(saveEntry(db,manager,body),{code:'stale'});
 await assert.rejects(saveEntry(db,manager,{...body,revision:c().revision}),{code:'linked'});
});
await test('failure after count and correction rolls back closures, money and photo attachment',async()=>{
 const body=managerCount('84');const before={...c()},entries=db.sql.prepare('SELECT COUNT(*) n FROM entries').get().n,closures=db.sql.prepare('SELECT COUNT(*) n FROM count_closures').get().n;
 db.sql.prepare('INSERT INTO media(id,owner_id,key,content_type,size,created_at) VALUES(?,?,?,?,?,?)').run('rollbackphoto',manager.id,'unlinked','image/png',8,new Date().toISOString());
 db.failAt=3;await assert.rejects(saveEntry(db,manager,{...body,photoId:'rollbackphoto'}),{code:'linked'});
 assert.deepEqual({...c()},before);assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM entries').get().n,entries);assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM count_closures').get().n,closures);assert.equal(db.sql.prepare('SELECT entry_id FROM media WHERE id=?').get('rollbackphoto').entry_id,null);
 const root=await saveEntry(db,manager,{...body,photoId:'rollbackphoto'});assert.equal(root.photo_id,'rollbackphoto');assert.equal(db.sql.prepare('SELECT entry_id FROM media WHERE id=?').get('rollbackphoto').entry_id,root.id);
});
await test('role changes require a fresh count intent and never silently grant auto closure',async()=>{
 const old=managerCount('83');await manage(db,u,{action:'user',id:manager.id,name:manager.name,email:manager.email,role:'staff',active:true,requestId:crypto.randomUUID()});
 const now=await authorize(db,{userId:'test_manager',email:manager.email,displayName:'Manager'});
 await assert.rejects(saveEntry(db,now,old),{code:'roleChanged'});await assert.rejects(saveEntry(db,manager,old),{code:'roleChanged'});
 const body=staffCount('83');await manage(db,u,{action:'user',id:staff.id,name:staff.name,email:staff.email,role:'manager',active:true,requestId:crypto.randomUUID()});
 const promoted=await authorize(db,{userId:'test_staff',email:staff.email,displayName:'Staff'});await assert.rejects(saveEntry(db,promoted,body),{code:'roleChanged'});
 await manage(db,u,{action:'user',id:manager.id,name:manager.name,email:manager.email,role:'manager',active:true,requestId:crypto.randomUUID()});
 await manage(db,u,{action:'user',id:staff.id,name:staff.name,email:staff.email,role:'staff',active:true,requestId:crypto.randomUUID()});
});
await test('last admin cannot be demoted to manager and role changes preserve historical role',async()=>{
 await assert.rejects(manage(db,u,{action:'user',id:u.id,name:u.name,email:u.email,role:'manager',active:true,requestId:crypto.randomUUID()}),{code:'lastAdmin'});
 assert.equal(db.sql.prepare('SELECT actor_role FROM entries WHERE actor_id=? ORDER BY seq LIMIT 1').get(manager.id).actor_role,'manager');
 assert.equal(db.sql.prepare('SELECT actor_role FROM audit ORDER BY seq DESC LIMIT 1').get().actor_role,'admin');
});
const writeArchive=(path,state)=>{const bytes=Buffer.from(JSON.stringify(state));writeFileSync(path,Buffer.concat([tarHeader('cash.json',bytes.length),bytes,Buffer.alloc((512-bytes.length%512)%512+1024)]));};
await test('saved legacy count and resolution receipts remain retryable after migration and demotion',async()=>{
 const old=new LocalDB(true);const adminUser=await authorize(old,owner);const stamp=new Date().toISOString();
 const insert=old.sql.prepare('INSERT INTO entries(id,request_id,request_hash,kind,delta,expected,counted,difference,balance_after,expected_revision,reason,note,linked_id,actor_id,actor_name,actor_email,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 const receipts=[];
 for(const kind of ['count','resolution']){
  const body={kind,...(kind==='count'?{amount:'0'}:{mode:'explain'}),reason:'Legacy receipt',note:'',revision:0,requestId:crypto.randomUUID()};
  const intent={kind,amount:body.amount,reason:body.reason,note:body.note,linkedId:null,photoId:null,revision:0,subtract:false,mode:body.mode};
  const digest=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(intent)))).toString('hex'),id=crypto.randomUUID();
  insert.run(id,body.requestId,digest,kind,0,0,kind==='count'?0:null,kind==='count'?0:null,0,0,body.reason,'',null,adminUser.id,adminUser.name,adminUser.email,stamp);receipts.push({body,id});
 }
 old.sql.exec(readFileSync('drizzle/0004_many_shinko_yamashiro.sql','utf8'));old.sql.prepare("UPDATE users SET role='staff' WHERE id=?").run(adminUser.id);
 const demoted={...adminUser,role:'staff'};for(const {body,id} of receipts){assert.equal((await saveEntry(old,demoted,body)).id,id);await assert.rejects(saveEntry(old,demoted,{...body,note:'different'}),{code:'requestConflict'});}
 assert.equal(old.sql.prepare('SELECT COUNT(*) n FROM entries').get().n,2);assert.equal(old.sql.prepare('SELECT COUNT(*) n FROM count_closures').get().n,0);old.sql.close();
});
await test('old database migration preserves historical admin difference and accepts v1 backup',async()=>{
 const old=new LocalDB(true);const oldAdmin=await authorize(old,owner);const stamp=new Date().toISOString(),countId=crypto.randomUUID();
 const insert=old.sql.prepare('INSERT INTO entries(id,request_id,request_hash,kind,delta,expected,counted,difference,balance_after,expected_revision,reason,note,actor_id,actor_name,actor_email,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 insert.run(crypto.randomUUID(),crypto.randomUUID(),'legacy','opening',100000,0,null,null,100000,0,'Opening','',oldAdmin.id,oldAdmin.name,oldAdmin.email,stamp);
 insert.run(countId,crypto.randomUUID(),'legacy','count',0,100000,98000,-2000,100000,1,'Historical discrepancy','',oldAdmin.id,oldAdmin.name,oldAdmin.email,stamp);
 old.sql.exec('UPDATE cash SET balance=100000,revision=2,initialized=1');
 const tables=Object.fromEntries(['users','cash','media','entries','audit'].map(t=>[t,old.sql.prepare('SELECT * FROM '+t).all()]));
 writeArchive('.sites-runtime/test/legacy-v1.tar',{format:'labula-cash-v1',currency:'CZK',unit:'haler',tables});
 old.sql.exec(readFileSync('drizzle/0004_many_shinko_yamashiro.sql','utf8'));
 assert.equal((await state(old,oldAdmin)).unresolved[0].id,countId);assert.equal((await state(old,oldAdmin)).unresolved[0].actor_role,null);assert.equal(old.sql.prepare('SELECT balance FROM cash').get().balance,100000);
 const {restoreBackup}=await import('./restore-backup.mjs');const restored=restoreBackup('.sites-runtime/test/legacy-v1.tar',':memory:');
 assert.equal(restored.db.prepare('SELECT difference,actor_role FROM entries WHERE id=?').get(countId).difference,-2000);assert.equal(restored.db.prepare('SELECT COUNT(*) n FROM count_closures').get().n,0);assert.equal(restored.db.prepare('SELECT role FROM users').get().role,'admin');restored.db.close();old.sql.close();
});
await test('v2 backup restores shared closure links and rejects corrupted correction links',async()=>{
 const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);const bucket={async get(){return{size:8,body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};}};
 const file='.sites-runtime/test/roles-v2.tar';writeFileSync(file,new Uint8Array(await (await backup(db,bucket,u)).arrayBuffer()));
 const {restoreBackup,unpackBackup}=await import('./restore-backup.mjs');const restored=restoreBackup(file,':memory:');
 assert.equal(restored.db.prepare('SELECT COUNT(*) n FROM count_closures').get().n,db.sql.prepare('SELECT COUNT(*) n FROM count_closures').get().n);assert.equal(restored.db.prepare("SELECT COUNT(*) n FROM users WHERE role='manager'").get().n,1);restored.db.close();
 const {state:snap}=unpackBackup(file);snap.tables.count_closures[0].closed_role='staff';writeArchive('.sites-runtime/test/broken-v2.tar',snap);assert.throws(()=>restoreBackup('.sites-runtime/test/broken-v2.tar',':memory:'),/Invalid count closure/);
});
console.log(`Passed ${passed} integration checks.`);
assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM write_guards').get().n,0);
