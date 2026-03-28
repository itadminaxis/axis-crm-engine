# MANUAL DE OPERACIÓN - BÚNKER AXIS 📖🚀
**Propietario:** Andres Abel Fuentes Esquivel

---

## 📥 Entradas al Sistema (Ingesta)

### 1. Webhook Universal (Meta / TikTok)
- **Endpoint:** `POST /webhook`
- **Uso:** Recibir leads automáticos de campañas de publicidad.
- **Instrucción:** Meta requiere validación vía `GET /webhook` con el `hub.verify_token` configurado en el `.env`.

### 2. Registro Manual / In Situ
- **Endpoint:** `POST /leads/manual`
- **Header Requerido:** `x-api-key: [Tu_API_Key]`
- **Cuerpo (JSON):** 
  ```json
  { "phone": "+52...", "name": "Lead Name", "interes": "Proyecto X" }
  ```
- **Instrucción:** Úsalo para conectar tus propias webs, QR o business cards.

---

## 📤 Salidas del Sistema (Resultados)

### 1. Consulta de Bodega (CRM API)
- **Endpoint:** `GET /leads`
- **Funcionalidad:** Lista de prospectos con búsqueda inteligente dentro del JSONB.
- **Filtro:** Puedes buscar por cualquier campo (ej. `?search=Penthouse`).

### 2. Speed to Lead (Respuesta ⚡)
- **Salida:** Mensaje automático vía WhatsApp/Email gestionado por el Worker.
- **Audit:** Verifica el campo `first_response_sent` en el lead.

### 3. Cerebro Prescriptivo (IA)
- **Salida:** Bloque `ai_insights` dentro del lead con el Score y la "Siguiente Mejor Acción".

---

## 🕹️ Instrucciones de Uso Modular
Para encender/apagar módulos en un proyecto:
1. Crea el proyecto en la tabla `projects`.
2. Activa los campos `enable_ai_prescriptive`, `enable_blockchain_seal`, etc.
3. Envía el `project_id` en la ingesta del lead para aplicar la configuración.

---
**Comando de Ejecución:** `npm run dev` (Inicia servidor y worker simultáneamente).
