-- 晚安打卡 · 多人在线版数据库初始化
-- 在 Supabase Dashboard → SQL Editor 中完整执行本文件。

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code char(6) not null unique,
  name text not null check (char_length(name) between 1 and 40),
  owner_id uuid not null references auth.users(id) on delete cascade,
  target_time time not null default '23:00',
  challenge_start_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key(room_id,user_id)
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null default current_date,
  sleep_time time not null,
  is_on_time boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(room_id,user_id,checkin_date)
);

create table if not exists public.reward_draws (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  prize_tier smallint not null check(prize_tier between 1 and 3),
  prize_name text not null,
  prize_description text not null,
  created_at timestamptz not null default now()
);

create index if not exists room_members_user_idx on public.room_members(user_id);
create index if not exists checkins_room_date_idx on public.checkins(room_id,checkin_date desc);
create index if not exists checkins_user_date_idx on public.checkins(user_id,checkin_date desc);
create index if not exists reward_draws_room_idx on public.reward_draws(room_id,created_at desc);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.checkins enable row level security;
alter table public.reward_draws enable row level security;

revoke all on public.rooms, public.room_members, public.checkins, public.reward_draws from anon, authenticated;
grant select on public.rooms, public.room_members, public.checkins, public.reward_draws to authenticated;
grant update(target_time, name) on public.rooms to authenticated;

create or replace function public.is_room_member(p_room_id uuid)
returns boolean language sql stable security definer set search_path=public,auth
as $$ select exists(select 1 from public.room_members rm where rm.room_id=p_room_id and rm.user_id=auth.uid()); $$;

create policy "room members can read rooms" on public.rooms for select to authenticated
using (public.is_room_member(id));
create policy "members can read room members" on public.room_members for select to authenticated
using (public.is_room_member(room_id));
create policy "members can read checkins" on public.checkins for select to authenticated
using (public.is_room_member(room_id));
create policy "members can read rewards" on public.reward_draws for select to authenticated
using (public.is_room_member(room_id));
create policy "room owner can update room settings" on public.rooms for update to authenticated
using (owner_id=auth.uid() and public.is_room_member(id))
with check (owner_id=auth.uid() and public.is_room_member(id));

-- 房间创建：生成不重复的邀请码，并将创建者加入房间。
create or replace function public.create_room(p_name text,p_nickname text,p_target_time time default '23:00')
returns jsonb language plpgsql security definer set search_path=public,auth
as $$
declare v_room public.rooms; v_code text; v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception '请先建立匿名身份'; end if;
  if length(trim(coalesce(p_nickname,''))) not between 1 and 20 then raise exception '昵称长度需为 1-20 个字符'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 40 then raise exception '房间名称长度需为 1-40 个字符'; end if;
  loop
    v_code:=lpad((floor(random()*1000000))::int::text,6,'0');
    exit when not exists(select 1 from public.rooms where room_code=v_code);
  end loop;
  insert into public.rooms(room_code,name,owner_id,target_time) values(v_code,trim(p_name),v_uid,p_target_time) returning * into v_room;
  insert into public.room_members(room_id,user_id,nickname,role) values(v_room.id,v_uid,trim(p_nickname),'owner');
  return jsonb_build_object('room_id',v_room.id,'room_code',v_room.room_code);
end; $$;

create or replace function public.join_room(p_code text,p_nickname text)
returns jsonb language plpgsql security definer set search_path=public,auth
as $$
declare v_room public.rooms; v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception '请先建立匿名身份'; end if;
  if length(trim(coalesce(p_nickname,''))) not between 1 and 20 then raise exception '昵称长度需为 1-20 个字符'; end if;
  select * into v_room from public.rooms where room_code=trim(p_code) for update;
  if not found then raise exception '没有找到这个房间，请检查邀请码'; end if;
  insert into public.room_members(room_id,user_id,nickname,role)
  values(v_room.id,v_uid,trim(p_nickname),'member')
  on conflict(room_id,user_id) do update set nickname=excluded.nickname;
  return jsonb_build_object('room_id',v_room.id,'room_code',v_room.room_code);
end; $$;

