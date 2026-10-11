# JavaUzzap → React Native Expo Android: Comprehensive Reverse Engineering & Clone Plan

---

## Executive Summary

This document outlines a complete plan to reverse engineer **JavaUzzap** (a J2ME/feature phone instant messaging client from ~2007-2008) and build an **exact functional clone** in **React Native Expo** targeting **Android**.

**Source Repository:** https://github.com/cyanideph/javauzzap.git  
**Original App:** "Uzzap" by 3rd Brand Pte Ltd (c) 2007/2008  
**Target Platform:** React Native Expo (Expo SDK 51+) → Android (API 24+)  
**Architecture:** J2ME (CLDC/MIDP) → React Native (JavaScript/TypeScript + Native Modules)

---

## 1. Source Code Analysis & Inventory

### 1.1 Project Structure

```
javauzzap/
├── META-INF/                    # JAR manifest & certificates
├── com/kolipri/                 # Main package (obfuscated)
│   ├── kalypte/                 # Core protocol/networking (~45 classes)
│   ├── kimp/                    # IM/Chat logic (~30 classes)
│   ├── kpr/                     # Persistence/Storage (~15 classes)
│   └── kt/                      # UI Components (~30 classes)
├── themes/
│   ├── default/                 # Default theme assets
│   └── uzzap/                   # Branded theme (PNGs + theme.ini)
├── alert.amr / alert.wav        # Notification sounds
├── battery.txt                  # Battery saving tips
├── help.txt / help0.txt         # User documentation
└── .gitignore
```

### 1.2 Package Breakdown (Deobfuscation Targets)

| Package               | Est. Classes | Primary Responsibility                                                | Key Files to Analyze                        |
| --------------------- | ------------ | --------------------------------------------------------------------- | ------------------------------------------- |
| `com.kolipri.kalypte` | ~45          | Network protocol, socket management, encryption, server communication | Connection handling, packet parsing, crypto |
| `com.kolipri.kimp`    | ~30          | IM logic: buddy list, messages, chat windows, SMS gateway             | Message routing, buddy management, chat UI  |
| `com.kolipri.kpr`     | ~15          | RMS (Record Management System) persistence, settings, contacts        | Data storage, preferences, contact DB       |
| `com.kolipri.kt`      | ~30          | UI: Canvas, Forms, Custom components, Theme rendering                 | Screen navigation, input handling, drawing  |

### 1.3 Key Resources to Port

| Asset                     | Type          | Notes                                                       |
| ------------------------- | ------------- | ----------------------------------------------------------- |
| `themes/uzzap/*.png`      | UI Chrome     | 9-patch style: titlebar, functionbar, bottombar, background |
| `themes/uzzap/theme.ini`  | Theme Config  | Colors, fonts, metrics                                      |
| `alert.amr` / `alert.wav` | Sounds        | Notification tones                                          |
| `help.txt` / `help0.txt`  | Documentation | Convert to in-app help screens                              |

---

## 2. Functional Specification (Feature Parity)

### 2.1 Authentication & Account Management

- [ ] **Registration Flow**
  - User ID (6-12 alphanumeric)
  - Mobile number (international format +CCXXXXXXXXXX)
  - First/Last name
  - Email (for recovery)
  - Password (6+ chars, confirmation)
  - PIN validation via SMS (on first login/number change)

- [ ] **Login Flow**
  - User ID + Password
  - "Remember me" / Auto-login
  - Auto-start on boot (Android: BOOT_COMPLETED receiver)
  - PIN entry if number changed/first login

- [ ] **Account Settings**
  - Change mobile number (with PIN re-validation)
  - Change password
  - Auto-start toggle

### 2.2 Buddy List & Presence

- [ ] **Buddy List Screen** (Main Menu)
  - Online/Offline status indicators
  - Custom status messages
  - Sort: Online first, then alphabetical
  - Search/filter by typing name (J2ME: keypress jump)

- [ ] **Buddy Actions**
  - Add buddy (by User ID)
  - Add from phone contacts (Android: ContactsProvider)
  - Invite via SMS/Email/Share intent
  - Send contact (vCard/share)
  - Remove buddy
  - Block/Unblock

