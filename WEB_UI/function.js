const database = firebase.database();

// ==========================================
// CẤU HÌNH & BIẾN TOÀN CỤC
// ==========================================
// CHÚ Ý: Hãy thay API Key mới của bạn vào đây
const GEMINI_API_KEY = "AIzaSyCRlE0C2_A9a78cy8eOLo6kYHqRAix2vJ8"; 

const TEMP_HIGH = 30;
const TEMP_LOW  = 20;
const HUM_LOW   = 45;
const GAS_THRESHOLD = 1600;

const ROOM_CONFIG = {
    phong_ngu: {
        name: 'Phòng Ngủ',
        fan: {
            path: 'thietbi1', key: 'tv', label: 'Television', type: 'toggle',
            imgOn: 'image/television_on.png', imgOff: 'image/television_off.png'
        },
        secondary: {
            path: 'thietbi2', key: 'den', label: 'Đèn',
            imgOn: 'image/light_on.png', imgOff: 'image/light_off.png'
        },
        ac: { path: 'thietbi3', key: 'dieuHoa', label: 'Điều Hòa' }
    },
    phong_khach: {
        name: 'Phòng Khách',
        fan: {
            path: 'thietbi1', key: 'quat', label: 'Quạt', type: 'btn2',
            imgOn: 'image/fan_on.png', imgOff: 'image/fan_off.png'
        },
        secondary: {
            path: 'thietbi2', key: 'losuoi', label: 'Lò sưởi',
            imgOn: 'image/fireplace_on.png', imgOff: 'image/fireplace_off.png'
        },
        ac: { path: 'thietbi3', key: 'dieuHoa', label: 'Điều Hòa' }
    }
};

// SỬA LỖI: Để trống currentRoom để hàm switchRoom chạy được lần đầu tiên
let currentRoom = ''; 
let roomRefs = []; 
let tvState  = 0;  

// DOM Elements
const btnFanOn     = document.getElementById('btn-fan-on');
const btnFanOff    = document.getElementById('btn-fan-off');
const btnGroupFan  = document.getElementById('btn-group-fan');
const btnTVToggle  = document.getElementById('btn-tv-toggle');
const switchLoSuoi = document.getElementById('switch-losuoi');
const sliderAC     = document.getElementById('slider-ac');
const acValueText  = document.getElementById('ac-value');
const switchAuto   = document.getElementById('switch-auto');
const imgFan       = document.getElementById('img-fan');
const imgHeater    = document.getElementById('img-heater');
const imgAC        = document.getElementById('img-ac');

function roomRef(subPath) {
    return database.ref('/' + currentRoom + '/' + subPath);
}

// ==========================================
// CẬP NHẬT GIAO DIỆN (HIỂN THỊ CHÚ THÍCH)
// ==========================================
function updateAutoRulesUI() {
    const rulesContainer = document.querySelector('.auto-rules');
    if (!rulesContainer) return;
    
    if (currentRoom === 'phong_ngu') {
        rulesContainer.innerHTML = `<div class="rule">💧 <${HUM_LOW}% → Bật điều hòa</div>`;
    } else {
        rulesContainer.innerHTML = `
            <div class="rule">🌡️ ≥${TEMP_HIGH}°C → Bật quạt</div>
            <div class="rule">❄️ ≤${TEMP_LOW}°C → Bật lò sưởi</div>
            <div class="rule">💧 <${HUM_LOW}% → Bật điều hòa</div>
        `;
    }
}

function setManualControlsDisabled(disabled) {
    if (currentRoom === 'phong_ngu') {
        sliderAC.disabled = disabled;
        btnTVToggle.disabled = false;
        switchLoSuoi.disabled = false;
        document.getElementById('ac-card').classList.toggle('disabled-card', disabled);
        document.getElementById('fan-card').classList.remove('disabled-card');
        document.getElementById('heater-card').classList.remove('disabled-card');
    } else {
        [btnFanOn, btnFanOff, btnTVToggle, switchLoSuoi, sliderAC].forEach(el => el.disabled = disabled);
        document.querySelectorAll('.control-card:not(.auto-card):not(.room-card)').forEach(c => {
            c.classList.toggle('disabled-card', disabled);
        });
    }
}

