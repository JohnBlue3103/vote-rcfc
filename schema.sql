-- Coller dans l'éditeur SQL de Supabase

create table sessions (
  id uuid primary key default gen_random_uuid(),
  titre text not null,          -- ex: 'Assemblée Générale 2026'
  type text default 'AG',       -- 'AG' ou 'CA'
  statut text default 'fermee', -- 'ouverte' | 'fermee'
  created_at timestamptz default now()
);

create table resolutions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  numero int not null,          -- ex: 1, 2, 3...
  titre text not null,
  description text,
  statut text default 'fermee', -- 'ouverte' | 'fermee'
  created_at timestamptz default now()
);

create table votes (
  id uuid primary key default gen_random_uuid(),
  resolution_id uuid references resolutions(id) on delete cascade,
  votant_email text not null,
  choix text not null check (choix in ('pour','contre','abstention')),
  created_at timestamptz default now(),
  unique(resolution_id, votant_email)
);

-- Lecture publique
alter table sessions    enable row level security;
alter table resolutions enable row level security;
alter table votes       enable row level security;

create policy "public read sessions"    on sessions    for select using (true);
create policy "public read resolutions" on resolutions for select using (true);

-- Les votes : lecture uniquement par admin (auth), écriture par les votants authentifiés
create policy "auth read votes"  on votes for select using (auth.role() = 'authenticated');
create policy "auth write votes" on votes for insert with check (auth.role() = 'authenticated');

-- Admin peut tout faire
create policy "auth write sessions"    on sessions    for all using (auth.role() = 'authenticated');
create policy "auth write resolutions" on resolutions for all using (auth.role() = 'authenticated');
