-- Dinner Night · honoured-guest invitations
-- Run in the Supabase SQL editor. It is safe to run again: it keeps existing data, and it brings an older setup up to date.
--
-- What is stored: for each invitation, its honoured-guest number, who it is for (a name, and the WhatsApp number the
-- host sent it to), how many seats, which host made it, its answer, its table and seat numbers, and how many have come
-- in. The hosts' phone numbers (for the gate's Call button) are added privately, never here.
-- Nobody reads the tables directly. Guests, hosts, the gate and the overall view go through the functions below, and
-- each function checks the secret code in that person's link. A host sees names and numbers for their own guests only.
-- After the dinner, clear them: update invitations set name=null, phone=null;

-- ---------- tables ----------
create table if not exists settings (
  id boolean primary key default true check (id),
  deadline timestamptz not null default '2026-12-10 23:59:59+00',   -- confirm by 10 December (Accra is UTC+0)
  late_deadline timestamptz not null default '2026-12-19 23:59:59+00', -- invitations made after 10 December: confirm by the 19th
  admin_token text not null,
  gate_token text not null
);

create table if not exists hosts (
  key text primary key,
  name text not null,
  role text,
  seats int not null check (seats > 0),
  token text not null unique
);
alter table hosts add column if not exists phone text;

create table if not exists dinner_tables (
  num int primary key check (num between 1 and 20),
  name text not null,
  chairs int not null default 9 check (chairs between 1 and 20)
);

-- where each host's guests sit to begin with: chairs per host per table
create table if not exists plan (
  table_num int not null references dinner_tables(num),
  host text not null references hosts(key),
  chairs int not null check (chairs > 0),
  primary key (table_num, host)
);

-- one row per invitation: one honoured-guest number, for one to four seats (a person, a couple, a family, a team)
create table if not exists invitations (
  num int primary key check (num between 100 and 999),
  token text not null unique,
  host text not null references hosts(key),
  grp uuid not null,
  pos int not null default 0,
  family boolean not null default false,                -- the family hosts' own invitations, at the family table
  own text check (own in ('you','wife')),
  kids int not null default 0,                          -- children who come in with them and take no chair
  status text not null default 'sent' check (status in ('sent','confirmed','cancelled')),
  expires_at timestamptz not null,                      -- not confirmed by then: the seats go back to the host
  table_num int references dinner_tables(num),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  arrived_at timestamptz
);
alter table invitations add column if not exists seats int not null default 1;      -- seats the host gave it
alter table invitations add column if not exists att int;                           -- seats confirmed: the household may confirm fewer
alter table invitations add column if not exists arrived int not null default 0;    -- people let in at the gate so far
alter table invitations add column if not exists admits text[] not null default '{}'; -- the gate's admissions already counted, so a resend counts once
alter table invitations add column if not exists name text;                         -- who it is for: a person, a family or a team
alter table invitations add column if not exists phone text;                        -- the WhatsApp number it went to, digits with the country code (233...)
alter table invitations add column if not exists chairs int[];                      -- its seat numbers at its table: 1 to 9, clockwise from the side facing the high table
create index if not exists invitations_host on invitations(host);
create index if not exists invitations_grp on invitations(grp);
create index if not exists invitations_table on invitations(table_num);
create index if not exists invitations_phone on invitations(phone);

alter table settings enable row level security;
alter table hosts enable row level security;
alter table dinner_tables enable row level security;
alter table plan enable row level security;
alter table invitations enable row level security;
revoke all on settings, hosts, dinner_tables, plan, invitations from anon, authenticated;

-- an older setup made one row per person, grouped. Each group becomes one invitation for that many seats: the first
-- row keeps its number and link, the others are cancelled
do $$
declare r record;
begin
  for r in select grp, min(pos) first, count(*) n, sum(kids) kids from invitations where status<>'cancelled' group by grp having count(*)>1 loop
    update invitations set seats=r.n, kids=r.kids where grp=r.grp and pos=r.first and status<>'cancelled';
    update invitations set status='cancelled' where grp=r.grp and pos<>r.first and status<>'cancelled';
  end loop;
  update invitations set att=seats where status='confirmed' and att is null;
  update invitations set arrived=coalesce(att,seats) where arrived_at is not null and arrived=0;
end $$;

-- ---------- helpers (not callable from the web) ----------
create or replace function _token() returns text language sql volatile set search_path=public as $$
  select substr(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),1,24)
$$;
-- a guest's link code: shorter, so the link in the WhatsApp message is shorter
create or replace function _short_token() returns text language sql volatile set search_path=public as $$
  select substr(replace(gen_random_uuid()::text,'-',''),1,12)
