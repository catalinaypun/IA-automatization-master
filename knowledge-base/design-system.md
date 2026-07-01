# Verizon Design System — Knowledge Base

Design system for C360 / Valu Cal HTML prototypes. All assets live in `./assets/ds/`.

---

## 1. Setup — cómo incluir en cada HTML

```html
<head>
  <!-- Design System CSS (tokens + componentes) -->
  <link rel="stylesheet" href="./assets/ds/design-system.css">

  <!-- Fuentes VerizonNHG — declaración manual si no están en design-system.css -->
  <style>
    @font-face {
      font-family: 'VerizonNHGDS';
      src: url('./assets/ds/fonts/VerizonNHGeDS-Regular.ttf') format('truetype'),
           url('./assets/ds/fonts/VerizonNHGeDS-Regular.eot');
      font-weight: 400;
    }
    @font-face {
      font-family: 'VerizonNHGDS';
      src: url('./assets/ds/fonts/VerizonNHGeDS-Bold.ttf') format('truetype'),
           url('./assets/ds/fonts/VerizonNHGeDS-Bold.eot');
      font-weight: 700;
    }
    @font-face {
      font-family: 'VerizonNHGDS';
      src: url('./assets/ds/fonts/VerizonNHGDS-Light.ttf') format('truetype'),
           url('./assets/ds/fonts/VerizonNHGDS-Light.eot');
      font-weight: 300;
    }

    /* Aplicar fuente global */
    body {
      font-family: 'VerizonNHGDS', sans-serif;
      color: #1d1c1c;
    }
  </style>
</head>
```

**Fuentes disponibles:**

| Archivo | Peso | Uso |
|---|---|---|
| `VerizonNHGeDS-Regular.ttf/.eot` | 400 | Cuerpo de texto |
| `VerizonNHGeDS-Bold.ttf/.eot` | 700 | Títulos, labels, énfasis |
| `VerizonNHGDS-Light.ttf/.eot` | 300 | Feature text, display grande |
| `VerizonNHGeTX-Regular.eot` | 400 | Variante eText regular |
| `VerizonNHGeTX-Bold.eot` | 700 | Variante eText bold |

> **Regla:** Usar siempre `font-family: var(--font-family-display)` o `var(--font-family-etext)` — ambas apuntan a `'VerizonNHGDS'`.

---

## 2. CSS Custom Properties (Design Tokens)

Todos los tokens están en `:root` dentro de `design-system.css`. Usar siempre los tokens en lugar de valores hardcodeados.

### Colores — Brand

```css
--color-brand-red:        #e10014   /* Rojo Verizon principal */
--color-brand-coral:      #ff281e   /* Hover del rojo */
--color-brand-limitedred: #ee001e   /* Active del rojo */
--color-brand-neonyellow: #f8ff3c   /* Amarillo neón accent */
--color-brand-stone:      #f8f3e9   /* Beige/stone (fondos warm) */
```

### Colores — Neutral

```css
--color-black:     #000000
--color-white:     #ffffff
--color-gray-100:  #f8f7f5   /* Fondo muy sutil */
--color-gray-200:  #dddad4   /* Bordes */
--color-gray-400:  #aaa8a3   /* Placeholder, disabled */
--color-gray-600:  #716f6d   /* Texto secundario */
--color-gray-900:  #333332   /* Texto oscuro alt */
--color-gray-1100: #1d1c1c   /* Texto primario (casi negro) */
```

### Colores — Semánticos

```css
--color-primary:         var(--color-black)      /* #000 */
--color-secondary:       var(--color-gray-600)   /* #716f6d */
--color-surface:         var(--color-white)
--color-surface-alt:     var(--color-gray-100)   /* #f8f7f5 */
--color-border:          var(--color-gray-200)   /* #dddad4 */
--color-brand-highlight: var(--color-brand-red)  /* #e10014 */
--color-error:           var(--color-orange-800) /* #b95319 */
--color-success:         var(--color-green-800)  /* #008331 */
--color-warning:         var(--color-yellow-600) /* #ffcd27 */
--color-info:            var(--color-blue-600)   /* #0089ec */
```

### Colores — Escala completa por familia

