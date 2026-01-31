# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in CacheBash, please report it responsibly:

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. Email security concerns to the maintainers directly
3. Include a clear description of the vulnerability and steps to reproduce

We will acknowledge receipt within 48 hours and provide a detailed response within 7 days.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x.x   | Yes       |

## Security Architecture

### End-to-End Encryption

- Messages between Claude Code and the mobile app are encrypted using **AES-256-CBC**
- Encryption keys are derived from API keys using **PBKDF2-SHA256** with 100,000 iterations
- Push notifications contain only plaintext previews (max 50 characters) for notification display
- Full message content is encrypted at rest in Firestore

### Authentication

- **API Keys**: 256-bit cryptographically random values, base64url encoded
- **Storage**: API key hashes (SHA-256) are stored in Firestore, not plaintext keys
- **Mobile App**: Firebase Authentication with email/password
- **MCP Server**: Validates API key hash against Firestore on each request

### Data Protection

- All data in transit uses **TLS 1.3**
- Firestore security rules enforce strict user isolation
- No sensitive data (API keys, ciphertext, tokens) logged in production
- Session timeout after 30 minutes of inactivity

### Rate Limiting

| Endpoint/Tool     | Limit           |
|-------------------|-----------------|
| ask_question      | 10 per minute   |
| get_response      | 60 per minute   |
| update_status     | 30 per minute   |
| get_pending_tasks | 30 per minute   |
| claim_task        | 20 per minute   |
| complete_task     | 20 per minute   |
| Notifications     | 100 per hour    |

### Input Validation

- All MCP tool arguments are validated using Zod schemas
- Field-level validation in Firestore security rules
- Email validation using RFC 5322 compliant regex
- API key format validation before server requests

## Security Best Practices for Users

1. **Keep your API key secure** - Don't share it or commit it to version control
2. **Regenerate keys periodically** - Use the app's regenerate feature if you suspect compromise
3. **Use strong passwords** - At least 8 characters for your CacheBash account
4. **Keep the app updated** - Install updates promptly for security fixes

## Responsible Disclosure

We ask security researchers to:

1. Give us reasonable time (90 days) to address issues before public disclosure
2. Make a good faith effort to avoid privacy violations and data destruction
3. Not access or modify other users' data
4. Not perform denial of service attacks

We commit to:

1. Acknowledging your report promptly
2. Keeping you informed of our progress
3. Crediting you (if desired) when we publish a fix
4. Not pursuing legal action against researchers acting in good faith
