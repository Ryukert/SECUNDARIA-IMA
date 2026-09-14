-- =====================================================================
--  Control de asistencia — grupos compartidos y notas
--  Se agrega sobre la migración inicial (20260908204727). Se puede volver
--  a correr sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Quién tiene acceso a cada grupo. El maestro que crea un grupo queda
--  como "dueño" automáticamente (ver el trigger más abajo); un dueño
--  puede invitar a otros maestros como "colaborador", con acceso completo
--  a los alumnos y las asistencias del grupo.
-- ---------------------------------------------------------------------
create table if not exists public.grupo_maestros (
  grupo_id  uuid not null references public.grupos(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  rol       text not null default 'colaborador' check (rol in ('dueño', 'colaborador')),
  creado_at timestamptz not null default now(),
  primary key (grupo_id, user_id)
);

create index if not exists grupo_maestros_user_idx on public.grupo_maestros (user_id);

alter table public.alumnos     add column if not exists notas text;
alter table public.asistencias add column if not exists nota  text;

-- ---------------------------------------------------------------------
--  Funciones de acceso. Se marcan "security definer" a propósito, para
--  poder consultar auth.users y para que grupo_maestros no necesite
--  políticas de insert/update/delete abiertas al cliente: la única forma
--  de agregar o quitar un maestro es a través de estas funciones, y cada
--  una comprueba el rol de quien llama antes de tocar nada. Ninguna arma
--  SQL a partir de texto (nada de EXECUTE con concatenación), así que no
--  hay manera de inyectar SQL a través de ellas.
-- ---------------------------------------------------------------------

-- Ayudantes para las políticas de abajo. Al ser "security definer" no
-- disparan de nuevo la política de grupo_maestros sobre sí mismas, que es
-- lo que causaría "infinite recursion detected in policy".
create or replace function public.es_miembro(p_grupo_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.grupo_maestros
    where grupo_id = p_grupo_id and user_id = auth.uid()
  );
$$;

create or replace function public.es_dueno(p_grupo_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.grupo_maestros
    where grupo_id = p_grupo_id and user_id = auth.uid() and rol = 'dueño'
  );
$$;

grant execute on function public.es_miembro(uuid) to authenticated;
grant execute on function public.es_dueno(uuid)   to authenticated;

-- Al crear un grupo, su creador queda como dueño sin que el cliente tenga
-- que hacer una segunda llamada.
create or replace function public.grupo_creado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.grupo_maestros (grupo_id, user_id, rol)
  values (new.id, new.user_id, 'dueño')
  on conflict (grupo_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trig_grupo_creado on public.grupos;
create trigger trig_grupo_creado
  after insert on public.grupos
  for each row execute function public.grupo_creado();

-- Invitar a un maestro por correo. Solo el dueño puede llamarla.
create or replace function public.invitar_maestro(p_grupo_id uuid, p_correo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
begin
  if not public.es_dueno(p_grupo_id) then
    raise exception 'Solo el dueño del grupo puede invitar maestros.';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(trim(p_correo));
  if v_uid is null then
    raise exception 'No hay ninguna cuenta con ese correo.';
  end if;
  if v_uid = auth.uid() then
    raise exception 'Ya tienes acceso a este grupo.';
  end if;

  insert into public.grupo_maestros (grupo_id, user_id, rol)
  values (p_grupo_id, v_uid, 'colaborador')
  on conflict (grupo_id, user_id) do nothing;
end;
$$;

grant execute on function public.invitar_maestro(uuid, text) to authenticated;

-- Lista de quién tiene acceso a un grupo, con su correo. Cualquier
-- miembro la puede consultar (para verse a sí mismo en la lista).
create or replace function public.maestros_del_grupo(p_grupo_id uuid)
returns table(user_id uuid, correo text, rol text)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if not public.es_miembro(p_grupo_id) then
    raise exception 'No tienes acceso a este grupo.';
  end if;

  return query
    select gm.user_id, u.email::text, gm.rol
    from public.grupo_maestros gm
    join auth.users u on u.id = gm.user_id
    where gm.grupo_id = p_grupo_id
    order by gm.creado_at;
end;
$$;

grant execute on function public.maestros_del_grupo(uuid) to authenticated;

-- Quitar a un maestro. Solo el dueño, y no puede quitarse a sí mismo
-- (para eso está "Borrar grupo").
create or replace function public.quitar_maestro(p_grupo_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_dueno(p_grupo_id) then
    raise exception 'Solo el dueño puede quitar maestros.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'El dueño no puede quitarse a sí mismo. Borra el grupo si ya no lo quieres.';
  end if;

  delete from public.grupo_maestros where grupo_id = p_grupo_id and user_id = p_user_id;
end;
$$;

grant execute on function public.quitar_maestro(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
--  RLS: en vez de "solo quien lo creó", ahora "cualquier miembro del
--  grupo". Borrar el grupo y administrar quién tiene acceso queda
--  reservado al dueño.
-- ---------------------------------------------------------------------
alter table public.grupo_maestros enable row level security;

drop policy if exists "solo lo mio" on public.grupos;
drop policy if exists "miembros ven y editan" on public.grupos;
drop policy if exists "cualquiera crea su grupo" on public.grupos;
drop policy if exists "miembros renombran" on public.grupos;
drop policy if exists "solo dueno borra" on public.grupos;

create policy "miembros ven" on public.grupos
  for select to authenticated using (public.es_miembro(id));
create policy "cualquiera crea su grupo" on public.grupos
  for insert to authenticated with check (user_id = auth.uid());
create policy "miembros renombran" on public.grupos
  for update to authenticated using (public.es_miembro(id)) with check (public.es_miembro(id));
create policy "solo dueno borra" on public.grupos
  for delete to authenticated using (public.es_dueno(id));

drop policy if exists "solo lo mio" on public.alumnos;
create policy "miembros del grupo" on public.alumnos
  for all to authenticated using (public.es_miembro(grupo_id)) with check (public.es_miembro(grupo_id));

drop policy if exists "solo lo mio" on public.asistencias;
create policy "miembros del grupo" on public.asistencias
  for all to authenticated using (public.es_miembro(grupo_id)) with check (public.es_miembro(grupo_id));

drop policy if exists "miembros ven maestros" on public.grupo_maestros;
create policy "miembros ven maestros" on public.grupo_maestros
  for select to authenticated using (public.es_miembro(grupo_id));

-- ---------------------------------------------------------------------
--  Los grupos que ya existían (de antes de esta migración) no tienen
--  todavía su renglón de dueño en grupo_maestros. Sin esto, su creador se
--  quedaría fuera de su propio grupo en cuanto se aplique la migración.
-- ---------------------------------------------------------------------
insert into public.grupo_maestros (grupo_id, user_id, rol)
select id, user_id, 'dueño' from public.grupos
on conflict (grupo_id, user_id) do nothing;
