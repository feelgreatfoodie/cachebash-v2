import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/questions_provider.dart';

/// Main navigation shell with bottom navigation bar
///
/// Wraps authenticated screens in a persistent navigation scaffold.
/// Badge count shows pending questions requiring user attention.
class MainShell extends ConsumerStatefulWidget {
  const MainShell({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell> {
  int _selectedIndex = 0;

  final List<_NavDestination> _destinations = const [
    _NavDestination(
      label: 'Home',
      icon: Icons.home_outlined,
      selectedIcon: Icons.home,
      route: '/home',
    ),
    _NavDestination(
      label: 'Sessions',
      icon: Icons.hub_outlined,
      selectedIcon: Icons.hub,
      route: '/sessions',
    ),
    _NavDestination(
      label: 'Questions',
      icon: Icons.help_outline,
      selectedIcon: Icons.help,
      route: '/questions',
    ),
    _NavDestination(
      label: 'Messages',
      icon: Icons.message_outlined,
      selectedIcon: Icons.message,
      route: '/messages',
    ),
    _NavDestination(
      label: 'Settings',
      icon: Icons.settings_outlined,
      selectedIcon: Icons.settings,
      route: '/settings',
    ),
  ];

  void _onDestinationSelected(int index) {
    setState(() => _selectedIndex = index);
    context.go(_destinations[index].route);
  }

  @override
  Widget build(BuildContext context) {
    final pendingQuestions = ref.watch(pendingQuestionCountProvider);

    return Scaffold(
      body: widget.child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedIndex,
        onDestinationSelected: _onDestinationSelected,
        destinations: _destinations.map((dest) {
          // Show badge on Questions tab if there are pending questions
          final showBadge = dest.route == '/questions' && pendingQuestions > 0;

          return NavigationDestination(
            icon: showBadge
                ? Badge(
                    label: Text(pendingQuestions.toString()),
                    child: Icon(dest.icon),
                  )
                : Icon(dest.icon),
            selectedIcon: showBadge
                ? Badge(
                    label: Text(pendingQuestions.toString()),
                    child: Icon(dest.selectedIcon),
                  )
                : Icon(dest.selectedIcon),
            label: dest.label,
          );
        }).toList(),
      ),
    );
  }
}

class _NavDestination {
  const _NavDestination({
    required this.label,
    required this.icon,
    required this.selectedIcon,
    required this.route,
  });

  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final String route;
}
