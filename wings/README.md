# MANUAL DE X-WINGS (SUB-SISTEMAS) 🛸

Este es el hangar de las **X-Wings**. Cada carpeta aquí es un sub-sistema o landing page que se conecta a la **Nave Nodriza** (Axis CRM Engine).

## 🚀 Cómo crear una nueva X-Wing

1.  **Crea una carpeta** con el nombre de tu proyecto (ej: `nuevo-desarrollo`).
2.  **Copia el `connector.js`** de otra wing a tu nueva carpeta.
3.  **Configura el Conector** en tu `index.html`:
    ```html
    <script src="connector.js"></script>
    <script>
      AxisConnector.init({
        apiKey: 'TU_API_KEY', // Obtenida de la tabla tenants
        projectId: 'ID_PROYECTO' // Obtenido de la tabla projects
      });
    </script>
    ```
4.  **Envía Leads**: Usa `AxisConnector.sendLead(data)` para capturar prospectos.

## 🏛️ Política de Assets
-   **Assets Locales (`/assets`)**: Fotos del proyecto, avatars específicos, copys únicos.
-   **Assets Compartidos (`/shared`)**: El motor sirve assets comunes en `/shared/` (fonts, iconos globales, lógica de búnker).

## 🔗 Conexión con la Nodriza
Las X-Wings están desacopladas. Pueden ser desplegadas en Netlify o Vercel de forma independiente, siempre y cuando la `mothershipUrl` en `connector.js` apunte a la instancia correcta de Railway.
