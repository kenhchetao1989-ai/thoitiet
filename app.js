const DATA_URL = new URL("data/weather.json", document.baseURI);
const locationSelect = document.querySelector("#location-select");
const weatherCard = document.querySelector("#weather-card");
const updatedAt = document.querySelector("#updated-at");
const dataNotice = document.querySelector("#data-notice");
const refreshButton = document.querySelector("#refresh-button");

const descriptions = {
  0: ["Trời quang", "☀"], 1: ["Trời gần quang", "🌤"], 2: ["Có mây", "⛅"], 3: ["Nhiều mây", "☁"],
  45: ["Sương mù", "🌫"], 48: ["Sương mù đóng băng", "🌫"], 51: ["Mưa nhỏ", "🌦"], 53: ["Mưa nhỏ vừa", "🌦"],
  55: ["Mưa vừa", "🌧"], 56: ["Mưa lạnh", "🌧"], 57: ["Mưa lạnh nặng", "🌧"], 61: ["Mưa nhẹ", "🌧"],
  63: ["Mưa trung bình", "🌧"], 65: ["Mưa lớn", "🌧"], 66: ["Mưa lạnh", "🌧"], 67: ["Mưa đá", "🌧"],
  71: ["Tuyết rơi nhẹ", "❄"], 73: ["Tuyết rơi vừa", "❄"], 75: ["Tuyết rơi nhiều", "❄"], 77: ["Mưa đá", "❄"],
  80: ["Mưa rào", "🌦"], 81: ["Mưa rào mạnh", "🌧"], 82: ["Mưa rào rất mạnh", "⛈"],
  85: ["Tuyết rơi", "❄"], 86: ["Tuyết rơi nặng", "❄"], 95: ["Dông", "⛈"], 96: ["Dông kèm mưa đá", "⛈"], 99: ["Dông kèm mưa đá", "⛈"]
};

let data = null;

function dateText(value) {
  if (!value) return "Chưa có dữ liệu";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có dữ liệu";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function formatNumber(value, suffix = "", digits = 0) {
  return isNumber(value) ? `${value.toFixed(digits)}${suffix}` : "—";
}

function renderWeather() {
  if (!weatherCard) return;
  const records = Array.isArray(data?.weather) ? data.weather : [];
  const record = records.find((item) => item.id === locationSelect?.value) || records[0];

  if (!record) {
    weatherCard.innerHTML = '<div class="empty-state">Chưa có dữ liệu thời tiết cho điểm theo dõi.</div>';
    return;
  }

  const current = record.current || {};
  const daily = record.daily || {};
  const [summary, icon] = descriptions[current.weather_code] || ["Không xác định", "—"];
  weatherCard.innerHTML = `
    <div class="weather-main">
      <div>
        <div class="weather-place"></div>
        <p class="weather-summary"><span class="weather-icon" aria-hidden="true"></span><span class="weather-description"></span></p>
      </div>
      <div class="temperature">${formatNumber(current.temperature_c, "°C")}</div>
    </div>
    <div class="weather-details">
      <div><span class="detail-label">Cảm giác như</span><span class="detail-value">${formatNumber(current.apparent_temperature_c, "°C")}</span></div>
      <div><span class="detail-label">Độ ẩm</span><span class="detail-value">${formatNumber(current.relative_humidity_percent, "%")}</span></div>
      <div><span class="detail-label">Gió</span><span class="detail-value">${formatNumber(current.wind_speed_kph, " km/h")}</span></div>
      <div><span class="detail-label">Mưa</span><span class="detail-value">${formatNumber(current.precipitation_mm, " mm", 1)}</span></div>
      <div><span class="detail-label">Cao nhất</span><span class="detail-value">${formatNumber(daily.temperature_max_c, "°C")}</span></div>
      <div><span class="detail-label">Thấp nhất</span><span class="detail-value">${formatNumber(daily.temperature_min_c, "°C")}</span></div>
      <div><span class="detail-label">Xác suất mưa</span><span class="detail-value">${formatNumber(daily.precipitation_probability_max_percent, "%")}</span></div>
      <div><span class="detail-label">Cập nhật</span><span class="detail-value">${dateText(record.fetched_at)}</span></div>
    </div>`;
  weatherCard.querySelector(".weather-place").textContent = record.name || "Điểm theo dõi";
  weatherCard.querySelector(".weather-icon").textContent = icon;
  weatherCard.querySelector(".weather-description").textContent = summary;
}

