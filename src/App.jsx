import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, configured } from './supabase';
import { Moon, Users, Trophy, UserRound, Plus, LogIn, Copy, Check, Clock3, Sparkles, Wind, Volume2, VolumeX, Smartphone, RefreshCw, LogOut, Crown, CalendarDays, Heart, Settings, Gift } from 'lucide-react';

const fmtTime = (v) => (v || '').slice(0,5);
const today = () => new Date().toLocaleDateString('en-CA');
const dateLabel = (v) => new Date(`${v}T12:00:00`).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'});
const errText = (e) => e?.message || '操作失败，请稍后重试';
const initialTab = 'tonight';

export default function App(){
  const [session,setSession]=useState(null), [boot,setBoot]=useState(true);
  const [nickname,setNickname]=useState(localStorage.getItem('gn_nickname')||'');
  const [room,setRoom]=useState(null), [members,setMembers]=useState([]), [checkins,setCheckins]=useState([]);
  const [tab,setTab]=useState(initialTab), [busy,setBusy]=useState(false), [notice,setNotice]=useState('');
  const [roomName,setRoomName]=useState('今晚十一点睡'), [roomCode,setRoomCode]=useState('');
  const [target,setTarget]=useState('23:00'), [sleepTime,setSleepTime]=useState('23:00');
  const [records,setRecords]=useState([]), [wins,setWins]=useState([]), [drawInfo,setDrawInfo]=useState(null);
  const [showCreate,setShowCreate]=useState(false), [showJoin,setShowJoin]=useState(false), [showSettings,setShowSettings]=useState(false);
  const [soundOn,setSoundOn]=useState(false), [rituals,setRituals]=useState({});
  const [reminder,setReminder]=useState(localStorage.getItem('gn_reminder')||'22:30');

  const me=session?.user?.id;
  const myMember=members.find(m=>m.user_id===me);
  const myCheckin=checkins.find(c=>c.user_id===me && c.checkin_date===today());
  const myStreak=useMemo(()=>{
    const mine=checkins.filter(c=>c.user_id===me&&c.is_on_time).sort((a,b)=>b.checkin_date.localeCompare(a.checkin_date));
    if(!mine.length)return 0;
    const latest=new Date(`${mine[0].checkin_date}T12:00:00`), now=new Date(`${today()}T12:00:00`);
    const gap=Math.round((now-latest)/86400000); if(gap>1)return 0;
    let n=0, expected=new Date(latest);
    for(const row of mine){const d=new Date(`${row.checkin_date}T12:00:00`);if(Math.round((expected-d)/86400000)===0){n++;expected.setDate(expected.getDate()-1)}else if(Math.round((expected-d)/86400000)>0)break;}
    return n;
  },[checkins,me]);
  const roomChallengeStart=room?.challenge_start_date;
  const challengeProgress=useMemo(()=>{
    if(!roomChallengeStart)return 0;
    return checkins.filter(c=>c.user_id===me&&c.is_on_time&&c.checkin_date>=roomChallengeStart&&c.checkin_date<=today()).length;
  },[checkins,me,roomChallengeStart]);

  const flash=(s)=>{setNotice(s);window.clearTimeout(window.__gnToast);window.__gnToast=window.setTimeout(()=>setNotice(''),2800)};
  const run=async(fn)=>{setBusy(true);try{await fn()}catch(e){flash(errText(e))}finally{setBusy(false)}};

  const ensureSession=useCallback(async()=>{
    if(!configured)return;
    const {data:{session:existing},error}=await supabase.auth.getSession(); if(error)throw error;
    if(existing){setSession(existing);return existing;}
    const {data,error:signErr}=await supabase.auth.signInAnonymously(); if(signErr)throw signErr;
    setSession(data.session);return data.session;
  },[]);

  const loadRoom=useCallback(async(roomId)=>{
    if(!roomId||!supabase)return;
    const [{data:r,error:re},{data:m,error:meErr},{data:c,error:ce},{data:w,error:we}] = await Promise.all([
      supabase.from('rooms').select('*').eq('id',roomId).single(),
      supabase.from('room_members').select('*').eq('room_id',roomId).order('joined_at'),
      supabase.from('checkins').select('*').eq('room_id',roomId).order('checkin_date',{ascending:false}).limit(500),
      supabase.from('reward_draws').select('*').eq('room_id',roomId).order('created_at',{ascending:false}).limit(100)
    ]);
    if(re)throw re;if(meErr)throw meErr;if(ce)throw ce;if(we)throw we;
    setRoom(r);setTarget(fmtTime(r.target_time));setMembers(m||[]);setCheckins(c||[]);setWins(w||[]);
    const mine=(c||[]).find(x=>x.user_id===me&&x.checkin_date===today());setSleepTime(fmtTime(mine?.sleep_time)||fmtTime(r.target_time));
  },[me]);

  const refresh=useCallback(async()=>{
    if(!supabase||!me)return;
    const {data,error}=await supabase.from('room_members').select('room_id').eq('user_id',me).order('joined_at',{ascending:false}).limit(1);
    if(error)throw error;
    if(data?.length)await loadRoom(data[0].room_id);else{setRoom(null);setMembers([]);setCheckins([]);setWins([])}
  },[me,loadRoom]);

  useEffect(()=>{
    if(!configured){setBoot(false);return}
    ensureSession().catch(e=>flash(errText(e))).finally(()=>setBoot(false));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{setSession(s);});
    return ()=>subscription.unsubscribe();
  },[ensureSession]);

  useEffect(()=>{if(me)refresh().catch(e=>flash(errText(e)))},[me,refresh]);
  useEffect(()=>{
    if(!room?.id)return;
    const channel=supabase.channel(`room-live-${room.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'room_members',filter:`room_id=eq.${room.id}`},()=>refresh().catch(()=>{}))
      .on('postgres_changes',{event:'*',schema:'public',table:'checkins',filter:`room_id=eq.${room.id}`},()=>loadRoom(room.id).catch(()=>{}))
      .on('postgres_changes',{event:'*',schema:'public',table:'rooms',filter:`id=eq.${room.id}`},()=>loadRoom(room.id).catch(()=>{}))
      .on('postgres_changes',{event:'*',schema:'public',table:'reward_draws',filter:`room_id=eq.${room.id}`},()=>loadRoom(room.id).catch(()=>{}))
      .subscribe();
    return ()=>{supabase.removeChannel(channel)};
  },[room?.id,refresh,loadRoom]);

  const createRoom=()=>run(async()=>{
    if(!nickname.trim())throw new Error('请先填写昵称');
    localStorage.setItem('gn_nickname',nickname.trim());
    const {data,error}=await supabase.rpc('create_room',{p_name:roomName.trim()||'一起早睡',p_nickname:nickname.trim(),p_target_time:target+':00'});
    if(error)throw error;await loadRoom(data.room_id);setShowCreate(false);setTab('room');flash(`房间创建成功，邀请码：${data.room_code}`);
  });
  const joinRoom=()=>run(async()=>{
    if(!nickname.trim())throw new Error('请先填写昵称');
    if(!/^\d{6}$/.test(roomCode.trim()))throw new Error('请输入 6 位数字邀请码');
    localStorage.setItem('gn_nickname',nickname.trim());
    const {data,error}=await supabase.rpc('join_room',{p_code:roomCode.trim(),p_nickname:nickname.trim()});
    if(error)throw error;await loadRoom(data.room_id);setShowJoin(false);setTab('room');flash('加入成功，欢迎来到早睡房间！');
  });
  const saveCheckin=()=>run(async()=>{
    if(!room)throw new Error('请先创建或加入一个房间');
    const {data,error}=await supabase.rpc('upsert_checkin',{p_room_id:room.id,p_sleep_time:sleepTime+':00'});
    if(error)throw error;await loadRoom(room.id);flash(data.is_on_time?'打卡成功，今晚达标 🌙':'已记录，明天继续加油');
  });
  const saveRoomTarget=()=>run(async()=>{
    const {error}=await supabase.from('rooms').update({target_time:target+':00'}).eq('id',room.id);if(error)throw error;
    await loadRoom(room.id);setShowSettings(false);flash('房间目标时间已更新');
  });
  const leaveRoom=()=>run(async()=>{
    const {error}=await supabase.rpc('leave_room',{p_room_id:room.id});if(error)throw error;
    setRoom(null);setMembers([]);setCheckins([]);setWins([]);flash('已退出房间');
  });
  const startChallenge=()=>run(async()=>{
    const {error}=await supabase.rpc('start_room_challenge',{p_room_id:room.id});if(error)throw error;
    await loadRoom(room.id);flash('30 天挑战已开启！');
  });
  const draw=()=>run(async()=>{
    const {data,error}=await supabase.rpc('draw_reward',{p_room_id:room.id});if(error)throw error;
    setDrawInfo(data);await loadRoom(room.id);
  });
  const copyCode=async()=>{await navigator.clipboard.writeText(room.room_code);flash('邀请码已复制，发给朋友吧！')};
  const myRows=checkins.filter(c=>c.user_id===me).sort((a,b)=>b.checkin_date.localeCompare(a.checkin_date));
  const memberStatus=(id)=>checkins.find(c=>c.user_id===id&&c.checkin_date===today());
  const sortedMembers=[...members].sort((a,b)=>{
    const sa=checkins.filter(c=>c.user_id===a.user_id&&c.is_on_time).length;
    const sb=checkins.filter(c=>c.user_id===b.user_id&&c.is_on_time).length;return sb-sa;
  });
  const week=Array.from({length:7},(_,i)=>{const dt=new Date();dt.setDate(dt.getDate()-(6-i));const day=dt.toLocaleDateString('en-CA');return {day,row:myRows.find(r=>r.checkin_date===day)}});
  const [r1,r2,r3,r4]=['呼吸放松','白噪音','放下手机','睡前准备'];

  if(!configured)return <div className="setup"><div className="setup-card"><Moon size={42}/><h1>晚安打卡 · 早睡搭子</h1><p>项目代码已就绪。配置 Supabase 后即可启用多人在线功能。</p><ol><li>复制 <code>.env.example</code> 为 <code>.env.local</code></li><li>填写 Supabase Project URL 和 Publishable/Anon Key</li><li>在 Supabase SQL Editor 执行 <code>supabase/migrations/001_initial.sql</code></li><li>在 Authentication → Providers 中启用 Anonymous Sign-Ins</li></ol><p className="hint">详细步骤见项目根目录 README.md。</p></div></div>;
  if(boot)return <div className="loading"><Moon/> 正在准备今晚的星空…</div>;
  if(!session)return <div className="loading">正在创建匿名身份…</div>;

  return <div className="app">
    <header className="topbar"><div className="brand"><span className="moon">☾</span><div><b>晚安打卡</b><small>把早睡变成一件温柔的小事</small></div></div><button className="icon-btn" onClick={()=>setShowSettings(true)}><Settings size={17}/></button></header>
    <div className="hero"><div className="stars">✦　　·　　✧　　·</div><span className="eyebrow">TONIGHT · SLEEP WELL</span><h1>给自己一个<br/>温柔的晚安</h1><p>连续早睡 <b>{myStreak}</b> 天，慢慢养成好习惯。</p><div className="hero-time"><div><small>房间目标入睡</small><strong>{room?fmtTime(room.target_time):target}</strong></div><span className="hero-pill">{myCheckin?(myCheckin.is_on_time?'✓ 今晚已达标':'已完成记录'):'今晚也要加油'}</span></div><div className="hero-progress"><i style={{width:`${Math.min(100,myStreak/30*100)}%`}}/></div><div className="hero-foot"><span>30 天早睡挑战</span><b>{myStreak}/30</b></div></div>
    <nav className="tabs">
      <button className={tab==='tonight'?'active':''} onClick={()=>setTab('tonight')}><Moon/>今晚</button>
      <button className={tab==='room'?'active':''} onClick={()=>setTab('room')}><Users/>房间</button>
      <button className={tab==='rank'?'active':''} onClick={()=>setTab('rank')}><Trophy/>排行</button>
      <button className={tab==='me'?'active':''} onClick={()=>setTab('me')}><UserRound/>我的</button>
    </nav>
    {tab==='tonight'&&<main className="content">
      {!room?<section className="card welcome"><div className="moon-art">🌙</div><h2>先找一个早睡搭子吧</h2><p>创建自己的房间，或输入朋友的邀请码加入房间。你们的打卡进度会实时同步。</p><div className="two-actions"><button className="btn primary" onClick={()=>setShowCreate(true)}><Plus/>创建房间</button><button className="btn secondary" onClick={()=>setShowJoin(true)}><LogIn/>加入房间</button></div></section>:
      <><section className="card check-card"><div className="section-title"><div><span className="kicker">MY CHECK-IN</span><h2>今晚睡得怎么样？</h2></div><span className="tag">{myCheckin?'已记录':'待打卡'}</span></div><label className="label">实际入睡时间</label><input className="time-input" type="time" value={sleepTime} onChange={e=>setSleepTime(e.target.value)}/><p className="hint">按照房间目标时间判断，提前或晚 15 分钟以内均算达标。</p><button className="btn primary wide" disabled={busy} onClick={saveCheckin}><Check/> {busy?'保存中…':myCheckin?'更新今晚打卡':'我睡啦，打卡 ✨'}</button></section>
      <section className="section"><div className="section-head"><h2>今晚的睡前仪式</h2><span>{Object.values(rituals).filter(Boolean).length}/4 已完成</span></div><div className="ritual-grid">{[r1,r2,r3,r4].map((x,i)=><button key={x} className={`ritual ${rituals[x]?'done':''}`} onClick={()=>{if(i===1){setSoundOn(!soundOn);setRituals(v=>({...v,[x]:!soundOn}))}else if(i===0){setRituals(v=>({...v,[x]:true}));flash('吸气 4 秒 · 屏息 7 秒 · 呼气 8 秒，慢慢来')}else setRituals(v=>({...v,[x]:!v[x]}))}}><span>{['🌬️','🌧️','📵','💧'][i]}</span><b>{x}</b><small>{i===1?(soundOn?'白噪音已开启':'点击开启'):['跟着呼吸放松','轻柔雨声','远离屏幕一会儿','洗漱、喝水、关灯'][i]}</small></button>)}</div></section>
      <section className="section card"><div className="section-head"><h2>房间今晚状态</h2><span className="live-dot">实时同步</span></div>{members.map(m=>{const c=memberStatus(m.user_id);return <div className="member-line" key={m.user_id}><div className="avatar">{(m.nickname||'?').slice(0,1)}</div><div className="member-name"><b>{m.nickname}{m.user_id===me?'（我）':''}</b><small>{c?`入睡 ${fmtTime(c.sleep_time)}`:'还未打卡'}</small></div><span className={`status ${c?(c.is_on_time?'good':'late'):''}`}>{c?(c.is_on_time?'已达标':'已记录'):'待打卡'}</span></div>})}</section></>}
      <section className="section card"><div className="section-head"><h2>最近 7 天</h2><CalendarDays size={17}/></div><div className="week-grid">{week.map(x=><div key={x.day}><span>{new Date(`${x.day}T12:00:00`).toLocaleDateString('zh-CN',{weekday:'short'})}</span><b className={x.row?(x.row.is_on_time?'day-good':'day-late'):'day-empty'}>{x.row?(x.row.is_on_time?'✓':'·'):'—'}</b></div>)}</div></section>
    </main>}
    {tab==='room'&&<main className="content">{!room?<section className="card welcome"><h2>还没有加入房间</h2><p>创建房间邀请朋友，或使用朋友分享的邀请码加入。</p><button className="btn primary wide" onClick={()=>setShowCreate(true)}>创建房间</button><button className="btn secondary wide" onClick={()=>setShowJoin(true)}>输入邀请码加入</button></section>:<>
      <section className="card room-card"><span className="kicker">YOUR SLEEP ROOM</span><h2>{room.name}</h2><p>和朋友一起，互相提醒、共同坚持。</p><div className="invite-code"><div><small>房间邀请码</small><strong>{room.room_code}</strong></div><button className="btn secondary" onClick={copyCode}><Copy size={16}/>复制</button></div><div className="room-meta"><span><Users size={15}/>{members.length} 位成员</span><span><Clock3 size={15}/>目标 {fmtTime(room.target_time)}</span></div></section>
      <section className="section card"><div className="section-head"><h2>今晚打卡进度</h2><span>{members.filter(m=>memberStatus(m.user_id)).length}/{members.length}</span></div><div className="progress-track"><i style={{width:`${members.length?members.filter(m=>memberStatus(m.user_id)).length/members.length*100:0}%`}}/></div>{members.map(m=>{const c=memberStatus(m.user_id);return <div className="member-line" key={m.user_id}><div className="avatar">{m.nickname.slice(0,1)}</div><div className="member-name"><b>{m.nickname}{m.user_id===me?'（我）':''}</b><small>{c?`实际入睡 ${fmtTime(c.sleep_time)}`:'等待今晚打卡'}</small></div><span className={`status ${c?(c.is_on_time?'good':'late'):''}`}>{c?(c.is_on_time?'🌙 达标':'已记录'):'未打卡'}</span></div>})}</section>
      <section className="section card"><div className="section-head"><h2>30 天共同挑战</h2><span className="tag">一起坚持</span></div><p className="hint">挑战开始后，每位成员独立累计自己的达标天数。房间创建者可以重新开启挑战。</p><div className="challenge-list">{members.map(m=><div className="challenge-row" key={m.user_id}><span>{m.nickname}</span><div className="mini-track"><i style={{width:`${Math.min(100,checkins.filter(c=>c.user_id===m.user_id&&c.is_on_time&&c.checkin_date>=room.challenge_start_date).length/30*100)}%`}}/></div><b>{checkins.filter(c=>c.user_id===m.user_id&&c.is_on_time&&c.checkin_date>=room.challenge_start_date).length}/30</b></div>)}</div>{room.owner_id===me&&<button className="btn secondary wide" onClick={startChallenge}><RefreshCw size={16}/>重新开启 30 天挑战</button>}</section>
      <button className="btn danger wide" onClick={leaveRoom}><LogOut size={16}/>退出当前房间</button>
    </>}</main>}
    {tab==='rank'&&<main className="content"><section className="card"><div className="section-head"><h2>早睡排行榜 🏆</h2><span className="live-dot">实时更新</span></div>{!room?<p className="hint">加入房间后，就能和朋友一起上榜啦。</p>:sortedMembers.map((m,i)=>{const count=checkins.filter(c=>c.user_id===m.user_id&&c.is_on_time).length;return <div className="rank-line" key={m.user_id}><strong className={`rank-no rank-${i+1}`}>{['🥇','🥈','🥉'][i]||i+1}</strong><div className="avatar">{m.nickname.slice(0,1)}</div><div className="member-name"><b>{m.nickname}{m.user_id===me?'（我）':''}</b><small>累计达标 {count} 天</small></div><b className="rank-score">{count} 天</b></div>})}</section><section className="section card"><h2>30 天挑战奖励</h2><div className="reward-row"><span>🏆 一等奖</span><b>心愿礼物 · 4%</b></div><div className="reward-row"><span>🧧 二等奖</span><b>19.9 元红包 · 22%</b></div><div className="reward-row"><span>💌 三等奖</span><b>9.9 元红包 · 74%</b></div><p className="hint">达成连续 30 天后可获得一次抽奖机会，奖励由房间成员按约定兑现。</p><button className="btn primary wide" disabled={!room||myStreak<30||busy} onClick={draw}><Gift size={17}/>抽一次奖（连续达标 30 天解锁）</button>{drawInfo&&<div className="draw-result"><Sparkles/>{drawInfo.prize_name} · {drawInfo.prize_description}</div>}</section>{wins.length>0&&<section className="section card"><h2>房间中奖记录</h2>{wins.map(w=><div className="record" key={w.id}>{dateLabel(w.created_at.slice(0,10))} · {w.nickname} 获得 {w.prize_name}</div>)}</section>}</main>}
    {tab==='me'&&<main className="content"><section className="card profile-card"><div className="avatar big">{(myMember?.nickname||nickname||'我').slice(0,1)}</div><h2>{myMember?.nickname||nickname||'早睡搭子'}</h2><p className="hint">匿名身份 · 不需要注册</p><div className="stats"><div><b>{myStreak}</b><small>连续达标</small></div><div><b>{myRows.filter(x=>x.is_on_time).length}</b><small>累计达标</small></div><div><b>{myRows.length}</b><small>累计打卡</small></div></div></section><section className="section card"><h2>我的打卡记录</h2>{myRows.length?myRows.slice(0,20).map(r=><div className="record" key={r.id}><span>{r.checkin_date}</span><span>{fmtTime(r.sleep_time)}　{r.is_on_time?'🟩 达标':'🩷 晚睡'}</span></div>):<p className="hint">还没有记录，今晚开始第一天吧。</p>}</section><section className="section card"><h2>个人睡前提醒</h2><input type="time" className="time-input" value={reminder} onChange={e=>setReminder(e.target.value)}/><button className="btn secondary wide" onClick={()=>{localStorage.setItem('gn_reminder',reminder);flash('提醒时间已保存。网页关闭后无法触发本地提醒，请配合手机闹钟使用。')}}>保存提醒时间</button><p className="hint">浏览器网页关闭后无法可靠发送定时通知，建议同时设置手机闹钟。</p></section><button className="btn danger wide" onClick={()=>flash('匿名身份保存在当前浏览器。清除浏览器数据或更换设备后，无法找回原身份。')}>身份与数据说明</button></main>}
    {showCreate&&<div className="overlay" onClick={()=>setShowCreate(false)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setShowCreate(false)}>×</button><h2>创建早睡房间 🌙</h2><label>你的昵称</label><input value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={20} placeholder="例如：晚安小月亮"/><label>房间名称</label><input value={roomName} onChange={e=>setRoomName(e.target.value)} maxLength={30}/><label>目标入睡时间</label><input type="time" value={target} onChange={e=>setTarget(e.target.value)}/><button className="btn primary wide" disabled={busy} onClick={createRoom}>创建房间并生成邀请码</button></div></div>}
    {showJoin&&<div className="overlay" onClick={()=>setShowJoin(false)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setShowJoin(false)}>×</button><h2>加入朋友的房间 🫶</h2><label>你的昵称</label><input value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={20} placeholder="朋友会这样看到你"/><label>6 位房间邀请码</label><input value={roomCode} onChange={e=>setRoomCode(e.target.value.replace(/\\D/g,'').slice(0,6))} inputMode="numeric" maxLength={6} placeholder="输入朋友分享的号码"/><button className="btn primary wide" disabled={busy} onClick={joinRoom}>加入房间</button></div></div>}
    {showSettings&&<div className="overlay" onClick={()=>setShowSettings(false)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setShowSettings(false)}>×</button><h2>房间设置</h2>{room&&<><label>目标入睡时间</label><input type="time" value={target} onChange={e=>setTarget(e.target.value)}/><button className="btn primary wide" onClick={saveRoomTarget} disabled={busy||room.owner_id!==me}>保存房间目标</button>{room.owner_id!==me&&<p className="hint">只有房主可以修改目标时间。</p>}</>}</div></div>}
    {drawInfo&&<div className="overlay" onClick={()=>setDrawInfo(null)}><div className="modal result" onClick={e=>e.stopPropagation()}><div className="prize-emoji">🎉</div><h2>{drawInfo.prize_name}</h2><p>{drawInfo.prize_description}</p><button className="btn primary wide" onClick={()=>setDrawInfo(null)}>收下好运</button></div></div>}
    {notice&&<div className="toast">{notice}</div>}
    <footer>愿每一个认真早睡的夜晚，都有星星为你亮着 ✦</footer>
  </div>;
}
