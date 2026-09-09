# Lista de asistencia

Aplicación para pasar lista y llevar el control de asistencia de tus grupos.
Los datos se guardan en **Supabase** (proyecto *SECUNDARIA IMA*) y la página se
publica en **Vercel**.

```
control-asistencia/
├── index.html      la estructura y los estilos
├── app.js          la pantalla y la conexión con Supabase
├── logica.js       fechas, reportes y archivos, sin navegador de por medio
├── logica.test.mjs pruebas de esa lógica (`node --test`)
├── api/config.js   entrega las llaves desde las variables de Vercel
├── config.local.js llaves para probar en tu computadora (no se sube a git)
├── .env.ejemplo    los nombres de las variables que hay que crear en Vercel
├── manifest.json   para instalarla en el celular
├── logo.svg        escudo de la escuela
├── icono.svg       icono de la pantalla de inicio
├── esquema.sql     tablas y permisos — YA APLICADO
├── supabase/
│   └── migrations/ la misma migración, con su número de versión
├── README.md
└── .gitignore
```

---

## Lo que ya está hecho

- Las tablas `grupos`, `alumnos` y `asistencias` están creadas en el proyecto,
  con sus llaves foráneas e índices.
- La seguridad por fila está encendida en las tres, con políticas limitadas al
  rol `authenticated`: quien abra la página sin iniciar sesión no obtiene ni un
  renglón, y cada maestro solo alcanza sus propios datos.
- La página tiene pantalla de entrada y de registro, con los mensajes de error\n  traducidos al español.\n- `config.js` ya trae la dirección del proyecto y la llave pública. No hay que
  editarlo.

## Lo que falta hacer (en el panel de Supabase)

La página ya tiene pantalla de **registro**: cualquier maestro puede crear su
cuenta desde ahí, y gracias a la seguridad por fila cada quien ve únicamente sus
propios grupos. Para que funcione hay que abrir el registro y decidir si quieres
confirmación por correo.

**1. Permitir el registro.** Authentication → Sign In / Providers → Email, y
activa *Allow new users to sign up*. Si lo dejas apagado, la pantalla de
registro responde "El registro está cerrado en este momento".

**2. Decidir lo de la confirmación por correo.** En esa misma pantalla está
*Confirm email*.

- **Apagado**: el maestro se registra y entra de inmediato. Es lo más cómodo, y
  razonable si solo se van a registrar compañeros a los que tú les pasas la
  dirección. La desventaja es que nadie comprueba que el correo sea real.
- **Encendido**: Supabase manda un correo de confirmación. Es más seguro, pero
  el servicio de correo que Supabase incluye gratis está pensado solo para
  pruebas y permite muy pocos envíos por hora. Si van a registrarse varios
  maestros el mismo día, configura tu propio SMTP en Authentication → Emails
  (funciona con Gmail, Resend, Brevo y otros) o los correos simplemente no
  llegan.

La aplicación se adapta sola a las dos opciones: si hay confirmación, avisa que
revisen su correo; si no, entra directo.

**3. Tu propia cuenta.** Puedes crearla desde la misma página con el botón
"Crear una", igual que cualquier otro maestro. Si prefieres hacerlo a mano:
Authentication → Users → Add user, con la casilla *Auto Confirm User* activada.

## Dónde viven las llaves

Las llaves ya no están escritas en el código. `index.html` las pide a
`/api/config`, una función que las lee de las variables de entorno de Vercel.

En Vercel, entra a **Settings → Environment Variables** y crea estas cuatro
(los nombres están también en `.env.ejemplo`):

| Variable | Qué va ahí |
|---|---|
| `SUPABASE_URL` | La dirección de tu proyecto de Supabase |
| `SUPABASE_ANON_KEY` | La llave publishable |
| `ESCUELA_TIPO` | La línea chica del membrete: `Escuela Secundaria General` |
| `ESCUELA` | La línea grande: `Ignacio Manuel Altamirano` |
| `CICLO` | El ciclo escolar. Déjala vacía y se calcula sola |
| `LOGO` | Archivo del logotipo oficial. Vacía usa el escudo incluido |

