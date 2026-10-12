# Uzzap — React Native / Expo Client

A React Native + Expo port of the legacy **JavaUzzap (Uzzap) J2ME instant-messaging client**
(3rd Brand Pte Ltd, 2007–2008, `com.kolipri.*`, 171 classes, ~667KB).
Targets Android (API 24+) and Expo Go / Web where transport allows.

> This file consolidates and replaces `JAVAUZZAP_TO_REACT_NATIVE_EXPO_PLAN.md`,
> `JAVAUZZAP_UI_UX_SPEC.md`, and `PROTOCOL_SPEC.md`.
> The `javauzzap/` source checkout and its `docs/` are a separate repository and were left untouched.

---

## 1. Stack

| Layer | Choice |
|---|---|
| App framework | Expo SDK 52, React 18, React Native 0.76, expo-router (file routing) |
| Language | TypeScript 5.6 (`tsc --noEmit`, strict) |
| State | Zustand + Immer, hybrid persist (SecureStore / MMKV / AsyncStorage) |
| Database | Drizzle ORM + expo-sqlite (`uzzap.db`, WAL, FK on) |
| Transport | Raw TCP (`react-native-tcp-socket`) + WebSocket variant (`wsClientWeb.ts`) |
| Tests | Jest + ts-jest (9 unit tests), Detox E2E config |
| CI | `.github/workflows/ci.yml` — Node 20, `npm ci`, lint, typecheck, test, expo-doctor |

---

## 2. Architecture

```
app/(auth)            login · register · pin · splash
app/(app)             contacts · chat · chat/[id] · rooms · room/[id] · add-buddy · settings (+blocked) · help
src/services          wsClient (TCP) · wsClientWeb (WS) · auth · contact · message · chatRoom
                      · presence · media · push · smsValidation · e2eEncryption · settings · offlineQueue · protobuf
src/store             auth · contacts · messages · chatRooms · presence · settings (+ selectors)
src/db                schema.ts (8 tables) · client.ts · useMigrations.ts
src/theme             tokens · uzzap/default palettes · dark derivation · ThemeProvider · theme.ini parser
src/components/ui     Screen · TitleBar · FunctionBar · AppButton · TextField/AppInput
                      SettingRow · Checkbox · ProgressBar · EmptyState · AlertDialog
```

Provider order: Migrations → GestureHandler → SafeArea → Theme → Auth → Router.

---

## 3. Wire Protocol Reference (legacy server)

Custom XML stream over **plain TCP** (not XMPP): SASL **PLAIN only**, namespace prefixes
stripped, stanzas flattened to `path`/`path.attr` keys.

- Host `connect.kolipri.com`; ports `5222,8734,10873,40932,80,25,20,21,110,443,465`
- Stream `to='amazilia'`, xmlns `jabber:client`, version flag `kalyptej-1.0.14`, resource `kalyptej`
- States: `idle → connecting → waiting → login → reinit → online` (+sleeping/failed-connect/disconnected)
- Auth: `base64("\0"+user+"\0"+pass)` in `<auth mechanism='PLAIN'>`, reopen stream with `flags`, bind resource, then `configuration please` + `query-roster` + `query-private`
- ACK every inbound `<message>` with `amaz-msg-id` via `<iq protocol='amaz-msg-ack'>`; 15-entry dedup ring
- Retry unacked every 300s, max 3; keep-alive single space after 900s idle; `update-idle-state` after 300s
- CDATA-escape `]]>` → `]]]]><![CDATA[>`; XML-escape `&<>'"`
- IQ id scheme `<PREFIX>_<epochsec>_<seq>` (`REG_`, `CHAT_`, `VALIDATE_`, `PINREQ`, `BIND`)

### Registry actions (`amaz-protocol='registry'`, targets `registry`/`___registry___`/`validation`/`accounts`/`subscription`)
`query-roster` · `save-contact` · `delete-contact` · `query-profile` · `save-profile` ·
`query-private` · `save-private` · `init-store-contact` · `store-contact` · `change-password` ·
`rename-group` · `pre-register` · `register` · `validation` · `update-idle-state` ·
`confirmation` · `pin-request` · `password-reset` (billing `subscribe/list/inquire-*` + gateway `login/logout` parsed but unused — no UI)

### Chat-room actions (`amaz-protocol='chat'`, target `conference`)
`query-ug` · `query-groups` · `query-group` · `chatuser` (join/leave/presence) ·
`create-room` (private/generated) · `invite` · `msg` (`groupchat`/`privatechat`) ·
whisper (`privatechat` + recipient) · topic messages · roles (`moderator`)

