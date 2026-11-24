# Arquitectura

## Roles y rutas

| Rol | Ruta de entrada | Origen del rol |
|---|---|---|
| `admin` | `/dashboard/admin` | `profiles.role = 'admin'` (asignado por otro admin vía `/api/invite`) |
| `client` con proyecto | `/dashboard/portal` | `profiles.project_id` no nulo |
| `client` legado | `/dashboard/onboarding` | sin `project_id` |

`/dashboard/page.tsx` enruta según `profile.role` y `profile.project_id`.

## Flujo de autenticación

```
/login → signInWithPassword() | signInWithOAuth(google)
       → AuthContext: getSession() → fetchProfile()
       → /dashboard → redirección por rol
```

`getSession()` debe resolverse antes de cualquier `supabase.from()`: `onAuthStateChange` por sí solo no actualiza a tiempo el header `Authorization` del cliente HTTP.

Las llamadas a `/api/*` envían `Authorization: Bearer <access_token>`. El servidor verifica el token con `supabase.auth.getUser(token)` y luego el rol (ver `lib/server/auth.ts`).

## Modelo de datos

### Perfiles

`profiles(id → auth.users, role 'admin'|'client', full_name, company_name, invited_at, template_id, project_id, created_at)`

Un trigger `handle_new_user` crea el perfil al crear el usuario. El trigger de `supabase/hardening.sql` impide que un usuario cambie su propio `role` o `project_id`.

### Capa de plantillas (definición)

| Tabla | Contenido |
|---|---|
| `project_templates` | Plantilla por industria |
| `phase_templates` | Fases de una plantilla (`phase_number`) |
| `task_templates` | Tareas: `task_type` (`hito`, `info_request`, `validation`) y `owner_type` (`client`, `vambe`) |
| `question_templates` | Preguntas de las tareas `info_request` |

### Capa de instancia por cliente (copia al crear)

| Tabla | Contenido |
|---|---|
| `client_projects` | Proyecto de un cliente, copiado de una plantilla |
| `client_phases`, `client_tasks`, `task_questions` | Copia de fases, tareas y preguntas; `client_tasks.progress` guarda el avance |
| `task_responses` | Respuestas de texto (`UNIQUE(question_id, client_id)`) |
| `task_files`, `phase_files` | Metadatos de archivos subidos |
| `task_validations` | Documento a validar, comentarios y estado |
| `project_members` | Usuarios adicionales con acceso a un proyecto |

Editar una plantilla **no** modifica proyectos existentes (modelo copy-on-create).

### Onboarding legado

`onboarding_parts`, `onboarding_sections`, `onboarding_templates`, `template_sections`, `client_sections`, `submissions`, `submission_files`. Se mantiene para clientes sin `project_id`.

### Pipeline de IA

| Tabla | Contenido |
|---|---|
| `pipeline_items` | Texto depurado y estado por cliente y sección (`depurado` → `enviado`) |
| `prompt_templates` | Prompt por sección para la exportación a sistemas externos |

## Storage

Bucket privado `submissions`. Rutas:

- Legado: `{client_id}/{section_id}/{timestamp}_{nombre}`
- Preguntas: `{client_id}/{question_id}/{timestamp}_{nombre}`
- Fases: `{client_id}/phases/{phase_id}/{timestamp}_{nombre}`

El primer segmento siempre es el `client_id`: las políticas de Storage lo usan para aislar clientes. Las descargas usan URLs firmadas de 60 s.

## Pipeline de depuración

```
Cliente responde tareas info_request
  → Admin abre /dashboard/admin/pipeline y elige cliente
  → "Depurar con IA" → POST /api/depure (Claude)
  → Admin revisa y edita → upsert pipeline_items (depurado)
```

## Problemas conocidos al operar

1. **403 en una tabla nueva:** falta `GRANT USAGE ON SCHEMA public` o el grant de la tabla. Después de cambios de esquema: `NOTIFY pgrst, 'reload schema';`.
2. **"Cargando..." infinito en producción:** faltan `NEXT_PUBLIC_SUPABASE_*` en Vercel. Se incrustan al compilar: hay que redeployar.
3. **Selects embebidos que fallan en frío:** usar dos consultas separadas (patrón en `OnboardingView.tsx`).
4. **Bucket:** siempre `submissions`.
5. **Usuarios creados por script:** verificar `profiles.role` y agregar la fila en `project_members` si corresponde.
