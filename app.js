const DATA_URL = new URL("data/weather.json", document.baseURI);
const locationSelect = document.querySelector("#location-select");
const weatherCard = document.querySelector("#weather-card");
const updatedAt = document.querySelector("#updated-at");
const dataNotice = document.querySelector("#data-notice");
const refreshButton = document.querySelector("#refresh-button");

const descriptions = {
  0: ["Trời quang", "☀"],
  1: ["Trời gần quang", "🌤"],
  2: ["Có mây", "⛅"],
  3: ["Nhiều mây", "☁"],
  45: ["Sương mù", "🌫"],
  48: ["Sương mù đóng băng", "🌫"],
  51: ["Mưa nhỏ", "🌦"],
  53: ["Mưa nhỏ vừa", "🌦"],
  55: ["Mưa vừa", "🌧"],
  56: ["Mưa lạnh", "🌧"],
  57: ["Mưa lạnh nặng", "🌧"],
  61: ["Mưa nhẹ", "🌧"],
  63: ["Mưa trung bình", "🌧"],
  65: ["Mưa lớn", "🌧"],
  66: ["Mưa lạnh", "🌧"],
  67: ["Mưa đá", "🌧"],
  71: ["Tuyết rơi nhẹ", "❄"],
  73: ["Tuyết rơi vừa", "❄"],
  75: ["Tuyết rơi nhiều", "❄"],
  77: ["Mưa đá", "❄"],
  80: ["Mưa rào", "🌦"],
  81: ["Mưa rào mạnh", "🌧"],
  82: ["Mưa rào rất mạnh", "⛈"],
  85: ["Tuyết rơi", "❄"],
  86: ["Tuyết rơi nặng", "❄"],
  95: ["Dông", "⛈"],
  96: ["Dông kèm mưa đá", "⛈"],
  99: ["Dông kèm mưa đá", "⛈"]
};

let data = null;

function dateText(value) {
  if (!value) return "Chưa có dữ liệu";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có dữ liệu";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function weatherSummary(code) {
  const entry = descriptions[code] || ["Không xác định", "—"];
  return `${entry[1]} ${entry[0]}`;
}

function emptyState(message) {
  weatherCard.innerHTML = `<div class="empty-state">${message}</div>`;
}

function renderWeather() {
  if (!data) {
    emptyState("Đang tải dữ liệu...");
    return;
  }

  const selectedId = locationSelect?.value || "";
  const list = Array.isArray(data.weather) ? data.weather : [];
  const record = list.find((item) => item.id === selectedId) || list[0] || null;

  if (!record) {
    emptyState("Chưa có dữ liệu cho điểm theo dõi.");
    return;
  }

  const current = record.current || {};
  const daily = record.daily || {};
  const temp = isNumber(current.temperature_c) ? `${Math.round(current.temperature_c)}°C` : "—";
  const feelsLike = isNumber(current.apparent_temperature_c) ? `${Math.round(current.apparent_temperature_c)}°C` : "—";
  const humidity = isNumber(current.relative_humidity_percent) ? `${Math.round(current.relative_humidity_percent)}%` : "—";
  const wind = isNumber(current.wind_speed_kph) ? `${Math.round(current.wind_speed_kph)} km/h` : "—";
  const rain = isNumber(current.precipitation_mm) ? `${current.precipitation_mm.toFixed(1)} mm` : "—";
  const maxTemp = isNumber(daily.temperature_max_c) ? `${Math.round(daily.temperature_max_c)}°C` : "—";
  const minTemp = isNumber(daily.temperature_min_c) ? `${Math.round(daily.temperature_min_c)}°C` : "—";
  const precipProb = isNumber(daily.precipitation_probability_max_percent) ? `${Math.round(daily.precipitation_probability_max_percent)}%` : "—";

  const code = Number(current.weather_code ?? 0);
  const summary = weatherSummary(code);

  weatherCard.innerHTML = `
    <div class="weather-main">
      <div>
        <div class="weather-place">${record.name || "Điểm theo dõi"}</div>
        <div class="weather-summary">${summary}</div>
      </div>
      <div class="temperature">${temp}</div>
    </div>
    <div class="weather-details">
      <div>
        <span class="detail-label">Cảm giác như</span>
        <span class="detail-value">${feelsLike}</span>
      </div>
      <div>
        <span class="detail-label">Độ ẩm</span>
        <span class="detail-value">${humidity}</span>
      </div>
      <div>
        <span class="detail-label">Gió</span>
        <span class="detail-value">${wind}</span>
      </div>
      <div>
        <span class="detail-label">Mưa</span>
        <span class="detail-value">${rain}</span>
      </div>
      <div>
        <span class="detail-label">Cao nhất</span>
        <span class="detail-value">${maxTemp}</span>
      </div>
      <div>
        <span class="detail-label">Thấp nhất</span>
        <span class="detail-value">${minTemp}</span>
      </div>
      <div>
        <span class="detail-label">Xác suất mưa</span>
        <span class="detail-value">${precipProb}</span>
      </div>
      <div>
        <span class="detail-label">Cập nhật</span>
        <span class="detail-value">${dateText(record.fetched_at)}</span>
      </div>
    </div>
  `;
}

