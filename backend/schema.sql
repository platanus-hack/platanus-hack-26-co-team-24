-- Bus Factor HQ — pegar entero en SQL Editor de Supabase → Run.
-- No habilites pgvector. P2 descartó embeddings.

create table if not exists offices (
  id text primary key,
  nombre text not null
);

insert into offices (id, nombre)
values ('of-demo', 'Bus Factor HQ')
on conflict (id) do nothing;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  nombre text not null,
  rol text not null default 'Equipo',
  office_id text not null default 'of-demo' references offices(id),
  avatar_config jsonb not null default '{}',
  sprite text not null default 'lpc-00',
  creado_en timestamptz not null default now()
);

create table if not exists connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  tipo text not null check (tipo in ('slack', 'drive')),
  estado text not null default 'activa',
  creado_en timestamptz not null default now()
);

-- payload = model_dump() de cerebro. Los escalares son solo para filtrar.
create table if not exists knowledge_items (
  id text primary key,
  office_id text not null default 'of-demo' references offices(id),
  dueno_principal text not null,
  tipo text not null,
  payload jsonb not null,
  actualizado_en timestamptz not null default now()
);

create table if not exists risk_scores (
  persona_id text not null,
  office_id text not null default 'of-demo' references offices(id),
  payload jsonb not null,
  calculado_en timestamptz not null default now(),
  primary key (office_id, persona_id)
);

create table if not exists quests (
  id text primary key,
  office_id text not null default 'of-demo' references offices(id),
  asignado_a text not null,
  estado text not null default 'pendiente',
  payload jsonb not null
);

create table if not exists simulations (
  id uuid primary key default gen_random_uuid(),
  office_id text not null default 'of-demo' references offices(id),
  scenario_id text not null,
  objetivo_id text,
  payload jsonb not null,
  creado_en timestamptz not null default now()
);

-- El backend usa la service_role key; RLS apagado a propósito (hackathon).
alter table offices disable row level security;
alter table users disable row level security;
alter table connections disable row level security;
alter table knowledge_items disable row level security;
alter table risk_scores disable row level security;
alter table quests disable row level security;
alter table simulations disable row level security;
