import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/questions_provider.dart';
import '../../widgets/question_card.dart';

void _log(String message) {
  debugPrint('[QuestionsScreen] $message');
}

class QuestionsScreen extends ConsumerWidget {
  const QuestionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final questionsAsync = ref.watch(allQuestionsProvider);
    _log('build: questionsAsync state = ${questionsAsync.isLoading ? "loading" : questionsAsync.hasError ? "error" : "data"}');

    return Scaffold(
      appBar: AppBar(
        title: const Text('Questions'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/home'),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(allQuestionsProvider);
        },
        child: questionsAsync.when(
          loading: () {
            _log('Showing loading state');
            return const Center(child: CircularProgressIndicator());
          },
          error: (error, stack) {
            _log('ERROR: $error');
            _log('STACK: $stack');
            return SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              child: SizedBox(
                height: MediaQuery.of(context).size.height - 150,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.error_outline, size: 48, color: Colors.red),
                        const SizedBox(height: 16),
                        const Text('Error loading questions', style: TextStyle(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        Text(
                          error.toString().length > 300 ? '${error.toString().substring(0, 300)}...' : error.toString(),
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 12),
                        ),
                        const SizedBox(height: 16),
                        const Text('Pull down to retry', style: TextStyle(color: Colors.grey)),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
          data: (questions) {
            if (questions.isEmpty) {
              return SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: SizedBox(
                  height: MediaQuery.of(context).size.height - 150,
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.inbox_outlined,
                          size: 64,
                          color: Theme.of(context).colorScheme.outline,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'No questions yet',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Questions from Claude Code will appear here',
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                color: Theme.of(context).colorScheme.onSurfaceVariant,
                              ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'Pull down to refresh',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: Theme.of(context).colorScheme.outline,
                              ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }

            return ListView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              itemCount: questions.length,
              itemBuilder: (context, index) {
                final question = questions[index];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: QuestionCard(
                    question: question,
                    onTap: () => context.go('/questions/${question.id}'),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
