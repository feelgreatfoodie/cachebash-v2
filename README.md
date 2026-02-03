# CacheBash

Mobile companion app for Claude Code - Answer questions on the go, monitor progress from anywhere.

## Overview

CacheBash enables asynchronous communication between Claude Code sessions and users via push notifications. When Claude needs clarification, it sends a question to the user's phone. The user can respond from anywhere, and Claude continues working.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Claude Code   │◄───►│   MCP Server    │◄───►│    Firebase     │
│   (VS Code)     │     │   (TypeScript)  │     │   (Backend)     │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  Flutter App    │
                                                │  (iOS/Android)  │
                                                └─────────────────┘
```

## Project Structure

```
cachebash/
├── mcp-server/           # MCP server for Claude Code integration
├── firebase/             # Firebase backend (Functions, Firestore)
├── app/                  # Flutter mobile app
└── basher/               # Basher autonomous execution
```

## Quick Start

### Prerequisites

- Node.js 18+
- Flutter 3.x
- Firebase CLI (`npm install -g firebase-tools`)
- A Firebase project

### 1. Firebase Setup

```bash
# Login to Firebase
firebase login

# Initialize your project (select your Firebase project)
cd firebase
firebase init

# Deploy Firestore rules and functions
firebase deploy
```

### 2. Flutter App Setup

```bash
cd app

# Install dependencies
flutter pub get

# Add Firebase configuration
# Download google-services.json (Android) and GoogleService-Info.plist (iOS)
# from Firebase Console and place in appropriate directories

# Run the app
flutter run
```

### 3. MCP Server Setup

```bash
cd mcp-server

# Install dependencies
npm install

# Build
npm run build
```

### 4. Configure Claude Code

Add the MCP server to your Claude Code configuration (`~/.config/claude/mcp.json`):

```json
{
  "mcpServers": {
    "cachebash": {
      "command": "node",
      "args": ["/path/to/cachebash/mcp-server/dist/index.js"],
      "env": {
        "CACHEBASH_API_KEY": "your-api-key-here",
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json"
      }
    }
  }
}
```

## Authentication Flow

1. User registers in the mobile app (Firebase Auth)
2. App generates a 256-bit API key
3. Key is hashed (SHA-256) and stored in Firestore
4. Plaintext key is stored locally in secure storage
5. User copies key to Claude Code MCP configuration
6. MCP server validates key against Firestore on startup

## MCP Tools

| Tool | Description |
|------|-------------|
| `ask_question` | Send a question to the user's mobile device |
| `get_response` | Check if the user has responded to a question |
| `update_status` | Update the current working status in the app |
| `pin_task` | Pin current work to continue later |
| `resume_task` | Resume a previously pinned task |

### Example Usage

```typescript
// Ask a question
const result = await ask_question({
  question: "Should I use REST or GraphQL for the API?",
  options: ["REST", "GraphQL"],
  priority: "high",
  context: "Building the user service"
});

// Check for response
const response = await get_response({
  questionId: result.questionId
});

// Update status
await update_status({
  status: "Implementing user authentication",
  progress: 45,
  state: "working"
});
```

## Development

### MCP Server

```bash
cd mcp-server
npm run dev        # Watch mode
npm run build      # Production build
npm test           # Run tests
```

### Firebase Functions

```bash
cd firebase/functions
npm run serve      # Local emulator
npm run deploy     # Deploy to Firebase
```

### Flutter App

```bash
cd app
flutter run        # Run on device/simulator
flutter test       # Run tests
flutter build ios  # Build for iOS
flutter build appbundle  # Build for Android
```

## Firebase Configuration

### Required Firebase Services

- **Authentication**: Email/password sign-in
- **Cloud Firestore**: Database
- **Cloud Functions**: Backend logic
- **Cloud Messaging**: Push notifications

### Firestore Security Rules

The included `firestore.rules` enforces:
- Users can only read/write their own data
- API keys are validated server-side only
- Device tokens are scoped to individual users

## Deployment

### TestFlight (iOS)

1. Configure signing in Xcode
2. `flutter build ipa`
3. Upload via Transporter or Xcode
4. Enable internal testing in App Store Connect

### Play Store Internal (Android)

1. Create a keystore for signing
2. `flutter build appbundle`
3. Upload to Play Console
4. Enable internal testing track

## Environment Variables

### MCP Server

| Variable | Description |
|----------|-------------|
| `CACHEBASH_API_KEY` | API key from mobile app |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Firebase service account JSON |

## Troubleshooting

### MCP Server won't authenticate

- Verify the API key is copied correctly
- Check that the service account has Firestore access
- Ensure the key hasn't been regenerated in the app

### Push notifications not working

- Verify FCM is configured in Firebase Console
- Check APNs certificates for iOS
- Ensure the app has notification permissions

### Questions not appearing in app

- Check Firestore rules allow reading
- Verify the user is logged in
- Check browser console for errors

## License

MIT
