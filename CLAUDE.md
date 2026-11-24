@AGENTS.md

# Guía para asistentes de código

Portal de onboarding (Next.js 16 + Supabase). Contexto completo en `README.md` y `docs/ARCHITECTURE.md`.

## Reglas

- **Toda ruta en `app/api/**` que haga algo privilegiado debe empezar con `await requireAdmin(req)`** (`lib/server/auth.ts`). Nunca decodifiques un JWT a mano ni confíes en emails, roles o IDs enviados por el cliente.
- La service role (`createServiceClient()`) solo se usa en código de servidor y después de autorizar. Nada de `SUPABASE_SERVICE_ROLE_KEY` en componentes cliente.
- Valida los cuerpos de request con zod. No reenvíes mensajes de error de terceros al cliente.
- El código de navegador depende de RLS: si agregas una tabla, agrega sus políticas y grants (y documéntalos en `supabase/`).
- Los nombres de archivo subidos pasan por `storageObjectName()`; la ruta siempre empieza por el `client_id`.
- No commitees secretos ni datos reales de clientes (emails, nombres de empresas) en código, docs o tests.

## Antes de terminar un cambio

```bash
npm run check   # lint + typecheck + tests
npm run build
```

Agrega tests en `tests/unit` para cualquier lógica de servidor nueva; mockea Supabase y Anthropic (ver `tests/unit/fakeSupabase.ts`).