$$;

-- an invitation still holds its seats: confirmed, or waiting and not past its date
create or replace function _holds(i invitations) returns boolean language sql stable set search_path=public as $$
  select i.status='confirmed' or (i.status='sent' and now()<=i.expires_at)
$$;
-- the chairs it holds: what was confirmed, or all its seats while it waits
create or replace function _held(i invitations) returns int language sql stable set search_path=public as $$
  select case when i.status='confirmed' then coalesce(i.att,i.seats) when i.status='sent' and now()<=i.expires_at then i.seats else 0 end
$$;
-- the state a guest, host or the gate sees
create or replace function _state(i invitations) returns text language sql stable set search_path=public as $$
  select case when i.status='sent' and now()>i.expires_at then 'expired' else i.status end
$$;

-- a WhatsApp number however it was typed (024 412 3456, +233 24 412 3456, 00233...), as digits with the country code.
-- Null when it can't be a number: a number from abroad needs its country code
create or replace function _phone(p text) returns text language sql immutable set search_path=public as $$
  select case
    when d ~ '^2330[0-9]{9}$' then '233'||substr(d,5)
    when d ~ '^0[0-9]{9}$' then '233'||substr(d,2)
    when d ~ '^[235][0-9]{8}$' then '233'||d
    when d ~ '^[1-9][0-9]{10,14}$' then d
  end
  from (select regexp_replace(regexp_replace(coalesce(p,''),'[^0-9]','','g'),'^00','') d) x
$$;

-- the seat numbers taken at a table, leaving out one invitation (the one being changed)
create or replace function _taken(p_table int, p_skip uuid default null) returns int[] language sql stable set search_path=public as $$
  select coalesce(array_agg(c),'{}') from invitations i, unnest(i.chairs[1:_held(i)]) c
  where i.table_num=p_table and _holds(i) and i.grp is distinct from p_skip
$$;

-- n free seats at a table, side by side, going round from a chosen seat (or seat 1). When no n are free side by side:
-- the free seats nearest the chosen one. Null when the table hasn't n free seats
create or replace function _pick(p_table int, p_n int, p_skip uuid default null, p_start int default null) returns int[] language plpgsql stable set search_path=public as $$
declare cap int; taken int[]; run int[]; st int; k int; c int; ch int;
begin
  select d.chairs into cap from dinner_tables d where d.num=p_table;
  if cap is null or p_n is null or p_n<1 or p_n>cap then return null; end if;
  taken := _taken(p_table,p_skip);
  for k in 0..cap-1 loop
    st := ((coalesce(p_start,1)-1+k) % cap)+1;
    run := '{}';
    for c in 0..p_n-1 loop
      ch := ((st-1+c) % cap)+1;
      exit when ch = any(taken);
      run := run || ch;
    end loop;
    if cardinality(run)=p_n then return run; end if;
  end loop;
  select array_agg(x order by (x-coalesce(p_start,1)+cap) % cap) into run from generate_series(1,cap) x where not x = any(taken);
  if coalesce(cardinality(run),0)<p_n then return null; end if;
  return run[1:p_n];
end $$;

-- what's wrong with these seat numbers at this table, if anything: repeated, not at this table, or already taken
create or replace function _bad_chairs(p_table int, p_chairs int[], p_skip uuid default null) returns text language sql stable set search_path=public as $$
  select case
    when p_chairs is null or cardinality(p_chairs)=0 then 'count'
    when not exists (select 1 from dinner_tables where num=p_table) then 'table'
    when (select count(distinct c) from unnest(p_chairs) c)<>cardinality(p_chairs) then 'chairs'
    when exists (select 1 from unnest(p_chairs) c, dinner_tables d where d.num=p_table and (c is null or c<1 or c>d.chairs)) then 'chairs'
    when p_chairs && _taken(p_table,p_skip) then 'taken'
  end
$$;

-- a host's chairs still free at one table: their planned chairs there, less what their invitations hold there
create or replace function _room(p_host text, p_table int, p_skip uuid default null) returns int language sql stable set search_path=public as $$
  select coalesce((select p.chairs from plan p where p.host=p_host and p.table_num=p_table),0)
    - coalesce((select sum(_held(i)) from invitations i where i.host=p_host and i.table_num=p_table and _holds(i) and i.grp is distinct from p_skip),0)::int
$$;

