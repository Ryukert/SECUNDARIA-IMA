// =====================================================================
//  Registro de asistencia — pantalla y conexión con Supabase.
//  La lógica sin navegador vive en logica.js.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ESTADOS, MESES, hoy, fechaISO, fechaLarga, fechaCorta, mueveDia, esFinDeSemana, cicloEscolar,
  esc, limpio, normaliza, traducirError, esFallaDeRed,
  armarGrupos, diasRegistrados, marcasDelDia, notaDelDia, cuantosMarcados,
  diaHabilAnteriorSinMarcar, resumen, promedioAsistencia, serieAsistencia, UMBRAL_BAJO,
  aCsv, csvDeGrupo, csvDeTodo, armarRespaldo, leerRespaldo,
} from './logica.js';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

const estado = {
  grupos: [],
  activo: null,
  vista: 'lista',
  fecha: hoy(),
  modo: 'entrar',
  sesion: null,
  busqueda: '',
  rangoReporte: 'ciclo',   // 'ciclo' | 'mes' | 'rango'
  rangoDesde: '',
  rangoHasta: '',
};

const grupoActivo = () => estado.grupos.find(g => g.id === estado.activo) || null;

// Avisos de "no pasaste lista" que el maestro ya cerró. Solo dura la
// sesión: no tiene caso guardarlo, mañana habrá otro día que revisar.
const avisosDescartados = new Set();

let sb = null;

/* =====================================================================
   Avisos y estado de la conexión
   ===================================================================== */

let tempAviso;
function avisar(texto, mal = false) {
  const a = $('#aviso');
  a.textContent = texto;
  a.classList.toggle('mal', mal);
  a.classList.add('ver');
  clearTimeout(tempAviso);
  tempAviso = setTimeout(() => a.classList.remove('ver'), mal ? 4500 : 1500);
}

function pintarPendientes(n) {
  const chip = $('#pendientes');
  if (!n) { chip.hidden = true; return; }
  chip.hidden = false;
  chip.textContent = n === 1 ? '1 marca sin enviar' : `${n} marcas sin enviar`;
}

/* =====================================================================
   Cola de escritura

   Antes, cada toque esperaba a la red y, si fallaba, se perdía la marca.
   Ahora la pantalla se actualiza al instante y la escritura entra en una
   cola que se vacía en orden. Si la señal se cae —cosa común en un salón—
   la cola espera y reintenta sola en cuanto vuelve.
   ===================================================================== */

const cola = [];
let enviando = false;
let esperaReintento = 0;

function encolar(descripcion, ejecutar, alFallar) {
  cola.push({ descripcion, ejecutar, alFallar });
  pintarPendientes(cola.length);
  bombear();
}

async function bombear() {
  if (enviando || !cola.length) return;
  enviando = true;

  while (cola.length) {
    const tarea = cola[0];
    try {
      const r = await tarea.ejecutar();
      if (r?.error) throw r.error;
      cola.shift();
      pintarPendientes(cola.length);
      esperaReintento = 0;
    } catch (err) {
      if (esFallaDeRed(err)) {
        // No se descarta: se reintenta con esperas cada vez más largas.
        enviando = false;
        esperaReintento = Math.min(esperaReintento ? esperaReintento * 2 : 3000, 30000);
        avisar('Sin conexión. Tus marcas se guardan en cuanto regrese.', true);
        setTimeout(bombear, esperaReintento);
        return;
      }
      // Rechazo del servidor: no tiene caso reintentar.
      cola.shift();
      pintarPendientes(cola.length);
      console.error(tarea.descripcion, err);
      avisar(`No se guardó: ${traducirError(err.message)}`, true);
      if (tarea.alFallar) await tarea.alFallar(err);
    }
  }
  enviando = false;
}

window.addEventListener('online', () => { esperaReintento = 0; bombear(); });
window.addEventListener('beforeunload', e => {
  if (cola.length) { e.preventDefault(); e.returnValue = ''; }
});

// Operaciones donde el maestro espera respuesta (crear, borrar, restaurar).
async function directo(fn, mensajeOk) {
  try {
    const r = await fn();
    if (r?.error) throw r.error;
    if (mensajeOk) avisar(mensajeOk);
    return r;
  } catch (err) {
    console.error(err);
    avisar(traducirError(err.message), true);
    return null;
  }
}

/* =====================================================================
   Diálogos propios

   prompt() y confirm() se ven mal en el celular y algunos navegadores los
   bloquean cuando la página está instalada. Estos usan <dialog>.
   ===================================================================== */

function dialogo({ titulo, texto = '', etiqueta = '', valor = '', aceptar = 'Aceptar', peligro = false, multilinea = false }) {
  const dlg = $('#dialogo');
  const campo = multilinea ? $('#dlgCampoLargo') : $('#dlgCampo');

  $('#dlgTitulo').textContent = titulo;
  $('#dlgTexto').textContent = texto;
  $('#dlgTexto').hidden = !texto;
  $('#dlgEtiqueta').textContent = etiqueta;
  $('#dlgEtiqueta').hidden = !etiqueta;
  $('#dlgEtiqueta').setAttribute('for', multilinea ? 'dlgCampoLargo' : 'dlgCampo');
  $('#dlgCampo').hidden = !etiqueta || multilinea;
  $('#dlgCampoLargo').hidden = !etiqueta || !multilinea;
  campo.value = valor;
  $('#dlgAceptar').textContent = aceptar;
  $('#dlgAceptar').classList.toggle('peligro', peligro);
  $('#dlgAceptar').classList.toggle('primario', !peligro);

  dlg.showModal();
  if (etiqueta) requestAnimationFrame(() => { campo.focus(); if (!multilinea) campo.select(); });

  return new Promise(resolver => {
    dlg.addEventListener('close', () => {
      const ok = dlg.returnValue === 'aceptar';
      if (!ok) return resolver(null);
      resolver(etiqueta ? campo.value.trim() : true);
    }, { once: true });
  });
}

