// Entrega la configuración del navegador desde las variables de entorno de
// Vercel, para que las llaves no vivan dentro del repositorio.
//
// Ojo con lo que esto sí y lo que esto no hace: la llave sale del código
// publicado en GitHub, pero el navegador la sigue recibiendo, porque toda
// página web necesita enviarla para conectarse. Quien abra las herramientas
// de desarrollo la puede leer. Lo que protege los datos de los alumnos son
// las políticas de seguridad por fila de la base y el inicio de sesión.

module.exports = (req, res) => {
  const url = process.env.SUPABASE_URL;
  const llave = process.env.SUPABASE_ANON_KEY;

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (!url || !llave) {
    return res.status(200).send(
      'window.ERROR_CONFIG = "Faltan las variables SUPABASE_URL y ' +
      'SUPABASE_ANON_KEY en Vercel (Settings > Environment Variables).";'
    );
  }

  const texto = JSON.stringify;
  res.status(200).send(
    `window.SUPABASE_URL = ${texto(url)};\n` +
    `window.SUPABASE_ANON_KEY = ${texto(llave)};\n` +
    `window.ESCUELA = ${texto(process.env.ESCUELA || 'Escuela Secundaria')};\n` +
    `window.CICLO = ${texto(process.env.CICLO || '')};\n`
  );
};
