import 'package:firebase_auth/firebase_auth.dart';
import 'logger_service.dart';

const _tag = 'AuthService';

/// Firebase Auth wrapper service
class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;

  /// Stream of auth state changes
  Stream<User?> get authStateChanges => _auth.authStateChanges();

  /// Current user
  User? get currentUser => _auth.currentUser;

  /// Sign in with email and password
  Future<UserCredential> signInWithEmail({
    required String email,
    required String password,
  }) async {
    Log.d(_tag, 'signInWithEmail: $email');
    try {
      final result = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
      Log.d(_tag, 'signInWithEmail: Success, uid=${result.user?.uid}');
      return result;
    } catch (e, stack) {
      Log.e(_tag, 'signInWithEmail failed', e, stack);
      rethrow;
    }
  }

  /// Create a new account with email and password
  Future<UserCredential> createAccount({
    required String email,
    required String password,
  }) async {
    Log.d(_tag, 'createAccount: $email');
    try {
      final result = await _auth.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );
      Log.d(_tag, 'createAccount: Success, uid=${result.user?.uid}');
      return result;
    } catch (e, stack) {
      Log.e(_tag, 'createAccount failed', e, stack);
      rethrow;
    }
  }

  /// Sign out
  Future<void> signOut() async {
    Log.d(_tag, 'signOut');
    try {
      await _auth.signOut();
      Log.d(_tag, 'signOut: Success');
    } catch (e, stack) {
      Log.e(_tag, 'signOut failed', e, stack);
      rethrow;
    }
  }

  /// Send password reset email
  Future<void> sendPasswordResetEmail(String email) async {
    Log.d(_tag, 'sendPasswordResetEmail: $email');
    try {
      await _auth.sendPasswordResetEmail(email: email);
      Log.d(_tag, 'sendPasswordResetEmail: Success');
    } catch (e, stack) {
      Log.e(_tag, 'sendPasswordResetEmail failed', e, stack);
      rethrow;
    }
  }

  /// Delete current user account
  Future<void> deleteAccount() async {
    Log.d(_tag, 'deleteAccount');
    try {
      await _auth.currentUser?.delete();
      Log.d(_tag, 'deleteAccount: Success');
    } catch (e, stack) {
      Log.e(_tag, 'deleteAccount failed', e, stack);
      rethrow;
    }
  }
}