Después de crearlas hay que volver a desplegar para que tomen efecto.

Para probar en tu computadora sin Vercel, el paquete trae `config.local.js` con
los mismos valores. Ese archivo está en el `.gitignore` y no se sube.

### Qué protege esto y qué no

Conviene tenerlo claro, porque se trata de datos de menores.

**Lo que sí logra:** la llave sale del repositorio. Si el proyecto está en
GitHub, quien lo vea no encuentra credenciales en el código, y puedes cambiar la
llave sin tocar los archivos.

**Lo que no logra:** esconderla del navegador. Cualquier página web tiene que
enviar esa llave para conectarse a Supabase, así que quien abra las
herramientas de desarrollo la va a ver. Eso pasa con todas las aplicaciones
hechas así, no es una falla de esta.

**Por eso la llave no es la protección.** La protección real son las políticas
de seguridad por fila que ya están puestas en las tres tablas: están limitadas
al rol `authenticated`, de modo que alguien con la llave pero sin sesión no
obtiene ni un renglón, y un maestro con sesión solo alcanza sus propios grupos.
Es exactamente al revés de como suena: la llave abre la puerta del edificio, las
políticas son las cerraduras de cada salón.

### Para reforzar de verdad

- En Supabase, **Advisors → Security** revisa la base y avisa si alguna tabla
  quedó sin protección. Vale la pena correrlo cada que cambies algo.
- En **Authentication → Policies** activa la protección contra contraseñas
  filtradas, para que nadie use una que ya se haya visto en alguna fuga.
- Como la llave actual ya anduvo circulando en archivos y conversaciones,
  cámbiala una vez que todo funcione: **Project Settings → API Keys**, creas una
  nueva, actualizas la variable en Vercel y desactivas la anterior.
- Descarga un respaldo de vez en cuando y guárdalo en un lugar seguro. No lo
  dejes en la carpeta del proyecto: el `.gitignore` lo bloquea justo para que no
  se suba con nombres de alumnos adentro.

## Subir a GitHub