- [ ] **Presence/Status**
  - Online / Away / Busy / Invisible / Offline
  - Custom status text
  - Status persists across sessions

### 2.3 Messaging (Core)

- [ ] **Chat Screen**
  - Threaded conversation view
  - Sent/Delivered/Read indicators (✓ / ✓✓ / ✓✓ blue)
  - Timestamp grouping (date headers)
  - Emoticon picker
  - Copy/Forward message
  - Reply shortcut (type to reply)

- [ ] **Message Types**
  - Text (EM - Enhanced Messages, Uzzap-to-Uzzap)
  - SMS fallback for non-Uzzap contacts
  - ESMS (Enhanced SMS - subscription based)
  - Contact sharing (vCard)

- [ ] **Delivery Logic**
  - Persistent TCP connection to Uzzap server
  - Auto-reconnect with exponential backoff
  - Offline queue (persist to SQLite/AsyncStorage)
  - Delivery receipts (arrow → cleared on ack)
  - Read receipts (red unread indicator)

### 2.4 Offline & Push

- [ ] **Offline Message Delivery**
  - Settings: SMS / Email / Server-store
  - FCM push notifications (replaces SMS gateway)
  - Background fetch / headless JS for message sync

- [ ] **Background Operation**
  - Foreground service for persistent connection
  - "Hide app" → minimize to notification (Android: ongoing notification)
  - Auto message display: popup / notification / silent

### 2.5 Settings & Preferences

- [ ] **General**
  - Auto-start on boot
  - Vibration on message
  - Sound on message (custom tone)
  - LED notification (if supported)

- [ ] **Network**
  - Connection timeout
  - Keep-alive interval
  - Proxy settings (if needed)

- [ ] **Privacy**
  - Block list
  - Read receipts toggle
  - Last seen visibility

- [ ] **Theme**
  - Default / Uzzap theme selector
  - Custom theme support (future)

### 2.6 Help & About

- [ ] **Intro Help Screen** (first launch)
- [ ] **Contextual Help** (per screen)
- [ ] **About**: Version, Copyright, License

---

## 3. Technical Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Native Expo App                       │
├─────────────────────────────────────────────────────────────────┤
│  Presentation Layer (TypeScript + React Native)                 │
│  ├── Screens (Stack/Tab Navigator)                              │
│  ├── Components (Reusable UI)                                   │
│  ├── Theme System (StyleSheet + Context)                        │
│  └── Navigation (Expo Router / React Navigation)                │
├─────────────────────────────────────────────────────────────────┤
│  Business Logic Layer (TypeScript)                              │
│  ├── Auth Service (Registration, Login, PIN, Tokens)            │
│  ├── Contact Service (Buddy list, Phone contacts sync)          │
│  ├── Message Service (Send/Receive, Queue, Receipts)            │
│  ├── Presence Service (Status, Online/Offline)                  │
│  ├── Settings Service (Preferences, Theme)                      │
│  └── Notification Service (FCM, Local, Foreground)              │
├─────────────────────────────────────────────────────────────────┤
│  Data Layer                                                     │
│  ├── SQLite (expo-sqlite) - Messages, Contacts, Settings        │
│  ├── AsyncStorage - Session, Preferences, Queue                 │
│  ├── SecureStore - Auth tokens, PIN, Credentials                │
│  └── MMKV (optional) - High-perf key-value                      │
├─────────────────────────────────────────────────────────────────┤
│  Native/Platform Layer (Expo Config Plugins + Custom Modules)   │
│  ├── TCP Socket (expo-socket or custom native module)           │
│  ├── FCM (expo-notifications + Firebase)                        │
│  ├── Contacts (expo-contacts)                                   │
│  ├── SMS (expo-sms or custom for ESMS)                          │
│  ├── Foreground Service (expo-task-manager + custom)            │
│  ├── Boot Receiver (expo-autostart or custom)                   │
│  └── Audio (expo-av for alert sounds)                           │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Network Protocol (Reverse Engineering Target)

