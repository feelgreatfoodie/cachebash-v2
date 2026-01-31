import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/message_model.dart';
import '../services/encryption_service.dart';
import 'auth_provider.dart';

final _firestore = FirebaseFirestore.instance;

void _log(String message) {
  debugPrint('[MessagesProvider] $message');
}

/// Combines two streams into a single stream that emits a tuple when either stream emits.
/// Uses the latest value from each stream (combineLatest pattern).
Stream<(QuerySnapshot<Map<String, dynamic>>, QuerySnapshot<Map<String, dynamic>>)> _combineStreams(
  Stream<QuerySnapshot<Map<String, dynamic>>> stream1,
  Stream<QuerySnapshot<Map<String, dynamic>>> stream2,
) async* {
  QuerySnapshot<Map<String, dynamic>>? latest1;
  QuerySnapshot<Map<String, dynamic>>? latest2;

  await for (final event in _mergeStreams(
    stream1.map((s) => (1, s)),
    stream2.map((s) => (2, s)),
  )) {
    if (event.$1 == 1) {
      latest1 = event.$2;
    } else {
      latest2 = event.$2;
    }
    // Only emit when we have values from both streams
    if (latest1 != null && latest2 != null) {
      yield (latest1, latest2);
    }
  }
}

/// Merges two streams into one, preserving the order of emissions.
Stream<T> _mergeStreams<T>(Stream<T> stream1, Stream<T> stream2) async* {
  final controller = StreamController<T>();

  stream1.listen(
    controller.add,
    onError: controller.addError,
    onDone: () {},
  );
  stream2.listen(
    controller.add,
    onError: controller.addError,
    onDone: () {},
  );

  await for (final event in controller.stream) {
    yield event;
  }
}

/// Helper to decrypt a list of message documents
Future<List<MessageModel>> _decryptMessages(
  List<QueryDocumentSnapshot> docs,
  EncryptionService encryptionService,
) async {
  return await Future.wait(
    docs.map((doc) => MessageModel.fromFirestoreDecrypted(doc, encryptionService)),
  );
}

/// Helper to convert legacy /questions documents to MessageModel
Future<MessageModel> _decryptLegacyQuestion(
  QueryDocumentSnapshot doc,
  EncryptionService encryptionService,
) async {
  final data = doc.data() as Map<String, dynamic>;
  final isEncrypted = data['encrypted'] as bool? ?? false;

  String question = data['question'] ?? '';
  String? context = data['context'] as String?;
  String? response = data['response'] as String?;
  List<String>? options = (data['options'] as List<dynamic>?)?.cast<String>();

  if (isEncrypted) {
    question = await encryptionService.decryptIfNeeded(question);
    context = context != null ? await encryptionService.decryptIfNeeded(context) : null;
    response = response != null ? await encryptionService.decryptIfNeeded(response) : null;
    options = options != null
        ? await Future.wait(options.map((o) => encryptionService.decryptIfNeeded(o)))
        : null;
  }

  return MessageModel(
    id: doc.id,
    direction: MessageDirection.toUser,
    content: question,
    context: context,
    options: options,
    response: response,
    answeredAt: (data['answeredAt'] as Timestamp?)?.toDate(),
    priority: data['priority'] ?? 'normal',
    status: data['status'] ?? 'pending',
    createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
    projectId: data['projectId'] as String?,
    archived: data['archived'] as bool? ?? false,
    deletedAt: (data['deletedAt'] as Timestamp?)?.toDate(),
    isEncrypted: isEncrypted,
  );
}

/// Stream provider for all pending messages (unified inbox)
/// This is the main inbox - shows both pending questions and pending tasks
final inboxProvider = StreamProvider<List<MessageModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  final encryptionService = ref.watch(encryptionServiceProvider);
  _log('inboxProvider: user=${user?.uid}');
  if (user == null) {
    _log('inboxProvider: No user, returning empty');
    return Stream.value([]);
  }

  _log('inboxProvider: Setting up stream for user ${user.uid}');
  return _firestore
      .collection('users/${user.uid}/messages')
      .where('status', isEqualTo: 'pending')
      .where('deletedAt', isNull: true)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .asyncMap((snapshot) async {
        _log('inboxProvider: Got ${snapshot.docs.length} docs');
        return await _decryptMessages(snapshot.docs, encryptionService);
      })
      .handleError((error, stackTrace) {
        _log('inboxProvider ERROR: $error');
        _log('inboxProvider STACK: $stackTrace');
        throw error;
      });
});

