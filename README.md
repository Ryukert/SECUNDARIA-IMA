# Lista de asistencia

Aplicación para pasar lista y llevar el control de asistencia de tus grupos.
Los datos se guardan en **Supabase** (proyecto *SECUNDARIA IMA*) y la página se
publica en **Vercel**.

```
control-asistencia/
├── index.html      la aplicación completa
├── config.js       dirección y llave de Supabase — YA CONFIGURADO
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
- `config.js` ya trae la dirección del proyecto y la llave pública. No hay que
  editarlo.

## Lo que falta hacer (2 minutos, en el panel de Supabase)

**1. Crear tu usuario.** Authentication → Users → Add user → Create new user.
Pon tu correo y una contraseña, y **activa la casilla Auto Confirm User**. Sin
esa casilla, Supabase espera una confirmación por correo y no vas a poder
entrar. Esa contraseña es con la que iniciarás sesión en tu página.

**2. Cerrar el registro público.** Authentication → Sign In / Providers →
desactiva *Allow new users to sign up*. Así nadie más puede crearse una cuenta
dentro de tu proyecto.

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

Sobre `config.js`: sí se sube, y está bien. La llave *publishable* está hecha
para ser pública, igual que la dirección del proyecto; lo que cuida tus datos
son el inicio de sesión y las políticas de la base. La llave `service_role` /
`secret` nunca debe aparecer en estos archivos.

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

- **"No pudimos entrar"** al iniciar sesión: casi siempre es el usuario sin
  confirmar. Revisa en Authentication → Users que tu correo no aparezca como
  *Waiting for verification*.
- **"No se pudieron leer los datos"**: la sesión se venció. Sal y vuelve a
  entrar.
- **La página no carga nada**: revisa que `config.js` esté junto a `index.html`
  y que se haya subido al repositorio.
- Supabase pausa los proyectos gratuitos tras una semana sin uso. Si vuelves de
  vacaciones y no carga, se reactiva con un clic desde el panel.
