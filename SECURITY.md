# Política de seguridad

## Reportar una vulnerabilidad

No abras un issue público. Usa **GitHub → Security → Report a vulnerability** (reporte privado) en este repositorio. Respondo en un plazo de 72 horas.

## Modelo de seguridad

- **Autenticación:** Supabase Auth. Acceso solo por invitación; el registro público está desactivado.
- **Autorización en el navegador:** Row Level Security en todas las tablas y en Storage. La anon key es pública por diseño.
- **Autorización en el servidor:** cada route handler privilegiado llama a `requireAdmin()` (`lib/server/auth.ts`), que verifica el token con Supabase Auth y lee el rol desde `profiles`. Nunca se decodifica un JWT a mano ni se confía en claims enviados por el cliente.
- **Service role:** solo en código de servidor (`import "server-only"`), solo después de autorizar.
- **Archivos:** bucket privado, URLs firmadas de 60 s, nombres de archivo saneados.
- **Cabeceras:** CSP (`frame-ancestors`, `object-src`, `base-uri`), HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## Secretos

- Nunca se commitean: `.env*` está ignorado (salvo `.env.example`) y el CI ejecuta gitleaks.
- Si un secreto se filtra, se rota de inmediato en el proveedor; limpiar el historial no basta.