/// Stream provider for pending questions (toUser messages) - backward compatibility
final pendingMessagesProvider = StreamProvider<List<MessageModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  final encryptionService = ref.watch(encryptionServiceProvider);
  _log('pendingMessagesProvider: user=${user?.uid}');
  if (user == null) {
    return Stream.value([]);
  }

  return _firestore
      .collection('users/${user.uid}/messages')
      .where('direction', isEqualTo: 'to_user')
      .where('status', isEqualTo: 'pending')
      .where('deletedAt', isNull: true)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .asyncMap((snapshot) async {
        _log('pendingMessagesProvider: Got ${snapshot.docs.length} docs');
        return await _decryptMessages(snapshot.docs, encryptionService);
      })
      .handleError((error, stackTrace) {
        _log('pendingMessagesProvider ERROR: $error');
        throw error;
      });
});

/// Stream provider for pending tasks (toClaude messages) - backward compatibility
final pendingTaskMessagesProvider = StreamProvider<List<MessageModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  final encryptionService = ref.watch(encryptionServiceProvider);
  _log('pendingTaskMessagesProvider: user=${user?.uid}');
  if (user == null) {
    return Stream.value([]);
  }

  return _firestore
      .collection('users/${user.uid}/messages')
      .where('direction', isEqualTo: 'to_claude')
      .where('status', isEqualTo: 'pending')
      .orderBy('createdAt', descending: true)
      .limit(20)
      .snapshots()
      .asyncMap((snapshot) async {
        _log('pendingTaskMessagesProvider: Got ${snapshot.docs.length} docs');
        return await _decryptMessages(snapshot.docs, encryptionService);
      })
      .handleError((error, stackTrace) {
        _log('pendingTaskMessagesProvider ERROR: $error');
        throw error;
      });
});

/// Stream provider for all messages (recent, excluding deleted)
final allMessagesProvider = StreamProvider<List<MessageModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  final encryptionService = ref.watch(encryptionServiceProvider);
  _log('allMessagesProvider: user=${user?.uid}');
  if (user == null) {
    return Stream.value([]);
  }

  return _firestore
      .collection('users/${user.uid}/messages')
      .where('deletedAt', isNull: true)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .asyncMap((snapshot) async {
        _log('allMessagesProvider: Got ${snapshot.docs.length} docs');
        return await _decryptMessages(snapshot.docs, encryptionService);
      })
      .handleError((error, stackTrace) {
        _log('allMessagesProvider ERROR: $error');
        throw error;
      });
});

/// Stream provider for active (non-archived) messages
/// Merges both /messages (new) and /questions (legacy) collections with real-time updates
final activeMessagesProvider = StreamProvider<List<MessageModel>>((ref) {
  final user = ref.watch(currentUserProvider);
  final encryptionService = ref.watch(encryptionServiceProvider);
  _log('activeMessagesProvider: user=${user?.uid}');
  if (user == null) {
    return Stream.value([]);
  }

  // Stream for unified /messages collection
  final messagesStream = _firestore
      .collection('users/${user.uid}/messages')
      .where('deletedAt', isNull: true)
      .where('archived', isEqualTo: false)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots();

  // Stream for legacy /questions collection
  final questionsStream = _firestore
      .collection('users/${user.uid}/questions')
      .where('deletedAt', isNull: true)
      .where('archived', isEqualTo: false)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots();

  // Combine both streams using Rx-style combineLatest
  return _combineStreams(messagesStream, questionsStream)
      .asyncMap((snapshots) async {
        final messagesSnapshot = snapshots.$1;
        final questionsSnapshot = snapshots.$2;

        final messages = await _decryptMessages(messagesSnapshot.docs, encryptionService);
        final messageIds = messages.map((m) => m.id).toSet();

        // Merge legacy questions (skip duplicates)
        final legacyMessages = await Future.wait(
          questionsSnapshot.docs
              .where((doc) => !messageIds.contains(doc.id))
              .map((doc) => _decryptLegacyQuestion(doc, encryptionService)),
        );
        messages.addAll(legacyMessages);

        messages.sort((a, b) => b.createdAt.compareTo(a.createdAt));
        _log('activeMessagesProvider: Got ${messages.length} total messages (${messagesSnapshot.docs.length} new, ${legacyMessages.length} legacy)');
        return messages;
      })
      .handleError((error, stackTrace) {
        _log('activeMessagesProvider ERROR: $error');
        throw error;
      });
});

