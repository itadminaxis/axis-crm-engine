import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import webhookRoutes from './routes/webhook.route.js';
import leadRoutes from './routes/lead.route.js';
import flowRoutes from './routes/flow.route.js';
import metricsRoutes from './routes/metrics.route.js';
import submitRoutes from './routes/submit.route.js';
import eventRoutes from './routes/event.route.js';
import projectRoutes from './routes/project.route.js';
import streamRoutes from './routes/stream.route.js';
import fleetRoutes from './routes/fleet.route.js';
import healthRoutes from './routes/health.route.js';
import googleAdsRoutes from './routes/google-ads.route.js';
import linkedinRoutes from './routes/linkedin.route.js';
import { tenantMiddleware, tenantStorage } from './middleware/tenant.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// --- SEGURIDAD: HELMET (Headers HTTP de protección) ---
app.use(helmet({
  contentSecurityPolicy: false, // Desactivar CSP para dashboards con scripts inline
  crossOriginEmbedderPolicy: false
}));

// --- SEGURIDAD: CORS (Orígenes permitidos) ---
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'https://casaya.homes',
  'https://vane.casaya.homes',
  'https://www.casaya.homes',
  'https://attractive-mindfulness-prod.up.railway.app',
  'https://nocodb-production-1874.up.railway.app',
  process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (Postman, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Bloqueado por CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'x-project-token']
}));

// --- SEGURIDAD: RATE LIMITING ---
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta en 1 minuto.' }
});

const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de envíos excedido. Intenta en 1 minuto.' }
});

app.use(globalLimiter);
app.use(express.json({ limit: '100kb' })); // Limitar tamaño de payload

// --- SERVIDORES ESTÁTICOS ---
app.use('/shared', express.static(path.join(__dirname, 'public/shared')));
app.use('/dashboard', express.static(path.join(__dirname, 'public/dashboard')));
app.get('/dashboard/canvas', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard/flow.html'));
});
app.get('/dashboard/station', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard/station.html'));
});
app.get('/dashboard/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard/admin.html'));
});
app.use('/wings', express.static(path.join(__dirname, '../wings')));

// --- SWAGGER ---
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Axis CRM Engine API',
      version: '2.0.0',
      description: 'API multi-tenant para gestión de leads inmobiliarios.',
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3000}`,
        description: 'Servidor Local',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Llave privada del tenant (solo para dashboard/admin)',
        },
        ProjectToken: {
          type: 'apiKey',
          in: 'header',
          name: 'x-project-token',
          description: 'Token público del proyecto (para X-Wings/frontends)',
        },
      },
    },
  },
  apis: ['./src/server.js', './src/routes/*.js'],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @openapi
 * /:
 *   get:
 *     summary: Health Check
 *     responses:
 *       200:
 *         description: Motor encendido.
 */
app.get('/', (req, res) => {
  res.send('Axis CRM Engine');
});

// --- RUTAS PÚBLICAS (sin autenticación de tenant) ---
app.use('/health', healthRoutes);
app.use('/api/submit', submitLimiter, submitRoutes);

// --- INTEGRACIONES EXTERNAS (autenticadas por token + secret propio) ---
// Google Ads Lead Form Extensions → ?token=PROJECT_TOKEN&secret=GOOGLE_ADS_WEBHOOK_SECRET
app.use('/api/integrations/google-ads', submitLimiter, googleAdsRoutes);
// LinkedIn Lead Gen Forms → ?token=PROJECT_TOKEN (firma HMAC en header)
app.use('/api/integrations/linkedin', submitLimiter, linkedinRoutes);

// SSE: EventSource no soporta headers custom, convertir query param a header
app.use('/stream/live', (req, res, next) => {
  if (!req.headers['x-api-key'] && req.query['x-api-key']) {
    req.headers['x-api-key'] = req.query['x-api-key'];
  }
  next();
});

// --- RUTAS PROTEGIDAS (requieren x-api-key) ---
app.use(tenantMiddleware);

app.use('/webhook', webhookRoutes);
app.use('/leads', leadRoutes);
app.use('/flow', flowRoutes);
app.use('/metrics', metricsRoutes);
app.use('/events', eventRoutes);
app.use('/projects', projectRoutes);
app.use('/stream', streamRoutes);
app.use('/admin/fleet', fleetRoutes);

/**
 * @openapi
 * /test-identity:
 *   get:
 *     summary: Validar Identidad del Tenant
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Identidad confirmada.
 *       403:
 *         description: API Key inválida.
 */
app.get('/test-identity', (req, res) => {
  const store = tenantStorage.getStore();

  if (!store) {
    return res.status(500).json({ error: 'No se pudo recuperar el contexto del tenant' });
  }

  res.json({
    message: 'Identidad confirmada',
    tenant: {
      id: store.tenantId,
      name: store.tenantName
    }
  });
});

// GESTIÓN GLOBAL DE ERRORES
app.use(errorMiddleware);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`API docs: http://localhost:${PORT}/api-docs`);
});
