# Axis CRM Engine — Documentacion Completa

propietario: Andres Abel Fuentes Esquivel
servidor: https://attractive-mindfulness-production.up.railway.app
base de datos: Railway PostgreSQL
repositorio: github.com/itadminaxis/axis-crm-engine
ultima actualizacion: 2026-03-29 (FASE 3 — digest mensual completado)

---

## que es esto

Axis CRM Engine es un motor de captura, almacenamiento y analisis de leads para negocios inmobiliarios y cualquier negocio que genere prospectos digitales. Es multi-tenant: un solo servidor sirve a multiples clientes completamente aislados. Cada cliente tiene su propio espacio de datos, sus propios tokens, y su propio dashboard.

El modelo de negocio es food truck: operas tu mismo, sin portal de autoservicio, sin cobro automatizado. Das de alta clientes manualmente desde tu Centro de Mando, les conectas sus fuentes de leads, y les entregas reportes.

---

## tus datos de acceso (no compartir)

tenant id: 35fed456-f066-4484-8567-dfdd2695b241
tenant api key: 93f9a45054b0724153c6ff9acaf5a9deed460ed5eed08eb4c9e40831bbbf14c6
api secret (admin): 5e481198eaf4236c0fdd9bfd880462a77bc7ae551e94f89c8413dce5b258c7ce
meta verify token: axis_crm_engine_verify_token

proyecto casaya main
  id: b3925056-c2b8-4c74-8dc3-270a1f367623
  token: 531f7f7d8d3ed2925acbd97079f7c416

proyecto sicilia plus
  id: c1c3632f-a72e-4724-b82a-fc33e7e96913
  token: 51d4b7c55cd96a520d3efabdecda0636

---

## arquitectura del sistema

el sistema tiene tres capas:

**capa 1: ingesta**
cualquier fuente de leads (meta ads, whatsapp, google ads, linkedin, tiktok, formularios web, email) manda un POST al servidor. el servidor valida, normaliza, y guarda el lead.

**capa 2: procesamiento**
graphile-worker ejecuta tareas en background: analisis IA (Claude Haiku), respuesta instantanea, blockchain seal, callbacks.

**capa 3: observabilidad**
endpoints de metricas, dashboards HTML, notificaciones por email.

---

## endpoints principales

todos los endpoints publicos viven en:
https://attractive-mindfulness-production.up.railway.app

**salud del sistema (sin auth)**
GET /health
GET /metrics

**recibir leads con token de proyecto**
POST /api/submit?token={PUBLIC_TOKEN}
headers: Content-Type: application/json
body: { "phone": "+521234567890", "source": "META_ADS", "custom_data": { "nombre": "Juan", "email": "juan@email.com" } }

**ver leads (requiere api key de tenant)**
GET /leads
headers: x-api-key: {TENANT_API_KEY}

**metricas del tenant**
GET /metrics/dashboard?tenant_id={TENANT_ID}
GET /metrics/attribution?tenant_id={TENANT_ID}
GET /metrics/alerts?tenant_id={TENANT_ID}
headers: x-api-key: {API_SECRET o TENANT_API_KEY}

**gestion de flota (requiere api key de admin)**
POST /admin/fleet — crear cliente
GET /admin/fleet — listar flota
GET /admin/fleet/{tenant_id} — detalle de cliente
GET /admin/fleet/{tenant_id}/leads — leads del cliente
PUT /admin/fleet/{tenant_id}/access — cambiar nivel

**webhook de meta**
GET /webhook — verificacion de hub token
POST /webhook — recibir lead ads y whatsapp

---

## como dar de alta un cliente nuevo

1. abrir el Centro de Mando: /dashboard/fleet.html
2. click en "Dar de Alta Cliente"
3. poner nombre del negocio y elegir nivel de acceso
4. el sistema genera automaticamente: tenant id, api key, proyecto, public token
5. copiar el public token
6. configurar zapier o el webhook con ese token
7. listo, los leads caen solos

via curl:
```
curl -X POST https://attractive-mindfulness-production.up.railway.app/admin/fleet \
  -H "Content-Type: application/json" \
  -H "x-api-key: {TU_API_KEY_ADMIN}" \
  -d '{ "name": "Nombre del negocio", "access_level": "managed" }'
```

