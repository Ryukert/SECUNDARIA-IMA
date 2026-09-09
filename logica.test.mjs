// Pruebas de logica.js. Se corren con:  node --test
// No necesitan navegador ni conexión a Supabase.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fechaISO, fechaLarga, mueveDia, esFinDeSemana, cicloEscolar,
  esc, limpio, traducirError, esFallaDeRed,
  armarGrupos, resumen, promedioAsistencia, cuantosMarcados,
  aCsv, csvDeGrupo, csvDeTodo, leerRespaldo,
} from './logica.js';

test('las fechas se manejan en hora local, sin adelantar el día', () => {
  // A las 20:00 en México, toISOString() ya diría el día siguiente.
  assert.equal(fechaISO(new Date(2026, 8, 8, 20, 30)), '2026-09-08');
  assert.equal(fechaLarga('2026-09-08'), 'martes 8 de septiembre');
});

test('moverse de día cruza meses y años bien', () => {
  assert.equal(mueveDia('2026-09-30', 1), '2026-10-01');
  assert.equal(mueveDia('2026-01-01', -1), '2025-12-31');
  assert.equal(mueveDia('2028-02-28', 1), '2028-02-29');
});

test('reconoce los fines de semana', () => {
  assert.equal(esFinDeSemana('2026-09-12'), true);
  assert.equal(esFinDeSemana('2026-09-08'), false);
});

test('el ciclo escolar arranca en agosto', () => {
  assert.equal(cicloEscolar(new Date(2026, 8, 1)), 'Ciclo escolar 2026\u20132027');
  assert.equal(cicloEscolar(new Date(2026, 4, 1)), 'Ciclo escolar 2025\u20132026');
});

test('los nombres se escapan antes de entrar al HTML', () => {
  assert.equal(esc('<b>Ana</b> & "Luis"'), '&lt;b&gt;Ana&lt;/b&gt; &amp; &quot;Luis&quot;');
  assert.equal(limpio('3° B — Matemáticas'), '3-B-Matemáticas');
  assert.equal(limpio('///'), 'grupo');
});

test('traduce los errores de Supabase y distingue la falta de red', () => {
  assert.equal(traducirError('Invalid login credentials'), 'El correo o la contraseña no coinciden.');
  assert.equal(esFallaDeRed(new Error('Failed to fetch')), true);
  assert.equal(esFallaDeRed(new Error('duplicate key value')), false);
});

const grupos = [{ id: 'g1', nombre: '3° B' }];
const alumnos = [
  { id: 'a2', grupo_id: 'g1', nombre: 'Bautista, Diego', orden: 2 },
  { id: 'a1', grupo_id: 'g1', nombre: 'Aguilar, Sofía', orden: 1 },
  { id: 'a9', grupo_id: 'gX', nombre: 'De otro grupo', orden: 1 },
];
const asistencias = [
  { grupo_id: 'g1', alumno_id: 'a1', fecha: '2026-09-07', estado: 'A' },
  { grupo_id: 'g1', alumno_id: 'a1', fecha: '2026-09-08', estado: 'R' },
  { grupo_id: 'g1', alumno_id: 'a2', fecha: '2026-09-07', estado: 'F' },
  { grupo_id: 'g1', alumno_id: 'a2', fecha: '2026-09-08', estado: 'J' },
  { grupo_id: 'gX', alumno_id: 'a9', fecha: '2026-09-08', estado: 'A' },
];

test('arma los grupos en orden y descarta lo que no les pertenece', () => {
  const [g] = armarGrupos(grupos, alumnos, asistencias);
  assert.deepEqual(g.alumnos.map(a => a.nombre), ['Aguilar, Sofía', 'Bautista, Diego']);
  assert.equal(g.alumnos.length, 2, 'el alumno de otro grupo no debe colarse');
  assert.deepEqual(g.registros['2026-09-08'], { a1: 'R', a2: 'J' });
});

test('el reporte cuenta retardo como asistencia y justificada aparte', () => {
  const [g] = armarGrupos(grupos, alumnos, asistencias);
  const [sofia, diego] = resumen(g);

  assert.equal(sofia.A, 1);
  assert.equal(sofia.R, 1);
  assert.equal(sofia.pct, 100, 'asistencia + retardo = presente los dos días');

  assert.equal(diego.F, 1);
  assert.equal(diego.J, 1);
  assert.equal(diego.pct, 0, 'la justificada no cuenta como presencia');

  assert.equal(promedioAsistencia([sofia, diego]), 50);
  assert.equal(promedioAsistencia([{ pct: null }]), null, 'sin datos no inventa un promedio');
});

test('cuenta cuántos van marcados en el día', () => {
  const [g] = armarGrupos(grupos, alumnos, asistencias);
  assert.equal(cuantosMarcados(g, '2026-09-08'), 2);
  assert.equal(cuantosMarcados(g, '2026-09-09'), 0);
});

test('el CSV escapa las comillas y lleva BOM para que Excel lea los acentos', () => {
  const csv = aCsv([['Alumno'], ['Peña "el Güero"']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Peña ""el Güero"""'));
});

test('el CSV del grupo trae una columna por día', () => {
  const [g] = armarGrupos(grupos, alumnos, asistencias);
  const [encabezado, primera] = csvDeGrupo(g);
  assert.deepEqual(encabezado.slice(0, 3), ['Alumno', '2026-09-07', '2026-09-08']);
  assert.deepEqual(primera.slice(0, 3), ['Aguilar, Sofía', 'A', 'R']);
  assert.equal(primera.at(-1), '100%');
});

test('el CSV completo pone un renglón por marca', () => {
  const [g] = armarGrupos(grupos, alumnos, asistencias);
  const lineas = csvDeTodo([g]);
  assert.equal(lineas.length, 5, 'encabezado + 4 marcas');
  assert.deepEqual(lineas[1], ['3° B', 'Aguilar, Sofía', '2026-09-07', 'A', 'Asistencia']);
});

test('un respaldo inválido se rechaza en vez de romper la pantalla', () => {
  assert.throws(() => leerRespaldo('{"algo":1}'));
  assert.throws(() => leerRespaldo('no es json'));
  assert.deepEqual(leerRespaldo('{"grupos":[]}').grupos, []);
});