**Original:** Custom TCP protocol over persistent socket (likely proprietary binary protocol)

**Reverse Engineering Approach:**

1. **Static Analysis:** Decompile J2ME classes (ProGuard-obfuscated) → identify packet structures
2. **Dynamic Analysis:** Run in J2ME emulator (MicroEmulator/KEmulator) + Wireshark/tcpdump
3. **Protocol Documentation:** Define message types, fields, encryption

**Expected Protocol Components:**

- Handshake/Authentication packets
- Keep-alive/Heartbeat
- Message send/receive (text, SMS, contact)
- Presence updates (status, typing)
- Buddy list sync
- Offline message retrieval
- Error/ACK packets

**Modern Replacement Options:**

| Option                          | Pros                                            | Cons                                 |
| ------------------------------- | ----------------------------------------------- | ------------------------------------ |
| **Replicate original protocol** | Compatible with existing Uzzap servers (if any) | Requires full RE, server may be dead |
| **XMPP (ejabberd/Openfire)**    | Standard, robust, offline msg, presence         | Different protocol                   |
| **Matrix (Synapse)**            | Modern, E2EE, federation                        | Overkill?                            |
| **Custom WebSocket + Protobuf** | Full control, efficient, typed                  | New server needed                    |
| **Firebase Realtime/RTDB**      | Managed, offline sync, presence                 | Vendor lock-in                       |

**Recommendation:** **Custom WebSocket + Protobuf** with a Node.js/Go reference server. This gives full control, matches the "exact clone" requirement for behavior, and allows future server deployment.

### 3.3 Data Models

```typescript
// types/models.ts

interface User {
  userId: string; // 6-12 alphanumeric
  phoneNumber: string; // E.164 format
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string; // Never store plaintext
  pin?: string; // SMS validation PIN
  createdAt: number;
  lastLogin: number;
}

interface Buddy {
  userId: string;
  displayName: string;
  phoneNumber?: string;
  status: PresenceStatus;
  statusMessage?: string;
  isBlocked: boolean;
  isUzzapUser: boolean; // false = SMS-only contact
  lastSeen?: number;
  avatar?: string; // Local URI or remote
  groups: string[]; // Contact groups
}

type PresenceStatus = 'online' | 'away' | 'busy' | 'invisible' | 'offline';

interface Message {
  id: string; // UUID
  conversationId: string; // buddy userId or group ID
  senderId: string; // my userId or buddy userId
  type: MessageType;
  content: string; // Text or vCard JSON
  timestamp: number;
  status: MessageStatus; // sending → sent → delivered → read
  receiptRequested: boolean;
  offlineQueued: boolean; // For non-Uzzap contacts
}

type MessageType = 'text' | 'sms' | 'esms' | 'contact' | 'system';
type MessageStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

interface Conversation {
  id: string; // buddy userId
  buddy: Buddy;
  lastMessage?: Message;
  unreadCount: number;
  isPinned: boolean;
  draftText?: string;
}

interface Settings {
  autoStart: boolean;
  autoLogin: boolean;
  vibrationEnabled: boolean;
  soundEnabled: boolean;
  soundUri: string;
  ledEnabled: boolean;
  theme: 'default' | 'uzzap' | 'custom';
  offlineDelivery: OfflineDeliveryMode;
  readReceipts: boolean;
  lastSeenVisible: boolean;
  connectionTimeout: number;
  keepAliveInterval: number;
}

type OfflineDeliveryMode = 'sms' | 'email' | 'server' | 'push';
```

---

## 4. Implementation Phases

### Phase 0: Reconnaissance & Protocol RE (Week 1-2)

**Goal:** Understand the protocol and data structures

| Task                                                | Owner     | Deliverable                |
| --------------------------------------------------- | --------- | -------------------------- |
| Decompile all J2ME classes (CFR/Procyon/Fernflower) | @explorer | Decompiled source tree     |
| Map obfuscated class names to functionality         | @explorer | Class responsibility map   |
| Extract packet structures (serialize/deserialize)   | @oracle   | Protocol specification doc |
| Run in emulator + capture network traffic           | @fixer    | PCAP files, packet logs    |
| Document encryption/crypto (if any)                 | @oracle   | Crypto spec                |
| Identify server endpoints (host/port)               | @explorer | Server config              |

