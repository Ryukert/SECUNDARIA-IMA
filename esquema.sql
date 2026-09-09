-- =====================================================================
--  Control de asistencia — estructura de la base de datos
--  Aplicada el 8 de septiembre de 2026 al proyecto SECUNDARIA IMA.
--  Se puede volver a correr sin romper nada.
-- =====================================================================

create table if not exists public.grupos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre     text not null,
  creado_at  timestamptz not null default now()
);

create table if not exists public.alumnos (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  grupo_id  uuid not null references public.grupos(id) on delete cascade,
  nombre    text not null,
  orden     integer not null default 0
);

create table if not exists public.asistencias (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  grupo_id   uuid not null references public.grupos(id) on delete cascade,
  alumno_id  uuid not null references public.alumnos(id) on delete cascade,
  fecha      date not null,
  estado     text not null check (estado in ('A','F','R','J')),
  unique (alumno_id, fecha)
);

create index if not exists alumnos_grupo_idx     on public.alumnos (grupo_id);
create index if not exists asistencias_grupo_idx on public.asistencias (grupo_id, fecha);
create index if not exists grupos_user_idx       on public.grupos (user_id);

-- ---------------------------------------------------------------------
--  Seguridad: cada maestro solo ve y modifica sus propios renglones.
--  Al limitar las políticas al rol "authenticated", quien entre a la
--  página sin iniciar sesión no obtiene absolutamente nada.
-- ---------------------------------------------------------------------
alter table public.grupos      enable row level security;
alter table public.alumnos     enable row level security;
alter table public.asistencias enable row level security;

drop policy if exists "solo lo mio" on public.grupos;
create policy "solo lo mio" on public.grupos
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "solo lo mio" on public.alumnos;
create policy "solo lo mio" on public.alumnos
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "solo lo mio" on public.asistencias;
create policy "solo lo mio" on public.asistencias
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