// ==========================================
// CHỌN PHÒNG
// ==========================================
function switchRoom(roomKey) {
    // Nếu chọn đúng phòng đang hiển thị thì không làm gì cả
    if (roomKey === currentRoom) return;

    roomRefs.forEach(r => r.off());
    roomRefs = [];

    currentRoom = roomKey;
    const cfg = ROOM_CONFIG[roomKey];

    document.getElementById('btn-room-bedroom').classList.toggle('active', roomKey === 'phong_ngu');
    document.getElementById('btn-room-living').classList.toggle('active',  roomKey === 'phong_khach');

    document.getElementById('label-fan-ctrl').innerText = cfg.fan.label;
    document.getElementById('label-fan-icon').innerText = cfg.fan.label;
    if (cfg.fan.type === 'toggle') {
        btnGroupFan.style.display = 'none';
        btnTVToggle.style.display = 'block';
    } else {
        btnGroupFan.style.display = 'flex';
        btnTVToggle.style.display = 'none';
    }

    document.getElementById('label-secondary-ctrl').innerText = cfg.secondary.label;
    document.getElementById('label-secondary-icon').innerText = cfg.secondary.label;

    updateAutoRulesUI();
    attachRoomListeners();

    roomRef('autoMode').once('value', s => {
        const auto = s.val() || false;
        switchAuto.checked = auto;
        setManualControlsDisabled(auto);
        document.getElementById('auto-badge').style.display = auto ? 'inline-flex' : 'none';
    });
}

// ==========================================
// LOGIC TỰ ĐỘNG & CẢM BIẾN
// ==========================================
switchAuto.onchange = (e) => {
    const auto = e.target.checked;
    roomRef('autoMode').set(auto);
    setManualControlsDisabled(auto);
    document.getElementById('auto-badge').style.display = auto ? 'inline-flex' : 'none';
    if (auto) applyAutoLogic();
};

function applyAutoLogic() {
    const t = parseFloat(document.getElementById('val-nhietdo').innerText);
    const h = parseFloat(document.getElementById('val-doam').innerText);
    if (isNaN(t) || isNaN(h)) return;

    let acLevel = 0;
    if      (h < 25) acLevel = 100;
    else if (h < 35) acLevel = 66;
    else if (h < HUM_LOW) acLevel = 33;

    const cfg = ROOM_CONFIG[currentRoom];

    if (currentRoom === 'phong_ngu') {
        roomRef(cfg.ac.path).set({ dieuHoa: acLevel });
    } else {
        const dev1On   = t >= TEMP_HIGH;
        const secondOn = t <= TEMP_LOW;
        roomRef(cfg.fan.path).set({ [cfg.fan.key]: dev1On ? 1 : 0 });
        roomRef(cfg.secondary.path).set({ [cfg.secondary.key]: secondOn ? 1 : 0 });
        roomRef(cfg.ac.path).set({ dieuHoa: acLevel });
    }
}