| Token | Valor |
|---|---|
| `--color-blue-200` | `#aad8f9` |
| `--color-blue-600` | `#0089ec` |
| `--color-blue-800` | `#006fc0` |
| `--color-green-200` | `#a4e6bd` |
| `--color-green-600` | `#00b845` |
| `--color-green-800` | `#008331` |
| `--color-orange-200` | `#ffcaaa` |
| `--color-orange-800` | `#b95319` |
| `--color-yellow-600` | `#ffcd27` |
| `--color-purple-600` | `#8e48e8` |
| `--color-pink-600` | `#fe46aa` |

### Tipografía

```css
/* Familias */
--font-family-display: 'VerizonNHGDS', sans-serif
--font-family-etext:   'VerizonNHGDS', sans-serif

/* Pesos */
--font-weight-light:   300
--font-weight-regular: 400
--font-weight-bold:    700

/* Tamaños — Body */
--font-size-body-large:  16px   line-height: 20px
--font-size-body-medium: 14px   line-height: 18px
--font-size-body-small:  12px   line-height: 16px
--font-size-micro:       11px   line-height: 16px

/* Tamaños — Title */
--font-size-title-2xsmall: 16px
--font-size-title-xsmall:  20px
--font-size-title-small:   24px
--font-size-title-medium:  32px
--font-size-title-large:   40px
--font-size-title-xlarge:  48px
--font-size-title-2xlarge: 64px
```

### Spacing

```css
--space-halfx: 2px
--space-1x:    4px
--space-2x:    8px
--space-3x:    12px
--space-4x:    16px
--space-6x:    24px
--space-8x:    32px
--space-12x:   48px
--space-16x:   64px
--space-24x:   96px
--space-32x:   128px
```

### Border Radius

```css
--radius-50:   2px
--radius-100:  4px    /* badge */
--radius-150:  6px
--radius-200:  8px    /* input, card small */
--radius-300:  12px
--radius-400:  16px   /* card, tile standard */
--radius-800:  32px   /* tile hero */
--radius-max:  9999px /* button, pill */
```

### Shadows

```css
--shadow-low:  0px 0px 3px rgba(0,0,0,0.08), 0px 1px 8px rgba(0,0,0,0.12)
--shadow-mid:  0px 1px 8px rgba(0,0,0,0.08), 0px 2px 14px rgba(0,0,0,0.06)
--shadow-high: 0px 1px 20px rgba(0,0,0,0.08), 0px 3px 20px rgba(0,0,0,0.07)
```

---

## 3. Componentes — Clases CSS

### Botones

```html
<!-- Primary (negro) -->
<button class="btn btn--primary btn--large">Label</button>
<button class="btn btn--primary btn--medium">Label</button>
<button class="btn btn--primary btn--small">Label</button>

<!-- Secondary (outline negro) -->
<button class="btn btn--secondary btn--medium">Label</button>

<!-- Brand (rojo Verizon) -->
<button class="btn btn--brand btn--medium">Label</button>

<!-- Ghost (sin borde) -->
<button class="btn btn--ghost btn--medium">Label</button>

<!-- Inversos (para fondos oscuros) -->
<button class="btn btn--primary-inverse btn--medium">Label</button>
<button class="btn btn--secondary-inverse btn--medium">Label</button>

<!-- Disabled -->
<button class="btn btn--primary btn--medium" disabled>Label</button>
```

**Tamaños:** `btn--large` (44px) · `btn--medium` (36px) · `btn--small` (32px)

### Icon Button

```html
<button class="btn-icon btn-icon--default btn-icon--medium">
  <img src="./assets/ds/icons/edit.svg" alt="" width="20" height="20">
</button>

<!-- Tamaños: btn-icon--large (44px) · btn-icon--medium (36px) · btn-icon--small (28px) -->
```

### Badge

```html
<span class="badge badge--green">Ready</span>
<span class="badge badge--red">Error</span>
<span class="badge badge--yellow">Pending</span>
<span class="badge badge--blue">Info</span>
<span class="badge badge--gray">Never Scheduled</span>
<span class="badge badge--gray-low">Draft</span>
<span class="badge badge--orange">Warning</span>
<span class="badge badge--black">Active</span>
<span class="badge badge--white">Neutral</span>
<span class="badge badge--stone">Stone</span>
```

### Badge Indicator (dot / número)