-- the seats a host can still give: their seats, less their own family seats, less what their invitations hold
create or replace function _left(h hosts, p_skip uuid default null) returns int language sql stable set search_path=public as $$
  select h.seats
    - coalesce((select sum(i.seats) from invitations i where i.host=h.key and i.family and i.status<>'cancelled'),0)::int
    - coalesce((select sum(_held(i)) from invitations i where i.host=h.key and not i.family and i.grp is distinct from p_skip),0)::int
$$;

-- the invitation already using a WhatsApp number, if any (one number, one invitation, across every host)
create or replace function _used(p_phone text, p_skip int default null) returns invitations language sql stable set search_path=public as $$
  select * from invitations i where i.phone=p_phone and _holds(i) and i.num is distinct from p_skip order by i.created_at limit 1
$$;
-- what a host is told about it: their own guest in full, another host's guest only by that host's name
create or replace function _usedjson(u invitations, h hosts) returns json language sql stable set search_path=public as $$
  select case when u.host=h.key then json_build_object('mine',true,'num',u.num,'name',u.name,'table',u.table_num,'chairs',u.chairs[1:_held(u)])
    else json_build_object('mine',false,'host',(select x.name from hosts x where x.key=u.host)) end
$$;
-- one invitation as its own host sees it
create or replace function _iv(i invitations) returns json language sql stable set search_path=public as $$
  select json_build_object('num',i.num,'token',i.token,'host',i.host,'grp',i.grp,'family',i.family,'own',i.own,'kids',i.kids,
    'name',i.name,'phone',i.phone,'status',_state(i),'table',i.table_num,'chairs',i.chairs[1:_held(i)],'seats',i.seats,'att',i.att,
    'created_at',i.created_at,'confirm_by',i.expires_at)
$$;

-- a table for an invitation of n seats from one host, when the host didn't choose one. First the host's own planned
-- chairs, the table where it fits most snugly first (the family table only when nothing else fits); then any other
-- table with room. Null when nothing fits: the overall view shows it as not seated yet
create or replace function _seat(p_host text, p_n int, p_skip uuid default null) returns int language sql stable set search_path=public as $$
  with held as (
    select table_num, host, sum(_held(i)) c from invitations i
    where table_num is not null and _holds(i) and grp is distinct from p_skip
    group by table_num, host
  ), tot as (select table_num, sum(c) c from held group by table_num)
  select coalesce(
    (select p.table_num from plan p
       join dinner_tables d on d.num=p.table_num
       left join held h on h.table_num=p.table_num and h.host=p.host
       left join tot t on t.table_num=p.table_num
     where p.host=p_host and p.chairs-coalesce(h.c,0)>=p_n and d.chairs-coalesce(t.c,0)>=p_n
     order by p.table_num=18, p.chairs-coalesce(h.c,0)-p_n, p.table_num limit 1),
    (select d.num from dinner_tables d left join tot t on t.table_num=d.num
     where d.num<>18 and d.chairs-coalesce(t.c,0)>=p_n
     order by d.chairs-coalesce(t.c,0)-p_n, d.num limit 1))
$$;

-- a fresh honoured-guest number nobody has had
create or replace function _fresh_num() returns int language plpgsql volatile set search_path=public as $$
declare n int;
begin
  loop
    n := 101 + floor(random()*899)::int;   -- 101 to 999
    exit when not exists (select 1 from invitations where num=n);
  end loop;
  return n;
end $$;

-- make one invitation of n seats for one host, at one table and seats
drop function if exists _make(text,int,boolean,int,timestamptz);
create or replace function _make(p_host text, p_n int, p_family boolean, p_table int, p_expires timestamptz,
  p_chairs int[] default null, p_name text default null, p_phone text default null) returns uuid language plpgsql volatile set search_path=public as $$
declare g uuid := gen_random_uuid();
begin
  loop
    begin
      insert into invitations(num,token,host,grp,pos,family,table_num,expires_at,seats,chairs,name,phone)
      values (_fresh_num(),_short_token(),p_host,g,0,p_family,p_table,p_expires,p_n,p_chairs,p_name,p_phone);
      exit;
    exception when unique_violation then
      null;   -- another invitation took that number or code at the same moment: draw again
    end;
  end loop;
  return g;
end $$;

revoke execute on function _token(), _short_token(), _holds(invitations), _held(invitations), _state(invitations), _phone(text),
  _taken(int,uuid), _pick(int,int,uuid,int), _bad_chairs(int,int[],uuid), _room(text,int,uuid), _left(hosts,uuid), _used(text,int),
  _usedjson(invitations,hosts), _iv(invitations), _seat(text,int,uuid), _fresh_num(), _make(text,int,boolean,int,timestamptz,int[],text,text)
  from public, anon, authenticated;

