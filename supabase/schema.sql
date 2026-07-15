-- Rapports de mission — schéma Supabase
-- À exécuter dans le SQL Editor du projet Supabase.

create table if not exists missions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  intervention_date date not null,
  booking_ref text,
  client_name text,
  greeter text,
  booking_mode text check (booking_mode in ('PRE','LIVE')),
  service_type text check (service_type in ('ARR','DEP','TRANSIT')),
  flight_code text,
  terminal text,
  pax_count int default 1,
  bags_standard int default 0,
  bags_oversized int default 0,
  animal_crates int default 0,
  tax_refund boolean default false,
  meeting_point text,
  drop_point text,
  has_issue boolean default false,
  issue_description text,
  is_no_show boolean default false,
  porter_count int default 1,
  satisfaction text check (satisfaction in ('EXCELLENTE','BONNE','MOYENNE','MAUVAISE')),
  tip_amount numeric(6,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists missions_user_date_idx
  on missions (user_id, intervention_date desc);

alter table missions enable row level security;

drop policy if exists owner_all on missions;
create policy owner_all on missions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Vue mensuelle (no-show exclu des ratios financiers).
-- security_invoker : la vue applique les RLS de l'appelant plutôt que celles du propriétaire.
create or replace view monthly_stats
with (security_invoker = true)
as
select
  user_id,
  date_trunc('month', intervention_date)::date as month,
  count(*) as mission_count,
  count(*) filter (where not is_no_show) as served_count,
  sum(tip_amount) as total_tips,
  sum(pax_count) filter (where not is_no_show) as total_pax,
  round(sum(tip_amount) / nullif(sum(pax_count) filter (where not is_no_show), 0), 2) as tip_per_pax,
  count(*) filter (where has_issue) as issue_count,
  count(*) filter (where is_no_show) as no_show_count
from missions
group by user_id, date_trunc('month', intervention_date);

-- Horaires de travail (pour le ratio € / heure).
create table if not exists work_shifts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  shift_date date not null,
  start_min int not null,
  end_min int not null,
  hours numeric(5,2) not null,
  overtime_hours numeric(5,2) default 0,
  is_day_off boolean default false,
  night_hours numeric(5,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists shifts_user_date_idx on work_shifts (user_id, shift_date desc);

alter table work_shifts enable row level security;

drop policy if exists owner_all_shifts on work_shifts;
create policy owner_all_shifts on work_shifts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Migration non destructive (si table déjà existante) :
-- alter table work_shifts add column if not exists is_day_off boolean default false;
-- alter table work_shifts add column if not exists updated_at timestamptz default now();
-- night_hours (heures de nuit 22h-7h) : ajoutée ici le 2026-06-30, mais un projet Supabase créé
-- avant cette date n'a jamais reçu cette colonne tant que cette migration n'est pas exécutée
-- manuellement — chaque shift enregistré depuis échoue à la synchro avec l'erreur PostgREST
-- "Could not find the 'night_hours' column of 'work_shifts' in the schema cache" (visible dans
-- SyncDetails.jsx), la ligne reste bloquée en local en syncStatus 'error'. (Un champ
-- night_overtime_hours l'accompagnait à l'origine — l'overlap entre heures de nuit et heures sup —
-- retiré ensuite : une heure à la fois nuit et sup compte déjà en entier dans night_hours ET
-- overtime_hours indépendamment, ce troisième champ n'ajoutait qu'une catégorie confuse en plus,
-- jamais utilisée par le calcul de paie. Si `night_overtime_hours` existe encore sur un projet créé
-- avant ce retrait, la colonne est inoffensive mais n'est plus lue ni écrite par l'app.)
-- alter table work_shifts add column if not exists night_hours numeric(5,2) default 0;
-- hours/overtime_hours étaient en numeric(4,1) (1 décimale) : un shift de 3h45/6h15 (fractions
-- .25/.75) se faisait arrondir silencieusement par Postgres à l'écriture (3.75 -> 3.8), faussant
-- l'affichage après un aller-retour serveur. Passage à numeric(5,2), comme night_hours.
-- alter table work_shifts alter column hours type numeric(5,2);
-- alter table work_shifts alter column overtime_hours type numeric(5,2);