const preguntar = (titulo, etiqueta, valor) => dialogo({ titulo, etiqueta, valor, aceptar: 'Guardar' });
const confirmar = (titulo, texto, aceptar = 'Sí, continuar') =>
  dialogo({ titulo, texto, aceptar, peligro: true });
// A diferencia de preguntar(), aquí "" es una respuesta válida (borrar la
// nota); solo cancelar regresa null.
const preguntarLargo = (titulo, etiqueta, valor) =>
  dialogo({ titulo, etiqueta, valor, aceptar: 'Guardar', multilinea: true });

/* =====================================================================
   Sesión
   ===================================================================== */

function pintarMembrete() {
  const nombre = window.ESCUELA || 'Escuela Secundaria';
  const tipo = window.ESCUELA_TIPO || '';
  for (const s of ['#escuela', '#escuelaAcceso']) $(s).textContent = nombre;
  for (const s of ['#tipo', '#tipoAcceso']) { $(s).textContent = tipo; $(s).hidden = !tipo; }
  $('#ciclo').textContent = window.CICLO || cicloEscolar();
  document.title = `${nombre} — Registro de asistencia`;

  if (window.LOGO) {
    for (const s of ['#emblemaApp', '#emblemaAcceso']) {
      const img = document.createElement('img');
      img.src = window.LOGO;
      img.alt = '';
      $(s).replaceChildren(img);
    }
  }
}

async function iniciar() {
  pintarMembrete();

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    $('#cargando').textContent =
      'Falta la configuración: revisa que config.js esté junto a index.html y que tenga la dirección y la llave de Supabase.';
    return;
  }

  sb = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  const { data } = await sb.auth.getSession();
  $('#cargando').hidden = true;

  // Cierre de sesión en otra pestaña, o token vencido: la pantalla reacciona.
  sb.auth.onAuthStateChange((evento, sesion) => {
    if (evento === 'SIGNED_OUT' || !sesion) {
      estado.sesion = null;
      estado.grupos = [];
      $('#app').hidden = true;
      pintarAcceso();
      $('#acceso').hidden = false;
    }
  });

  if (data.session) await abrirApp(data.session);
  else { pintarAcceso(); $('#acceso').hidden = false; }
}

async function abrirApp(sesion) {
  estado.sesion = sesion;
  $('#acceso').hidden = true;
  $('#app').hidden = false;
  $('#quien').textContent = sesion.user.user_metadata?.nombre || sesion.user.email;
  await cargarTodo();
  pintar();
}

function pintarAcceso() {
  const reg = estado.modo === 'registro';
  $('#tituloEntrada').textContent = reg ? 'Crear una cuenta' : 'Entrar al registro';
  $('#subEntrada').textContent = reg
    ? 'Los grupos que registres los verás únicamente tú.'
    : 'Usa el correo y la contraseña de tu cuenta.';
  $('#campoNombre').hidden = !reg;
  $('#campoPass2').hidden = !reg;
  $('#btnPrincipal').textContent = reg ? 'Crear mi cuenta' : 'Entrar';
  $('#pass').autocomplete = reg ? 'new-password' : 'current-password';
  $('#textoCambiar').textContent = reg ? '¿Ya tienes cuenta?' : '¿Todavía no tienes cuenta?';
  $('#btnCambiarModo').textContent = reg ? 'Entrar' : 'Crear una';
  $('#errorEntrada').hidden = true;
  $('#okEntrada').hidden = true;
}

function fallo(texto) {
  $('#errorEntrada').textContent = texto;
  $('#errorEntrada').hidden = false;
  $('#okEntrada').hidden = true;
  $('#btnPrincipal').disabled = false;
}

async function enviarAcceso() {
  $('#errorEntrada').hidden = true;
  $('#okEntrada').hidden = true;
  $('#btnPrincipal').disabled = true;

  const correo = $('#correo').value.trim();
  const pass = $('#pass').value;
  if (!correo || !pass) return fallo('Escribe tu correo y tu contraseña.');

  try {
    if (estado.modo === 'registro') {
      const nombre = $('#nombreMaestro').value.trim();
      if (!nombre) return fallo('Escribe tu nombre.');
      if (pass.length < 6) return fallo('La contraseña necesita al menos 6 caracteres.');
      if (pass !== $('#pass2').value) return fallo('Las dos contraseñas no son iguales.');

      const { data, error } = await sb.auth.signUp({
        email: correo, password: pass, options: { data: { nombre } },
      });
      $('#btnPrincipal').disabled = false;
      if (error) return fallo(traducirError(error.message));

      if (data.session) { limpiarCampos(); return abrirApp(data.session); }

      estado.modo = 'entrar';
      pintarAcceso();
      $('#okEntrada').textContent =
        `Cuenta creada. Te mandamos un correo a ${correo}: ábrelo, confirma tu cuenta y regresa aquí.`;
      $('#okEntrada').hidden = false;
      $('#pass').value = ''; $('#pass2').value = '';
      return;
    }

    const { data, error } = await sb.auth.signInWithPassword({ email: correo, password: pass });
    $('#btnPrincipal').disabled = false;
    if (error) return fallo(traducirError(error.message));
    limpiarCampos();
    await abrirApp(data.session);
  } catch (err) {
    fallo(traducirError(err.message));
  }
}

function limpiarCampos() {
  for (const s of ['#pass', '#pass2', '#nombreMaestro']) $(s).value = '';
}

/* =====================================================================
   Lectura
   ===================================================================== */

async function cargarTodo() {
  const [g, a, s] = await Promise.all([
    sb.from('grupos').select('*').order('creado_at'),
    sb.from('alumnos').select('*').order('orden'),
    sb.from('asistencias').select('*'),
  ]);
  const error = g.error || a.error || s.error;
  if (error) {
    console.error(error);
    avisar(`No se pudieron leer los datos: ${traducirError(error.message)}`, true);
    return;
  }
  estado.grupos = armarGrupos(g.data, a.data, s.data);
  if (!estado.grupos.some(x => x.id === estado.activo)) {
    estado.activo = estado.grupos[0]?.id ?? null;
  }
}

