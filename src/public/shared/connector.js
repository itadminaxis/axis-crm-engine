/**
 * CONNECTOR.JS - AXIS CRM ENGINE 🚀
 * El cordón umbilical entre el X-Wing (Frontend) y la Nave Nodriza (Backend).
 * 
 * Este script estandariza el envío de leads, el rastreo de eventos 
 * y la comunicación segura con el Búnker Axis.
 */

const AxisConnector = (() => {
    // Configuración por defecto (Sobrescribir en el index.html)
    let config = {
        mothershipUrl: 'https://attractive-mindfulness-production.up.railway.app', // URL real de tu servicio en Railway
        apiKey: '', 
        projectId: '' 
    };

    /**
     * Inicializa el conector con los parámetros del proyecto.
     */
    const init = (params) => {
        config = { ...config, ...params };
        console.log('Axis Connector: Inicializado para el proyecto', config.projectId);
    };

    /**
     * Envía un lead al motor central.
     */
    const sendLead = async (leadData) => {
        if (!config.apiKey) {
            console.error('Axis Connector: Error - No se ha configurado la API Key.');
            return;
        }

        const payload = {
            ...leadData,
            project_id: config.projectId,
            metadata: {
                url: window.location.href,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString(),
                utm: getUTMs()
            }
        };

        try {
            const response = await fetch(`${config.mothershipUrl}/leads/manual`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': config.apiKey
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            console.log('Axis Connector: Lead enviado con éxito ✅', result);
            return result;
        } catch (error) {
            console.error('Axis Connector: Error al enviar lead ❌', error.message);
            throw error;
        }
    };

    /**
     * Captura parámetros UTM de la URL.
     */
    const getUTMs = () => {
        const params = new URLSearchParams(window.location.search);
        return {
            source: params.get('utm_source') || '',
            medium: params.get('utm_medium') || '',
            campaign: params.get('utm_campaign') || '',
            content: params.get('utm_content') || '',
            term: params.get('utm_term') || ''
        };
    };

    return { init, sendLead };
})();

// Exportar para uso en el frontend
window.AxisConnector = AxisConnector;