---

## niveles de acceso de la flota (colorimetria)

self (verde #2ECC71)
tu negocio. ya existe. acceso total permanente. no se crea via API.

managed (azul #00D1FF)
cliente que analizas. ves todos sus datos: leads, custom_data, telefonos, eventos.
caso de uso: "hazme una web y analiza mis leads"

hosted (naranja #FF6B2B)
cliente saas. solo ves metricas de uso. no ves sus datos individuales.
caso de uso: "solo quiero el tracking, mis datos son mios"

reseller (morado #8E44AD)
aliado white-label. puede crear sus propios sub-clientes. tu no ves sus datos.
caso de uso: "agencia X quiere la plataforma para sus 10 clientes"

contractor (dorado #F1C40F)
te subcontratan. acceso total pero con fecha de expiracion (default 90 dias).
caso de uso: "construyeme un CRM, tienes 3 meses de acceso"

---

## fuentes de leads soportadas

meta lead ads
  endpoint: POST /webhook
  requiere: META_PAGE_ACCESS_TOKEN, META_DEFAULT_PROJECT_TOKEN en .env
  flujo: meta manda leadgen_id → servidor llama graph api → guarda lead con nombre, email, telefono

whatsapp business
  endpoint: POST /webhook
  extrae wa_id del payload de meta

google ads
  endpoint: POST /api/integrations/google-ads?token={TOKEN}&secret={WEBHOOK_SECRET}
  source: GOOGLE_ADS

linkedin lead gen
  endpoint: POST /api/integrations/linkedin?token={TOKEN}
  valida firma hmac-sha256 en header x-li-signature
  source: LINKEDIN

tiktok
  endpoint: POST /webhook/tiktok
  source: TikTok

typeform / tally
  endpoint: POST /api/integrations/typeform?token={TOKEN}
  source: TYPEFORM

email inbound (resend o sendgrid)
  endpoint: POST /api/integrations/email?token={TOKEN}
  extrae nombre, email, y telefono del cuerpo del email
  source: EMAIL

formulario web directo
  endpoint: POST /api/submit?token={TOKEN}
  source: lo que mandes en el body

zapier / make
  cualquiera de los anteriores funciona como destino de zapier
  el mas simple: POST /api/submit?token={TOKEN}

---

## conectar meta lead ads (instrucciones completas)

### prerequisitos
- pagina de facebook del negocio (o de tu inmobiliaria general)
- cuenta de meta business manager
- app de meta creada en developers.facebook.com

### variables de entorno que necesitas agregar al .env y a railway
META_APP_SECRET=tu_app_secret_de_meta
META_PAGE_ACCESS_TOKEN=tu_page_access_token
META_DEFAULT_PROJECT_TOKEN=token_del_proyecto_donde_caen_los_leads

### pasos en meta for developers
1. crear app > tipo negocio
2. agregar producto webhooks > page
3. URL de callback: https://attractive-mindfulness-production.up.railway.app/webhook
4. verify token: axis_crm_engine_verify_token
5. suscribirse al campo: leadgen
6. agregar producto facebook login > solicitar permisos: pages_manage_ads, leads_retrieval
7. generar page access token para tu pagina
8. guardar el app secret desde configuracion > basica

### alternativa sin programar (zapier)
1. zapier > crear zap
2. trigger: facebook lead ads > new lead
3. action: webhooks by zapier > POST
4. url: https://attractive-mindfulness-production.up.railway.app/api/submit?token={PROJECT_TOKEN}
5. body (json): { "phone": "{{phone_number}}", "source": "META_ADS", "custom_data": { "nombre": "{{full_name}}", "email": "{{email}}" } }

---

## notificaciones en tiempo real

cuando cae un lead nuevo, el sistema manda un email automaticamente.

### variables de entorno necesarias
RESEND_API_KEY=re_xxxxxx (obtener en resend.com, gratis hasta 3000 emails/mes)
NOTIFY_EMAIL=tu@email.com (donde quieres recibir las alertas — email global del admin)
NOTIFY_FROM=Axis CRM <notificaciones@tudominio.com> (necesitas dominio verificado en resend)

### configurar resend
1. ir a resend.com y crear cuenta
2. ir a API Keys > crear key
3. si tienes dominio: Domains > agregar y verificar con registros DNS
4. si no tienes dominio aun: usar onboarding@resend.dev (solo para pruebas, no para produccion)
5. agregar RESEND_API_KEY y NOTIFY_EMAIL en railway > variables

### que incluye el email de notificacion de lead nuevo
- nombre del lead
- telefono
- email
- fuente (META_ADS, GOOGLE_ADS, etc)
- proyecto
- tenant
- lead id para referencia

---

## digest mensual por tenant

el dia 1 de cada mes a las 8am cada cliente recibe un email con sus metricas del mes anterior.

### activar para un cliente
paso 1 — correr la migracion una sola vez en railway (psql o panel):
```
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notify_email TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN DEFAULT true;
```

paso 2 — asignar el email al tenant:
```
UPDATE tenants SET notify_email = 'cliente@ejemplo.com' WHERE name = 'Nombre del cliente';
```

paso 3 — asegurarte de que RESEND_API_KEY esta configurado en railway.

### que incluye el digest
- total de leads del mes con comparativa % vs mes anterior
- promedio diario de leads
- top 5 fuentes con conteos
- top 5 proyectos con conteos
- boton para abrir el dashboard

### disparar manualmente para testing
```
curl -X POST https://attractive-mindfulness-production.up.railway.app/api/admin/metrics/digest/trigger \
  -H "x-api-key: 5e481198eaf4236c0fdd9bfd880462a77bc7ae551e94f89c8413dce5b258c7ce" \
  -H "Content-Type: application/json" \
  -d '{"month": "2026-02"}'
```
si no mandas body, usa el mes anterior automaticamente.

### desactivar digest para un tenant especifico
```
UPDATE tenants SET digest_enabled = false WHERE name = 'Nombre del cliente';
```

---

## dashboards disponibles

Centro de Mando (para ti)
/dashboard/fleet.html
donde das de alta clientes, ves tu flota, copias tokens, y accedes a todo.

Dashboard de Metricas
/dashboard/metrics.html
KPIs, graficas de fuentes y proyectos, tabla de atribucion, hot leads, alertas.
funciona con tu api key de tenant y tenant_id.

Estacion de Mando (legacy)
/dashboard/station.html
panel visual de nodos y flujos. util para mostrar arquitectura.

---

## estructura de la base de datos

tabla tenants
id, name, api_key, managed_by, access_level, access_expires_at, branding, notify_email, digest_enabled, created_at, updated_at, active

tabla projects
id, tenant_id, name, description, public_token, enable_ai_prescriptive, enable_blockchain_seal, enable_3d_immersive, enable_payments, enable_instant_response, config, created_at, updated_at

tabla leads
id, tenant_id, project_id, phone, custom_data (jsonb), created_at, updated_at

dentro de custom_data:
  source: fuente del lead (META_ADS, GOOGLE_ADS, etc)
  status: Nuevo / Contactado / Calificado / etc
  nombre: nombre del prospecto
  email: email del prospecto
  history: array de interacciones con timestamps
  milestones: array de hitos del journey
  ai_insights: analisis de claude haiku (si esta activado)

tabla events
id, tenant_id, entity_type, entity_id, event_type, source, payload, created_at

---

## worker y tareas en background

el worker (graphile-worker) ejecuta estas tareas cuando entra un lead:

process-lead — tarea base, siempre activa
semantic-analysis — analisis IA con Claude Haiku (si enable_ai_prescriptive = true)
send-instant-response — respuesta automatica al prospecto (si enable_instant_response = true)

cron mensual (automatico):

monthly-digest — dia 1 de cada mes a las 8am hora Monterrey
envia a cada tenant con notify_email configurado un reporte HTML con sus metricas del mes anterior:
total de leads, top fuentes, top proyectos, comparativa vs mes anterior, promedio diario.
solo se envia si el tenant tiene actividad (omite tenants sin leads).

para disparar el digest manualmente (testing o reenvio):
POST /api/admin/metrics/digest/trigger
headers: x-api-key: {API_SECRET}
body (opcional): { "month": "2026-02" }
si no se especifica mes, usa el mes anterior automaticamente.

el worker se inicia con: node src/worker.js
en railway corre como proceso separado en el mismo repo

---

## variables de entorno completas

ya configuradas:
DATABASE_URL=postgresql://postgres:...@centerbeam.proxy.rlwy.net:10171/railway
API_SECRET=5e481198eaf4236c0fdd9bfd880462a77bc7ae551e94f89c8413dce5b258c7ce
META_VERIFY_TOKEN=axis_crm_engine_verify_token
GOOGLE_ADS_WEBHOOK_SECRET=axis_google_ads_secret_change_this
ANTHROPIC_API_KEY=(configurada en railway)

pendientes de configurar:
META_APP_SECRET=
META_PAGE_ACCESS_TOKEN=
META_DEFAULT_PROJECT_TOKEN=531f7f7d8d3ed2925acbd97079f7c416 (casaya) o el que corresponda
RESEND_API_KEY=
NOTIFY_EMAIL=
NOTIFY_FROM=

---

## plan de trabajo — lo que esta hecho

fase 1: motor base multi-tenant con PostgreSQL, RLS, API REST
fase 2: worker de background con graphile-worker
fase 3: integraciones (Google Ads, LinkedIn, TikTok, Typeform, Email)
fase 4: SSE (server-sent events), callbacks HTTP, event log
fase 5: fleet system (onboarding, niveles de acceso, cross-tenant)
fase 6: IA prescriptiva con Claude Haiku + fallback heuristico
fase 7: observabilidad (metricas ISO/IEC 25020, dashboard, atribucion, alertas)
dashboards: Centro de Mando (fleet.html), Dashboard de Metricas (metrics.html)
meta webhook: refactorizado para Lead Ads + verificacion de firma + resolucion de tenant
notificaciones: email en tiempo real via Resend cuando entra lead nuevo
event log (soberania del dato): tabla events, audit trail, timeline por lead en station.html
digest mensual automatico: cron graphile-worker, reporte HTML por tenant, trigger manual via API

---

## pendientes (backlog ordenado por impacto)

alta prioridad (proximos)

1. configurar variables de entorno en railway (BLOQUEANTE para produccion)
   META_APP_SECRET=
   META_PAGE_ACCESS_TOKEN=
   META_DEFAULT_PROJECT_TOKEN=531f7f7d8d3ed2925acbd97079f7c416
   RESEND_API_KEY=
   NOTIFY_EMAIL=
   NOTIFY_FROM=
   sin RESEND_API_KEY no salen notificaciones ni digest

2. correr migration-005 en railway (una vez)
   ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notify_email TEXT;
   ALTER TABLE tenants ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN DEFAULT true;
   luego: UPDATE tenants SET notify_email = 'tu@email.com' WHERE name = 'tu tenant';

3. Looker Studio por cliente
   conectar el postgres de railway directamente a looker studio via conector de google
   crear un reporte template con: leads por dia, por fuente, por proyecto, ultimos 30 dias
   compartir con el cliente via link. se actualiza solo.
   looker studio es gratis y es lo que usa el percentil 95

media prioridad

4. dominio propio
   cambiar attractive-mindfulness-production.up.railway.app por algo tuyo
   ej: app.axiscrm.mx o crm.andresabel.com
   en railway: Settings > Networking > Custom Domain

5. page de status publica
   https://status.axiscrm.mx o similar
   muestra uptime del servidor, latencia, ultimos incidentes
   better stack o uptimerobot (gratis)

baja prioridad

6. documentacion API publica (swagger ya existe en /api-docs)
   mejorar descripciones y ejemplos para poder compartir con clientes tecnicos

7. rate limiting por tenant
   hoy el rate limiting es global (100 req/min)
   idealmente seria por tenant para evitar que un cliente afecte a otros

ya resuelto (mover de pendientes)
- CSV export: GET /leads/export?from=YYYY-MM-DD&to=YYYY-MM-DD (requiere x-api-key)
- notify_email por tenant: migration-005 lista, falta correrla en railway
- event log + timeline: completamente funcional (tabla events, GET /events, timeline en station.html)
- digest mensual: completamente funcional, falta configurar RESEND_API_KEY y correr migration-005

---

## flujo completo cuando entra un lead

1. fuente (meta, zapier, formulario) hace POST al endpoint correcto con el token del proyecto
2. middleware valida el token y resuelve tenant_id y project_id
3. upsertLead guarda o actualiza el lead en PostgreSQL
4. si es lead nuevo: se emite evento lead.created, se hace broadcast SSE
5. si es lead nuevo: se manda email de notificacion via resend (si esta configurado)
6. se encolan tareas en graphile-worker: process-lead, semantic-analysis, send-instant-response
7. el worker ejecuta las tareas en background
8. los datos aparecen en el dashboard de metricas en el proximo refresh (60s)

---

## como probar que todo funciona

**probar ingesta de lead:**
```
curl -X POST "https://attractive-mindfulness-production.up.railway.app/api/submit?token=531f7f7d8d3ed2925acbd97079f7c416" \
  -H "Content-Type: application/json" \
  -d '{ "phone": "+5218331234567", "source": "PRUEBA", "custom_data": { "nombre": "Test Manual" } }'
```

**probar metricas:**
```
curl "https://attractive-mindfulness-production.up.railway.app/metrics/dashboard?tenant_id=35fed456-f066-4484-8567-dfdd2695b241" \
  -H "x-api-key: 93f9a45054b0724153c6ff9acaf5a9deed460ed5eed08eb4c9e40831bbbf14c6"
```

**probar flota:**
```
curl "https://attractive-mindfulness-production.up.railway.app/admin/fleet" \
  -H "x-api-key: 93f9a45054b0724153c6ff9acaf5a9deed460ed5eed08eb4c9e40831bbbf14c6"
```

**probar notificacion de email:**
agregar RESEND_API_KEY y NOTIFY_EMAIL al .env local y mandar un lead de prueba

---

## estructura de archivos clave

src/server.js — punto de entrada, monta todas las rutas
src/worker.js — proceso de background con graphile-worker
src/services/lead.service.js — upsert, getLeads, milestones, journey
src/services/metrics.service.js — dashboard, attribution, alerts, quality
src/services/fleet.service.js — onboarding, flota, cross-tenant access
src/services/notify.service.js — notificaciones email de lead nuevo via resend
src/services/event.service.js — audit trail, logEvent, getEvents, getEntityTimeline
src/services/ai.service.js — analisis con claude haiku
src/controllers/webhook.controller.js — meta lead ads y whatsapp
src/routes/ — todos los endpoints organizados por dominio
src/middleware/tenant.middleware.js — resolucion de tenant por api key
src/middleware/publicSubmit.middleware.js — resolucion por project token
src/public/dashboard/fleet.html — Centro de Mando
src/public/dashboard/metrics.html — Dashboard de Metricas
src/db/schema.sql — esquema de la base de datos
src/db/migration-*.sql — migraciones aplicadas
  migration-001-security.sql — RLS, indices de seguridad
  migration-002-event-log.sql — tabla events
  migration-003-fleet.sql — campos de flota en tenants
  migration-004-fleet-levels.sql — niveles reseller, contractor, branding
  migration-005-notify-email.sql — notify_email y digest_enabled por tenant
src/tasks/monthly-digest.js — cron mensual de digest por tenant
docs/AXIS_CRM_ENGINE.md — este archivo

---

## notas importantes

el webhook de meta debe responder 200 en menos de 20 segundos o meta reintenta
por eso el controlador responde 200 inmediatamente y procesa el lead despues

el upsert de leads usa ON CONFLICT (tenant_id, phone) — si el mismo telefono manda dos veces, actualiza en lugar de duplicar. el historial se acumula en custom_data.history

RLS (row level security) esta configurado en postgres pero la app usa app.current_tenant_id para el aislamiento via el middleware de AsyncLocalStorage — no via la sesion de postgres directamente

el campo active en tenants existe en el schema pero no se usa aun en los filtros — todos los tenants se consideran activos

---

fin del documento
