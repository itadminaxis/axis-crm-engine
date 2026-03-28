/**
 * FLOW.JS - AXIS FLOW SCHEMA 🧬
 * Define la estructura de nodos y bordes para la visualización dinámica del ecosistema.
 * Basado en la arquitectura de grafos (DAG) tipo n8n.
 */

export const getEcosystemFlow = (projects = []) => {
    const nodes = [
        // 1. CAPA DE ENTRADA (SENSORS)
        { id: 'entry_manual', label: 'Ingesta Manual', group: 'sensor', level: 0 },
        { id: 'entry_webhook', label: 'Meta Webhook', group: 'sensor', level: 0 },
        
        // 2. CAPA DE PROCESAMIENTO (MOTHERSHIP)
        { id: 'axis_core', label: 'Axis Core Motor', group: 'core', level: 1 },
        { id: 'rls_bunker', label: 'Bunker PostgreSQL (RLS)', group: 'storage', level: 2 },
        
        // 3. CAPA DE INTELIGENCIA (WORKERS)
        { id: 'ai_prescriptive', label: 'IA Prescriptiva', group: 'ai', level: 2 },
        { id: 'worker_queue', label: 'Graphile Worker Queue', group: 'worker', level: 2 },
        
        // 4. CAPA DE SALIDA (EFFECTORS)
        { id: 'instant_response', label: 'Respuesta Instantánea', group: 'effector', level: 3 },
        { id: 'tower_vision', label: 'Torre de Visión', group: 'vision', level: 3 }
    ];

    const edges = [
        // Flujo de Ingesta
        { from: 'entry_manual', to: 'axis_core', arrows: 'to', label: 'x-api-key' },
        { from: 'entry_webhook', to: 'axis_core', arrows: 'to', label: 'validation' },
        
        // Flujo Interno
        { from: 'axis_core', to: 'rls_bunker', arrows: 'to', label: 'persist' },
        { from: 'axis_core', to: 'worker_queue', arrows: 'to', label: 'enqueue' },
        
        // Flujo de Inteligencia
        { from: 'worker_queue', to: 'ai_prescriptive', arrows: 'to', label: 'analyze' },
        { from: 'ai_prescriptive', to: 'worker_queue', arrows: 'to', label: 'prescribe' },
        
        // Flujo de Salida
        { from: 'worker_queue', to: 'instant_response', arrows: 'to', label: 'trigger' },
        { from: 'rls_bunker', to: 'tower_vision', arrows: 'to', label: 'feed' }
    ];

    // Inyectar X-Wings dinámicamente según los proyectos
    projects.forEach(project => {
        const wingId = `wing_${project.id}`;
        nodes.push({ 
            id: wingId, 
            label: `X-Wing: ${project.name}`, 
            group: 'wing', 
            level: -1 
        });
        edges.push({ 
            from: wingId, 
            to: 'entry_manual', 
            arrows: 'to', 
            label: 'Connector.js' 
        });
    });

    return { nodes, edges };
};
