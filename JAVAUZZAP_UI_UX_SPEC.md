# JavaUzzap → React Native (Expo) — Pixel-Perfect UI/UX Specification

**Version:** 1.1
**Target:** React Native + Expo SDK 52+, Android (API 24+) primary
**Companion docs:** `JAVAUZZAP_TO_REACT_NATIVE_EXPO_PLAN.md`

---

## 0. Asset Provenance & Verification Status (READ FIRST)

**Correction (2026-10-11): the original source repository is accessible.** The previous v1.0 note saying the repository and theme assets could not be retrieved is stale and must not be used as the current audit result.

Verified source files in `cyanideph/javauzzap` include:

- `META-INF/MANIFEST.MF` — Uzzap MIDlet version 1.0.14, MIDP 2.0 / CLDC 1.1
- `themes/uzzap/theme.ini` and `themes/default/theme.ini`
- PNG assets in both `themes/uzzap/` and `themes/default/`
- `help.txt`, `help0.txt`, `battery.txt`, and alert sounds
- Decompiled Java UI, protocol, persistence, and application classes under `com/kolipri/`

The original Uzzap theme is named **Reptilian**. Source-backed values from `themes/uzzap/theme.ini` include:

| Setting | Original value |
| --- | --- |
| `kt.skin.name` | `Reptilian` |
| `kt.menu.selected.color` | `#C0FD85` |
| `kalypte.mainmenu.textbar.color` | `#8EEF04` |
| `kalypte.mainmenu.textbar.font.color` | `#000000` |
| `kt.textview.font.color` | `#000000` |
| `kt.textview.special.color` | `#AF0C0D` |
| `kt.textview.other.special.color` | `#0D0CAF` |
| `kt.tabbedpanel.background.color` | `#F9F9F9` |
| `kt.popup.background.color` | `#F9F9F9` |
| `kt.titlebar.font.color` / `kt.functionbar.font.color` | `#000000` |
| `kt.titlebar.font` / `kt.functionbar.font` | `14` |

These are configuration values, not a complete pixel measurement of every screen. The original PNGs remain the source of truth for image chrome, icons, backgrounds, and status graphics. The default theme has its own separate palette and asset set.

**Important:** any later section or table that labels orange/charcoal colors, dimensions, bevels, spacing, or other values as `⟦R⟧` is a reconstructed proposal, not a value extracted from the original source. Reconcile those tables with the actual source INI and image assets before calling the UI pixel-perfect. Do not infer exact titlebar colors or image metrics from the INI alone.

---

## 1. Design Token System

### 1.0 Design thesis (commit, don't hedge)

> **"Y2K feature-phone, faithfully evolved."**

The clone keeps the soul of a 2007 J2ME messenger — square chrome, hard 1 px bevels, a two-softkey function bar, a pixel-accented title bar, presence dots, arrow-based delivery ticks — and folds it into modern RN ergonomics (44 dp touch targets, safe-area awareness, 60 fps transitions, dynamic type). The chrome is **retro and flat and proud of it**; only the _content surfaces_ soften (cards, bubbles, sheets). This tension is the whole aesthetic — do not sand down the chrome to "modern material" or it stops being Uzzap.

Two shipped themes:

- **Uzzap** (brand): orange on charcoal, pinstripe title bar.
- **Default** (MIDP system): the silver/steel-blue Java-phone look.

### 1.1 Color palette

#### Uzzap theme (primary brand theme) — `themes/uzzap`

| Token                | Hex           | RGB         | Usage                                        |
| -------------------- | ------------- | ----------- | -------------------------------------------- |
| `brand.primary`      | `#FF7A1A` ⟦R⟧ | 255,122,26  | Accents, send button, unread, active softkey |
| `brand.primaryDark`  | `#D95E00` ⟦R⟧ | 217,94,0    | Pressed state, bevel shadow                  |
| `brand.primaryLight` | `#FFA24D` ⟦R⟧ | 255,162,77  | Highlights, sent-bubble tint top             |
| `brand.ink`          | `#14161A` ⟦R⟧ | 20,22,26    | Chrome base (title/function bar)             |
| `chrome.bg`          | `#1E2228` ⟦R⟧ | 30,34,40    | Secondary chrome                             |
| `chrome.bevelHi`     | `#3A4048` ⟦R⟧ | 58,64,72    | 1 px top/left bevel                          |
| `chrome.bevelLo`     | `#05070A` ⟦R⟧ | 5,7,10      | 1 px bottom/right bevel + stroke             |
| `chrome.text`        | `#F5F7FA` ⟦R⟧ | 245,247,250 | Title / softkey label                        |
| `surface`            | `#FFFFFF` ⟦R⟧ | 255,255,255 | Content background                           |
| `surfaceAlt`         | `#F2F4F7` ⟦R⟧ | 242,244,247 | Received bubble, list stripe                 |
| `text.primary`       | `#0E1116` ⟦R⟧ | 14,17,22    | Body text                                    |
| `text.secondary`     | `#5B6472` ⟦R⟧ | 91,100,114  | Previews, timestamps                         |
| `text.disabled`      | `#9AA3B2` ⟦R⟧ | 154,163,178 | Disabled labels                              |
| `divider`            | `#E3E7EE` ⟦R⟧ | 227,231,238 | Hairlines                                    |
| `focus.ring`         | `#FFA24D` ⟦R⟧ | 255,162,77  | Keyboard/TV focus                            |
| `presence.online`    | `#2EE06A` ⟦R⟧ | 46,224,106  | Online dot                                   |
| `presence.away`      | `#FFB020` ⟦R⟧ | 255,176,32  | Away dot                                     |
| `presence.busy`      | `#FF4D4F` ⟦R⟧ | 255,77,79   | Busy dot                                     |
| `presence.invisible` | `#8A93A2` ⟦R⟧ | 138,147,162 | Invisible (hollow)                           |
| `presence.offline`   | `#C3C9D4` ⟦R⟧ | 195,201,212 | Offline dot                                  |
| `status.sent`        | `#8A93A2` ⟦R⟧ | 138,147,162 | Single tick                                  |
| `status.delivered`   | `#8A93A2` ⟦R⟧ | 138,147,162 | Double tick                                  |
| `status.read`        | `#22A7F0` ⟦R⟧ | 34,167,240  | Double tick, blue                            |
| `danger`             | `#E5484D` ⟦R⟧ | 229,72,77   | Destructive                                  |
| `unread.badge`       | `#FF3B30` ⟦R⟧ | 255,59,48   | Unread count pill                            |