```html
<!-- Dot -->
<span class="badge-indicator"></span>

<!-- Con número -->
<span class="badge-indicator badge-indicator--numbered">3</span>
```

### Input / Text Field

```html
<input class="input" type="text" placeholder="Enter value">

<!-- Error state -->
<input class="input input--error" type="text">
<span class="input__error-text">Required field</span>

<!-- Disabled -->
<input class="input" type="text" disabled>
```

### Checkbox

```html
<label class="checkbox">
  <input class="checkbox__input" type="checkbox">
  <span class="checkbox__label">Label text</span>
</label>
```

### Select / Dropdown

```html
<select class="select">
  <option>Option 1</option>
  <option>Option 2</option>
</select>
```

### Card / Tile

```html
<div class="card">
  <!-- contenido -->
</div>

<!-- Con sombra -->
<div class="card card--elevated">...</div>
```

### Accordion

```html
<div class="accordion">
  <button class="accordion__trigger">
    Section Title
  </button>
  <div class="accordion__panel">
    <!-- contenido -->
  </div>
</div>
```

### Notification / Inline Alert

```html
<!-- Info -->
<div class="notification notification--info">
  <img class="notification__icon" src="./assets/ds/icons/info.svg" alt="">
  <div class="notification__body">
    <strong>Title</strong> — Description text.
  </div>
  <button class="notification__dismiss">×</button>
</div>

<!-- Variantes: notification--info · notification--success · notification--warning · notification--error -->

<!-- Toast (floating) -->
<div class="notification notification--toast notification--success">...</div>

<!-- Inline (sin borde) -->
<div class="notification notification--inline notification--warning">...</div>
```

### Modal

```html
<div class="modal-overlay" role="dialog" aria-modal="true">
  <div class="modal">
    <div class="modal__header">
      <span class="modal__title">Title</span>
      <button class="modal__close">×</button>
    </div>
    <div class="modal__body">
      <!-- contenido -->
    </div>
    <div class="modal__footer">
      <button class="btn btn--secondary btn--medium">Cancel</button>
      <button class="btn btn--primary btn--medium">Confirm</button>
    </div>
  </div>
</div>
```

### Toggle

```html
<label class="toggle">
  <input class="toggle__input" type="checkbox">
  <span class="toggle__track">
    <span class="toggle__thumb"></span>
  </span>
  <span class="toggle__label">Enable feature</span>
</label>
```

### Segmented Control (pill group)

```html
<div class="segmented-control">
  <button class="segmented-control__item segmented-control__item--active">Option A</button>
  <button class="segmented-control__item">Option B</button>
  <button class="segmented-control__item">Option C</button>
</div>
```

### Loader

```html
<div class="loader" role="status" aria-label="Loading..."></div>
```

### Breadcrumb

```html
<nav aria-label="Breadcrumb">
  <ol class="breadcrumb-nav">
    <li class="breadcrumb-nav__item">
      <a class="breadcrumb-nav__link" href="#">Home</a>
      <span class="breadcrumb-nav__sep">/</span>
    </li>
    <li class="breadcrumb-nav__item breadcrumb-nav__item--current">
      Current Page
    </li>
  </ol>
</nav>
```

### Tooltip

```html
<div class="tooltip tooltip--below tooltip--left">
  <button class="tooltip__trigger">
    <img src="./assets/ds/icons/info.svg" alt="Info" width="16" height="16">
  </button>
  <div class="tooltip__popup">
    <strong>Title</strong>
    Description text here.
  </div>
</div>

<!-- Posición: (default) arriba · tooltip--below · Alineación: tooltip--left · tooltip--right -->
```

---

## 4. Tipografía — Clases utilitarias

```html
<!-- Títulos -->
<h1 class="text-title-2xlarge">64px Regular</h1>
<h1 class="text-title-2xlarge-bold">64px Bold</h1>
<h2 class="text-title-large">40px</h2>
<h3 class="text-title-medium">32px</h3>
<h4 class="text-title-small">24px</h4>
<h5 class="text-title-xsmall">20px</h5>
<h6 class="text-title-2xsmall">16px</h6>

<!-- Body -->
<p class="text-body-large">16px / Regular</p>
<p class="text-body-large-bold">16px / Bold</p>
<p class="text-body-medium">14px / Regular</p>
<p class="text-body-medium-bold">14px / Bold</p>
<p class="text-body-small">12px / Regular</p>
<p class="text-body-small-bold">12px / Bold</p>
<span class="text-micro">11px / Micro</span>
<span class="text-micro-bold">11px / Micro Bold</span>

<!-- Feature / Display grande -->
<span class="text-feature-small">80px Light</span>
<span class="text-feature-medium">96px Light</span>
<span class="text-feature-large">128px Light</span>
```