create or replace function public.upsert_checkin(p_room_id uuid,p_sleep_time time)
returns jsonb language plpgsql security definer set search_path=public,auth
as $$
declare v_target time; v_diff int; v_ok boolean; v_row public.checkins;
begin
  if not public.is_room_member(p_room_id) then raise exception '你不是该房间成员'; end if;
  select target_time into v_target from public.rooms where id=p_room_id;
  v_diff:=((extract(hour from p_sleep_time)::int*60+extract(minute from p_sleep_time)::int)
          -(extract(hour from v_target)::int*60+extract(minute from v_target)::int)+720+1440)%1440-720;
  v_ok:=v_diff<=15;
  insert into public.checkins(room_id,user_id,checkin_date,sleep_time,is_on_time)
  values(p_room_id,auth.uid(),current_date,p_sleep_time,v_ok)
  on conflict(room_id,user_id,checkin_date) do update
    set sleep_time=excluded.sleep_time,is_on_time=excluded.is_on_time,updated_at=now()
  returning * into v_row;
  return jsonb_build_object('id',v_row.id,'is_on_time',v_row.is_on_time,'sleep_time',v_row.sleep_time);
end; $$;

create or replace function public.leave_room(p_room_id uuid)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.rooms where id=p_room_id;
  if not exists(select 1 from public.room_members where room_id=p_room_id and user_id=auth.uid()) then raise exception '你不是该房间成员'; end if;
  if v_owner=auth.uid() then
    delete from public.rooms where id=p_room_id;
  else
    delete from public.room_members where room_id=p_room_id and user_id=auth.uid();
  end if;
end; $$;

create or replace function public.start_room_challenge(p_room_id uuid)
returns date language plpgsql security definer set search_path=public,auth
as $$
declare v_date date;
begin
  update public.rooms set challenge_start_date=current_date
  where id=p_room_id and owner_id=auth.uid() returning challenge_start_date into v_date;
  if v_date is null then raise exception '只有房主可以开启新挑战'; end if;
  return v_date;
end; $$;

create or replace function public.draw_reward(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth
as $$
declare v_streak int:=0; v_expected date:=current_date; v_day date; v_ok boolean;
        v_nickname text; v_roll numeric; v_tier int; v_name text; v_desc text; v_row public.reward_draws;
begin
  select nickname into v_nickname from public.room_members where room_id=p_room_id and user_id=auth.uid();
  if v_nickname is null then raise exception '你不是该房间成员'; end if;
  for v_day in
    select checkin_date from public.checkins
    where room_id=p_room_id and user_id=auth.uid() and is_on_time
      and checkin_date between current_date-365 and current_date
    order by checkin_date desc
  loop
    if v_day=v_expected then v_streak:=v_streak+1; v_expected:=v_expected-1;
    elsif v_day<v_expected then exit;
    end if;
  end loop;
  if v_streak<30 then raise exception '连续达标满 30 天后才能抽奖'; end if;
  if (select count(*) from public.reward_draws where room_id=p_room_id and user_id=auth.uid()) >= floor(v_streak/30.0) then
    raise exception '本轮抽奖机会已使用';
  end if;
  v_roll:=random()*100;
  if v_roll<4 then v_tier:=1;v_name:='一等奖：心愿礼物';v_desc:='我连续 30 天早睡了！请你亲手帮我挑一份礼物，作为这段坚持的纪念。';
  elsif v_roll<26 then v_tier:=2;v_name:='二等奖：19.9 元红包';v_desc:='恭喜获得 19.9 元红包，请按房间约定兑现。';
  else v_tier:=3;v_name:='三等奖：9.9 元红包';v_desc:='恭喜获得 9.9 元红包，给自己一点小奖励。'; end if;
  insert into public.reward_draws(room_id,user_id,nickname,prize_tier,prize_name,prize_description)
  values(p_room_id,auth.uid(),v_nickname,v_tier,v_name,v_desc) returning * into v_row;
  return jsonb_build_object('id',v_row.id,'prize_tier',v_tier,'prize_name',v_name,'prize_description',v_desc);
end; $$;

revoke all on function public.create_room(text,text,time) from public;
revoke all on function public.join_room(text,text) from public;
revoke all on function public.upsert_checkin(uuid,time) from public;
revoke all on function public.leave_room(uuid) from public;
revoke all on function public.start_room_challenge(uuid) from public;
revoke all on function public.draw_reward(uuid) from public;
grant execute on function public.create_room(text,text,time) to authenticated;
grant execute on function public.join_room(text,text) to authenticated;
grant execute on function public.upsert_checkin(uuid,time) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;
grant execute on function public.start_room_challenge(uuid) to authenticated;
grant execute on function public.draw_reward(uuid) to authenticated;

-- Supabase Realtime：将需要实时刷新的表加入 publication（若已存在则忽略）。
do $$ begin
  alter publication supabase_realtime add table public.room_members;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.checkins;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.reward_draws;
exception when duplicate_object then null; when undefined_object then null; end $$;
