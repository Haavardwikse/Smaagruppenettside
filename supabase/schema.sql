-- =====================================================================
--  Smågrupper – Bergen Frikirke
--  Databaseoppsett for Supabase.
--  Kjør hele filen i Supabase: SQL Editor → New query → Run.
--  Filen kan trygt kjøres på nytt (f.eks. etter en oppdatering).
--  Eksisterende data blir liggende.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabeller
-- ---------------------------------------------------------------------

-- Smågruppene
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 300),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Brukerkontoer for ledere, nestledere og administratorer.
-- Opprettes automatisk når noen får en konto (se trigger under).
-- role: 'admin' ser og styrer alt. 'bruker' ser bare gruppene de leder.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'bruker' check (role in ('admin', 'bruker')),
  phone      text check (phone ~ '^\+?[0-9]{8,15}$'),
  created_at timestamptz not null default now()
);

-- Hvem som leder hvilke grupper
create table if not exists public.group_leaders (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'leder' check (role in ('leder', 'nestleder')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Deltakerne. Fødselsår, postnummer og sted er påkrevd i det offentlige
-- skjemaet, men en leder kan legge til en deltaker med bare navn.
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete restrict,
  full_name   text not null check (char_length(trim(full_name)) between 2 and 100),
  birth_year  int  check (birth_year between 1900 and 2100),
  postal_code text check (postal_code ~ '^[0-9]{4}$'),
  city        text check (char_length(trim(city)) between 2 and 60),
  consent     boolean not null check (consent = true),
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Oppgradering fra tidligere versjoner
alter table public.members add column if not exists archived_at timestamptz;
alter table public.profiles add column if not exists phone text check (phone ~ '^\+?[0-9]{8,15}$');
-- Hvilken deltaker en leder/nestleder er (hvis de også står på deltakerlisten)
alter table public.group_leaders add column if not exists member_id uuid references public.members(id) on delete set null;
alter table public.members alter column birth_year  drop not null;
alter table public.members alter column postal_code drop not null;
alter table public.members alter column city        drop not null;

-- Samlinger (én per gruppe per dato) og hvem som var til stede
create table if not exists public.meetings (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  meeting_date date not null,
  created_at   timestamptz not null default now(),
  unique (group_id, meeting_date)
);

create table if not exists public.attendance (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  primary key (meeting_id, member_id)
);

-- Invitasjonslenker for nye ledere. Koden er hemmeligheten:
-- bare den som har lenken kan bli leder for gruppen.
create table if not exists public.group_invites (
  code       text primary key,
  group_id   uuid not null references public.groups(id) on delete cascade,
  role       text not null default 'leder' check (role in ('leder', 'nestleder')),
  name       text,
  email      text,
  phone      text check (phone ~ '^\+?[0-9]{8,15}$'),
  member_id  uuid references public.members(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_by    uuid references public.profiles(id) on delete set null,
  used_at    timestamptz
);

alter table public.group_invites add column if not exists email text;
alter table public.group_invites add column if not exists phone text check (phone ~ '^\+?[0-9]{8,15}$');
alter table public.group_invites add column if not exists member_id uuid references public.members(id) on delete set null;

-- Triader: tre smågruppeledere som støtter hverandre. Settes sammen av admin.
create table if not exists public.triads (
  id         uuid primary key default gen_random_uuid(),
  name       text check (char_length(name) <= 60),
  created_at timestamptz not null default now()
);

create table if not exists public.triad_members (
  triad_id uuid not null references public.triads(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  primary key (triad_id, user_id),
  unique (user_id)  -- en leder er bare i én triade
);

create index if not exists members_group_id_idx       on public.members(group_id);
create index if not exists group_leaders_user_id_idx  on public.group_leaders(user_id);
create index if not exists meetings_group_id_idx      on public.meetings(group_id);
create index if not exists attendance_member_id_idx   on public.attendance(member_id);
create index if not exists group_invites_group_id_idx on public.group_invites(group_id);

-- ---------------------------------------------------------------------
-- 2. Hjelpefunksjoner for tilgang
-- ---------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.leads_group(gid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_leaders
    where group_id = gid and user_id = auth.uid()
  );
$$;

-- Er denne brukeren i samme triade som meg?
create or replace function public.in_my_triad(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.triad_members a
    join public.triad_members b on a.triad_id = b.triad_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- Gruppene heter det samme som lederen. Navnet holdes oppdatert automatisk.
-- Uten leder brukes navnet fra en ventende lederinvitasjon, ellers beholdes navnet.
create or replace function public.refresh_group_name(p_group uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  select string_agg(coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)), ' og ' order by gl.created_at)
  into v_name
  from public.group_leaders gl join public.profiles p on p.id = gl.user_id
  where gl.group_id = p_group and gl.role = 'leder';

  if v_name is null then
    select i.name into v_name from public.group_invites i
    where i.group_id = p_group and i.role = 'leder' and i.used_at is null and i.name is not null
    order by i.created_at limit 1;
  end if;

  v_name := left(trim(v_name), 80);
  if char_length(v_name) >= 2 then
    update public.groups set name = v_name where id = p_group and name is distinct from v_name;
  end if;
end;
$$;

create or replace function public.trg_leaders_name()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform public.refresh_group_name(old.group_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform public.refresh_group_name(new.group_id); end if;
  return null;
end;
$$;

create or replace function public.trg_profile_name()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.refresh_group_name(gl.group_id)
  from public.group_leaders gl where gl.user_id = new.id and gl.role = 'leder';
  return null;
end;
$$;

-- Lag en profil automatisk når en ny bruker opprettes
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Hindrer at noen andre enn en admin endrer rolle (også ens egen).
-- Endringer fra SQL Editor (rollen postgres) er alltid lov.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql security invoker set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and current_user in ('anon', 'authenticated')
     and not public.is_admin() then
    raise exception 'Bare administratorer kan endre roller';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

drop trigger if exists group_name_from_leaders on public.group_leaders;
create trigger group_name_from_leaders
  after insert or update or delete on public.group_leaders
  for each row execute function public.trg_leaders_name();

drop trigger if exists group_name_from_invites on public.group_invites;
create trigger group_name_from_invites
  after insert or update or delete on public.group_invites
  for each row execute function public.trg_leaders_name();

drop trigger if exists group_name_from_profile on public.profiles;
create trigger group_name_from_profile
  after update of full_name on public.profiles
  for each row execute function public.trg_profile_name();

-- Maks tre ledere i en triade
create or replace function public.limit_triad_size()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.triad_members where triad_id = new.triad_id) >= 3 then
    raise exception 'En triade kan ha maks tre ledere';
  end if;
  return new;
end;
$$;

drop trigger if exists limit_triad_size on public.triad_members;
create trigger limit_triad_size
  before insert on public.triad_members
  for each row execute function public.limit_triad_size();

-- ---------------------------------------------------------------------
-- 3. Handlinger (funksjoner nettsiden kaller)
-- ---------------------------------------------------------------------

-- Lagre oppmøte for en samling. Lager samlingen hvis den ikke finnes,
-- og erstatter listen over hvem som var til stede.
create or replace function public.save_attendance(p_group uuid, p_date date, p_member_ids uuid[])
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not (public.is_admin() or public.leads_group(p_group)) then
    raise exception 'Du har ikke tilgang til denne gruppen';
  end if;
  if p_date is null or p_date > current_date + 1 then
    raise exception 'Ugyldig dato';
  end if;

  insert into public.meetings (group_id, meeting_date) values (p_group, p_date)
  on conflict (group_id, meeting_date) do update set meeting_date = excluded.meeting_date
  returning id into v_id;

  delete from public.attendance where meeting_id = v_id;
  insert into public.attendance (meeting_id, member_id)
  select v_id, m.id from public.members m
  where m.group_id = p_group and m.id = any(coalesce(p_member_ids, '{}'));

  return v_id;
end;
$$;

-- Lag en invitasjonslenke til en gruppe (f.eks. for å velge nestleder)
drop function if exists public.create_invite(uuid, text, text);
create or replace function public.create_invite(
  p_group     uuid,
  p_role      text default 'leder',
  p_name      text default null,
  p_email     text default null,
  p_phone     text default null,
  p_member_id uuid default null
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_code text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null or not (public.is_admin() or public.leads_group(p_group)) then
    raise exception 'Du har ikke tilgang til denne gruppen';
  end if;
  if p_role not in ('leder', 'nestleder') then
    raise exception 'Ugyldig rolle';
  end if;
  if p_email is not null and p_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Ugyldig e-postadresse';
  end if;
  if p_member_id is not null and not exists (
    select 1 from public.members where id = p_member_id and group_id = p_group) then
    raise exception 'Personen er ikke med i denne gruppen';
  end if;
  insert into public.group_invites (code, group_id, role, name, email, phone, member_id, created_by)
  values (v_code, p_group, p_role, nullif(trim(p_name), ''), nullif(lower(trim(p_email)), ''),
          nullif(p_phone, ''), p_member_id, auth.uid());
  return v_code;
end;
$$;

-- Vis hvilken gruppe en invitasjon gjelder (før man logger inn)
drop function if exists public.invite_info(text);
create or replace function public.invite_info(p_code text)
returns table (group_name text, role text, name text, email text)
language sql stable security definer set search_path = public
as $$
  select g.name, i.role, i.name, i.email
  from public.group_invites i
  join public.groups g on g.id = i.group_id
  where i.code = p_code and i.used_at is null and i.expires_at > now();
$$;

-- Godta en invitasjon: den innloggede brukeren blir leder for gruppen
create or replace function public.accept_invite(p_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v public.group_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Du må være logget inn';
  end if;
  select * into v from public.group_invites where code = p_code for update;
  if not found or v.used_at is not null or v.expires_at < now() then
    raise exception 'Invitasjonen er ugyldig, utløpt eller allerede brukt';
  end if;

  insert into public.group_leaders (group_id, user_id, role, member_id)
  values (v.group_id, auth.uid(), v.role, v.member_id)
  on conflict (group_id, user_id) do update
    set role = excluded.role,
        member_id = coalesce(excluded.member_id, public.group_leaders.member_id);

  update public.group_invites set used_by = auth.uid(), used_at = now() where code = p_code;
  update public.profiles
  set full_name = case when coalesce(full_name, '') = '' then coalesce(v.name, full_name) else full_name end,
      phone     = coalesce(phone, v.phone)
  where id = auth.uid();

  return v.group_id;
end;
$$;

-- Fjern en nestleder fra gruppen (ledere og admin)
create or replace function public.remove_coleader(p_group uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not (public.is_admin() or public.leads_group(p_group)) then
    raise exception 'Du har ikke tilgang til denne gruppen';
  end if;
  delete from public.group_leaders
  where group_id = p_group and user_id = p_user and role = 'nestleder';
  if not found then
    raise exception 'Fant ingen nestleder å fjerne';
  end if;
end;
$$;

-- Multipliser: lag en ny gruppe, flytt valgte deltakere dit, og gi den
-- nye gruppen en leder (en nestleder i gruppen i dag, eller en invitasjon).
-- Den nye gruppen får navnet til den nye lederen.
drop function if exists public.split_group(uuid, text, uuid[], uuid, boolean, text);
create or replace function public.split_group(
  p_source       uuid,
  p_member_ids   uuid[],
  p_leader_user  uuid default null,
  p_move_leader  boolean default true,
  p_invite_name  text default null,
  p_invite_email text default null,
  p_invite_phone text default null
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_new   uuid;
  v_code  text;
  v_moved int;
  v_name  text;
begin
  if auth.uid() is null or not (public.is_admin() or public.leads_group(p_source)) then
    raise exception 'Du har ikke tilgang til denne gruppen';
  end if;

  if p_leader_user is not null then
    if not (public.is_admin() or exists (
      select 1 from public.group_leaders where group_id = p_source and user_id = p_leader_user)) then
      raise exception 'Den nye lederen må være leder eller nestleder i gruppen i dag';
    end if;
    select coalesce(nullif(trim(full_name), ''), split_part(email, '@', 1)) into v_name
    from public.profiles where id = p_leader_user;
  else
    v_name := trim(coalesce(p_invite_name, ''));
    if char_length(v_name) < 2 then
      raise exception 'Skriv navnet på den nye lederen';
    end if;
    if p_invite_email is not null and p_invite_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'Ugyldig e-postadresse';
    end if;
  end if;

  insert into public.groups (name) values (left(v_name, 80)) returning id into v_new;

  update public.members set group_id = v_new
  where group_id = p_source and archived_at is null
    and id = any(coalesce(p_member_ids, '{}'));
  get diagnostics v_moved = row_count;

  if p_leader_user is not null then
    insert into public.group_leaders (group_id, user_id, role) values (v_new, p_leader_user, 'leder');
    if p_move_leader then
      delete from public.group_leaders where group_id = p_source and user_id = p_leader_user;
    end if;
  else
    v_code := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.group_invites (code, group_id, role, name, email, phone, created_by)
    values (v_code, v_new, 'leder', v_name, nullif(lower(trim(p_invite_email)), ''), nullif(p_invite_phone, ''), auth.uid());
  end if;

  return json_build_object('group_id', v_new, 'invite_code', v_code, 'moved', v_moved, 'name', v_name);
end;
$$;

-- Ny gruppe (admin): med en eksisterende bruker eller en invitert leder
create or replace function public.create_group(
  p_description  text default null,
  p_leader_user  uuid default null,
  p_invite_name  text default null,
  p_invite_email text default null,
  p_invite_phone text default null
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_new  uuid;
  v_code text;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Bare administratorer kan lage nye grupper';
  end if;
  if p_leader_user is not null then
    select coalesce(nullif(trim(full_name), ''), split_part(email, '@', 1)) into v_name
    from public.profiles where id = p_leader_user;
    if v_name is null then raise exception 'Fant ikke brukeren'; end if;
  else
    v_name := trim(coalesce(p_invite_name, ''));
    if char_length(v_name) < 2 then raise exception 'Skriv navnet på lederen'; end if;
    if p_invite_email is not null and p_invite_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'Ugyldig e-postadresse';
    end if;
  end if;

  insert into public.groups (name, description)
  values (left(v_name, 80), nullif(trim(p_description), ''))
  returning id into v_new;

  if p_leader_user is not null then
    insert into public.group_leaders (group_id, user_id, role) values (v_new, p_leader_user, 'leder');
  else
    v_code := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.group_invites (code, group_id, role, name, email, phone, created_by)
    values (v_code, v_new, 'leder', v_name, nullif(lower(trim(p_invite_email)), ''), nullif(p_invite_phone, ''), auth.uid());
  end if;
  return json_build_object('group_id', v_new, 'invite_code', v_code, 'name', v_name);
end;
$$;

-- Lagre en triade (admin). p_id null = ny triade. Erstatter medlemmene.
create or replace function public.save_triad(p_id uuid, p_name text, p_members uuid[])
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid := p_id;
begin
  if not public.is_admin() then
    raise exception 'Bare administratorer kan sette sammen triader';
  end if;
  if coalesce(array_length(p_members, 1), 0) < 2 then
    raise exception 'En triade må ha minst to ledere';
  end if;
  if v_id is null then
    insert into public.triads (name) values (nullif(trim(p_name), '')) returning id into v_id;
  else
    update public.triads set name = nullif(trim(p_name), '') where id = v_id;
    delete from public.triad_members where triad_id = v_id;
  end if;
  -- En leder kan bare være i én triade: flytt fra eventuell gammel triade
  delete from public.triad_members where user_id = any(p_members);
  insert into public.triad_members (triad_id, user_id)
  select v_id, u from unnest(p_members) as u;
  -- Rydd bort triader som ble tomme
  delete from public.triads t where not exists (select 1 from public.triad_members m where m.triad_id = t.id);
  return v_id;
end;
$$;

-- Hvem kan kalle funksjonene
revoke all on function public.is_admin()                              from public;
revoke all on function public.leads_group(uuid)                       from public;
revoke all on function public.save_attendance(uuid, date, uuid[])     from public;
revoke all on function public.create_invite(uuid, text, text, text, text, uuid) from public;
revoke all on function public.remove_coleader(uuid, uuid)              from public;
revoke all on function public.invite_info(text)                       from public;
revoke all on function public.accept_invite(text)                     from public;
revoke all on function public.split_group(uuid, uuid[], uuid, boolean, text, text, text) from public;
revoke all on function public.create_group(text, uuid, text, text, text) from public;
revoke all on function public.save_triad(uuid, text, uuid[])          from public;
revoke all on function public.in_my_triad(uuid)                       from public;
revoke all on function public.refresh_group_name(uuid)                from public;

grant execute on function public.is_admin()                           to anon, authenticated;
grant execute on function public.leads_group(uuid)                    to anon, authenticated;
grant execute on function public.invite_info(text)                    to anon, authenticated;
grant execute on function public.save_attendance(uuid, date, uuid[])  to authenticated;
grant execute on function public.create_invite(uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.remove_coleader(uuid, uuid)           to authenticated;
grant execute on function public.accept_invite(text)                  to authenticated;
grant execute on function public.split_group(uuid, uuid[], uuid, boolean, text, text, text) to authenticated;
grant execute on function public.create_group(text, uuid, text, text, text) to authenticated;
grant execute on function public.save_triad(uuid, text, uuid[])       to authenticated;
grant execute on function public.in_my_triad(uuid)                    to authenticated;

-- ---------------------------------------------------------------------
-- 4. Rettigheter (hva hver rolle i det hele tatt får lov til)
--    anon = besøkende uten innlogging, authenticated = innlogget
-- ---------------------------------------------------------------------

revoke all on public.groups, public.profiles, public.group_leaders, public.members,
              public.meetings, public.attendance, public.group_invites,
              public.triads, public.triad_members
  from anon, authenticated;

-- Besøkende: kan se navnet på aktive grupper og melde seg på. Ikke noe mer.
grant select (id, name, description, active) on public.groups to anon;
grant insert (group_id, full_name, birth_year, postal_code, city, consent)
  on public.members to anon;

-- Innloggede: tabellrettigheter, men radene styres av reglene under
grant select, insert, update, delete on public.groups        to authenticated;
grant select                         on public.profiles      to authenticated;
grant update (full_name, role, phone) on public.profiles     to authenticated;
grant select, insert, update, delete on public.group_leaders to authenticated;
grant select, insert, update, delete on public.members       to authenticated;
grant select, delete                 on public.meetings      to authenticated;
grant select                         on public.attendance    to authenticated;
grant select, delete                 on public.group_invites to authenticated;
grant select, delete                 on public.triads        to authenticated;
grant select                         on public.triad_members to authenticated;

-- ---------------------------------------------------------------------
-- 5. Radtilgang (Row Level Security)
-- ---------------------------------------------------------------------

alter table public.groups        enable row level security;
alter table public.profiles      enable row level security;
alter table public.group_leaders enable row level security;
alter table public.members       enable row level security;
alter table public.meetings      enable row level security;
alter table public.attendance    enable row level security;
alter table public.group_invites enable row level security;
alter table public.triads        enable row level security;
alter table public.triad_members enable row level security;

-- Fjern gamle regler hvis filen kjøres på nytt
drop policy if exists "groups: alle ser aktive"          on public.groups;
drop policy if exists "groups: ledere ser sine"          on public.groups;
drop policy if exists "groups: admin styrer"             on public.groups;
drop policy if exists "profiles: se egen"                on public.profiles;
drop policy if exists "profiles: admin ser alle"         on public.profiles;
drop policy if exists "profiles: ledere ser medledere"   on public.profiles;
drop policy if exists "profiles: oppdater egen"          on public.profiles;
drop policy if exists "profiles: admin oppdaterer"       on public.profiles;
drop policy if exists "leaders: se egne grupper"         on public.group_leaders;
drop policy if exists "leaders: admin styrer"            on public.group_leaders;
drop policy if exists "members: alle kan melde seg på"   on public.members;
drop policy if exists "members: ledere legger til"       on public.members;
drop policy if exists "members: ledere ser egen gruppe"  on public.members;
drop policy if exists "members: ledere oppdaterer"       on public.members;
drop policy if exists "members: ledere sletter i egen"   on public.members;
drop policy if exists "members: admin styrer"            on public.members;
drop policy if exists "meetings: ledere og admin ser"    on public.meetings;
drop policy if exists "meetings: ledere og admin sletter" on public.meetings;
drop policy if exists "attendance: ledere og admin ser"  on public.attendance;
drop policy if exists "invites: ledere og admin ser"     on public.group_invites;
drop policy if exists "invites: ledere og admin sletter" on public.group_invites;
drop policy if exists "profiles: triade ser hverandre"  on public.profiles;
drop policy if exists "leaders: triade ser hverandre"   on public.group_leaders;
drop policy if exists "triads: medlemmer og admin ser"  on public.triads;
drop policy if exists "triads: admin sletter"           on public.triads;
drop policy if exists "triad_members: triade og admin ser" on public.triad_members;

-- GROUPS
create policy "groups: alle ser aktive" on public.groups
  for select to anon, authenticated
  using (active = true);

create policy "groups: ledere ser sine" on public.groups
  for select to authenticated
  using (public.leads_group(id));

create policy "groups: admin styrer" on public.groups
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- PROFILES
create policy "profiles: se egen" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles: admin ser alle" on public.profiles
  for select to authenticated
  using (public.is_admin());

create policy "profiles: ledere ser medledere" on public.profiles
  for select to authenticated
  using (exists (
    select 1 from public.group_leaders gl
    where gl.user_id = profiles.id and public.leads_group(gl.group_id)
  ));

create policy "profiles: oppdater egen" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles: admin oppdaterer" on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- GROUP_LEADERS
create policy "leaders: se egne grupper" on public.group_leaders
  for select to authenticated
  using (public.leads_group(group_id));

create policy "leaders: admin styrer" on public.group_leaders
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- MEMBERS
-- Det offentlige skjemaet: alle felt må fylles ut, og gruppen må være aktiv.
create policy "members: alle kan melde seg på" on public.members
  for insert to anon, authenticated
  with check (
    consent = true
    and birth_year is not null and postal_code is not null and city is not null
    and archived_at is null
    and exists (select 1 from public.groups g where g.id = group_id and g.active)
  );

-- Ledere legger ikke inn deltakere selv: de deler påmeldingslenken.
-- (Administrator kan legge inn manuelt, se "members: admin styrer".)

create policy "members: ledere ser egen gruppe" on public.members
  for select to authenticated
  using (public.leads_group(group_id));

create policy "members: ledere oppdaterer" on public.members
  for update to authenticated
  using (public.leads_group(group_id)) with check (public.leads_group(group_id));

create policy "members: ledere sletter i egen" on public.members
  for delete to authenticated
  using (public.leads_group(group_id));

create policy "members: admin styrer" on public.members
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- MEETINGS og ATTENDANCE (lagres via save_attendance)
create policy "meetings: ledere og admin ser" on public.meetings
  for select to authenticated
  using (public.leads_group(group_id) or public.is_admin());

create policy "meetings: ledere og admin sletter" on public.meetings
  for delete to authenticated
  using (public.leads_group(group_id) or public.is_admin());

create policy "attendance: ledere og admin ser" on public.attendance
  for select to authenticated
  using (exists (
    select 1 from public.meetings m
    where m.id = meeting_id and (public.leads_group(m.group_id) or public.is_admin())
  ));

-- GROUP_INVITES (lages via create_invite / split_group)
create policy "invites: ledere og admin ser" on public.group_invites
  for select to authenticated
  using (public.leads_group(group_id) or public.is_admin());

create policy "invites: ledere og admin sletter" on public.group_invites
  for delete to authenticated
  using (public.leads_group(group_id) or public.is_admin());

-- TRIADER
create policy "profiles: triade ser hverandre" on public.profiles
  for select to authenticated
  using (public.in_my_triad(id));

create policy "leaders: triade ser hverandre" on public.group_leaders
  for select to authenticated
  using (public.in_my_triad(user_id));

create policy "triads: medlemmer og admin ser" on public.triads
  for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.triad_members m where m.triad_id = id and m.user_id = auth.uid()));

create policy "triads: admin sletter" on public.triads
  for delete to authenticated
  using (public.is_admin());

create policy "triad_members: triade og admin ser" on public.triad_members
  for select to authenticated
  using (public.is_admin() or public.in_my_triad(user_id));

-- ---------------------------------------------------------------------
-- 6. Gi eksisterende grupper navnet til lederen (gjøres hver gang filen kjøres)
-- ---------------------------------------------------------------------
select public.refresh_group_name(id) from public.groups;

-- ---------------------------------------------------------------------
-- 7. Første administrator
--    Når du har laget din egen bruker, kjør denne linjen med din e-post:
--
--    update public.profiles set role = 'admin' where email = 'din@epost.no';
-- ---------------------------------------------------------------------
