-- ESQUEMA DE BASE DE DATOS - AXIS CRM ENGINE 🗄️
-- Copyright (c) 2026 Andres Abel Fuentes Esquivel.

-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabla de Tenants (Negocios/Empresas)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLERO DE CONTROL DE PROYECTOS (MODULARIDAD) 🕹️
-- Aquí es donde apagas o enciendes partes del motor por proyecto.
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    -- Interruptores de Módulos (Booleanos)
    enable_ai_prescriptive BOOLEAN DEFAULT TRUE,
    enable_blockchain_seal BOOLEAN DEFAULT FALSE,
    enable_3d_immersive BOOLEAN DEFAULT FALSE,
    enable_payments BOOLEAN DEFAULT FALSE,
    enable_instant_response BOOLEAN DEFAULT TRUE,
    -- Configuración específica del proyecto
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla de Leads (Contactos/Prospectos)
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL, -- Vínculo al proyecto modular
    phone TEXT NOT NULL,
    custom_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, phone)
);

-- 5. SEGURIDAD PRO: Row-Level Security (RLS) 🛡️
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy_leads ON leads
    USING (tenant_id = (current_setting('app.current_tenant_id'))::uuid);

CREATE POLICY tenant_isolation_policy_projects ON projects
    USING (tenant_id = (current_setting('app.current_tenant_id'))::uuid);

-- 6. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_api_key ON tenants(api_key);