// ==========================================
// KHỞI TẠO BIỂU ĐỒ & FIREBASE
// ==========================================
const createChart = (id, label, color, min, max) => {
    return new Chart(document.getElementById(id).getContext('2d'), {
        type: 'line',
        data: { labels: [], datasets: [{ label, data: [], borderColor: color, backgroundColor: color + '22', borderWidth: 2, tension: 0.4, pointRadius: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { y: { suggestedMin: min, suggestedMax: max } } }
    });
};

let tempChart = createChart('tempChart', 'Nhiệt độ (°C)', '#ef4444', 15, 40);
let humChart  = createChart('humChart',  'Độ ẩm (%)',     '#3b82f6', 20, 100);
let gasChart  = createChart('gasChart',  'Khí gas (ADC)', '#f59e0b', 0, 1000);

let historyData = { labels: [], temp: [], hum: [], gas: [] };
let lastValues  = { temp: null, hum: null, gas: null };

function updateCharts(t, h, g) {
    const time = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    historyData.labels.push(time);
    historyData.temp.push(t);
    historyData.hum.push(h);
    historyData.gas.push(g);
    if (historyData.labels.length > 20) {
        ['labels','temp','hum','gas'].forEach(k => historyData[k].shift());
    }
    [tempChart, humChart, gasChart].forEach((chart, i) => {
        const key = ['temp','hum','gas'][i];
        chart.data.labels = historyData.labels;
        chart.data.datasets[0].data = historyData[key];
        chart.update('none');
    });
}

database.ref('/sensors').on('value', snap => {
    const d = snap.val(); if (!d) return;
    const t = d.Nhietdo ?? null; const h = d.Doam ?? null; const g = d.Gas ?? null;

    if (t !== null) document.getElementById('val-nhietdo').innerText = t.toFixed(1);
    if (h !== null) document.getElementById('val-doam').innerText    = h.toFixed(1);
    if (g !== null) {
        document.getElementById('val-gas').innerText = g;
        const alert = g > GAS_THRESHOLD;
        document.getElementById('gas-alert').style.display = alert ? 'flex' : 'none';
        document.getElementById('val-gas').style.color = alert ? '#ef4444' : '';
    }

    if (t !== null && h !== null && g !== null) {
        if (t !== lastValues.temp || h !== lastValues.hum || g !== lastValues.gas) {
            updateCharts(t, h, g);
            lastValues = { temp: t, hum: h, gas: g };
        }
    }
    if (switchAuto.checked) applyAutoLogic();
});

// ==========================================
// ĐIỀU KHIỂN THỦ CÔNG
// ==========================================
function updateTVButton(val) {
    tvState = val;
    btnTVToggle.textContent = val ? '⏻ Bật' : '⏻ Tắt';
    btnTVToggle.className   = val ? 'btn btn-toggle-on' : 'btn btn-toggle-off';
}

function handleTVToggle() {
    const cfg = ROOM_CONFIG[currentRoom].fan;
    roomRef(cfg.path).set({ [cfg.key]: tvState ? 0 : 1 });
}

btnFanOn.onclick = () => roomRef(ROOM_CONFIG[currentRoom].fan.path).set({ [ROOM_CONFIG[currentRoom].fan.key]: 1 });
btnFanOff.onclick = () => roomRef(ROOM_CONFIG[currentRoom].fan.path).set({ [ROOM_CONFIG[currentRoom].fan.key]: 0 });

switchLoSuoi.onchange = (e) => roomRef(ROOM_CONFIG[currentRoom].secondary.path).set({ [ROOM_CONFIG[currentRoom].secondary.key]: e.target.checked ? 1 : 0 });

sliderAC.oninput  = (e) => acValueText.innerText = e.target.value;
sliderAC.onchange = (e) => roomRef(ROOM_CONFIG[currentRoom].ac.path).set({ dieuHoa: parseInt(e.target.value) });

// ==========================================
// LẮNG NGHE THIẾT BỊ
// ==========================================
function attachRoomListeners() {
    const cfg = ROOM_CONFIG[currentRoom];

    const fanRef = roomRef(cfg.fan.path);
    fanRef.on('value', s => {
        const v = s.val()?.[cfg.fan.key] || 0;
        imgFan.src = v ? cfg.fan.imgOn : cfg.fan.imgOff;
        if (cfg.fan.type === 'toggle') updateTVButton(v);
        else {
            btnFanOn.classList.toggle('active-btn', !!v);
            btnFanOff.classList.toggle('active-btn', !v);
        }
    });
    roomRefs.push(fanRef);

    const secRef = roomRef(cfg.secondary.path);
    secRef.on('value', s => {
        const v = s.val()?.[cfg.secondary.key] || 0;
        imgHeater.src = v ? cfg.secondary.imgOn : cfg.secondary.imgOff;
        switchLoSuoi.checked = !!v;
    });
    roomRefs.push(secRef);

    const acRef = roomRef(cfg.ac.path);
    acRef.on('value', s => {
        const v = s.val()?.dieuHoa || 0;
        imgAC.src = v > 0 ? 'image/air-conditioner_on.png' : 'image/air-conditioner_off.png';
        sliderAC.value = v; acValueText.innerText = v;
        const acStatus = document.getElementById('ac-status');
        if (v === 0) { acStatus.innerText = 'Tắt'; acStatus.className = 'ac-status-badge ac-off'; }
        else if (v <= 33) { acStatus.innerText = 'Mức 1'; acStatus.className = 'ac-status-badge ac-on'; }
        else if (v <= 66) { acStatus.innerText = 'Mức 2'; acStatus.className = 'ac-status-badge ac-on'; }
        else { acStatus.innerText = 'Mức 3'; acStatus.className = 'ac-status-badge ac-on'; }
    });
    roomRefs.push(acRef);
}

// ==========================================
// CHATBOT AI
// ==========================================
function toggleChat() { document.getElementById('chatbot-box').classList.toggle('hidden'); }

async function sendMessage() {
    const input = document.getElementById('chat-input-text');
    const btnSend = document.querySelector('.chat-input button');
    const msg = input.value.trim(); if (!msg) return;

    input.disabled = true; btnSend.disabled = true;
    const chat = document.getElementById('chat-content');
    chat.innerHTML += `<div class="msg user">${msg}</div>`;
    input.value = ''; chat.scrollTop = chat.scrollHeight;

    const typingId = "typing-" + Date.now();
    chat.innerHTML += `<div class="msg bot" id="${typingId}">⏳ Đang phân tích...</div>`;

    const cfg = ROOM_CONFIG[currentRoom];
    const t = document.getElementById('val-nhietdo').innerText;
    const h = document.getElementById('val-doam').innerText;
    const g = document.getElementById('val-gas').innerText;
    
    const dev1 = cfg.fan.type === 'toggle' ? (tvState ? 'Bật' : 'Tắt') : (imgFan.src.includes('fan_on') ? 'Bật' : 'Tắt');
    const sec = switchLoSuoi.checked ? 'Bật' : 'Tắt';
    const ac = document.getElementById('ac-status').innerText;

    const sysPrompt = `Bạn là trợ lý AI Smart Home. Phòng: ${cfg.name}. 
Cảm biến: T ${t}°C, H ${h}%, Gas ${g}. 
Thiết bị: ${cfg.fan.label} [${dev1}], ${cfg.secondary.label} [${sec}], Điều hòa [${ac}]. 
Lệnh thực thi: [CMD_FAN_ON], [CMD_FAN_OFF], [CMD_HEATER_ON], [CMD_HEATER_OFF], [CMD_AC_X] (X=0,33,66,100), [CMD_AUTO_ON], [CMD_AUTO_OFF].`;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: sysPrompt + " Người dùng nói: " + msg }] }] })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error?.message || "Lỗi kết nối AI");
        }

        const data = await res.json();
        let reply = data.candidates[0].content.parts[0].text;

        if (reply.includes('[CMD_FAN_ON]'))    roomRef(cfg.fan.path).set({ [cfg.fan.key]: 1 });
        if (reply.includes('[CMD_FAN_OFF]'))   roomRef(cfg.fan.path).set({ [cfg.fan.key]: 0 });
        if (reply.includes('[CMD_HEATER_ON]')) roomRef(cfg.secondary.path).set({ [cfg.secondary.key]: 1 });
        if (reply.includes('[CMD_HEATER_OFF]'))roomRef(cfg.secondary.path).set({ [cfg.secondary.key]: 0 });
        const acMatch = reply.match(/\[CMD_AC_(\d+)\]/);
        if (acMatch) roomRef(cfg.ac.path).set({ dieuHoa: parseInt(acMatch[1]) });
        if (reply.includes('[CMD_AUTO_ON]'))  roomRef('autoMode').set(true);
        if (reply.includes('[CMD_AUTO_OFF]')) roomRef('autoMode').set(false);

        reply = reply.replace(/\[CMD_.*?\]/g, '').replace(/\n/g, '<br>').trim();
        document.getElementById(typingId).remove();
        chat.innerHTML += `<div class="msg bot">${reply}</div>`;
    } catch (e) {
        document.getElementById(typingId).remove();
        chat.innerHTML += `<div class="msg bot" style="color:#ef4444">${e.message.includes("429") ? "⚠️ AI quá tải, thử lại sau 1 phút." : "Lỗi: " + e.message}</div>`;
    } finally {
        input.disabled = false; btnSend.disabled = false; input.focus();
        chat.scrollTop = chat.scrollHeight;
    }
}

// Khởi tạo hệ thống
window.onload = () => {
    switchRoom('phong_ngu'); 
};