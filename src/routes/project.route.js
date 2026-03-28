import { Router } from 'express';
import { getProjects, getProjectById, createProject, updateProjectConfig, regenerateToken, deleteProject, getTenantStats } from '../services/project.service.js';

const router = Router();

/**
 * @openapi
 * /projects:
 *   get:
 *     summary: Listar todos los X-Wings (proyectos) del tenant
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200: { description: Lista de proyectos con estadisticas }
 */
router.get('/', async (req, res) => {
  try {
    const projects = await getProjects();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @openapi
 * /projects/stats:
 *   get:
 *     summary: Estadisticas globales del tenant
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200: { description: Stats globales }
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getTenantStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @openapi
 * /projects/{id}:
 *   get:
 *     summary: Obtener detalle de un X-Wing
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Proyecto encontrado }
 *       404: { description: Proyecto no encontrado }
 */
router.get('/:id', async (req, res) => {
  try {
    const project = await getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @openapi
 * /projects:
 *   post:
 *     summary: Registrar un nuevo X-Wing (proyecto)
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               config: { type: object }
 *     responses:
 *       201: { description: Proyecto creado }
 */
router.post('/', async (req, res) => {
  try {
    const project = await createProject(req.body);
    res.status(201).json(project);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @openapi
 * /projects/{id}:
 *   put:
 *     summary: Actualizar configuracion de un X-Wing
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               enable_ai_prescriptive: { type: boolean }
 *               enable_instant_response: { type: boolean }
 *     responses:
 *       200: { description: Proyecto actualizado }
 */
router.put('/:id', async (req, res) => {
  try {
    const project = await updateProjectConfig(req.params.id, req.body);
    res.json(project);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @openapi
 * /projects/{id}/regenerate-token:
 *   post:
 *     summary: Regenerar el token publico del X-Wing
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Token regenerado }
 */
router.post('/:id/regenerate-token', async (req, res) => {
  try {
    const result = await regenerateToken(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @openapi
 * /projects/{id}:
 *   delete:
 *     summary: Eliminar un X-Wing
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Proyecto eliminado }
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await deleteProject(req.params.id);
    res.json({ message: 'Proyecto eliminado', ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
