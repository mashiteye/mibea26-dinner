-- Dinner Night · honoured-guest invitations
-- Run in the Supabase SQL editor. It is safe to run again: it keeps existing data, and it brings an older setup up to date.
--
-- What is stored: invitation numbers, how many seats each is for, which host made it, its answer, its table and how
-- many have come in. No names. The hosts' phone numbers (for the gate's Call button) are added privately, never here.
-- Nobody reads the tables directly. Guests, hosts, the gate and the overall view go through the functions below,
-- and each function checks the secret code in that person's link.

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

-- one row per invitation: one honoured-guest number, for one to four seats (a person, a couple, a family)
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
create index if not exists invitations_host on invitations(host);
create index if not exists invitations_grp on invitations(grp);
create index if not exists invitations_table on invitations(table_num);

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

-- a table for an invitation of n seats from one host. First the host's own planned chairs, the table where it fits most
-- snugly first so chairs aren't stranded (the host's chair at the family table only when nothing else fits); then any
-- other table with room, again the snuggest first. Null when nothing fits: the overall view shows it as not seated yet
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

-- make one invitation of n seats for one host, at one table
create or replace function _make(p_host text, p_n int, p_family boolean, p_table int, p_expires timestamptz) returns uuid language plpgsql volatile set search_path=public as $$
declare g uuid := gen_random_uuid();
begin
  loop
    begin
      insert into invitations(num,token,host,grp,pos,family,table_num,expires_at,seats)
      values (_fresh_num(),_short_token(),p_host,g,0,p_family,p_table,p_expires,p_n);
      exit;
    exception when unique_violation then
      null;   -- another invitation took that number or code at the same moment: draw again
    end;
  end loop;
  return g;
end $$;

revoke execute on function _token(), _short_token(), _holds(invitations), _held(invitations), _state(invitations), _seat(text,int,uuid), _fresh_num(), _make(text,int,boolean,int,timestamptz) from public, anon, authenticated;

-- ---------- the guest: their own invitation, and Confirm (how many of the seats, for a household) ----------
create or replace function guest_get(p_token text) returns json language sql stable security definer set search_path=public as $$
  select json_build_object('num',i.num,'status',_state(i),'seats',i.seats,'att',i.att,'confirm_by',i.expires_at)
  from invitations i where i.token=p_token and i.status<>'cancelled'
$$;

drop function if exists guest_confirm(text);
create or replace function guest_confirm(p_token text, p_count int default null) returns json language plpgsql security definer set search_path=public as $$
declare i invitations;
begin
  select * into i from invitations where token=p_token and status<>'cancelled' for update;
  if not found then return json_build_object('error','not_found'); end if;
  if i.status='sent' and now()<=i.expires_at then
    update invitations set status='confirmed', confirmed_at=now(), att=least(i.seats,greatest(1,coalesce(p_count,i.seats)))
    where num=i.num returning * into i;
  end if;
  return json_build_object('num',i.num,'status',_state(i),'seats',i.seats,'att',i.att);
end $$;

-- ---------- a host: their counts (people, not invitations), Invite and Undo ----------
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

create or replace function host_invite(p_token text, p_count int) returns json language plpgsql security definer set search_path=public as $$
declare h hosts; s settings; held int; own_n int; g uuid; t int; v_exp timestamptz;
begin
  if p_count is null or p_count<1 or p_count>4 then return json_build_object('error','count'); end if;
  select * into h from hosts where token=p_token for update;   -- one invitation at a time per host
  if not found then return json_build_object('error','not_found'); end if;
  select * into s from settings;
  if now()>s.late_deadline then return json_build_object('error','closed'); end if;
  select coalesce(sum(seats),0) into own_n from invitations where host=h.key and family and status<>'cancelled';
  select coalesce(sum(_held(i)),0) into held from invitations i where host=h.key and not family;
  if held+p_count>h.seats-own_n then return json_build_object('error','full','left',greatest(0,h.seats-own_n-held)); end if;
  v_exp := case when now()<=s.deadline then s.deadline else s.late_deadline end;
  t := _seat(h.key,p_count);
  g := _make(h.key,p_count,false,t,v_exp);
  return json_build_object('grp',g,'confirm_by',v_exp,
    'invitations',(select json_agg(json_build_object('num',num,'token',token,'seats',seats)) from invitations where grp=g));
end $$;

-- "Didn't send it?": cancels an invitation nobody has confirmed
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

