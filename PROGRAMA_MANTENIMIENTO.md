# PROGRAMA DE MANTENIMIENTO - CAPA CENTINELA 📡🛠️

Para mantener el búnker en el quinto quintil de ingresos y seguridad, se deben ejecutar estas tareas periódicamente:

## 1. Auditoría de Salud (Diaria)
- **Acción:** Consultar `GET /health`.
- **Objetivo:** Verificar que la base de datos y el worker estén sincronizados.

## 2. Vigilancia Centinela (Semanal)
- **Acción:** Ejecutar `npm audit` en la raíz.
- **Objetivo:** Detectar y corregir vulnerabilidades en las librerías de Node.js antes de que sean explotadas.

## 3. Radar de Gigantes (Mensual)
- **Acción:** Comparar el archivo `src/controllers/webhook.controller.js` con la documentación oficial de Meta (Graph API).
- **Objetivo:** Asegurar que el muelle de entrada no quede obsoleto por cambios de versión de Facebook/WhatsApp.

## 4. Limpieza de Bodega (Trimestral)
- **Acción:** Revisar la tabla `graphile_worker.jobs`.
- **Objetivo:** Asegurar que no haya tareas fallidas acumuladas que estén consumiendo recursos de la DB.

---
**Recuerda:** Tu ventaja competitiva es la soberanía del dato. Mantener el motor limpio es mantener el ROI alto.