**Tools:** `cfr`, `procyon`, `fernflower`, `microemulator`, `wireshark`, `jadx` (for any Android bits)

### Phase 1: Project Setup & Foundation (Week 2-3)

**Goal:** Expo project with core infrastructure

| Task                                                                 | Owner     | Deliverable                   |
| -------------------------------------------------------------------- | --------- | ----------------------------- |
| `npx create-expo-app@latest uzzap-clone --template blank-typescript` | @fixer    | Bootstrapped project          |
| Configure Expo SDK 51+, TypeScript strict mode                       | @fixer    | `tsconfig.json`, `app.json`   |
| Set up navigation (Expo Router v3 + typed routes)                    | @fixer    | Router config                 |
| Theme system (Context + StyleSheet + theme.ini parser)               | @designer | `ThemeProvider`, token system |
| SQLite schema + migrations (expo-sqlite + drizzle-orm)               | @fixer    | `db/schema.ts`, migrations    |
| SecureStore wrapper for auth tokens                                  | @fixer    | `secureStorage.ts`            |
| MMKV setup (optional, for hot paths)                                 | @fixer    | `storage.ts`                  |
| ESLint + Prettier + Husky                                            | @fixer    | Lint config                   |

### Phase 2: Authentication Module (Week 3-4)

**Goal:** Complete auth flow with PIN verification

| Task                                                 | Owner     | Deliverable                 |
| ---------------------------------------------------- | --------- | --------------------------- |
| Registration screen (multi-step form)                | @designer | `RegisterScreen.tsx`        |
| Login screen + "Remember me"                         | @designer | `LoginScreen.tsx`           |
| PIN entry screen (SMS verification)                  | @designer | `PinEntryScreen.tsx`        |
| Auth service: register, login, refresh, logout       | @fixer    | `authService.ts`            |
| Token management (JWT or custom) + auto-refresh      | @fixer    | `tokenManager.ts`           |
| Auto-start on boot (expo-autostart + BOOT_COMPLETED) | @fixer    | Native config plugin        |
| Biometric unlock (expo-local-authentication)         | @fixer    | `BiometricPrompt` component |
| Unit tests for auth flows                            | @fixer    | `authService.test.ts`       |

### Phase 3: Contact & Buddy System (Week 4-5)

**Goal:** Buddy list with phone contact integration

| Task                                                          | Owner     | Deliverable              |
| ------------------------------------------------------------- | --------- | ------------------------ |
| Contact service (CRUD, search, groups)                        | @fixer    | `contactService.ts`      |
| Phone contacts sync (expo-contacts + permission)              | @fixer    | `ContactsSync.ts`        |
| Buddy list screen (virtualized FlatList)                      | @designer | `BuddyListScreen.tsx`    |
| Buddy item component (avatar, status, name, last msg preview) | @designer | `BuddyItem.tsx`          |
| Add buddy modal (User ID / Phone / QR)                        | @designer | `AddBuddyModal.tsx`      |
| Invite flow (Share intent + SMS/Email)                        | @fixer    | `inviteService.ts`       |
| Send contact (vCard generation + share)                       | @fixer    | `contactShare.ts`        |
| Block/Unblock + privacy settings                              | @fixer    | `privacyService.ts`      |
| Integration tests                                             | @fixer    | `contactService.test.ts` |

### Phase 4: Messaging Core (Week 5-7)

**Goal:** Real-time chat with delivery receipts

