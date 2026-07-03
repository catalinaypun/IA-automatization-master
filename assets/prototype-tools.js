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
 *      <script src="../../assets/prototype-tools.js"></script>
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
    const url = new URL(window.location.href);
    url.searchParams.set(name, value);
    history.replaceState(null, '', url.toString());
  }

  // ── Show / hide conditional elements ─────────────────────────
  function applyState(stateId) {
    document.body.dataset.state = stateId;

    // NOTE: uses style.display (not the `hidden` attribute) because several VDS
    // classes (.loader, .notification, .accordion, …) declare `display` directly,
    // which overrides the UA `[hidden]{display:none}` rule at equal specificity.
    document.querySelectorAll('[data-show-on-state]').forEach(function (el) {
      var states = el.dataset.showOnState.split(',').map(function (s) { return s.trim(); });
      el.style.display = states.includes(stateId) ? '' : 'none';
    });

    document.querySelectorAll('[data-hide-on-state]').forEach(function (el) {
      var states = el.dataset.hideOnState.split(',').map(function (s) { return s.trim(); });
      el.style.display = states.includes(stateId) ? 'none' : '';
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
        setParam('state', s.id);
        applyState(s.id);
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

}());