-- what every host sees besides their own page: the room, and everyone's numbers. Other hosts' invitations show only
-- as chairs and counts, never their honoured-guest numbers
create or replace function host_overview(p_token text) returns json language plpgsql stable security definer set search_path=public as $$
declare h hosts; s settings;
begin
  select * into h from hosts where token=p_token;
  if not found then return json_build_object('error','not_found'); end if;
  select * into s from settings;
  return json_build_object(
    'me',h.key,'deadline',s.deadline,'at',now(),
    'hosts',(select json_agg(json_build_object('key',x.key,'name',x.name,'role',x.role,'seats',x.seats,
        'own',(select coalesce(sum(seats),0) from invitations i where i.host=x.key and i.family and i.status<>'cancelled'),
        'confirmed',(select coalesce(sum(coalesce(att,seats)),0) from invitations i where i.host=x.key and not i.family and i.status='confirmed'),
        'waiting',(select coalesce(sum(seats),0) from invitations i where i.host=x.key and not i.family and i.status='sent' and now()<=i.expires_at))
      order by array_position(array['mike','bea','mum','dad','joshua','isaac','benjamin'],x.key)) from hosts x),
    'tables',(select json_agg(json_build_object('num',num,'name',name,'chairs',chairs) order by num) from dinner_tables),
    'plan',(select json_agg(json_build_object('table',table_num,'host',host,'chairs',chairs)) from plan),
    'invitations',(select coalesce(json_agg(json_build_object('num',case when i.host=h.key then i.num end,'host',i.host,'grp',i.grp,
        'family',i.family,'own',i.own,'kids',case when i.host=h.key then i.kids else 0 end,'status',_state(i),'table',i.table_num,
        'seats',i.seats,'att',i.att) order by i.table_num, i.created_at),'[]'::json) from invitations i where _holds(i)),
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
        'status',_state(i),'table',i.table_num,'seats',i.seats,'att',i.att,'arrived',i.arrived,'arrived_at',i.arrived_at)),'[]'::json)
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
        'status',_state(i),'table',i.table_num,'seats',i.seats,'att',i.att,'arrived',i.arrived,'created_at',i.created_at,'confirmed_at',i.confirmed_at,'arrived_at',i.arrived_at)
        order by i.table_num, i.created_at),'[]'::json)
      from invitations i where i.status<>'cancelled'));
end $$;

create or replace function admin_move(p_token text, p_grp uuid, p_table int) returns json language plpgsql security definer set search_path=public as $$
declare n int; free int;
begin
  if not exists (select 1 from settings where admin_token=p_token) then return json_build_object('error','not_found'); end if;
  select coalesce(sum(_held(i)),0) into n from invitations i where grp=p_grp and _holds(i);
  if n=0 then return json_build_object('error','not_found'); end if;
  select d.chairs-(select coalesce(sum(_held(i)),0) from invitations i where i.table_num=d.num and _holds(i) and i.grp<>p_grp) into free from dinner_tables d where d.num=p_table;
  if free is null then return json_build_object('error','table'); end if;
  if free<n then return json_build_object('error','full','free',free); end if;
  update invitations set table_num=p_table where grp=p_grp and status<>'cancelled';
  return json_build_object('moved',n,'table',p_table);
end $$;

-- the web may call these, and only these. They run as the database owner (security definer) on purpose: the tables
-- themselves stay closed, and each function checks the code in the link before it reads or changes anything
revoke execute on function guest_get(text), guest_confirm(text,int), host_get(text), host_invite(text,int), host_undo(text,uuid), host_overview(text),
  gate_list(text), gate_admit(text,int,int,timestamptz,text), admin_get(text), admin_move(text,uuid,int) from public;
grant execute on function guest_get(text), guest_confirm(text,int), host_get(text), host_invite(text,int), host_undo(text,uuid), host_overview(text),
  gate_list(text), gate_admit(text,int,int,timestamptz,text), admin_get(text), admin_move(text,uuid,int) to anon, authenticated;

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
    g := _make('mum',1,true,18,s.deadline);
    g := _make('dad',1,true,18,s.deadline);
    g := _make('joshua',2,true,18,s.deadline);
    update invitations set kids=4 where grp=g;
    g := _make('isaac',2,true,18,s.deadline);
    update invitations set kids=3 where grp=g;
    g := _make('benjamin',1,true,18,s.deadline);
    update invitations set own='you' where family and own is null;
    update invitations set status='confirmed', confirmed_at=now(), att=seats where family and status='sent';
  end if;
end $$;

-- Michael's overall view: open this link and keep it to yourself. Each host's link, and the gate's, are inside it
select 'https://mashiteye.github.io/mibea26-dinner/admin.html?k='||admin_token as your_overall_view_link from settings;
