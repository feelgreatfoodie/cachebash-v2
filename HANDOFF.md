# CacheBash Session Handoff

**Last Updated:** 2026-01-29
**Status:** Phase 1 Complete - TestFlight submission in progress

---

## Current Status

### Phase 1: TestFlight Deployment - COMPLETE

All code changes for TestFlight are done and pushed to GitHub.

#### Completed
- [x] APS environment changed to `production` in `Runner.entitlements`
- [x] Firebase Crashlytics integrated for crash reporting
- [x] Custom app icons generated from design (iOS + Android, all sizes)
- [x] Theme system created with dark/light mode (`app/lib/theme/`)
- [x] Color palette applied (cyan/purple/violet gradient theme)
- [x] IPA built and uploaded to App Store Connect
- [x] Export compliance answered (no custom encryption)

#### Pending (Manual Steps)
- [ ] Wait for App Store Connect build processing (~10-30 min)
- [ ] Add tester to TestFlight internal testing
- [ ] Download app via TestFlight on iPhone
- [ ] Test push notifications end-to-end (see `TEST_PUSH_NOTIFICATIONS.md`)

#### Known Issue - GoogleService-Info.plist
Current plist has bundle ID `com.example.cachebash` instead of `com.cachebash.app`. Should be fixed:
1. Firebase Console → Project Settings → iOS app
2. Verify bundle ID is `com.cachebash.app`
3. Download fresh plist → replace `app/ios/Runner/GoogleService-Info.plist`

---

## Phase 2: Cloud-Hosted MCP Server (Next)

### Goal
Enable zero-friction adoption: users copy one config snippet, no local installation.

### Target User Experience
```json
{
  "mcpServers": {
    "cachebash": {
      "type": "sse",
      "url": "https://mcp.cachebash.app/v1/sse",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Architecture
```
┌─────────────────┐     HTTPS/SSE      ┌─────────────────┐
│   Claude Code   │◄──────────────────►│  Cloud Run      │
│   (Any User)    │                    │  (SSE Server)   │
└─────────────────┘                    └────────┬────────┘
                                                │
                                                ▼
                                       ┌─────────────────┐
                                       │    Firestore    │
                                       └────────┬────────┘
                                                │ (triggers)
                                                ▼
                                       ┌─────────────────┐
                                       │ Cloud Functions │
                                       └────────┬────────┘
                                                │
                                                ▼
                                       ┌─────────────────┐
                                       │   Mobile App    │
                                       └─────────────────┘
```

### Implementation Tasks

#### 2.1 Cloud MCP Server (Cloud Run)
- [ ] Create `cloud-run/` directory structure
- [ ] Create Dockerfile for MCP SSE server
- [ ] Implement MCP protocol over HTTP/SSE transport
- [ ] Add `/v1/sse` endpoint with auto-reconnection
- [ ] Add `/v1/health` endpoint
- [ ] Add authentication middleware
- [ ] Add rate limiting middleware
- [ ] Add input validation
- [ ] Add structured logging
- [ ] Deploy to Cloud Run
- [ ] Set up custom domain `mcp.cachebash.app`

#### 2.2 App Updates
- [ ] Update API key screen with cloud MCP config snippet
- [ ] Add "Test Connection" button
- [ ] Add "Copy full config" button
- [ ] Add connection status indicator

#### 2.3 Documentation
- [ ] Setup guide with screenshots
- [ ] Video walkthrough
- [ ] Troubleshooting FAQ
- [ ] Privacy policy

### Files to Create
```
cloud-run/
├── Dockerfile
├── package.json
├── tsconfig.json
└── src/
    ├── server.ts
    ├── mcp/protocol.ts
    ├── middleware/
    │   ├── auth.ts
    │   ├── rateLimit.ts
    │   └── validate.ts
    └── routes/
        ├── sse.ts
        └── health.ts
```

### Security Requirements
- Rate limits per API key:
  - SSE connections: 2 concurrent max
  - ask_question: 100/hour
  - get_response: 500/hour
  - update_status: 200/hour
- Input validation limits:
  - Question: 2000 chars, Context: 500 chars, Status: 200 chars
  - Options: max 5, 100 chars each
- Request timestamps with 5-minute validity
- Questions auto-expire after 48 hours

### SSE Reconnection
- Buffer messages 5 min max per connection
- Event IDs for resumption
- Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s max
- Graceful shutdown: send `server-restarting` event

---

## Priority Matrix

| Task | Priority | Reason |
|------|----------|--------|
| Fix GoogleService-Info.plist | High | Ensures FCM works |
| Test push notifications | High | Validate E2E flow |
| Custom domain | High | Trust factor |
| Cloud Run SSE server | High | Core Phase 2 |
| Rate limiting | High | Security |
| Documentation | High | Adoption |

---

## Reference

### Configuration
- **Bundle ID:** `com.cachebash.app`
- **Team ID:** `FKFQ6KS8ZA`
- **Firebase Project:** `cachebash-app`
- **Version:** `1.0.0+1`

### Key Files
- `app/lib/theme/` - Theme system
- `app/lib/screens/auth/api_key_screen.dart` - Needs Phase 2 update
- `mcp-server/` - Local MCP (to be replaced by Cloud Run)
- `TEST_PUSH_NOTIFICATIONS.md` - E2E test procedure

### Recent Commits
```
ff48b5e Add push notification test docs and improve FCM error logging
48e4738 Prepare for TestFlight deployment
dba2696 Implement CacheBash MVP - Full stack working
```

---

## Quick Start for New Session

1. **Check TestFlight status** - App Store Connect → TestFlight tab
2. **Test push notifications** - Follow `TEST_PUSH_NOTIFICATIONS.md`
3. **Start Phase 2** - Create `cloud-run/` directory, begin with Dockerfile
