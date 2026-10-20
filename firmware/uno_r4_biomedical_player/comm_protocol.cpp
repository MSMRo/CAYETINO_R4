/**
 * Communication Protocol Implementation
 */

#include "comm_protocol.h"
#include <stdlib.h>
#include <string.h>

CommProtocol::CommProtocol(FileStorage& storage, DacPlayer& player)
  : _storage(storage), _player(player) {
}

void CommProtocol::processLine(const char* line, Print& out) {
  // Skip leading whitespace
  while (*line == ' ' || *line == '\t' || *line == '\r' || *line == '\n') line++;
  if (*line == '\0') return;

  if (strncmp(line, "PING", 4) == 0) {
    handlePing(out);
  } else if (strncmp(line, "LIST", 4) == 0) {
    handleList(out);
  } else if (strncmp(line, "WRITE", 5) == 0) {
    handleWrite(line + 5, out);
  } else if (strncmp(line, "PREVIEW", 7) == 0) {
    handlePreview(line + 7, out);
  } else if (strncmp(line, "PRUN", 4) == 0) {
    handlePreviewRun(line + 4, out);
  } else if (line[0] == 'D' && (line[1] == ' ' || line[1] == '\t')) {
    handleData(line + 2, out);
  } else if (strncmp(line, "COMMIT", 6) == 0) {
    handleCommit(out);
  } else if (strncmp(line, "PLAY", 4) == 0) {
    handlePlay(line + 4, out);
  } else if (strncmp(line, "STOP", 4) == 0) {
    handleStop(out);
  } else if (strncmp(line, "STATUS", 6) == 0) {
    handleStatus(out);
  } else if (strncmp(line, "DELETE", 6) == 0) {
    handleDelete(line + 6, out);
  } else {
    out.print("ERR UNKNOWN COMMAND: ");
    out.println(line);
  }
}

void CommProtocol::handlePing(Print& out) {
  out.println("PONG");
}

void CommProtocol::handleList(Print& out) {
  out.print("FILES:");
  uint8_t total = _storage.getTotalFiles();
  for (uint8_t i = 0; i < total; i++) {
    WaveformEntry* entry = _storage.getFile(i);
    if (entry) {
      if (i > 0) out.print("|");
      out.print(entry->name);
      out.print(":");
      out.print(entry->length);
      out.print(":");
      out.print(entry->samplingRate);
      out.print(":");
      out.print(entry->isRom ? "ROM" : "FLASH");
    }
  }
  out.println();
  
  // Real-time Storage Metrics: CAPACITY:<usedSlots>:<maxSlots>:<poolUsed>:<poolMax>
  out.print("CAPACITY:");
  out.print(_storage.getCustomCount());
  out.print(":");
  out.print(MAX_CUSTOM_FILES);
  out.print(":");
  out.print(_storage.getPoolUsed());
  out.print(":");
  out.println(CUSTOM_POOL_SAMPLES);
}

void CommProtocol::handleWrite(const char* args, Print& out) {
  // Args format: <FILENAME> <FS> <TOTAL_SAMPLES>
  char filename[18] = {0};
  int fs = 250;
  int count = 0;

  int parsed = sscanf(args, "%16s %d %d", filename, &fs, &count);
  if (parsed < 3 || count <= 0) {
    out.println("ERR INVALID WRITE PARAMETERS");
    return;
  }

  // Ensure player is stopped before reallocating/writing memory buffers
  _player.stop();

  if (_storage.startWrite(filename, fs, count)) {
    out.println("OK READY");
  } else {
    out.print("ERR WRITE CAPACITY EXCEEDED (MAX ");
    out.print(MAX_SAMPLES_PER_FILE);
    out.println(" SAMPLES)");
  }
}

void CommProtocol::handlePreview(const char* args, Print& out) {
  // Args format: <NAME> <FS> <TOTAL_SAMPLES>
  char name[18] = {0};
  int fs = 250;
  int count = 0;

  int parsed = sscanf(args, "%16s %d %d", name, &fs, &count);
  if (parsed < 3 || count <= 0) {
    out.println("ERR INVALID PREVIEW PARAMETERS");
    return;
  }

  _player.stop();

  if (_storage.startPreviewWrite(name, fs, count)) {
    out.println("OK READY PREVIEW");
  } else {
    out.print("ERR PREVIEW CAPACITY (MAX ");
    out.print(MAX_PREVIEW_SAMPLES);
    out.println(" SAMPLES)");
  }
}