/// Stream provider for messages by project
final messagesByProjectProvider =
    StreamProvider.family<List<MessageModel>, String?>((ref, projectId) {
  final user = ref.watch(currentUserProvider);
  final encryptionService = ref.watch(encryptionServiceProvider);
  _log('messagesByProjectProvider: user=${user?.uid}, projectId=$projectId');
  if (user == null) {
    return Stream.value([]);
  }

  Query query = _firestore
      .collection('users/${user.uid}/messages')
      .where('deletedAt', isNull: true)
      .where('archived', isEqualTo: false);

  if (projectId == null || projectId == '_uncategorized') {
    query = query.where('projectId', isNull: true);
  } else {
    query = query.where('projectId', isEqualTo: projectId);
  }

  return query
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .asyncMap((snapshot) async {
        _log('messagesByProjectProvider: Got ${snapshot.docs.length} docs for project $projectId');
        return await _decryptMessages(snapshot.docs.cast<QueryDocumentSnapshot>(), encryptionService);
      })
      .handleError((error, stackTrace) {
        _log('messagesByProjectProvider ERROR: $error');
        throw error;
      });
});

/// Provider for a single message by ID
final messageProvider =
    StreamProvider.family<MessageModel?, String>((ref, messageId) {
  final user = ref.watch(currentUserProvider);
  final encryptionService = ref.watch(encryptionServiceProvider);
  if (user == null) {
    return Stream.value(null);
  }

  return _firestore
      .doc('users/${user.uid}/messages/$messageId')
      .snapshots()
      .asyncMap((doc) async {
        if (!doc.exists) return null;
        return await MessageModel.fromFirestoreDecrypted(doc, encryptionService);
      });
});

/// Service for message-related operations
class MessagesService {
  final FirebaseFirestore _firestore;
  final EncryptionService _encryptionService;

  MessagesService({FirebaseFirestore? firestore, EncryptionService? encryptionService})
      : _firestore = firestore ?? FirebaseFirestore.instance,
        _encryptionService = encryptionService ?? EncryptionService();

  /// Create a new task message (toClaude)
  /// Task encryption temporarily disabled due to key derivation mismatch
  Future<String> createTask({
    required String userId,
    required String title,
    required String instructions,
    String? projectId,
    String priority = 'normal',
    MessageAction action = MessageAction.queue,
    bool encrypt = false, // Disabled until key derivation is fixed
  }) async {
    _log('Creating task message: $title (action: ${action.value})');

    final messageRef = _firestore.collection('users/$userId/messages').doc();

    String finalTitle = title;
    String finalInstructions = instructions;
    String finalAction = action.value;
    bool isEncrypted = false;

    if (encrypt) {
      final encryptedTitle = await _encryptionService.encrypt(title);
      final encryptedInstructions = await _encryptionService.encrypt(instructions);
      final encryptedAction = await _encryptionService.encrypt(action.value);

      if (encryptedTitle != null && encryptedInstructions != null && encryptedAction != null) {
        finalTitle = encryptedTitle;
        finalInstructions = encryptedInstructions;
        finalAction = encryptedAction;
        isEncrypted = true;
        _log('Task message encrypted successfully');
      } else {
        _log('Encryption failed, storing unencrypted');
      }
    }

    await messageRef.set({
      'direction': MessageDirection.toClaude.value,
      'title': finalTitle,
      'content': finalInstructions,
      'projectId': projectId,
      'priority': priority,
      'action': finalAction,
      'status': 'pending',
      'createdAt': FieldValue.serverTimestamp(),
      'startedAt': null,
      'completedAt': null,
      'sessionId': null,
      'archived': false,
      'deletedAt': null,
      'encrypted': isEncrypted,
    });

    _log('Task message created with ID ${messageRef.id}');
    return messageRef.id;
  }

  /// Answer a question message (toUser)
  /// If the message was encrypted, the response will also be encrypted
  Future<void> answerMessage({
    required String userId,
    required String messageId,
    required String response,
    bool encrypt = true,
  }) async {
    // Check if the message is encrypted
    final doc = await _firestore.doc('users/$userId/messages/$messageId').get();
    final isMessageEncrypted = doc.data()?['encrypted'] as bool? ?? false;

    String finalResponse = response;
    bool shouldEncrypt = encrypt && isMessageEncrypted;

    if (shouldEncrypt) {
      final encrypted = await _encryptionService.encrypt(response);
      if (encrypted != null) {
        finalResponse = encrypted;
        _log('Response encrypted successfully');
      } else {
        _log('Encryption failed, storing unencrypted');
        shouldEncrypt = false;
      }
    }

    await _firestore.doc('users/$userId/messages/$messageId').update({
      'response': finalResponse,
      'status': 'answered',
      'answeredAt': FieldValue.serverTimestamp(),
      if (shouldEncrypt) 'responseEncrypted': true,
    });
  }