/* =====================================================================
   Pintado general
   ===================================================================== */

function pintarSelectorGrupos() {
  const sel = $('#selGrupo');
  if (!estado.grupos.length) {
    sel.innerHTML = '<option>Sin grupos todavía</option>';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  sel.innerHTML = estado.grupos
    .map(g => `<option value="${g.id}"${g.id === estado.activo ? ' selected' : ''}>${esc(g.nombre)}</option>`)
    .join('');
}

function pintar() {
  pintarSelectorGrupos();
  for (const b of $$('nav.pestanas button')) {
    b.setAttribute('aria-selected', String(b.dataset.v === estado.vista));
  }
  const cont = $('#vista');

  if (estado.vista === 'datos') return pintarDescargas(cont);

  const g = grupoActivo();
  if (!g) {
    cont.innerHTML = `<div class="vacio">
      <p>Aquí no hay nada todavía. Crea tu primer grupo para empezar a pasar lista.</p>
      <button class="btn primario" id="crearPrimero">Crear un grupo</button></div>`;
    $('#crearPrimero').onclick = nuevoGrupo;
    return;
  }
  if (estado.vista === 'lista') pintarLista(cont, g);
  if (estado.vista === 'alumnos') pintarAlumnos(cont, g);
  if (estado.vista === 'reporte') pintarReporte(cont, g);
}

/* =====================================================================
   Pasar lista
   ===================================================================== */

function pintarLista(cont, g) {
  if (!g.alumnos.length) {
    cont.innerHTML = `<div class="vacio">
      <p>El grupo ${esc(g.nombre)} aún no tiene alumnos. Agrégalos y podrás pasar lista en segundos.</p>
      <button class="btn primario" id="irAlumnos">Agregar alumnos</button></div>`;
    $('#irAlumnos').onclick = () => { estado.vista = 'alumnos'; pintar(); };
    return;
  }

  const dia = marcasDelDia(g, estado.fecha);
  const diaPendiente = diaHabilAnteriorSinMarcar(g, hoy());
  const avisoClave = `${g.id}:${diaPendiente}`;
  const mostrarAvisoPendiente = diaPendiente && !avisosDescartados.has(avisoClave);

  cont.innerHTML = `
    <div class="cabezal-dia">
      <div class="fecha-barra">
        <h1 class="fecha-larga">${fechaLarga(estado.fecha)}</h1>
        <div class="flechas">
          <button id="ant" aria-label="Día anterior">←</button>
          <button id="sig" aria-label="Día siguiente">→</button>
        </div>
        <input type="date" id="inpFecha" value="${estado.fecha}" aria-label="Elegir fecha">
        <button class="btn" id="verCalendario">Calendario</button>
        ${estado.fecha !== hoy() ? '<button class="btn" id="irHoy">Ir a hoy</button>' : ''}
      </div>
      ${esFinDeSemana(estado.fecha) ? '<p class="nota aviso-dia">Este día cae en fin de semana.</p>' : ''}
      ${mostrarAvisoPendiente ? `<p class="nota aviso-dia aviso-pendiente">
        Parece que no pasaste lista el ${fechaLarga(diaPendiente)}.
        <button class="btn enlace" id="irDiaPendiente">Ir a ese día</button>
        <button class="btn enlace" id="ocultarAviso">Ocultar</button></p>` : ''}
      <div class="avance" aria-live="polite">
        <span id="conteo"></span>
        <div class="riel"><span id="riel"></span></div>
      </div>
      ${g.alumnos.length > 8 ? `<input type="search" id="buscarAlumno" class="buscar"
        placeholder="Buscar alumno…" value="${esc(estado.busqueda)}" aria-label="Buscar alumno">` : ''}
    </div>

    <ol class="lista">
      ${g.alumnos.map((a, i) => {
        const nota = notaDelDia(g, estado.fecha, a.id);
        return `
        <li data-alumno="${a.id}" class="${dia[a.id] ? '' : 'sin-marcar'}">
          <span class="num">${i + 1}</span>
          <span class="nombre">${esc(a.nombre)}${dia[a.id] ? `<button class="btn-nota${nota ? ' con-nota' : ''}"
              data-nota="${a.id}" title="${nota ? esc(nota) : 'Agregar nota'}"
              aria-label="Nota para ${esc(a.nombre)}">✎</button>` : ''}</span>
          <span class="marcas">
            ${ESTADOS.map(s => `<button data-a="${a.id}" data-e="${s.e}"
              aria-pressed="${dia[a.id] === s.e}" title="${s.nom}"
              aria-label="${s.nom} para ${esc(a.nombre)}">${s.etq}</button>`).join('')}
          </span>
        </li>`;
      }).join('')}
    </ol>

    <p class="leyenda"><span><b>✓</b> asistencia</span><span><b>F</b> falta</span>
      <span><b>R</b> retardo</span><span><b>J</b> falta justificada</span></p>

    <div class="acciones">
      <button class="btn primario" id="todosPresentes">Marcar todos con asistencia</button>
      <button class="btn" id="faltanLosDemas">Los que faltan por marcar: falta</button>
      <button class="btn" id="imprimirDia">Imprimir esta lista</button>
      <button class="btn peligro" id="limpiarDia">Borrar las marcas del día</button>
    </div>`;

  actualizarAvance(g);

  $('#ant').onclick = () => cambiarFecha(mueveDia(estado.fecha, -1));
  $('#sig').onclick = () => cambiarFecha(mueveDia(estado.fecha, 1));
  $('#inpFecha').onchange = e => e.target.value && cambiarFecha(e.target.value);
  $('#irHoy')?.addEventListener('click', () => cambiarFecha(hoy()));
  $('#verCalendario').onclick = () => abrirCalendario(g);
  $('#irDiaPendiente')?.addEventListener('click', () => cambiarFecha(diaPendiente));
  $('#ocultarAviso')?.addEventListener('click', () => { avisosDescartados.add(avisoClave); pintar(); });
  $('#imprimirDia').onclick = () => window.print();
  $('#todosPresentes').onclick = () => marcarTodos(g, () => 'A');
  $('#faltanLosDemas').onclick = () => marcarTodos(g, a => marcasDelDia(g, estado.fecha)[a.id] || 'F');
  $('#limpiarDia').onclick = () => limpiarDia(g);

  const buscar = $('#buscarAlumno');
  if (buscar) buscar.oninput = () => { estado.busqueda = buscar.value; aplicarBusqueda(cont, g); };
  aplicarBusqueda(cont, g);

  // Un solo escuchador para toda la lista, en vez de uno por botón.
  cont.querySelector('ol.lista').addEventListener('click', ev => {
    const boton = ev.target.closest('button[data-a]');
    if (boton) marcar(g, boton.dataset.a, boton.dataset.e);
    const notaBtn = ev.target.closest('button[data-nota]');
    if (notaBtn) editarNotaDia(g, notaBtn.dataset.nota);
  });
}

// Oculta en el DOM ya pintado a quien no coincida con la búsqueda, sin
// tocar la red ni volver a armar la lista completa.
function aplicarBusqueda(cont, g) {
  const q = normaliza(estado.busqueda.trim());
  for (const li of cont.querySelectorAll('li[data-alumno]')) {
    if (!q) { li.hidden = false; continue; }
    const a = g.alumnos.find(x => x.id === li.dataset.alumno);
    li.hidden = !normaliza(a?.nombre || '').includes(q);
  }
}

async function editarNotaDia(g, alumnoId) {
  const a = g.alumnos.find(x => x.id === alumnoId);
  if (!a) return;
  const fecha = estado.fecha;
  const actual = notaDelDia(g, fecha, alumnoId);
  const texto = await preguntarLargo('Nota del día', `${a.nombre} — ${fechaLarga(fecha)}`, actual);
  if (texto === null) return;

  if (texto) (g.notasDia[fecha] ??= {})[alumnoId] = texto;
  else if (g.notasDia[fecha]) delete g.notasDia[fecha][alumnoId];
  pintar();

  encolar(`nota de ${alumnoId}`,
    () => sb.from('asistencias').update({ nota: texto || null }).eq('alumno_id', alumnoId).eq('fecha', fecha),
    recargar);
}

function cambiarFecha(iso) {
  estado.fecha = iso;
  pintar();
}

// Actualiza solo el renglón tocado. Antes se rearmaba la lista completa en
// cada toque, lo que en un grupo de 45 se sentía lento y perdía el lugar
// donde ibas leyendo.
function actualizarFila(g, alumnoId, estadoNuevo) {
  const li = document.querySelector(`li[data-alumno="${alumnoId}"]`);
  if (!li) return;
  li.classList.toggle('sin-marcar', !estadoNuevo);
  for (const b of li.querySelectorAll('button[data-e]')) {
    b.setAttribute('aria-pressed', String(b.dataset.e === estadoNuevo));
  }

  // El botón de nota solo existe mientras el alumno tenga marca ese día.
  const nombreSpan = li.querySelector('.nombre');
  const notaBtn = nombreSpan.querySelector('.btn-nota');
  if (estadoNuevo) {
    if (!notaBtn) {
      const a = g.alumnos.find(x => x.id === alumnoId);
      nombreSpan.insertAdjacentHTML('beforeend',
        `<button class="btn-nota" data-nota="${alumnoId}" title="Agregar nota"
          aria-label="Nota para ${esc(a?.nombre || '')}">✎</button>`);
    }
  } else {
    notaBtn?.remove();
  }
}

function actualizarAvance(g) {
  const marcados = cuantosMarcados(g, estado.fecha);
  const total = g.alumnos.length;
  const conteo = $('#conteo');
  if (!conteo) return;
  conteo.textContent = `${marcados} de ${total} alumnos marcados`;
  $('#riel').style.width = `${total ? Math.round(marcados / total * 100) : 0}%`;
}

function marcar(g, alumnoId, valor) {
  const fechaHoy = estado.fecha;
  const dia = (g.registros[fechaHoy] ??= {});
  const quitar = dia[alumnoId] === valor;

  if (quitar) {
    delete dia[alumnoId];
    if (g.notasDia[fechaHoy]) delete g.notasDia[fechaHoy][alumnoId]; // la nota se va con la marca
  } else {
    dia[alumnoId] = valor;
  }
  if (!Object.keys(dia).length) delete g.registros[fechaHoy];

  actualizarFila(g, alumnoId, quitar ? undefined : valor);
  actualizarAvance(g);

  encolar(
    `marca ${valor} de ${alumnoId}`,
    () => quitar
      ? sb.from('asistencias').delete().eq('alumno_id', alumnoId).eq('fecha', fechaHoy)
      : sb.from('asistencias').upsert(
          { grupo_id: g.id, alumno_id: alumnoId, fecha: fechaHoy, estado: valor },
          { onConflict: 'alumno_id,fecha' }),
    recargar,
  );
}

function marcarTodos(g, queEstado) {
  const filas = g.alumnos.map(a => ({
    grupo_id: g.id, alumno_id: a.id, fecha: estado.fecha, estado: queEstado(a),
  }));
  g.registros[estado.fecha] = Object.fromEntries(filas.map(f => [f.alumno_id, f.estado]));
  for (const f of filas) actualizarFila(g, f.alumno_id, f.estado);
  actualizarAvance(g);
  encolar('marcar a todo el grupo',
    () => sb.from('asistencias').upsert(filas, { onConflict: 'alumno_id,fecha' }), recargar);
}

async function limpiarDia(g) {
  const ok = await confirmar('Borrar las marcas del día',
    `Se quitarán todas las marcas del ${fechaLarga(estado.fecha)} en ${g.nombre}.`, 'Borrar');
  if (!ok) return;
  const fecha = estado.fecha;
  delete g.registros[fecha];
  delete g.notasDia[fecha];
  pintar();
  encolar('limpiar el día',
    () => sb.from('asistencias').delete().eq('grupo_id', g.id).eq('fecha', fecha), recargar);
}

async function recargar() {
  await cargarTodo();
  pintar();
}

/* =====================================================================
   Alumnos
   ===================================================================== */

function pintarAlumnos(cont, g) {
  cont.innerHTML = `
    <h2 class="sec">${g.alumnos.length} alumno${g.alumnos.length === 1 ? '' : 's'} en ${esc(g.nombre)}</h2>
    ${g.alumnos.length > 8 ? `<input type="search" id="buscarAlumno" class="buscar"
      placeholder="Buscar alumno…" value="${esc(estado.busqueda)}" aria-label="Buscar alumno">` : ''}
    <ul class="alumnos">
      ${g.alumnos.map((a, i) => `<li data-alumno="${a.id}">
        <span class="num">${i + 1}</span><span class="nombre">${esc(a.nombre)}</span>
        <button class="btn enlace${a.notas ? ' con-nota' : ''}" data-notas="${a.id}"
          title="${a.notas ? esc(a.notas) : ''}">Notas</button>
        <button class="btn enlace" data-ed="${a.id}">Editar</button>
        <button class="btn enlace" data-del="${a.id}">Quitar</button></li>`).join('')
      || '<li><span class="nombre" style="color:var(--tinta-suave)">Todavía no hay nadie en la lista.</span></li>'}
    </ul>
    <label class="campo" for="nuevos">Escribe un nombre por renglón. Puedes pegar la lista completa de una vez.</label>
    <textarea id="nuevos" placeholder="Aguilar Ramírez, Sofía&#10;Bautista Cruz, Diego&#10;Castañeda Ortiz, Ximena"></textarea>
    <div class="acciones">
      <button class="btn primario" id="agregar">Agregar a la lista</button>
      <button class="btn" id="ordenar">Ordenar por apellido</button>
    </div>`;

  cont.querySelector('ul.alumnos').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.ed) editarAlumno(g, b.dataset.ed);
    if (b.dataset.del) quitarAlumno(g, b.dataset.del);
    if (b.dataset.notas) editarNotasAlumno(g, b.dataset.notas);
  });
  $('#agregar').onclick = () => agregarAlumnos(g);
  $('#ordenar').onclick = () => ordenarAlumnos(g);

  const buscar = $('#buscarAlumno');
  if (buscar) buscar.oninput = () => { estado.busqueda = buscar.value; aplicarBusqueda(cont, g); };
  aplicarBusqueda(cont, g);
}

