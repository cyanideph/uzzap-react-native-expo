# Uzzap React Native Expo — Source Parity Audit

**Audit date:** 2026-10-11  
**Target:** `cyanideph/uzzap-react-native-expo`  
**Reference:** `cyanideph/javauzzap`  
**Audit branch:** `audit/original-source-parity`  
**Scope:** Repository structure, source assets, theme values, navigation/UI architecture, protocol assumptions, and available automated checks.

> This is a static repository audit using the connected GitHub source. It is not a device run, network integration test, Android build, or claim of pixel-perfect parity.

## Executive summary

The original JavaUzzap repository and its relevant source files are accessible. The target already contains a substantial Expo implementation and protocol documentation, but several design assumptions conflict with the original assets and theme configuration. Establish source-of-truth parity before calling the clone exact.

## Verified findings

### 1. Original source and theme assets are present

The source repository contains the MIDlet manifest and declares **Uzzap 1.0.14**, MIDP 2.0 / CLDC 1.1. Both `themes/uzzap/theme.ini` and `themes/default/theme.ini` are readable, along with the original PNG theme assets, iconography, emoticons, help text, and alert sounds.

The target contains only a small subset of the original theme resources under `assets/themes/uzzap/`; `assets/themes/default/` contains only `.gitkeep`. The target also has empty placeholders for chrome, icons, emoticons, and fonts. This is incomplete asset parity.

### 2. Current target brand palette does not match the original Uzzap theme.ini

The target `src/theme/uzzap.ts` documents an orange-on-charcoal palette (for example `#FF7A1A`, `#14161A`, `#1E2228`). The original `themes/uzzap/theme.ini` instead identifies the skin as **Reptilian** and defines, among other values:

- Selected menu color: `c0fd85`
- Main-menu text bar: `8eef04`
- Main-menu text-bar font: `000000`
- Text view font: `000000`
- Text-view special / other-special colors: `af0c0d` / `0d0caf`
- Tabbed panel and popup background: `f9f9f9`
- Titlebar and functionbar font color: `000000`
- Configured titlebar and functionbar font sizes: `14`

The original default theme also has its own distinct palette and numerous image resources. The target's current design specification labels many visual values as reconstructed; they should not be treated as extracted source values.

### 3. Navigation needs source-backed mapping

The target Expo app currently exposes **Contacts, Chat, Settings, Help** as bottom tabs. The original help text describes the feature-phone main menu, buddy list, “EM” entry point, options menus, contact actions, and message-tab delivery/unread indicators. These concepts must be mapped screen-by-screen, not assumed equivalent because labels are similar.

### 4. Messaging architecture is legacy TCP/XML, not Supabase Realtime

The target's `src/services/wsClient.ts` uses `react-native-tcp-socket` and describes a custom XML stream over raw TCP. The original source `com/kolipri/kpr/j.java` opens `socket://host:port`; the original protocol code uses SASL PLAIN authentication. The target also uses local SQLite/Drizzle persistence and an offline queue.

Do **not** silently replace this with Supabase or standard WebSocket/XMPP. First verify the intended live service and compatibility. The source protocol uses SASL PLAIN over a raw TCP transport; Base64 is not encryption. Do not claim transport confidentiality or production security without verifying an appropriate protected transport/server configuration.

### 5. Automated verification is not yet established

The target package scripts define lint, formatting, and TypeScript checks, but no test script is defined in `package.json`. The repository's GitHub Actions workflow-run listing returned no runs. This does not prove the project fails to build; it means successful CI/build status has not been established by this audit.

## Priority plan

1. **P0 — Preserve source of truth:** use the original theme INI and assets for concrete visual values; label any unavoidable reconstruction explicitly.
2. **P0 — Protocol/security review:** inspect login, registration, PIN confirmation, socket framing, error paths, retries, and credential handling against the Java implementation. Never add real credentials to source or logs.
3. **P1 — Asset parity:** inventory every original asset, copy missing text/binary assets through a verified repository operation, and map them to components.
4. **P1 — UI parity:** build a screen/interaction matrix from Java UI classes and `help.txt`; then map each source behavior to the Expo route/component and compare actual screenshots.
5. **P1 — Reliability:** add or verify typecheck/lint/test/build automation and report the actual result of each command.
6. **P2 — Feature completeness:** validate contacts/roster operations, message delivery/unread indicators, status/presence, settings, and help against the source and available server behavior.

## Verification status

- [x] Target repository and current main commit identified.
- [x] Reference repository and source tree identified.
- [x] Original Uzzap and default theme INI values retrieved.
- [x] Original manifest and help text retrieved.
- [x] Target routes, theme implementation, protocol client, and package scripts inspected.
- [ ] Android build executed.
- [ ] TypeScript/lint commands executed.
- [ ] Runtime protocol integration tested.
- [ ] Screen-by-screen screenshot comparison completed.
- [ ] Pixel-perfect UI/UX parity verified.

## Primary source paths

- Reference: `META-INF/MANIFEST.MF`
- Reference: `themes/uzzap/theme.ini`
- Reference: `themes/default/theme.ini`
- Reference: `themes/uzzap/` and `themes/default/`
- Reference: `help.txt`, `help0.txt`
- Reference: `com/kolipri/kalypte/Kalypte.java`
- Reference: `com/kolipri/kpr/j.java`
- Target: `src/theme/uzzap.ts`
- Target: `src/theme/sources.ts`, `src/theme/parseThemeIni.ts`
- Target: `src/services/wsClient.ts`, `src/services/authService.ts`
- Target: `app/(app)/_layout.tsx`, `src/components/ui/index.tsx`
- Target: `package.json`
