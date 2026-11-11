  #include <SPI.h>
  #include <MFRC522.h>
  #include <WiFi.h>
  #include <WiFiClientSecure.h>
  #include <HTTPClient.h>
  #include <Firebase_ESP_Client.h>
  #include <addons/TokenHelper.h>
  #include <addons/RTDBHelper.h>
  #include <ESP32Servo.h>

  // ---------------- CREDENTIALS / SECRETS ----------------
  // Create a file named secrets.h in this same folder (next to this .ino).
  // A ready-to-copy template is provided: secrets.h.example
  // If you don't have the template, secrets.h must contain these lines:
  //
  //   #pragma once
  //   #define WIFI_SSID      "your-wifi-name"
  //   #define WIFI_PASSWORD  "your-wifi-password"
  //   #define API_KEY        "your Firebase web API key"
  //   #define DATABASE_URL   "https://your-project-default-rtdb.region.firebasedatabase.app/"
  //   #define USER_EMAIL     "device account email (Firebase Authentication user)"
  //   #define USER_PASSWORD  "device account password"
  //   #define SMS_API_URL    "https://sms.iprogtech.com/api/v1/sms_messages"
  //   #define SMS_API_TOKEN  "your iProg SMS API token (any text if you don't use SMS)"
  //
  // secrets.h is git-ignored so your real values are never published.
  #if __has_include("secrets.h")
    #include "secrets.h"
  #else
    #error "secrets.h not found. Create it next to this .ino (copy secrets.h.example) and fill in your WiFi, Firebase and SMS values. See the comment above."
  #endif

  // ---------------- ADMIN OVERRIDE CARD ----------------
  #define ADMIN_CARD_ID  "Admin1234"
  #define ADMIN_CARD_UID ""

  // ---------------- HARDWARE ----------------
  Servo myServo;
  const int servoPin = 21;
  const unsigned long GATE_OPEN_MS = 3000;

  #define RST_PIN   22
  #define SS_S1_PIN 4    // Student Entrance Tag
  #define SS_V1_PIN 5    // Vehicle Entrance
  #define SS_V2_PIN 17   // Vehicle Exit
  #define SS_S2_PIN 16   // Student Exit Tag

  #define NR_OF_READERS 4
  byte ssPins[] = {SS_S1_PIN, SS_V1_PIN, SS_V2_PIN, SS_S2_PIN};
  String readerName[NR_OF_READERS] = {"S1", "V1", "V2", "S2"};
  MFRC522 mfrc522[NR_OF_READERS];

  // ---------------- FIREBASE ----------------
  FirebaseData fbdo;
  FirebaseAuth auth;
  FirebaseConfig config;

  // ---------------- STATE ----------------
  String lastVehicleUID = "";
  unsigned long lastVehicleTime = 0;
  String lastStudentID = "";
  unsigned long lastStudentTime = 0;
  uint8_t lastStudentReader = 0;
  const unsigned long SCAN_TIMEOUT = 30000;

  bool gateOpen = false;
  unsigned long gateCloseAt = 0;

  // ---------------- OFFLINE LOGGER (rfid_offline_logger.py over USB serial) ----------------
  const unsigned long SCAN_COOLDOWN_MS  = 1000;   
  const bool SCAN_OPENS_GATE = true;             
  const uint8_t scanReaders[] = {0, 3};           
  const uint8_t SCAN_READER_COUNT = sizeof(scanReaders);

  bool scanMode = false;
  unsigned long lastScanMs = 0;
  String inputLine = "";
  bool netStarted = false;                    

  struct StudentInfo {
    String name;
    String contact;
    String status;         
    bool   vehicleFound;
    String plate;
    String vehicleActive;  
    String expiry;     
  };

  // ---------------- PROTOTYPES ----------------
  void readSerial();
  void handleCommand(const String &cmd);
  void offlineScanLoop();
  void handleScanCard(uint8_t reader);
  bool readBlock4(uint8_t reader, String &out);
  void sendScanResult(const String &uid, const String &userId, const char *msg);
  void serviceNetwork();
  void startNetwork();
  void serviceGate();
  void adminOverride(uint8_t reader, const String &cardUID);
  void logManualEntry(const String &accessType, const String &cardUID);
  void checkForAccess();
  int  fetchStudent(const String &studentID, const String &vehicleUID, StudentInfo &info);
  String checkEligibility(const StudentInfo &info);
  void grantAccess(uint8_t reader, const String &accessType, const String &studentID, const String &cardUID, const StudentInfo &info);
  void denyAccess(uint8_t reader, const String &accessType, const String &reason, const String &studentID, const String &cardUID);
  void logAccess(uint8_t reader, const String &studentID, const String &cardUID, const String &accessType, bool granted, const String &reason);
  void updateVehicleStatus(const String &studentID, const String &vehicleUID, const String &accessType);
  bool sendSMS(String number, const String &message);
  void notifyStudentExit(const StudentInfo &info);
  String getTimeString();
  String getDateISO();
  void openServo();
  void denyIndicator();
  String readStudentID(uint8_t reader);
  bool isValidStudentID(String studentID);
  String getUIDString(MFRC522 &reader);

  // ============================================================
  void setup() {
    Serial.begin(115200);
    inputLine.reserve(64);
    Serial.println(F("READY|ParkTags gate"));

    // Servo
    myServo.setPeriodHertz(50);
    myServo.attach(servoPin, 500, 2400);
    myServo.write(0);

    SPI.begin();
    for (uint8_t r = 0; r < NR_OF_READERS; r++) {
      mfrc522[r].PCD_Init(ssPins[r], RST_PIN);
      Serial.print(F("Reader "));
      Serial.print(readerName[r]);
      Serial.println(F(" initialized"));
    }

    WiFi.persistent(false);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print(F("Connecting to WiFi"));
    unsigned long start = millis();
    unsigned long lastDot = 0;
    while (WiFi.status() != WL_CONNECTED && !scanMode) {
      readSerial();
      if (millis() - lastDot >= 500) {
        Serial.print(".");
        lastDot = millis();
      }
      if (millis() - start > 20000) {
        Serial.println(F("\nWiFi timeout, retrying..."));
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        start = millis();
      }
      delay(20);
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
      startNetwork();
    } else {
      Serial.println(F("Offline logger connected - skipping WiFi wait."));
    }

    Serial.println(F("\nSystem ready - waiting for cards."));
    Serial.println(F("Scan vehicle and student card (either order) within 30 seconds"));
  }

  // Starts NTP + Firebase. Called once, as soon as WiFi is connected.
  void startNetwork() {
    if (netStarted) return;
    Serial.print(F("Connected with IP: "));
    Serial.println(WiFi.localIP());

    // Sync clock via NTP
    configTime(8 * 3600, 0, "pool.ntp.org", "time.nist.gov");
    struct tm timeinfo;
    if (getLocalTime(&timeinfo, 2000)) {
      Serial.println(F("Time synced"));
    } else {
      Serial.println(F("Time sync pending - will retry when needed"));
    }

    // Firebase
    config.api_key = API_KEY;
    config.database_url = DATABASE_URL;
    auth.user.email = USER_EMAIL;
    auth.user.password = USER_PASSWORD;
    config.token_status_callback = tokenStatusCallback;
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);
    netStarted = true;
  }

  void serviceNetwork() {
    if (netStarted) return;
    if (WiFi.status() == WL_CONNECTED) {
      startNetwork();
      return;
    }
    static unsigned long lastTry = 0;
    if (millis() - lastTry < 15000) return;
    lastTry = millis();
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }

  // ============================================================
  void loop() {
    readSerial();
    serviceNetwork();
    serviceGate();

    if (scanMode) {
      offlineScanLoop();
      delay(50);
      return;
    }

    if (!netStarted) {
      static unsigned long lastMsg = 0;
      if (millis() - lastMsg > 10000) {
        Serial.println(F("Waiting for WiFi..."));
        lastMsg = millis();
      }
      delay(50);
      return;
    }

    for (uint8_t reader = 0; reader < NR_OF_READERS; reader++) {
      if (mfrc522[reader].PICC_IsNewCardPresent() && mfrc522[reader].PICC_ReadCardSerial()) {
        String cardUID = getUIDString(mfrc522[reader]);

        Serial.println();
        Serial.print(F("Reader "));
        Serial.print(readerName[reader]);
        Serial.print(F(" detected card UID: "));
        Serial.println(cardUID);

        if (reader == 1 || reader == 2) {
          // Vehicle reader
          lastVehicleUID = cardUID;
          lastVehicleTime = millis();
          Serial.println(F("Vehicle UID stored."));
          if (lastStudentID != "") {
            checkForAccess();
          } else {
            Serial.println(F("Please scan student card now."));
          }
        } else {
          // Student reader (0 = entrance, 3 = exit)
          String studentID = readStudentID(reader);

          if (studentID.length() > 0) {
            Serial.print(F("Student ID read: "));
            Serial.println(studentID);

            bool isAdminId = (studentID == ADMIN_CARD_ID);
            bool adminUidOk = (strlen(ADMIN_CARD_UID) == 0 || cardUID == ADMIN_CARD_UID);

            if (isAdminId && adminUidOk) {
              adminOverride(reader, cardUID);
            } else if (isAdminId) {
              Serial.println(F("Admin ID on an unrecognized card - ignored"));
            } else if (isValidStudentID(studentID)) {
              Serial.println(F("Valid ID format"));
              lastStudentID = studentID;
              lastStudentTime = millis();
              lastStudentReader = reader;

              if (lastVehicleUID != "") {
                checkForAccess();
              } else {
                Serial.println(F("Please scan vehicle tag now."));
              }
            } else {
              Serial.println(F("Invalid ID format - must start with 'S' (student) or 'E' (staff)"));
            }
          } else {
            Serial.println(F("Failed to read student ID from card"));
          }
        }

        mfrc522[reader].PICC_HaltA();
        mfrc522[reader].PCD_StopCrypto1();
      }
    }

    // Expire 
    if (lastVehicleUID != "" && millis() - lastVehicleTime > SCAN_TIMEOUT) {
      Serial.println(F("Vehicle scan timeout. Please scan vehicle again."));
      lastVehicleUID = "";
    }
    if (lastStudentID != "" && millis() - lastStudentTime > SCAN_TIMEOUT) {
      Serial.println(F("Student scan timeout. Please scan student card again."));
      lastStudentID = "";
    }

    delay(50);
  }
  // ============================================================
  // OFFLINE LOGGER (USB serial)
  void readSerial() {
    while (Serial.available()) {
      char c = Serial.read();
      if (c == '\n') {
        inputLine.trim();
        if (inputLine.length() > 0) handleCommand(inputLine);
        inputLine = "";
      } else if (c != '\r') {
        if (inputLine.length() < 64) inputLine += c;
      }
    }
  }

  void handleCommand(const String &cmd) {
    if (cmd == "PING") {
      Serial.println(F("READY|PONG"));

    } else if (cmd == "SCAN") {
      lastVehicleUID = "";   // drop any half-finished gate scan
      lastStudentID = "";
      scanMode = true;
      lastScanMs = 0;
      Serial.println(F("STATUS|WAITING_SCAN"));

    } else if (cmd == "STOP") {
      scanMode = false;
      Serial.println(F("STATUS|STOPPED"));

    } else {
      Serial.println(F("STATUS|ERROR:Unknown command."));
    }
  }

  void offlineScanLoop() {
    if (millis() - lastScanMs < SCAN_COOLDOWN_MS) return;

    for (uint8_t i = 0; i < SCAN_READER_COUNT; i++) {
      uint8_t r = scanReaders[i];
      if (mfrc522[r].PICC_IsNewCardPresent() && mfrc522[r].PICC_ReadCardSerial()) {
        handleScanCard(r);
        mfrc522[r].PICC_HaltA();
        mfrc522[r].PCD_StopCrypto1();
        lastScanMs = millis();
        return;
      }
    }
  }

  // Always reports the card UID, plus the user ID in block 4 when it can be read, so a log
  // can still be recorded for blank / other-key / non-MIFARE-Classic cards.
  void handleScanCard(uint8_t reader) {
    String uid = getUIDString(mfrc522[reader]);
    MFRC522::PICC_Type type = mfrc522[reader].PICC_GetType(mfrc522[reader].uid.sak);
    bool classic = (type == MFRC522::PICC_TYPE_MIFARE_MINI ||
                    type == MFRC522::PICC_TYPE_MIFARE_1K ||
                    type == MFRC522::PICC_TYPE_MIFARE_4K);

    String stored = "";
    if (!classic) {
      sendScanResult(uid, "", "Card detected (UID only, not a MIFARE Classic card).");
    } else if (!readBlock4(reader, stored)) {
      sendScanResult(uid, "", "Card detected (user ID could not be read).");
    } else if (stored.length() == 0) {
      sendScanResult(uid, "", "Card detected (no user ID stored).");
    } else {
      sendScanResult(uid, stored, "Card read successfully.");
    }

    if (SCAN_OPENS_GATE) openServo();
  }

  // Block 4 as printable text ('|' dropped so it can't break the serial message format).
  bool readBlock4(uint8_t reader, String &out) {
    MFRC522::MIFARE_Key key;
    for (byte i = 0; i < 6; i++) key.keyByte[i] = 0xFF;

    byte buffer[18];
    byte len = sizeof(buffer);

    MFRC522::StatusCode status = mfrc522[reader].PCD_Authenticate(
        MFRC522::PICC_CMD_MF_AUTH_KEY_A, 4, &key, &(mfrc522[reader].uid));
    if (status != MFRC522::STATUS_OK) return false;

    status = mfrc522[reader].MIFARE_Read(4, buffer, &len);
    if (status != MFRC522::STATUS_OK) return false;

    out = "";
    for (byte i = 0; i < 16; i++) {
      if (buffer[i] == 0) break;
      if (buffer[i] >= 32 && buffer[i] <= 126 && buffer[i] != '|') out += (char)buffer[i];
    }
    out.trim();
    return true;
  }

  void sendScanResult(const String &uid, const String &userId, const char *msg) {
    Serial.print(F("RESULT|SCAN|"));
    Serial.print(uid);
    Serial.print('|');
    Serial.print(userId);
    Serial.print(F("|OK|"));
    Serial.println(msg);
  }

  void serviceGate() {
    if (gateOpen && millis() >= gateCloseAt) {
      myServo.write(0);
      gateOpen = false;
      Serial.println(F("Gate closed."));
    }
  }

  // ACCESS CHECK (both vehicle and student are stored)
  void checkForAccess() {
    if (lastVehicleUID == "" || lastStudentID == "") return;

    if (millis() - lastVehicleTime > SCAN_TIMEOUT || millis() - lastStudentTime > SCAN_TIMEOUT) {
      Serial.println(F("Scan timeout. Please scan both cards again."));
      lastVehicleUID = "";
      lastStudentID = "";
      return;
    }

    String studentID = lastStudentID;
    String vehicleUID = lastVehicleUID;
    uint8_t reader = lastStudentReader;
    lastStudentID = "";
    lastVehicleUID = "";

    String accessType = (reader == 0) ? "ENTRANCE" : "EXIT";

    Serial.println(F("------------------------------------"));
    Serial.print(accessType);
    Serial.println(F(" REQUEST"));
    Serial.print(F("Student ID: "));
    Serial.println(studentID);
    Serial.print(F("Vehicle UID: "));
    Serial.println(vehicleUID);
    Serial.println(F("Checking Firebase database..."));

    StudentInfo info;
    int found = fetchStudent(studentID, vehicleUID, info); 

    if (found < 0) {
      Serial.println(F("Database error"));
      denyAccess(reader, accessType, "Database error", studentID, vehicleUID);
    } else if (found == 0) {
      Serial.println(F("Student not found in database"));
      denyAccess(reader, accessType, "Student not registered", studentID, vehicleUID);
    } else if (!info.vehicleFound) {
      Serial.println(F("Vehicle not registered to this student"));
      denyAccess(reader, accessType, "Vehicle not registered to student", studentID, vehicleUID);
    } else {
      String reason = checkEligibility(info);
      if (reason.length() > 0) {
        Serial.println("Not eligible: " + reason);
        denyAccess(reader, accessType, reason, studentID, vehicleUID);
      } else {
        Serial.println(F("Student and vehicle verified"));
        grantAccess(reader, accessType, studentID, vehicleUID, info);
      }
    }

    Serial.println(F("------------------------------------"));
  }
  // FIREBASE
  int fetchStudent(const String &studentID, const String &vehicleUID, StudentInfo &info) {
    info.name = info.contact = info.status = info.plate = info.vehicleActive = info.expiry = "";
    info.vehicleFound = false;

    String path = "students/" + studentID;
    if (!Firebase.RTDB.get(&fbdo, path.c_str())) {
      Serial.println("Error: " + fbdo.errorReason());
      return -1;
    }
    if (fbdo.dataType() != "json") return 0;  

    FirebaseJson json;
    json.setJsonData(fbdo.payload());
    FirebaseJsonData r;

    if (json.get(r, "name"))           info.name = r.stringValue;
    if (json.get(r, "contact_number")) info.contact = r.stringValue;
    if (json.get(r, "status"))         info.status = r.stringValue;

    String vbase = "vehicles/" + vehicleUID;
    if (json.get(r, vbase)) {
      info.vehicleFound = true;
      if (json.get(r, vbase + "/plate_number"))        info.plate = r.stringValue;
      if (json.get(r, vbase + "/is_active"))           info.vehicleActive = r.stringValue;
      if (json.get(r, vbase + "/registration_expiry")) info.expiry = r.stringValue;
    }
    return 1;
  }

  String checkEligibility(const StudentInfo &info) {
    String status = info.status;
    status.toLowerCase();
    if (status.length() > 0 && status != "active") return "Student account not active";

    if (info.vehicleActive == "false") return "Vehicle not active";

    if (info.expiry.length() >= 10) {
      String today = getDateISO();
      if (today.length() == 0) {
        Serial.println(F("Clock not synced - skipping registration expiry check"));
      } else if (info.expiry.substring(0, 10) < today) {  // YYYY-MM-DD compares correctly as text
        return "Vehicle registration expired";
      }
    }
    return "";
  }

  void logAccess(uint8_t reader, const String &studentID, const String &cardUID,
                const String &accessType, bool granted, const String &reason) {
    FirebaseJson json;
    json.set("timestamp/.sv", "timestamp");
    json.set("reader", readerName[reader]);
    json.set("student_id", studentID);
    json.set("card_uid", cardUID);
    json.set("access_type", accessType);
    json.set("granted", granted);
    if (reason.length() > 0) json.set("reason", reason);

    if (Firebase.RTDB.pushJSON(&fbdo, "access_logs", &json)) {
      Serial.println("Access logged: " + fbdo.pushName());
    } else {
      Serial.println("Failed to log access: " + fbdo.errorReason());
    }
  }

  void updateVehicleStatus(const String &studentID, const String &vehicleUID, const String &accessType) {
    String path = "students/" + studentID + "/vehicles/" + vehicleUID + "/current_status";
    String value = (accessType == "ENTRANCE") ? "parked" : "not parked";
    if (!Firebase.RTDB.setString(&fbdo, path.c_str(), value)) {
      Serial.println("Failed to update vehicle status: " + fbdo.errorReason());
    }
  }
  // TIME
  String getTimeString() {
    struct tm timeinfo;
    if (!getLocalTime(&timeinfo, 3000)) return "";
    char buf[32];
    strftime(buf, sizeof(buf), "%b %d, %Y %I:%M %p", &timeinfo);
    return String(buf);
  }
  String getDateISO() {
    struct tm timeinfo;
    if (!getLocalTime(&timeinfo, 3000)) return "";
    char buf[16];
    strftime(buf, sizeof(buf), "%Y-%m-%d", &timeinfo);
    return String(buf);
  }
  // SMS NOTIFICATION (iProg SMS)
  bool sendSMS(String number, const String &message) {
    number.trim();
    if (number.startsWith("+63")) number = "0" + number.substring(3);
    else if (number.startsWith("63")) number = "0" + number.substring(2);

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("SMS not sent: WiFi disconnected"));
      return false;
    }

    WiFiClientSecure client;
    client.setInsecure();  

    HTTPClient http;
    http.setTimeout(5000);
    if (!http.begin(client, SMS_API_URL)) {
      Serial.println(F("SMS not sent: could not start HTTP request"));
      return false;
    }
    http.addHeader("Content-Type", "application/json");

    FirebaseJson payload; 
    payload.set("api_token", SMS_API_TOKEN);
    payload.set("phone_number", number);
    payload.set("message", message);
    String body;
    payload.toString(body, false);

    int code = http.POST(body);
    Serial.print(F("SMS API response code: "));
    Serial.println(code);
    if (code > 0) Serial.println(http.getString());
    http.end();

    return code >= 200 && code < 300;
  }

  void notifyStudentExit(const StudentInfo &info) {
    if (info.contact.length() == 0) {
      Serial.println(F("No contact_number on file - SMS skipped"));
      return;
    }

    String msg = "ParkTags: ";
    if (info.name.length() > 0) msg += info.name + ", your";
    else msg += "Your";
    msg += " vehicle";
    if (info.plate.length() > 0) msg += " (" + info.plate + ")";
    msg += " has exited the school";
    String when = getTimeString();
    if (when.length() > 0) msg += " on " + when;
    msg += ".";

    Serial.print(F("Sending SMS to "));
    Serial.println(info.contact);
    if (sendSMS(info.contact, msg)) {
      Serial.println(F("SMS sent"));
    } else {
      Serial.println(F("SMS failed"));
    }
  }
  // ACCESS CONTROL
  void grantAccess(uint8_t reader, const String &accessType, const String &studentID,
                  const String &cardUID, const StudentInfo &info) {
    Serial.println(F("ACCESS GRANTED"));
    Serial.println(accessType == "ENTRANCE" ? F("Welcome! Gate opening...") : F("Goodbye! Gate opening..."));

    openServo();

    logAccess(reader, studentID, cardUID, accessType, true, "");
    serviceGate();

    updateVehicleStatus(studentID, cardUID, accessType);
    serviceGate();

    if (accessType == "EXIT") {
      notifyStudentExit(info);
      serviceGate();
    }
  }

  // Admin card: open the gate then log it as a manual entry.
  void adminOverride(uint8_t reader, const String &cardUID) {
    String accessType = (reader == 0) ? "ENTRANCE" : "EXIT";
    Serial.print(F("ADMIN OVERRIDE ("));
    Serial.print(accessType);
    Serial.println(F(") - gate opening"));

    openServo();
    logManualEntry(accessType, cardUID);
    serviceGate();
  }

  void logManualEntry(const String &accessType, const String &cardUID) {
    FirebaseJson json;
    json.set("timestamp/.sv", "timestamp");
    json.set("reader", "MANUAL");
    json.set("student_id", ADMIN_CARD_ID);
    json.set("card_uid", cardUID);
    json.set("access_type", accessType);
    json.set("granted", true);
    json.set("manual_entry", true);
    json.set("user_type", "admin");
    json.set("reason", "Admin card override");

    if (Firebase.RTDB.pushJSON(&fbdo, "access_logs", &json)) {
      Serial.println("Manual entry logged: " + fbdo.pushName());
    } else {
      Serial.println("Failed to log manual entry: " + fbdo.errorReason());
    }
  }

  void denyAccess(uint8_t reader, const String &accessType, const String &reason,
                  const String &studentID, const String &cardUID) {
    Serial.println(F("ACCESS DENIED"));
    Serial.print(F("Reason: "));
    Serial.println(reason);

    logAccess(reader, studentID, cardUID, accessType, false, reason);
    denyIndicator();
  }

  void openServo() {
    myServo.write(90);
    gateOpen = true;
    gateCloseAt = millis() + GATE_OPEN_MS;  // closed later by serviceGate()
  }

  void denyIndicator() {
    // wala pa hwahadasha
  }
  // RFID
  String readStudentID(uint8_t reader) {
    MFRC522::MIFARE_Key key;
    for (byte i = 0; i < 6; i++) key.keyByte[i] = 0xFF;

    byte block = 4;
    byte len = 18;
    byte buffer[18];
    String studentID = "";

    MFRC522::StatusCode status = mfrc522[reader].PCD_Authenticate(
        MFRC522::PICC_CMD_MF_AUTH_KEY_A, block, &key, &(mfrc522[reader].uid));
    if (status != MFRC522::STATUS_OK) {
      Serial.print(F("Authentication failed: "));
      Serial.println(mfrc522[reader].GetStatusCodeName(status));
      return studentID;
    }

    status = mfrc522[reader].MIFARE_Read(block, buffer, &len);
    if (status != MFRC522::STATUS_OK) {
      Serial.print(F("Reading failed: "));
      Serial.println(mfrc522[reader].GetStatusCodeName(status));
      return studentID;
    }

    for (uint8_t i = 0; i < 16; i++) {
      if (buffer[i] != 0 && buffer[i] != 32) {
        studentID += (char)buffer[i];
      }
    }

    studentID.trim();
    return studentID;
  }

  bool isValidStudentID(String studentID) {
    studentID.trim();
    return (studentID.length() >= 2 && (studentID.startsWith("S") || studentID.startsWith("E")));
  }

  String getUIDString(MFRC522 &reader) {
    String uidStr = "";
    for (byte i = 0; i < reader.uid.size; i++) {
      if (reader.uid.uidByte[i] < 0x10) uidStr += "0";
      uidStr += String(reader.uid.uidByte[i], HEX);
    }
    uidStr.toUpperCase();
    return uidStr;
  }