async function editarNotasAlumno(g, id) {
  const a = g.alumnos.find(x => x.id === id);
  if (!a) return;
  const texto = await preguntarLargo('Notas del alumno', a.nombre, a.notas || '');
  if (texto === null) return;
  const previo = a.notas;
  a.notas = texto;
  pintar();
  const r = await directo(() => sb.from('alumnos').update({ notas: texto || null }).eq('id', id), 'Notas guardadas');
  if (!r) { a.notas = previo; pintar(); }
}

async function editarAlumno(g, id) {
  const a = g.alumnos.find(x => x.id === id);
  const nombre = await preguntar('Corregir el nombre', 'Nombre del alumno', a.nombre);
  if (!nombre) return;
  const previo = a.nombre;
  a.nombre = nombre;
  pintar();
  const r = await directo(() => sb.from('alumnos').update({ nombre }).eq('id', id), 'Nombre corregido');
  if (!r) { a.nombre = previo; pintar(); }
}

async function quitarAlumno(g, id) {
  const a = g.alumnos.find(x => x.id === id);
  const ok = await confirmar('Quitar alumno',
    `Se quita a ${a.nombre} de ${g.nombre} y se borran sus marcas de asistencia.`, 'Quitar');
  if (!ok) return;
  const r = await directo(() => sb.from('alumnos').delete().eq('id', id), 'Alumno quitado');
  if (!r) return;
  g.alumnos = g.alumnos.filter(x => x.id !== id);
  for (const d of Object.values(g.registros)) delete d[id];
  for (const d of Object.values(g.notasDia)) delete d[id];
  pintar();
}

