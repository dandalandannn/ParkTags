#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN   5
#define RST_PIN  22
#define SCK_PIN  18
#define MISO_PIN 19
#define MOSI_PIN 23

const byte DATA_BLOCK = 4;                   
const unsigned long WAIT_TIMEOUT_MS = 15000; 
const unsigned long SCAN_COOLDOWN_MS = 1000;   

MFRC522 mfrc522(SS_PIN, RST_PIN);
MFRC522::MIFARE_Key key;

enum Mode { IDLE, WAIT_READ, WAIT_WRITE, WAIT_RESET, SCAN };
Mode mode = IDLE;
String pendingId = "";
unsigned long modeStarted = 0;
unsigned long lastScanMs = 0;
String inputLine = "";

void setup() {
  Serial.begin(115200);
  SPI.begin(SCK_PIN, MISO_PIN, MOSI_PIN, SS_PIN);
  mfrc522.PCD_Init();

  for (byte i = 0; i < 6; i++) key.keyByte[i] = 0xFF;

  Serial.println("READY|ESP32 RFID");
}

void loop() {
  readSerial();

  if (mode == IDLE) return;

  if (mode == SCAN) {
    if (millis() - lastScanMs < SCAN_COOLDOWN_MS) return;
  } else if (millis() - modeStarted > WAIT_TIMEOUT_MS) {
    mode = IDLE;
    Serial.println("STATUS|ERROR:Timed out waiting for a card.");
    return;
  }

  if (!mfrc522.PICC_IsNewCardPresent()) return;
  if (!mfrc522.PICC_ReadCardSerial()) return;

  handleCard();

  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();

  if (mode == SCAN) lastScanMs = millis();
  else mode = IDLE;
}

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
    Serial.println("READY|PONG");

  } else if (cmd == "READ") {
    mode = WAIT_READ;
    modeStarted = millis();
    Serial.println("STATUS|WAITING_READ");

  } else if (cmd == "RESET") {
    pendingId = "";
    mode = WAIT_RESET;
    modeStarted = millis();
    Serial.println("STATUS|WAITING_RESET");

  } else if (cmd == "SCAN") {
    pendingId = "";
    mode = SCAN;
    modeStarted = millis();
    lastScanMs = 0;
    Serial.println("STATUS|WAITING_SCAN");

  } else if (cmd == "STOP") {
    pendingId = "";
    mode = IDLE;
    Serial.println("STATUS|STOPPED");

  } else if (cmd.startsWith("WRITE:")) {
    String id = cmd.substring(6);

    if (id.length() < 1 || id.length() > 16 ||
        id.indexOf('|') >= 0) {
      Serial.println("STATUS|ERROR:Invalid student ID.");
      return;
    }

    pendingId = id;
    mode = WAIT_WRITE;
    modeStarted = millis();
    Serial.println("STATUS|WAITING_WRITE");

  } else {
    Serial.println("STATUS|ERROR:Unknown command.");
  }
}

String uidToString() {
  String s = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) s += "0";
    s += String(mfrc522.uid.uidByte[i], HEX);
  }
  s.toUpperCase();
  return s;
}

void sendResult(const char *op, const String &uid, const String &id,
                bool ok, const char *msg) {
  Serial.print("RESULT|");
  Serial.print(op);
  Serial.print("|");
  Serial.print(uid);
  Serial.print("|");
  Serial.print(id);
  Serial.print("|");
  Serial.print(ok ? "OK" : "ERROR");
  Serial.print("|");
  Serial.println(msg);
}

