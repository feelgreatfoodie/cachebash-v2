import 'package:flutter/material.dart';

/// Application color palette with semantic color definitions
///
/// Status colors indicate agent state, priority colors show urgency levels.
class AppColors {
  // Primary brand color
  static const Color primary = Color(0xFF2196F3);

  // Status colors for session states
  static const Color statusWorking = Color(0xFF4CAF50); // Green
  static const Color statusBlocked = Color(0xFFFF9800); // Orange
  static const Color statusComplete = Color(0xFF2196F3); // Blue
  static const Color statusFailed = Color(0xFFF44336); // Red
  static const Color statusPinned = Color(0xFF9C27B0); // Purple

  // Priority colors for tasks and messages
  static const Color priorityHigh = Color(0xFFF44336); // Red
  static const Color priorityNormal = Color(0xFF2196F3); // Blue
  static const Color priorityLow = Color(0xFF9E9E9E); // Grey

  // Message type colors
  static const Color messageDirective = Color(0xFFFF9800); // Orange
  static const Color messageStatus = Color(0xFF2196F3); // Blue
  static const Color messageQuery = Color(0xFF9C27B0); // Purple
  static const Color messageResult = Color(0xFF4CAF50); // Green
}
