// =====================================================================
//  Lógica del registro de asistencia.
//  Este archivo no toca el navegador ni la red: solo transforma datos.
//  Así se puede probar por separado y se lee sin distracciones.
// =====================================================================

export const ESTADOS = [
  { e: 'A', etq: '✓', nom: 'Asistencia' },
  { e: 'F', etq: 'F', nom: 'Falta' },
  { e: 'R', etq: 'R', nom: 'Retardo' },
  { e: 'J', etq: 'J', nom: 'Justificada' },
];

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* ------------------------------ fechas ------------------------------ */

// Siempre en hora local: usar toISOString() adelantaría el día en México.
export function fechaISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const hoy = () => fechaISO(new Date());

export function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return `${DIAS[new Date(a, m - 1, d).getDay()]} ${d} de ${MESES[m - 1]}`;
}

export function mueveDia(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  return fechaISO(new Date(a, m - 1, d + n));
}

export function esFinDeSemana(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const dia = new Date(a, m - 1, d).getDay();
  return dia === 0 || dia === 6;
}

export function fechaCorta(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1].slice(0, 3)}`;
}

// Lunes de la semana a la que pertenece la fecha, para agrupar por semana.
function claveSemana(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(a, m - 1, d);
  const diaSemana = (dt.getDay() + 6) % 7; // lunes=0 … domingo=6
  dt.setDate(dt.getDate() - diaSemana);
  return fechaISO(dt);
}

// El ciclo escolar arranca en agosto.
export function cicloEscolar(hoyD = new Date()) {
  const a = hoyD.getFullYear();
  return hoyD.getMonth() >= 7 ? `Ciclo escolar ${a}\u2013${a + 1}` : `Ciclo escolar ${a - 1}\u2013${a}`;
}

/* ------------------------------ textos ------------------------------ */

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function limpio(s) {
  return String(s).replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '').trim().replace(/\s+/g, '-') || 'grupo';
}

// Para buscar alumnos sin que importen acentos ni mayúsculas.
export function normaliza(s) {
  const marcas = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');
  return String(s).normalize('NFD').replace(marcas, '').toLowerCase();
}

// Los mensajes de Supabase llegan en inglés; se traducen los de cada día.
const TRADUCCIONES = [
  [/invalid login credentials/i, 'El correo o la contraseña no coinciden.'],
  [/email not confirmed/i, 'Falta confirmar tu correo. Busca el mensaje que te enviamos.'],
  [/user already registered|already been registered/i, 'Ese correo ya tiene cuenta. Entra con tu contraseña.'],
  [/password should be at least/i, 'La contraseña necesita al menos 6 caracteres.'],
  [/signups? not allowed|signup is disabled/i, 'El registro está cerrado en este momento.'],
  [/unable to validate email|invalid email/i, 'Ese correo no parece válido.'],
  [/for security purposes|rate limit|too many requests/i, 'Demasiados intentos seguidos. Espera un minuto.'],
  [/jwt expired|invalid claim|session.*expired/i, 'Tu sesión se venció. Entra otra vez.'],
  [/failed to fetch|network|load failed/i, 'Sin conexión en este momento.'],
  [/row-level security|permission denied/i,
    'No tienes permiso para hacer esto. Puede que ya no seas el dueño de este grupo.'],
];

export function traducirError(msg) {
  const t = String(msg || '');
  for (const [re, texto] of TRADUCCIONES) if (re.test(t)) return texto;
  return t || 'Ocurrió un error.';
}

// Distingue "se cayó la red" de "el servidor rechazó la operación": lo primero
// se reintenta solo, lo segundo hay que avisarlo.
export function esFallaDeRed(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const t = `${err?.message || ''} ${err?.name || ''}`;
  return /failed to fetch|networkerror|load failed|timeout|aborterror/i.test(t);
}

/* --------------------------- armado de datos --------------------------- */

// Une las cuatro tablas en la forma que la pantalla necesita. La nota de
// cada marca vive aparte, en notasDia, para no tocar el resto del código
// que ya espera que registros[fecha][alumnoId] sea nada más el estado.
export function armarGrupos(grupos, alumnos, asistencias) {
  const armados = grupos.map(g => ({ id: g.id, nombre: g.nombre, alumnos: [], registros: {}, notasDia: {} }));
  const porId = new Map(armados.map(g => [g.id, g]));

  for (const a of alumnos) {
    porId.get(a.grupo_id)?.alumnos.push({ id: a.id, nombre: a.nombre, orden: a.orden, notas: a.notas || '' });
  }
  for (const g of armados) g.alumnos.sort((x, y) => x.orden - y.orden);

  for (const r of asistencias) {
    const g = porId.get(r.grupo_id);
    if (!g) continue;
    (g.registros[r.fecha] ??= {})[r.alumno_id] = r.estado;
    if (r.nota) (g.notasDia[r.fecha] ??= {})[r.alumno_id] = r.nota;
  }
  return armados;
}

export const diasRegistrados = g => Object.keys(g.registros).sort();

export function marcasDelDia(g, fecha) {
  return g.registros[fecha] || {};
}

export function notaDelDia(g, fecha, alumnoId) {
  return (g.notasDia[fecha] || {})[alumnoId] || '';
}

export function cuantosMarcados(g, fecha) {
  const d = marcasDelDia(g, fecha);
  return g.alumnos.reduce((n, a) => n + (d[a.id] ? 1 : 0), 0);
}

// El primer día hábil antes de hoy (saltando fin de semana) que se quedó
// sin ninguna marca, o null si ya se pasó lista ese día.
export function diaHabilAnteriorSinMarcar(g, hoyIso = hoy()) {
  if (!g.alumnos.length) return null;
  let iso = mueveDia(hoyIso, -1);
  while (esFinDeSemana(iso)) iso = mueveDia(iso, -1);
  return cuantosMarcados(g, iso) === 0 ? iso : null;
}

/* ------------------------------ reporte ------------------------------ */

// La asistencia cuenta ✓ y R sobre los días en que el alumno tuvo marca.
// Las justificadas se informan aparte: no son falta, pero tampoco presencia.
// `rango`, si se da, acota el conteo a { desde, hasta } (fechas ISO).
export function resumen(g, rango) {
  let dias = diasRegistrados(g);
  if (rango?.desde) dias = dias.filter(d => d >= rango.desde);
  if (rango?.hasta) dias = dias.filter(d => d <= rango.hasta);

  return g.alumnos.map(a => {
    const cuenta = { A: 0, F: 0, R: 0, J: 0 };
    let reg = 0;
    for (const d of dias) {
      const e = g.registros[d][a.id];
      if (!e) continue;
      reg++;
      cuenta[e]++;
    }
    return {
      alumno: a, ...cuenta, reg,
      pct: reg ? Math.round((cuenta.A + cuenta.R) / reg * 100) : null,
    };
  });
}

export function promedioAsistencia(filas) {
  const con = filas.filter(f => f.pct !== null);
  if (!con.length) return null;
  return Math.round(con.reduce((s, f) => s + f.pct, 0) / con.length);
}

// Tendencia del grupo completo, agrupada por semana o por mes: el % de
// asistencia (✓ y R sobre el total de marcas) de cada bloque de días.
export function serieAsistencia(g, agruparPor = 'semana') {
  const clave = agruparPor === 'mes' ? (f => f.slice(0, 7)) : claveSemana;
  const buckets = new Map();

  for (const fecha of diasRegistrados(g)) {
    const k = clave(fecha);
    const b = buckets.get(k) || buckets.set(k, { presentes: 0, total: 0 }).get(k);
    for (const e of Object.values(g.registros[fecha])) {
      b.total++;
      if (e === 'A' || e === 'R') b.presentes++;
    }
  }

  return [...buckets.entries()]
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([etiqueta, b]) => ({ etiqueta, pct: b.total ? Math.round(b.presentes / b.total * 100) : null }));
}

export const UMBRAL_BAJO = 80;

/* ------------------------------ archivos ------------------------------ */

// El BOM inicial es lo que hace que Excel abra los acentos correctamente.
export function aCsv(lineas) {
  return '\uFEFF' + lineas
    .map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
}

export function csvDeGrupo(g) {
  const dias = diasRegistrados(g);
  const filas = resumen(g);
  const lineas = [['Alumno', ...dias, 'Asistencias', 'Retardos', 'Faltas', 'Justificadas', '% asistencia']];
  for (const f of filas) {
    lineas.push([
      f.alumno.nombre,
      ...dias.map(d => g.registros[d][f.alumno.id] || ''),
      f.A, f.R, f.F, f.J,
      f.pct === null ? '' : `${f.pct}%`,
    ]);
  }
  return lineas;
}

export function csvDeTodo(grupos) {
  const nombre = { A: 'Asistencia', F: 'Falta', R: 'Retardo', J: 'Justificada' };
  const lineas = [['Grupo', 'Alumno', 'Fecha', 'Estado', 'Significado', 'Nota']];
  for (const g of grupos) {
    const alumnos = new Map(g.alumnos.map(a => [a.id, a.nombre]));
    for (const fecha of diasRegistrados(g)) {
      for (const [id, e] of Object.entries(g.registros[fecha])) {
        if (alumnos.has(id)) lineas.push([g.nombre, alumnos.get(id), fecha, e, nombre[e], notaDelDia(g, fecha, id)]);
      }
    }
  }
  return lineas;
}

export function armarRespaldo(grupos) {
  return { version: 2, exportado: new Date().toISOString(), grupos };
}

export function leerRespaldo(texto) {
  const copia = JSON.parse(texto);
  if (!copia || !Array.isArray(copia.grupos)) throw new Error('Ese archivo no es un respaldo válido.');
  return copia;
}
