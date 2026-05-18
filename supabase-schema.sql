-- ══════════════════════════════════════════════════════════
-- Producció Veu — Supabase Schema
-- Executa aquest SQL al SQL Editor de Supabase
-- ══════════════════════════════════════════════════════════

-- 1. PRODUCTES
create table if not exists productes (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  producte      text,
  grup          text,
  unitats_per_palet   numeric,
  caixes_per_palet    numeric,
  unitats_per_caixa   numeric,
  kg_massa_palet      numeric,
  codi_massa          text,
  kg_farcit_palet     numeric,
  codi_farcit         text,
  dies_permesos       text,
  incompatible_amb    text,
  comentaris          text
);

-- 2. RECEPTA
create table if not exists recepta (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  producte      text,
  codi_farcit           text,
  grams_per_unitat_farcit  numeric,
  merma_farcit          numeric,
  codi_massa            text,
  grams_per_unit_massa  numeric,
  merma_massa           numeric,
  comentaris            text
);

-- 3. FARCIT
create table if not exists farcit (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  codi_nom_mp       text,
  grams_per_unitat  numeric,
  merma             numeric
);

-- 4. LÍNIES
create table if not exists linies (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  linia             text,
  tipus             text,
  descripcio        text,
  temps_preparacio  numeric,
  temps_neteja      numeric,
  temps_espera      numeric,
  comentaris        text
);

-- 5. FLUX
create table if not exists flux (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  producte              text,
  dia                   numeric,
  linia                 text,
  temps_per_kg          numeric,
  persones_necessaries  numeric,
  perfils_de_persona    text,
  es_pot_parar          text,
  prerequisits          text,
  comentaris            text
);

-- 6. TORNS
create table if not exists torns (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  persona           text,
  torn              text,
  hora_inici        text,
  hora_fi           text,
  actiu             text,
  tipus_personal    text,
  descans           text
);

-- ══════════════════════════════════════════════════════════
-- Row Level Security (RLS) — desactivat per simplicitat
-- Si vols multi-usuari, activa RLS i afegeix polítiques
-- ══════════════════════════════════════════════════════════
alter table productes enable row level security;
alter table recepta   enable row level security;
alter table farcit    enable row level security;
alter table linies    enable row level security;
alter table flux      enable row level security;
alter table torns     enable row level security;

-- Política oberta (qualsevol pot llegir/escriure amb la anon key)
create policy "Allow all" on productes for all using (true) with check (true);
create policy "Allow all" on recepta   for all using (true) with check (true);
create policy "Allow all" on farcit    for all using (true) with check (true);
create policy "Allow all" on linies    for all using (true) with check (true);
create policy "Allow all" on flux      for all using (true) with check (true);
create policy "Allow all" on torns     for all using (true) with check (true);
