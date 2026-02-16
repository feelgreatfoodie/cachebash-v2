import 'package:flutter/material.dart';

/// Scheduled screen showing autonomous scheduled task definitions
///
/// This displays scheduled work configurations without exposing
/// internal implementation details.
class ScheduledScreen extends StatelessWidget {
  const ScheduledScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // Placeholder implementation for portfolio demonstration
    // In production, this would connect to a Firestore collection
    // watching scheduled task definitions
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scheduled Tasks'),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.schedule, size: 64, color: Colors.grey),
            const SizedBox(height: 16),
            Text(
              'No scheduled tasks configured',
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurface.withOpacity(0.6),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Scheduled tasks run autonomously on a defined cadence',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey,
                  ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
