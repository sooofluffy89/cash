'use client';
import {useState,type ButtonHTMLAttributes} from 'react';
import {LoaderCircle,Camera,Plus,Minus,ClipboardCheck,ChevronRight} from 'lucide-react';
import {countStatus} from '../lib/domain';

export function Spinner(){return <LoaderCircle size={17} className="spin" aria-hidden="true"/>;}
export function Pulse({event}:{event?:number}){return event?<span key={event} className="change-pulse" aria-hidden="true"/>:null;}

/** Both labels occupy the same grid cell, reserving the largest width before work starts. */
export function BusyButton({pending=false,pendingText,waitLabels=[],children,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{pending?:boolean;pendingText:string;waitLabels?:string[]}){
 return <button {...props} aria-busy={pending||undefined}><span className="btn-content">
  <span className="btn-rest" aria-hidden={pending} style={{visibility:pending?'hidden':undefined}}>{children}</span>
  <span className="btn-pending" aria-hidden={!pending} style={{visibility:pending?undefined:'hidden'}}><Spinner/>{pendingText}</span>
  {waitLabels.map(label=><span className="btn-size" key={label} aria-hidden="true"><span className="spinner-space"/>{label}</span>)}
 </span></button>;
}

export function PhotoPreview({src,label,empty,errorText}:{src?:string;label:string;empty:string;errorText:string}){
 const [loadedSrc,setLoadedSrc]=useState<string>(),[failedSrc,setFailedSrc]=useState<string>();
 const loaded=!!src&&loadedSrc===src,failed=!!src&&failedSrc===src;
 return <div className="photo-slot" aria-busy={!!src&&!loaded&&!failed}>
  {src&&!failed&&<img key={src} className={'photo-thumb '+(loaded?'photo-ready':'')} src={src} alt={label} onLoad={()=>setLoadedSrc(src)} onError={()=>setFailedSrc(src)}/>}
  <div className={'photo-placeholder '+(loaded&&!failed?'photo-placeholder-hidden':'')} aria-hidden={loaded&&!failed}>{src&&!loaded&&!failed?<Spinner/>:<Camera size={22} aria-hidden="true"/>}<span role={failed?'alert':undefined}>{failed?errorText:empty}</span></div>
 </div>;
}

export function EntryRows({items,label,money,time,t,onDetail,pendingId,highlight,batch}:{items:any[];label:(entry:any)=>string;money:(n:number)=>string;time:(s:string)=>string;t:(key:string)=>string;onDetail:(id:string)=>void;pendingId:string|null;highlight?:{id:string;event:number};batch?:{event:number;ids:string[]}}){
 const batches=batch?.ids.length?new Set(batch.ids):null;
 return <div className="panel">{items.length?items.map(e=><button className={'entry '+(batches?.has(e.id)?'rows-arrive':'')} data-entry-id={e.id} key={e.id} onClick={()=>onDetail(e.id)} aria-busy={pendingId===e.id||undefined}>
  <Pulse event={highlight?.id===e.id?highlight?.event:undefined}/>
  <span className={'entry-icon '+(e.delta>0?'in':e.delta<0?'out':'')} aria-hidden="true">{e.kind==='count'?<ClipboardCheck/>:e.delta<0?<Minus/>:<Plus/>}</span>
  <span className="entry-body"><strong>{e.reason||label(e)}</strong><small>{label(e)} · {e.actor_name}{e.actor_role?' · '+t(e.actor_role):''} · {time(e.created_at)}{e.photo_id?' · '+t('photo'):''}{e.reversed?' · '+t('reversed'):''}</small>{e.kind==='count'&&<small className={e.difference&&!e.resolved?'count-pending':'count-status'}>{t(countStatus(e))}{e.resolved&&e.closing_count_id===e.id&&e.closure_delta?' · '+(e.closure_delta>0?'+':'')+money(e.closure_delta):''}</small>}</span>
  <span className="entry-value">{e.kind==='count'?money(e.counted):(e.delta>0?'+':'')+money(e.delta)}{e.kind==='count'&&e.difference!==0&&<small>{t('difference')} {money(e.difference)}</small>}</span>
  <span className="entry-progress">{pendingId===e.id?<Spinner/>:<ChevronRight className="chevron"/>}</span>
 </button>):<p className="empty">{t('empty')}</p>}</div>;
}
