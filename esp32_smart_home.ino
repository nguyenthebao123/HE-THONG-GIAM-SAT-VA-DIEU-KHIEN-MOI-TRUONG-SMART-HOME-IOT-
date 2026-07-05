#include <Arduino.h>
#include <WiFi.h>
#include <FirebaseESP32.h>
#include <DHT.h>

// ============ CẤU HÌNH WiFi ============
#define WIFI_SSID     "MinhThong"
#define WIFI_PASSWORD "Thong@123"

// ============ CẤU HÌNH FIREBASE ============
#define FIREBASE_HOST "iot-firebase-1593b-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH "m4ES0wpQpzseb05ZQ9yKMwQziMBEtISiXDyOoArE"

// ============ KHAI BÁO CẢM BIẾN & CÒI ============
#define DHTPIN      2    
#define DHTTYPE     DHT11
#define MQ2_PIN     34   
#define BUZZER_PIN  26   

// ============ KHAI BÁO CHÂN - PHÒNG NGỦ ============
#define LED_TV      32   // Thiết bị 1 (Toggle)
#define LED_DEN     33   // Thiết bị 2 (Switch)
#define LED_AC_NGU  25   // Thiết bị 3 (PWM Điều hòa)

// ============ KHAI BÁO CHÂN - PHÒNG KHÁCH ============
#define LED_QUAT    18   // Thiết bị 1 (Bật/Tắt)
#define LED_LOSUOI  19   // Thiết bị 2 (Switch)
#define LED_AC_KHACH 21  // Thiết bị 3 (PWM Điều hòa)

// ============ PWM CONFIG ============
#define PWM_FREQ      5000
#define PWM_RESOLUTION 8   // 8-bit: 0-255

// ============ NGƯỠNG TỰ ĐỘNG ============
#define TEMP_HIGH    30.0   // °C - Bật quạt
#define TEMP_LOW     20.0   // °C - Bật lò sưởi
#define HUM_LOW      45.0   // %  - Bật điều hòa
#define GAS_THRESHOLD 1600   // Ngưỡng cảnh báo gas (0-4095 ADC)

// ============ KHỞI TẠO BIẾN ============
DHT dht(DHTPIN, DHTTYPE);
FirebaseData fbData;
FirebaseConfig fbConfig;
FirebaseAuth fbAuth;

unsigned long lastSensorRead = 0;
unsigned long lastFirebaseRead = 0;
const unsigned long SENSOR_INTERVAL  = 3000;  // 3s
const unsigned long FIREBASE_INTERVAL = 500;  // 0.5s

float temperature = 0, humidity = 0;
int gasValue = 0;

unsigned long lastBuzzerTime = 0;
bool buzzerState = false;
const unsigned long BUZZER_INTERVAL = 500;

void setup() {
  Serial.begin(115200);

  // Cấu hình chân output Phòng Ngủ
  pinMode(LED_TV, OUTPUT);
  pinMode(LED_DEN, OUTPUT);
  digitalWrite(LED_TV, LOW);
  digitalWrite(LED_DEN, LOW);

  // Cấu hình chân output Phòng Khách
  pinMode(LED_QUAT, OUTPUT);
  pinMode(LED_LOSUOI, OUTPUT);
  digitalWrite(LED_QUAT, LOW);
  digitalWrite(LED_LOSUOI, LOW);

  // Cấu hình còi
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // Cấu hình PWM cho Điều Hòa 2 phòng (Core 3.x)
  ledcAttach(LED_AC_NGU, PWM_FREQ, PWM_RESOLUTION);
  ledcAttach(LED_AC_KHACH, PWM_FREQ, PWM_RESOLUTION);
  ledcWrite(LED_AC_NGU, 0);
  ledcWrite(LED_AC_KHACH, 0);

  dht.begin();

  // Kết nối WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
  }
  Serial.println("\nWiFi OK: " + WiFi.localIP().toString());

  // Cấu hình Firebase
  fbConfig.host = FIREBASE_HOST;
  fbConfig.signer.tokens.legacy_token = FIREBASE_AUTH;
  Firebase.begin(&fbConfig, &fbAuth);
  Firebase.reconnectWiFi(true);
  Serial.println("Firebase OK");

  // Khởi tạo trạng thái ban đầu trên Firebase (cho cả 2 phòng)
  Firebase.setBool(fbData, "/phong_ngu/autoMode", false);
  Firebase.setInt(fbData,  "/phong_ngu/thietbi1/tv", 0);
  Firebase.setInt(fbData,  "/phong_ngu/thietbi2/den", 0);
  Firebase.setInt(fbData,  "/phong_ngu/thietbi3/dieuHoa", 0);

  Firebase.setBool(fbData, "/phong_khach/autoMode", false);
  Firebase.setInt(fbData,  "/phong_khach/thietbi1/quat", 0);
  Firebase.setInt(fbData,  "/phong_khach/thietbi2/losuoi", 0);
  Firebase.setInt(fbData,  "/phong_khach/thietbi3/dieuHoa", 0);
}

