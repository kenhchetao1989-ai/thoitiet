#!/usr/bin/env python3
"""Fetch, validate and normalize public forecast data into static JSON."""
from __future__ import annotations

import json
import random
import ssl
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "weather.json"
API_URL = "https://api.open-meteo.com/v1/forecast"
SOURCE_NAME = "Open-Meteo (tham khảo, không phải nguồn chính thức Việt Nam)"
LOCATIONS = [
    {"id": "ha-noi", "name": "Hà Nội", "latitude": 21.0285, "longitude": 105.8542},
    {"id": "da-nang", "name": "Đà Nẵng", "latitude": 16.0544, "longitude": 108.2022},
    {"id": "tp-ho-chi-minh", "name": "TP. Hồ Chí Minh", "latitude": 10.8231, "longitude": 106.6297},
]
MAX_ATTEMPTS = 4
TIMEOUT_SECONDS = 20
BULLETIN_RETENTION = timedelta(hours=24)


def now_utc():
    return datetime.now(timezone.utc)


def now_iso():
    return now_utc().isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_datetime(value):
    """Parse an ISO-8601 timestamp; return None for missing or invalid values."""
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def read_existing():
    try:
        value = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def retain_bulletins(new_items, old_items, fallback_timestamp, now):
    """Merge bulletins and retain the last known reports for at most 24 hours.

    `first_seen_at` is deliberately preserved, so repeated workflow runs without
    a new report cannot keep extending an old bulletin's lifetime.
    """
    fallback_time = parse_datetime(fallback_timestamp)
    now_text = now.isoformat(timespec="seconds").replace("+00:00", "Z")
    merged = {}

    def add(item, is_new):
        if not isinstance(item, dict):
            return
        record = dict(item)
        first_seen = (
            parse_datetime(record.get("first_seen_at"))
            or parse_datetime(record.get("published_at"))
            or parse_datetime(record.get("issued_at"))
            or parse_datetime(record.get("updated_at"))
            or fallback_time
        )
        if first_seen is None:
            # Timestamp legacy records once using the previous dataset generation
            # time. If that is unavailable, do not claim the report is recent.
            return
        age = now - first_seen
        if age > BULLETIN_RETENTION or age < -timedelta(minutes=5):
            return

        record["first_seen_at"] = first_seen.isoformat(timespec="seconds").replace("+00:00", "Z")
        record["stale"] = not is_new
        if is_new and not record.get("updated_at"):
            record["updated_at"] = now_text

        # Prefer an explicit provider ID; otherwise deduplicate by title/name.
        key = str(record.get("id") or record.get("title") or record.get("name") or record.get("url") or "").strip()
        if not key:
            key = record["first_seen_at"]
        previous = merged.get(key)
        if previous is None or is_new:
            merged[key] = record

    for old in old_items if isinstance(old_items, list) else []:
        add(old, is_new=False)
    for item in new_items if isinstance(new_items, list) else []:
        add(item, is_new=True)

    return sorted(
        merged.values(),
        key=lambda item: parse_datetime(item.get("first_seen_at")) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )


def request_forecast(location):
    """Fetch one city at a time; retry transient TLS/network/API failures."""
    query = urlencode({
        "latitude": location["latitude"],
        "longitude": location["longitude"],
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "forecast_days": "1",
        "timezone": "Asia/Ho_Chi_Minh",
    })
    url = f"{API_URL}?{query}"
    last_error = None

    for attempt in range(1, MAX_ATTEMPTS + 1):
        request = Request(url, headers={
            "User-Agent": "thoitiet-vietnam-static-mvp/1.2",
            "Accept": "application/json",
            "Connection": "close",
        })
        try:
            with urlopen(request, timeout=TIMEOUT_SECONDS, context=ssl.create_default_context()) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Phản hồi API không phải JSON object")
            return payload
        except HTTPError as exc:
            last_error = exc
            if exc.code != 429 and not 500 <= exc.code < 600:
                raise
        except (URLError, TimeoutError, OSError, ssl.SSLError, json.JSONDecodeError, ValueError) as exc:
            last_error = exc

        if attempt < MAX_ATTEMPTS:
            delay = min(2 ** attempt, 12) + random.uniform(0, 0.5)
            print(
                f"{location['name']}: lần thử {attempt}/{MAX_ATTEMPTS} thất bại ({last_error}); "
                f"thử lại sau {delay:.1f}s",
                file=sys.stderr,
                flush=True,
            )
            time.sleep(delay)

    raise RuntimeError(f"sau {MAX_ATTEMPTS} lần thử vẫn thất bại: {last_error}") from last_error


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def first_number(daily, field):
    values = daily.get(field)
    return number(values[0]) if isinstance(values, list) and values else None


