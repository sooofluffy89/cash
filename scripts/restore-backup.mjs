// Offline operator tool. Never imported into or executed by the hosted application.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
export function unpackBackup(path){
 const bytes=readFileSync(path);let pos=0;const files=new Map();
 while(pos+512<=bytes.length){const header=bytes.subarray(pos,pos+512);if(header.every(x=>x===0))break;const name=header.subarray(0,100).toString('utf8').split('\0')[0];const size=parseInt(header.subarray(124,136).toString('ascii').replace(/\0.*$/,''),8);if(!Number.isSafeInteger(size)||size<0||pos+512+size>bytes.length||!(/^(cash\.json|photos\/[a-zA-Z0-9_-]+)$/.test(name)))throw new Error('Invalid backup archive');let checksum=0;for(let i=0;i<512;i++)checksum+=i>=148&&i<156?32:header[i];if(parseInt(header.subarray(148,154).toString('ascii').trim(),8)!==checksum)throw new Error('Invalid TAR checksum');if(files.has(name))throw new Error('Duplicate backup file');files.set(name,bytes.subarray(pos+512,pos+512+size));pos+=512+Math.ceil(size/512)*512;}
 const state=JSON.parse(files.get('cash.json')?.toString('utf8')||'null');if(!['labula-cash-v1','labula-cash-v2'].includes(state?.format))throw new Error('Unsupported backup format');return{state,files};
}
export function restoreBackup(input,output){
 const {state,files}=unpackBackup(input);const db=new DatabaseSync(output);try{
  const tables=['users','cash','media','entries','audit','count_closures'];
  if(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n)throw new Error('Recovery target must be a new empty database');
  db.exec('PRAGMA foreign_keys=ON');
  for(const name of ['0000_flippant_black_tarantula','0001_cash_guards','0002_resolution_review','0003_clever_terror','0004_many_shinko_yamashiro'])db.exec(readFileSync(new URL('../drizzle/'+name+'.sql',import.meta.url),'utf8'));
  db.exec('BEGIN');
  for(const table of tables){
   const rows=state.format==='labula-cash-v1'&&table==='count_closures'?[]:state.tables[table];if(!Array.isArray(rows))throw new Error('Backup table missing: '+table);
   const columns=db.prepare('PRAGMA table_info('+table+')').all().map(r=>r.name);
   for(const original of rows){const row={...original};if(state.format==='labula-cash-v1'&&['entries','audit'].includes(table))row.actor_role=null;
    if(Object.keys(row).some(k=>!columns.includes(k))||columns.some(k=>!(k in row)))throw new Error('Schema mismatch: '+table);
    db.prepare('INSERT INTO '+table+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...columns.map(k=>row[k]));
   }
  }
  const totals=db.prepare('SELECT COALESCE(SUM(delta),0) balance,COUNT(*) revision FROM entries').get();const cash=db.prepare('SELECT * FROM cash WHERE id=1').get();if(cash&&(cash.balance!==totals.balance||cash.revision!==totals.revision))throw new Error('Cash balance does not match ledger');
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Broken backup reference');
  if(db.prepare("SELECT id FROM users WHERE role NOT IN ('staff','manager','admin')").all().length)throw new Error('Invalid backup role');
  const closures=db.prepare('SELECT * FROM count_closures').all();
  for(const link of closures){
   const original=db.prepare('SELECT * FROM entries WHERE id=?').get(link.count_id),final=db.prepare('SELECT * FROM entries WHERE id=?').get(link.closing_count_id);
   const root=db.prepare('SELECT * FROM count_closures WHERE count_id=?').get(link.closing_count_id);
   const correction=link.resolution_id?db.prepare('SELECT * FROM entries WHERE id=?').get(link.resolution_id):null;
   if(original?.kind!=='count'||final?.kind!=='count'||original.seq>final.seq||!root||root.closing_count_id!==final.id||root.resolution_id!==link.resolution_id||!['admin','manager'].includes(link.closed_role)||link.closed_role!==final.actor_role||link.closed_by!==final.actor_id||link.closed_name!==final.actor_name||link.reason!==final.reason||link.created_at!==final.created_at)throw new Error('Invalid count closure');
   if(final.difference!==final.counted-final.expected||final.delta!==0||final.balance_after!==final.expected)throw new Error('Invalid final count');
   if(final.difference!==0&&(!correction||correction.kind!=='resolution'||correction.linked_id!==final.id||correction.delta!==final.difference||correction.balance_after!==final.counted||correction.expected!==final.expected||correction.seq!==final.seq+1)||final.difference===0&&correction)throw new Error('Invalid closure correction');
  }
  for(const photo of state.tables.media){const bytes=files.get('photos/'+photo.id);if(!bytes||bytes.length!==photo.size)throw new Error('Backup photo missing: '+photo.id);}
  db.exec('COMMIT');
  return {db,photos:state.tables.media.map(p=>({key:p.key,contentType:p.content_type,bytes:files.get('photos/'+p.id)}))};
 }catch(e){try{db.exec('ROLLBACK');}catch{}db.close();throw e;}
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 const [, ,input,output]=process.argv;if(!input||!output)throw new Error('Usage: node scripts/restore-backup.mjs backup.tar NEW-empty-recovery.sqlite');
 const result=restoreBackup(resolve(input),resolve(output));const dir=resolve(output)+'.photos';mkdirSync(dir,{recursive:true});
 for(const p of result.photos){const id=p.key.split('/').at(-1);if(!/^[a-zA-Z0-9_-]+$/.test(id))throw new Error('Unsafe object key');writeFileSync(resolve(dir,id),p.bytes);}
 result.db.close();console.log('Restored offline snapshot and '+result.photos.length+' photos. Verify in isolation before a hosting administrator restores production.');
}