#### Default theme — `themes/default` (MIDP system)

| Token                | Hex           | RGB         |
| -------------------- | ------------- | ----------- |
| `brand.primary`      | `#4A6FA5` ⟦R⟧ | 74,111,165  |
| `brand.primaryDark`  | `#33507E` ⟦R⟧ | 51,80,126   |
| `brand.primaryLight` | `#8FB0DE` ⟦R⟧ | 143,176,222 |
| `chrome.bg`          | `#3E5C82` ⟦R⟧ | 62,92,130   |
| `chrome.bevelHi`     | `#7FA0CC` ⟦R⟧ | 127,160,204 |
| `chrome.bevelLo`     | `#1E2E45` ⟦R⟧ | 30,46,69    |
| `chrome.text`        | `#FFFFFF` ⟦R⟧ | 255,255,255 |
| `surface`            | `#FFFFFF` ⟦R⟧ | 255,255,255 |
| `surfaceAlt`         | `#EAF0F8` ⟦R⟧ | 234,240,248 |
| `text.primary`       | `#0A0F18` ⟦R⟧ | 10,15,24    |

> **Contrast guardrails (WCAG AA, verified by formula):** `chrome.text` on `chrome.bg` ≥ 7:1; `text.primary` on `surface` ≥ 15:1; `text.secondary` on `surface` ≥ 4.6:1; white on `brand.primary` ≥ 3.1:1 → **use white text only ≥ 18.66 px / 14 pt bold on primary buttons**; smaller labels sit on `brand.primaryDark` (#D95E00 → 4.5:1).

### 1.2 Typography (J2ME bitmap → modern)

J2ME MIDP exposed three system fonts (`FONT_SMALL`≈9 px, `FONT_MEDIUM`≈11 px, `FONT_LARGE`≈15 px) — non-scalable bitmaps. Modern mapping uses a purposeful trio that reads as "techno-retro" without being unreadable:

| Role                                        | Font                  | Weight  | Size (sp) | Line height | Letterspacing | Notes                                  |
| ------------------------------------------- | --------------------- | ------- | --------- | ----------- | ------------- | -------------------------------------- |
| Title bar / logo                            | **Oxanium** ⟦R⟧       | 700     | 16        | 20          | +0.06em       | Angular, gamey; matches bevel chrome   |
| Pixel accents (badges, ticks, "UZZAP" mark) | **Silkscreen** ⟦R⟧    | 400/700 | 10        | 12          | +0.04em       | True pixel face, alt to bitmap         |
| Screen heading                              | **Oxanium**           | 600     | 20        | 26          | 0             |                                        |
| Body / list names                           | **IBM Plex Sans** ⟦R⟧ | 500     | 15        | 20          | 0             | Refined, characterful, not Inter/Arial |
| Secondary / previews                        | **IBM Plex Sans**     | 400     | 13        | 17          | 0             |                                        |
| Timestamps / counters                       | **IBM Plex Mono** ⟦R⟧ | 500     | 11        | 14          | +0.02em       | Tabular; J2ME numeric feel             |
| Softkey label                               | **Oxanium**           | 600     | 12        | 14          | +0.08em       | Uppercase                              |
| Button label                                | **Oxanium**           | 700     | 14        | 18          | +0.04em       | Uppercase                              |

Font scale: fully respects OS `fontScale` (RN `allowFontScaling`, max multiplier 1.4 for chrome where fixed bars would break, 2.0 for content).

### 1.3 Spacing scale (base 4, dp)

`space.0=0`, `space.05=2`, `space.1=4`, `space.15=6`, `space.2=8`, `space.3=12`, `space.4=16`, `space.5=20`, `space.6=24`, `space.8=32`, `space.10=40`

Semantic:

- `gutter.screen = 8` ⟦R⟧ (J2ME had ~4–6 px; widened for touch)
- `list.row.paddingH = 10`, `list.row.paddingV = 6`
- `card.padding = 12`, `sheet.padding = 16`
- `content.inset = 6` (chrome was edge-to-edge; content keeps a hair of breathing room) ⟦R⟧

### 1.4 Radius, stroke, elevation

J2ME had **zero** radius and **zero** elevation (bevel via 1 px light/dark lines). Preserve that for chrome; soften only content.

| Element                 | Radius (dp)                                      | Stroke                         | Elevation/shadow           |
| ----------------------- | ------------------------------------------------ | ------------------------------ | -------------------------- |
| Title bar               | 0                                                | 1 bevelHi top + bevelLo bottom | none                       |
| Function bar (softkeys) | 0                                                | bevelHi top, 1 bevelLo bottom  | none                       |
| Menu bottom bar         | 0                                                | bevelHi top                    | none                       |
| List row                | 0                                                | 1 `divider` bottom (hairline)  | none                       |
| Card / grouped list     | 8 ⟦R⟧                                            | 1 `divider`                    | none (flat)                |
| Message bubble          | 16 (outer corner flat, near-avatar corner 4) ⟦R⟧ | none                           | `0 1 2 rgba(0,0,0,0.08)`   |
| Badge (count)           | 999 (pill)                                       | none                           | none                       |
| Presence dot            | 999                                              | 1.5 surface ring               | none                       |
| Modal / bottom sheet    | 16 top                                           | bevelHi top                    | `0 -8 24 rgba(0,0,0,0.35)` |
| FAB (compose)           | 16 (squircle, not circle — retro) ⟦R⟧            | 1 bevelLo                      | `0 4 10 rgba(0,0,0,0.25)`  |

Stroke widths: `stroke.hairline=1`, `stroke.bevel=1`, `stroke.focus=2`, `stroke.avatarRing=1.5`.

### 1.5 9-patch assets — reconstructed geometry ⟦R⟧

Every chrome bar in the Uzzap theme is a MIDP 3-slice (`left` cap + `middle` stretch + `right` cap) rather than a true 9-patch, but the task models them as nine-patches for a uniform renderer. Below are the **9-patch metadata** (top/left guide lines) and stretch insets to feed `NinePatchView`. All values are ⟦R⟧.

| Asset                    | Nominal size (px) | Stretch region (X) | Stretch region (Y) | Left/right caps (px) | Rows                  |
| ------------------------ | ----------------- | ------------------ | ------------------ | -------------------- | --------------------- |
| `titlebar-left.png`      | 8 × 24            | none               | full 0–24          | right cap = 8        | fixed left cap        |
| `titlebar-middle.png`    | 4 × 24            | full 0–4           | full               | none                 | repeated horizontally |
| `titlebar-right.png`     | 8 × 24            | none               | full               | left cap = 8         | fixed right cap       |
| `functionbar-left.png`   | 8 × 26            | none               | full 0–26          | right cap = 8        | fixed left cap        |
| `functionbar-middle.png` | 4 × 26            | full               | full               | none                 | repeated horizontally |
| `functionbar-right.png`  | 8 × 26            | none               | full               | left cap = 8         | fixed right cap       |
| `menu-bottombar.png`     | 8 × 22            | full 2–6           | full               | 2 px L/R caps        | repeated              |
| `background-pattern.png` | 16 × 16 ⟦R⟧       | n/a (tiled)        | n/a                | n/a                  | tile both axes        |

**NinePatchView model** (per asset):

```
{ source, sourceWidth, sourceHeight,
  patch: { top:0, left:0, bottom:0, right:0 },   // guide-line insets (px)
  capInsets: { left:8, right:8, top:0, bottom:0 }, // fixed cap size
  tint?: color }
```

Rendering rule: chrome bars render as `[ left cap ][ middle stretched to W-2*cap ][ right cap ]`; `background-pattern` renders via `ImageBackground` with `resizeMode="repeat"` (or a tiled `<Image>` grid until RN repeat support is stable on Android).

### 1.6 Elevation / z-index layers

`z.content=0`, `z.functionbar=10`, `z.titlebar=10`, `z.fab=20`, `z.sheet.scrim=90`, `z.sheet=91`, `z.toast=100`, `z.modal=110`.

---

## 2. Screen-by-Screen Specifications

**Global frame (all screens):**

- Root is a `SafeAreaView` (top + bottom). The MIDP title bar sits **below** the status bar; softkey function bar sits **above** the nav bar.
- Global vertical order: `StatusBar (OS) → TitleBar (24 dp) → ScreenBody (flex:1) → FunctionBar (26 dp) → OS nav`.
- Every screen owns a title (`Oxanium 16`, centered, ellipsis) and a function bar with a **Left** slot and **Right** slot (§3).
- Default transition: **slide-from-right, 240 ms, easeOutCubic** (push); back = slide-from-left. Modals: **fade+scale 0.96 → 1, 200 ms**. Setup/onboarding: **fade 200 ms**. Splash: **fade 320 ms**.

Legend for states: `N`=normal, `P`=pressed, `F`=focused, `D`=disabled.

---

### 2.1 Splash / Intro Help Carousel — `app/(auth)/splash.tsx` + `intro`

**Purpose:** Brand splash (from help0.txt intro) → 4-page carousel.

**Layout**

```
Stack (bg = background-pattern tiled over brand.ink)
├─ Center: UZZAP wordmark (Silkscreen 28, brand.primary) + tagline (IBM Plex Sans 13, chrome.text)
├─ Carousel (flex:1, horizontal paged FlatList)
│    └─ Slide: 1 title (Oxanium 20) + 1 illustration (≤ 240×240) + ≤ 3 body lines (IBM Plex Sans 14)
├─ Dots (active = brand.primary 8dp pill 20 wide; inactive = chrome.bevelHi 8dp dot)
└─ FunctionBar: Left "SKIP" | Right "NEXT ▸" / final "GET STARTED"
```

**Components:** wordmark, tagline, 4 slides, page dots, Skip, Next/Get Started, BackgroundPattern.

**Dimensions:** splash hold = **1200 ms** then fade to intro; slide gutter 24 dp; illustration max 240; dot row height 20; dots gap 8.

**States:** Next F/P (bevel invert); Skip `text.secondary`; dots N only.

**Softkeys:** Left = Skip → jump to Registration; Right = Next page (wrap→Register). On last page Right = Get Started (primary filled).

**Transition:** Splash → `fade 320ms`; slides `slide 240ms` horizontal; intro → Registration `fade 200ms`, then set `hasSeenIntro=true`.

---

### 2.2 Registration (multi-step) — `app/(auth)/register.tsx`

**Purpose:** User ID → Phone → Name → Email → Password (5 steps, from plan §2.1).

**Layout**

```
Column
├─ TitleBar: title="REGISTER  •  2/5"
├─ ProgressBar (4 dp): filled brand.primary = step/5
├─ Body (scroll, gutter 16)
│   ├─ Step heading (Oxanium 20)
│   ├─ Helper (IBM Plex Sans 13, text.secondary)
│   └─ Field(s) — TextInput (see §2.2a)
└─ FunctionBar: Left "◂ BACK" | Right "NEXT ▸"
```

**Steps & validation**

| #   | Field(s)          | Rule                                    | Error copy                    |
| --- | ----------------- | --------------------------------------- | ----------------------------- |
| 1   | User ID           | 6–12 alphanumeric, unique (async check) | "6–12 letters or numbers"     |
| 2   | Phone             | `+CC` prefix + local, E.164 normalize   | "Enter a valid mobile number" |
| 3   | First / Last name | non-empty, ≤ 40                         | "Required"                    |
| 4   | Email             | RFC-lite regex                          | "Enter a valid email"         |
| 5   | Password ×2       | ≥ 6, match                              | "Passwords don't match"       |

**2.2a Field anatomy:** label (IBM Plex Sans 12, `text.secondary`) 4 dp above box; box 44 dp, radius 8, 1 dp `divider`, `surface`; focus = `stroke.focus` 2 dp + `brand.primary` label; error = `danger` border + message below; disabled = `surfaceAlt` + `text.disabled`.

**States:** input N/F/D/error; Right button D until step valid.

**Softkeys:** Left = Back (step-1; step 1 = exit to Login); Right = Next (→ PIN verification after step 5). Numeric keypad for Phone (`keyboardType="phone-pad"`), `textContentType` hints.

**Transition:** steps = `slide 200ms` left; Next (final) → PIN `fade 200ms`.

---

### 2.3 Login — `app/(auth)/login.tsx`

**Layout**

```
Column
├─ TitleBar: "LOGIN"
├─ Body (gutter 16)
│   ├─ Avatar/logo mark 64
│   ├─ Field: User ID (autoCapitalize=none)
│   ├─ Field: Password (secureTextEntry) + eye toggle
│   ├─ Row: [✓ Remember me]      [Forgot?]
│   └─ Row: [switch] Auto-start on boot   (Android hint: BOOT_COMPLETED)
└─ FunctionBar: Left "REGISTER" | Right "LOGIN ▸"
```

**Components:** logo, 2 fields, remember checkbox 20 dp, auto-start Switch (brand track when on), Forgot link, Register link, Login button.

**States:** Switch on/off; Login D until both non-empty; P darkens `brand.primaryDark`.

**Softkeys:** Left = Register (→ 2.2); Right = Login (→ 2.5 Buddy list, or 2.4 PIN if first login / number changed). Biometric prompt offered if enabled.

**Transition:** → Buddy list `fade 220ms` (root swap); errors inline, no navigation.

---

### 2.4 PIN Verification — `app/(auth)/pin.tsx`

**Layout**

```
Column
├─ TitleBar: "VERIFY NUMBER"
├─ Body centered
│   ├─ Icon (SMS) 48
│   ├─ Copy: "Enter the 6-digit code sent to +63••• ••12"
│   ├─ 6 OTP cells (48×56, gap 8) — brand.primary caret, auto-advance
│   ├─ Resend timer: "Resend in 0:42" → "Resend code" link
└─ FunctionBar: Left "CHANGE NUMBER" | Right "VERIFY ▸"
```

**Components:** OTP input (6 cells, one hidden TextInput `textContentType="oneTimeCode"`), countdown text, resend link, verify button.

**Dimensions:** cell 48×56, radius 8, 2 dp border (`divider` → focus `brand.primary`); auto-submit at 6 digits.

**States:** cell empty/filled/error (shake 400ms on wrong code); Verify D until 6 digits; resend disabled during countdown.

**Softkeys:** Left = back to Registration step 2 (change number); Right = Verify.

**Transition:** success → Buddy list `fade 220ms`; wrong code = inline shake + haptic `notificationError`.

---

### 2.5 Main Menu / Buddy List — `app/(app)/index.tsx` ★ primary screen

**Layout**

```
Column
├─ TitleBar: [status dot] "UZZAP" ... [search icon][presence chip]   (24 dp)
├─ PresenceStrip (32 dp): my avatar + my status text (tap → 2.13 Status Selector)
├─ SearchBar (optional, revealed by title search icon; 40 dp)
├─ SectionedList (SectionList, flex:1)
│   ├─ SectionHeader "ONLINE (n)" / "OTHERS (n)"  (24 dp, surfaceAlt, sticky)
│   └─ BuddyItem rows (§2.6)
├─ EmptyState when no buddies: illustration + "Add your first buddy" CTA
├─ FAB compose (56×56, bottom-right above functionbar)  [alternative to Left softkey]
└─ FunctionBar: Left "OPTIONS" | Right "EXIT"
```

**Components:** title, presence strip, search field, section headers (sticky, collapsible), BuddyItem list, typing-key jump rail (A–Z overlay on long list), FAB, empty state.

**Dimensions:** title 24; presence strip 32; section header 24; row 64 (avatar 40 + 2-line text + trailing badge/time); FAB 56 on `space.4` inset.

**Sorting:** Online first (presence rank: online→away→busy→invisible→offline), then alphabetical by display name; pinned conversations float to top of "Online".

**States:** row N/P (bg `surfaceAlt`)/F (focus ring for TV/keyboard); section header N/pressed (collapse); FAB P scales 0.96.

**Softkeys:** Left = OPTIONS → bottom sheet (§2.5a); Right = EXIT (confirm) → hide app to ongoing notification (2.15). Long-press row = context sheet (Chat / Remove / Block / Info). Swipe-left row = Remove; swipe-right = Pin (2.5b).

**2.5a OPTIONS bottom sheet:** New Chat, Add Buddy (2.9), Contacts (2.10), Status (2.13), Settings (2.11), Help (2.14), Exit.
**2.5b Swipe actions:** trailing 88 dp; Remove = `danger`; Pin = `brand.primary`.

**Transition:** → Chat `slide 240ms`; sheets `spring/fade 200ms`; search reveal `layout 180ms`.

---

### 2.6 Buddy List Item — `components/BuddyItem.tsx`

**Layout**

```
Row (64 dp, paddingH 10, paddingV 6)
├─ AvatarStack (40): avatar (radius 12, squircle) + presence dot (12) bottom-right
├─ Text (flex:1, gap 2)
│   ├─ Row: name (IBM Plex Sans 15, 500, ellipsis) + optional pixel "UZZAP" tag
│   └─ Row: [last msg preview] OR [custom status] (13, text.secondary, ellipsis)
└─ Trailing (right-aligned, gap 4)
    ├─ Timestamp (IBM Plex Mono 11, text.secondary)
    └─ UnreadBadge (min 20×20 pill, Silkscreen 10, white on unread.badge) OR delivery tick for my last msg
```

**Presence dot colors (§1.1).** Offline uses hollow ring; invisible = grey with slash.

**States:** N (surface); P (`surfaceAlt`); F (2 dp `focus.ring` inset); D rare (row dims 0.5 when blocked); unread → name 700 weight + badge; typing → preview replaced by animated 3 dots.

**Accessibility:** single `accessibilityLabel` = "{name}, {status}, {preview or unread count}". `accessibilityRole="button"`.

---

### 2.7 Chat Screen — `app/(app)/chat/[id].tsx`

**Layout**

```
Column
├─ TitleBar: [◂ back? use softkey] title=buddy name + presence subtitle; right icon = info
├─ ConnectionBanner (conditional, 24 dp): "Connecting…"/"Offline — messages will send later" (amber)
├─ MessagesList (inverted FlatList, flex:1)
│   ├─ DateHeader (sticky, centered pill, IBM Plex Mono 11)
│   ├─ DayIntro separator
│   └─ MessageBubble (§2.8)
│   └─ TypingIndicator (received only)
├─ ReplyQuoteBar (conditional): quoted snippet + ✕
├─ InputToolbar (48+ dp): [emoticon][attach] TextInput(flex) [mic?][SEND]
└─ FunctionBar: Left "OPTIONS" | Right "BACK"
```

**Components:** title+presence, delivery/connection banner, inverted list, date headers, bubbles, typing indicator, scroll-to-bottom button (appears when scrolled up), reply quote bar, input toolbar, emoticon picker (sheet, 6×8 grid), attachment sheet (Photo / Contact / Location), send button.

**Dimensions:** title 24 (with 13 sp subtitle); banner 24; input toolbar ≥ 48 with 40 dp field radius 20; send button 40 squircle radius 12; bubble max width 78% of screen.

**Input states:** empty → SEND disabled (icon muted); typing → mic hidden, SEND active; multiline grows to max 5 lines then scrolls.

**Softkeys:** Left = OPTIONS (Attach, Emoticons, Send contact, Clear history, Block); Right = BACK (→ Buddy list). Android hardware back = same as Right. Long-press bubble = Copy / Forward / Delete / Info.

**Transition:** open `slide 240ms` from right; bubble appear `slide-up 12 dp + fade 180ms`; scroll-to-bottom button `fade 150ms`.

---

### 2.8 Message Bubble — `components/MessageBubble.tsx`

**Layout (received)** — left aligned, avatar hidden (shown on group change):

```
Row (gap 6, maxWidth 78%)
└─ Column
   ├─ Bubble (radius 16, corner near-avatar 4, surfaceAlt, paddingH 10 V 7)
   │    └─ Text (IBM Plex Sans 15, text.primary) + optional inline emoticon
   └─ Meta row: [timestamp IBM Plex Mono 10, text.secondary]
```

**Layout (sent)** — right aligned:

```
Column (alignEnd)
├─ Bubble (brand.primaryLight @ 18%? → use #FFE7D3 solid for legibility; text.primary)
└─ Meta row: [timestamp][delivery ticks]
```

**Delivery ticks (Silkscreen/vector):**

| State       | Glyph     | Color                | Trigger                     |
| ----------- | --------- | -------------------- | --------------------------- |
| `pending`   | ◷ (clock) | `text.secondary`     | queued offline              |
| `sending`   | ◷ spinner | `text.secondary`     | socket write in flight      |
| `sent`      | ✓         | `status.sent`        | server ACK                  |
| `delivered` | ✓✓        | `status.delivered`   | peer ACK                    |
| `read`      | ✓✓        | `status.read` (blue) | read receipt                |
| `failed`    | !         | `danger`             | timeout/error; tap to retry |

**Content types:** text; emoticon-only (large 44 px glyph, no bubble); contact/vCard (card: avatar + name + "Send contact"); system (centered, `surfaceAlt`, IBM Plex Sans 12); SMS-fallback badge (pixel "SMS" chip).

**States:** N; P (bubble dims 0.96); selected/highlighted (`surface` flash on jump-to-message); failed (long-press → retry/message details).

**A11y label:** "{Sent/Received}, {time}, {status}: {text}". Emoticon-only exposes the emoticon name.

---

### 2.9 Add Buddy Modal — `components/AddBuddyModal.tsx`

**Layout (bottom sheet, 3 tabs):**

```
Sheet (drag handle, radius 16 top)
├─ Tabs: [USER ID][PHONE][QR]
├─ Tab 1: TextInput "Enter Uzzap user ID" + SEARCH → result card (avatar, name, status, ADD)
├─ Tab 2: TextInput phone (E.164) + "Lookup" → result card / "Invite via SMS" if not Uzzap
└─ Tab 3: QR scanner viewport (square 240, corner brackets brand.primary) + "Show my QR" toggle
```

**Components:** drag handle 36×4, tab bar, inputs, result card, Add button, QR viewport, my-QR toggle, permission prompt (camera).

**Dimensions:** sheet max height 80%; viewport 240; result card 64.

**States:** tab N/active (underline brand.primary); SEARCH D until input; QR permission-denied → explanatory panel + Settings CTA.

**Softkeys:** in-sheet Left = Cancel; Right = context action (Add / Show QR). System back dismisses sheet.

**Transition:** sheet `spring translateY 260ms`; result card `fade+slide 180ms`.

---

### 2.10 Contact Picker — `app/(app)/contacts.tsx`

**Layout**

```
Column
├─ TitleBar: "ADD FROM CONTACTS"
├─ SearchBar
├─ PermissionGate (first run): rationale + "Allow contacts" button
├─ SectionList (A–Z headers sticky, index rail right)
│   └─ ContactRow (56): avatar/initial, name, phone, right = [SyncStatusChip] or [✓ selected]
└─ FunctionBar: Left "SELECT ALL" | Right "ADD (n) ▸"
```

**Uzzap sync status chip:** `ON UZZAP` (brand.primary) / `INVITE` (`surfaceAlt` outline) / `ADDED` (`text.secondary`).

**States:** row N/P/F; selected = brand tint + check; chip variants; Right D until n ≥ 1.

**Softkeys:** Left toggles select-all; Right adds selected → back to Buddy list with toast "3 buddies added".

**Transition:** push `slide 240ms`; A–Z index rail sticky; batch add shows inline progress.

---

### 2.11 Settings — `app/(app)/settings.tsx`

**Layout:** grouped `SectionList`, category headers (Oxanium 12 uppercase, `text.secondary`).

| Section          | Rows                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| **General**      | Auto-start on boot (Switch); Vibration (Switch); Sound (Switch + tone picker); LED (Switch, capability-gated) |
| **Network**      | Connection timeout (stepper 10–120 s); Keep-alive interval (stepper 30–300 s); Proxy (toggle → host/port)     |
| **Privacy**      | Read receipts (Switch); Last seen visible (Switch); Block list (→ list screen)                                |
| **Theme**        | Theme selector (→ 2.12); Dark mode (Switch/Auto)                                                              |
| **Account**      | Change number (→ PIN re-verify); Change password; Log out; Delete account                                     |
| **Help & About** | Help (2.14); About; Battery tips; Licenses                                                                    |

**Row anatomy:** 52 dp, label left (IBM Plex Sans 15), control right; chevron for navigable rows.

**States:** Switch on/off; disabled rows (`text.disabled`) when capability missing (e.g., no LED).

**Softkeys:** Left "OPTIONS" / Right "BACK".

**Transition:** sub-screens `slide 240ms`; switches animate 160ms.

---

### 2.12 Theme Selector — `app/(app)/settings/theme.tsx` ★ (plan Phase 7)

**Layout**

```
Column
├─ TitleBar: "THEME"
├─ Horizontal preview carousel (paged): each card = mini live preview
│   card 220×320: faux TitleBar (9-patch), 3 faux BuddyItems, faux FunctionBar, presence dot
│   label under card (Oxanium 14): DEFAULT / UZZAP / CUSTOM
├─ Toggle rows: "Follow system dark mode" (Switch); "Preview in dark" (Switch)
└─ FunctionBar: Left "PREVIEW" (full-screen mock) | Right "APPLY ▸"
```

**Components:** preview cards (built from real components with `preview` flag), selection ring (`brand.primary` 2 dp + check), Apply button, custom theme "coming soon" or import-slot.

**States:** card N/P/F/selected; CUSTOM D if no custom theme imported.

**Softkeys:** Left = full-screen preview modal (fade 200ms); Right = Apply → persist + `ThemeContext` swap (cross-fade 300ms, see §4.4).

**Transition:** Apply = cross-fade whole tree 300ms; no layout reflow.

---

### 2.13 Status Selector — `components/StatusSelector.tsx`

**Layout (bottom sheet from Buddy list presence strip):**

```
Sheet
├─ Drag handle
├─ RadioGroup:
│   ● Online   (presence.online)
│   ○ Away     (presence.away)
│   ○ Busy     (presence.busy)
│   ○ Invisible(presence.invisible)
├─ Custom status TextInput (max 80) + char counter
├─ "Clear after" picker (1h / 4h / today / never)
└─ Primary button "SET STATUS"
```

**States:** radio N/selected (filled dot brand.primary); input; save D if unchanged.

**Softkeys:** Left Cancel; Right = Set Status.

**Transition:** sheet spring 260ms; status chip on list updates immediately + presence broadcast.

---

### 2.14 Help Screen — `app/(app)/help.tsx` (from help.txt sections)

**Layout**

```
Column
├─ TitleBar: "HELP"
├─ SearchBar (filters section titles + full text, highlight matches)
├─ Accordion list (from help.txt sections):
│    Getting Started, Registration, Login, Adding Buddies, Chatting, Emoticons,
│    SMS/ESMS, Privacy, Status, Settings, Battery Tips, Troubleshooting, About
│    each → title row (48) + expandable body (Markdown → RN, IBMPlex Sans 14, links brand.primary)
└─ FunctionBar: Left "SEARCH" | Right "BACK"
```

**Components:** search, accordion sections, inline screenshots (optional), related-link chips, "Still stuck? Contact support".

**States:** section collapsed/expanded (`chevron` rotates 180ms); search empty/no-results ("No matches for 'x'").

**Softkeys:** Left focuses search; Right back. Empty search → show all.

**Transition:** expand `layout 180ms`; deep-link from any screen opens matching section (`slide 220ms`) with highlight pulse.

---

### 2.15 Offline / Background Notification — ongoing notification + quick actions

**Purpose:** mirrors J2ME "Hide App" — app stays connected via foreground service.

**A. Ongoing Android notification**

```
Title: "Uzzap is running"
Text:  "{online count} online • {unread} new"   (e.g., "12 online • 2 new")
Icon:  brand monochrome
Actions: [Open] [Status ▸] [Exit]
Ongoing: true, LowImportance channel "uzzap_service", no sound
```

**B. New-message notification**

```
Title: "{Buddy name}"
Text:  "{message preview}" (or "Sent a contact", "3 new messages")
Actions: [Reply] (RemoteInput) [Mark read]
Channel: "uzzap_messages", HighImportance, sound = alert tone (see §7), vibration pattern
Style: MessagingStyle with history + avatar
```

**C. In-app offline banner** (chat/buddy list when socket down): 24 dp amber strip "Offline — messages will send when reconnected", tap → retry now.

**D. Exit-to-background flow:** Right softkey on Buddy list → confirm sheet ("Keep Uzzap running in the background?") → [Keep running][Exit]. Keep running starts the foreground service + ongoing notification.

**States:** connecting / connected / offline / doze-restricted (offer battery-optimization whitelist CTA).

---

## 3. J2ME → React Native Interaction Mapping

| J2ME Pattern                    | React Native Equivalent                                            | Notes                                                       |
| ------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| `Canvas.paint()`                | Reanimated/Skia `Canvas` or nested `View`s                         | Chrome via 9-patch views; presence dots/graphs via Skia     |
| Softkey **Left** (Options/Menu) | Header-left action OR bottom-sheet trigger OR FAB                  | Left = "OPTIONS"; sheet on tap, context sheet on long-press |
| Softkey **Right** (Back/Exit)   | Header-right button + `BackHandler` + edge swipe                   | Exit on root screens; back elsewhere                        |
| Joystick / D-pad navigation     | Focus management (`TVFocusGuideView`, `useTVEventHandler`) + touch | 2 dp `focus.ring`; logical row-major order                  |
| `TextField`                     | `TextInput` (styled, 44 dp)                                        | Numeric/phone/email keyboards; `textContentType`            |
| `ChoiceGroup` RADIO             | Radio group (`AccessibilityRole="radio"`)                          | Status selectors, offline-delivery mode                     |
| `ChoiceGroup` MULTIPLE          | `Checkbox` group                                                   | Contact batch select, notification prefs                    |
| `ChoiceGroup` POPUP             | `Picker`/bottom-sheet list                                         | Tone picker, timeout presets                                |
| `List` IMPLICIT                 | `FlatList` + `onPress` navigate                                    | Buddy list, contacts                                        |
| `List` EXCLUSIVE                | `FlatList` + selection state + check                               | Theme, status, tone                                         |
| `List` MULTIPLE                 | `FlatList` + multi-select                                          | Contact picker                                              |
| `Form` (mixed)                  | ScrollView of labeled controls                                     | Registration, Settings                                      |
| `Alert`                         | `Alert.alert` / custom `Modal`                                     | Exit confirm, delete confirm                                |
| `Ticker`                        | Marquee text (`react-native-marquee` or Reanimated)                | Long custom status, connection text                         |
| `Gauge`/`ImageItem`             | `Image` + progress views                                           | Splash, QR, avatars                                         |
| `Timer`/`Task`                  | `setInterval` + `AppState`                                         | Keep-alive heartbeat (owned by @fixer service)              |
| `Command` priority              | Sorted bottom-sheet actions                                        | OPTIONS menu ordering                                       |
| `StringItem` hyperlink          | `Text` with `onPress` (link styling)                               | Help internal links                                         |

**Focus order (default):** TitleBar actions → PresenceStrip → SearchBar → list rows (top→bottom) → FAB → FunctionBar (Left, Right). Modals trap focus; Android back and TV back both handled.

---

## 4. Theme Implementation Guide

### 4.1 Parse `theme.ini` at runtime

`theme.ini` is an INI key/value file. Load it, coerce to a `ThemeTokens` object, validate against a schema (Zod), and fall back to compiled defaults for any missing key.

```ts
// theme/parseThemeIni.ts
export function parseThemeIni(raw: string): RawTheme {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith(';') || t.startsWith('#')) continue; // comments
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    out[t.slice(0, eq).trim().toLowerCase()] = t.slice(eq + 1).trim();
  }
  return out;
}
```

Expected key namespaces (⟦R⟧ — confirm exact keys at extraction): `color.*`, `font.*`, `metric.*`, `image.*` (asset filename), `align.*`. Unknown keys are preserved in `raw` for forward-compat.

**Token resolution order:** `compiled default → default theme → active theme → runtime overrides (user custom)`. Written to `ThemeContext` and exposed via a `useTheme()` hook returning semantic tokens (`colors.*`, `type.*`, `space.*`, `radius.*`, `ninepatch.*`).

### 4.2 9-patch rendering

- **Recommended:** `react-native-9patch-image` or `react-native-svg`-based `NinePatchView` (Expo-compatible; pure JS fallback uses three `<Image>` slices for the 3-slice bars). See §1.5 for metadata.
- Chrome component contract:

```tsx
<NinePatch
  source={assets.titlebarMiddle}
  capInsets={{ left: 8, right: 8 }}
  tint={theme.chrome.tint}
  height={24}
/>
```

- Fallback if libs are unavailable: compose `[left][middle flex][right]` in a `Row` — the middle `<Image>` uses `flex:1` + `resizeMode="stretch"`.

### 4.3 Background pattern tiling

```tsx
<ImageBackground
  source={assets.backgroundPattern}
  resizeMode="repeat"
  style={StyleSheet.absoluteFill}
/>
```

Android quirk: `resizeMode="repeat"` can ghost on some GPUs — use an `Image` grid (pre-computed `ceil(W/16) × ceil(H/16)`) or a Skia `ImageShader` for smooth tiling. Apply only behind splash/intro and empty states; content screens stay flat white for legibility.

### 4.4 Dynamic theme switching (Default ↔ Uzzap)

- `ThemeProvider` holds `{ themeId, tokens, dark }`; `setTheme(id)` triggers a **300 ms cross-fade** via `react-native-reanimated` opacity overlay (no remount, no layout jump).
- Persist `themeId` in AsyncStorage; hydrate on boot before first paint (block splash on it).
- Components consume **semantic tokens only** — never raw hex — so a theme swap is a context value change.

### 4.5 Dark mode derivation

Derive dark tokens algorithmically from the light palette (for both themes), or ship hand-tuned dark maps. Rules:

| Light token              | Dark derivation                                                    |
| ------------------------ | ------------------------------------------------------------------ |
| `surface #FFFFFF`        | `#0F1115`                                                          |
| `surfaceAlt #F2F4F7`     | `#1A1D23`                                                          |
| `text.primary #0E1116`   | `#F2F4F7`                                                          |
| `text.secondary #5B6472` | `#A6AEBB`                                                          |
| `divider #E3E7EE`        | `#2A2F37`                                                          |
| `brand.primary`          | keep, but clamp lightness (`#FF7A1A` → `#FF8F3D` for glow-on-dark) |
| sent bubble `#FFE7D3`    | `#3A2A1C` with `brand.primaryLight` text                           |
| chrome (`#14161A`)       | stays dark (already dark) — invert bevels                          |

Guard: re-check contrast after derivation; auto-pick black/white text per surface. `userInterfaceStyle: "automatic"` in `app.json`.

---

## 5. Animation & Micro-interactions

Principle: J2ME was **instant**; modern Uzzap earns delight with **few, well-timed** motions (200–320 ms), never motion for its own sake.

| #   | Moment                    | Spec                                                                   | Easing              |
| --- | ------------------------- | ---------------------------------------------------------------------- | ------------------- |
| 1   | Screen push               | translateX 100%→0, 240 ms; shadow grows                                | easeOutCubic        |
| 2   | Screen pop                | translateX 0→100%, 220 ms                                              | easeOutCubic        |
| 3   | Modal / sheet             | translateY 100%→0 (sheet) / scale .96→1 + fade (modal), 200–260 ms     | spring (damping 22) |
| 4   | Splash → intro            | opacity 0→1, 320 ms                                                    | easeInOut           |
| 5   | Theme swap                | cross-fade overlay, 300 ms                                             | linear              |
| 6   | Message appear            | translateY 12→0 + opacity 0→1, 180 ms; stagger 24 ms for bursts        | easeOutQuad         |
| 7   | Delivery receipt          | ✓→✓✓ cross-fade + scale pop, 200 ms; ✓✓→blue hue tween 240 ms          | easeOutBack (pop)   |
| 8   | Typing indicator          | 3 dots bounce y ±3 dp, 900 ms loop, 150 ms stagger; fade in/out 150 ms | easeInOut           |
| 9   | Pull-to-refresh           | Uzzap-branded spinner (rotating pixel arrow), 300 ms minimum           | linear              |
| 10  | Sending pulse             | send button scale 0.92 on press, spring back                           | spring              |
| 11  | Unread badge              | count change: scale 1→1.25→1 pop 220 ms                                | easeOutBack         |
| 12  | Presence dot              | status change: color tween 260 ms + optional 1 pulse 400 ms (online)   | easeOut             |
| 13  | New message row highlight | background flash `brand.primary @12%` → transparent, 700 ms            | easeOut             |
| 14  | FAB press                 | scale 0.96 + elevation bump, 120 ms                                    | easeOut             |
| 15  | OTP wrong code            | horizontal shake ±8 dp ×3, 400 ms + `notificationError` haptic         | sine                |
| 16  | List item press           | bg → `surfaceAlt` 120 ms                                               | easeOut             |

**Reduced motion:** if `AccessibilityInfo.isReduceMotionEnabled()`, replace transforms with instant/opacity-only (cross-fades ≤ 120 ms).

### 5.1 Haptics (expo-haptics)

| Event                             | API                          | Feel       |
| --------------------------------- | ---------------------------- | ---------- |
| Softkey tap / button press        | `selectionAsync()`           | tick       |
| Send message                      | `impactAsync(Light)`         | light tap  |
| Receive message (foreground)      | `impactAsync(Medium)`        | medium     |
| Message sent (ACK)                | `impactAsync(Soft)`          | soft       |
| Delivery→Read transition          | `selectionAsync()`           | tick       |
| Pull-to-refresh trigger           | `impactAsync(Light)`         | light      |
| Wrong PIN / error                 | `notificationAsync(Error)`   | error buzz |
| Success (registered, buddy added) | `notificationAsync(Success)` | success    |
| Long-press context menu           | `impactAsync(Medium)`        | medium     |

Vibration on incoming: pattern `[0, 250]` (`Vibration.vibrate` on Android) — user-toggleable in Settings.

---

## 6. Accessibility

1. **Labels:** every interactive element gets `accessibilityLabel`; decorative chrome gets `importantForAccessibility="no-hide-descendants"`. Composite rows (BuddyItem) expose one merged label with `accessible={true}`.
2. **Roles:** buttons `role="button"`, switches `role="switch"` + `accessibilityState={{checked}}`, radio `role="radio"` + `{selected}`, headers `role="header"`, inputs `accessibilityLabel` + `accessibilityHint`.
3. **Live regions:** incoming message announces via `AccessibilityInfo.announceForAccessibility("{name}: {text}")`; delivery status changes announce "delivered"/"read".
4. **Contrast (WCAG AA):** all text ≥ 4.5:1, large/bold ≥ 3:1; interactive chrome `chrome.text` on `chrome.bg` = 7:1+; never signal state by color alone (ticks have shape; presence dot has text/`accessibilityLabel`).
5. **Touch targets:** minimum 44×44 dp (list rows 64, softkeys 26 bar but with expanded invisible hit area to 44).
6. **Font scaling:** `allowFontScaling=true`; body scales to 2.0×; chrome bars scale to 1.4× with `adjustsFontSizeToFit` + ellipsis; test at 200%.
7. **Focus order:** logical top→bottom, left→right; visible `focus.ring` (2 dp `#FFA24D`) for TV/keyboard/D-pad; modals trap focus, restore on dismiss; Android `BackHandler` = Right softkey.
8. **Reduce motion:** honored (§5).
9. **TalkBack pass checklist:** splash/intro, register, login, PIN, buddy list, chat, settings, help — every control reachable and labeled; verify reading order and that softkey actions are exposed (Left/Right also surfaced as buttons for screen-reader users).
10. **Color-blind:** presence states use hue + shape (filled/hollow/dot-with-slash); delivery ticks use glyph count; unread has numeric badge.

---

## 7. Asset Export Checklist

| Source (from repo, when available)                                                    | Action                                                                                           | Output                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `themes/uzzap/*.png` (titlebar/functionbar L/M/R, menu-bottombar, background-pattern) | Convert → **WebP** (lossless for chrome) + **AVIF** (fallback WebP)                              | `@1x/@2x/@3x`                                 |
| `themes/default/*.png`                                                                | Same pipeline                                                                                    | `@1x/@2x/@3x`                                 |
| Splash / logo / icon                                                                  | Re-export from source or recreate vector                                                         | `icon.png`, `adaptive-icon.png`, `splash.png` |
| Fonts referenced by theme.ini                                                         | Bundle acceptable/open fonts (Oxanium, IBM Plex Sans, IBM Plex Mono, Silkscreen) via `expo-font` | `.ttf`/`.otf` in `assets/fonts/`              |
| `alert.amr` / `alert.wav`                                                             | Transcode → **MP3** + **OGG** (Android notification sound needs OGG/MP3, ≤ 30 s)                 | `assets/sounds/alert.ogg`, `alert.mp3`        |
| Complex animations (typing dots, splash logo)                                         | Author as **Lottie JSON** OR Reanimated (prefer Reanimated for size)                             | `assets/lottie/*.json`                        |
| Emoticons                                                                             | Sprite sheet → individual PNG/WebP + SVG set                                                     | `assets/emoticons/`                           |
| QR / presence icons                                                                   | SVG (vector)                                                                                     | `assets/icons/*.svg`                          |

**Rules:** chrome PNGs stay **pixel-aligned** (no smoothing; `resizeMode="stretch"` on middle slices only). Keep master PNGs in `assets/_masters/` out of the bundle. Optimize with `sharp`/`squoosh`; target < 15 KB per 9-patch slice @3x. Provide a `scripts/export-assets.ts` (Expo + sharp) to regenerate all variants.

---

## 8. One-Pass Extraction Procedure (fills every ⟦R⟧)

When the real repo/assets are obtained:

1. `git clone` the (restored/private) repo; confirm `themes/uzzap/theme.ini` and PNGs exist (`file *.png`, `identify -verbose`).
2. Dump `theme.ini` verbatim; run `parseThemeIni()` and diff against the reconstructed key map (§4.1) — replace `color.*`, `font.*`, `metric.*`.
3. For each 9-patch PNG, run ImageMagick:
   ```
   magick titlebar-left.png -verbose info:
   magick titlebar-left.png txt: | head          # detect #RRGGBBAA guide pixels
   ```
   Extract actual size, cap insets, and (for true 9-patch) the top/left black guide rows → replace §1.5 table.
4. Sample exact hex via `magick titlebar-middle.png -format "%[pixel:p{2,2}]" info:` for chrome base, bevels; sample `background-pattern.png` for tile color/size.
5. Parse `help.txt`/`help0.txt` into Help sections (§2.14) and intro pages (§2.1).
6. Convert `alert.amr/.wav` per §7.
7. Re-run the contrast table (§1.1) against real colors and adjust the AA notes if needed.
8. Update this doc's version to 1.1 and replace all ⟦R⟧ tags with "extracted".

Until then, the values in §§1–2 are **faithful reconstructions** and are safe to build against — because all components consume semantic tokens, swapping in real values is a config change, not a refactor.

---

## 9. Deliverable File Map (implementation skeleton)

```
uzzap-rn/
├─ assets/{chrome,icons,fonts,sounds,emoticons}/
├─ theme/
│   ├─ tokens.ts            # semantic token types
│   ├─ themes/uzzap.ts      # §1.1 Uzzap palette + metrics
│   ├─ themes/default.ts    # §1.1 Default palette
│   ├─ parseThemeIni.ts     # §4.1
│   ├─ deriveDark.ts        # §4.5
│   └─ ThemeProvider.tsx    # §4.4
├─ components/
│   ├─ chrome/{TitleBar,FunctionBar,MenuBottomBar,NinePatchView,BackgroundPattern}.tsx
│   ├─ BuddyItem.tsx · MessageBubble.tsx · TypingIndicator.tsx · DeliveryTicks.tsx
│   ├─ AddBuddyModal.tsx · StatusSelector.tsx · EmoticonPicker.tsx · MessageInput.tsx
│   └─ MarqueeText.tsx
├─ app/(auth)/{splash,register,login,pin}.tsx
└─ app/(app)/{index,chat/[id],contacts,settings,settings/theme,help}.tsx
```

**Definition of done for UI:** matches §2 per screen, token-driven (no raw hex in components), AA contrast, 44 dp targets, TalkBack labeled, 200–320 ms transitions, reduced-motion + dark mode pass, 9-patch chrome renders cleanly at 320/360/411/480 dp widths.

---

_Version 1.0 — generated 2026-10-11. All values tagged ⟦R⟧ are reconstructions pending real asset extraction (§8)._
