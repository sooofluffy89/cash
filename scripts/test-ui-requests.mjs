import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import ts from 'typescript';
mkdirSync('.sites-runtime/test',{recursive:true});
writeFileSync('.sites-runtime/test/ui-requests.mjs',ts.transpileModule(readFileSync('lib/ui-requests.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
const {LatestRead}=await import('../.sites-runtime/test/ui-requests.mjs');
let passed=0;
async function test(name,fn){await fn();console.log('✓ '+name);passed++;}
await test('late detail response cannot replace the more recent selected entry',async()=>{
 const gate=new LatestRead();let shown;
 const first=gate.begin(),second=gate.begin();
 if(gate.current(second))shown='second';if(gate.current(first))shown='first';
 assert.equal(shown,'second');
});
await test('newer filter result is preserved when earlier requests finish later',async()=>{
 const gate=new LatestRead();const earlier=gate.begin(),later=gate.begin();let rows=[];
 if(gate.current(later))rows=['latest-filter'];if(gate.current(earlier))rows=['old-filter'];
 assert.deepEqual(rows,['latest-filter']);
});
await test('navigation/close invalidates a pending read even when no replacement request starts',async()=>{
 const gate=new LatestRead(),ticket=gate.begin();gate.invalidate();assert.equal(gate.current(ticket),false);
});
await test('revoked access invalidates all reads, including delayed state and history',async()=>{
 const gates=[new LatestRead(),new LatestRead(),new LatestRead()],tickets=gates.map(g=>g.begin());
 gates.forEach(g=>g.invalidate());assert.ok(gates.every((g,i)=>!g.current(tickets[i])));
});
await test('an old finally block cannot clear a newer request loading state',async()=>{
 const gate=new LatestRead(),old=gate.begin();const latest=gate.begin();let loading=true;
 if(gate.current(old))loading=false;assert.equal(loading,true);
 if(gate.current(latest))loading=false;assert.equal(loading,false);
});
console.log(`Passed ${passed} UI request checks.`);