function renderBulletins(id, records, type) {
  const container = document.getElementById(id);
  if (!container) return;

  container.replaceChildren();
  const items = Array.isArray(records) ? records : [];

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = type === "storm" ? "Chưa có thông tin bão hoặc áp thấp." : "Chưa có cảnh báo thiên tai.";
    container.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const wrapper = document.createElement("div");
    wrapper.className = "bulletin-item";

    const title = document.createElement("strong");
    title.textContent = item.title || item.name || "Thông tin";

    const detail = document.createElement("div");
    detail.className = "bulletin-content";

    if (item.summary) {
      detail.innerHTML = `<p>${item.summary}</p>`;
    } else if (item.message) {
      detail.innerHTML = `<p>${item.message}</p>`;
    } else if (item.description) {
      detail.innerHTML = `<p>${item.description}</p>`;
    } else {
      detail.innerHTML = "<p>Không có mô tả.</p>";
    }

    wrapper.appendChild(title);
    wrapper.appendChild(detail);
    container.appendChild(wrapper);
  });
}

function populateLocationSelect() {
  const locations = Array.isArray(data?.locations) && data.locations.length > 0
    ? data.locations
    : (Array.isArray(data?.weather) ? data.weather : []);

  if (!locationSelect) return;

  if (!locations.length) {
    locationSelect.innerHTML = '<option value="">Không có dữ liệu</option>';
    return;
  }

  locationSelect.innerHTML = locations
    .map((item) => `<option value="${item.id}">${item.name}</option>`)
    .join("");

  if (locations[0]?.id) {
    locationSelect.value = locations[0].id;
  }
}

function updateDataNotice() {
  if (!dataNotice) return;

  const errors = Array.isArray(data?.errors) ? data.errors : [];
  const status = data?.status || "unavailable";

  if (errors.length) {
    dataNotice.textContent = errors[0];
    return;
  }

  if (status === "ok") {
    dataNotice.textContent = "Dữ liệu đang được cập nhật theo thời gian thực từ nguồn tham khảo.";
    return;
  }

  if (status === "degraded") {
    dataNotice.textContent = "Dữ liệu đã có, nhưng có một số điểm đang bị cập nhật lại.";
    return;
  }

  dataNotice.textContent = "Hiện chưa có dữ liệu thời tiết khả dụng.";
}

async function loadData() {
  if (!refreshButton) return;

  refreshButton.disabled = true;
  emptyState("Đang đọc dữ liệu thời tiết…");

  try {
    const response = await fetch(`${DATA_URL.href}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    data = await response.json();
    populateLocationSelect();
    renderWeather();
    updateDataNotice();

    if (updatedAt) {
      updatedAt.textContent = data?.generated_at ? `Cập nhật: ${dateText(data.generated_at)}` : "Cập nhật: Chưa có dữ liệu";
    }

    renderBulletins("storm-list", data?.storms, "storm");
    renderBulletins("warning-list", data?.warnings, "warning");
  } catch (error) {
    console.error(error);
    data = null;
    emptyState("Không thể tải dữ liệu thời tiết. Vui lòng thử lại sau.");
    if (updatedAt) updatedAt.textContent = "Cập nhật: Chưa có dữ liệu";
    if (dataNotice) dataNotice.textContent = "Lỗi kết nối hoặc dữ liệu không có sẵn.";
  } finally {
    refreshButton.disabled = false;
  }
}

if (locationSelect) {
  locationSelect.addEventListener("change", renderWeather);
}

if (refreshButton) {
  refreshButton.addEventListener("click", loadData);
}

loadData();