| Task                                              | Owner     | Deliverable                            |
| ------------------------------------------------- | --------- | -------------------------------------- |
| WebSocket client (reconnection, heartbeat, queue) | @fixer    | `wsClient.ts`                          |
| Protobuf schema definition (from RE)              | @oracle   | `protocol.proto`                       |
| Message service (send, receive, queue, retry)     | @fixer    | `messageService.ts`                    |
| Offline queue (SQLite + background sync)          | @fixer    | `offlineQueue.ts`                      |
| Chat screen (Gifted Chat style or custom)         | @designer | `ChatScreen.tsx`                       |
| Message bubbles (sent/received, status icons)     | @designer | `MessageBubble.tsx`                    |
| Emoticon picker (custom + native)                 | @designer | `EmoticonPicker.tsx`                   |
| Input toolbar (text, attach, send)                | @designer | `MessageInput.tsx`                     |
| Delivery receipt handling (✓/✓✓/read)             | @fixer    | `receiptHandler.ts`                    |
| Push notification integration (FCM)               | @fixer    | `pushService.ts`                       |
| Foreground service for persistent socket          | @fixer    | Native module + `ForegroundService.ts` |
| E2E tests (send/receive, offline, reconnect)      | @fixer    | `messageService.e2e.ts`                |

### Phase 5: Presence & Status (Week 6)

**Goal:** Real-time presence system

| Task                                                | Owner     | Deliverable           |
| --------------------------------------------------- | --------- | --------------------- |
| Presence service (publish/subscribe)                | @fixer    | `presenceService.ts`  |
| Status selector (Online/Away/Busy/Invisible/Custom) | @designer | `StatusSelector.tsx`  |
| Status indicator on buddy items (color dot)         | @designer | `StatusIndicator.tsx` |
| Typing indicator (optional)                         | @fixer    | `typingIndicator.ts`  |
| Last seen timestamp                                 | @fixer    | `lastSeen.ts`         |

### Phase 6: Settings & Preferences (Week 6-7)

**Goal:** Complete settings screens

| Task                                         | Owner     | Deliverable                   |
| -------------------------------------------- | --------- | ----------------------------- |
| Settings screen (categorized sections)       | @designer | `SettingsScreen.tsx`          |
| Theme selector (Default/Uzzap/Custom)        | @designer | `ThemeSelector.tsx`           |
| Notification settings (sound, vibrate, LED)  | @designer | `NotificationSettings.tsx`    |
| Offline delivery mode selector               | @designer | `OfflineDeliverySettings.tsx` |
| Privacy settings (block list, read receipts) | @designer | `PrivacySettings.tsx`         |
| Network settings (timeout, keep-alive)       | @designer | `NetworkSettings.tsx`         |
| Account settings (change number, password)   | @designer | `AccountSettings.tsx`         |
| Settings persistence (SQLite + SecureStore)  | @fixer    | `settingsService.ts`          |

### Phase 7: UI/UX Polish & Theming (Week 7-8)

**Goal:** Pixel-perfect Uzzap theme + modern UX

| Task                                                    | Owner     | Deliverable             |
| ------------------------------------------------------- | --------- | ----------------------- |
| Parse theme.ini → design tokens                         | @designer | `themeTokens.ts`        |
| 9-patch PNG handling (titlebar, functionbar, bottombar) | @designer | `NinePatchImage.tsx`    |
| Background pattern tiling                               | @designer | `BackgroundPattern.tsx` |
| Custom fonts (if any in theme)                          | @designer | `useFonts` hook         |
| Dark mode support (derived from theme)                  | @designer | `darkTheme.ts`          |
| Animations (screen transitions, message appear)         | @designer | `animations.ts`         |
| Haptic feedback (expo-haptics)                          | @designer | `haptics.ts`            |
| Accessibility (TalkBack, labels, contrast)              | @designer | A11y audit              |
| Landscape support (tablet)                              | @designer | Responsive layouts      |

### Phase 8: Background & System Integration (Week 8-9)

**Goal:** True background operation like J2ME "Hide App"

| Task                                               | Owner  | Deliverable                     |
| -------------------------------------------------- | ------ | ------------------------------- |
| Foreground service (persistent TCP + notification) | @fixer | `ForegroundService.kt` (native) |
| Ongoing notification with quick actions            | @fixer | `NotificationManager.kt`        |
| Background message sync (headless JS)              | @fixer | `backgroundSync.ts`             |
| FCM token registration + topic subscription        | @fixer | `fcmService.ts`                 |
| Boot completed receiver (auto-start)               | @fixer | `BootReceiver.kt`               |
| Battery optimization whitelist request             | @fixer | `batteryOptimization.ts`        |
| Doze mode compatibility                            | @fixer | Testing doc                     |

