// Opcional. Si en Vercel existen las variables de entorno, este archivo las
// entrega al navegador y sustituye lo que diga config.js. Si no existen, no
// hace nada y el sistema funciona igual con config.js.
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

  // Sin variables de entorno no pasa nada: se queda lo que traiga config.js.
  if (!url || !llave) {
    return res.status(200).send('/* sin variables de entorno: manda config.js */');
  }

  const texto = JSON.stringify;
  res.status(200).send(
    `window.SUPABASE_URL = ${texto(url)};\n` +
    `window.SUPABASE_ANON_KEY = ${texto(llave)};\n` +
    (process.env.ESCUELA_TIPO ? `window.ESCUELA_TIPO = ${texto(process.env.ESCUELA_TIPO)};\n` : '') +
    (process.env.ESCUELA ? `window.ESCUELA = ${texto(process.env.ESCUELA)};\n` : '') +
    (process.env.CICLO ? `window.CICLO = ${texto(process.env.CICLO)};\n` : '') +
    (process.env.LOGO ? `window.LOGO = ${texto(process.env.LOGO)};\n` : '')
  );
};
