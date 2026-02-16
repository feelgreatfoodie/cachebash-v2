/// Environment configuration for API endpoints and project metadata
///
/// In production, these values should be loaded from build-time environment
/// variables or a secure configuration service.
class Environment {
  const Environment._({
    required this.apiUrl,
    required this.projectName,
  });

  final String apiUrl;
  final String projectName;

  /// Load configuration from compile-time environment variables
  ///
  /// Pass values via --dart-define during build:
  ///   flutter build --dart-define=API_URL=https://api.example.com
  factory Environment.fromEnvironment() {
    return Environment._(
      apiUrl: const String.fromEnvironment(
        'API_URL',
        defaultValue: 'https://api.cachebash.example.com',
      ),
      projectName: const String.fromEnvironment(
        'PROJECT_NAME',
        defaultValue: 'CacheBash Portfolio',
      ),
    );
  }

  /// Development configuration with local/staging endpoints
  factory Environment.development() {
    return const Environment._(
      apiUrl: 'http://localhost:8080',
      projectName: 'CacheBash Dev',
    );
  }

  /// Production configuration
  factory Environment.production() {
    return const Environment._(
      apiUrl: 'https://api.cachebash.example.com',
      projectName: 'CacheBash',
    );
  }
}
