import React, { useState, useEffect } from 'react';
import { SERVER_URL } from '../utils/socket';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Star, Trash2, Calendar, Clock, Phone, Video, Hash } from 'lucide-react';
import { format } from 'date-fns';
import useStore from '../store';

export default function FriendProfileScreen(){
  const {state}=useLocation(); const navigate=useNavigate(); const user=useStore(s=>s.user);
  const [friend,setFriend]=useState(state?.friend||null);
  const [editAlias,setEditAlias]=useState(state?.friend?.alias||'');
  const [saving,setSaving]=useState(false);
  useEffect(()=>{ if(!friend||!user) navigate('/dashboard'); },[friend,user]);
  if(!friend) return null;
  const startCall=(type)=>{ const t=Date.now(); try{sessionStorage.removeItem(`call_ended_${friend.id}`); sessionStorage.removeItem(`call_done_${friend.id}`);}catch{} navigate(`/call/${friend.id}?type=${type}&t=${t}`); };
  const talk=()=>{const s=friend.lifetime_talk_seconds||0; const h=Math.floor(s/3600), m=Math.floor((s%3600)/60); return `${h}h ${m}m`;};
  const updateAlias=async()=>{ if(!editAlias.trim()) return; setSaving(true); try{await fetch(`${SERVER_URL}/api/friends/alias`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:user.id,friendId:friend.id,alias:editAlias})}); setFriend(p=>({...p,alias:editAlias}));}catch{} finally{setSaving(false);}};
  const toggleBuddy=async()=>{const nb=!friend.is_buddy; try{await fetch(`${SERVER_URL}/api/friends/buddy`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:user.id,friendId:friend.id,isBuddy:nb})}); setFriend(p=>({...p,is_buddy:nb}));}catch{}};
  const removeFriend=async()=>{ if(!window.confirm(`Remove ${friend.alias||friend.username}?`)) return; try{await fetch(`${SERVER_URL}/api/friends/remove`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:user.id,friendId:friend.id})}); navigate('/dashboard');}catch{}};

  return (
    <div style={{minHeight:'100vh', background:'var(--ink)', display:'grid', placeItems:'center', padding:'28px 16px'}} onClick={()=>navigate('/dashboard')}>
      <div className="panel" style={{width:'100%', maxWidth:520, overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'18px 18px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--line)'}}>
          <button onClick={()=>navigate('/dashboard')} className="iconBtn" aria-label="Back"><ChevronLeft size={16}/></button>
          <span className="label">Friend</span>
          <span className="mono" style={{marginLeft:'auto', fontSize:11, color:'var(--text-3)'}} onClick={()=>navigator.clipboard?.writeText(friend.username)}>@{friend.username}</span>
        </div>
        <div style={{padding:22, textAlign:'center'}}>
          <div style={{width:72, height:72, borderRadius:16, display:'grid', placeItems:'center', margin:'0 auto 12px', background:'var(--ink)', border:'1px solid var(--line)', fontSize:24, fontWeight:700}}>{(friend.alias||friend.username).charAt(0).toUpperCase()}</div>
          <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:8}}><h2 className="display" style={{fontSize:22}}>{friend.alias||friend.username}</h2>{friend.is_buddy && <Star size={14} fill="#FFB224" color="#FFB224"/>}<span className={`mono`} style={{fontSize:10, padding:'3px 8px', borderRadius:999, border:'1px solid var(--line)', color: friend.isOnline?'var(--success)':'var(--text-3)'}}>{friend.isOnline?'online':'offline'}</span></div>
          {friend.alias && <div className="mono" style={{fontSize:12, color:'var(--text-3)', marginTop:4}}>@{friend.username}</div>}
          <div style={{display:'flex', justifyContent:'center', gap:10, marginTop:16}}>
            <button className="btn btn--primary" onClick={()=>startCall('voice')}><Phone size={14}/> Voice</button>
            <button className="btn btn--secondary" onClick={()=>startCall('video')}><Video size={14}/> Video</button>
          </div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, padding:'0 18px 18px'}}>
          <div style={{padding:14, borderRadius:12, background:'var(--surface-raised)', border:'1px solid var(--line)', textAlign:'center'}}><Calendar size={14} style={{margin:'0 auto 6px', display:'block', color:'var(--text-3)'}}/><div className="mono" style={{fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.08em'}}>Connected</div><div style={{fontWeight:600, fontSize:13, marginTop:4}}>{friend.created_at? format(new Date(friend.created_at*1000),'MMM yyyy'): 'Recently'}</div></div>
          <div style={{padding:14, borderRadius:12, background:'var(--surface-raised)', border:'1px solid var(--line)', textAlign:'center'}}><Clock size={14} style={{margin:'0 auto 6px', display:'block', color:'var(--text-3)'}}/><div className="mono" style={{fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.08em'}}>Talk time</div><div style={{fontWeight:600, fontSize:13, marginTop:4}}>{talk()}</div></div>
        </div>
        <div style={{padding:'0 18px 18px', display:'flex', flexDirection:'column', gap:10}}>
          <label className="label">Alias</label>
          <div className="field__wrap"><Hash size={12}/><input value={editAlias} onChange={e=>setEditAlias(e.target.value)} placeholder="Custom name" /><button onClick={updateAlias} disabled={saving||!editAlias.trim()} className="btn btn--secondary" style={{padding:'7px 12px', fontSize:12, whiteSpace:'nowrap'}}>{saving?'Saving…':'Save'}</button></div>
          <div style={{display:'flex', gap:10}}>
            <button onClick={toggleBuddy} className="btn btn--secondary" style={{flex:1}}><Star size={14} fill={friend.is_buddy?'#FFB224':'none'}/>{friend.is_buddy?'Remove buddy':'Make buddy'}</button>
            <button onClick={removeFriend} className="btn btn--ghost" style={{flex:1, color:'var(--danger)'}}><Trash2 size={14}/> Remove</button>
          </div>
        </div>
      </div>
    </div>
  );
}