Crea un repositorio vacío en [github.com/new](https://github.com/new), **sin**
README ni .gitignore (este proyecto ya los trae; si los agregas, el primer push
choca). Luego, desde esta carpeta:

```bash
git init
git add .
git commit -m "Control de asistencia"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPOSITORIO.git
git push -u origin main
```

El `.gitignore` deja fuera `config.local.js`, que es donde están tus llaves para
pruebas locales. Verifica antes del primer envío que `git status` no lo liste.
La llave `service_role` / `secret` no debe aparecer en ningún archivo de este
proyecto, ni siquiera en las variables de entorno: esa salta todas las
protecciones.

Lo que el `.gitignore` sí bloquea son los respaldos que descargues desde la
aplicación (`respaldo-asistencia-*.json`, `asistencia-*.csv`), porque llevan
nombres de alumnos y no deben terminar en un repositorio público.

## Publicar en Vercel

1. Entra a [vercel.com](https://vercel.com) y crea tu cuenta.
2. **Add New → Project** e importa el repositorio. También puedes arrastrar la
   carpeta directamente en la pantalla de despliegue.
3. En *Framework Preset* elige **Other**. No hace falta comando de compilación:
   son archivos estáticos.
4. **Deploy**. En un minuto tendrás tu dirección, algo como
   `control-asistencia.vercel.app`.

Cada vez que hagas `git push`, Vercel actualiza el sitio solo.

Para probarla antes en tu computadora: `python3 -m http.server 8000` dentro de
esta carpeta, y luego `http://localhost:8000`. Abrir el archivo con doble clic
no sirve, porque el navegador bloquea las conexiones desde `file://`.

---

## El escudo de la escuela

El proyecto trae un escudo diseñado para esta escuela: un blasón con filete
dorado, una estrella y un libro abierto, por el maestro y escritor que le da
nombre. Aparece en el membrete de las dos pantallas, en las hojas impresas y
como icono cuando la instalas en el celular.

Está dibujado en trazo y hereda el color de donde esté: sale en blanco sobre la
banda azul y en negro cuando se imprime, sin necesidad de dos archivos.

**Para poner el logotipo oficial en su lugar:** guarda la imagen en la carpeta
del proyecto (PNG con fondo transparente o SVG funcionan bien) y escribe su
nombre en la variable `LOGO`, por ejemplo `logo-escuela.png`. En cuanto tenga
valor, sustituye al escudo de trazo en todas las pantallas. Ten en cuenta que un
logotipo a color impreso en blanco y negro suele verse apagado; si eso pasa,
conviene dejar el escudo de trazo para las hojas que se entregan.

## Instalarla en el celular

No hace falta bajarla de ninguna tienda. Una vez publicada en Vercel:

- **Android (Chrome):** abre la dirección, toca los tres puntos y elige
  *Agregar a la pantalla principal*.
- **iPhone (Safari):** abre la dirección, toca el botón de compartir y elige
  *Agregar a inicio*.

Queda con su icono, abre a pantalla completa y guarda tu sesión, así que solo
tienes que escribir la contraseña la primera vez.

## Cómo está armado el código

`logica.js` no toca el navegador ni la red: solo transforma datos (fechas,
conteos del reporte, armado de los CSV). Por eso se puede probar sola, y esas
pruebas están en `logica.test.mjs`. Si tienes Node instalado:

```bash
node --test
```

`app.js` se encarga de la pantalla y de hablar con Supabase. Tres decisiones que
vale la pena conocer si algún día lo modificas:

**Las marcas se guardan en una cola.** Al tocar un botón, la pantalla cambia de
inmediato y la escritura entra en una fila que se vacía en orden. Si se cae la
señal —cosa normal en un salón— la cola espera y reintenta sola, con esperas
cada vez más largas, y en el membrete aparece cuántas marcas van pendientes. Si
el servidor rechaza algo, eso sí se avisa y se vuelve a leer el estado real.

**Solo se redibuja el renglón que cambió.** Antes se rearmaba la lista completa
en cada toque; en un grupo de 45 alumnos se sentía lento y perdías el lugar
donde ibas leyendo.

**Los diálogos son de la página, no del navegador.** `prompt()` y `confirm()` se
ven mal en el celular y algunos navegadores los bloquean cuando la aplicación
está instalada en la pantalla de inicio.

## Cómo se usa

**Pasar lista.** Eliges la fecha y marcas a cada alumno con un toque:
✓ asistencia, F falta, R retardo, J justificada. Si te equivocas, tocas otra vez
el mismo botón y se borra la marca. Hay atajos para marcar a todo el grupo con
asistencia y corregir nada más a los que faltaron.

**Alumnos.** Puedes pegar la lista completa de un jalón, un nombre por renglón,
y ordenarla por apellido.

**Reporte.** Cuenta asistencias, retardos, faltas y justificadas de cada quien,
con su porcentaje. Abajo del 80% aparece en rojo.

**Descargar.** Tres opciones, cuando quieras: CSV de un grupo con una columna
por día, CSV de todos los grupos con un renglón por marca, y un respaldo
completo en JSON que la misma aplicación puede volver a cargar.

Los cambios se guardan en el momento. Si algo falla, sale un aviso rojo y la
pantalla vuelve a mostrar lo que sí quedó guardado, para que nunca creas que se
guardó algo que no.

## Si algo no funciona

- **"El correo o la contraseña no coinciden"**: revisa mayúsculas y espacios.
  Si nunca creaste la cuenta, usa el botón "Crear una".
- **"Falta confirmar tu correo"**: busca el mensaje de Supabase, incluso en la
  bandeja de correo no deseado. Si no llega, es el límite de envíos del correo
  gratuito: apaga *Confirm email* o configura tu propio SMTP.
- **"El registro está cerrado"**: falta activar *Allow new users to sign up*.
- **"No se pudieron leer los datos"**: la sesión se venció. Sal y vuelve a
  entrar.
- **"No llegó la configuración"**: faltan las variables de entorno en Vercel, o
  las creaste pero no volviste a desplegar.
- Supabase pausa los proyectos gratuitos tras una semana sin uso. Si vuelves de
  vacaciones y no carga, se reactiva con un clic desde el panel.