-- invitations made before seat numbers existed get them now, in the order they were made
do $$
declare r record;
begin
  for r in select i.num from invitations i where i.table_num is not null and i.chairs is null and _holds(i)
           order by i.table_num, i.family desc, array_position(array['mike','bea','mum','dad','joshua','isaac','benjamin'],i.host), i.created_at, i.pos, i.num loop
    update invitations x set chairs=_pick(x.table_num,_held(x),x.grp) where x.num=r.num;
  end loop;
end $$;

-- ---------- the guest: their own invitation, and Confirm (how many of the seats, for a household) ----------
create or replace function guest_get(p_token text) returns json language sql stable security definer set search_path=public as $$
  select json_build_object('num',i.num,'status',_state(i),'seats',i.seats,'att',i.att,'confirm_by',i.expires_at)
  from invitations i where i.token=p_token and i.status<>'cancelled'
$$;

-- a household that confirms fewer than its seats keeps the first of its seat numbers; the rest go back to the host
drop function if exists guest_confirm(text);
create or replace function guest_confirm(p_token text, p_count int default null) returns json language plpgsql security definer set search_path=public as $$
declare i invitations; v_att int;
begin
  select * into i from invitations where token=p_token and status<>'cancelled' for update;
  if not found then return json_build_object('error','not_found'); end if;
  if i.status='sent' and now()<=i.expires_at then
    v_att := least(i.seats,greatest(1,coalesce(p_count,i.seats)));
    update invitations set status='confirmed', confirmed_at=now(), att=v_att, chairs=i.chairs[1:v_att]
    where num=i.num returning * into i;
  end if;
  return json_build_object('num',i.num,'status',_state(i),'seats',i.seats,'att',i.att);
end $$;

