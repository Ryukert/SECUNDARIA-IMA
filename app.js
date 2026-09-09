// =====================================================================
//  Registro de asistencia — pantalla y conexión con Supabase.
//  La lógica sin navegador vive en logica.js.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ESTADOS, hoy, fechaLarga, mueveDia, esFinDeSemana, cicloEscolar,
  esc, limpio, traducirError, esFallaDeRed,
  armarGrupos, diasRegistrados, marcasDelDia, cuantosMarcados,
  resumen, promedioAsistencia, UMBRAL_BAJO,
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
};

const grupoActivo = () => estado.grupos.find(g => g.id === estado.activo) || null;

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

function dialogo({ titulo, texto = '', etiqueta = '', valor = '', aceptar = 'Aceptar', peligro = false }) {
  const dlg = $('#dialogo');
  $('#dlgTitulo').textContent = titulo;
  $('#dlgTexto').textContent = texto;
  $('#dlgTexto').hidden = !texto;
  $('#dlgEtiqueta').textContent = etiqueta;
  $('#dlgEtiqueta').hidden = !etiqueta;
  $('#dlgCampo').hidden = !etiqueta;
  $('#dlgCampo').value = valor;
  $('#dlgAceptar').textContent = aceptar;
  $('#dlgAceptar').classList.toggle('peligro', peligro);
  $('#dlgAceptar').classList.toggle('primario', !peligro);

  dlg.showModal();
  if (etiqueta) requestAnimationFrame(() => { $('#dlgCampo').focus(); $('#dlgCampo').select(); });

  return new Promise(resolver => {
    dlg.addEventListener('close', () => {
      const ok = dlg.returnValue === 'aceptar';
      if (!ok) return resolver(null);
      resolver(etiqueta ? $('#dlgCampo').value.trim() : true);
    }, { once: true });
  });
}

const preguntar = (titulo, etiqueta, valor) => dialogo({ titulo, etiqueta, valor, aceptar: 'Guardar' });
const confirmar = (titulo, texto, aceptar = 'Sí, continuar') =>
  dialogo({ titulo, texto, aceptar, peligro: true });

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

  if (window.ERROR_CONFIG || !window.SUPABASE_URL) {
    $('#cargando').textContent = window.ERROR_CONFIG ||
      'No llegó la configuración. Si estás probando en tu computadora, crea config.local.js; si ya está publicada, revisa las variables de entorno en Vercel.';
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

  cont.innerHTML = `
    <div class="cabezal-dia">
      <div class="fecha-barra">
        <h1 class="fecha-larga">${fechaLarga(estado.fecha)}</h1>
        <div class="flechas">
          <button id="ant" aria-label="Día anterior">←</button>
          <button id="sig" aria-label="Día siguiente">→</button>
        </div>
        <input type="date" id="inpFecha" value="${estado.fecha}" aria-label="Elegir fecha">
        ${estado.fecha !== hoy() ? '<button class="btn" id="irHoy">Ir a hoy</button>' : ''}
      </div>
      ${esFinDeSemana(estado.fecha) ? '<p class="nota aviso-dia">Este día cae en fin de semana.</p>' : ''}
      <div class="avance" aria-live="polite">
        <span id="conteo"></span>
        <div class="riel"><span id="riel"></span></div>
      </div>
    </div>

    <ol class="lista">
      ${g.alumnos.map((a, i) => `
        <li data-alumno="${a.id}" class="${dia[a.id] ? '' : 'sin-marcar'}">
          <span class="num">${i + 1}</span>
          <span class="nombre">${esc(a.nombre)}</span>
          <span class="marcas">
            ${ESTADOS.map(s => `<button data-a="${a.id}" data-e="${s.e}"
              aria-pressed="${dia[a.id] === s.e}" title="${s.nom}"
              aria-label="${s.nom} para ${esc(a.nombre)}">${s.etq}</button>`).join('')}
          </span>
        </li>`).join('')}
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
  $('#imprimirDia').onclick = () => window.print();
  $('#todosPresentes').onclick = () => marcarTodos(g, () => 'A');
  $('#faltanLosDemas').onclick = () => marcarTodos(g, a => marcasDelDia(g, estado.fecha)[a.id] || 'F');
  $('#limpiarDia').onclick = () => limpiarDia(g);

  // Un solo escuchador para toda la lista, en vez de uno por botón.
  cont.querySelector('ol.lista').addEventListener('click', ev => {
    const boton = ev.target.closest('button[data-a]');
    if (boton) marcar(g, boton.dataset.a, boton.dataset.e);
  });
}

function cambiarFecha(iso) {
  estado.fecha = iso;
  pintar();
}

// Actualiza solo el renglón tocado. Antes se rearmaba la lista completa en
// cada toque, lo que en un grupo de 45 se sentía lento y perdía el lugar
// donde ibas leyendo.
function actualizarFila(alumnoId, estadoNuevo) {
  const li = document.querySelector(`li[data-alumno="${alumnoId}"]`);
  if (!li) return;
  li.classList.toggle('sin-marcar', !estadoNuevo);
  for (const b of li.querySelectorAll('button[data-e]')) {
    b.setAttribute('aria-pressed', String(b.dataset.e === estadoNuevo));
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
  const dia = (g.registros[estado.fecha] ??= {});
  const quitar = dia[alumnoId] === valor;

  if (quitar) delete dia[alumnoId]; else dia[alumnoId] = valor;
  if (!Object.keys(dia).length) delete g.registros[estado.fecha];

  actualizarFila(alumnoId, quitar ? undefined : valor);
  actualizarAvance(g);

  const fecha = estado.fecha;
  encolar(
    `marca ${valor} de ${alumnoId}`,
    () => quitar
      ? sb.from('asistencias').delete().eq('alumno_id', alumnoId).eq('fecha', fecha)
      : sb.from('asistencias').upsert(
          { grupo_id: g.id, alumno_id: alumnoId, fecha, estado: valor },
          { onConflict: 'alumno_id,fecha' }),
    recargar,
  );
}

function marcarTodos(g, queEstado) {
  const filas = g.alumnos.map(a => ({
    grupo_id: g.id, alumno_id: a.id, fecha: estado.fecha, estado: queEstado(a),
  }));
  g.registros[estado.fecha] = Object.fromEntries(filas.map(f => [f.alumno_id, f.estado]));
  for (const f of filas) actualizarFila(f.alumno_id, f.estado);
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
    <ul class="alumnos">
      ${g.alumnos.map((a, i) => `<li data-alumno="${a.id}">
        <span class="num">${i + 1}</span><span class="nombre">${esc(a.nombre)}</span>
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
  });
  $('#agregar').onclick = () => agregarAlumnos(g);
  $('#ordenar').onclick = () => ordenarAlumnos(g);
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

