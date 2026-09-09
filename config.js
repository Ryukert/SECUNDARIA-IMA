// Configuración del sistema.
//
// La llave "publishable" es pública por diseño: el navegador la recibe de
// todos modos, así que tenerla aquí no cambia nada en la práctica. Lo que
// protege los datos de los alumnos son el inicio de sesión y las políticas
// de seguridad por fila de la base.
//
// La llave "service_role" / "secret" NUNCA debe escribirse en este archivo.
//
// Si algún día prefieres sacarla del repositorio, crea en Vercel las
// variables de entorno SUPABASE_URL y SUPABASE_ANON_KEY: si existen, mandan
// sobre lo que diga este archivo.

window.SUPABASE_URL = "https://ouodtwngbwaxrqgtcvnz.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_fFsA1LTZ0lEYEOfBi-Sgaw_CeDbZhTm";

// Membrete
window.ESCUELA_TIPO = "Escuela Secundaria General";
window.ESCUELA = "Ignacio Manuel Altamirano";
window.CICLO = "";

// Logotipo oficial. Deja el valor vacío para usar el escudo de trazo que
// viene incluido. Si tienes el logotipo de la escuela, guárdalo en esta
// carpeta y escribe aquí su nombre, por ejemplo "logo-escuela.png".
window.LOGO = "";