void CommProtocol::handlePreviewRun(const char* args, Print& out) {
  int loop = 1;
  sscanf(args, "%d", &loop);

  if (_storage.commitPreviewWrite()) {
    WaveformEntry* pEntry = _storage.getPreviewEntry();
    if (_player.play(pEntry, loop != 0)) {
      out.print("OK PLAYING PREVIEW ");
      out.println(pEntry->name);
    } else {
      out.println("ERR PREVIEW PLAY FAILED");
    }
  } else {
    out.println("ERR PREVIEW COMMIT FAILED");
  }
}

void CommProtocol::handleData(const char* args, Print& out) {
  // Format: <SEQ> <V1>,<V2>,...
  char* endptr = nullptr;
  long seq = strtol(args, &endptr, 10);
  if (endptr == args) {
    out.println("ERR INVALID DATA SEQ");
    return;
  }

  // Parse comma separated values into local array
  uint16_t samples[32];
  uint16_t sampleCount = 0;

  // Make a local copy to ensure safe strtok mutation
  char localBuf[220];
  strncpy(localBuf, endptr, sizeof(localBuf) - 1);
  localBuf[sizeof(localBuf) - 1] = '\0';

  char* token = strtok(localBuf, " ,\t\r\n");
  while (token != nullptr && sampleCount < 32) {
    int val = atoi(token);
    samples[sampleCount++] = (uint16_t)constrain(val, 0, 4095);
    token = strtok(nullptr, " ,\t\r\n");
  }

  bool ok = false;
  if (_storage.isWriting()) {
    ok = _storage.appendSamples(samples, sampleCount);
  } else if (_storage.isPreviewWriting()) {
    ok = _storage.appendPreviewSamples(samples, sampleCount);
  }

  if (sampleCount > 0 && ok) {
    out.print("ACK ");
    out.println(seq);
  } else {
    out.println("ERR APPEND FAILED");
  }
}

void CommProtocol::handleCommit(Print& out) {
  if (_storage.commitWrite()) {
    out.println("OK SAVED");
  } else {
    out.println("ERR COMMIT FAILED");
  }
}

void CommProtocol::handlePlay(const char* args, Print& out) {
  char filename[18] = {0};
  int loop = 1;
  int parsed = sscanf(args, "%16s %d", filename, &loop);
  if (parsed < 1) {
    out.println("ERR PLAY FILENAME MISSING");
    return;
  }

  WaveformEntry* entry = _storage.findFile(filename);
  if (!entry) {
    out.print("ERR FILE NOT FOUND: ");
    out.println(filename);
    return;
  }

  _storage.setPreviewActive(false);

  if (_player.play(entry, loop != 0)) {
    out.print("OK PLAYING ");
    out.println(entry->name);
  } else {
    out.println("ERR PLAY FAILED");
  }
}

void CommProtocol::handleStop(Print& out) {
  _player.stop();
  _storage.setPreviewActive(false);
  out.println("OK STOPPED");
}

void CommProtocol::handleStatus(Print& out) {
  out.print("STATUS:");
  out.print(_player.isPlaying() ? "PLAYING" : "STOPPED");
  out.print(":");
  const WaveformEntry* active = _player.getActiveFile();
  out.print(active ? active->name : "NONE");
  out.print(":");
  out.print(_player.getCurrentIndex());
  out.print(":");
  out.println(_player.getSampleRate());
}

void CommProtocol::handleDelete(const char* args, Print& out) {
  while (*args == ' ' || *args == '\t') args++;
  if (*args == '\0') {
    out.println("ERR DELETE FILENAME MISSING");
    return;
  }

  char filename[18] = {0};
  sscanf(args, "%16s", filename);

  if (strcasecmp(filename, "ALL") == 0) {
    _player.stop();
    _storage.deleteAllCustomFiles();
    out.println("OK DELETED ALL");
    return;
  }

  // If active file is being deleted, stop playback first
  const WaveformEntry* active = _player.getActiveFile();
  if (active && strcasecmp(active->name, filename) == 0) {
    _player.stop();
  }

  if (_storage.deleteFile(filename)) {
    out.print("OK DELETED ");
    out.println(filename);
  } else {
    out.print("ERR DELETE FAILED: ");
    out.println(filename);
  }
}
