import React, { useState, useEffect, useRef } from 'react';
import { SERVER_URL } from '../utils/socket';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Clock, Users, Phone, Check, X, Copy, Sparkles, Settings, Video, Star, Calendar, RotateCw, Sun, Moon, Palette, AlertCircle, CheckCircle2, Search, LogOut, Hash, ArrowUpRight } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import useStore from '../store';
import socket from '../utils/socket';
import { auth, signOut } from '../firebase';
import { ringtoneSynth } from '../utils/ringtone';
import { Capacitor, registerPlugin } from '@capacitor/core';
import './DashboardScreen.css';

const Ringtone = registerPlugin('Ringtone');

export default function DashboardScreen({ initialTab='friends' }){
  const user=useStore(s=>s.user);
  const logout=useStore(s=>s.logout);
  const navigate=useNavigate();
  const ringTimeout=useStore(s=>s.ringTimeout);
  const setRingTimeout=useStore(s=>s.setRingTimeout);
  const ringtoneEnabled=useStore(s=>s.ringtoneEnabled);
  const setRingtoneEnabled=useStore(s=>s.setRingtoneEnabled);
  const theme=useStore(s=>s.theme);
  const selectedRingtone=useStore(s=>s.selectedRingtone);
  const setSelectedRingtone=useStore(s=>s.setSelectedRingtone);
  const ringtoneVolume=useStore(s=>s.ringtoneVolume);
  const [isPreviewPlaying,setIsPreviewPlaying]=useState(false);
  const [activeTab,setActiveTab]=useState(initialTab);
  const mainRef=useRef(null);
  const contentRef=useRef(null);
  const [pullDistance,setPullDistance]=useState(0);
  const [isRefreshing,setIsRefreshing]=useState(false);
  const [isPulling,setIsPulling]=useState(false);
  const touchY=useRef(0); const touchX=useRef(0); const canPull=useRef(false);
  useEffect(()=>setActiveTab(initialTab),[initialTab]);
  const safeParse=(k,f)=>{try{const v=localStorage.getItem(k); return v?JSON.parse(v):f;}catch{return f}};
  const [friends,setFriends]=useState(()=>safeParse('cache_friends',[]));
  const [requests,setRequests]=useState(()=>safeParse('cache_requests',[]));
  const [history,setHistory]=useState(()=>safeParse('cache_history',[]));
  const [toastMsg,setToastMsg]=useState(''); const showToast=m=>{setToastMsg(m); setTimeout(()=>setToastMsg(''),2800);};
  const [historyFilter,setHistoryFilter]=useState('all');
  const [addInput,setAddInput]=useState('');
  const [searchQuery,setSearchQuery]=useState('');
  const [copied,setCopied]=useState(false);
  const [showWelcomePopup,setShowWelcomePopup]=useState(false);
  const [welcomeToast,setWelcomeToast]=useState('');
  const [showProfileModal,setShowProfileModal]=useState(false);
  const [profileStats,setProfileStats]=useState(null);
  const [isProfileLoading,setIsProfileLoading]=useState(false);
  const [profileError,setProfileError]=useState('');
  const [newUsername,setNewUsername]=useState('');
  const [isUpdatingUsername,setIsUpdatingUsername]=useState(false);
  const [usernameError,setUsernameError]=useState('');
  const [usernameSuccess,setUsernameSuccess]=useState('');

  const fetchFriends=async()=>{try{const r=await fetch(`${SERVER_URL}/api/friends/${user.id}`); const d=await r.json(); setFriends(d.friends||[]); setRequests(d.requests||[]); localStorage.setItem('cache_friends',JSON.stringify(d.friends||[])); localStorage.setItem('cache_requests',JSON.stringify(d.requests||[]));}catch{}};
  const fetchHistory=async()=>{try{const r=await fetch(`${SERVER_URL}/api/history/${user.id}`); const d=await r.json(); setHistory(d||[]); localStorage.setItem('cache_history',JSON.stringify(d||[]));}catch{}};

  const sortedFriends=React.useMemo(()=>[...friends].sort((a,b)=>{
    if(a.is_buddy&&!b.is_buddy) return -1; if(!a.is_buddy&&b.is_buddy) return 1;
    if(a.isOnline===b.isOnline) return (a.alias||a.username).localeCompare(b.alias||b.username);
    return a.isOnline?-1:1;
  }).filter(f=>{if(!searchQuery) return true; const s=searchQuery.toLowerCase(); return (f.alias?.toLowerCase().includes(s)|| f.username.toLowerCase().includes(s));}),[friends,searchQuery]);

  const filteredHistory=React.useMemo(()=>history.filter(c=>{
    const t=(c.type||'').toLowerCase().trim(); const s=(c.status||'').toLowerCase().trim(); const f=(historyFilter||'').toLowerCase().trim();
    if(f==='all') return true; if(f==='missed') return t==='incoming' && s!=='completed'; if(f==='incoming') return t==='incoming'&&s==='completed'; if(f==='outgoing') return t==='outgoing'&&s==='completed'; return false;
  }),[history,historyFilter]);

  useEffect(()=>{
    if(!user){navigate('/'); return;}
    const wt=localStorage.getItem('welcome_type');
    if(wt==='popup') setShowWelcomePopup(true); else if(wt==='toast'){setWelcomeToast(`Welcome back, ${user.username}`); setTimeout(()=>setWelcomeToast(''),3600);}
    localStorage.removeItem('welcome_type');
    socket._callverseUserId=user.id;
    fetchFriends(); fetchHistory();
    socket.on('friend-request',fetchFriends); socket.on('friends-updated',fetchFriends); socket.on('user-status-changed',fetchFriends);
    return()=>{socket.off('friend-request');socket.off('friends-updated');socket.off('user-status-changed'); ringtoneSynth.stop();};
  },[user]);

  const handleAddFriend=async(e)=>{e.preventDefault(); if(!addInput.trim()) return; try{const r=await fetch(`${SERVER_URL}/api/friends/request`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:user.id,target:addInput})}); const d=await r.json(); if(d.error) showToast(d.error); else{showToast('Request sent'); setAddInput(''); fetchFriends();}}catch{showToast('Failed to send');}};
  const handleAccept=async(id)=>{try{await fetch(`${SERVER_URL}/api/friends/accept`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:user.id,friendId:id})}); showToast('Friend added'); fetchFriends();}catch{showToast('Failed');}};
  const handleDecline=async(id)=>{try{await fetch(`${SERVER_URL}/api/friends/decline`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:user.id,friendId:id})}); showToast('Declined'); fetchFriends();}catch{setRequests(p=>p.filter(r=>r.id!==id)); showToast('Declined');}};
  const startCall=(id,type)=>{const t=Date.now(); try{sessionStorage.removeItem(`call_ended_${id}`);sessionStorage.removeItem(`call_done_${id}`);}catch{} navigate(`/call/${id}?type=${type}&t=${t}`);};
  const copyInvite=async()=>{const c=user?.invite_code||''; try{if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(c); else{const el=document.createElement('textarea'); el.value=c; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove();} setCopied(true); showToast('Code copied'); setTimeout(()=>setCopied(false),1800);}catch{showToast('Copy failed');}};
  const handleSignOut=async()=>{try{await signOut(auth); logout(); navigate('/');}catch{}};
  const togglePreview=t=>{if(isPreviewPlaying){ringtoneSynth.stop(); setIsPreviewPlaying(false);} else{ringtoneSynth.play(t,ringtoneVolume); setIsPreviewPlaying(true);}};
  const formatJoined=ca=>{if(!ca) return 'Recently'; try{let d; const n=Number(ca); if(!isNaN(n)){d=n<1e11? new Date(n*1000):new Date(n);} else d=new Date(ca); if(isNaN(d.getTime())) return 'Recently'; return `Joined ${format(d,'MMMM yyyy')}`;}catch{return 'Recently';}};
  const formatTalk=s=>{s=Math.max(0,Math.floor(Number(s)||0)); if(s<60) return `${s}s`; const h=Math.floor(s/3600), m=Math.floor((s%3600)/60); if(h) return `${h}h ${m}m`; const sec=s%60; return sec?`${m}m ${sec}s`:`${m}m`;};
  const fetchProfile=async()=>{if(!user?.id) return; setIsProfileLoading(true); setProfileError(''); try{const r=await fetch(`${SERVER_URL}/api/user/profile/${user.id}`); const d=await r.json(); if(!r.ok||d.error) setProfileError(d.error||'Failed'); else setProfileStats(d);}catch{setProfileError('Network error');} finally{setIsProfileLoading(false);}};
  const openProfile=()=>{setShowProfileModal(true); fetchProfile();};
  const handleUpdateUsername=async(e)=>{
    e.preventDefault(); const f=newUsername.trim().toLowerCase(); const rx=/^[a-z0-9_.]{3,30}$/;
    if(!f) return setUsernameError('Please enter a username'); if(!rx.test(f)) return setUsernameError('3-30 chars: a-z, 0-9, ., _'); if(f===user?.username) return setUsernameError('Same as current');
    setIsUpdatingUsername(true); setUsernameError(''); setUsernameSuccess('');
    try{const r=await fetch(`${SERVER_URL}/api/user/update-username`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:user.id,newUsername:f})}); const d=await r.json(); if(!r.ok||d.error) setUsernameError(d.error||'Failed'); else{const u={...user,username:d.username}; useStore.getState().setUser(u); localStorage.setItem('callverse_user',JSON.stringify(u)); setUsernameSuccess(`Updated to @${d.username}`); setNewUsername(''); if(showProfileModal) fetchProfile();}}catch{setUsernameError('Network error');} finally{setIsUpdatingUsername(false);}
  };
  const onTouchStart=e=>{if(isRefreshing) return; const st=(mainRef.current?.scrollTop||0)+(contentRef.current?.scrollTop||0); if(st<=0){canPull.current=true; touchY.current=e.touches[0].clientY; touchX.current=e.touches[0].clientX; } else canPull.current=false;};
  const onTouchMove=e=>{if(!canPull.current||isRefreshing) return; const dy=e.touches[0].clientY-touchY.current; const dx=e.touches[0].clientX-touchX.current; if(Math.abs(dx)>Math.abs(dy)) return; const st=(mainRef.current?.scrollTop||0)+(contentRef.current?.scrollTop||0); if(st<=0&&dy>0){setPullDistance(Math.min(dy*0.42,78)); setIsPulling(true);} else if(pullDistance>0){setPullDistance(0); setIsPulling(false);}};
  const onTouchEnd=async()=>{if(!canPull.current||isRefreshing) return; canPull.current=false; setIsPulling(false); if(pullDistance>=58){setIsRefreshing(true); setPullDistance(52); if(navigator.vibrate) try{navigator.vibrate(12);}catch{} try{await Promise.all([fetchFriends(),fetchHistory()]);}finally{setTimeout(()=>{setIsRefreshing(false); setPullDistance(0);},320);}} else setPullDistance(0);};

  const navItems=[
    {id:'friends',label:'Friends',icon:Users, count:requests.length},
    {id:'add-friend',label:'Add',icon:UserPlus},
    {id:'history',label:'History',icon:Clock},
    {id:'settings',label:'Settings',icon:Settings},
  ];

  return (
    <div className="dash">
      {welcomeToast && <div className="dash__toast"><span className="dash__toastDot" />{welcomeToast}</div>}
      {toastMsg && <div className="dash__toast"><CheckCircle2 size={14}/>{toastMsg}</div>}
      {showWelcomePopup && (
        <div className="dash__overlay" onClick={()=>setShowWelcomePopup(false)}>
          <div className="dash__sheet" onClick={e=>e.stopPropagation()}>
            <div className="dash__sheetIcon"><Sparkles size={18}/></div>
            <h2 className="display" style={{fontSize:26, marginBottom:8}}>Welcome to CallVerse</h2>
            <p style={{color:'var(--text-2)', fontSize:13, lineHeight:1.6}}>Invite code lives for 24 hours. Add friends, wait for online dot, call. That’s it.</p>
            <div className="dash__steps">
              <div className="dash__step"><span>01</span><p>Copy your invite code and share it.</p></div>
              <div className="dash__step"><span>02</span><p>Accept requests — buddies rise to top.</p></div>
              <div className="dash__step"><span>03</span><p>Tap voice or video when dot is green.</p></div>
            </div>
            <button className="btn btn--primary" style={{width:'100%'}} onClick={()=>setShowWelcomePopup(false)}>Enter</button>
          </div>
        </div>
      )}
      {showProfileModal && (
        <div className="dash__overlay" onClick={()=>setShowProfileModal(false)}>
          <div className="dash__sheet" onClick={e=>e.stopPropagation()} style={{maxWidth:460}}>
            <button className="dash__close" onClick={()=>setShowProfileModal(false)}><X size={14}/></button>
            {isProfileLoading ? <div style={{padding:40, textAlign:'center', color:'var(--text-2)'}}><RotateCw size={20} className="spin" style={{margin:'0 auto 10px', display:'block'}}/>Loading…</div>
            : profileError ? <div style={{padding:24, textAlign:'center'}}><AlertCircle size={20} style={{margin:'0 auto 8px', display:'block'}}/><p style={{fontSize:13, color:'var(--text-2)'}}>{profileError}</p><button className="btn btn--secondary" style={{marginTop:12}} onClick={fetchProfile}>Retry</button></div>
            : <>
              <div style={{textAlign:'center', marginBottom:18}}>
                <div className="dash__avatarLg">{(profileStats?.username||user?.username||'U').charAt(0).toUpperCase()}</div>
                <div style={{fontWeight:700, fontSize:16}}>@{profileStats?.username||user?.username}</div>
                <div className="mono" style={{fontSize:11, color:'var(--text-3)', marginTop:4}}>{formatJoined(profileStats?.created_at||user?.created_at)}</div>
              </div>
              <div className="dash__stats3">
                <div><span className="mono labelSm">Friends</span><b>{profileStats?.friends_count ?? friends.length}</b></div>
                <div><span className="mono labelSm">Talk time</span><b>{formatTalk(profileStats?.total_talk_time||0)}</b></div>
                <div><span className="mono labelSm">Calls</span><b>{profileStats?.total_calls??0}</b></div>
              </div>
              <div style={{marginTop:16, border:'1px solid var(--line)', borderRadius:12, padding:14}}>
                <div className="label" style={{marginBottom:10}}>Most talked with</div>
                {profileStats?.top_friends?.length ? profileStats.top_friends.map((f,i)=>(
                  <div key={f.id||i} className="dash__topRow"><span className="mono" style={{fontSize:11, color:'var(--text-3)'}}>0{i+1}</span><div className="dash__avatarSm">{(f.alias||f.username||'?').charAt(0).toUpperCase()}</div><div style={{flex:1, minWidth:0}}><div style={{fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{f.alias||f.username}</div>{f.alias && <div className="mono" style={{fontSize:11, color:'var(--text-3)'}}>@{f.username}</div>}</div><span className="mono" style={{fontSize:12, color:'var(--accent)'}}>{formatTalk(f.lifetime_talk_seconds||0)}</span></div>
                )) : <div className="mono" style={{fontSize:12, color:'var(--text-3)', textAlign:'center', padding:12}}>No calls yet</div>}
              </div>
              <div style={{display:'flex', gap:8, marginTop:16}}><button className="btn btn--primary" style={{flex:1}} onClick={()=>{setShowProfileModal(false); navigate('/settings');}}>Change username</button><button className="btn btn--ghost" onClick={()=>setShowProfileModal(false)}>Close</button></div>
            </>}
          </div>
        </div>
      )}

      <aside className="dash__rail">
        <button className="dash__railAvatar" onClick={openProfile} title="Profile">
          <span className="dash__avatar">{user?.username?.charAt(0).toUpperCase()}</span>
          <span className="dash__onlineDot" />
        </button>
        <div className="dash__railNav">
          {navItems.map(it=>(
            <button key={it.id} className={`dash__railBtn ${activeTab===it.id ? 'is-active':''}`} onClick={()=>navigate(it.id==='friends'?'/dashboard': it.id==='add-friend'?'/addfriend' : `/${it.id}`)} aria-label={it.label}>
              <it.icon size={18} strokeWidth={1.75}/>
              {it.count ? <span className="dash__badge">{it.count}</span> : null}
            </button>
          ))}
        </div>
        <div className="dash__railBottom">
          <button className="dash__railBtn" onClick={()=>{const n=theme==='dark'?'light': theme==='light'?'bw':'dark'; useStore.getState().setTheme(n);}} title={theme}>{theme==='light'?<Sun size={16}/>: theme==='bw'?<Palette size={16}/>:<Moon size={16}/>}</button>
          <button className="dash__railBtn" onClick={handleSignOut} title="Sign out"><LogOut size={16}/></button>
        </div>
      </aside>

      <div className="dash__main" ref={mainRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
        <div className={`dash__pull ${isRefreshing?'is-refreshing':''} ${isPulling?'is-pulling':''}`} style={{transform:`translateY(${isRefreshing?12: Math.max(0,pullDistance-34)}px)`, opacity: isRefreshing?1: Math.min(Math.max(0,(pullDistance-10)/36),1)}}>
          <span className={`dash__pullIcon ${isRefreshing?'spin':''}`}><RotateCw size={14}/></span>
          <span className="mono" style={{fontSize:11}}>{isRefreshing?'Refreshing…': pullDistance>=58?'Release': 'Pull'}</span>
        </div>

        <header className="dash__header">
          <div className="dash__headerLeft">
            <h1 className="display dash__h1">{activeTab==='friends'?'Friends': activeTab==='add-friend'?'Add friend': activeTab==='history'?'History':'Settings'}</h1>
            <span className="mono dash__count">{activeTab==='friends'? `${sortedFriends.length} · ${requests.length} pending` : activeTab==='history'? `${filteredHistory.length} calls` : ''}</span>
          </div>
          <div className="dash__headerRight">
            <button className="dash__invite" onClick={copyInvite} title="Copy invite code">
              <Hash size={12}/><span className="mono">{user?.invite_code || '—'}</span>{copied? <Check size={12}/>: <Copy size={12}/>}
            </button>
            <div className="dash__search">
              <Search size={14}/><input placeholder="Search" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} />
            </div>
          </div>
        </header>

        <div className="dash__content" ref={contentRef} style={{transform: pullDistance? `translateY(${Math.min(pullDistance*0.38,30)}px)`: undefined, transition: isPulling? 'none':'transform 220ms var(--ease)'}}>
          {activeTab==='friends' && (
            <div className="stack">
              {requests.length>0 && (
                <section className="panel">
                  <div className="panel__head"><span className="label">Requests</span><span className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{requests.length}</span></div>
                  <div className="panel__list">
                    {requests.map(r=>(
                      <div key={r.id} className="row">
                        <div className="row__left"><span className="dash__avatarSm">{r.username.charAt(0).toUpperCase()}</span><span style={{fontWeight:600, fontSize:13}}>{r.username}</span><span className="mono" style={{fontSize:11, color:'var(--text-3)'}}>@{r.username}</span></div>
                        <div className="row__actions"><button className="btn btn--primary" style={{padding:'7px 12px', fontSize:12}} onClick={()=>handleAccept(r.id)}><Check size={12}/> Accept</button><button className="btn btn--ghost" style={{padding:'7px 12px', fontSize:12}} onClick={()=>handleDecline(r.id)}><X size={12}/> Decline</button></div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <section className="panel">
                <div className="panel__head"><span className="label">Directory</span><span className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{sortedFriends.length}</span></div>
                {sortedFriends.length===0 ? (
                  <div className="empty"><Users size={20} strokeWidth={1.5}/><p className="display" style={{fontSize:18}}>No one yet</p><span className="mono" style={{fontSize:12, color:'var(--text-3)'}}>Add a friend with their username or 24h code.</span><button className="btn btn--secondary" onClick={()=>navigate('/addfriend')}>Add friend</button></div>
                ) : (
                  <div className="panel__list">
                    {sortedFriends.map(f=>(
                      <div key={f.id} className="row row--hover" onClick={()=>navigate(`/friend/${f.id}`,{state:{friend:f,history}})}>
                        <div className="row__left">
                          <span className="dash__avatarSm" style={{position:'relative'}}>{(f.alias||f.username).charAt(0).toUpperCase()}<span className={`dash__dot ${f.isOnline?'is-on':''}`} /></span>
                          <div style={{minWidth:0}}>
                            <div style={{display:'flex', alignItems:'center', gap:6}}><span style={{fontWeight:600, fontSize:13}}>{f.alias||f.username}</span>{f.is_buddy && <Star size={11} fill="#FFB224" color="#FFB224"/>}<span className={`mono status ${f.isOnline?'is-online':''}`} style={{fontSize:10}}>{f.isOnline?'online':'offline'}</span></div>
                            {f.alias && <div className="mono" style={{fontSize:11, color:'var(--text-3)'}}>@{f.username}</div>}
                          </div>
                        </div>
                        <div className="row__actions" onClick={e=>e.stopPropagation()}>
                          <button className={`iconBtn ${!f.isOnline?'is-disabled':''}`} onClick={()=>startCall(f.id,'voice')} aria-label="Voice"><Phone size={14}/></button>
                          <button className={`iconBtn iconBtn--accent ${!f.isOnline?'is-disabled':''}`} onClick={()=>startCall(f.id,'video')} aria-label="Video"><Video size={14}/></button>
                          <ArrowUpRight size={14} style={{color:'var(--text-4)', marginLeft:4}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab==='add-friend' && (
            <section className="panel" style={{maxWidth:560}}>
              <div className="panel__head"><span className="label">Add friend</span></div>
              <p className="mono" style={{fontSize:12, color:'var(--text-2)', lineHeight:1.6, marginBottom:14}}>Enter exact username or 24-hour invite code. Request is instant if they’re online.</p>
              <form onSubmit={handleAddFriend} className="stackSm">
                <div className="field__wrap"><Hash size={14}/><input placeholder="username or 8-char code" value={addInput} onChange={e=>setAddInput(e.target.value)} style={{flex:1}}/><span className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{addInput.length}/24</span></div>
                <button type="submit" className="btn btn--primary" disabled={!addInput.trim()}><UserPlus size={14}/> Send request</button>
              </form>
            </section>
          )}

          {activeTab==='history' && (
            <section className="panel">
              <div className="panel__head"><span className="label">History</span><div className="seg">{['all','missed','incoming','outgoing'].map(k=> <button key={k} className={`seg__btn ${historyFilter===k?'is-active':''}`} onClick={()=>setHistoryFilter(k)}>{k}</button>)}</div></div>
              {filteredHistory.length===0 ? <div className="empty"><Clock size={20}/><p className="mono" style={{fontSize:12, color:'var(--text-3)'}}>No {historyFilter} calls</p></div>
              : <div className="timeline">
                {filteredHistory.map(c=>(
                  <div key={c.id} className="tRow">
                    <div className="tRow__left"><span className={`tDot ${c.status!=='completed'?'is-missed': c.type==='incoming'?'is-in':'is-out'}`}><Phone size={10}/></span><div><div style={{fontSize:13, fontWeight:600}}>{c.other_user_alias||c.other_user}</div><div className="mono" style={{fontSize:11, color: c.status!=='completed'?'var(--danger)':'var(--text-3)'}}>{c.status==='completed'? c.type==='incoming'?'Incoming':'Outgoing' : c.status==='declined'?'Declined': c.status==='missed'?'Missed':'Not answered'} {c.status==='completed' ? `· ${Math.floor(c.duration/60)}:${String(c.duration%60).padStart(2,'0')}`:''} · {formatDistanceToNow(new Date(c.timestamp*1000),{addSuffix:true})}</div></div></div>
                    <span className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{format(new Date(c.timestamp*1000),'HH:mm')}</span>
                  </div>
                ))}
              </div>}
            </section>
          )}

          {activeTab==='settings' && (
            <div className="stack">
              <section className="panel">
                <div className="panel__head"><span className="label">Account</span></div>
                <div className="stackSm">
                  <div className="kv"><span className="mono labelSm">Current</span><span style={{fontWeight:700}}>@{user?.username}</span></div>
                  <form onSubmit={handleUpdateUsername} className="stackSm">
                    <label className="field"><span className="label">New username</span><div className="field__wrap"><span className="mono" style={{fontSize:12, color:'var(--text-3)'}}>@</span><input placeholder="new handle" value={newUsername} onChange={e=>{setNewUsername(e.target.value.toLowerCase().replace(/\s+/g,'')); if(usernameError) setUsernameError(''); if(usernameSuccess) setUsernameSuccess('');}} maxLength={30} /><span className="mono" style={{fontSize:11, color:'var(--text-3)'}}>{newUsername.length}/30</span></div><span className="mono" style={{fontSize:11, color:'var(--text-3)'}}>3-30 · a-z 0-9 . _</span></label>
                    {usernameError && <div className="alert alert--error"><AlertCircle size={12}/>{usernameError}</div>}
                    {usernameSuccess && <div className="alert alert--success"><CheckCircle2 size={12}/>{usernameSuccess}</div>}
                    <button type="submit" disabled={isUpdatingUsername||!newUsername.trim()|| newUsername.trim()===user?.username} className="btn btn--primary" style={{alignSelf:'flex-start'}}>{isUpdatingUsername?<><RotateCw size={12} className="spin"/>Updating…</>:<><Check size={12}/>Update</>}</button>
                  </form>
                </div>
              </section>
              <section className="panel">
                <div className="panel__head"><span className="label">Appearance</span></div>
                <div className="stackSm">
                  <div className="kv"><span className="mono labelSm">Theme</span>
                    <select value={theme} onChange={e=>useStore.getState().setTheme(e.target.value)} className="select">
                      <option value="dark">Ink (default)</option><option value="light">Paper</option><option value="bw">Mono</option>
                    </select>
                  </div>
                  <div className="kv"><span className="mono labelSm">Invite code</span><button className="dash__invite" onClick={copyInvite}><Hash size={12}/><span className="mono">{user?.invite_code}</span>{copied?<Check size={12}/>:<Copy size={12}/>}</button></div>
                  <p className="mono" style={{fontSize:11, color:'var(--text-3)'}}>Expires in 24h. Copy and share.</p>
                </div>
              </section>
              <section className="panel">
                <div className="panel__head"><span className="label">Call preferences</span></div>
                <div className="stackSm">
                  <label className="field"><span className="label">Ring timeout</span><select value={ringTimeout} onChange={e=>setRingTimeout(parseInt(e.target.value,10))} className="select"><option value={15}>15s</option><option value={30}>30s</option><option value={45}>45s</option><option value={60}>60s</option></select></label>
                  <label className="check"><input type="checkbox" checked={ringtoneEnabled} onChange={e=>{setRingtoneEnabled(e.target.checked); if(!e.target.checked){ringtoneSynth.stop(); setIsPreviewPlaying(false);}}} /><span>Enable ringtone</span></label>
                  {ringtoneEnabled && (
                    <div className="stackSm" style={{paddingLeft:4}}>
                      <label className="field"><span className="label">Sound</span><div style={{display:'flex', gap:8}}><select value={selectedRingtone} onChange={e=>{setSelectedRingtone(e.target.value); if(isPreviewPlaying) ringtoneSynth.play(e.target.value, ringtoneVolume);}} className="select" style={{flex:1}}><option value="marimba">Marimba</option><option value="whatsapp">Bell</option><option value="signal">Signal</option><option value="telegram">Trill</option><option value="bells">Bells</option><option value="pulse">Pulse</option><option value="zen">Zen</option><option value="cyber">Cyber</option></select><button type="button" onClick={()=>togglePreview(selectedRingtone)} className={`btn ${isPreviewPlaying?'btn--ghost':'btn--secondary'}`} style={{padding:'8px 14px'}}>{isPreviewPlaying?'Stop':'Play'}</button></div></label>
                      <label className="field"><span className="label">Volume</span><input type="range" min="0" max="1" step="0.05" value={ringtoneVolume} onChange={e=>{const v=parseFloat(e.target.value); useStore.getState().setRingtoneVolume(v); ringtoneSynth.setVolume(v);}} /></label>
                      {Capacitor.isNativePlatform() && <button type="button" onClick={async()=>{try{await Ringtone.pickRingtone(); showToast('Ringtone saved');}catch{}}} className="btn btn--secondary">Pick system ringtone (Android)</button>}
                    </div>
                  )}
                </div>
              </section>
              <button className="btn btn--ghost" onClick={handleSignOut} style={{alignSelf:'flex-start', color:'var(--danger)', borderColor:'rgba(229,72,77,0.25)'}}><LogOut size={14}/>Sign out</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
