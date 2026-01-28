import 'package:flutter/foundation.dart';

/// Simple logging service for debugging
/// Can be extended later with log levels, file logging, etc.
class Log {
  static void d(String tag, String message) {
    if (kDebugMode) {
      print('[$tag] $message');
    }
  }

  static void i(String tag, String message) {
    print('[$tag] INFO: $message');
  }

  static void w(String tag, String message) {
    print('[$tag] WARN: $message');
  }

  static void e(String tag, String message, [Object? error, StackTrace? stack]) {
    print('[$tag] ERROR: $message');
    if (error != null) {
      print('[$tag] Exception: $error');
    }
    if (stack != null && kDebugMode) {
      print('[$tag] Stack: $stack');
    }
  }
}
