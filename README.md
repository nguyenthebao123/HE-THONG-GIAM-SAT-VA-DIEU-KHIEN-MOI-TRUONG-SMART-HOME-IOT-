# Hệ Thống Giám Sát Và Điều Khiển Môi Trường (Smart Home IoT)

Đồ án môn học **ITFL316064** — Trường Đại học Công nghệ Kỹ thuật TP.HCM (HCMUTE)
Khoa Điện – Điện tử | Học kì 2, Năm học 2025-2026

## Thông tin nhóm

| Họ tên | MSSV |
|---|---|
| Nguyễn Thái An |  |
| Nguyễn Thế Bảo |  |
| Dương Minh Thông |  |

**Giảng viên hướng dẫn:** ThS. Trương Quang Phúc

**Video demo:** https://www.youtube.com/watch?v=dRGBdU-rv60

---

## 1. Giới thiệu

Hệ thống được xây dựng nhằm giám sát các thông số môi trường (nhiệt độ, độ ẩm, nồng độ khí gas) theo thời gian thực, hiển thị trực quan qua giao diện Web, đồng thời cho phép điều khiển thiết bị ngoại vi (quạt, lò sưởi, máy lạnh) ở cả hai chế độ **thủ công** và **tự động**, kèm chức năng **cảnh báo** khi thông số vượt ngưỡng an toàn.

### Chức năng chính
- **Giám sát:** thu thập và hiển thị nhiệt độ, độ ẩm, nồng độ khí gas theo thời gian thực; lưu lịch sử lên Google Sheets.
- **Điều khiển:** bật/tắt thiết bị ngoại vi qua giao diện Web (chế độ thủ công) hoặc tự động theo ngưỡng cảm biến.
- **Cảnh báo:** phát còi buzzer và hiển thị cảnh báo trên Web khi nồng độ gas vượt ngưỡng (1600).
- **Chatbox:** tương tác điều khiển bằng ngôn ngữ tự nhiên thông qua Gemini API.

---

## 2. Kiến trúc hệ thống

Hệ thống gồm 6 khối chính:

| Khối | Chức năng |
|---|---|
| Khối xử lý trung tâm | ESP32 – điều phối toàn bộ hệ thống |
| Khối cảm biến | DHT11 (nhiệt độ, độ ẩm), MQ-2 (khí gas) |
| Khối cảnh báo | Còi Buzzer |
| Khối thiết bị ngoại vi | Quạt, lò sưởi, máy lạnh (mô phỏng bằng LED) |
| Khối cơ sở dữ liệu | Firebase Realtime Database |
| Khối Web | Giao diện giám sát & điều khiển |

Nguồn điện: 5V qua cổng USB cấp cho ESP32; các khối khác dùng 3.3V từ ESP32.

---

## 3. Phần cứng

### Vi điều khiển: ESP32 DevKit V1
- 2 lõi Xtensa 32-bit, xung nhịp tối đa 240MHz
- Wi-Fi tích hợp (802.11 b/g/n), Bluetooth 4.2
- 30 chân GPIO, hỗ trợ UART/SPI/I2C

### Cảm biến
- **DHT11**: đo nhiệt độ (0–50°C, sai số ±2°C) và độ ẩm (20–90%, sai số ±5%), giao tiếp digital 1-wire — nối chân DATA vào GPIO2.
- **MQ-2**: đo nồng độ khí gas/khói (300–10000 ppm), ngõ ra Analog (A0) — nối vào GPIO34.

### Sơ đồ chân GPIO cho thiết bị (LED mô phỏng)

| Vị trí | Thiết bị | Màu LED | GPIO |
|---|---|---|---|
| Phòng khách | Lò sưởi | Vàng | 19 |
| Phòng khách | Quạt thông gió | Xanh lá | 18 |
| Phòng khách | Điều hòa | Đỏ | 21 |
| Phòng ngủ | Tivi | Vàng | 32 |
| Phòng ngủ | Đèn | Xanh lá | 33 |
| Phòng ngủ | Điều hòa | Đỏ | 25 |
| — | Buzzer cảnh báo | — | 26 |

Điện trở hạn dòng cho LED: **220Ω** (dòng qua LED ≈ 6.8mA).

---

## 4. Phần mềm

### Luồng xử lý chính
1. Kết nối Wi-Fi, Firebase và Web.
2. Đọc dữ liệu cảm biến → hiển thị Serial Monitor → đồng bộ Firebase & Web.
3. Kiểm tra nồng độ gas: nếu > 1600 → bật còi + gửi cảnh báo lên Web/Firebase.
4. Kiểm tra chế độ hoạt động → chuyển sang **tự động** hoặc **thủ công**.

### Chế độ tự động (theo ngưỡng)
- Nhiệt độ < 20°C → bật lò sưởi phòng khách
- Nhiệt độ > 30°C → bật quạt thông gió phòng khách
- Độ ẩm < 45% → bật điều hòa phòng khách & phòng ngủ

### Chế độ thủ công
- Người dùng bật/tắt từng thiết bị trực tiếp trên Web → cập nhật Firebase → điều khiển phần cứng.

### Chatbox (Gemini API)
- Nhận lệnh người dùng → gửi prompt đến Gemini API → phân tích có phải lệnh điều khiển không → nếu có, cập nhật Firebase và điều khiển thiết bị; nếu không, trả lời trực tiếp.

---

## 5. Kết quả

- Xây dựng thành công mô hình phần cứng trên breadboard và giao diện Web "Hệ Thống Smart Home IoT" gồm: bảng điều khiển, giám sát trực tuyến, biểu đồ lịch sử nhiệt độ/độ ẩm/khí gas.
- Hệ thống hoạt động ổn định ở cả 2 chế độ thủ công và tự động; cảnh báo khí gas hoạt động chính xác khi vượt ngưỡng 1600.
- Dữ liệu lịch sử được lưu đầy đủ trên Google Sheets.

### Thời gian đáp ứng hệ thống

| Tiêu chí | Thời gian |
|---|---|
| Cập nhật dữ liệu cảm biến → Firebase | 5 giây |
| Cập nhật Firebase → Web | Hầu như tức thời |
| Cập nhật lệnh điều khiển Web → Firebase | Hầu như tức thời |
| Cập nhật lệnh điều khiển Web → phần cứng | 5 – 15 giây |
| Thời gian phát cảnh báo khi vượt ngưỡng | 2 – 3 giây |

---

## 6. Hạn chế & Hướng phát triển

- Tốc độ phản hồi điều khiển từ Web xuống phần cứng còn chậm (5–15 giây), phụ thuộc chất lượng Wi-Fi.
- **Hướng khắc phục:** áp dụng giao thức **MQTT** để giảm độ trễ và giảm phụ thuộc vào khâu trung gian.

---

## 7. Tài liệu tham khảo

1. Espressif Systems, *ESP32 Series Datasheet*, v4.4, 2023.
2. Google LLC, *Firebase Realtime Database Documentation*, 2024.
3. Aosong Electronics, *DHT11 Product Manual*, 2022.
4. Winsen Electronics, *MQ-2 Combustible Gas Sensor Datasheet*, 2021.
5. OASIS, *MQTT Version 5.0 Standard*, 2019.