async function agregarAlumnos(g) {
  const nombres = $('#nuevos').value.split('\n').map(s => s.trim()).filter(Boolean);
  if (!nombres.length) return avisar('Escribe al menos un nombre.', true);

  // Evita duplicados por pegar dos veces la misma lista.
  const yaEstan = new Set(g.alumnos.map(a => a.nombre.toLocaleLowerCase('es')));
  const repetidos = nombres.filter(n => yaEstan.has(n.toLocaleLowerCase('es')));
  if (repetidos.length) {
    const ok = await confirmar('Hay nombres repetidos',
      `${repetidos.slice(0, 3).join(', ')}${repetidos.length > 3 ? ` y ${repetidos.length - 3} más` : ''} ya están en la lista. ¿Los agrego de todos modos?`,
      'Agregar de todos modos');
    if (!ok) return;
  }

  let orden = g.alumnos.reduce((m, a) => Math.max(m, a.orden), 0);
  const filas = nombres.map(nombre => ({ grupo_id: g.id, nombre, orden: ++orden }));
  const r = await directo(() => sb.from('alumnos').insert(filas).select());
  if (!r) return;
  for (const d of r.data) g.alumnos.push({ id: d.id, nombre: d.nombre, orden: d.orden });
  g.alumnos.sort((a, b) => a.orden - b.orden);
  pintar();
  avisar(`${r.data.length} alumno${r.data.length === 1 ? '' : 's'} en la lista`);
}

async function ordenarAlumnos(g) {
  const previo = g.alumnos.map(a => ({ ...a }));
  g.alumnos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
  g.alumnos.forEach((a, i) => { a.orden = i + 1; });
  pintar();
  const r = await directo(() => sb.from('alumnos').upsert(
    g.alumnos.map(a => ({ id: a.id, grupo_id: g.id, nombre: a.nombre, orden: a.orden }))), 'Lista ordenada');
  if (!r) { g.alumnos = previo; pintar(); }
}