bool readBlock(String &out, const char **err) {
  byte buffer[18];
  byte size = sizeof(buffer);

  MFRC522::StatusCode st = mfrc522.PCD_Authenticate(
      MFRC522::PICC_CMD_MF_AUTH_KEY_A, DATA_BLOCK, &key, &(mfrc522.uid));
  if (st != MFRC522::STATUS_OK) {
    *err = "Authentication failed (card may use a different key).";
    return false;
  }

  st = mfrc522.MIFARE_Read(DATA_BLOCK, buffer, &size);
  if (st != MFRC522::STATUS_OK) {
    *err = "Could not read block 4.";
    return false;
  }

  out = "";
  for (byte i = 0; i < 16; i++) {
    if (buffer[i] == 0) break;
    if (buffer[i] >= 32 && buffer[i] <= 126) out += (char)buffer[i];
  }
  return true;
}
void handleScan(const String &uid) {
  MFRC522::PICC_Type type = mfrc522.PICC_GetType(mfrc522.uid.sak);
  bool classic = (type == MFRC522::PICC_TYPE_MIFARE_MINI ||
                  type == MFRC522::PICC_TYPE_MIFARE_1K ||
                  type == MFRC522::PICC_TYPE_MIFARE_4K);

  String stored = "";
  const char *err = "";

  if (!classic) {
    sendResult("SCAN", uid, "", true, "Card detected (UID only, not a MIFARE Classic card).");
  } else if (!readBlock(stored, &err)) {
    sendResult("SCAN", uid, "", true, "Card detected (user ID could not be read).");
  } else if (stored.length() == 0) {
    sendResult("SCAN", uid, "", true, "Card detected (no user ID stored).");
  } else {
    sendResult("SCAN", uid, stored, true, "Card read successfully.");
  }
}

void handleCard() {
  String uid = uidToString();

  if (mode == SCAN) {
    handleScan(uid);
    return;
  }

  MFRC522::PICC_Type type = mfrc522.PICC_GetType(mfrc522.uid.sak);
  if (type != MFRC522::PICC_TYPE_MIFARE_MINI &&
      type != MFRC522::PICC_TYPE_MIFARE_1K &&
      type != MFRC522::PICC_TYPE_MIFARE_4K) {
    sendResult(mode == WAIT_WRITE ? "WRITE" : "READ", uid, "", false,
               "Unsupported card type. Use a MIFARE Classic card.");
    return;
  }

  const char *err = "";

  if (mode == WAIT_READ) {
    String stored;
    if (readBlock(stored, &err)) {
      if (stored.length() > 0)
        sendResult("READ", uid, stored, true, "Card read successfully.");
      else
        sendResult("READ", uid, "", true, "Card is blank (no student ID stored).");
    } else {
      sendResult("READ", uid, "", false, err);
    }
    return;
  }

  if (mode == WAIT_RESET) {
    byte data[16] = {0};

    MFRC522::StatusCode st = mfrc522.PCD_Authenticate(
        MFRC522::PICC_CMD_MF_AUTH_KEY_A,
        DATA_BLOCK,
        &key,
        &(mfrc522.uid)
    );

    if (st != MFRC522::STATUS_OK) {
      sendResult("RESET", uid, "", false,
                 "Authentication failed (card may use a different key).");
      return;
    }

    st = mfrc522.MIFARE_Write(DATA_BLOCK, data, 16);

    if (st != MFRC522::STATUS_OK) {
      sendResult("RESET", uid, "", false,
                 "Reset failed. Keep the card steady.");
      return;
    }

    String verify;

    if (readBlock(verify, &err) && verify.length() == 0) {
      sendResult("RESET", uid, "", true,
                 "Student ID erased successfully.");
    } else {
      sendResult("RESET", uid, verify, false,
                 "Reset verification failed.");
    }

    return;
  }

  byte data[16];
  memset(data, 0, sizeof(data));
  for (byte i = 0; i < pendingId.length() && i < 16; i++) {
    data[i] = (byte)pendingId[i];
  }

  MFRC522::StatusCode st = mfrc522.PCD_Authenticate(
      MFRC522::PICC_CMD_MF_AUTH_KEY_A, DATA_BLOCK, &key, &(mfrc522.uid));
  if (st != MFRC522::STATUS_OK) {
    sendResult("WRITE", uid, "", false,
               "Authentication failed (card may use a different key).");
    return;
  }

  st = mfrc522.MIFARE_Write(DATA_BLOCK, data, 16);
  if (st != MFRC522::STATUS_OK) {
    sendResult("WRITE", uid, "", false, "Write failed. Keep the card steady.");
    return;
  }

  String verify;
  if (readBlock(verify, &err) && verify == pendingId) {
    sendResult("WRITE", uid, verify, true, "Student ID written and verified.");
  } else {
    sendResult("WRITE", uid, verify, false, "Write verification failed.");
  }
}