---

## 5. Iconos

**Path:** `./assets/ds/icons/<nombre>.svg`

**Uso básico:**
```html
<!-- Inline img -->
<img src="./assets/ds/icons/edit.svg" alt="Edit" width="20" height="20">

<!-- Con color CSS (currentColor) — requiere que el SVG use currentColor como fill/stroke -->
<img src="./assets/ds/icons/trash.svg" alt="Delete" width="20" height="20"
     style="filter: brightness(0);">  /* para forzar negro */

<!-- Dentro de btn-icon -->
<button class="btn-icon btn-icon--default btn-icon--medium">
  <img src="./assets/ds/icons/settings.svg" alt="" width="20" height="20">
</button>
```

**Convenciones de tamaño:**
| Contexto | Tamaño recomendado |
|---|---|
| Inline en texto body | 16×16 px |
| Botones medium/small | 18–20×18–20 px |
| Botones large | 24×24 px |
| Encabezados / módulos | 24×24 px |
| Ilustrativo / hero | 32–48 px |

### Íconos disponibles (selección por categoría)

**Navegación / UI general**
```
close.svg · close-bold Large.svg · close-bold Medium.svg · close-bold Small.svg
menu.svg · search.svg · filter.svg · filter-off.svg · sort.svg
left-caret.svg · right-caret.svg · up-caret.svg · down-caret.svg
left-arrow.svg · right-arrow.svg · up-arrow.svg · down-arrow.svg
left-caret-bold.svg · right-caret-bold.svg · right-arrow-diagonal-bold.svg
pagination-left-arrow.svg · pagination-right-arrow.svg
pagination-left-caret.svg · pagination-right-caret.svg
more-horizontal.svg · more-vertical.svg
external-link.svg · link.svg · pin.svg · pushpin.svg · pushpin-selected.svg
```

**Acciones**
```
edit.svg · trash.svg · save.svg · duplicate.svg · share.svg
add-folder.svg · add-user.svg · add-to-favorite.svg · added-to-favorite.svg
remove-item.svg · remove-user.svg
move-to.svg · drag-and-drop.svg · drag-handler.svg
upload.svg · download.svg · attach.svg
print.svg · compose.svg · send-message.svg · reply.svg
undo.svg · sync.svg
```

**Estado / Feedback**
```
checkmark.svg · checkmark-bold.svg · checkmark-alternate.svg · checkmark-alt-bold.svg
error.svg · error-bold.svg
warning.svg · warning-bold.svg
info.svg · info-bold.svg
notification.svg · notifications-off.svg · alert-notification.svg
```

**Personas / Usuarios**
```
user.svg · user-settings.svg · user-registration.svg
add-user.svg · remove-user.svg · group-family.svg
team-leader.svg · driver.svg · agent.svg
```

**Vehículos / Fleet / Telematics**
```
telematics-car.svg · fleet.svg · fleet-tracking.svg
electric-car.svg · electric-van.svg · on-go-car.svg
truck (varios): bucket-truck.svg · bucket-truck-boom.svg · construction-truck.svg
tow-truck.svg · police-fleet.svg
crash.svg · hard-brake.svg · tire-blowout.svg · shock.svg
speed.svg · speed-monitoring.svg · real-time-tracking.svg
location.svg · location-alt.svg · location-pin.svg · location-tracking.svg · geofence.svg
start-trip.svg · trip-planner.svg
```

**Localización / Mapas**
```
location.svg · location-alt.svg · location-pin.svg · no-location.svg
map-view.svg · compass.svg · fit-to-zone.svg
```

