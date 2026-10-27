-- Capacidad del canal de aviso por dispositivo. Versiones anteriores: V1.
-- Aplicar PRIMERO esta migracion, DESPUES desplegar la Edge Function
-- y FINALMENTE distribuir la nueva APK, todo con autorizacion expresa.
ALTER TABLE public.push_device_tokens
  ADD COLUMN job_alert_channel_version smallint NOT NULL DEFAULT 1
  CHECK (job_alert_channel_version IN (1, 2));

COMMENT ON COLUMN public.push_device_tokens.job_alert_channel_version IS
  '1 = canal Android anterior; 2 = sonido oficial del conductor actualizado';