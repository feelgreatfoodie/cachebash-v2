import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:crypto/crypto.dart';

import 'secure_storage_service.dart';
import 'logger_service.dart';

const _tag = 'ApiKeyService';

/// Service for API key generation, hashing, and management
class ApiKeyService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final SecureStorageService _secureStorage = SecureStorageService();

  /// Generate a new 256-bit (32-byte) API key
  String generateApiKey() {
    Log.d(_tag, 'generateApiKey: Creating new 256-bit key');
    final random = Random.secure();
    final bytes = Uint8List(32);
    for (var i = 0; i < 32; i++) {
      bytes[i] = random.nextInt(256);
    }
    // Encode as base64url for safe transport and storage
    final key = base64Url.encode(bytes);
    Log.d(_tag, 'generateApiKey: Key generated (${key.length} chars)');
    return key;
  }

  /// Hash an API key using SHA-256
  String hashApiKey(String apiKey) {
    final bytes = utf8.encode(apiKey);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  /// Generate a new API key, store it locally and save hash to Firestore
  Future<String> createAndStoreApiKey(String userId) async {
    Log.d(_tag, 'createAndStoreApiKey: Starting for user $userId');

    // Generate new key
    final apiKey = generateApiKey();
    final keyHash = hashApiKey(apiKey);
    Log.d(_tag, 'createAndStoreApiKey: Key hash: ${keyHash.substring(0, 8)}...');

    // Store plaintext locally
    Log.d(_tag, 'createAndStoreApiKey: Storing key locally...');
    await _secureStorage.storeApiKey(apiKey);
    Log.d(_tag, 'createAndStoreApiKey: Local storage complete');

    // Store hash in Firestore user document (use set with merge in case doc doesn't exist)
    Log.d(_tag, 'createAndStoreApiKey: Writing to users/$userId...');
    try {
      await _firestore.doc('users/$userId').set({
        'apiKeyHash': keyHash,
        'apiKeyUpdatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      Log.d(_tag, 'createAndStoreApiKey: User doc write complete');
    } catch (e, stack) {
      Log.e(_tag, 'createAndStoreApiKey: User doc write FAILED', e, stack);
      rethrow;
    }

    // Also store in apiKeys collection for MCP server lookup
    Log.d(_tag, 'createAndStoreApiKey: Writing to apiKeys/$keyHash...');
    try {
      await _firestore.doc('apiKeys/$keyHash').set({
        'userId': userId,
        'createdAt': FieldValue.serverTimestamp(),
      });
      Log.d(_tag, 'createAndStoreApiKey: apiKeys write complete');
    } catch (e, stack) {
      Log.e(_tag, 'createAndStoreApiKey: apiKeys write FAILED', e, stack);
      rethrow;
    }

    Log.i(_tag, 'createAndStoreApiKey: SUCCESS - API key created and stored');
    return apiKey;
  }

  /// Get the locally stored API key
  Future<String?> getStoredApiKey() async {
    Log.d(_tag, 'getStoredApiKey: Retrieving from local storage');
    final key = await _secureStorage.getApiKey();
    Log.d(_tag, 'getStoredApiKey: ${key != null ? "Found" : "Not found"}');
    return key;
  }

  /// Check if user has an API key
  Future<bool> hasApiKey() async {
    final has = await _secureStorage.hasApiKey();
    Log.d(_tag, 'hasApiKey: $has');
    return has;
  }

  /// Regenerate API key (invalidates old key)
  Future<String> regenerateApiKey(String userId) async {
    Log.i(_tag, 'regenerateApiKey: Starting for $userId');

    // Get old hash to delete
    Log.d(_tag, 'regenerateApiKey: Fetching user doc...');
    try {
      final userDoc = await _firestore.doc('users/$userId').get();
      Log.d(_tag, 'regenerateApiKey: User doc fetched, exists: ${userDoc.exists}');
      final oldHash = userDoc.data()?['apiKeyHash'] as String?;
      Log.d(_tag, 'regenerateApiKey: Old hash: ${oldHash != null ? "${oldHash.substring(0, 8)}..." : "none"}');

      // Delete old key from apiKeys collection (best effort - may fail if old doc has different permissions)
      if (oldHash != null) {
        Log.d(_tag, 'regenerateApiKey: Deleting old apiKey doc...');
        try {
          await _firestore.doc('apiKeys/$oldHash').delete();
          Log.d(_tag, 'regenerateApiKey: Old apiKey deleted');
        } catch (e) {
          // Ignore delete errors - old key will just be orphaned but won't match new hash
          Log.w(_tag, 'regenerateApiKey: Could not delete old apiKey (ignoring): $e');
        }
      }
    } catch (e, stack) {
      Log.e(_tag, 'regenerateApiKey: Fetch user doc FAILED', e, stack);
      rethrow;
    }

    // Delete local key
    Log.d(_tag, 'regenerateApiKey: Deleting local key...');
    await _secureStorage.deleteApiKey();
    Log.d(_tag, 'regenerateApiKey: Local key deleted');

    // Create new key
    Log.d(_tag, 'regenerateApiKey: Creating new key...');
    return await createAndStoreApiKey(userId);
  }

  /// Validate that an API key matches the stored hash
  Future<bool> validateApiKey(String apiKey, String userId) async {
    Log.d(_tag, 'validateApiKey: Validating for user $userId');
    final keyHash = hashApiKey(apiKey);
    final userDoc = await _firestore.doc('users/$userId').get();
    final storedHash = userDoc.data()?['apiKeyHash'] as String?;
    final valid = storedHash != null && storedHash == keyHash;
    Log.d(_tag, 'validateApiKey: ${valid ? "Valid" : "Invalid"}');
    return valid;
  }
}