  /// Cancel a pending task message
  Future<void> cancelMessage({
    required String userId,
    required String messageId,
  }) async {
    _log('Cancelling message $messageId');

    await _firestore.doc('users/$userId/messages/$messageId').update({
      'status': 'cancelled',
    });

    _log('Message $messageId cancelled');
  }

  /// Mark a message as expired
  Future<void> expireMessage({
    required String userId,
    required String messageId,
  }) async {
    await _firestore.doc('users/$userId/messages/$messageId').update({
      'status': 'expired',
    });
  }

  /// Archive a message
  /// Handles both unified /messages and legacy /questions collections
  Future<void> archiveMessage({
    required String userId,
    required String messageId,
  }) async {
    _log('Archiving message $messageId');

    // First check if the document exists in /messages
    final messagesDoc = _firestore.doc('users/$userId/messages/$messageId');
    final messagesSnapshot = await messagesDoc.get();

    if (messagesSnapshot.exists) {
      await messagesDoc.update({'archived': true});
      _log('Archived message $messageId in /messages');
      return;
    }

    // Fall back to legacy /questions collection
    final questionsDoc = _firestore.doc('users/$userId/questions/$messageId');
    final questionsSnapshot = await questionsDoc.get();

    if (questionsSnapshot.exists) {
      await questionsDoc.update({'archived': true});
      _log('Archived message $messageId in /questions (legacy)');
      return;
    }

    // Document not found in either collection
    throw Exception('Message not found in either collection');
  }

  /// Unarchive a message
  /// Handles both unified /messages and legacy /questions collections
  Future<void> unarchiveMessage({
    required String userId,
    required String messageId,
  }) async {
    _log('Unarchiving message $messageId');

    // First check if the document exists in /messages
    final messagesDoc = _firestore.doc('users/$userId/messages/$messageId');
    final messagesSnapshot = await messagesDoc.get();

    if (messagesSnapshot.exists) {
      await messagesDoc.update({'archived': false});
      _log('Unarchived message $messageId in /messages');
      return;
    }

    // Fall back to legacy /questions collection
    final questionsDoc = _firestore.doc('users/$userId/questions/$messageId');
    final questionsSnapshot = await questionsDoc.get();

    if (questionsSnapshot.exists) {
      await questionsDoc.update({'archived': false});
      _log('Unarchived message $messageId in /questions (legacy)');
      return;
    }

    // Document not found in either collection
    throw Exception('Message not found in either collection');
  }

  /// Soft delete a message (sets deletedAt timestamp)
  /// Handles both unified /messages and legacy /questions collections
  Future<void> deleteMessage({
    required String userId,
    required String messageId,
  }) async {
    _log('Deleting message $messageId');

    // First check if the document exists in /messages
    final messagesDoc = _firestore.doc('users/$userId/messages/$messageId');
    final messagesSnapshot = await messagesDoc.get();

    if (messagesSnapshot.exists) {
      await messagesDoc.update({'deletedAt': FieldValue.serverTimestamp()});
      _log('Deleted message $messageId in /messages');
      return;
    }

    // Fall back to legacy /questions collection
    final questionsDoc = _firestore.doc('users/$userId/questions/$messageId');
    final questionsSnapshot = await questionsDoc.get();

    if (questionsSnapshot.exists) {
      await questionsDoc.update({'deletedAt': FieldValue.serverTimestamp()});
      _log('Deleted message $messageId in /questions (legacy)');
      return;
    }

    // Document not found in either collection
    throw Exception('Message not found in either collection');
  }

  /// Hard delete a message (permanent)
  Future<void> permanentlyDeleteMessage({
    required String userId,
    required String messageId,
  }) async {
    _log('Permanently deleting message $messageId');

    await _firestore.doc('users/$userId/messages/$messageId').delete();

    _log('Message $messageId permanently deleted');
  }

  /// Move message to a project
  Future<void> moveToProject({
    required String userId,
    required String messageId,
    String? projectId,
  }) async {
    await _firestore.doc('users/$userId/messages/$messageId').update({
      'projectId': projectId,
    });
  }

  /// Update message priority
  Future<void> updatePriority({
    required String userId,
    required String messageId,
    required String priority,
  }) async {
    _log('Updating message $messageId priority to $priority');

    await _firestore.doc('users/$userId/messages/$messageId').update({
      'priority': priority,
    });
  }
}

/// Provider for messages service
final messagesServiceProvider = Provider<MessagesService>((ref) {
  return MessagesService();
});
