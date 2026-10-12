export const MAX_MONEY = 9_999_999_999;
export class CashError extends Error {
  constructor(public code: string, public status=400) { super(code); }
}
export function moneyInput(value: unknown, zero=false): number {
  if (typeof value !== 'string' || !/^\d{1,8}([.,]\d{1,2})?$/.test(value.trim())) throw new CashError('amount');
  const [whole, fraction=''] = value.trim().replace(',','.').split('.');
  const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if (!Number.isSafeInteger(n) || n>MAX_MONEY || n < (zero?0:1)) throw new CashError('amount');
  return n;
}
export function textInput(value: unknown, max: number, required=false): string {
  if (typeof value !== 'string') { if(required) throw new CashError('reason'); return ''; }
  const s=value.trim();
  if(s.length>max || (required&&!s)) throw new CashError(required?'reason':'text');
  return s;
}
export function requestId(value: unknown): string {
  if(typeof value!=='string'||! /^[a-zA-Z0-9_-]{20,80}$/.test(value)) throw new CashError('request');
  return value;
}
export function emailInput(value: unknown): string {
  const email=textInput(value,254,true).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CashError('email');
  return email;
}
export function imageType(b: Uint8Array): string | null {
  if(b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
  if([137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x))return 'image/png';
  if(String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP')return 'image/webp';
  return null;
}
export function weekInfo(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const today=`${p.year}-${p.month}-${p.day}`;
  const d=new Date(today+'T12:00:00Z'); const wd=(d.getUTCDay()+6)%7;
  d.setUTCDate(d.getUTCDate()-wd);
  return {today,start:d.toISOString().slice(0,10)};
}
export function countStatus(entry:{kind:string;difference?:number;resolved?:number;closure_delta?:number}){
 if(entry.kind!=='count')return '';
 if(entry.resolved&&entry.difference!==0)return entry.closure_delta?'closedCorrection':'closedNoChange';
 return entry.difference===0?'matches':'pendingCount';
}
