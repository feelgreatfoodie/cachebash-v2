import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Service for secure local storage using flutter_secure_storage
/// Falls back to in-memory storage on desktop platforms for development
class SecureStorageService {
  static const _apiKeyKey = 'cachebash_api_key';

  final FlutterSecureStorage? _storage;

  // In-memory fallback for desktop
  final Map<String, String> _memoryStorage = {};
  final bool _useMemoryStorage;

  SecureStorageService()
      : _useMemoryStorage = Platform.isMacOS || Platform.isWindows || Platform.isLinux,
        _storage = (Platform.isMacOS || Platform.isWindows || Platform.isLinux)
            ? null
            : const FlutterSecureStorage(
                aOptions: AndroidOptions(
                  encryptedSharedPreferences: true,
                ),
                iOptions: IOSOptions(
                  accessibility: KeychainAccessibility.first_unlock_this_device,
                ),
              ) {
    if (_useMemoryStorage) {
      debugPrint('SecureStorage: Using in-memory storage for desktop');
    }
  }

  /// Store the API key securely
  Future<void> storeApiKey(String apiKey) async {
    if (_useMemoryStorage) {
      _memoryStorage[_apiKeyKey] = apiKey;
      return;
    }
    await _storage!.write(key: _apiKeyKey, value: apiKey);
  }

  /// Retrieve the stored API key
  Future<String?> getApiKey() async {
    if (_useMemoryStorage) {
      return _memoryStorage[_apiKeyKey];
    }
    return await _storage!.read(key: _apiKeyKey);
  }

  /// Delete the stored API key
  Future<void> deleteApiKey() async {
    if (_useMemoryStorage) {
      _memoryStorage.remove(_apiKeyKey);
      return;
    }
    await _storage!.delete(key: _apiKeyKey);
  }

  /// Check if an API key is stored
  Future<bool> hasApiKey() async {
    if (_useMemoryStorage) {
      final key = _memoryStorage[_apiKeyKey];
      return key != null && key.isNotEmpty;
    }
    final key = await _storage!.read(key: _apiKeyKey);
    return key != null && key.isNotEmpty;
  }

  /// Clear all stored data
  Future<void> clearAll() async {
    if (_useMemoryStorage) {
      _memoryStorage.clear();
      return;
    }
    await _storage!.deleteAll();
  }
}