/* =====================================================================
   Reporte
   ===================================================================== */

// Convierte la selección del reporte ('ciclo'/'mes'/'rango') en el
// { desde, hasta } que entiende resumen().
function rangoActivo() {
  if (estado.rangoReporte === 'mes') {
    const [a, m] = hoy().split('-').map(Number);
    return { desde: `${hoy().slice(0, 7)}-01`, hasta: fechaISO(new Date(a, m, 0)) };
  }
  if (estado.rangoReporte === 'rango' && estado.rangoDesde && estado.rangoHasta) {
    return { desde: estado.rangoDesde, hasta: estado.rangoHasta };
  }
  return null;
}

function etiquetaSerie(etiqueta, agrupador) {
  if (agrupador === 'mes') {
    const [a, m] = etiqueta.split('-').map(Number);
    return `${MESES[m - 1].slice(0, 3)} ${String(a).slice(2)}`;
  }
  return fechaCorta(etiqueta);
}

function graficaTendencia(g) {
  let agrupador = 'semana';
  let serie = serieAsistencia(g, agrupador);
  if (serie.length > 16) { agrupador = 'mes'; serie = serieAsistencia(g, agrupador); }
  if (serie.length < 2) return '';

  return `
    <h2 class="sec">Tendencia del grupo</h2>
    <div class="grafica-tendencia" role="img" aria-label="Asistencia del grupo por ${agrupador}, de ${serie.length} bloques">
      ${serie.map(p => `
        <div class="barra-tend">
          <div class="marco"><span class="col" style="height:${p.pct ?? 0}%; background:${
            p.pct !== null && p.pct < UMBRAL_BAJO ? 'var(--rojo)' : 'var(--marino)'}"
            title="${esc(etiquetaSerie(p.etiqueta, agrupador))}: ${p.pct === null ? 'sin datos' : `${p.pct}%`}"></span></div>
          <span class="etq">${esc(etiquetaSerie(p.etiqueta, agrupador))}</span>
        </div>`).join('')}
    </div>`;
}

function pintarReporte(cont, g) {
  const dias = diasRegistrados(g);
  if (!dias.length || !g.alumnos.length) {
    cont.innerHTML = `<div class="vacio"><p>El reporte se llena solo conforme pases lista.
      Marca la asistencia de un día y vuelve aquí.</p></div>`;
    return;
  }

  const rango = rangoActivo();
  const diasEnRango = rango
    ? dias.filter(d => (!rango.desde || d >= rango.desde) && (!rango.hasta || d <= rango.hasta))
    : dias;
  const filas = resumen(g, rango);
  const prom = promedioAsistencia(filas);

  cont.innerHTML = `
    <div class="rango-reporte">
      <button class="btn${estado.rangoReporte === 'ciclo' ? ' primario' : ''}" data-rango="ciclo">Todo el ciclo</button>
      <button class="btn${estado.rangoReporte === 'mes' ? ' primario' : ''}" data-rango="mes">Este mes</button>
      <button class="btn${estado.rangoReporte === 'rango' ? ' primario' : ''}" data-rango="rango">Rango…</button>
      ${estado.rangoReporte === 'rango' ? `
        <input type="date" id="repDesde" value="${estado.rangoDesde}" aria-label="Desde">
        <span>al</span>
        <input type="date" id="repHasta" value="${estado.rangoHasta}" aria-label="Hasta">` : ''}
    </div>
    <h2 class="sec">${diasEnRango.length} día${diasEnRango.length === 1 ? '' : 's'} registrados${prom === null ? '' : ` · asistencia promedio ${prom}%`}</h2>
    <table>
      <thead><tr><th>Alumno</th><th>✓</th><th>R</th><th>F</th><th>J</th><th>Asistencia</th></tr></thead>
      <tbody>${filas.map(f => `<tr>
        <td>${esc(f.alumno.nombre)}</td><td>${f.A}</td><td>${f.R}</td><td>${f.F}</td><td>${f.J}</td>
        <td class="pct ${f.pct !== null && f.pct < UMBRAL_BAJO ? 'baja' : ''}">
          <span class="barra" style="width:${f.pct ?? 0}%"></span><span class="valor">${f.pct === null ? '—' : `${f.pct}%`}</span>
        </td>
      </tr>`).join('')}</tbody>
    </table>
    <p class="leyenda">La asistencia cuenta ✓ y R sobre los días en que el alumno tuvo marca.
      Las justificadas se muestran aparte. En rojo, quienes van por debajo del ${UMBRAL_BAJO}%.</p>

    ${graficaTendencia(g)}

    <div class="acciones">
      <button class="btn primario" id="csv">Descargar este grupo (CSV)</button>
      <button class="btn" id="imprimirRep">Imprimir el reporte</button>
    </div>`;

  for (const b of cont.querySelectorAll('[data-rango]')) {
    b.onclick = () => { estado.rangoReporte = b.dataset.rango; pintar(); };
  }
  $('#repDesde')?.addEventListener('change', e => { estado.rangoDesde = e.target.value; pintar(); });
  $('#repHasta')?.addEventListener('change', e => { estado.rangoHasta = e.target.value; pintar(); });

  $('#csv').onclick = () => bajar(aCsv(csvDeGrupo(g)), `asistencia-${limpio(g.nombre)}.csv`, 'text/csv');
  $('#imprimirRep').onclick = () => window.print();
}

/* =====================================================================
   Descargas y respaldo
   ===================================================================== */