def normalize(location, forecast, fetched_at):
    if not isinstance(forecast, dict):
        raise ValueError("phản hồi điểm không hợp lệ")
    current, daily = forecast.get("current") or {}, forecast.get("daily") or {}
    if not isinstance(current, dict) or not isinstance(daily, dict):
        raise ValueError("thiếu current hoặc daily")
    temperature = number(current.get("temperature_2m"))
    if temperature is None:
        raise ValueError("thiếu nhiệt độ hợp lệ")
    return {
        **location,
        "source_name": SOURCE_NAME,
        "source_url": "https://open-meteo.com/",
        "fetched_at": fetched_at,
        "published_at": current.get("time"),
        "stale": False,
        "current": {
            "temperature_c": temperature,
            "relative_humidity_percent": number(current.get("relative_humidity_2m")),
            "apparent_temperature_c": number(current.get("apparent_temperature")),
            "precipitation_mm": number(current.get("precipitation")),
            "weather_code": number(current.get("weather_code")),
            "wind_speed_kph": number(current.get("wind_speed_10m")),
            "wind_direction_deg": number(current.get("wind_direction_10m")),
        },
        "daily": {
            "temperature_max_c": first_number(daily, "temperature_2m_max"),
            "temperature_min_c": first_number(daily, "temperature_2m_min"),
            "precipitation_probability_max_percent": first_number(daily, "precipitation_probability_max"),
        },
    }


def main():
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing = read_existing()
    old_weather = existing.get("weather", [])
    previous_weather = {
        item.get("id"): item
        for item in old_weather
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    } if isinstance(old_weather, list) else {}

    attempted_at = now_iso()
    current_time = now_utc()
    errors = []
    records = []
    fresh_count = 0

    for location in LOCATIONS:
        try:
            forecast = request_forecast(location)
            records.append(normalize(location, forecast, attempted_at))
            fresh_count += 1
        except (HTTPError, URLError, TimeoutError, RuntimeError, ValueError, OSError, ssl.SSLError) as exc:
            old = previous_weather.get(location["id"])
            if old:
                old["stale"] = True
                records.append(old)
            errors.append(f"Không lấy được dữ liệu cho {location['name']}: {exc}")

    # Storm/advisory feed adapter is not connected yet. Keep previous reports
    # visible for 24 hours, then remove them. New feed results can be passed as
    # new_storms/new_warnings without changing the retention logic.
    storms = retain_bulletins(
        new_items=[],
        old_items=existing.get("storms", []),
        fallback_timestamp=existing.get("generated_at"),
        now=current_time,
    )
    warnings = retain_bulletins(
        new_items=[],
        old_items=existing.get("warnings", []),
        fallback_timestamp=existing.get("generated_at"),
        now=current_time,
    )

    successes = sum(not item.get("stale", False) for item in records)
    status = "ok" if successes == len(LOCATIONS) else "degraded" if successes else "unavailable"
    payload = {
        "schema_version": 1,
        "generated_at": attempted_at,
        "last_attempt_at": attempted_at,
        "last_success_at": attempted_at if fresh_count else existing.get("last_success_at"),
        "status": status,
        "provider": {
            "name": SOURCE_NAME,
            "url": "https://open-meteo.com/",
            "official_vietnamese_source": False,
            "attribution": "Weather data by Open-Meteo.com",
        },
        "locations": LOCATIONS,
        "weather": records,
        "storms": storms,
        "warnings": warnings,
        "errors": errors,
    }

    # Write even if the weather provider is temporarily unavailable so expired
    # storm/advisory items are pruned and stale weather remains marked as stale.
    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Đã ghi {successes}/{len(LOCATIONS)} điểm thời tiết mới; "
        f"giữ {len(storms)} tin bão và {len(warnings)} cảnh báo còn trong 24 giờ; status={status}"
    )
    if errors:
        print("\n".join(errors), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
