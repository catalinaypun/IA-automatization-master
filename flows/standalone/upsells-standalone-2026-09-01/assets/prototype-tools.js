/**
 * prototype-tools.js — state switcher for Verizon C360 prototype flows
 *
 * USAGE
 * ─────
 * 1. Declare FLOW_STATES before including this script:
 *
 *      <script>
 *        window.FLOW_STATES = [
 *          { id: 'default', label: 'Default'          },
 *          { id: 'error',   label: 'Validation Error' },
 *          { id: 'empty',   label: 'No Results'       },
 *        ];
 *      </script>
 *      <script src="./assets/prototype-tools.js"></script>
 *
 * 2. Tag elements that only appear in certain states:
 *
 *      <div data-show-on-state="error">…error message…</div>
 *      <div data-show-on-state="error,empty">…shown in both…</div>
 *      <div data-hide-on-state="empty">…hidden when empty…</div>
 *
 *    Elements with NO data attribute are always visible.
 *
 * 3. Deep-link to a state:   ?state=error
 *    Clean presenter mode:   ?presenter=true  (toolbar hidden, states still work)
 */

(function () {

  // ── URL helpers ───────────────────────────────────────────────
  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function setParam(name, value) {
    // Wrapped in try/catch: some browsers (notably Chrome) throw a
    // SecurityError on history.replaceState() for file:// URLs in certain
    // configurations. If that happens we still want the state change itself
    // to go through — only the URL/deep-link stays unsynced.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set(name, value);
      history.replaceState(null, '', url.toString());
    } catch (err) {
      console.warn('prototype-tools: could not update URL (state change still applied):', err);
    }
  }

  // ── Show / hide conditional elements ─────────────────────────
  function applyState(stateId) {
    document.body.dataset.state = stateId;

    // Toggle BOTH the `hidden` attribute and inline `style.display`:
    // - `hidden` alone isn't enough for elements whose class already declares
    //   `display` in the stylesheet (e.g. .loader, .notification, .accordion),
    //   since a stylesheet rule can outrank the UA `[hidden]{display:none}` rule.
    // - `style.display` alone isn't enough for plain elements with no class
    //   (e.g. a bare wrapper <div hidden>), since clearing the inline style
    //   just falls back to the `[hidden]` rule, which still applies as long
    //   as the attribute is present.
    // Setting both covers every case regardless of which one would "win".
    document.querySelectorAll('[data-show-on-state]').forEach(function (el) {
      var states = el.dataset.showOnState.split(',').map(function (s) { return s.trim(); });
      var show = states.includes(stateId);
      el.hidden = !show;
      el.style.display = show ? '' : 'none';
    });

    document.querySelectorAll('[data-hide-on-state]').forEach(function (el) {
      var states = el.dataset.hideOnState.split(',').map(function (s) { return s.trim(); });
      var hide = states.includes(stateId);
      el.hidden = hide;
      el.style.display = hide ? 'none' : '';
    });

    // Sync toolbar button active state
    document.querySelectorAll('[data-pt-state-btn]').forEach(function (btn) {
      var active = btn.dataset.ptStateBtn === stateId;
      btn.className = active ? 'btn btn--primary btn--small' : 'btn btn--secondary btn--small';
    });
  }

  // ── Floating toolbar ──────────────────────────────────────────
  function renderToolbar(states, currentState) {
    var toolbar = document.createElement('div');
    toolbar.id  = 'pt-toolbar';
    toolbar.setAttribute('aria-label', 'State switcher');
    toolbar.style.cssText = [
      'position:fixed',
      'bottom:20px',
      'right:20px',
      'z-index:9999',
      'display:flex',
      'flex-direction:column',
      'gap:6px',
      'padding:12px 14px',
      'background:var(--color-white, #fff)',
      'border:1px solid var(--color-border, #dddad4)',
      'border-radius:var(--radius-400, 16px)',
      'box-shadow:0 4px 16px rgba(0,0,0,.15)',
      'min-width:152px',
    ].join(';');

    var heading = document.createElement('p');
    heading.className = 'text-body-small-bold';
    heading.style.cssText = 'margin:0 0 6px;color:var(--color-gray-600);text-transform:uppercase;letter-spacing:.06em;';
    heading.textContent = 'States';
    toolbar.appendChild(heading);

    states.forEach(function (s) {
      var btn = document.createElement('button');
      btn.className = s.id === currentState ? 'btn btn--primary btn--small' : 'btn btn--secondary btn--small';
      btn.textContent = s.label;
      btn.dataset.ptStateBtn = s.id;
      btn.addEventListener('click', function () {
        applyState(s.id);
        setParam('state', s.id);
      });
      toolbar.appendChild(btn);
    });

    document.body.appendChild(toolbar);
  }

  // ── Boot ─────────────────────────────────────────────────────
  function init() {
    var states = window.FLOW_STATES;
    if (!states || !states.length) return;

    var presenter    = getParam('presenter') === 'true';
    var stateParam   = getParam('state');
    var validIds     = states.map(function (s) { return s.id; });
    var currentState = validIds.includes(stateParam) ? stateParam : states[0].id;

    // Normalise URL
    if (!validIds.includes(stateParam)) {
      setParam('state', currentState);
    }

    applyState(currentState);

    if (!presenter) {
      renderToolbar(states, currentState);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ───────────────────────────────────────────────
  // Lets in-page elements (buttons, links) drive the same state change
  // as the floating toolbar, e.g. <button onclick="ptSetState('loading')">
  window.ptSetState = function (stateId) {
    applyState(stateId);
    setParam('state', stateId);
  };

  window.ptShowToast = function (message, variant) {
    var text = message || 'Action completed successfully.';
    var tone = variant || 'success';
    var container = document.createElement('div');
    container.className = 'slds-notify_container slds-is-relative';
    container.style.cssText = [
      'position:fixed',
      'top:1rem',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:10000'
    ].join(';');

    var icon = tone === 'error' ? 'error' : 'success';
    var theme = tone === 'error' ? 'slds-theme_error' : 'slds-theme_success';

    container.innerHTML = [
      '<div class="slds-notify slds-notify_toast ' + theme + '" role="status">',
      '  <span class="slds-assistive-text">' + (tone === 'error' ? 'Error' : 'Success') + '</span>',
      '  <span class="slds-icon_container slds-icon-utility-' + icon + ' slds-m-right_small">',
      '    <svg class="slds-icon slds-icon_small" aria-hidden="true">',
      '      <use xlink:href="./assets/ds/slds/assets/icons/utility-sprite/svg/symbols.svg#' + icon + '"></use>',
      '    </svg>',
      '  </span>',
      '  <div class="slds-notify__content">',
      '    <h2 class="slds-text-heading_small">' + text + '</h2>',
      '  </div>',
      '</div>'
    ].join('');

    document.body.appendChild(container);
    window.setTimeout(function () {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }, 3500);
  };

  window.ptFinishFlow = function (toastMessage) {
    window.ptSetState('default');
    window.ptShowToast(toastMessage || 'Capture completed successfully.', 'success');
  };

}());
