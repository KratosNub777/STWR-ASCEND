# Instrucciones para todas las sesiones (nuevas y viejas)

Leé este archivo antes de tocar nada. Aplica a cualquier sesión de Claude u otro agente que trabaje en este repositorio.

## Autoría de los commits

Todos los commits se hacen a nombre del dueño del proyecto, no de Claude ni de ningún bot:

- Nombre: `KratosNub777`
- Correo: `facundovera0702@gmail.com`

Antes del primer commit de la sesión, configurá la identidad y comprobala:

```sh
git config user.name "KratosNub777"
git config user.email "facundovera0702@gmail.com"
git log -1 --format='%an <%ae> | %cn <%ce>'   # autor y committer deben ser los de arriba
```

Si un commit sale con otra identidad, corregilo antes de hacer push (`git commit --amend --reset-author --no-edit` si es el último, o `git rebase` en una rama propia que todavía no tenga PR). No uses herramientas que commiteen por API (por ejemplo `create_or_update_file` o `push_files` del MCP de GitHub) para subir cambios de código: salen con otra identidad. Commiteá con `git` y subí con `git push`.

## Commits chicos y frecuentes

- **Muchos commits pequeños**: un cambio lógico por commit (un bloque de HTML, un grupo de reglas CSS, una función, un ajuste de test). Nada de un commit gigante con todo.
- Cada commit tiene que dejar el proyecto en un estado razonable (que compile y no rompa lo que ya andaba).
- Mensaje en español, en imperativo y corto en la primera línea ("Agrega el diálogo de confirmación", "Ajusta el color del botón de peligro"). Si hace falta contexto, una línea en blanco y el detalle abajo.
- No mezcles en un mismo commit cambios que no tengan relación entre sí (ni formateo masivo con lógica).

## Pull requests

- Trabajá en la rama que te asignen y subí con `git push -u origin <rama>`.
- Abrí el PR solo cuando el usuario lo pida. El PR conserva todos los commits chicos (no los aplastes).
- Escribí el título y la descripción en español, con un resumen de qué cambia y cómo se probó.

## Contexto del proyecto

Ver `README.md` para la estructura de archivos y los links. El diseño y la paleta están en `src/styles.css` (variables en `:root`); si agregás componentes nuevos, reutilizá esas variables y los botones `.btn`, `.btn-primary`, `.btn-ghost` y `.btn-danger`.
