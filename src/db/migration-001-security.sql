-- MIGRATION 001: Security - Public tokens for X-Wing connectors
-- Agrega un token público por proyecto para que los frontends
-- puedan enviar leads sin exponer la API key maestra del tenant.

-- 1. Agregar columna public_token a projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS public_token TEXT UNIQUE
  DEFAULT encode(gen_random_bytes(16), 'hex');

-- 2. Generar tokens para proyectos existentes que no tengan uno
UPDATE projects SET public_token = encode(gen_random_bytes(16), 'hex')
  WHERE public_token IS NULL;

-- 3. Indice para busqueda rapida por token
CREATE INDEX IF NOT EXISTS idx_projects_public_token ON projects(public_token);
