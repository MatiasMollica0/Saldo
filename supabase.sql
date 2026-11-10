-- SALDO / Esquema para dos usuarios con privacidad por movimiento.
-- Ejecutar una sola vez en Supabase > SQL Editor (proyecto nuevo recomendado).
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Usuario' check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table if not exists public.partner_links (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint distinct_members check (user_low < user_high),
  constraint unique_pair unique (user_low, user_high)
);
create index if not exists partner_links_high_idx on public.partner_links(user_high);

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint valid_code check (code ~ '^[A-F0-9]{12}$')
);
create index if not exists invite_codes_owner_idx on public.invite_codes(owner_id);

create table if not exists public.movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  movement_date date not null,
  kind text not null check (kind in ('income','expense')),
  amount numeric(13,2) not null check (amount > 0 and amount <= 99999999999),
  title text not null check (char_length(trim(title)) between 1 and 120),
  category text not null check (char_length(trim(category)) between 1 and 60),
  note text not null default '' check (char_length(note) <= 500),
  shared_with_partner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists movements_owner_date_idx on public.movements(owner_id, movement_date desc);
create index if not exists movements_shared_owner_idx on public.movements(owner_id, movement_date desc) where shared_with_partner;

-- Crear perfil automáticamente con el nombre elegido en el registro.
create or replace function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values(new.id, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'),''),'Usuario'),80))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_saldo on auth.users;
create trigger on_auth_user_created_saldo after insert on auth.users
for each row execute function public.create_profile_for_user();

create or replace function public.touch_movement()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists trg_touch_movement on public.movements;
create trigger trg_touch_movement before update on public.movements
for each row execute function public.touch_movement();

alter table public.profiles enable row level security;
alter table public.partner_links enable row level security;
alter table public.invite_codes enable row level security;
alter table public.movements enable row level security;

-- Revocar permisos implícitos antes de otorgar únicamente lo necesario.
revoke all on public.profiles, public.partner_links, public.invite_codes, public.movements from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.partner_links to authenticated;
grant select, insert, update, delete on public.movements to authenticated;
-- La app no toca invite_codes directamente: solo las RPC controladas.

create policy "profile: me or linked partner" on public.profiles for select to authenticated
using (
 id = (select auth.uid()) or exists (
  select 1 from public.partner_links l
  where (l.user_low = (select auth.uid()) and l.user_high = profiles.id)
     or (l.user_high = (select auth.uid()) and l.user_low = profiles.id)
 )
);
create policy "profile: update mine" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "links: members read" on public.partner_links for select to authenticated
using (user_low = (select auth.uid()) or user_high = (select auth.uid()));

create policy "movements: owner or shared with linked partner" on public.movements for select to authenticated
using (
 owner_id = (select auth.uid()) or
 (shared_with_partner and exists (
  select 1 from public.partner_links l
  where (l.user_low = movements.owner_id and l.user_high = (select auth.uid()))
     or (l.user_high = movements.owner_id and l.user_low = (select auth.uid()))
 ))
);
create policy "movements: owner inserts" on public.movements for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy "movements: owner updates" on public.movements for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "movements: owner deletes" on public.movements for delete to authenticated
using (owner_id = (select auth.uid()));

-- Los permisos de relación se generan y controlan exclusivamente en funciones SQL.
-- Código temporal aleatorio de 12 caracteres hexadecimales, válido 7 días.
create or replace function public.generate_partner_invite()
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); token text;
begin
  if uid is null then raise exception 'Debés iniciar sesión.'; end if;
  if exists (select 1 from public.partner_links where user_low = uid or user_high = uid) then
    raise exception 'Ya tenés una pareja vinculada.';
  end if;
  delete from public.invite_codes where owner_id = uid;
  token := upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into public.invite_codes(owner_id,code) values(uid,token);
  return token;
end; $$;

create or replace function public.accept_partner_invite(invite_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); inv public.invite_codes%rowtype; a uuid; b uuid;
begin
  if uid is null then raise exception 'Debés iniciar sesión.'; end if;
  -- Vinculación serializada para impedir relaciones paralelas al mismo tiempo.
  perform pg_advisory_xact_lock(77442101);
  select * into inv from public.invite_codes
    where code = upper(trim(invite_code)) and used_at is null and expires_at > now()
    for update;
  if not found then raise exception 'Código inválido o vencido.'; end if;
  if inv.owner_id = uid then raise exception 'No podés vincularte con vos mismo.'; end if;
  if exists (select 1 from public.partner_links
    where user_low in (uid,inv.owner_id) or user_high in (uid,inv.owner_id)) then
    raise exception 'Alguna de las cuentas ya está vinculada.';
  end if;
  a := least(uid,inv.owner_id); b := greatest(uid,inv.owner_id);
  insert into public.partner_links(user_low,user_high) values(a,b);
  update public.invite_codes set used_at = now() where id = inv.id;
  delete from public.invite_codes where owner_id in (uid,inv.owner_id) and id <> inv.id;
  return true;
end; $$;

create or replace function public.disconnect_partner()
returns boolean language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); l public.partner_links%rowtype;
begin
  if uid is null then raise exception 'Debés iniciar sesión.'; end if;
  perform pg_advisory_xact_lock(77442101);
  select * into l from public.partner_links
  where user_low = uid or user_high = uid for update;
  if not found then return false; end if;
  -- Importante: no heredar compartidos a otra relación futura.
  update public.movements set shared_with_partner = false
  where owner_id in (l.user_low,l.user_high) and shared_with_partner = true;
  delete from public.partner_links where id = l.id;
  delete from public.invite_codes where owner_id in (l.user_low,l.user_high);
  return true;
end; $$;

revoke all on function public.generate_partner_invite() from public, anon;
revoke all on function public.accept_partner_invite(text) from public, anon;
revoke all on function public.disconnect_partner() from public, anon;
grant execute on function public.generate_partner_invite() to authenticated;
grant execute on function public.accept_partner_invite(text) to authenticated;
grant execute on function public.disconnect_partner() to authenticated;

-- Para usuarios Auth creados antes de ejecutar el SQL.
insert into public.profiles(id,display_name)
select id, left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'),''),'Usuario'),80)
from auth.users on conflict (id) do nothing;
