import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'providers/auth_provider.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/register_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/messages/messages_screen.dart';
import 'screens/questions/questions_screen.dart';
import 'screens/scheduled/scheduled_screen.dart';
import 'screens/sessions/sessions_screen.dart';
import 'screens/settings/settings_screen.dart';
import 'screens/tasks/tasks_screen.dart';
import 'services/fcm_service.dart';
import 'theme/app_theme.dart';
import 'widgets/main_shell.dart';

/// Root application widget with routing and theme configuration
class CacheBashApp extends ConsumerStatefulWidget {
  const CacheBashApp({super.key});

  @override
  ConsumerState<CacheBashApp> createState() => _CacheBashAppState();
}

class _CacheBashAppState extends ConsumerState<CacheBashApp> {
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();

    // Router configuration with auth-aware redirects
    _router = GoRouter(
      initialLocation: '/home',
      redirect: (context, state) {
        // Check auth state for protected routes
        final user = ref.read(currentUserProvider);
        final isAuthRoute = state.matchedLocation.startsWith('/login') ||
            state.matchedLocation.startsWith('/register');

        if (user == null && !isAuthRoute) {
          return '/login';
        }
        if (user != null && isAuthRoute) {
          return '/home';
        }
        return null;
      },
      routes: [
        GoRoute(
          path: '/login',
          builder: (context, state) => const LoginScreen(),
        ),
        GoRoute(
          path: '/register',
          builder: (context, state) => const RegisterScreen(),
        ),
        ShellRoute(
          builder: (context, state, child) => MainShell(child: child),
          routes: [
            GoRoute(
              path: '/home',
              builder: (context, state) => const HomeScreen(),
            ),
            GoRoute(
              path: '/tasks',
              builder: (context, state) => const TasksScreen(),
            ),
            GoRoute(
              path: '/messages',
              builder: (context, state) => const MessagesScreen(),
            ),
            GoRoute(
              path: '/sessions',
              builder: (context, state) => const SessionsScreen(),
            ),
            GoRoute(
              path: '/questions',
              builder: (context, state) => const QuestionsScreen(),
            ),
            GoRoute(
              path: '/scheduled',
              builder: (context, state) => const ScheduledScreen(),
            ),
            GoRoute(
              path: '/settings',
              builder: (context, state) => const SettingsScreen(),
            ),
          ],
        ),
      ],
    );

    // Initialize FCM after router is available for deep link handling
    WidgetsBinding.instance.addPostFrameCallback((_) {
      FCMService.initialize(ref);
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'CacheBash',
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.dark,
      routerConfig: _router,
      debugShowCheckedModeBanner: false,
    );
  }
}