**Conectividad / Hardware**
```
wifi-wireless.svg · wifi-backup.svg · wifi-scan.svg
bluetooth.svg · cell-signal.svg · cell-signal-alt.svg · cell-tower.svg
router.svg · gateway.svg · ethernet.svg · coax.svg · network.svg
sim-card.svg · nfc-tag.svg
mobile-hotspot.svg · internet-of-things.svg
```

**Documentos / Datos**
```
single-document.svg · multiple-documents.svg · folder.svg · folder-locked.svg
cloud.svg · cloud-document.svg · cloud-alternative.svg
analytics.svg · reports-and-alerts.svg · data.svg
compliance-document.svg · certificate.svg
```

**Comunicación**
```
email.svg · chat.svg · chat-disabled.svg
phone.svg · incoming-call.svg · outgoing-call.svg · missed-call.svg
video.svg · no-video.svg · microphone.svg
speaker-phone.svg · voice-mail.svg
```

**Tiempo / Calendario**
```
calendar.svg · clock.svg · timer.svg · count-down.svg · schedules.svg
history.svg · reminder.svg · remind-me.svg
```

**Seguridad**
```
lock-closed.svg · lock-open.svg
security-alert.svg · security-check.svg · security-keyhole.svg · security-wireless.svg
identity-restoration.svg · fingerprint-sensor.svg · passkey.svg
hackers.svg · risky-connection.svg · safe-browsing.svg
```

**Shipping / Orders**
```
shipping.svg · parcel.svg · orders.svg · inventory.svg
drop-shipment.svg · in-store-pickup.svg · locker.svg
box-open.svg · barcode.svg · tag.svg
```

**Todos los iconos disponibles (lista completa)**

<details>
<summary>Ver lista completa de ~500 iconos</summary>