### Phase 9: Audio & Notifications (Week 8)

**Goal:** Sound alerts matching original

| Task                                        | Owner     | Deliverable               |
| ------------------------------------------- | --------- | ------------------------- |
| Convert alert.amr/wav → MP3/OGG for Android | @fixer    | `assets/sounds/`          |
| Notification sound picker (system + custom) | @designer | `SoundPicker.tsx`         |
| In-app message sound (expo-av)              | @fixer    | `playNotificationSound()` |
| Vibration patterns (per message type)       | @fixer    | `vibrationPatterns.ts`    |

### Phase 10: Help & Onboarding (Week 9)

**Goal:** First-run experience + help system

| Task                                       | Owner     | Deliverable             |
| ------------------------------------------ | --------- | ----------------------- |
| Intro help carousel (from help0.txt)       | @designer | `IntroHelpCarousel.tsx` |
| Contextual help per screen (from help.txt) | @designer | `HelpModal.tsx`         |
| Searchable help index                      | @designer | `HelpScreen.tsx`        |
| First-launch detection + onboarding flow   | @fixer    | `onboarding.ts`         |

### Phase 11: Testing & QA (Week 9-10)

**Goal:** Production-ready quality

| Task                                            | Owner     | Deliverable           |
| ----------------------------------------------- | --------- | --------------------- |
| Unit tests (Jest) - services, utils             | @fixer    | Coverage >80%         |
| Integration tests (Detox) - critical flows      | @fixer    | E2E test suite        |
| Performance profiling (Flipper, React DevTools) | @fixer    | Perf report           |
| Memory leak detection (heap snapshots)          | @fixer    | Leak analysis         |
| Network condition testing (throttle, offline)   | @fixer    | Test matrix           |
| Device farm testing (Firebase Test Lab)         | @fixer    | Device matrix results |
| Accessibility audit (Accessibility Scanner)     | @designer | A11y report           |

### Phase 12: Build & Release (Week 10)

**Goal:** Play Store ready build

| Task                                      | Owner     | Deliverable         |
| ----------------------------------------- | --------- | ------------------- |
| EAS Build configuration (eas.json)        | @fixer    | Build profiles      |
| App signing (Play App Signing)            | @fixer    | Keystore config     |
| Store listing (screenshots, descriptions) | @designer | Play Console assets |
| Privacy policy + TOS                      | @fixer    | Legal docs          |
| Release pipeline (GitHub Actions + EAS)   | @fixer    | CI/CD yaml          |
| Staged rollout (1% → 10% → 100%)          | @fixer    | Release plan        |

---

## 5. Risk Assessment & Mitigation

| Risk                                                | Likelihood | Impact   | Mitigation                                                        |
| --------------------------------------------------- | ---------- | -------- | ----------------------------------------------------------------- |
| **Original protocol undocumented / servers dead**   | High       | Critical | Design new protocol + server from Day 1; don't depend on original |
| **J2ME obfuscation prevents full RE**               | Medium     | High     | Focus on dynamic analysis (emulator + network capture)            |
| **Persistent TCP on Android killed by Doze**        | High       | High     | Foreground service + FCM high-priority + partial wakelock         |
| **SMS/ESMS gateway unavailable**                    | High       | Medium   | Replace with FCM push; SMS only for invite fallback               |
| **Theme assets don't scale to modern screens**      | Medium     | Medium   | Recreate as vector/SVG; 9-patch for chrome                        |
| **Expo SDK limitations (foreground service, boot)** | Medium     | Medium   | Config plugins + bare workflow if needed                          |
| **Contact permission changes (Android 13+)**        | Medium     | Low      | Runtime permission handling + fallback                            |
| **Binary size / performance on low-end devices**    | Low        | Medium   | Hermes, bundle splitting, lazy loading                            |

---

## 6. Team & Resource Allocation

