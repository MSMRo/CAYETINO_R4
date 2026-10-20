/**
 * Communication Protocol Parser for Cayetino R4
 * Handles incoming commands from USB Serial and BLE.
 */

#pragma once
#include <Arduino.h>
#include "file_storage.h"
#include "dac_player.h"

class CommProtocol {
public:
  CommProtocol(FileStorage& storage, DacPlayer& player);
  
  // Feed a line of text received from Serial or BLE
  void processLine(const char* line, Print& responseStream);

private:
  FileStorage& _storage;
  DacPlayer& _player;

  void handlePing(Print& out);
  void handleList(Print& out);
  void handleWrite(const char* args, Print& out);
  void handleData(const char* args, Print& out);
  void handleCommit(Print& out);
  void handlePlay(const char* args, Print& out);
  void handleStop(Print& out);
  void handleStatus(Print& out);
};