function renderBulletins(containerId, records, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.replaceChildren();
  const items = Array.isArray(records) ? records : [];

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    // Empty data does not mean there are no storms: this repository has not yet
    // connected an authorized, reliable storm/advisory feed.
    empty.textContent = type === "storm"
      ? "Chưa tích hợp nguồn dữ liệu bão; vui lòng theo dõi bản tin từ cơ quan khí tượng."
      : "Chưa tích hợp nguồn cảnh báo; vui lòng theo dõi thông báo từ cơ quan chức năng.";
    container.appendChild(empty);
    return;
  }

  for (const item of items) {
    const wrapper = document.createElement("div");
    wrapper.className = "bulletin-item";
    const title = document.createElement("strong");
    title.textContent = item.title || item.name || "Thông tin";
    wrapper.appendChild(title);

    const message = item.summary || item.message || item.description;
    if (message) {
      const paragraph = document.createElement("p");
      paragraph.textContent = message;
      wrapper.appendChild(paragraph);
    }

    if (item.url) {
      const link = document.createElement("a");
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Xem nguồn tin";
      wrapper.appendChild(link);
    }
    container.appendChild(wrapper);
  }
}

function populateLocationSelect() {
  if (!locationSelect) return;
  const locations = Array.isArray(data?.locations) && data.locations.length
    ? data.locations
    : (Array.isArray(data?.weather) ? data.weather : []);
  const previousValue = locationSelect.value;
  locationSelect.replaceChildren();

  for (const location of locations) {
    const option = document.createElement("option");
    option.value = location.id;
    option.textContent = location.name || location.id;
    locationSelect.appendChild(option);
  }

  if (locations.some((location) => location.id === previousValue)) {
    locationSelect.value = previousValue;
  }
}

function updateDataNotice() {
  if (!dataNotice) return;
  const errors = Array.isArray(data?.errors) ? data.errors : [];
  if (errors.length) {
    dataNotice.textContent = errors[0];
  } else if (data?.status === "ok") {
    dataNotice.textContent = "Dữ liệu thời tiết tham khảo đã được cập nhật.";
  } else if (data?.status === "degraded") {
    dataNotice.textContent = "Một số điểm đang hiển thị dữ liệu cũ do chưa cập nhật được.";
  } else {
    dataNotice.textContent = "Hiện chưa có dữ liệu thời tiết khả dụng.";
  }
}

async function loadData() {
  if (refreshButton) refreshButton.disabled = true;
  if (weatherCard) weatherCard.innerHTML = '<div class="loading-state">Đang đọc dữ liệu thời tiết…</div>';

  try {
    const response = await fetch(`${DATA_URL.href}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Tải weather.json thất bại: HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || typeof payload !== "object") throw new Error("weather.json không đúng định dạng");
    data = payload;
    populateLocationSelect();
    renderWeather();
    updateDataNotice();
    if (updatedAt) {
      updatedAt.textContent = data.generated_at ? `Cập nhật: ${dateText(data.generated_at)}` : "Cập nhật: Chưa có dữ liệu";
    }
    // IDs must match index.html: storms-list and warnings-list (plural).
    renderBulletins("storms-list", data.storms, "storm");
    renderBulletins("warnings-list", data.warnings, "warning");
  } catch (error) {
    console.error("Không tải được dữ liệu thời tiết:", error);
    if (weatherCard) weatherCard.innerHTML = '<div class="error-state">Không thể tải dữ liệu thời tiết. Vui lòng thử lại sau.</div>';
    if (updatedAt) updatedAt.textContent = "Cập nhật: Chưa có dữ liệu";
    if (dataNotice) dataNotice.textContent = "Lỗi tải dữ liệu. Kiểm tra kết nối hoặc thử tải lại.";
    renderBulletins("storms-list", [], "storm");
    renderBulletins("warnings-list", [], "warning");
  } finally {
    if (refreshButton) refreshButton.disabled = false;
  }
}

locationSelect?.addEventListener("change", renderWeather);
refreshButton?.addEventListener("click", loadData);
loadData();