function pintarReporte(cont, g) {
  const dias = diasRegistrados(g);
  if (!dias.length || !g.alumnos.length) {
    cont.innerHTML = `<div class="vacio"><p>El reporte se llena solo conforme pases lista.
      Marca la asistencia de un día y vuelve aquí.</p></div>`;
    return;
  }
  const filas = resumen(g);
  const prom = promedioAsistencia(filas);

  cont.innerHTML = `
    <h2 class="sec">${dias.length} día${dias.length === 1 ? '' : 's'} registrados${prom === null ? '' : ` · asistencia promedio ${prom}%`}</h2>
    <table>
      <thead><tr><th>Alumno</th><th>✓</th><th>R</th><th>F</th><th>J</th><th>Asistencia</th></tr></thead>
      <tbody>${filas.map(f => `<tr>
        <td>${esc(f.alumno.nombre)}</td><td>${f.A}</td><td>${f.R}</td><td>${f.F}</td><td>${f.J}</td>
        <td class="pct ${f.pct !== null && f.pct < UMBRAL_BAJO ? 'baja' : ''}">${f.pct === null ? '—' : `${f.pct}%`}</td>
      </tr>`).join('')}</tbody>
    </table>
    <p class="leyenda">La asistencia cuenta ✓ y R sobre los días en que el alumno tuvo marca.
      Las justificadas se muestran aparte. En rojo, quienes van por debajo del ${UMBRAL_BAJO}%.</p>
    <div class="acciones">
      <button class="btn primario" id="csv">Descargar este grupo (CSV)</button>
      <button class="btn" id="imprimirRep">Imprimir el reporte</button>
    </div>`;

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
        grupo_id: ng.data.id, nombre: a.nombre, orden: a.orden ?? i + 1,
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
            marcas.push({ grupo_id: ng.data.id, alumno_id: mapa.get(viejo), fecha, estado: e });
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
  estado.grupos.push({ id: r.data.id, nombre: r.data.nombre, alumnos: [], registros: {} });
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