-- ---------- a host: their page, Invite at a table, the phone check, Edit only, Reassign, Cancel ----------
create or replace function host_get(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
declare h hosts;
begin
  select * into h from hosts where token=p_token;
  if not found then return json_build_object('error','not_found'); end if;
  return json_build_object(
    'key',h.key,'name',h.name,'role',h.role,'seats',h.seats,
    'own',(select coalesce(json_agg(json_build_object('num',num,'token',token,'own',own,'kids',kids,'seats',seats) order by created_at),'[]'::json) from invitations where host=h.key and family and status<>'cancelled'),
    'confirmed',(select coalesce(sum(coalesce(att,seats)),0) from invitations i where host=h.key and not family and i.status='confirmed'),
    'waiting',(select coalesce(sum(seats),0) from invitations i where host=h.key and not family and i.status='sent' and now()<=i.expires_at));
end $$;

-- is this WhatsApp number free? Checked as the host types it, before they send
create or replace function host_phone(p_token text, p_phone text, p_skip int default null) returns json language plpgsql stable security definer set search_path=public as $$
declare h hosts; v text := _phone(p_phone); u invitations;
begin
  select * into h from hosts where token=p_token;
  if not found then return json_build_object('error','not_found'); end if;
  if v is null then return json_build_object('valid',false); end if;
  u := _used(v,p_skip);
  if u.num is null then return json_build_object('valid',true,'phone',v); end if;
  return json_build_object('valid',true,'phone',v,'used',_usedjson(u,h));
end $$;

-- a new invitation at the table and seats the host chose. Without a table (an older page), the best table is found
drop function if exists host_invite(text,int);
create or replace function host_invite(p_token text, p_count int default null, p_table int default null, p_chairs int[] default null,
  p_name text default null, p_phone text default null) returns json language plpgsql security definer set search_path=public as $$
declare h hosts; s settings; n int; t int; ch int[]; g uuid; v_exp timestamptz; v_phone text; u invitations; e text;
begin
  select * into h from hosts where token=p_token for update;   -- one invitation at a time per host
  if not found then return json_build_object('error','not_found'); end if;
  select * into s from settings;
  if now()>s.late_deadline then return json_build_object('error','closed'); end if;
  n := coalesce(cardinality(p_chairs),p_count);
  if n is null or n<1 or n>4 then return json_build_object('error','count'); end if;
  if _left(h,null)<n then return json_build_object('error','full','left',greatest(0,_left(h,null))); end if;
  if p_phone is not null then
    v_phone := _phone(p_phone);
    if v_phone is null then return json_build_object('error','phone'); end if;
    perform pg_advisory_xact_lock(hashtext(v_phone));
    u := _used(v_phone,null);
    if u.num is not null then return json_build_object('error','used','used',_usedjson(u,h)); end if;
  end if;
  if p_table is null then
    t := _seat(h.key,n);
    if t is not null then perform pg_advisory_xact_lock(4242,t); end if;
    ch := case when t is null then null else _pick(t,n) end;
  else
    t := p_table;
    perform pg_advisory_xact_lock(4242,t);   -- one change at a time per table: two hosts at a shared table can't take the same chair
    if _room(h.key,t,null)<n then return json_build_object('error','table','room',greatest(0,_room(h.key,t,null))); end if;
    if p_chairs is null then
      ch := _pick(t,n);
      if ch is null then return json_build_object('error','taken'); end if;
    else
      e := _bad_chairs(t,p_chairs,null);
      if e is not null then return json_build_object('error',e); end if;
      ch := p_chairs;
    end if;
  end if;
  v_exp := case when now()<=s.deadline then s.deadline else s.late_deadline end;
  g := _make(h.key,n,false,t,v_exp,ch,nullif(left(btrim(coalesce(p_name,'')),60),''),v_phone);
  return json_build_object('grp',g,'confirm_by',v_exp,'invitations',(select json_agg(_iv(i)) from invitations i where i.grp=g));
end $$;

-- Edit only: fix the name or number, or change the seats at the same table. Nothing is sent and the code stays.
-- Changing the seats after they confirmed: the new number counts as confirmed, because the host has spoken to them
create or replace function host_edit(p_token text, p_num int, p_name text, p_phone text, p_chairs int[] default null) returns json language plpgsql security definer set search_path=public as $$
declare h hosts; i invitations; v_phone text; u invitations; n int; e text;
begin
  select * into h from hosts where token=p_token for update;
  if not found then return json_build_object('error','not_found'); end if;
  select * into i from invitations where num=p_num and host=h.key and not family for update;
  if not found or not _holds(i) then return json_build_object('error','gone'); end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null then return json_build_object('error','name'); end if;
  v_phone := _phone(p_phone);
  if v_phone is null then return json_build_object('error','phone'); end if;
  perform pg_advisory_xact_lock(hashtext(v_phone));
  u := _used(v_phone,i.num);
  if u.num is not null then return json_build_object('error','used','used',_usedjson(u,h)); end if;
  if p_chairs is not null and p_chairs is distinct from i.chairs[1:_held(i)] then
    n := cardinality(p_chairs);
    if n<1 or n>4 then return json_build_object('error','count'); end if;
    if i.table_num is null then return json_build_object('error','table'); end if;
    perform pg_advisory_xact_lock(4242,i.table_num);
    if _left(h,i.grp)<n then return json_build_object('error','full'); end if;
    if _room(h.key,i.table_num,i.grp)<n then return json_build_object('error','table'); end if;
    e := _bad_chairs(i.table_num,p_chairs,i.grp);
    if e is not null then return json_build_object('error',e); end if;
    update invitations set chairs=p_chairs, seats=n, att=case when status='confirmed' then n else att end where num=i.num;
  end if;
  update invitations set name=left(btrim(p_name),60), phone=v_phone where num=i.num returning * into i;
  return _iv(i);
end $$;

-- Reassign: the seats go to someone else. Their invitation has a new number and link; the old ones stop working
create or replace function host_reassign(p_token text, p_num int, p_name text, p_phone text, p_chairs int[] default null) returns json language plpgsql security definer set search_path=public as $$
declare h hosts; s settings; i invitations; v_phone text; u invitations; n int; ch int[]; e text; g uuid; v_exp timestamptz;
begin
  select * into h from hosts where token=p_token for update;
  if not found then return json_build_object('error','not_found'); end if;
  select * into s from settings;
  if now()>s.late_deadline then return json_build_object('error','closed'); end if;
  select * into i from invitations where num=p_num and host=h.key and not family for update;
  if not found or not _holds(i) then return json_build_object('error','gone'); end if;
  if nullif(btrim(coalesce(p_name,'')),'') is null then return json_build_object('error','name'); end if;
  v_phone := _phone(p_phone);
  if v_phone is null then return json_build_object('error','phone'); end if;
  perform pg_advisory_xact_lock(hashtext(v_phone));
  u := _used(v_phone,i.num);
  if u.num is not null then return json_build_object('error','used','used',_usedjson(u,h)); end if;
  if i.table_num is null then return json_build_object('error','table'); end if;
  perform pg_advisory_xact_lock(4242,i.table_num);
  ch := coalesce(p_chairs,i.chairs[1:_held(i)]);
  n := cardinality(ch);
  if n is null or n<1 or n>4 then return json_build_object('error','count'); end if;
  if ch is distinct from i.chairs[1:_held(i)] then
    if _left(h,i.grp)<n then return json_build_object('error','full'); end if;
    if _room(h.key,i.table_num,i.grp)<n then return json_build_object('error','table'); end if;
    e := _bad_chairs(i.table_num,ch,i.grp);
    if e is not null then return json_build_object('error',e); end if;
  end if;
  update invitations set status='cancelled' where num=i.num;
  v_exp := case when now()<=s.deadline then s.deadline else s.late_deadline end;
  g := _make(h.key,n,false,i.table_num,v_exp,ch,left(btrim(p_name),60),v_phone);
  return json_build_object('grp',g,'confirm_by',v_exp,'replaced',i.num,'invitations',(select json_agg(_iv(x)) from invitations x where x.grp=g));
end $$;

-- Cancel: the invitation's code stops working and its seats are free again
create or replace function host_cancel(p_token text, p_num int) returns json language plpgsql security definer set search_path=public as $$
declare h hosts; n int;
begin
  select * into h from hosts where token=p_token;
  if not found then return json_build_object('error','not_found'); end if;
  update invitations set status='cancelled' where num=p_num and host=h.key and not family and status<>'cancelled';
  get diagnostics n = row_count;
  return json_build_object('cancelled',n);
end $$;

-- the older page's "Didn't send it?": cancels an invitation nobody has confirmed
create or replace function host_undo(p_token text, p_grp uuid) returns json language plpgsql security definer set search_path=public as $$
declare h hosts; n int;
begin
  select * into h from hosts where token=p_token;
  if not found then return json_build_object('error','not_found'); end if;
  if exists (select 1 from invitations where grp=p_grp and host=h.key and status='confirmed') then return json_build_object('error','confirmed'); end if;
  update invitations set status='cancelled' where grp=p_grp and host=h.key and status='sent' and not family;
  get diagnostics n = row_count;
  return json_build_object('cancelled',n);
end $$;

-- everything a host's page shows: their own guests in full, and the whole room, where other hosts' invitations show
-- only as seats and counts, never their numbers, names or phones
create or replace function host_overview(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
declare h hosts; s settings;
begin
  select * into h from hosts where token=p_token;
  if not found then return json_build_object('error','not_found'); end if;
  select * into s from settings;
  return json_build_object(
    'me',h.key,'deadline',s.deadline,'late_deadline',s.late_deadline,'at',now(),'left',_left(h,null),
    'hosts',(select json_agg(json_build_object('key',x.key,'name',x.name,'role',x.role,'seats',x.seats,
        'own',(select coalesce(sum(seats),0) from invitations i where i.host=x.key and i.family and i.status<>'cancelled'),
        'confirmed',(select coalesce(sum(coalesce(att,seats)),0) from invitations i where i.host=x.key and not i.family and i.status='confirmed'),
        'waiting',(select coalesce(sum(seats),0) from invitations i where i.host=x.key and not i.family and i.status='sent' and now()<=i.expires_at))
      order by array_position(array['mike','bea','mum','dad','joshua','isaac','benjamin'],x.key)) from hosts x),
    'tables',(select json_agg(json_build_object('num',num,'name',name,'chairs',chairs) order by num) from dinner_tables),
    'plan',(select json_agg(json_build_object('table',table_num,'host',host,'chairs',chairs)) from plan),
    'invitations',(select coalesce(json_agg(case when i.host=h.key then _iv(i) else json_build_object('num',null,'host',i.host,'grp',i.grp,
        'family',i.family,'own',i.own,'kids',0,'status',_state(i),'table',i.table_num,'chairs',i.chairs[1:_held(i)],'seats',i.seats,'att',i.att) end
        order by i.table_num, i.created_at),'[]'::json) from invitations i where _holds(i)),
    'today',(select coalesce(sum(coalesce(att,seats)),0) from invitations i where i.status='confirmed' and not i.family and i.confirmed_at>=date_trunc('day',now())),
    'last',(select max(confirmed_at) from invitations i where i.status='confirmed' and not i.family));
end $$;

-- ---------- the gate: the whole list (kept on the phone for no-signal moments) and Let in ----------
create or replace function gate_list(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
begin
  if not exists (select 1 from settings where gate_token=p_token) then return json_build_object('error','not_found'); end if;
  return json_build_object(
    'hosts',(select json_object_agg(key,json_build_object('name',name,'role',role,'phone',phone) order by array_position(array['mike','bea','mum','dad','joshua','isaac','benjamin'],key)) from hosts),
    'tables',(select json_object_agg(num,name) from dinner_tables),
    'invitations',(select coalesce(json_agg(json_build_object('num',i.num,'host',i.host,'grp',i.grp,'family',i.family,'own',i.own,'kids',i.kids,
        'name',i.name,'status',_state(i),'table',i.table_num,'chairs',i.chairs[1:_held(i)],'seats',i.seats,'att',i.att,'arrived',i.arrived,'arrived_at',i.arrived_at)),'[]'::json)
      from invitations i where i.status<>'cancelled'),
    'at',now());
end $$;

-- let in n people on one number, never more than it confirmed. p_at: when the attendant tapped Let in, for admissions
-- saved on the phone while there was no signal. p_id: that admission's id from the phone, so sending it twice counts once
drop function if exists gate_admit(text,int[],timestamptz);
drop function if exists gate_admit(text,int,int,timestamptz);
create or replace function gate_admit(p_token text, p_num int, p_n int, p_at timestamptz default null, p_id text default null) returns json language plpgsql security definer set search_path=public as $$
declare i invitations;
begin
  if not exists (select 1 from settings where gate_token=p_token) then return json_build_object('error','not_found'); end if;
  update invitations set arrived=least(coalesce(att,seats),arrived+greatest(1,coalesce(p_n,1))),
    arrived_at=greatest(arrived_at,least(coalesce(p_at,now()),now())),
    admits=case when p_id is null then admits else array_append(admits,p_id) end
  where num=p_num and status='confirmed' and arrived<coalesce(att,seats) and (p_id is null or not p_id=any(admits))
  returning * into i;
  if not found then select * into i from invitations where num=p_num; end if;
  return json_build_object('num',i.num,'att',coalesce(i.att,i.seats),'arrived',i.arrived,'arrived_at',i.arrived_at);
end $$;

-- ---------- the overall view: everything, the hosts' links, and moving an invitation ----------
create or replace function admin_get(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
declare s settings;
begin
  select * into s from settings;
  if s.admin_token is distinct from p_token then return json_build_object('error','not_found'); end if;
  return json_build_object(
    'deadline',s.deadline,'gate_token',s.gate_token,
    'hosts',(select json_agg(json_build_object('key',key,'name',name,'role',role,'seats',seats,'token',token,'phone',phone) order by array_position(array['mike','bea','mum','dad','joshua','isaac','benjamin'],key)) from hosts),
    'tables',(select json_agg(json_build_object('num',num,'name',name,'chairs',chairs) order by num) from dinner_tables),
    'plan',(select json_agg(json_build_object('table',table_num,'host',host,'chairs',chairs) order by table_num, host) from plan),
    'invitations',(select coalesce(json_agg(json_build_object('num',i.num,'host',i.host,'grp',i.grp,'family',i.family,'own',i.own,'kids',i.kids,
        'name',i.name,'phone',i.phone,'status',_state(i),'table',i.table_num,'chairs',i.chairs[1:_held(i)],'seats',i.seats,'att',i.att,'arrived',i.arrived,
        'created_at',i.created_at,'confirmed_at',i.confirmed_at,'arrived_at',i.arrived_at)
        order by i.table_num, i.created_at),'[]'::json)
      from invitations i where i.status<>'cancelled'));
end $$;

-- move an invitation to another table: the seats it holds, side by side where the table allows
drop function if exists admin_move(text,uuid,int);
create or replace function admin_move(p_token text, p_grp uuid, p_table int, p_chairs int[] default null) returns json language plpgsql security definer set search_path=public as $$
declare n int; ch int[]; e text;
begin
  if not exists (select 1 from settings where admin_token=p_token) then return json_build_object('error','not_found'); end if;
  select coalesce(sum(_held(i)),0) into n from invitations i where grp=p_grp and _holds(i);
  if n=0 then return json_build_object('error','not_found'); end if;
  if not exists (select 1 from dinner_tables where num=p_table) then return json_build_object('error','table'); end if;
  perform pg_advisory_xact_lock(4242,p_table);
  if p_chairs is null then
    ch := _pick(p_table,n,p_grp);
    if ch is null then return json_build_object('error','full','free',(select d.chairs from dinner_tables d where d.num=p_table)-cardinality(_taken(p_table,p_grp))); end if;
  else
    e := coalesce(_bad_chairs(p_table,p_chairs,p_grp),case when cardinality(p_chairs)<>n then 'count' end);
    if e is not null then return json_build_object('error',e); end if;
    ch := p_chairs;
  end if;
  update invitations set table_num=p_table, chairs=ch where grp=p_grp and status<>'cancelled';
  return json_build_object('moved',n,'table',p_table,'chairs',ch);
end $$;

-- the web may call these, and only these. They run as the database owner (security definer) on purpose: the tables
-- themselves stay closed, and each function checks the code in the link before it reads or changes anything
revoke execute on function guest_get(text), guest_confirm(text,int), host_get(text), host_phone(text,text,int),
  host_invite(text,int,int,int[],text,text), host_edit(text,int,text,text,int[]), host_reassign(text,int,text,text,int[]), host_cancel(text,int),
  host_undo(text,uuid), host_overview(text), gate_list(text), gate_admit(text,int,int,timestamptz,text), admin_get(text), admin_move(text,uuid,int,int[]) from public;
grant execute on function guest_get(text), guest_confirm(text,int), host_get(text), host_phone(text,text,int),
  host_invite(text,int,int,int[],text,text), host_edit(text,int,text,text,int[]), host_reassign(text,int,text,text,int[]), host_cancel(text,int),
  host_undo(text,uuid), host_overview(text), gate_list(text), gate_admit(text,int,int,timestamptz,text), admin_get(text), admin_move(text,uuid,int,int[]) to anon, authenticated;

-- ---------- the people, the room and the family table (only added once) ----------
insert into settings(admin_token,gate_token) select _token(),_token() where not exists (select 1 from settings);

insert into hosts(key,name,role,seats,token) values
  ('mike','Michael',null,43,_token()),
  ('bea','Beatrice',null,37,_token()),
  ('mum','Juliana','Mum',20,_token()),
  ('dad','Samuel','Dad',20,_token()),
  ('joshua','Joshua',null,20,_token()),
  ('isaac','Isaac',null,20,_token()),
  ('benjamin','Benjamin',null,20,_token())
on conflict (key) do nothing;

insert into dinner_tables(num,name) values
  (1,'Rose'),(2,'Lily'),(3,'Jasmine'),(4,'Orchid'),(5,'Hibiscus'),(6,'Frangipani'),(7,'Bougainvillea'),(8,'Magnolia'),(9,'Gardenia'),(10,'Camellia'),
  (11,'Lavender'),(12,'Peony'),(13,'Tulip'),(14,'Dahlia'),(15,'Iris'),(16,'Daisy'),(17,'Violet'),(18,'Sunflower'),(19,'Azalea'),(20,'Freesia')
on conflict (num) do nothing;

-- 180 chairs: Michael 43, Beatrice 37, and 20 each for Juliana, Samuel, Joshua, Isaac and Benjamin. Table 7 is shared
-- (Michael 7, Beatrice 1, Benjamin 1); table 18 is the family table, with one guest chair each for Juliana and Samuel
insert into plan(table_num,host,chairs) values
  (1,'joshua',9),(2,'joshua',9),(3,'isaac',9),(4,'isaac',9),(5,'benjamin',9),(6,'benjamin',9),
  (7,'benjamin',1),(7,'mike',7),(7,'bea',1),
  (8,'bea',9),(9,'bea',9),(10,'mike',9),(11,'mike',9),(12,'bea',9),(13,'bea',9),(14,'mike',9),(15,'mike',9),
  (16,'dad',9),(17,'mum',9),
  (18,'mum',2),(18,'dad',2),(18,'joshua',2),(18,'isaac',2),(18,'benjamin',1),
  (19,'dad',9),(20,'mum',9)
on conflict (table_num,host) do nothing;

-- the family hosts' own invitations at the family table, confirmed from the start. Joshua and Isaac come with their
-- wives on one number each; Joshua's four children come in with him, Michael's three with Isaac's wife
do $$
declare g uuid; s settings;
begin
  select * into s from settings;
  if not exists (select 1 from invitations where family) then
    g := _make('mum',1,true,18,s.deadline,_pick(18,1));
    g := _make('dad',1,true,18,s.deadline,_pick(18,1));
    g := _make('joshua',2,true,18,s.deadline,_pick(18,2));
    update invitations set kids=4 where grp=g;
    g := _make('isaac',2,true,18,s.deadline,_pick(18,2));
    update invitations set kids=3 where grp=g;
    g := _make('benjamin',1,true,18,s.deadline,_pick(18,1));
    update invitations set own='you' where family and own is null;
    update invitations set status='confirmed', confirmed_at=now(), att=seats where family and status='sent';
  end if;
end $$;

-- Michael's overall view: open this link and keep it to yourself. Each host's link, and the gate's, are inside it
select 'https://mashiteye.github.io/mibea26-dinner/admin.html?k='||admin_token as your_overall_view_link from settings;