| Role                   | Responsibility                                           | Allocation                          |
| ---------------------- | -------------------------------------------------------- | ----------------------------------- |
| **Orchestrator** (You) | Planning, coordination, integration, decisions           | 100%                                |
| **@explorer**          | Codebase recon, static analysis, file mapping            | Phase 0 (full-time)                 |
| **@oracle**            | Architecture decisions, protocol design, crypto review   | Phase 0, 4 (part-time)              |
| **@fixer**             | Implementation: services, native modules, data layer     | Phase 1-12 (full-time)              |
| **@designer**          | UI/UX: screens, components, theme, animations            | Phase 1, 2, 3, 4, 7, 10 (full-time) |
| **@librarian**         | Library research: Expo modules, Protobuf, WebSocket libs | As needed                           |

**Parallelization Strategy:**

- Phase 0: @explorer + @oracle (protocol RE) // @designer starts theme system
- Phase 1-2: @fixer (foundation) // @designer (auth screens)
- Phase 3-4: @fixer (contacts + messaging core) // @designer (chat UI)
- Phase 5-7: @fixer (presence + settings) // @designer (polish + theming)
- Phase 8-10: @fixer (background + audio) // @designer (help + onboarding)
- Phase 11-12: @fixer (testing + release) // @designer (store assets)

---

## 7. Definition of Done (Per Phase)

Each phase is **complete** when:

- [ ] All tasks checked off
- [ ] Code reviewed (self-review + @oracle for architectural changes)
- [ ] Unit tests passing (>80% coverage for new code)
- [ ] Integration tests passing (Detox for UI flows)
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] No ESLint warnings
- [ ] Runs on Android emulator + physical device (API 24+)
- [ ] Performance: <100ms navigation, <16ms frame time
- [ ] Memory: <150MB baseline, no leaks over 30min use

---

## 8. Appendix: Key File References

### 8.1 Source Files to Decompile (Priority Order)

**Protocol/Network (kalypte):**

- `com/kolipri/kalypte/*.class` — All ~45 files

**Messaging (kimp):**

- `com/kolipri/kimp/s.java` (24KB - likely main chat logic)
- `com/kolipri/kimp/g.java` (10KB)
- `com/kolipri/kimp/ae.java` (10KB)
- `com/kolipri/kimp/aa.java` (10KB)
- `com/kolipri/kimp/u.java` (5KB)

**Persistence (kpr):**

- `com/kolipri/kpr/g.java` (7KB)
- `com/kolipri/kpr/m.java` (5KB)
- `com/kolipri/kpr/b.java` (2KB)

**UI (kt):**

- `com/kolipri/kt/aq.java` (13KB - likely main canvas/form)
- `com/kolipri/kt/m.java` (13KB)
- `com/kolipri/kt/l.java` (14KB)
- `com/kolipri/kt/y.java` (6KB)
- `com/kolipri/kt/v.java` (8KB)
- `com/kolipri/kt/aa.java` (8KB)
- `com/kolipri/kt/ab.java` (8KB)

### 8.2 Theme Assets (themes/uzzap/)

- `theme.ini` — Parse for colors, fonts, metrics
- `titlebar-left/middle/right.png` — 9-patch top bar
- `functionbar-left/middle/right.png` — 9-patch bottom action bar
- `menu-bottombar.png` — Menu bar
- `background-pattern.png` — Tiled background
- `menu-bottombar.png` — Menu chrome

### 8.3 Documentation Source

- `help0.txt` → Registration + Login flow
- `help.txt` → Full feature guide (15 sections)
- `battery.txt` → Battery tips screen

---

## 9. Next Steps

1. **Immediate:** Delegate Phase 0 to @explorer + @oracle for protocol reverse engineering
2. **Parallel:** @designer begins theme token system from `theme.ini`
3. **Week 2:** @fixer bootstraps Expo project with navigation + SQLite
4. **Decision Point:** After Phase 0, confirm protocol approach (replicate vs new)

---

_Document Version: 1.0_  
_Generated: 2026-10-11_  
_Repository: https://github.com/cyanideph/javauzzap.git_