function pintarDescargas(cont) {
  cont.innerHTML = `
    <h2 class="sec">Descarga tu información cuando quieras</h2>
    <p class="nota">Todo vive en la base de datos de la escuela. Estas descargas son copias
      que se arman en el momento, con lo que hay guardado ahora mismo.</p>
    <div class="acciones">
      <button class="btn primario" id="todoCsv">Todos los grupos (CSV)</button>
      <button class="btn" id="todoJson">Respaldo completo (JSON)</button>
    </div>
    <h2 class="sec">Restaurar desde un respaldo</h2>
    <p class="nota">Sube un archivo JSON descargado antes. Los grupos se agregan como nuevos;
      nada de lo que ya tienes se borra ni se reemplaza.</p>
    <div class="acciones">
      <input type="file" id="archivo" accept="application/json,.json">
      <button class="btn" id="restaurar">Restaurar</button>
    </div>`;

  $('#todoCsv').onclick = () => {
    const lineas = csvDeTodo(estado.grupos);
    if (lineas.length === 1) return avisar('Todavía no hay asistencias registradas.', true);
    bajar(aCsv(lineas), `asistencia-completa-${hoy()}.csv`, 'text/csv');
  };
  $('#todoJson').onclick = () =>
    bajar(JSON.stringify(armarRespaldo(estado.grupos), null, 2),
      `respaldo-asistencia-${hoy()}.json`, 'application/json');
  $('#restaurar').onclick = restaurar;
}

