#!/usr/bin/env python3
"""Fetch, validate and normalize public forecast data into static JSON."""
from __future__ import annotations
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "weather.json"
API_URL = "https://api.open-meteo.com/v1/forecast"
SOURCE_NAME = "Open-Meteo (tham khảo, không phải nguồn chính thức Việt Nam)"
LOCATIONS = [
    {"id":"ha-noi","name":"Hà Nội","latitude":21.0285,"longitude":105.8542},
    {"id":"tp-ho-chi-minh","name":"TP. Hồ Chí Minh","latitude":10.8231,"longitude":106.6297},
    {"id":"da-nang","name":"Đà Nẵng","latitude":16.0544,"longitude":108.2022},
    {"id":"hai-phong","name":"Hải Phòng","latitude":20.8449,"longitude":106.6881},
    {"id":"can-tho","name":"Cần Thơ","latitude":10.0452,"longitude":105.7469},
    {"id":"hue","name":"Huế","latitude":16.4637,"longitude":107.5909},
    {"id":"lao-cai","name":"Lào Cai","latitude":22.4809,"longitude":103.9755},
    {"id":"nghe-an","name":"Nghệ An","latitude":18.6796,"longitude":105.6813},
    {"id":"khanh-hoa","name":"Khánh Hòa","latitude":12.2388,"longitude":109.1967},
    {"id":"an-giang","name":"An Giang","latitude":10.5216,"longitude":105.1259},
]

def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

def read_existing():
    try:
        value = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}

def request_forecasts():
    query = urlencode({
        "latitude": ",".join(str(item["latitude"]) for item in LOCATIONS),
        "longitude": ",".join(str(item["longitude"]) for item in LOCATIONS),
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "forecast_days": "1", "timezone": "Asia/Ho_Chi_Minh",
    })
    request = Request(f"{API_URL}?{query}", headers={"User-Agent":"thoitiet-vietnam-static-mvp/1.0","Accept":"application/json"})
    with urlopen(request, timeout=25) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if isinstance(payload, dict): payload = [payload]
    if not isinstance(payload, list) or len(payload) != len(LOCATIONS):
        raise ValueError("Phản hồi API không có đủ các điểm theo dõi")
    return payload

def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None

def first_number(daily, field):
    values = daily.get(field)
    return number(values[0]) if isinstance(values, list) and values else None

def normalize(location, forecast, fetched_at):
    if not isinstance(forecast, dict): raise ValueError("phản hồi điểm không hợp lệ")
    current, daily = forecast.get("current") or {}, forecast.get("daily") or {}
    if not isinstance(current, dict) or not isinstance(daily, dict): raise ValueError("thiếu current hoặc daily")
    temperature = number(current.get("temperature_2m"))
    if temperature is None: raise ValueError("thiếu nhiệt độ hợp lệ")
    return {**location,"source_name":SOURCE_NAME,"source_url":"https://open-meteo.com/","fetched_at":fetched_at,"published_at":current.get("time"),"stale":False,
        "current":{"temperature_c":temperature,"relative_humidity_percent":number(current.get("relative_humidity_2m")),"apparent_temperature_c":number(current.get("apparent_temperature")),"precipitation_mm":number(current.get("precipitation")),"weather_code":number(current.get("weather_code")),"wind_speed_kmh":number(current.get("wind_speed_10m")),"wind_direction_degrees":number(current.get("wind_direction_10m"))},
        "daily":{"temperature_max_c":first_number(daily,"temperature_2m_max"),"temperature_min_c":first_number(daily,"temperature_2m_min"),"precipitation_probability_max_percent":first_number(daily,"precipitation_probability_max")}}

def main():
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing = read_existing()
    old_weather = existing.get("weather", [])
    previous = {item.get("id"):item for item in old_weather if isinstance(item,dict) and isinstance(item.get("id"),str)} if isinstance(old_weather,list) else {}
    attempted_at, errors = now_iso(), []
    try: forecasts = request_forecasts()
    except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError, OSError) as exc:
        forecasts = []
        errors.append(f"Không lấy được dữ liệu thời tiết: {exc}")
    records = []
    if forecasts:
        for location, forecast in zip(LOCATIONS, forecasts):
            try: records.append(normalize(location, forecast, attempted_at))
            except (AttributeError, TypeError, ValueError) as exc:
                old = previous.get(location["id"])
                if old:
                    old["stale"] = True
                    records.append(old)
                errors.append(f"Dữ liệu của {location['name']} không hợp lệ: {exc}")
    else:
        for location in LOCATIONS:
            old = previous.get(location["id"])
            if old:
                old["stale"] = True
                records.append(old)
    successes = sum(not item.get("stale", False) for item in records)
    status = "ok" if successes == len(LOCATIONS) else "degraded" if successes else "unavailable"
    payload = {"schema_version":1,"generated_at":attempted_at,"last_attempt_at":attempted_at,"last_success_at":attempted_at if successes else existing.get("last_success_at"),"status":status,
        "provider":{"name":SOURCE_NAME,"url":"https://open-meteo.com/","official_vietnamese_source":False,"attribution":"Weather data by Open-Meteo.com"},
        "locations":LOCATIONS,"weather":records,"storms":existing.get("storms",[]),"warnings":existing.get("warnings",[]),"errors":errors}
    DATA_PATH.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Đã ghi {len(records)} điểm thời tiết; status={status}")
    if errors: print("\n".join(errors),file=sys.stderr)
    return 0

if __name__ == "__main__": raise SystemExit(main())
