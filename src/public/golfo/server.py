import json
import logging
import math
import mimetypes
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from wsgiref.simple_server import make_server

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S"
)
log = logging.getLogger("gulf_sentinel")

os.environ.setdefault("XDG_CONFIG_HOME", "/tmp")

try:
    from sentinelhub import SHConfig, SentinelHubCatalog, DataCollection
except Exception:
    SHConfig = None
    SentinelHubCatalog = None
    DataCollection = None

_SH_CREDENTIALS = {"client_id": None, "client_secret": None, "set_at_utc": None}

_ALLOW_INSECURE_SSL = os.environ.get("ALLOW_INSECURE_SSL", "1") == "1"

# ---------------------------------------------------------------------------
# Trusted CA bundle: use certifi when available, else system default.
# ---------------------------------------------------------------------------
_SSL_CONTEXT = None
try:
    import certifi
    _SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
    log.info("SSL: usando bundle certifi (%s)", certifi.where())
except ImportError:
    _SSL_CONTEXT = ssl.create_default_context()
    log.info("SSL: usando bundle del sistema (instalar certifi para mayor compatibilidad)")


class GulfSentinelEngine:
    """Lógica de datos — desacoplada del servidor HTTP."""

    def _read_url(self, req, timeout=8):
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CONTEXT) as response:
                return response.read()
        except Exception as e:
            is_cert_error = (
                isinstance(e, urllib.error.URLError)
                and isinstance(getattr(e, "reason", None), ssl.SSLCertVerificationError)
            ) or "CERTIFICATE_VERIFY_FAILED" in str(e)
            if not is_cert_error:
                raise
            url_hint = getattr(req, "full_url", str(req))
            if not _ALLOW_INSECURE_SSL:
                log.error("SSL falló para %s y ALLOW_INSECURE_SSL=0 — abortando", url_hint)
                raise
            log.warning(
                "SSL cert inválido para %s — reintentando sin verificación "
                "(set ALLOW_INSECURE_SSL=0 para bloquear esto)", url_hint
            )
            ctx = ssl._create_unverified_context()
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as response:
                return response.read()

    def get_google_news_rss(self, query):
        """Google News RSS - libre y público."""
        url = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=es-419&gl=MX&ceid=MX:es-419"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            root = ET.fromstring(self._read_url(req, timeout=8))
            items = []
            for item in root.findall('.//item')[:8]:
                title = item.find('title').text or ''
                link = item.find('link').text or '#'
                pubDate = item.find('pubDate').text or ''
                items.append({"title": title, "link": link, "date": pubDate, "source": "Google News"})
            return items
        except Exception as e:
            print("Google News error:", e)
            return []

    def get_ssn_sismos(self):
        """Servicio Sismológico Nacional - UNAM. Feed XML oficial."""
        url = "http://www.ssn.unam.mx/rss/ultimos-sismos.xml"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            root = ET.fromstring(self._read_url(req, timeout=8))
            ns = {'': 'http://www.rsssf.com/rss.rdf'}
            items = []
            for item in root.findall('.//item')[:6]:
                title = item.find('title').text or 'Sismo detectado'
                link = item.find('link').text or 'http://www.ssn.unam.mx'
                pubDate = item.find('pubDate').text or ''
                items.append({"title": f"{title} - Sismológico Nacional UNAM", "link": link, "date": pubDate, "source": "SSN UNAM"})
            return items
        except Exception as e:
            print("SSN error:", e)
            return []

    def get_noaa_weather(self):
        """NOAA Marine Weather - Feed RSS Oficial."""
        url = "https://www.nhc.noaa.gov/nhc_at1.xml"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            root = ET.fromstring(self._read_url(req, timeout=8))
            items = []
            for item in root.findall('.//item')[:4]:
                title = (item.find('title').text or 'NOAA Alert') + ' - NOAA NHC'
                link = item.find('link').text or 'https://www.nhc.noaa.gov'
                pubDate = item.find('pubDate').text or ''
                items.append({"title": title, "link": link, "date": pubDate, "source": "NOAA NHC"})
            return items
        except Exception as e:
            print("NOAA error:", e)
            return []

    def get_usgs_earthquakes(self):
        """USGS Earthquake Feed - GeoJSON Oficial. Sismos M4.5+ últimas 24h."""
        url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            data = json.loads(self._read_url(req, timeout=8))
            items = []
            for feature in data.get('features', [])[:5]:
                props = feature['properties']
                place = props.get('place', 'Ubicación no especificada')
                mag = props.get('mag', '?')
                time_ms = props.get('time', 0)
                url_detail = props.get('url', 'https://earthquake.usgs.gov')
                from datetime import datetime, timezone
                dt = datetime.fromtimestamp(time_ms / 1000, tz=timezone.utc)
                date_str = dt.strftime('%a, %d %b %Y %H:%M:%S +0000')
                title = f"M{mag} - {place} - USGS Earthquake"
                items.append({"title": title, "link": url_detail, "date": date_str, "source": "USGS"})
            return items
        except Exception as e:
            print("USGS error:", e)
            return []

    def get_open_meteo_wind(self):
        """Open-Meteo API - Vientos superficiales en tiempo real sobre el Golfo de México (18.25°N, 94.35°W)."""
        url = "https://api.open-meteo.com/v1/forecast?latitude=18.25&longitude=-94.35&current=wind_speed_10m,wind_direction_10m,surface_pressure&wind_speed_unit=kn"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            data = json.loads(self._read_url(req, timeout=8))
            current = data.get('current', {})
            return {
                "wind_speed_kt": current.get('wind_speed_10m', 'N/D'),
                "wind_dir_deg": current.get('wind_direction_10m', 'N/D'),
                "pressure_hpa": current.get('surface_pressure', 'N/D')
            }
        except Exception as e:
            print("Open-Meteo error:", e)
            return {"wind_speed_kt": "N/D", "wind_dir_deg": "N/D", "pressure_hpa": "N/D"}

    def _safe_float(self, value):
        try:
            if value is None:
                return None
            return float(value)
        except Exception:
            return None

    def _haversine_km(self, lat1, lon1, lat2, lon2):
        r = 6371.0
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return r * c

    def _step_position(self, lat, lon, bearing_deg, distance_km):
        lat_rad = math.radians(lat)
        lon_rad = math.radians(lon)
        brng = math.radians(bearing_deg)
        r = 6371.0
        delta = distance_km / r
        new_lat = math.asin(math.sin(lat_rad) * math.cos(delta) + math.cos(lat_rad) * math.sin(delta) * math.cos(brng))
        new_lon = lon_rad + math.atan2(
            math.sin(brng) * math.sin(delta) * math.cos(lat_rad),
            math.cos(delta) - math.sin(lat_rad) * math.sin(new_lat)
        )
        return (math.degrees(new_lat), ((math.degrees(new_lon) + 540.0) % 360.0) - 180.0)

    def _bearing_deg(self, lat1, lon1, lat2, lon2):
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        dlambda = math.radians(lon2 - lon1)
        y = math.sin(dlambda) * math.cos(phi2)
        x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlambda)
        return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0

    def _lon_to_360(self, lon):
        return lon % 360.0

    def _erddap_get_time_coverage_end(self, dataset_id):
        info_url = f"https://www.ncei.noaa.gov/erddap/info/{dataset_id}/index.json"
        req = urllib.request.Request(info_url, headers={'User-Agent': 'Mozilla/5.0'})
        data = json.loads(self._read_url(req, timeout=12))
        table = data.get("table", {})
        rows = table.get("rows", [])
        for r in rows:
            if len(r) >= 5 and r[1] == "NC_GLOBAL" and r[2] == "time_coverage_end":
                value = r[4]
                if isinstance(value, str) and value.endswith("Z"):
                    return value
                return str(value)
        return None

    def _erddap_griddap_point_json(self, dataset_id, var_name, time_iso, depth_m, lat, lon):
        base = f"https://www.ncei.noaa.gov/erddap/griddap/{dataset_id}.json?"
        q = f"{var_name}[({time_iso})][({depth_m})][({lat})][({lon})]"
        url = base + urllib.parse.quote(q, safe='=&,:T.Z()')
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        data = json.loads(self._read_url(req, timeout=15))
        rows = data.get("table", {}).get("rows", [])
        if not rows:
            return None
        last = rows[-1]
        if len(last) < 5:
            return None
        return {"time": last[0], "depth": last[1], "lat": last[2], "lon": last[3], "value": last[4]}

    def get_hycom_surface_current(self, lat, lon):
        dataset_id = "Hycom_sfc_3d"
        time_iso = self._erddap_get_time_coverage_end(dataset_id)
        if not time_iso:
            time_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z")
        lon360 = self._lon_to_360(lon)
        u = self._erddap_griddap_point_json(dataset_id, "water_u", time_iso, 0, lat, lon360)
        v = self._erddap_griddap_point_json(dataset_id, "water_v", time_iso, 0, lat, lon360)
        u_mps = self._safe_float(u.get("value") if u else None)
        v_mps = self._safe_float(v.get("value") if v else None)
        if u_mps is None or v_mps is None:
            return {"u_mps": "N/D", "v_mps": "N/D", "speed_kt": "N/D", "dir_to_deg": "N/D", "time": time_iso}
        speed_mps = math.sqrt((u_mps ** 2) + (v_mps ** 2))
        speed_kt = speed_mps / 0.514444
        dir_to_deg = (math.degrees(math.atan2(u_mps, v_mps)) + 360.0) % 360.0
        data_time = u.get("time") if u else time_iso
        stale_warning = None
        try:
            dt = datetime.fromisoformat(data_time.replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
            if age_hours > 48:
                age_days = int(age_hours / 24)
                stale_warning = f"Datos de corrientes con {age_days} días de antigüedad (HYCOM ERDDAP desfasado). Trayectoria menos fiable."
                log.warning("HYCOM data age: %d days (time=%s)", age_days, data_time)
        except Exception:
            pass
        result = {
            "u_mps": u_mps,
            "v_mps": v_mps,
            "speed_kt": round(speed_kt, 2),
            "dir_to_deg": round(dir_to_deg, 1),
            "time": data_time,
        }
        if stale_warning:
            result["stale_warning"] = stale_warning
        return result

    def _weathering_mass_fraction(self, t_hours):
        return 0.8 ** (float(t_hours) / 24.0)

    def _cerulean_bbox_from_radius_km(self, lat, lon, radius_km):
        lat_delta = radius_km / 111.0
        lon_delta = radius_km / (111.0 * max(0.1, math.cos(math.radians(lat))))
        return (lon - lon_delta, lat - lat_delta, lon + lon_delta, lat + lat_delta)

    def get_cerulean_sar_summary(self, lat, lon, radius_km=75, hours=72):
        now = datetime.now(timezone.utc)
        start = now - timedelta(hours=hours)
        bbox = self._cerulean_bbox_from_radius_km(lat, lon, radius_km)
        bbox_str = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"
        datetime_str = f"{start.strftime('%Y-%m-%dT%H:%M:%SZ')}/{now.strftime('%Y-%m-%dT%H:%M:%SZ')}"

        base = "https://api.cerulean.skytruth.org/collections/public.slick_plus/items"
        params = {"bbox": bbox_str, "datetime": datetime_str, "limit": "5"}
        url = base + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        try:
            data = json.loads(self._read_url(req, timeout=15))
            matched = data.get("numberMatched", "N/D")
            returned = data.get("numberReturned", "N/D")
            # Extraer detecciones recientes con metadata
            detections = []
            for feat in data.get("features", [])[:5]:
                props = feat.get("properties", {})
                detections.append({
                    "id": props.get("id"),
                    "timestamp": props.get("slick_timestamp"),
                    "confidence": round(props.get("machine_confidence", 0), 2),
                    "area_km2": round(props.get("area", 0) / 1e6, 3),
                    "url": props.get("slick_url"),
                })
            return {
                "provider": "SkyTruth Cerulean (Sentinel-1 SAR + ML)",
                "collection": "public.slick_plus",
                "checked_at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "hours": hours,
                "radius_km": radius_km,
                "bbox": {"min_lon": bbox[0], "min_lat": bbox[1], "max_lon": bbox[2], "max_lat": bbox[3]},
                "numberMatched": matched,
                "numberReturned": returned,
                "recent_detections": detections,
            }
        except Exception:
            return {
                "provider": "SkyTruth Cerulean (Sentinel-1 SAR + ML)",
                "collection": "public.slick_plus",
                "checked_at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "hours": hours,
                "radius_km": radius_km,
                "bbox": {"min_lon": bbox[0], "min_lat": bbox[1], "max_lon": bbox[2], "max_lat": bbox[3]},
                "numberMatched": "N/D",
                "numberReturned": "N/D",
                "recent_detections": [],
            }

    def get_simple_trajectory(self, start_override=None, target_override=None):
        generated_at = datetime.now(timezone.utc)
        update_interval_seconds = 300
        next_update_at = generated_at + timedelta(seconds=update_interval_seconds)

        start = start_override or {"lat": 18.25, "lon": -94.35}
        target = target_override

        alpha = 0.03
        wind = self.get_open_meteo_wind()
        wind_speed_kt = self._safe_float(wind.get("wind_speed_kt"))
        wind_dir_from_deg = self._safe_float(wind.get("wind_dir_deg"))

        current = self.get_hycom_surface_current(start["lat"], start["lon"])
        current_u_mps = self._safe_float(current.get("u_mps"))
        current_v_mps = self._safe_float(current.get("v_mps"))

        drift_speed_kt = None
        drift_dir_to_deg = None
        if wind_speed_kt is not None and wind_dir_from_deg is not None:
            drift_speed_kt = alpha * wind_speed_kt
            drift_dir_to_deg = (wind_dir_from_deg + 180.0) % 360.0

        horizon_hours = 168
        step_hours = 3

        points = [{"t_hours": 0, "lat": start["lat"], "lon": start["lon"]}]
        eta_hours = None
        eta_text = "N/D"
        start_dist = None
        bearing_to_target = None
        if target is not None:
            start_dist = self._haversine_km(start["lat"], start["lon"], target["lat"], target["lon"])
            bearing_to_target = self._bearing_deg(start["lat"], start["lon"], target["lat"], target["lon"])
        towards_target = None

        drift_u_mps = None
        drift_v_mps = None
        if drift_speed_kt is not None and drift_dir_to_deg is not None:
            drift_speed_mps = drift_speed_kt * 0.514444
            brng = math.radians(drift_dir_to_deg)
            drift_u_mps = drift_speed_mps * math.sin(brng)
            drift_v_mps = drift_speed_mps * math.cos(brng)

        total_u_mps = None
        total_v_mps = None
        if drift_u_mps is not None and drift_v_mps is not None:
            total_u_mps = drift_u_mps
            total_v_mps = drift_v_mps
        if current_u_mps is not None and current_v_mps is not None:
            total_u_mps = (total_u_mps or 0.0) + current_u_mps
            total_v_mps = (total_v_mps or 0.0) + current_v_mps

        total_speed_mps = None
        total_dir_to_deg = None
        if total_u_mps is not None and total_v_mps is not None:
            total_speed_mps = math.sqrt((total_u_mps ** 2) + (total_v_mps ** 2))
            total_dir_to_deg = (math.degrees(math.atan2(total_u_mps, total_v_mps)) + 360.0) % 360.0

        if total_speed_mps is not None and total_dir_to_deg is not None and total_speed_mps > 0:
            test_lat, test_lon = self._step_position(
                start["lat"],
                start["lon"],
                total_dir_to_deg,
                (total_speed_mps * 3600.0 * step_hours) / 1000.0
            )
            if target is not None and start_dist is not None:
                towards_target = self._haversine_km(test_lat, test_lon, target["lat"], target["lon"]) < start_dist

            lat = start["lat"]
            lon = start["lon"]
            for h in range(step_hours, horizon_hours + 1, step_hours):
                distance_km = (total_speed_mps * 3600.0 * step_hours) / 1000.0
                lat, lon = self._step_position(lat, lon, total_dir_to_deg, distance_km)
                points.append({"t_hours": h, "lat": lat, "lon": lon})

            if target is not None and start_dist is not None:
                end_dist = self._haversine_km(points[-1]["lat"], points[-1]["lon"], target["lat"], target["lon"])
                if towards_target is True and end_dist < start_dist:
                    for p in points:
                        if self._haversine_km(p["lat"], p["lon"], target["lat"], target["lon"]) <= 15.0:
                            eta_hours = p["t_hours"]
                            break
                    if eta_hours is None:
                        speed_kmh = (total_speed_mps * 3.6)
                        if speed_kmh > 0:
                            eta_hours = start_dist / speed_kmh
                    if eta_hours is not None and eta_hours >= 0:
                        h_int = int(eta_hours)
                        m_int = int(round((eta_hours - h_int) * 60.0))
                        if m_int == 60:
                            h_int += 1
                            m_int = 0
                        eta_text = f"{h_int}H {m_int:02d}M"

        confidence = 20
        if wind_speed_kt is not None and wind_dir_from_deg is not None:
            confidence += 30
        if current_u_mps is not None and current_v_mps is not None:
            # Penalizar datos de corrientes obsoletos
            current_time_str = current.get("time", "")
            try:
                ct = datetime.fromisoformat(current_time_str.replace("Z", "+00:00"))
                current_age_hours = (generated_at - ct).total_seconds() / 3600
                if current_age_hours <= 48:
                    confidence += 30       # Datos frescos: crédito completo
                elif current_age_hours <= 720:  # hasta 30 días
                    confidence += 15       # Datos moderadamente viejos
                else:
                    confidence += 5        # Datos muy obsoletos (>30d): casi inútiles
            except Exception:
                confidence += 30           # No se puede determinar: crédito por defecto
        if towards_target is True:
            confidence += 10
        if towards_target is False:
            confidence = min(confidence, 45)
        confidence = max(0, min(100, confidence))

        band_left = []
        band_right = []
        band_level = "mínimo arrepentimiento (aprox.)"
        band_factor = 1.0 + ((100.0 - confidence) / 70.0)
        for i, p in enumerate(points):
            if i == 0 and len(points) > 1:
                brg = self._bearing_deg(p["lat"], p["lon"], points[i + 1]["lat"], points[i + 1]["lon"])
            elif i > 0:
                brg = self._bearing_deg(points[i - 1]["lat"], points[i - 1]["lon"], p["lat"], p["lon"])
            else:
                brg = 0.0
            width_km = (3.0 + 1.3 * math.sqrt(max(0.0, float(p["t_hours"])))) * band_factor
            left_lat, left_lon = self._step_position(p["lat"], p["lon"], (brg - 90.0) % 360.0, width_km)
            right_lat, right_lon = self._step_position(p["lat"], p["lon"], (brg + 90.0) % 360.0, width_km)
            band_left.append({"lat": left_lat, "lon": left_lon})
            band_right.append({"lat": right_lat, "lon": right_lon})
        corridor = band_left + list(reversed(band_right))
        for p in points:
            mf = self._weathering_mass_fraction(p["t_hours"])
            p["mass_fraction"] = round(mf, 6)
            p["mass_percent"] = round(mf * 100.0, 1)

        sar = self.get_cerulean_sar_summary(start["lat"], start["lon"], radius_km=200, hours=168)
        false_positive_risk = "N/D"
        try:
            matched = sar.get("numberMatched", "N/D")
            if isinstance(matched, int) and matched == 0:
                false_positive_risk = "ALTO"
            elif isinstance(matched, int) and matched > 0:
                false_positive_risk = "BAJO"
        except Exception:
            false_positive_risk = "N/D"

        return {
            "generated_at_utc": generated_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "next_update_utc": next_update_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "update_interval_seconds": update_interval_seconds,
            "origin_note": (
                "Derrame activo desde 2026-03-01. Coatzacoalcos es una de las tres fuentes "
                "confirmadas por SEMAR. 630+ km de costa afectada. Herramienta cívica independiente; "
                "contraste con fuentes internacionales (Al Jazeera, ABC, Mongabay) y reportes de "
                "comunidades costeras."
            ),
            "start": start,
            "target": target,
            "bearing_to_target_deg": round(bearing_to_target, 1) if bearing_to_target is not None else "N/D",
            "alpha": alpha,
            "wind": wind,
            "current": current,
            "sar": sar,
            "credibility": {
                "rule": "Si hay anomalía óptica en MODIS pero no hay detecciones SAR (Cerulean) en 72h cerca del AOI, etiquetar como posible falso positivo.",
                "false_positive_risk": false_positive_risk
            },
            "total": {
                "u_mps": round(total_u_mps, 4) if total_u_mps is not None else "N/D",
                "v_mps": round(total_v_mps, 4) if total_v_mps is not None else "N/D",
                "speed_kt": round((total_speed_mps / 0.514444), 2) if total_speed_mps is not None else "N/D",
                "dir_to_deg": round(total_dir_to_deg, 1) if total_dir_to_deg is not None else "N/D"
            },
            "horizon_hours": horizon_hours,
            "step_hours": step_hours,
            "sources": {
                "modis_gibs_wmts": "https://nasa-gibs.github.io/gibs-api-docs/access-basics/",
                "sentinel1_sar_eobrowser": "https://apps.sentinel-hub.com/eo-browser/?zoom=7&lat=19.0&lng=-92.5&themeId=DEFAULT-THEME&datasetId=S1_AWS_IW_VVVH",
                "sentinel2_eobrowser": "https://apps.sentinel-hub.com/eo-browser/?zoom=7&lat=19.0&lng=-92.5&themeId=DEFAULT-THEME&datasetId=S2L2A",
                "skytruth_cerulean": "https://cerulean.skytruth.org/",
                "skytruth_cerulean_methods": "https://skytruth.org/cerulean-methods/",
                "hycom": "https://www.hycom.org/",
                "hycom_erddap": "https://www.ncei.noaa.gov/erddap/griddap/Hycom_sfc_3d.html",
                "hycom_erddap_info": "https://www.ncei.noaa.gov/erddap/info/Hycom_sfc_3d/index.html"
            },
            "weathering": {"decay_per_24h": 0.8},
            "drift": {
                "speed_kt": drift_speed_kt if drift_speed_kt is not None else "N/D",
                "dir_from_deg": wind_dir_from_deg if wind_dir_from_deg is not None else "N/D",
                "dir_to_deg": drift_dir_to_deg if drift_dir_to_deg is not None else "N/D"
            },
            "trajectory": points,
            "corridor": corridor,
            "corridor_level": band_level,
            "distance_to_target_km": round(start_dist, 2) if start_dist is not None else "N/D",
            "towards_target": towards_target if towards_target is not None else "N/D",
            "eta_hours": eta_hours if eta_hours is not None else "N/D",
            "eta_text": eta_text,
            "confidence": confidence,
            "model": "Deriva Lagrangiana simplificada (viento + corrientes HYCOM/GOFS; determinista, sin difusión turbulenta)"
        }

    def get_google_trends(self, geo='MX'):
        """Google Trends Daily RSS - Feed público oficial."""
        # Intentar con el endpoint de búsqueda realtime
        urls = [
            f"https://trends.google.com/trends/hottrends/atom/feed?pn=p{geo.lower().replace('-','')}",
            f"https://trends.google.com/trends/trendingsearches/daily/rss?geo={geo.split('-')[0]}"
        ]
        for url in urls:
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'})
                root = ET.fromstring(self._read_url(req, timeout=8))
                items = []
                for item in root.findall('.//item')[:8]:
                    title_el = item.find('title')
                    if title_el is None:
                        continue
                    title = title_el.text or ''
                    link_el = item.find('link')
                    link = link_el.text if (link_el is not None and link_el.text) else f'https://trends.google.com/trends/explore?q={urllib.parse.quote(title)}&geo={geo}'
                    pub = item.find('pubDate')
                    pubDate = pub.text if pub is not None else ''
                    traffic_el = item.find('{https://trends.google.com/trends/}approx_traffic')
                    traffic = traffic_el.text if traffic_el is not None else ''
                    suffix = f"+{traffic}" if traffic else ''
                    items.append({"title": f"{title} {suffix} - Google Trends {geo}", "link": link, "date": pubDate, "source": f"Google Trends"})
                if items:
                    return items
            except Exception:
                continue
        # Fallback: Google News sobre trending del derrame en la región
        region_q = 'derrame golfo mexico coatzacoalcos veracruz tabasco' if 'MX' in geo else 'oil spill gulf coast texas louisiana'
        return self.get_google_news_rss(region_q)

    def get_map_config(self):
        maptiler_key = os.environ.get("MAPTILER_KEY") or os.environ.get("MAPTILER_API_KEY")
        maptiler_map = os.environ.get("MAPTILER_MAP") or "streets-v2-dark"
        mapbox_token = os.environ.get("MAPBOX_TOKEN") or os.environ.get("MAPBOX_ACCESS_TOKEN")
        mapbox_style = os.environ.get("MAPBOX_STYLE") or "mapbox/dark-v11"

        if maptiler_key:
            return {
                "provider": "maptiler",
                "tile_url": f"https://api.maptiler.com/maps/{maptiler_map}/256/{{z}}/{{x}}/{{y}}.png?key={maptiler_key}",
                "tile_size": 256,
                "zoom_offset": 0,
                "max_zoom": 18,
                "attribution": "© MapTiler © OpenStreetMap contributors"
            }

        if mapbox_token:
            return {
                "provider": "mapbox",
                "tile_url": f"https://api.mapbox.com/styles/v1/{mapbox_style}/tiles/256/{{z}}/{{x}}/{{y}}?access_token={mapbox_token}",
                "tile_size": 256,
                "zoom_offset": 0,
                "max_zoom": 20,
                "attribution": "© Mapbox © OpenStreetMap contributors"
            }

        return {
            "provider": "carto",
            "tile_url": "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
            "subdomains": "abcd",
            "tile_size": 256,
            "zoom_offset": 0,
            "max_zoom": 19,
            "attribution": "© OpenStreetMap contributors © CARTO"
        }

    def get_sentinelhub_sar_status(self, lat, lon, radius_km=75, hours=72):
        now = datetime.now(timezone.utc)
        start = now - timedelta(hours=hours)
        bbox = self._cerulean_bbox_from_radius_km(lat, lon, radius_km)

        if SHConfig is None or SentinelHubCatalog is None or DataCollection is None:
            return {
                "enabled": False,
                "reason": "sentinelhub SDK no disponible",
                "checked_at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ")
            }

        client_id = os.environ.get("SH_CLIENT_ID")
        client_secret = os.environ.get("SH_CLIENT_SECRET")
        if not client_id or not client_secret:
            client_id = _SH_CREDENTIALS.get("client_id")
            client_secret = _SH_CREDENTIALS.get("client_secret")

        try:
            config = SHConfig(use_defaults=True)
        except Exception as e:
            return {
                "enabled": False,
                "reason": f"No se pudo inicializar SHConfig: {e}",
                "checked_at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ")
            }

        if client_id and client_secret:
            config.sh_client_id = client_id
            config.sh_client_secret = client_secret

        if not getattr(config, "sh_client_id", None) or not getattr(config, "sh_client_secret", None):
            return {
                "enabled": False,
                "reason": "Faltan credenciales (SH_CLIENT_ID / SH_CLIENT_SECRET o cargar en UI)",
                "checked_at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ")
            }

        try:
            catalog = SentinelHubCatalog(config=config)
            time_interval = (start.strftime("%Y-%m-%dT%H:%M:%SZ"), now.strftime("%Y-%m-%dT%H:%M:%SZ"))
            search_iterator = catalog.search(
                DataCollection.SENTINEL1,
                bbox=bbox,
                time=time_interval,
                fields={"include": ["properties.datetime"], "exclude": ["geometry"]},
                limit=3
            )
            items = list(search_iterator)
            datetimes = []
            for it in items:
                dt = (it.get("properties", {}) or {}).get("datetime")
                if dt:
                    datetimes.append(dt)
            return {
                "enabled": True,
                "checked_at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "hours": hours,
                "radius_km": radius_km,
                "bbox": {"min_lon": bbox[0], "min_lat": bbox[1], "max_lon": bbox[2], "max_lat": bbox[3]},
                "scenes_found": len(items),
                "scene_datetimes": datetimes
            }
        except Exception as e:
            return {
                "enabled": False,
                "reason": f"Error consultando Sentinel Hub: {e}",
                "checked_at_utc": now.strftime("%Y-%m-%dT%H:%M:%SZ")
            }

    def get_cerulean_all_detections(self, bbox=(-96, 17, -90, 22),
                                     start_date="2026-03-01T00:00:00Z"):
        """Trae todas las detecciones SAR del derrame activo con centroides."""
        now = datetime.now(timezone.utc)
        bbox_str = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"
        end_str = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        datetime_str = f"{start_date}/{end_str}"
        base = "https://api.cerulean.skytruth.org/collections/public.slick_plus/items"

        all_features = []
        offset = 0
        limit = 50
        max_pages = 6  # cap: 300 detecciones

        while offset < limit * max_pages:
            params = {"bbox": bbox_str, "datetime": datetime_str,
                      "limit": str(limit), "offset": str(offset)}
            url = base + "?" + urllib.parse.urlencode(params)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            try:
                data = json.loads(self._read_url(req, timeout=20))
            except Exception as e:
                log.warning("Cerulean paginación falló en offset %d: %s", offset, e)
                break
            feats = data.get("features", [])
            total = data.get("numberMatched", 0)
            all_features.extend(feats)
            if len(feats) < limit or len(all_features) >= total:
                break
            offset += limit

        detections = []
        for f in all_features:
            props = f.get("properties", {})
            geom = f.get("geometry", {})
            coords = geom.get("coordinates", [])
            gtype = geom.get("type", "")

            # Calcular centroide
            all_pts = []
            if gtype == "MultiPolygon":
                for polygon in coords:
                    for ring in polygon:
                        all_pts.extend(ring)
            elif gtype == "Polygon":
                for ring in coords:
                    all_pts.extend(ring)
            if not all_pts:
                continue

            avg_lon = sum(p[0] for p in all_pts) / len(all_pts)
            avg_lat = sum(p[1] for p in all_pts) / len(all_pts)
            ts = props.get("slick_timestamp", "")

            detections.append({
                "id": props.get("id"),
                "ts": ts,
                "date": ts[:10] if ts else "",
                "lat": round(avg_lat, 5),
                "lon": round(avg_lon, 5),
                "conf": round(props.get("machine_confidence", 0), 2),
                "area_km2": round(props.get("area", 0) / 1e6, 2),
                "url": props.get("slick_url", ""),
            })

        detections.sort(key=lambda d: d["ts"])
        return {
            "total": len(detections),
            "bbox": bbox_str,
            "start_date": start_date,
            "checked_at_utc": end_str,
            "detections": detections,
        }


