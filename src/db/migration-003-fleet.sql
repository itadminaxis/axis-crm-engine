-- MIGRATION 003: FLOTA EXTERNA
-- Agrega managed_by y access_level a tenants para soportar clientes externos.
-- Copyright (c) 2026 Andres Abel Fuentes Esquivel.

-- Campo: quien administra este tenant
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS managed_by UUID REFERENCES tenants(id);

-- Campo: nivel de acceso del administrador
-- self = tu propio negocio
-- managed = cliente que te da acceso total
-- hosted = cliente SaaS puro (solo servir)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'self'
  CHECK (access_level IN ('self', 'managed', 'hosted'));

-- Indice para buscar flota rapidamente
CREATE INDEX IF NOT EXISTS idx_tenants_managed_by ON tenants(managed_by);
