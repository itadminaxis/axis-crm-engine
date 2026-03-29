/**
 * gulf-sentinel.route.js
 * API backend para el dashboard Gulf Sentinel.
 * Rutas públicas — sin autenticación (datos ambientales de acceso abierto).
 *
 * GET /api/sar-history   — detecciones SAR (Cerulean / Sentinel-1)
 * GET /api/model         — modelo de trayectoria + viento (Open-Meteo) + corrientes (HYCOM)
 */

import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import https from 'https';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ruta al JSON de detecciones
const SAR_JSON = path.join(__dirname, '../public/golfo/cerulean_detections_march2026.json');

// Coordenadas del origen del derrame (Coatzacoalcos)
const ORIGIN_LAT = 18.25;
const ORIGIN_LON = -94.35;

// ── HELPER: fetch HTTPS ──────────────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 8000 }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error')); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

// ── GET /api/sar-history ─────────────────────────────────────────────────────
router.get('/sar-history', (req, res) => {
  try {
    const raw = readFileSync(SAR_JSON, 'utf8');
    const detections = JSON.parse(raw);
    res.json({ detections, source: 'cerulean_local', count: detections.length });
  } catch (e) {
    res.status(500).json({ error: e.message, detections: [] });
  }
});

// ── GET /api/model ───────────────────────────────────────────────────────────
router.get('/model', async (req, res) => {
  const targetLat = req.query.target_lat ? parseFloat(req.query.target_lat) : null;
  const targetLon = req.query.target_lon ? parseFloat(req.query.target_lon) : null;
  const targetName = req.query.target_name || null;

  const now = new Date();
  const nextUpdate = new Date(now.getTime() + 5 * 60 * 1000); // 5 min

  // Viento — Open-Meteo (gratis, sin key)
  let wind = { wind_speed_kt: 'N/D', wind_dir_deg: 'N/D' };
  try {
    const wData = await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${ORIGIN_LAT}&longitude=${ORIGIN_LON}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kn`
    );
    const cur = wData.current || {};
    wind = {
      wind_speed_kt: cur.wind_speed_10m ?? 'N/D',
      wind_dir_deg:  cur.wind_direction_10m ?? 'N/D',
    };
  } catch (_) {}

  // Corrientes HYCOM — ERDDAP
  let current = { dir_to_deg: 'N/D', speed_kt: 'N/D', time: 'N/D', stale_warning: null };
  try {
    const timeStr = now.toISOString().slice(0, 13) + ':00:00Z';
    const hycomUrl = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/HYCOM_reg1_agg.json?water_u[(${timeStr}):1:(${timeStr})][(0.0):1:(0.0)][(${ORIGIN_LAT}):1:(${ORIGIN_LAT})][(${ORIGIN_LON + 360}):1:(${ORIGIN_LON + 360})]&water_v[(${timeStr}):1:(${timeStr})][(0.0):1:(0.0)][(${ORIGIN_LAT}):1:(${ORIGIN_LAT})][(${ORIGIN_LON + 360}):1:(${ORIGIN_LON + 360})]`;
    const hData = await fetchJson(hycomUrl);
    const rows = hData?.table?.rows || [];
    if (rows.length > 0) {
      const u = parseFloat(rows[0][4]); // m/s east
      const v = parseFloat(rows[0][5]); // m/s north
      if (!isNaN(u) && !isNaN(v)) {
        const speedMs = Math.sqrt(u * u + v * v);
        const speedKt = speedMs * 1.94384;
        const dirTo = (Math.atan2(u, v) * 180 / Math.PI + 360) % 360;
        current = { dir_to_deg: Math.round(dirTo), speed_kt: speedKt.toFixed(2), time: timeStr };
      }
    }
  } catch (_) {}

  // Trayectoria simplificada (deriva por viento)
  const trajectory = [];
  const corridor = [];
  let etaText = 'N/D';
  let confidence = 20;
  let towardsTarget = null;

  const ws = typeof wind.wind_speed_kt === 'number' ? wind.wind_speed_kt : null;
  const wd = typeof wind.wind_dir_deg  === 'number' ? wind.wind_dir_deg  : null;

  if (ws !== null && wd !== null) {
    confidence = 50;
    const alpha = 0.035; // 3.5% del viento = drift
    const driftSpeedKt = alpha * ws;
    const driftDirTo = (wd + 180) % 360;
    const driftRad = driftDirTo * Math.PI / 180;
    const driftKmH = driftSpeedKt * 1.852;

    const STEPS = 72; // 72h
    let lat = ORIGIN_LAT, lon = ORIGIN_LON;
    const R = 6371;

    for (let h = 0; h <= STEPS; h += 6) {
      const dLat = (driftKmH * 6 * Math.cos(driftRad)) / R * (180 / Math.PI);
      const dLon = (driftKmH * 6 * Math.sin(driftRad)) / (R * Math.cos(lat * Math.PI / 180)) * (180 / Math.PI);
      if (h > 0) { lat += dLat; lon += dLon; }
      trajectory.push({ lat: parseFloat(lat.toFixed(4)), lon: parseFloat(lon.toFixed(4)), t_hours: h });

      const bandFactor = 1.0 + ((100 - confidence) / 70.0);
      const perpRad = driftRad + Math.PI / 2;
      const bandKm = driftKmH * h * 0.15 * bandFactor;
      corridor.push({ lat: lat + bandKm / R * (180 / Math.PI) * Math.cos(perpRad), lon: lon + bandKm / R * (180 / Math.PI) * Math.sin(perpRad) / Math.cos(lat * Math.PI / 180) });
    }
    // Cerrar corredor
    [...trajectory].reverse().forEach(p => corridor.push({ lat: p.lat - (trajectory[1]?.lat - trajectory[0]?.lat || 0) * 0.3, lon: p.lon }));
  }

  // ETA y bearing si hay target
  let target = null;
  let bearingToTarget = null;
  let distanceToTarget = null;

  if (targetLat !== null && targetLon !== null) {
    target = { lat: targetLat, lon: targetLon, name: targetName };
    const R = 6371;
    const dLat = (targetLat - ORIGIN_LAT) * Math.PI / 180;
    const dLon = (targetLon - ORIGIN_LON) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(ORIGIN_LAT * Math.PI/180) * Math.cos(targetLat * Math.PI/180) * Math.sin(dLon/2)**2;
    distanceToTarget = parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1));
    const y = Math.sin(dLon) * Math.cos(targetLat * Math.PI/180);
    const x = Math.cos(ORIGIN_LAT * Math.PI/180) * Math.sin(targetLat * Math.PI/180) - Math.sin(ORIGIN_LAT * Math.PI/180) * Math.cos(targetLat * Math.PI/180) * Math.cos(dLon);
    bearingToTarget = Math.round(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360);

    if (trajectory.length > 1 && ws !== null) {
      const alpha = 0.035;
      const driftSpeedKmH = alpha * ws * 1.852;
      if (driftSpeedKmH > 0) {
        const etaH = distanceToTarget / driftSpeedKmH;
        const h = Math.floor(etaH);
        const m = Math.round((etaH - h) * 60);
        etaText = `${h}H ${String(m).padStart(2,'0')}M`;
        towardsTarget = true;
        confidence = Math.min(confidence + 20, 80);
      }
    }
  }

  res.json({
    generated_at_utc: now.toISOString(),
    next_update_utc:  nextUpdate.toISOString(),
    model: 'AXIS-DRIFT-v1 (Open-Meteo + HYCOM)',
    start: { lat: ORIGIN_LAT, lon: ORIGIN_LON },
    target,
    wind,
    current,
    trajectory,
    corridor,
    eta_text: etaText,
    confidence,
    towards_target: towardsTarget,
    bearing_to_target_deg: bearingToTarget,
    distance_to_target_km: distanceToTarget,
    origin_note: 'Origen: Coatzacoalcos (Sentinel-1 SAR, 1 Mar 2026)',
    sar: { numberMatched: null, hours: 'N/D', radius_km: 'N/D', recent_detections: [] },
    credibility: { false_positive_risk: 'N/D' }
  });
});

// ── GET /api/sar-sentinelhub ─────────────────────────────────────────────────
router.get('/sar-sentinelhub', (req, res) => {
  res.json({ enabled: false, reason: 'credenciales no configuradas en servidor' });
});

// ── POST /api/sentinelhub/credentials ───────────────────────────────────────
router.post('/sentinelhub/credentials', (req, res) => {
  res.json({ ok: false, reason: 'Credenciales Sentinel Hub no soportadas en este entorno' });
});

export default router;
