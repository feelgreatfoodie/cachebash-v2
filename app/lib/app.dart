import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'providers/auth_provider.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/register_screen.dart';
import 'screens/auth/api_key_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/questions/questions_screen.dart';
import 'screens/questions/question_detail_screen.dart';
import 'screens/projects/projects_screen.dart';
import 'screens/projects/project_detail_screen.dart';
import 'screens/settings/settings_screen.dart';
import 'screens/settings/profile_screen.dart';
import 'screens/settings/change_password_screen.dart';
import 'screens/settings/delete_account_screen.dart';
import 'screens/settings/notifications_screen.dart';
import 'screens/sessions/session_detail_screen.dart';
import 'screens/sessions/sessions_screen.dart';
import 'screens/sessions/archived_sessions_screen.dart';
import 'screens/tasks/tasks_screen.dart';
import 'screens/tasks/create_task_screen.dart';
import 'theme/app_theme.dart';
import 'widgets/main_shell.dart';

// Navigator keys for shell routing
final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authStateProvider);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/login',
    redirect: (context, state) {
      final isLoggedIn = authState.valueOrNull != null;
      final isAuthRoute = state.matchedLocation == '/login' ||
          state.matchedLocation == '/register';

      if (!isLoggedIn && !isAuthRoute) {
        return '/login';
      }
      if (isLoggedIn && isAuthRoute) {
        return '/home';
      }
      return null;
    },
    routes: [
      // Auth routes (no bottom nav)
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/api-key',
        builder: (context, state) => const ApiKeyScreen(),
      ),

      // Main shell with bottom nav - ALL authenticated routes go here
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (context, state, child) {
          return MainShellWrapper(child: child);
        },
        routes: [
          // Home
          GoRoute(
            path: '/home',
            builder: (context, state) => const HomeScreen(),
          ),
          // Questions
          GoRoute(
            path: '/questions',
            builder: (context, state) => const QuestionsScreen(),
          ),
          GoRoute(
            path: '/questions/:id',
            builder: (context, state) {
              final questionId = state.pathParameters['id']!;
              return QuestionDetailScreen(questionId: questionId);
            },
          ),
          // Sessions
          GoRoute(
            path: '/sessions',
            builder: (context, state) => const SessionsScreen(),
          ),
          GoRoute(
            path: '/sessions/archived',
            builder: (context, state) => const ArchivedSessionsScreen(),
          ),
          GoRoute(
            path: '/sessions/:id',
            builder: (context, state) {
              final sessionId = state.pathParameters['id']!;
              return SessionDetailScreen(sessionId: sessionId);
            },
          ),
          // Tasks
          GoRoute(
            path: '/tasks',
            builder: (context, state) => const TasksScreen(),
          ),
          GoRoute(
            path: '/tasks/new',
            builder: (context, state) => const CreateTaskScreen(),
          ),
          // Projects
          GoRoute(
            path: '/projects',
            builder: (context, state) => const ProjectsScreen(),
          ),
          GoRoute(
            path: '/projects/:id',
            builder: (context, state) {
              final projectId = state.pathParameters['id']!;
              return ProjectDetailScreen(projectId: projectId);
            },
          ),
          // Settings
          GoRoute(
            path: '/settings',
            builder: (context, state) => const SettingsScreen(),
          ),
          GoRoute(
            path: '/settings/profile',
            builder: (context, state) => const ProfileScreen(),
          ),
          GoRoute(
            path: '/settings/change-password',
            builder: (context, state) => const ChangePasswordScreen(),
          ),
          GoRoute(
            path: '/settings/delete-account',
            builder: (context, state) => const DeleteAccountScreen(),
          ),
          GoRoute(
            path: '/settings/notifications',
            builder: (context, state) => const NotificationsScreen(),
          ),
        ],
      ),
    ],
  );
});

class CacheBashApp extends ConsumerWidget {
  const CacheBashApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'CacheBash',
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.dark,
      routerConfig: router,
    );
  }
}