void loop() {
  unsigned long now = millis();

  // ===== 1. ĐỌC & GỬI DỮ LIỆU CẢM BIẾN =====
  if (now - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = now;
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    int gas = analogRead(MQ2_PIN);

    if (!isnan(t) && !isnan(h)) {
      temperature = t; humidity = h; gasValue = gas;

      Serial.printf("Temp: %.1f°C | Hum: %.1f%% | Gas: %d\n", t, h, gas);
      
      Firebase.setFloat(fbData, "/sensors/Nhietdo", t);
      Firebase.setFloat(fbData, "/sensors/Doam", h);
      Firebase.setInt(fbData,   "/sensors/Gas", gas);
      Firebase.setBool(fbData,  "/sensors/GasAlert", gas > GAS_THRESHOLD);
    }
  }

  // ===== 2. ĐỌC LỆNH TỪ FIREBASE & ĐIỀU KHIỂN =====
  if (now - lastFirebaseRead >= FIREBASE_INTERVAL) {
    lastFirebaseRead = now;

    // ----- A. XỬ LÝ PHÒNG NGỦ -----
    bool autoNgu = false;
    if (Firebase.getBool(fbData, "/phong_ngu/autoMode")) autoNgu = fbData.boolData();

    int tvState = 0, denState = 0, acNguLevel = 0;

    // TV và Đèn không bị ảnh hưởng bởi Auto, nên luôn đọc thủ công
    if (Firebase.getInt(fbData, "/phong_ngu/thietbi1/tv"))  tvState = fbData.intData();
    if (Firebase.getInt(fbData, "/phong_ngu/thietbi2/den")) denState = fbData.intData();

    if (autoNgu) {
      if      (humidity < 25) acNguLevel = 100;
      else if (humidity < 35) acNguLevel = 66;
      else if (humidity < HUM_LOW) acNguLevel = 33;
      else acNguLevel = 0;
      Firebase.setInt(fbData, "/phong_ngu/thietbi3/dieuHoa", acNguLevel);
    } else {
      if (Firebase.getInt(fbData, "/phong_ngu/thietbi3/dieuHoa")) acNguLevel = fbData.intData();
    }

    // Xuất tín hiệu Phòng Ngủ
    digitalWrite(LED_TV, tvState ? HIGH : LOW);
    digitalWrite(LED_DEN, denState ? HIGH : LOW);
    ledcWrite(LED_AC_NGU, map(constrain(acNguLevel, 0, 100), 0, 100, 0, 255));


    // ----- B. XỬ LÝ PHÒNG KHÁCH -----
    bool autoKhach = false;
    if (Firebase.getBool(fbData, "/phong_khach/autoMode")) autoKhach = fbData.boolData();

    int quatState = 0, losuoiState = 0, acKhachLevel = 0;

    if (autoKhach) {
      quatState   = (temperature >= TEMP_HIGH) ? 1 : 0;
      losuoiState = (temperature <= TEMP_LOW) ? 1 : 0;
      if      (humidity < 25) acKhachLevel = 100;
      else if (humidity < 35) acKhachLevel = 66;
      else if (humidity < HUM_LOW) acKhachLevel = 33;
      else acKhachLevel = 0;

      Firebase.setInt(fbData, "/phong_khach/thietbi1/quat", quatState);
      Firebase.setInt(fbData, "/phong_khach/thietbi2/losuoi", losuoiState);
      Firebase.setInt(fbData, "/phong_khach/thietbi3/dieuHoa", acKhachLevel);
    } else {
      if (Firebase.getInt(fbData, "/phong_khach/thietbi1/quat"))    quatState = fbData.intData();
      if (Firebase.getInt(fbData, "/phong_khach/thietbi2/losuoi"))  losuoiState = fbData.intData();
      if (Firebase.getInt(fbData, "/phong_khach/thietbi3/dieuHoa")) acKhachLevel = fbData.intData();
    }

    // Xuất tín hiệu Phòng Khách
    digitalWrite(LED_QUAT, quatState ? HIGH : LOW);
    digitalWrite(LED_LOSUOI, losuoiState ? HIGH : LOW);
    ledcWrite(LED_AC_KHACH, map(constrain(acKhachLevel, 0, 100), 0, 100, 0, 255));
  }

  // ===== 3. CẢNH BÁO BUZZER ĐỘC LẬP =====
  if (gasValue > GAS_THRESHOLD) {
    if (now - lastBuzzerTime >= BUZZER_INTERVAL) {
      lastBuzzerTime = now;
      buzzerState = !buzzerState; 
      digitalWrite(BUZZER_PIN, buzzerState ? HIGH : LOW);
    }
  } else {
    if (buzzerState == true) {
      buzzerState = false;
      digitalWrite(BUZZER_PIN, LOW);
    }
  }
}