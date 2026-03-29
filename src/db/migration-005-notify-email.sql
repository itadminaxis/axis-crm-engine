-- MIGRATION 005: notify_email por tenant + campo para digest mensual
-- Cada tenant puede tener su propio email de notificaciones.
-- Reemplaza la variable de entorno global NOTIFY_EMAIL para el modelo fleet.
-- Copyright (c) 2026 Andres Abel Fuentes Esquivel.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notify_email TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS digest_enabled BOOLEAN DEFAULT true;

COMMENT ON COLUMN tenants.notify_email IS 'Email para notificaciones de leads y digest mensual de este tenant';
COMMENT ON COLUMN tenants.digest_enabled IS 'Si false, no recibe el digest mensual aunque tenga notify_email';
