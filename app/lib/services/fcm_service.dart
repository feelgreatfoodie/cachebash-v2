import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'logger_service.dart';

const _tag = 'FcmService';

/// Service for Firebase Cloud Messaging (FCM) token management
class FcmService {
  static final FcmService instance = FcmService._();

  FcmService._();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;

  String? _currentToken;

  /// Initialize FCM and request permissions
  Future<void> initialize() async {
    // Skip FCM on desktop platforms
    if (Platform.isMacOS || Platform.isWindows || Platform.isLinux) {
      Log.d(_tag, 'initialize: Skipping - not supported on desktop');
      return;
    }

    Log.d(_tag, 'initialize: Requesting permissions...');
    // Request permission (iOS and web)
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    Log.d(_tag, 'initialize: Permission status: ${settings.authorizationStatus}');

    if (settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional) {
      await _setupToken();
      _setupTokenRefresh();
      _setupForegroundHandler();
      Log.i(_tag, 'initialize: SUCCESS - FCM initialized');
    } else {
      Log.w(_tag, 'initialize: Permission denied');
    }
  }

  /// Get and store FCM token
  Future<void> _setupToken() async {
    Log.d(_tag, '_setupToken: Getting token...');
    try {
      _currentToken = await _messaging.getToken();
      if (_currentToken != null) {
        Log.d(_tag, '_setupToken: Token received: ${_currentToken!.substring(0, 20)}...');
        await _saveTokenToFirestore(_currentToken!);
      } else {
        Log.w(_tag, '_setupToken: Token is null');
      }
    } catch (e, stack) {
      Log.e(_tag, '_setupToken: Failed to get token', e, stack);
    }
  }

  /// Listen for token refresh
  void _setupTokenRefresh() {
    Log.d(_tag, '_setupTokenRefresh: Setting up listener');
    _messaging.onTokenRefresh.listen((newToken) async {
      Log.d(_tag, 'onTokenRefresh: Token refreshed');
      // Delete old token document if exists
      if (_currentToken != null) {
        await _deleteTokenFromFirestore(_currentToken!);
      }
      _currentToken = newToken;
      await _saveTokenToFirestore(newToken);
    });
  }

  /// Handle foreground messages
  void _setupForegroundHandler() {
    Log.d(_tag, '_setupForegroundHandler: Setting up listener');
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      Log.d(_tag, 'onMessage: Received - id=${message.messageId}, title=${message.notification?.title}');
    });
  }

  /// Save FCM token to Firestore
  Future<void> _saveTokenToFirestore(String token) async {
    final user = _auth.currentUser;
    if (user == null) {
      Log.w(_tag, '_saveTokenToFirestore: No user logged in');
      return;
    }

    final deviceId = _getDeviceId(token);
    String platform = 'unknown';
    if (Platform.isIOS) platform = 'ios';
    if (Platform.isAndroid) platform = 'android';
    if (Platform.isMacOS) platform = 'macos';

    Log.d(_tag, '_saveTokenToFirestore: Saving device $deviceId ($platform)');
    try {
      await _firestore.doc('users/${user.uid}/devices/$deviceId').set({
        'fcmToken': token,
        'platform': platform,
        'lastSeen': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      Log.d(_tag, '_saveTokenToFirestore: Success');
    } catch (e, stack) {
      Log.e(_tag, '_saveTokenToFirestore: Failed', e, stack);
    }
  }

  /// Delete FCM token from Firestore
  Future<void> _deleteTokenFromFirestore(String token) async {
    final user = _auth.currentUser;
    if (user == null) {
      Log.w(_tag, '_deleteTokenFromFirestore: No user logged in');
      return;
    }

    final deviceId = _getDeviceId(token);
    Log.d(_tag, '_deleteTokenFromFirestore: Deleting device $deviceId');
    try {
      await _firestore.doc('users/${user.uid}/devices/$deviceId').delete();
      Log.d(_tag, '_deleteTokenFromFirestore: Success');
    } catch (e, stack) {
      Log.e(_tag, '_deleteTokenFromFirestore: Failed', e, stack);
    }
  }

  /// Generate device ID from token (first 16 chars of token hash)
  String _getDeviceId(String token) {
    return token.hashCode.toRadixString(16).padLeft(16, '0').substring(0, 16);
  }

  /// Update token when user logs in
  Future<void> onUserLogin() async {
    Log.d(_tag, 'onUserLogin: Called');
    if (_currentToken != null) {
      await _saveTokenToFirestore(_currentToken!);
    } else {
      Log.d(_tag, 'onUserLogin: No token to save');
    }
  }

  /// Remove token when user logs out
  Future<void> onUserLogout() async {
    Log.d(_tag, 'onUserLogout: Called');
    if (_currentToken != null) {
      await _deleteTokenFromFirestore(_currentToken!);
    } else {
      Log.d(_tag, 'onUserLogout: No token to delete');
    }
  }

  /// Get current token
  String? get currentToken => _currentToken;
}
