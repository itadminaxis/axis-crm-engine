# GUÍA TÁCTICA: OPERACIÓN DEL ECOSISTEMA AXIS 🏛️🛰️

Bienvenido a la **Estación de Mando Axis**. Esta guía detalla cómo operar, visualizar y escalar tu búnker industrial de leads paso a paso.

---

### **PASO 1: ACTIVACIÓN DEL BÚNKER (DESPLIEGUE)** 🚀

Para que el sistema sea accesible desde cualquier lugar del mundo:
1.  **Sincroniza el Código:** Sube tus cambios a GitHub (`git push origin main`).
2.  **Verifica Railway:** Entra a tu dashboard de Railway y confirma que el despliegue del servicio `attractive-mindfulness` esté en verde (Active).
3.  **Base de Datos:** Asegúrate de que el servicio `Postgres` esté online.

---

### **PASO 2: ACCESO A LA ESTACIÓN DE MANDO** 🛰️

Tu centro de control centralizado está disponible en:
👉 `https://attractive-mindfulness-production.up.railway.app/dashboard/station`

1.  **Ingresa tu API Key Maestra:** 
    `93f9a45054b0724153c6ff9acaf5a9deed460ed5eed08eb4c9e40831bbbf14c6`
2.  **Visualiza el Flujo:** A la izquierda verás el **Axis Flow Canvas** (el mapa de naves y conexiones). A la derecha, verás el **Tablero de Control** con la actividad de leads en tiempo real.

---

### **PASO 3: LANZAMIENTO DE UNA X-WING (SENSOR)** 🛸

Para capturar leads en un nuevo mercado o proyecto:
1.  **Crea tu Landing Page:** Puedes usar cualquier herramienta (HTML/JS, Webflow, etc.).
2.  **Inyecta el Conector:** Asegúrate de que el archivo `connector.js` esté cargado y configurado con tu `projectId` único.
3.  **Prueba de Ingesta:** Envía un lead desde el formulario.
4.  **Verificación:** El lead debe aparecer instantáneamente en tu **Estación de Mando** y el nodo de "Ingesta" en el Canvas brillará.

---

### **PASO 4: INTERPRETACIÓN DE LA INTELIGENCIA** 🧬

Cuando un lead entra:
1.  **Búnker RLS:** El motor lo aisla físicamente para evitar piratería.
2.  **Worker Queue:** Se crea una tarea asíncrona para la IA.
3.  **IA Prescriptiva:** El sistema analiza el lead y prescribe la "Siguiente Mejor Acción" (Next Best Action).
4.  **Torre de Visión:** Tú ves todo este viaje desde el dashboard.

---

### **CONSEJOS DE ARQUITECTO (QUINTIL OUTLIER)** 💎
- **Soberanía:** Nunca compartas tu API Key Maestra. Es la única llave que abre todos los búnkers.
- **Escalabilidad:** Cada vez que lances una nueva X-Wing, el Canvas se actualizará automáticamente para mostrar el nuevo nodo de captura.
- **Vigilancia:** Mantén la Estación de Mando abierta en una pantalla secundaria para monitorear el "pulso" de tu negocio.

**Certified by the Architect: Andres Abel Fuentes Esquivel.**
**Status:** Operations Ready.
