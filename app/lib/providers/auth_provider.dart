import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Stream provider watching Firebase Auth state changes
///
/// Rebuilds dependent widgets when user signs in/out.
/// Use this for auth-aware navigation and conditional UI.
final authStateProvider = StreamProvider<User?>((ref) {
  return FirebaseAuth.instance.authStateChanges();
});

/// Synchronous provider for current user snapshot
///
/// Returns null if user is not authenticated.
/// Prefer this over authStateProvider when you need immediate access
/// without rebuilding on every auth state change.
final currentUserProvider = Provider<User?>((ref) {
  return FirebaseAuth.instance.currentUser;
});
