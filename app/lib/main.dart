import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'firebase_options.dart';

/// Background message handler must be top-level function
/// FCM invokes this when app is terminated or backgrounded
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  if (kDebugMode) {
    print('Background message: ${message.messageId}');
  }
}

void main() async {
  // Zone guard catches async errors that escape widget tree
  runZonedGuarded(
    () async {
      WidgetsFlutterBinding.ensureInitialized();

      // Initialize Firebase with platform-specific options
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );

      // Register background message handler before any FCM interaction
      FirebaseMessaging.onBackgroundMessage(
        _firebaseMessagingBackgroundHandler,
      );

      // Riverpod wrapper enables global state management
      runApp(
        const ProviderScope(
          child: CacheBashApp(),
        ),
      );
    },
    (error, stack) {
      // Production apps should send to crash reporting service
      if (kDebugMode) {
        print('Uncaught error: $error\n$stack');
      }
    },
  );
}
