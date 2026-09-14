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
├── config.js       dirección, llave y nombre de la escuela — YA CONFIGURADO
├── api/config.js   opcional: lee variables de entorno si decides usarlas
├── .env.ejemplo    los nombres de esas variables, por si algún día las usas
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

- Las tablas `grupos`, `alumnos`, `asistencias` y `grupo_maestros` están
  creadas en el proyecto, con sus llaves foráneas e índices.
- La seguridad por fila está encendida en las cuatro, con políticas limitadas
  al rol `authenticated`: quien abra la página sin iniciar sesión no obtiene ni
  un renglón, y cada grupo solo lo ven los maestros que tienen acceso a él
  (ver "Compartir un grupo" más abajo).
- La página tiene pantalla de entrada y de registro, con los mensajes de error
  traducidos al español.
- `config.js` ya trae la dirección del proyecto y la llave pública. No hay que
  editarlo.

## Lo que falta hacer (en el panel de Supabase)

**Aplicar la migración de grupos compartidos y notas.** Es la única vez que
hay que tocar el panel para esta versión: en Supabase, **SQL Editor**, pega el
contenido de `supabase/migrations/20260913000000_compartir_grupos_y_notas.sql`
(o de `esquema.sql`, que ya es el espejo completo) y ejecútalo una vez. Es
seguro volver a correrlo si algo sale mal a medio camino.

La página ya tiene pantalla de **registro**: cualquier maestro puede crear su
cuenta desde ahí, y gracias a la seguridad por fila cada quien ve únicamente
los grupos a los que tiene acceso. Para que funcione hay que abrir el registro
y decidir si quieres confirmación por correo.

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

En `config.js`, junto a `index.html`. Ya está lleno con los datos de tu
proyecto, así que no hay nada que configurar: subes la carpeta y funciona.

Ahí mismo están el nombre de la escuela (`ESCUELA_TIPO` y `ESCUELA`), el ciclo
escolar y el logotipo. Son los valores que salen en el membrete y en las hojas
impresas.

### Por qué la llave puede estar a la vista

Se trata de datos de menores, así que conviene entenderlo bien.

La llave *publishable* está hecha para ser pública. Cualquier página web tiene
que enviarla para conectarse a Supabase, así que el navegador la recibe de
todos modos y quien abra las herramientas de desarrollo la puede leer, esté
guardada donde esté. Esconderla del repositorio es higiene, no seguridad.

**Lo que sí protege a tus alumnos** son las políticas de seguridad por fila que
ya están puestas en las cuatro tablas, limitadas al rol `authenticated`:
alguien con la llave pero sin sesión no obtiene ni un renglón, y cada grupo
solo lo ven los maestros que están en `grupo_maestros` para ese grupo. La
llave abre la puerta del edificio; las políticas son las cerraduras de cada
salón.

Tampoco hay manera de inyectar SQL a través de la página: nunca arma una
consulta pegando texto, todo pasa por el cliente de Supabase (que la
parametriza, igual que una consulta preparada) o por las funciones de invitar
un maestro, que están escritas sin `EXECUTE` ni concatenación y comprueban el
rol de quien llama antes de tocar nada.

La llave `service_role` / `secret` es otra cosa: esa sí salta todas las
protecciones y no debe aparecer en ningún archivo de este proyecto.

### Si algún día quieres sacarla del repositorio

El proyecto ya viene preparado. Crea en Vercel las variables `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `ESCUELA_TIPO`, `ESCUELA` (los nombres están en
`.env.ejemplo`), vuelve a desplegar y `api/config.js` las entregará al
navegador, mandando sobre lo que diga `config.js`. Mientras no existan, no
estorban: el sistema funciona con el archivo.

### Para reforzar de verdad

- En Supabase, **Advisors → Security** revisa la base y avisa si alguna tabla
  quedó sin protección. Vale la pena correrlo cada que cambies algo.
- En **Authentication → Policies** activa la protección contra contraseñas
  filtradas, para que nadie use una que ya se haya visto en alguna fuga.
- Descarga un respaldo de vez en cuando y guárdalo en un lugar seguro. No lo
  dejes en la carpeta del proyecto: el `.gitignore` bloquea esos archivos justo
  para que no se suban con nombres de alumnos adentro.

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

El `.gitignore` deja fuera los respaldos que descargues desde la aplicación
(`respaldo-asistencia-*.json`, `asistencia-*.csv`), porque llevan nombres de
alumnos y no deben terminar en un repositorio público.

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
asistencia y corregir nada más a los que faltaron. El botón "Calendario" abre
un mes completo para saltar a cualquier día de un vistazo, con un puntito en
los que ya tienen alguna marca. Si el día hábil anterior se quedó sin pasar
lista, aparece un aviso para que no se te pase.

**Notas.** Con un alumno ya marcado, el lápiz junto a su nombre abre una nota
corta para ese día ("llegó 20 min tarde", "justificante médico"). En la
pestaña de Alumnos hay además una nota general por alumno (alergias, contacto),
sin relación con un día en particular.

**Buscar.** En grupos grandes aparece un buscador arriba de la lista, tanto en
Pasar lista como en Alumnos.

**Alumnos.** Puedes pegar la lista completa de un jalón, un nombre por renglón,
y ordenarla por apellido.

**Reporte.** Cuenta asistencias, retardos, faltas y justificadas de cada quien,
con su porcentaje y una barra a un lado. Abajo del 80% aparece en rojo. Puedes
acotarlo a este mes o a un rango de fechas en vez de todo el ciclo, y más abajo
hay una gráfica con la tendencia de asistencia del grupo completo, semana con
semana (o mes con mes, si el ciclo ya lleva mucho registrado).

**Compartir un grupo.** El botón "Compartir" muestra quién tiene acceso; quien
creó el grupo (el "dueño") puede invitar a otro maestro escribiendo su correo
—tiene que ya tener cuenta— y ese maestro entra a ver y editar el mismo grupo
de inmediato, con los mismos permisos salvo borrar el grupo o invitar/quitar a
otros, que quedan reservados al dueño.

**Descargar.** Tres opciones, cuando quieras: CSV de un grupo con una columna
por día, CSV de todos los grupos con un renglón por marca (incluida su nota),
y un respaldo completo en JSON que la misma aplicación puede volver a cargar.

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
- **"Falta la configuración"**: `config.js` no se subió o quedó en otra carpeta.
  Tiene que estar junto a `index.html`.
- **"No hay ninguna cuenta con ese correo"** al invitar a un maestro: esa
  persona todavía no se registra en la aplicación. Pídele que cree su cuenta
  primero (botón "Crear una" en la pantalla de entrada) y vuelve a invitarla.
- **"No tienes permiso para hacer esto"**: la acción (borrar el grupo, invitar
  o quitar maestros) está reservada al dueño del grupo, y la cuenta con la que
  entraste es colaboradora.
- Supabase pausa los proyectos gratuitos tras una semana sin uso. Si vuelves de
  vacaciones y no carga, se reactiva con un clic desde el panel.