### Error codes (`iq/error.amaz-error`)
Validation (`invalid-mobile`, `duplicate-mobile`), register (`duplicate-username`,
`invalid-username`, `register-invalid-pin`, …), gateway (`authentication-failed`,
`connection-lost`, `on-maintenance`), PIN (`code-not-found`, `404`), chat (`room-full`,
`join-failed`, `duplicate-nick`, `duplicate-room`, `no-rooms-found`, …) — all mapped in `extractIqError`.

### Security note (per spec §8/§14)
The original protocol has **no encryption** and stored passwords in plaintext.
This port uses SASL PLAIN only toward the legacy server, but stores secrets in
SecureStore and never in SQLite/AsyncStorage.

---

## 4. Persistence & State

- SQLite tables: `users`, `buddies`, `conversations`, `messages`, `chat_rooms`,
  `chat_room_users`, `chat_messages`, `settings`
- Persisted store slice: user, tokens, phase, settings, buddies, groups,
  lastRosterSync, conversations, selfStatus, presence
- SecureStore: credentials, tokens, auth session, E2E keys, PIN
- MMKV: hot paths (self presence)
- Offline queue (SQLite-backed) flushes on reconnect

---

## 5. Theming

Two palettes (`uzzap` orange-on-charcoal, `default` MIDP steel-blue), full token
system (colors, type, space, radius, shadows, layout, z-index), dark-mode
derivation, `theme.ini` parser, cross-fade swap. Components consume semantic
tokens only. (Real `theme.ini` values were never recovered — all values are
reconstructed; 9-patch renderer, background tiling, bundled display fonts, and
emoticon sprites remain open.)

---

## 6. Setup / Run / Verify

```bash
npm install --legacy-peer-deps   # peer conflicts are pinned via .npmrc
npx expo start                   # Expo Go (TCP transport needs dev build)
npx expo prebuild && npm run android
npm test                         # jest, 9/9
npm run lint                     # eslint, clean
npm run typecheck                # tsc --noEmit, 0 errors (TS 5.6)
npx expo-doctor
```

Detox E2E is configured (`.detoxrc.json`, `e2e/`) but has never been executed —
requires emulator + native build.

---

## 7. Feature Checklist — √ Done / ✗ Open

### Auth & account
- √ Splash routing · login + remember/auto-login · 3-step register · 6-digit PIN + resend
- √ Change-password / change-mobile dialogs · biometric toggle (UI) · proxy + timeout/keepalive applied · logout
- ✗ Forgot-password screen · edit-profile screen · intro carousel · real biometric prompt · real password/mobile backend calls (dialogs stubbed)

### Buddies & contacts
- √ Grouped list, presence dots, unread badges · contact search · add-buddy (UserID/Phone/QR) · phonebook sync service · block/unblock + Blocked-users screen
- ✗ User-details screen · vCard share UI · frequent-contacts · legacy 5-group collapse · status-selector sheet · import wizard UI · buddy-matching flow

### 1:1 messaging
- √ Thread, bubbles, ticks, timestamps · image/voice/location/file send · image viewer modal · voice play/stop · location→Maps · file open · reply (quote bar + `meta.replyTo`) · forward (buddy picker + label) · copy (`expo-clipboard`) · delete (store+SQLite+queue)
- ✗ Emoticon picker + `[g1]` rendering · date headers · typing-indicator UI · scroll-to-bottom · waveform UI

### Chat rooms
- √ List · create (private/generated) · join/leave · room chat · user panel · kick/ban/promote/topic
- ✗ Invites inbox · whisper-to-DM UI · topic display · room search

### Settings & help
- √ General · Privacy (+Blocked) · Theme + dark · Account dialogs · Connection · Help & About
- √ Searchable help (~20 topics from `help.txt`)
- ✗ Chatroom-tones · battery-info · offline-settings · subscription/billing screens

### Infrastructure
- √ TCP + WebSocket transports · protobuf module · push registration + background-message notifications · SMS-listener placeholder · Signal service skeleton · Jest (9) · Detox config · CI workflow green
- ✗ Native-only: SMS receive, libsignal bindings, foreground service, boot receiver · screenshot-diff QA · E2E run · coverage ≥80% · signed AAB/store assets

---

## 8. Roadmap (priority order)
1. Device verification: prebuild → install → Detox run
2. Message polish: date headers, typing UI, emoticon picker, waveform
3. Missing screens: user-details, message-detail, status selector, room search, invites inbox
4. Satellite screens: tones, battery, offline-settings, subscription, buddy matching, import wizard
5. Native track (dev build): SMS receive, libsignal, foreground service, FCM end-to-end
6. Release track: screenshots, coverage, signed AAB, privacy policy, notes