```
3d-ad, 4k, accessibility, accessories, ad-tech-stack, adaptive-speaker,
add-folder, add-to-favorite, add-user, added-to-favorite, advanced-settings,
agent, agent-chat, agriculture-leaves, agriculture-tractor, agriculture-vineyard,
ai-dashcam, air-conditioner, airport, alarm, alert-notification,
allow-block-list, ambulance, american-sign-language, analytics, anchor,
announcement, app-dialer, app-level-protection, ar, ar-lens, archive,
artboard, asset-tracking, assistive-listening-systems, at, attach,
audience-targeted-search, audio-description, available-lines, award, awareness,
baby-monitor, badminton, barcode, baseball, basketball,
battery, battery-charging, battery-level-full, battery-level-low,
battery-level-medium, battery-level-outline, battery-power-saving,
best-practices, bid, bill-down, bill-up, billards, blind, bluetooth,
bonus-data, bookmark, bookmark-filled, bot, bowling, box-open, boxing, braille,
brightness, bring-your-own-device, bucket-truck, bucket-truck-boom, bug,
business-continuity, business-internet, buy-plans,
calendar, calibrate, call-disconnected, caller-id, camera, camera-effects,
camera-modes, car-battery, cards-on-reserve, carryover-data, cell-phone,
cell-signal, cell-signal-alt, cell-tower, certificate, chat, chat-disabled,
check-in, checkmark, checkmark-alt-bold, checkmark-alternate, checkmark-bold,
clean-surface, clock, close, close-alt, close-bold Large/Medium/Small,
closed-captioning, closed-captioning-filled, cloud, cloud-alternative,
cloud-document, coax, coffee, cognitive-disability, coin, comparison, compass,
compliance-document, compose, condition-based-maintenance, condition-based-wrench,
connect, connect-parts, construction-hammer, construction-truck,
consultative-transfer, convergence, conversion, count-down, crash, credit-card,
crop, cross-device, cross-device-targeting, cta, ctr, custom-audience,
customer-identifier-biz/bottom/glasses/hat/shirt/shoe,
customer-sentiment-negative/neutral/positive, customize,
data, data-boost, data-unlimited, data-unlimited-premium, deaf, decrease,
device-activity, device-protection, devices-and-add-ons, dfc-video-side-by-side,
diagnostic, digital-content, digital-signage, digital-signage-car, dining,
direct-carrier-billing, directory, discus, display, display-utilities,
distribution, domain-targeting, doorbell, down-arrow, down-caret, download,
drag-and-drop, drag-handler, driver, drivers-license, drone-camera,
drop-shipment, duplicate,
earbud, edit, education, education-curriculum, electric-car, electric-power,
electric-utility, electric-van, email, email-signature, embedded-sound,
emergency-contact, emoji, employee-termination, energy-science, energy-utilities,
enterprise, error, error-bold, ethernet, euro, expense, external-link,
face-covering, facebook, facial-recognition-id, fall-detected, fast, favorite,
fax, federal-defense, feedback, feedback-filled, filter, filter-off, financial,
find-my-remote, fine-art, fingerprint-sensor, fire, fit-to-zone, flag, fleet,
fleet-tracking, flexibility, flexibility-rectangles, flexible-four-arrows,
flexible-three-arrows, flip-camera, flurry, folder, folder-locked, football,
forwarded-call, fridge, fullscreen, fullscreen-minimize,
gaming, gas, gateway, generative-ai, generative-ai-filled, geofence, get-help,
gift, gifted-data, golf, government, grid-view, group-family,
growth, growth-opportunities,
hackers, handshake, hard-brake, hd, headphones, healthcare-corporate,
healthcare-general, help-me-decide, history, home, home-internet, home-security,
hot-warning, humidity,
ideas-or-solutions, identity-graph, identity-restoration, impression-video,
in-store-pickup, inclusivity, incoming-call, increase, industry,
inferred-identity, info, info-bold, instagram, insurance, intelligent-tracking,
international, international-long-distance, international-symbol-of-access,
internet-devices, internet-of-things, inventory, invitation-accepted,
invitation-expired, invitation-rejected, irobot, ironing-board,
join-call, k12-education, kids-stroller,
landscape, laptop-antivirus, laptop-controls, laptop-gps-tracking,
laptop-settings, laptop-trends, laptop-wireless, large-plan, latch-release,
law, left-arrow, left-caret, left-caret-bold, levers, light, lighthouse, link,
list, live-caption, lmr, loaner-equipment, location, location-alt,
location-only-device, location-pin, location-tracking, lock-closed, lock-open,
locker, logout, loyalty-retention,
manufacturing, map-view, masonry-view, maximize, medal, media-entertainment,
medium-business, medium-plan, menu, merge-calls, microphone, microphone-alternate,
minus, missed-call, mobile-and-home, mobile-apps, mobile-command-center,
mobile-hotspot, mobile-kiosk-info, mobile-kiosk-wireless, mobile-plus-tv,
mobile-retail, mobile-retargeting, mobile-search, mobile-workforce-management,
more-horizontal, more-vertical, motion-detector, move-to, multicast,
multiple-device-protection, multiple-devices, multiple-documents, music, mute,
my-account, my-plan-2-to-3-lines, my-plan-4-plus-lines, my-plans, my-plans-details,
nationwide, native, native-video, network, network-attached-storage,
network-connection, new, news, next, nfc-tag, night, no-backup, no-fee,
no-location, no-off, no-smoking, no-video, no, notification, notifications-off,
notify-me, notify-someone,
office-phone-system, oil-industry, on-demand, on-go-car, on-screen-text,
one-year, open-captioning, operational-transformation, orders, out-of-stock,
outgoing-call,
pack-backpack, pack-luggage, pack-purse, pagination-left-arrow, pagination-left-caret,
pagination-right-arrow, pagination-right-caret, paper-free-billing, parcel,
passenger, passkey, pattern, pause, pause-alt, pause-alt-filled, pause-internet,
paused, payment-installments, payment-received, peel-sticker, person-biking,
person-walking, pets-collar, pharmaceutical, phone, phone-all-good, phone-data,
phone-favorite, phone-medical, phone-number, phone-public-safety, phone-volume,
photo, pin, pizza, place-address, plan-perks, plan-speed-home, plan-speed-plus,
plan-speed-ultimate, platform, play, play-alt-filled, play-alternate, play-with,
playlist, plus, plus-tier-plan, police-fleet, portrait, pressure, previous, print,
pro-on-the-go, professional-services-case, professional-services-chart,
promo-badge, protection-score, public-safety, public-transportation,
purchase-data, push-notification, push-to-talk, pushpin, pushpin-selected, puzzle,
question,
real-time, real-time-tracking, recycle, remind-me, reminder, remove-item,
remove-user, reoccuring-payment, replace-a-photo, reply, reports-and-alerts,
research, resend-email, reservations, responsible-business, retail-store,
retail-store-alt, retargeting, returns, rewards, rewind-and-fast-forward,
right-arrow, right-arrow-diagonal-bold, right-caret, right-caret-bold, ring,
ringing, ringtone, risk-monitor, risky-connection, router, rss, running,
safe-browsing, satellite, satellite-off, save, scale, scale-alt, schedules,
school-notebook, screen-orientation-locked, screen-orientation-unlocked,
screen-share, search, second-home, security-alert, security-check,
security-keyhole, security-wireless, send-message, server-clock, server-search,
server-stack, service-end-date, services, set-fallback-image, set-gallery-image,
settings, share, shipping, shock, shopping, shopping-bag, signal-broadcast,
sim-card, single-document, skateboard, skip-back, skip-forward, small-business,
small-plan, smart-assistant, smart-boiler, smart-communities,
smart-family-child-address-book, smart-lighting, smart-meter, smart-scooter,
smart-socket, smart-switch, smoke-detector, snooze, snowboard, social-distancing,
social-security, solar-panel, sort, sos, sound, speaker-mute, speaker-phone,
speed, speed-monitoring, sports-bike, sports-skis, sports-soccer, sports-tennis,
stadium, stadium-flag, stakeholder, star, start-trip, steps, stethoscope,
stocktogether, stop, stop-alt, support, support-drawer, surfboard, survey,
swipe, swipe-left, swipe-right, switch, sync,
table-tennis, tablet, tablet-data, tablet-wireless, tag, talking, target-goal,
taxes, team-leader, tech-laptop, technology, telematics-car, teletype,
temperature, template, text-message, text-to-speech, theme, thermostat-tech,
thumbs-down, thumbs-down-filled, thumbs-up, thumbs-up-filled, ticket, tiles,
tilt, timer, tire-blowout, tools, top-box, total-mobile-protection, tow-truck,
trade-in, trading-deck, traffic-light, trailers, training, translate,
transportation, trash, travel-keys, travel-pass, trip-planner, trumpet,
trusted-browser, turnon-off, tv, tv-content,
ultimate-plan, umbrella, undo, unification, unified-comms, unlimited-plan,
unmanaged-devices, up-arrow, up-caret, uplink, upload, url-transparency,
user, user-guides-1, user-guides-2, user-registration, user-settings,
utility-grid-management,
vibration, video, video-clips, video-on-tablet, video-settings, virtual-reality,
visibility, visibility-off, voice-hd, voice-mail, volleyball, volume, volunteer, vpn,
wallet, warning, warning-bold, water-resistant, water-utility, wearable, weather,
webinar, weights, whiteboard, wifi-backup, wifi-scan, wifi-wireless, winch-service,
wireless-vending, wireless-video-surveillance,
xcorp, year, yield, youtube, zoom-in, zoom-out
```
</details>

