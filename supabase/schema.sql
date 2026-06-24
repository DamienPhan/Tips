-- Rapports de mission — schéma Supabase
-- À exécuter dans le SQL Editor du projet Supabase.

create table if not exists missions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  intervention_date date not null,
  booking_ref text,
  client_name text,
  service_type text check (service_type in ('ARR','DEP','TRANSIT')),
  flight_code text,
  terminal text,
  pax_count int default 1,
  bags_standard int default 0,
  bags_oversized int default 0,
  animal_crates int default 0,
  meeting_point text,
  drop_point text,
  has_issue boolean default false,
  issue_description text,
  satisfaction int check (satisfaction between 1 and 5),
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

-- Vue d'agrégation mensuelle (héritée des RLS de la table sous-jacente).
create or replace view monthly_stats as
select
  user_id,
  date_trunc('month', intervention_date)::date as month,
  count(*) as mission_count,
  sum(tip_amount) as total_tips,
  sum(pax_count) as total_pax,
  round(sum(tip_amount) / nullif(sum(pax_count), 0), 2) as tip_per_pax,
  count(*) filter (where has_issue) as issue_count
from missions
group by user_id, date_trunc('month', intervention_date);
