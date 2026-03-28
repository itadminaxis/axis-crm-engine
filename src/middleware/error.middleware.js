/**
 * MIDDLEWARE CENTINELA - GESTIÓN GLOBAL DE ERRORES 🛡️
 * Captura fallos en las tuberías y protege la integridad del búnker.
 */
export const errorMiddleware = (err, req, res, next) => {
  console.error(`[CENTINELA ERROR]: ${err.message}`);
  console.error(err.stack);

  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Error interno en el búnker. Los técnicos han sido notificados.' 
    : err.message;

  res.status(status).json({
    error: true,
    message,
    timestamp: new Date().toISOString()
  });
};