---

## 6. Convenciones de prototipo

### Colores de texto más usados en prototipos

```css
color: #1d1c1c;   /* texto primario (var --color-gray-1100) */
color: #716f6d;   /* texto secundario / labels (var --color-gray-600) */
color: #aaa8a3;   /* texto muy sutil / disabled (var --color-gray-400) */
color: #0076ce;   /* links (azul Verizon — usar con moderación) */
```

### Fondos frecuentes

```css
background: #f8f3e9;   /* stone — header de secciones warm (var --color-brand-stone) */
background: #f8f7f5;   /* gray-100 — fondos alternativos suaves */
background: #ffffff;   /* blanco puro */
background: #eef5fc;   /* azul muy sutil — hover/selected states */
```

### Bordes estándar

```css
border: 1px solid #dddad4;   /* borde estándar (var --color-border) */
border-radius: 8px;           /* cards, modals (var --radius-200) */
border-radius: 6px;           /* elementos pequeños (var --radius-150) */
border-radius: 9999px;        /* pills, botones (var --radius-max) */
```

### Nunca hardcodear — usar siempre los tokens

```css
/* ❌ Evitar */
color: #000;
font-family: Arial;
border: 1px solid #ccc;

/* ✓ Correcto */
color: var(--color-primary);
font-family: var(--font-family-etext);
border: 1px solid var(--color-border);
```
