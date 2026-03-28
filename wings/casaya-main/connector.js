/**
 * CONNECTOR.JS - AXIS CRM ENGINE v2
 * Conexión segura entre X-Wing (Frontend) y Mothership (Backend).
 * Usa project token público en lugar de API key privada.
 */

const AxisConnector = (() => {
    let config = {
        mothershipUrl: 'https://attractive-mindfulness-production.up.railway.app',
        projectToken: '' // Token público del proyecto (NO es la API key)
    };

    /**
     * Inicializa el conector con el token del proyecto.
     */
    const init = (params) => {
        config = { ...config, ...params };
        console.log('Axis Connector v2: Inicializado');
    };

    /**
     * Envía un lead al motor central usando el endpoint público.
     */
    const sendLead = async (leadData) => {
        if (!config.projectToken) {
            console.error('Axis Connector: Error - No se ha configurado el project token.');
            return;
        }

        const payload = {
            ...leadData,
            metadata: {
                url: window.location.href,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString(),
                utm: getUTMs()
            }
        };

        try {
            const response = await fetch(`${config.mothershipUrl}/api/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-project-token': config.projectToken
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            console.log('Axis Connector: Lead enviado', result);
            return result;
        } catch (error) {
            console.error('Axis Connector: Error al enviar lead', error.message);
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

window.AxisConnector = AxisConnector;
