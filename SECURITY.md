# Security

CareClock handles health information, so it is designed so that **there is nothing to steal from us**. There is no server, no database, no accounts and no analytics. This document describes the threat model, the protections in the code, and the honest limits.

## Threat model

| Threat | Protection |
|---|---|
| **Data breach on a server** | There is no server. All data stays in the browser's `localStorage` on the user's device. |
| **Cross-site scripting (XSS)** via med names, notes, FDA label text, or a tampered backup file | (1) Every value rendered into HTML goes through `esc()` (`js/util.js`). (2) Every stored or imported object goes through `sanitize()` (`js/sanitize.js`): whitelisted formats for ids, dates, times, colors and photos (only `data:image/jpeg|png|webp`, never SVG); numbers clamped; strings length-capped; unknown fields dropped; log keys validated, which also blocks prototype pollution. (3) A strict **Content-Security-Policy** (`script-src 'self'`, no `unsafe-eval`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`), so even an injected tag cannot run script. |
| **Data sent to third parties** | `connect-src` allows only `'self'` and `https://api.fda.gov`. `<meta name="referrer" content="no-referrer">`. Only a medicine name is ever sent. |
| **Clickjacking** (tricking a user into "Erase everything" inside a hidden frame) | HTTP headers `frame-ancestors 'none'` and `X-Frame-Options: DENY` (`_headers`), plus a backup check in code that refuses to render when framed by another origin (`js/app.js`). |
| **Guessing the caregiver PIN** | The PIN is stored only as a salted SHA-256 hash (`js/pin.js`). Five wrong tries lock entry for 60 seconds, doubling each time up to 1 hour, and the lock survives reloads. |
| **Huge or malformed backup file** (freeze / crash) | Size limit of 15 MB, JSON parse inside `try`, schema validation, then the user confirms before anything is replaced. |
| **Malicious dependency / CDN compromise** | Nothing is loaded from a CDN at runtime. The single third-party library (qrcode-generator 1.4.4) and the font are vendored and served from our own origin. |
| **Dangerous APIs** | A test fails the build if `eval`, `new Function`, `document.write` or string `setTimeout` appear (`tests/security.test.js`). |
| **Barcode photos** | Decoded on the device with the browser's built-in BarcodeDetector. Only the resulting number is looked up (against api.fda.gov), and the photo is never uploaded or stored. |
| **Two copies of the app open** (installed app + tab) overwriting each other | A `storage` event listener reloads the newer data instead of saving stale state over it. |
| **Stale/poisoned offline cache** | The service worker caches only same-origin GET requests, network-first, and never caches API responses. |

## HTTP headers

`_headers` (applied by Cloudflare Pages) adds a full Content-Security-Policy, HSTS (HTTPS only), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin` and a Permissions-Policy that turns off location, payment, USB and Bluetooth access.

## Automated security tests

`tests/security.test.js` feeds the app a hostile backup (HTML/JS payloads in every field, a fake `javascript:` photo, an injected id, attempted prototype pollution, a plain-text PIN) and checks that all of it is dropped or neutralized. It also checks that the CSP stays strict, that `index.html` has no inline scripts or handlers, and that the offline cache lists every file. During development the same payloads were also loaded into the live app and every screen was checked: **0 payloads executed, 0 injected elements**.

## Honest limits

- **Device access = data access.** Anyone who can unlock the phone can open the app. The caregiver PIN prevents *accidental changes* in simple mode. It is **not encryption**: a 4–6 digit PIN can't protect data at rest. Users should keep a screen lock on the device.
- **Backups and shared summaries leave the app's protection.** The app warns before exporting.
- **Shared origins.** `localStorage` is per-origin. On `username.github.io/careclock`, other project sites under the same `username.github.io` origin could read its storage. For wider real-world use, serve it from its own domain (the `_headers` file is ready for Cloudflare Pages or Netlify).
- **Voice input** uses the browser's speech service, which in some browsers (e.g. Chrome) sends audio to the browser maker. It's optional and disclosed in the Privacy Policy.
- `style-src 'unsafe-inline'` is allowed so that small inline style attributes (bar widths, swatch colors) work. Scripts are fully locked down.

## Reporting a problem

Please report security issues privately to the contact listed in `js/config.js` (or the repository's security advisory page) instead of opening a public issue.
