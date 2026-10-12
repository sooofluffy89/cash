// Actual loopback D1/API verification. Never run this against production.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const origin=process.argv[2]||'http://127.0.0.1:5179';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw new Error('Synthetic writes are restricted to loopback previews.');
mkdirSync('.sites-runtime/test',{recursive:true});
const config='.sites-runtime/test/wrangler-roles.json';
writeFileSync(config,JSON.stringify({name:'cash-local-roles-qa',main:resolve('build/sites-worker.ts'),compatibility_date:'2026-05-15',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000'}]}));
export function setLocalRole(role){
 if(!['admin','manager','staff'].includes(role))throw new Error('Unknown role');
 const sql=`INSERT OR IGNORE INTO users(id,email,name,role,active,created_at,updated_at) VALUES('local-qa-backup-admin','qa-admin@example.test','Local QA Admin','admin',1,datetime('now'),datetime('now')); UPDATE users SET role='${role}',name='Lokální test ${role}',active=1 WHERE email='seedy@sites.test';`;
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--persist-to','.wrangler/state','--config',config,'--command',sql],{encoding:'utf8',env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'}});
 if(result.status!==0)throw new Error('Local-only fixture change failed: '+result.stderr);
}
const login=await fetch(origin+'/signin-with-chatgpt?return_to=%2F',{redirect:'manual'});
const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
if(!cookie)throw new Error('Legitimate local starter sign-in cookie unavailable.');
const get=path=>fetch(origin+'/api/'+path,{headers:{Cookie:cookie}});
const post=(path,body)=>fetch(origin+'/api/'+path,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const snapshot=async()=>{const r=await get('state');assert.equal(r.status,200);return r.json();};
const input=(s,extra={})=>({kind:'in',amount:'0.01',reason:'Local roles HTTP QA',note:'',revision:s.cash.revision,actorRole:s.user.role,requestId:crypto.randomUUID(),...extra});
const count=(s,amount,extra={})=>input(s,{kind:'count',amount,closingIds:s.user.role==='staff'?[]:s.unresolved.map(e=>e.id),...extra});
let passed=0;const ok=text=>{passed++;console.log('✓ '+text);};
try{
 for(const role of ['staff','manager','admin']){
  setLocalRole(role);let s=await snapshot();assert.equal(s.user.role,role);
  assert.equal((await get('history')).status,200);assert.equal((await get('export')).status,role==='staff'?403:200);
  const b=await get('backup');assert.equal(b.status,role==='admin'?200:403);if(b.status===200)await b.arrayBuffer();
  const manage=await post('manage',{action:'weekday',weekday:s.cash.weekday,requestId:crypto.randomUUID()});assert.equal(manage.status,role==='admin'?200:403);
  assert.equal((await post('entries',input(s,{kind:'adjustment'}))).status,role==='admin'?200:403);s=await snapshot();
  assert.equal((await post('entries',input(s,{kind:'opening'}))).status,role==='admin'?409:403);
  const movement=await (await post('entries',input(s))).json();assert.ok(movement.entry);s=await snapshot();
  const reversed=await post('entries',input(s,{kind:'reversal',amount:undefined,linkedId:movement.entry.id}));assert.equal(reversed.status,role==='staff'?403:200);
  ok(role+' permissions enforced by actual API for ledger, management, CSV and backup');
  s=await snapshot();const before=s.cash.balance;const target=before-100;assert.ok(target>=0);
  const body=count(s,(target/100).toFixed(2));const saved=await post('entries',body);assert.equal(saved.status,200);const root=(await saved.json()).entry;
  s=await snapshot();assert.equal(s.cash.balance,role==='staff'?before:target);
  assert.equal(root.actor_role,role);assert.equal(!!root.resolved,role!=='staff');
  if(role==='staff'){assert.ok(s.unresolved.some(e=>e.id===root.id));assert.equal((await post('entries',count(s,(before/100).toFixed(2),{closingIds:s.unresolved.map(e=>e.id)}))).status,403);}
  else{assert.equal(s.unresolved.length,0);assert.equal((await (await get('entries/'+root.id)).json()).links.filter(e=>e.kind==='resolution').length,1);}
  const again=await (await post('entries',body)).json();assert.equal(again.entry.id,root.id);assert.equal((await snapshot()).cash.balance,s.cash.balance);
  ok(role+' count workflow and retry keep the ledger correct');
 }
 setLocalRole('manager');let s=await snapshot();const target=((s.cash.balance-100)/100).toFixed(2),a=count(s,target),b=count(s,target);
 const results=await Promise.all([post('entries',a),post('entries',b)]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===409).length,1);
 ok('actual D1 serializes two simultaneous final counts into one correction');
 s=await snapshot();const old=count(s,(s.cash.balance/100).toFixed(2));setLocalRole('staff');assert.equal((await post('entries',old)).status,409);
 ok('role change rejects the previous privileged confirmation');
 s=await snapshot();const first=(await (await post('entries',count(s,((s.cash.balance-100)/100).toFixed(2)))).json()).entry;s=await snapshot();
 const second=(await (await post('entries',count(s,((s.cash.balance-100)/100).toFixed(2)))).json()).entry;
 setLocalRole('manager');s=await snapshot();const before=s.cash.balance;const root=(await (await post('entries',count(s,((before-100)/100).toFixed(2)))).json()).entry;
 s=await snapshot();assert.equal(s.cash.balance,before-100);assert.equal(s.unresolved.length,0);
 for(const id of [first.id,second.id]){const detail=await (await get('entries/'+id)).json();assert.equal(detail.entry.closing_count_id,root.id);assert.equal(detail.entry.difference,-100);}
 ok('actual D1 closes two repeated shortages with one shared correction');
 const photo=readFileSync('.sites-runtime/test/qa-photo.png'),fd=new FormData(),uploadId=crypto.randomUUID();fd.set('uploadId',uploadId);fd.set('photo',new File([photo],'local-qa.png',{type:'image/png'}));
 const uploaded=await fetch(origin+'/api/photos',{method:'POST',headers:{Cookie:cookie,Origin:origin},body:fd});assert.equal(uploaded.status,200);
 s=await snapshot();const withPhoto=(await (await post('entries',count(s,(s.cash.balance/100).toFixed(2),{reason:'Local role photo test',photoId:uploadId}))).json()).entry;assert.equal(withPhoto.photo_id,uploadId);
 assert.equal((await get('photos/'+uploadId)).status,200);assert.equal((await fetch(origin+'/api/photos/'+uploadId)).status,401);
 ok('new final count retains its protected photo attachment');
 console.log(`Passed ${passed} local role HTTP checks.`);
}finally{setLocalRole('admin');}
