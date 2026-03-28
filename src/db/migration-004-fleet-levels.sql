-- MIGRATION 004: NIVELES COMPLETOS DE FLOTA
-- Agrega reseller + contractor + campos de soporte.
-- Copyright (c) 2026 Andres Abel Fuentes Esquivel.
--
-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  COLORIMETRIA DE NIVELES (Mayor a menor probabilidad de uso)       ║
-- ║                                                                     ║
-- ║  #2ECC71  SELF        Tu propio negocio. Siempre activo.           ║
-- ║  #00D1FF  MANAGED     Cliente que analizas. Ves todo.              ║
-- ║  #FF6B2B  HOSTED      Cliente SaaS. Solo metricas.                 ║
-- ║  #8E44AD  RESELLER    Aliado white-label. Crea sub-clientes.       ║
-- ║  #F1C40F  CONTRACTOR  Te subcontratan. Acceso temporal.            ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- INSTRUCCIONES DE USO:
--
-- 1. SELF (verde): No se crea manualmente. Es tu tenant raiz.
--    Ya existe cuando instalas la plataforma.
--
-- 2. MANAGED (azul): POST /admin/fleet { name, access_level: "managed" }
--    Tu ves TODOS sus datos: leads, eventos, custom_data, telefonos.
--    Ideal para: clientes que te contratan para analisis de datos.
--    Ejemplo: "Hazme una landing y analiza mis leads".
--
-- 3. HOSTED (naranja): POST /admin/fleet { name, access_level: "hosted" }
--    Tu NO ves sus datos. Solo metricas de uso (conteos, actividad).
--    Ideal para: clientes que solo quieren la plataforma.
--    Ejemplo: "Solo quiero tracking de mis formularios".
--
-- 4. RESELLER (morado): POST /admin/fleet { name, access_level: "reseller" }
--    Tu aliado comercial. El puede crear SUS PROPIOS sub-clientes.
--    Tu ves metricas del reseller, pero NO datos de sus clientes finales.
--    El reseller opera su propio /admin/fleet con su api_key.
--    Ideal para: aliados estrategicos que revenden tu plataforma.
--    Ejemplo: "Agencia Digital X me pide la plataforma para sus clientes".
--    El reseller puede tener branding propio (white-label).
--
-- 5. CONTRACTOR (dorado): POST /admin/fleet { name, access_level: "contractor", expires_in_days: 90 }
--    Alguien te subcontrata para un proyecto temporal.
--    Tu tienes acceso total PERO con fecha de expiracion.
--    Despues de la fecha, tu acceso se revoca automaticamente.
--    Ideal para: proyectos freelance con fecha de entrega.
--    Ejemplo: "Construyeme un CRM, tienes 3 meses".

-- Actualizar constraint
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS check_access_level;
ALTER TABLE tenants ADD CONSTRAINT check_access_level
  CHECK (access_level IN ('self', 'managed', 'hosted', 'reseller', 'contractor'));

-- Campo: fecha de expiracion de acceso (para contractor)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ;

-- Campo: branding personalizado (para reseller white-label)
-- Estructura: { "brand_name": "Mi Agencia", "logo_url": "https://...", "primary_color": "#FF0000" }
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT NULL;