async function restaurar() {
  const archivo = $('#archivo').files[0];
  if (!archivo) return avisar('Primero elige un archivo.', true);

  let copia;
  try { copia = leerRespaldo(await archivo.text()); }
  catch { return avisar('Ese archivo no es un respaldo válido.', true); }

  const ok = await confirmar('Restaurar respaldo',
    `Se agregarán ${copia.grupos.length} grupo${copia.grupos.length === 1 ? '' : 's'} del respaldo, sin tocar los que ya tienes.`,
    'Restaurar');
  if (!ok) return;

  const btn = $('#restaurar');
  btn.disabled = true;
  btn.textContent = 'Restaurando…';
  try {
    for (const g of copia.grupos) {
      const ng = await sb.from('grupos').insert({ nombre: `${g.nombre} (restaurado)` }).select().single();
      if (ng.error) throw ng.error;

      const alumnos = (g.alumnos || []).map((a, i) => ({
        grupo_id: ng.data.id, nombre: a.nombre, orden: a.orden ?? i + 1, notas: a.notas || null,
      }));
      if (!alumnos.length) continue;

      const nuevos = await sb.from('alumnos').insert(alumnos).select();
      if (nuevos.error) throw nuevos.error;

      const mapa = new Map();
      (g.alumnos || []).forEach((a, i) => { if (nuevos.data[i]) mapa.set(a.id, nuevos.data[i].id); });

      const marcas = [];
      for (const [fecha, dia] of Object.entries(g.registros || {})) {
        for (const [viejo, e] of Object.entries(dia)) {
          if (mapa.has(viejo)) {
            const nota = (g.notasDia?.[fecha] || {})[viejo] || null;
            marcas.push({ grupo_id: ng.data.id, alumno_id: mapa.get(viejo), fecha, estado: e, nota });
          }
        }
      }
      for (let i = 0; i < marcas.length; i += 500) {
        const r = await sb.from('asistencias').insert(marcas.slice(i, i + 500));
        if (r.error) throw r.error;
      }
    }
    await recargar();
    avisar('Respaldo restaurado');
  } catch (err) {
    console.error(err);
    avisar(`Falló la restauración: ${traducirError(err.message)}`, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Restaurar';
  }
}

function bajar(texto, nombre, tipo) {
  const url = URL.createObjectURL(new Blob([texto], { type: `${tipo};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* =====================================================================
   Grupos
   ===================================================================== */

async function nuevoGrupo() {
  const nombre = await preguntar('Nuevo grupo', 'Nombre del grupo', '');
  if (!nombre) return;
  const r = await directo(() => sb.from('grupos').insert({ nombre }).select().single(), 'Grupo creado');
  if (!r) return;
  estado.grupos.push({ id: r.data.id, nombre: r.data.nombre, alumnos: [], registros: {}, notasDia: {} });
  estado.activo = r.data.id;
  estado.vista = 'alumnos';
  pintar();
}

async function renombrarGrupo() {
  const g = grupoActivo();
  if (!g) return;
  const nombre = await preguntar('Cambiar el nombre del grupo', 'Nombre del grupo', g.nombre);
  if (!nombre) return;
  const previo = g.nombre;
  g.nombre = nombre;
  pintar();
  const r = await directo(() => sb.from('grupos').update({ nombre }).eq('id', g.id), 'Nombre cambiado');
  if (!r) { g.nombre = previo; pintar(); }
}

async function borrarGrupo() {
  const g = grupoActivo();
  if (!g) return;
  const ok = await confirmar('Borrar grupo',
    `Se borra ${g.nombre} con sus ${g.alumnos.length} alumnos y todas sus listas. Esto no se puede deshacer.`,
    'Borrar el grupo');
  if (!ok) return;
  const r = await directo(() => sb.from('grupos').delete().eq('id', g.id), 'Grupo borrado');
  if (!r) return;
  estado.grupos = estado.grupos.filter(x => x.id !== g.id);
  estado.activo = estado.grupos[0]?.id ?? null;
  pintar();
}

/* =====================================================================
   Calendario del mes (pasar lista)
   ===================================================================== */

let calMostrado = null; // 'YYYY-MM' del mes que se está mostrando

function mesSiguiente(ym) {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(a, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesAnterior(ym) {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(a, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function abrirCalendario(g) {
  calMostrado = estado.fecha.slice(0, 7);
  pintarCalendario(g);
  $('#dlgCalendario').showModal();
}

function pintarCalendario(g) {
  const [a, m] = calMostrado.split('-').map(Number);
  $('#calTitulo').textContent = `${MESES[m - 1]} ${a}`;

  const offset = (new Date(a, m - 1, 1).getDay() + 6) % 7; // lunes=0 … domingo=6
  const totalDias = new Date(a, m, 0).getDate();

  let celdas = '';
  for (let i = 0; i < offset; i++) celdas += '<span></span>';
  for (let d = 1; d <= totalDias; d++) {
    const iso = `${calMostrado}-${String(d).padStart(2, '0')}`;
    const marcado = cuantosMarcados(g, iso) > 0;
    celdas += `<button class="cal-dia${esFinDeSemana(iso) ? ' finde' : ''}${iso === estado.fecha ? ' sel' : ''}${marcado ? ' marcado' : ''}"
      data-fecha="${iso}">${d}</button>`;
  }

  $('#calDias').innerHTML = '<span class="cal-etq">L</span><span class="cal-etq">M</span><span class="cal-etq">M</span>'
    + '<span class="cal-etq">J</span><span class="cal-etq">V</span><span class="cal-etq">S</span><span class="cal-etq">D</span>'
    + celdas;

  for (const b of $$('#calDias button[data-fecha]')) {
    b.onclick = () => { cambiarFecha(b.dataset.fecha); $('#dlgCalendario').close(); };
  }
}

$('#calAnt').onclick = () => { calMostrado = mesAnterior(calMostrado); pintarCalendario(grupoActivo()); };
$('#calSig').onclick = () => { calMostrado = mesSiguiente(calMostrado); pintarCalendario(grupoActivo()); };
$('#calCerrar').onclick = () => $('#dlgCalendario').close();

/* =====================================================================
   Compartir grupo entre maestros

   Se apoya en tres funciones de la base de datos (invitar_maestro,
   maestros_del_grupo, quitar_maestro): cada una comprueba ahí mismo que
   quien llama tenga permiso, así que aquí solo hay que mostrar lo que
   regresan y traducir el error si algo se rechaza.
   ===================================================================== */

async function abrirCompartir(g) {
  $('#errorCompartir').hidden = true;
  $('#compartirSub').textContent = `Quién tiene acceso a ${g.nombre}.`;
  $('#listaMaestros').innerHTML = '<li>Cargando…</li>';
  $('#invitarBloque').hidden = true;
  $('#dlgCompartir').showModal();
  await pintarMaestros(g);
}

async function pintarMaestros(g) {
  const { data, error } = await sb.rpc('maestros_del_grupo', { p_grupo_id: g.id });
  if (error) {
    $('#listaMaestros').innerHTML = '';
    $('#errorCompartir').textContent = traducirError(error.message);
    $('#errorCompartir').hidden = false;
    return;
  }

  const yo = estado.sesion.user.id;
  const soyDueno = data.some(m => m.user_id === yo && m.rol === 'dueño');
  $('#invitarBloque').hidden = !soyDueno;

  $('#listaMaestros').innerHTML = data.map(m => `
    <li>
      <span>${esc(m.correo)}${m.user_id === yo ? ' (tú)' : ''}</span>
      <span class="rol-etq">${m.rol === 'dueño' ? 'Dueño' : 'Colaborador'}</span>
      ${soyDueno && m.user_id !== yo ? `<button class="btn enlace" data-quitar="${m.user_id}">Quitar</button>` : ''}
    </li>`).join('') || '<li>Nadie más tiene acceso todavía.</li>';

  for (const b of $$('#listaMaestros button[data-quitar]')) {
    b.onclick = () => quitarMaestro(g, b.dataset.quitar);
  }
}

async function invitarMaestro(g) {
  const correo = $('#correoInvitar').value.trim();
  $('#errorCompartir').hidden = true;
  if (!correo) return;

  const btn = $('#btnInvitar');
  btn.disabled = true;
  const { error } = await sb.rpc('invitar_maestro', { p_grupo_id: g.id, p_correo: correo });
  btn.disabled = false;

  if (error) {
    $('#errorCompartir').textContent = traducirError(error.message);
    $('#errorCompartir').hidden = false;
    return;
  }
  $('#correoInvitar').value = '';
  avisar('Maestro invitado');
  await pintarMaestros(g);
}

async function quitarMaestro(g, userId) {
  const ok = await confirmar('Quitar maestro', 'Deja de tener acceso a este grupo de inmediato.', 'Quitar');
  if (!ok) return;

  const { error } = await sb.rpc('quitar_maestro', { p_grupo_id: g.id, p_user_id: userId });
  if (error) { avisar(traducirError(error.message), true); return; }
  avisar('Maestro quitado');
  await pintarMaestros(g);
}

$('#btnCompartir').onclick = () => { const g = grupoActivo(); if (g) abrirCompartir(g); };
$('#btnInvitar').onclick = () => { const g = grupoActivo(); if (g) invitarMaestro(g); };
$('#cerrarCompartir').onclick = () => $('#dlgCompartir').close();
$('#correoInvitar').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); $('#btnInvitar').click(); }
});

/* =====================================================================
   Enlaces con la pantalla
   ===================================================================== */

$('#selGrupo').onchange = e => { estado.activo = e.target.value; pintar(); };
$('#btnNuevoGrupo').onclick = nuevoGrupo;
$('#btnRenombrar').onclick = renombrarGrupo;
$('#btnBorrarGrupo').onclick = borrarGrupo;

$('#btnSalir').onclick = async () => {
  if (cola.length) {
    const ok = await confirmar('Todavía hay marcas sin enviar',
      'Si sales ahora se pierden. Espera a que aparezca "Guardado" o revisa tu conexión.', 'Salir de todos modos');
    if (!ok) return;
  }
  await sb.auth.signOut();
  location.reload();
};

for (const b of $$('nav.pestanas button')) {
  b.onclick = () => { estado.vista = b.dataset.v; pintar(); };
}

$('#btnPrincipal').onclick = enviarAcceso;
$('#btnCambiarModo').onclick = () => {
  estado.modo = estado.modo === 'registro' ? 'entrar' : 'registro';
  pintarAcceso();
};
for (const s of ['#correo', '#pass', '#pass2', '#nombreMaestro']) {
  $(s).addEventListener('keydown', e => { if (e.key === 'Enter') enviarAcceso(); });
}

// Errores que se escapan de un try: mejor un aviso claro que una pantalla muda.
window.addEventListener('unhandledrejection', ev => {
  console.error(ev.reason);
  avisar(traducirError(ev.reason?.message), true);
});

iniciar();