# ===================================================================
#  WSGI Application
# ===================================================================

_STATIC_DIR = os.path.dirname(os.path.abspath(__file__))
_engine = GulfSentinelEngine()


def _json_response(start_response, data, status="200 OK"):
    body = json.dumps(data).encode("utf-8")
    start_response(status, [
        ("Content-Type", "application/json"),
        ("Access-Control-Allow-Origin", "*"),
        ("Content-Length", str(len(body))),
    ])
    return [body]


def _serve_static(start_response, path):
    """Sirve archivos estáticos del directorio del proyecto."""
    if path in ("", "/"):
        path = "/index.html"
    safe = os.path.normpath(path.lstrip("/"))
    if safe.startswith(".."):
        start_response("403 Forbidden", [("Content-Type", "text/plain")])
        return [b"Forbidden"]
    full = os.path.join(_STATIC_DIR, safe)
    if not os.path.isfile(full):
        start_response("404 Not Found", [("Content-Type", "text/plain")])
        return [b"Not Found"]
    ctype, _ = mimetypes.guess_type(full)
    with open(full, "rb") as f:
        body = f.read()
    start_response("200 OK", [
        ("Content-Type", ctype or "application/octet-stream"),
        ("Content-Length", str(len(body))),
    ])
    return [body]


def application(environ, start_response):
    """WSGI entry-point — compatible con gunicorn, uWSGI, etc."""
    method = environ.get("REQUEST_METHOD", "GET")
    path = environ.get("PATH_INFO", "/")
    qs = urllib.parse.parse_qs(environ.get("QUERY_STRING", ""))

    # ---- API routes (GET) -------------------------------------------
    if method == "GET" and path.startswith("/api/news"):
        topic = qs.get("topic", [""])[0]
        search_matrix = {
            "alertas": 'derrame petróleo golfo de méxico "coatzacoalcos" OR "cantarell" OR "tabasco" 2026',
            "global": 'oil spill gulf of mexico 2026 Coatzacoalcos OR Cantarell Reuters OR AP OR "Al Jazeera" OR Mongabay',
            "fauna": 'derrame petróleo "tortuga" OR "manatí" OR "fauna muerta" OR "ecocidio" golfo de méxico 2026',
            "bolsa": 'oil stocks "PEMEX" OR "Pemex" gulf mexico spill 2026 environmental damage',
            "observatorio": 'pescadores golfo mexico derrame manchas costa afectados comunidad 2026',
            "ciudadano": 'derrame golfo mexico mapa ciudadano comunidades reportes pescadores "corredor arrecifal"',
        }
        if topic == "sismos":
            news = _engine.get_ssn_sismos() + _engine.get_usgs_earthquakes()
        elif topic == "noaa_alerts":
            news = _engine.get_noaa_weather()
        elif topic == "trends_mx":
            news = _engine.get_google_trends("MX")
        elif topic == "trends_us":
            news = _engine.get_google_trends("US-TX") + _engine.get_google_trends("US-LA")
        else:
            real_query = search_matrix.get(topic, "derrame petroleo golfo de mexico")
            news = _engine.get_google_news_rss(real_query)

        def _news_priority(n):
            combined = (n.get("title", "") + n.get("link", "")).lower()
            score = 0
            # Tier 1: Fuentes internacionales independientes (más confiables)
            intl = ["aljazeera", "reuters", "apnews", "abc", "mongabay", "bbc",
                     "theguardian", "nytimes", "washingtonpost", "france24"]
            if any(k in combined for k in intl):
                score += 300
            # Tier 2: ONGs y ciencia independiente
            ngo = ["greenpeace", "oceana", "skytruth", "cerulean", "wwf",
                    "verificado", "animal politico", "aristegui"]
            if any(k in combined for k in ngo):
                score += 250
            # Tier 3: Comunidades, pescadores, afectados
            community = ["pescador", "comunidad", "afectado", "playa",
                         "litoral", "costa", "ribereñ"]
            if any(k in combined for k in community):
                score += 200
            # Tier 4: Ciencia/técnico (NASA, NOAA, USGS, UNAM)
            science = ["nasa", "noaa", "usgs", "unam", "conacyt", "cicese"]
            if any(k in combined for k in science):
                score += 150
            # Tier 5: Fuentes oficiales mexicanas (menor confiabilidad editorial)
            mx_official = ["semarnat", "asea", "pemex", "profepa", ".gob.mx"]
            if any(k in combined for k in mx_official):
                score += 50
            return score
        news.sort(key=_news_priority, reverse=True)
        return _json_response(start_response, news)

    if method == "GET" and path.startswith("/api/model"):
        start_lat = _engine._safe_float(qs.get("start_lat", [None])[0])
        start_lon = _engine._safe_float(qs.get("start_lon", [None])[0])
        target_lat = _engine._safe_float(qs.get("target_lat", [None])[0])
        target_lon = _engine._safe_float(qs.get("target_lon", [None])[0])
        target_name = (qs.get("target_name", [None])[0] or "").strip()
        start_override = {"lat": start_lat, "lon": start_lon} if start_lat is not None and start_lon is not None else None
        target_override = {"lat": target_lat, "lon": target_lon, "name": target_name or "TGT"} if target_lat is not None and target_lon is not None else None
        data = _engine.get_simple_trajectory(start_override=start_override, target_override=target_override)
        return _json_response(start_response, data)

    if method == "GET" and path.startswith("/api/meteo"):
        return _json_response(start_response, _engine.get_open_meteo_wind())

    if method == "GET" and path.startswith("/api/map-config"):
        return _json_response(start_response, _engine.get_map_config())

    if method == "GET" and path.startswith("/api/sar-history"):
        return _json_response(start_response, _engine.get_cerulean_all_detections())

    if method == "GET" and path.startswith("/api/sar-sentinelhub"):
        lat = _engine._safe_float(qs.get("lat", [None])[0]) or 18.25
        lon = _engine._safe_float(qs.get("lon", [None])[0]) or -94.35
        return _json_response(start_response, _engine.get_sentinelhub_sar_status(lat, lon, radius_km=75, hours=72))

    # ---- API routes (POST) ------------------------------------------
    if method == "POST" and path.startswith("/api/sentinelhub/credentials"):
        try:
            length = int(environ.get("CONTENT_LENGTH", 0))
        except (ValueError, TypeError):
            length = 0
        body = environ["wsgi.input"].read(length) if length > 0 else b"{}"
        try:
            data = json.loads(body.decode("utf-8") or "{}")
        except Exception:
            data = {}
        client_id = (data.get("client_id") or "").strip()
        client_secret = (data.get("client_secret") or "").strip()
        if not client_id or not client_secret:
            _SH_CREDENTIALS["client_id"] = None
            _SH_CREDENTIALS["client_secret"] = None
            _SH_CREDENTIALS["set_at_utc"] = None
            return _json_response(start_response, {"ok": False, "reason": "Faltan credenciales (client_id/client_secret)"})
        _SH_CREDENTIALS["client_id"] = client_id
        _SH_CREDENTIALS["client_secret"] = client_secret
        _SH_CREDENTIALS["set_at_utc"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        return _json_response(start_response, {"ok": True, "set_at_utc": _SH_CREDENTIALS["set_at_utc"]})

    # ---- Static files -----------------------------------------------
    if method == "GET":
        return _serve_static(start_response, path)

    return _json_response(start_response, {"error": "not_found"}, status="404 Not Found")


# ===================================================================
#  Dev server (python server.py)  —  en producción usar gunicorn
# ===================================================================

def run():
    port = int(os.environ.get("PORT", "8081"))
    log.info("=" * 60)
    log.info("GULF SENTINEL — INICIADO EN PUERTO %d", port)
    log.info("Dashboard: http://localhost:%d", port)
    log.info("Fuentes: NASA GIBS | SSN UNAM | NOAA NHC | USGS | Open-Meteo")
    log.info("SSL inseguro permitido: %s", _ALLOW_INSECURE_SSL)
    log.info("Producción: gunicorn server:application -b 0.0.0.0:%d", port)
    log.info("=" * 60)
    httpd = make_server("", port, application)
    httpd.serve_forever()


if __name__ == "__main__":
    run()
