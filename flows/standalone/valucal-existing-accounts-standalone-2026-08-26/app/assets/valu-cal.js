// Allow per-screen route override (set window.__INIT_ROUTE before this script loads)
if (typeof window.__INIT_ROUTE !== 'undefined') {
  // Will be applied after DOM-ready in the route initialization section
}
/* ValuCal — Pricing Engine application logic */

// ── Account setup modal (selection → contract) ──────────────────
let accountSetupSaveTimer = null;
let accountSetupValidatedTimer = null;
let accountSetupSaveRunId = 0;
/** Set when user picked “Select & create contract” while account was not ready; drives post-validate navigation to contract (do not rely on `screen` alone). */
let accountSetupOpenedFromOptionSelection = false;
let signatureModalDelayTimer = null;
let signatureModalCountdownTimer = null;
let signatureModalSecondsLeft = 4;
let contractConfirmProceedAction = null;
let proposalHistoryEvents = [];

const MSG_ACCOUNT_VALIDATED = {
  title: 'Account validated',
  sub: 'Required account information has been completed and validated.',
};

const accountValidationState = {
  clId: { status: 'low-confidence', matches: 2 },
  billingAddress: { status: 'valid' },
  ecsCompliance: { status: 'ok' },
};
let selectedClIdCompany = '';
let requestedNewGch = false;
let gchPendingAccordionOpen = false;
const clIdCompanyMatches = [
  { id: 'apex-construction-llc', name: 'Apex Construction LLC', detail: 'Sacramento, CA 95814', cleId: '10073841' },
  { id: 'acme-logistics-llc', name: 'ACME Logistics LLC', detail: 'Orlando, FL 32801', cleId: '10499316' },
];

function formatHistoryTimestamp(dateObj) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  return d.toLocaleString();
}

function logProposalEvent(title, description = '') {
  proposalHistoryEvents.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    description,
    at: new Date()
  });
}

const HISTORY_PHASE_ORDER = ['Proposal', 'Contract', 'Deal Result', 'Other'];

function getHistoryPhaseForEvent(evt) {
  const t = String(evt?.title || '').toLowerCase();
  if (
    t.includes('option') ||
    t.includes('proposal') ||
    t.includes('review & send') ||
    t.includes('review and send') ||
    t.includes('send proposal')
  ) return 'Proposal';
  if (
    t.includes('contract') ||
    t.includes('payment setup') ||
    t.includes('signature')
  ) return 'Contract';
  if (t.includes('deal result') || t.includes('closed-lost') || t.includes('closed won')) return 'Deal Result';
  return 'Other';
}

function renderProposalHistory() {
  const list = document.getElementById('proposal-history-list');
  if (!list) return;
  if (!proposalHistoryEvents.length) {
    list.innerHTML = '<div class="proposal-history-empty">No events yet.</div>';
    return;
  }
  const sorted = proposalHistoryEvents.slice().reverse();
  const grouped = sorted.reduce((acc, evt) => {
    const phase = getHistoryPhaseForEvent(evt);
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(evt);
    return acc;
  }, {});

  list.innerHTML = HISTORY_PHASE_ORDER
    .filter((phase) => Array.isArray(grouped[phase]) && grouped[phase].length > 0)
    .map((phase) => `
      <section class="proposal-history-phase">
        <div class="proposal-history-phase-title">${phase}</div>
        ${grouped[phase].map((evt) => `
          <div class="proposal-history-item">
            <div class="proposal-history-title">${evt.title}</div>
            ${evt.description ? `<div class="proposal-history-sub">${evt.description}</div>` : ''}
            <div class="proposal-history-date">${formatHistoryTimestamp(evt.at)}</div>
          </div>
        `).join('')}
      </section>
    `)
    .join('');
}

function openProposalHistoryModal() {
  renderProposalHistory();
  const overlay = document.getElementById('proposal-history-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProposalHistoryModal() {
  const overlay = document.getElementById('proposal-history-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function clearSignatureCompletionSimulation() {
  if (signatureModalDelayTimer) {
    clearTimeout(signatureModalDelayTimer);
    signatureModalDelayTimer = null;
  }
  if (signatureModalCountdownTimer) {
    clearInterval(signatureModalCountdownTimer);
    signatureModalCountdownTimer = null;
  }
  signatureModalSecondsLeft = 4;
  const btn = document.getElementById('signature-complete-continue-btn');
  if (btn) btn.textContent = 'Continue (4s)';
  const overlay = document.getElementById('signature-complete-overlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function updateSignatureContinueCta() {
  const btn = document.getElementById('signature-complete-continue-btn');
  if (btn) btn.textContent = `Continue (${signatureModalSecondsLeft}s)`;
}

function continueFromSignatureCompleted() {
  if (contractSubState !== 'waiting') {
    clearSignatureCompletionSimulation();
    return;
  }
  clearSignatureCompletionSimulation();
  contractSubState = 'signed';
  logProposalEvent('Contract signed', 'Customer signature was completed.');
  touchNavDate('contract', true);
  touchNavDate('contract_sign_pay', true);
  updateContractSubState();
  renderNav();
}

function openMarkSignedModal() {
  document.getElementById('mark-signed-overlay').classList.add('open');
}

function closeMarkSignedModal() {
  document.getElementById('mark-signed-overlay').classList.remove('open');
}

function confirmMarkSigned() {
  closeMarkSignedModal();
  continueFromSignatureCompleted();
}

function scheduleSignatureCompletionSimulation() {
  clearSignatureCompletionSimulation();
  signatureModalDelayTimer = setTimeout(() => {
    signatureModalDelayTimer = null;
    startSignatureCompletedModalCountdown();
  }, 3000);
}

function startSignatureCompletedModalCountdown() {
  if (screen !== 'contract-review' || contractSubState !== 'waiting') return;
  const overlay = document.getElementById('signature-complete-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  signatureModalSecondsLeft = 4;
  updateSignatureContinueCta();
  signatureModalCountdownTimer = setInterval(() => {
    signatureModalSecondsLeft -= 1;
    if (signatureModalSecondsLeft <= 0) {
      continueFromSignatureCompleted();
      return;
    }
    updateSignatureContinueCta();
  }, 1000);
}

function isAccountReady() {
  const badge = document.getElementById('account-badge');
  return !!(badge && badge.classList.contains('badge-ready'));
}

function getAccountValidationDescriptors() {
  const cl = accountValidationState.clId || { status: 'no-match', matches: 0 };
  const billing = accountValidationState.billingAddress || { status: 'invalid' };
  const ecs = accountValidationState.ecsCompliance || { status: 'pending' };

  const clText = requestedNewGch
    ? '⟳ Request submitted'
    : cl.status === 'assigned'
    ? '✓ Assigned'
    : cl.status === 'low-confidence'
      ? `⚠ Low confidence (${Math.max(1, Number(cl.matches) || 1)} matches)`
      : '✗ No match';
  const clVariant = requestedNewGch ? 'pending' : (cl.status === 'assigned' ? 'ok' : (cl.status === 'low-confidence' ? 'pending' : 'error'));

  const billingText = billing.status === 'valid' ? '✓ Valid' : '✗ Invalid or missing';
  const billingVariant = billing.status === 'valid' ? 'ok' : 'error';

  const ecsText = ecs.status === 'ok'
    ? '✓ OK'
    : ecs.status === 'running'
      ? '⟳ Running'
      : '⚠ Pending';
  const ecsVariant = ecs.status === 'ok' ? 'ok' : 'pending';

  const clPending = cl.status === 'low-confidence' ? (!selectedClIdCompany && !requestedNewGch) : cl.status !== 'assigned';

  return [
    { key: 'clid', text: clText, variant: clVariant, pending: clPending },
    { key: 'billing', text: billingText, variant: billingVariant, pending: billing.status !== 'valid' },
    { key: 'ecs', text: ecsText, variant: ecsVariant, pending: ecs.status !== 'ok' },
  ];
}

function getAccountValidationPendingCount() {
  return getAccountValidationDescriptors().filter((item) => item.pending).length;
}

function renderAccountValidationScreen() {
  const descriptors = getAccountValidationDescriptors();
  descriptors.forEach((item) => {
    const textEl = document.getElementById(`account-val-${item.key}-text`);
    const chipEl = document.getElementById(`account-val-${item.key}-chip`);
    if (textEl) textEl.textContent = item.text;
    if (chipEl) {
      chipEl.className = `account-validation-chip ${item.variant}`;
      chipEl.textContent = item.pending ? 'Pending' : 'Complete';
    }
  });

  const clIdOptionsWrap = document.getElementById('account-val-clid-options');
  if (clIdOptionsWrap) {
    clIdOptionsWrap.innerHTML = clIdCompanyMatches.map((company) => `
      <label class="account-validation-option-item">
        <input
          type="radio"
          name="account-validation-clid-company"
          value="${company.id}"
          ${selectedClIdCompany === company.id ? 'checked' : ''}
          ${requestedNewGch ? 'disabled' : ''}
          onchange="selectClIdCompany('${company.id}')"
        >
        <span>
          <strong>${company.name}</strong><br>
          <span>${company.detail}</span><br>
          <span><strong>CLE ID:</strong> ${company.cleId}</span>
        </span>
      </label>
    `).join('');
  }

  const continueBtn = document.getElementById('account-val-continue-btn');
  if (continueBtn) {
    const mustSelectClId = accountValidationState.clId?.status === 'low-confidence';
    continueBtn.disabled = mustSelectClId && !selectedClIdCompany;
  }

  const gchRequestBtn = document.getElementById('gch-request-btn');
  if (gchRequestBtn) {
    gchRequestBtn.classList.toggle('active', requestedNewGch);
    gchRequestBtn.textContent = requestedNewGch ? 'Requested' : 'Request New';
  }

  const checklistTitleEl = document.getElementById('account-validation-checklist-title');
  const gchResolved = !(accountValidationState.clId?.status === 'low-confidence' && !selectedClIdCompany);
  const pendingCount = gchResolved ? 0 : 1;
  if (checklistTitleEl) {
    checklistTitleEl.textContent = `Action Items (Pending: ${pendingCount})`;
  }

  const gchPanel = document.getElementById('gch-pending-panel');
  const gchCaret = document.getElementById('gch-pending-caret');
  if (gchPanel && gchCaret) {
    gchPanel.classList.toggle('hidden', !gchPendingAccordionOpen);
    gchCaret.textContent = gchPendingAccordionOpen ? 'expand_less' : 'expand_more';
  }
}

function toggleGchPendingAccordion() {
  gchPendingAccordionOpen = !gchPendingAccordionOpen;
  renderAccountValidationScreen();
}

function requestGchReview() {
  requestedNewGch = !requestedNewGch;
  if (requestedNewGch) selectedClIdCompany = '';
  renderAccountValidationScreen();
  updateAccountBadgeFromValidation();
  showSuccessBanner('Request sent', 'GCH match review request has been submitted.');
}

function selectClIdCompany(companyId) {
  selectedClIdCompany = companyId;
  requestedNewGch = false;
  renderAccountValidationScreen();
  updateAccountBadgeFromValidation();
}

function updateAccountBadgeFromValidation() {
  const badge = document.getElementById('account-badge');
  if (!badge) return;
  const pendingCount = ['gch', 'billingAddress'].filter((key) => validationFields[key] && validationFields[key].status !== 'complete').length;
  if (pendingCount === 0) {
    badge.className = 'badge-ready';
    badge.textContent = 'Account ready';
  } else {
    badge.className = 'badge-pending';
    badge.textContent = `${pendingCount} pending action${pendingCount === 1 ? '' : 's'}`;
  }
}

function openAccountValidationScreen() {
  renderValidationPageStatus();
  renderAccountValidationScreen();
  updateAccountBadgeFromValidation();
  const overlay = document.getElementById('account-validation-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAccountValidationContinue() {
  closeAccountValidationModal();
}

function closeAccountValidationModal() {
  const overlay = document.getElementById('account-validation-overlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function transitionOverlay(fromOverlayId, toOverlayId) {
  const fromOverlay = document.getElementById(fromOverlayId);
  const toOverlay = document.getElementById(toOverlayId);
  if (!fromOverlay || !toOverlay) return false;

  const fromModal = fromOverlay.firstElementChild;
  const toModal = toOverlay.firstElementChild;

  toOverlay.classList.add('open');
  toOverlay.style.opacity = '0';
  if (toModal) {
    toModal.style.opacity = '0';
    toModal.style.transform = 'translateY(8px) scale(0.985)';
  }

  requestAnimationFrame(() => {
    fromOverlay.style.transition = 'opacity 180ms ease';
    toOverlay.style.transition = 'opacity 180ms ease';
    fromOverlay.style.opacity = '0';
    toOverlay.style.opacity = '1';

    if (fromModal) {
      fromModal.style.transition = 'opacity 180ms ease, transform 180ms ease';
      fromModal.style.opacity = '0';
      fromModal.style.transform = 'translateY(-8px) scale(0.985)';
    }
    if (toModal) {
      toModal.style.transition = 'opacity 180ms ease, transform 180ms ease';
      toModal.style.opacity = '1';
      toModal.style.transform = 'translateY(0) scale(1)';
    }
  });

  setTimeout(() => {
    fromOverlay.classList.remove('open');

    fromOverlay.style.transition = '';
    fromOverlay.style.opacity = '';
    toOverlay.style.transition = '';
    toOverlay.style.opacity = '';

    if (fromModal) {
      fromModal.style.transition = '';
      fromModal.style.opacity = '';
      fromModal.style.transform = '';
    }
    if (toModal) {
      toModal.style.transition = '';
      toModal.style.opacity = '';
      toModal.style.transform = '';
    }
  }, 190);

  document.body.style.overflow = 'hidden';
  return true;
}

function saveAccountValidation() {
  applyAccountReadyState();
  showSuccessBanner('Action items saved', 'Account validation progress has been saved.');
  const shouldContinueSelection =
    accountSetupOpenedFromOptionSelection && bld.selectedOptionId != null && isAccountReady();
  if (shouldContinueSelection) {
    accountSetupOpenedFromOptionSelection = false;
    const transitioned = transitionOverlay('account-validation-overlay', 'confirm-selection-overlay');
    if (!transitioned) {
      closeAccountValidationModal();
      setTimeout(() => openConfirmSelectionModal(), 160);
    }
    return;
  }
  closeAccountValidationModal();
}

function toggleAccountInfoAccordion() {
  const panel = document.getElementById('account-info-accordion-panel');
  const caret = document.getElementById('account-info-accordion-caret');
  if (!panel || !caret) return;
  panel.classList.toggle('hidden');
  const isOpen = !panel.classList.contains('hidden');
  caret.textContent = isOpen ? 'expand_less' : 'expand_more';
}

const validationSectionOpen = {
  'action-items': true,
  'account-information': false,
};
const validationFields = {
  gch: { status: 'pending', section: 'action', label: 'GCH check' },
  contact: { status: 'complete', section: 'action', label: 'Contact' },
  billingAddress: { status: 'complete', section: 'account', label: 'Billing address' },
  accountName: { status: 'complete', section: 'account', label: 'Account name' },
  contractType: { status: 'complete', section: 'account', label: 'Contract type' },
  funnelStatus: { status: 'complete', section: 'account', label: 'Funnel status' },
  segment: { status: 'complete', section: 'account', label: 'Segment' },
  industry: { status: 'complete', section: 'account', label: 'Industry' },
  primaryRegion: { status: 'complete', section: 'account', label: 'Primary region' },
  platform: { status: 'complete', section: 'account', label: 'Platform' },
  totalFleet: { status: 'pending-confirmation', section: 'account', label: 'Total fleet' },
  totalAssets: { status: 'pending-confirmation', section: 'account', label: 'Total assets' },
};

function getValidationChipClass(status) {
  if (status === 'complete') return 'state-ok';
  if (status === 'pending-confirmation') return 'state-ok';
  return 'state-error';
}

function getValidationChipText(field, status) {
  if (status === 'complete') return `${field.label} ✓`;
  if (status === 'pending-confirmation') return `${field.label} ✓`;
  return `${field.label} ✕`;
}

function renderValidationPageStatus() {
  const actionPendingKeys = ['gch', 'billingAddress'].filter((key) => validationFields[key].status !== 'complete');
  const confirmedKeys = Object.keys(validationFields).filter((key) => validationFields[key].status !== 'pending-confirmation');
  const completedCount = confirmedKeys.filter((key) => validationFields[key].status === 'complete').length;
  const totalConfirmed = confirmedKeys.length;
  const pct = totalConfirmed > 0 ? Math.round((completedCount / totalConfirmed) * 100) : 0;

  const allClear = actionPendingKeys.length === 0;

  const pendingEl = document.getElementById('validation-pending-count');
  if (pendingEl) pendingEl.textContent = allClear ? 'Ready to contract' : `${actionPendingKeys.length} action${actionPendingKeys.length === 1 ? '' : 's'} required before contract`;
  const completeEl = document.getElementById('validation-complete-count');
  if (completeEl) completeEl.textContent = allClear ? '' : `${completedCount} of ${totalConfirmed} complete`;
  const sepEl = document.getElementById('validation-progress-sep');
  if (sepEl) sepEl.style.display = allClear ? 'none' : '';
  const progressEl = document.getElementById('validation-progress-fill');
  if (progressEl) {
    progressEl.style.width = `${pct}%`;
    progressEl.style.background = allClear ? '#16A34A' : '#F59E0B';
  }

  // Hide Action items section and auto-expand Account information when all clear
  const actionSection = document.getElementById('validation-action-section');
  if (actionSection) actionSection.classList.toggle('hidden', allClear);
  if (allClear) validationSectionOpen['account-information'] = true;

  const actionBody = document.getElementById('validation-action-items-body');
  const actionHeader = actionBody?.previousElementSibling;
  const actionChipsWrap = document.getElementById('validation-action-chips');
  const actionCaret = actionHeader?.querySelector('.account-validation-accordion-caret');
  if (actionBody && actionHeader && actionCaret && actionChipsWrap) {
    const isOpen = !!validationSectionOpen['action-items'];
    actionBody.classList.toggle('hidden', !isOpen);
    actionHeader.classList.toggle('is-open', isOpen);
    actionCaret.textContent = isOpen ? 'expand_less' : 'expand_more';
    actionChipsWrap.classList.toggle('hidden', isOpen);
    actionChipsWrap.innerHTML = actionPendingKeys.map((key) => {
      const field = validationFields[key];
      return `<span class="account-validation-chip ${getValidationChipClass(field.status)}">${getValidationChipText(field, field.status)}</span>`;
    }).join('');
  }

  const accountBody = document.getElementById('validation-account-information-body');
  const accountHeader = accountBody?.previousElementSibling;
  const accountChipsWrap = document.getElementById('validation-account-chips');
  const accountCaret = accountHeader?.querySelector('.account-validation-accordion-caret');
  if (accountBody && accountHeader && accountCaret && accountChipsWrap) {
    const isOpen = !!validationSectionOpen['account-information'];
    accountBody.classList.toggle('hidden', !isOpen);
    accountHeader.classList.toggle('is-open', isOpen);
    accountCaret.textContent = isOpen ? 'expand_less' : 'expand_more';
    accountChipsWrap.classList.toggle('hidden', isOpen);
    const accountChipKeys = ['accountName', 'billingAddress', 'contractType', 'funnelStatus', 'totalFleet', 'totalAssets'];
    accountChipsWrap.innerHTML = accountChipKeys.map((key) => {
      const field = validationFields[key];
      return `<span class="account-validation-chip state-info">✓ ${field.label}</span>`;
    }).join('');
  }

  const actionRows = {
    gch: document.getElementById('validation-action-gch'),
    contact: document.getElementById('validation-action-contact'),
    billingAddress: document.getElementById('validation-action-billing'),
  };
  Object.entries(actionRows).forEach(([key, row]) => {
    if (!row) return;
    row.classList.toggle('hidden', validationFields[key].status === 'complete');
  });

  const infoRows = {
    gch: document.getElementById('validation-field-gch'),
    contact: document.getElementById('validation-field-contact'),
  };
  Object.entries(infoRows).forEach(([key, row]) => {
    if (!row) return;
    row.classList.toggle('hidden', validationFields[key].status !== 'complete');
  });

  const successEl = document.getElementById('validation-action-success');
  if (successEl) successEl.classList.toggle('hidden', actionPendingKeys.length !== 0);

  updateAccountBadgeFromValidation();
}

function toggleValidationSection(sectionKey) {
  if (!Object.prototype.hasOwnProperty.call(validationSectionOpen, sectionKey)) return;
  validationSectionOpen[sectionKey] = !validationSectionOpen[sectionKey];
  renderValidationPageStatus();
}

function resolveValidationAction(fieldKey) {
  if (fieldKey === 'gch') {
    openGchSubview();
    return;
  }
  if (!validationFields[fieldKey]) return;
  validationFields[fieldKey].status = 'complete';
  renderValidationPageStatus();
}

function openGchSubview() {
  const subview = document.getElementById('gch-subview');
  const mainCard = document.getElementById('account-validation-main-card');
  const footer = document.querySelector('.account-validation-actions');
  if (!subview || !mainCard) return;
  const radios = subview.querySelectorAll('input[name="gch-selection"]');
  radios.forEach(r => r.checked = false);
  subview.classList.remove('hidden');
  mainCard.classList.add('hidden');
  if (footer) footer.classList.add('hidden');
}

function closeGchSubview() {
  const subview = document.getElementById('gch-subview');
  const mainCard = document.getElementById('account-validation-main-card');
  const footer = document.querySelector('.account-validation-actions');
  if (!subview || !mainCard) return;
  subview.classList.add('hidden');
  mainCard.classList.remove('hidden');
  if (footer) footer.classList.remove('hidden');
}

function confirmGchSelection() {
  const selected = document.querySelector('input[name="gch-selection"]:checked');
  if (!selected) return;
  const label = selected.closest('.gch-option-row')?.querySelector('.gch-option-title')?.textContent || 'GCH confirmed';
  const valueEl = document.querySelector('#validation-field-gch .account-validation-row-value');
  if (valueEl) valueEl.textContent = label;
  validationFields.gch.status = 'complete';
  closeGchSubview();
  renderValidationPageStatus();
}

function requestNewGch() {
  const valueEl = document.querySelector('#validation-field-gch .account-validation-row-value');
  if (valueEl) valueEl.textContent = 'New GCH review requested';
  validationFields.gch.status = 'complete';
  closeGchSubview();
  renderValidationPageStatus();
}

function enterValidationFieldEdit(fieldKey) {
  const row = document.getElementById(`validation-field-${fieldKey}`);
  if (!row || !row.classList.contains('av-editable')) return;
  const displayEl = row.querySelector('[data-display]');
  const inputEl = row.querySelector('[data-input]');
  if (!displayEl || !inputEl || !inputEl.classList.contains('hidden') === false) return;
  displayEl.classList.add('hidden');
  inputEl.classList.remove('hidden');
  inputEl.focus();
  if (inputEl.select) inputEl.select();
}

function onValidationFieldKeydown(event, fieldKey) {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitValidationFieldEdit(fieldKey);
  }
}

function commitValidationFieldEdit(fieldKey) {
  const row = document.getElementById(`validation-field-${fieldKey}`);
  if (!row) return;
  const displayEl = row.querySelector('[data-display]');
  const inputEl = row.querySelector('[data-input]');
  if (!displayEl || !inputEl) return;
  let nextValue = '';
  if (inputEl.tagName === 'SELECT') {
    nextValue = inputEl.value.trim();
  } else {
    nextValue = inputEl.value.trim();
  }
  displayEl.textContent = nextValue || '—';
  displayEl.classList.remove('hidden');
  inputEl.classList.add('hidden');

  if (fieldKey === 'contract-type') {
    proposalData.contractType = nextValue || 'Flex';
    const vcmiContextEl = document.getElementById('header-prop-vcmi-context');
    if (vcmiContextEl) vcmiContextEl.textContent = getVcmiContextLabel();
  }

  if (fieldKey === 'billing-address') {
    const hasValue = !!nextValue;
    validationFields.billingAddress.status = hasValue ? 'complete' : 'pending';
    renderValidationPageStatus();
  }
}

function applyAccountReadyState() {
  const badge = document.getElementById('account-badge');
  if (badge) {
    badge.className = 'badge-ready';
    badge.innerHTML = 'Account ready';
    badge.onclick = null;
    badge.style.cursor = 'default';
  }

  const trigger = document.getElementById('account-status-trigger');
  if (trigger) {
    trigger.onclick = openAccountValidationScreen;
    trigger.style.cursor = 'pointer';
  }

  const banner = document.getElementById('warning-banner');
  if (banner) {
    banner.classList.add('hidden');
    const body = document.getElementById('vc-body');
    if (body) body.classList.remove('has-banner');
  }
}

function resetAccountSetupSaveUI() {
  accountSetupSaveRunId += 1;
  if (accountSetupSaveTimer) {
    clearTimeout(accountSetupSaveTimer);
    accountSetupSaveTimer = null;
  }
  if (accountSetupValidatedTimer) {
    clearTimeout(accountSetupValidatedTimer);
    accountSetupValidatedTimer = null;
  }
  const loader = document.getElementById('account-setup-validate-loader');
  if (loader) loader.classList.add('hidden');
  const spinner = document.querySelector('.account-setup-validate-spinner');
  if (spinner) spinner.classList.remove('hidden');
  const validatedIcon = document.querySelector('.account-setup-validated-icon');
  if (validatedIcon) validatedIcon.classList.add('hidden');
  const loaderText = document.querySelector('.account-setup-validate-loader-text');
  if (loaderText) loaderText.textContent = 'Validating account...';
  const btn = document.getElementById('btn-account-setup-save');
  if (btn) {
    btn.textContent = 'Save & validate';
  }
  const cancelEl = document.querySelector('.account-setup-actions .vds-btn-secondary');
  if (cancelEl) cancelEl.disabled = false;
  const closeEl = document.querySelector('.account-setup-close');
  if (closeEl) {
    closeEl.style.pointerEvents = '';
    closeEl.style.opacity = '';
  }
  ['acc-setup-zip', 'acc-setup-taxid', 'acc-setup-phone'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
  updateAccountSetupSaveState();
}

function openAccountSetupModal() {
  const overlay = document.getElementById('account-setup-overlay');
  if (!overlay) return;
  if (overlay.classList.contains('open')) {
    updateAccountSetupSaveState();
    return;
  }
  resetAccountSetupSaveUI();
  document.body.style.overflow = 'hidden';
  overlay.classList.add('open');
  updateAccountSetupSaveState();
}

function closeAccountSetupModal() {
  if (accountSetupSaveTimer || accountSetupValidatedTimer) {
    resetAccountSetupSaveUI();
  }
  const overlay = document.getElementById('account-setup-overlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function updateAccountSetupSaveState() {
  const zip = document.getElementById('acc-setup-zip')?.value.trim() || '';
  const taxId = document.getElementById('acc-setup-taxid')?.value.trim() || '';
  const phone = document.getElementById('acc-setup-phone')?.value.trim() || '';
  const btn = document.getElementById('btn-account-setup-save');
  if (!btn) return;
  btn.disabled = !(zip && taxId && phone);
}

/**
 * Same contract “Review & send” landing as confirmAndLockDeal, without the confirm modal.
 * Used after account setup validation when the user had already chosen a winning option.
 */
function navigateToContractReviewFromSelection() {
  clearSignatureCompletionSimulation();
  const optId = bld.selectedOptionId;
  const opt = options.find((o) => o.id === optId);
  if (!opt) return false;
  const optionNumber = options.findIndex((o) => o.id === optId) + 1;
  proposalData.lockedTerm = opt.term; // F1: freeze term at selection
  logProposalEvent('Contract created', `Created from Option ${Math.max(1, optionNumber)} — ${opt.term}-month term locked.`);

  screen = 'contract-review';

  hideProposalReviewModal();
  document.getElementById('screen-proposal-selection').classList.add('hidden');
  document.getElementById('screen-drafting').classList.add('hidden');
  document.getElementById('options-grid').classList.add('hidden');

  document.getElementById('screen-contract').classList.remove('hidden');

  document.querySelector('.vc-main-stepper').classList.remove('hidden');
  document.getElementById('step-dot-1').className = 'vc-step-dot done';
  document.getElementById('step-dot-1').innerHTML =
    '<span class="material-symbols-outlined" style="font-size:14px;">check</span>';
  document.getElementById('step-label-1').classList.remove('muted');
  document.getElementById('step-dot-2').className = 'vc-step-dot active';
  document.getElementById('step-label-2').classList.remove('muted');

  document.getElementById('vc-body').style.paddingTop = '159px';

  document.getElementById('footer-send').innerText = 'Send E-Sign Link';
  document.getElementById('footer-send').disabled = false;

  const banner = document.getElementById('success-banner');
  banner.style.top = '159px';
  showSuccessBanner(
    'Contract has been created',
    'Your contract was successfully generated. Review the message and send the e-sign link.'
  );

  document.getElementById('screen-drafting').classList.add('hidden');

  touchNavDate('proposal');
  touchNavDate('proposal_selection');
  enterContractScreen(opt);
  renderNav();
  return true;
}

function saveAccountSetup() {
  const btn = document.getElementById('btn-account-setup-save');
  if (!btn || btn.disabled) return;
  if (accountSetupSaveTimer) return;
  accountSetupSaveRunId += 1;
  const thisRun = accountSetupSaveRunId;
  const loader = document.getElementById('account-setup-validate-loader');
  if (btn) {
    btn.textContent = 'Validating…';
    btn.disabled = true;
  }
  if (loader) loader.classList.remove('hidden');
  const spinner = document.querySelector('.account-setup-validate-spinner');
  if (spinner) spinner.classList.remove('hidden');
  const validatedIcon = document.querySelector('.account-setup-validated-icon');
  if (validatedIcon) validatedIcon.classList.add('hidden');
  const loaderText = document.querySelector('.account-setup-validate-loader-text');
  if (loaderText) loaderText.textContent = 'Validating account...';
  const cancelEl = document.querySelector('.account-setup-actions .vds-btn-secondary');
  if (cancelEl) cancelEl.disabled = true;
  const closeEl = document.querySelector('.account-setup-close');
  if (closeEl) {
    closeEl.style.pointerEvents = 'none';
    closeEl.style.opacity = '0.4';
  }
  ['acc-setup-zip', 'acc-setup-taxid', 'acc-setup-phone'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });

  accountSetupSaveTimer = setTimeout(() => {
    accountSetupSaveTimer = null;
    if (thisRun !== accountSetupSaveRunId) return;
    applyAccountReadyState();
    if (spinner) spinner.classList.add('hidden');
    if (validatedIcon) validatedIcon.classList.remove('hidden');
    if (loaderText) loaderText.textContent = 'Validated';
    const goToContract =
      accountSetupOpenedFromOptionSelection && bld.selectedOptionId != null && isAccountReady();
    accountSetupValidatedTimer = setTimeout(() => {
      accountSetupValidatedTimer = null;
      if (thisRun !== accountSetupSaveRunId) return;
      closeAccountSetupModal();
      showSuccessBanner(MSG_ACCOUNT_VALIDATED.title, MSG_ACCOUNT_VALIDATED.sub);
      if (goToContract) {
        accountSetupOpenedFromOptionSelection = false;
        setTimeout(() => openConfirmSelectionModal(), 160);
      }
    }, 700);
  }, 1800);
}
// ── PRICING DICTIONARIES ──────────────────────────────────────────
const corePricing = {
  'vtu': { name: 'VTU Only', price: 35.00 },
  'vtu-ffc': { name: 'VTU + Forward Facing Camera', price: 65.00 },
  'vtu-dual': { name: 'VTU + Dual Camera', price: 75.00 },
  'asset-powered': { name: 'Powered Asset', price: 39.00 },
  'asset-nonpowered': { name: 'Non-Powered Asset', price: 19.00 },
};
const featurePricing = { 'driver-id': 2.00, 'privacy': 1.00, 'adas': 5.00, 'evc': 15.00, 'logbook': 3.00, 'sd-256': 5.00, 'monitor': 12.00 };
const featureLabels = {
  'sd-256': '256 GB SD Card',
  'adas': 'ADAS',
  'evc': 'Extended View Cameras',
  'monitor': 'In-Cab Monitor',
  'driver-id': 'Driver ID',
  'privacy': 'Privacy Button',
  'logbook': 'Logbook'
};

// ── VOLUME TIERS ──────────────────────────────────────────────────
// ── F2: MSA / Co-term ────────────────────────────────────────────
// Mock MSA on file for demo account (Apex Construction LLC).
// In production this comes from the Salesforce Account record.
const DEMO_MSA = {
  id: 'MSA-2024-0391',
  startDate: '2024-03-15',
  endDate: '2027-07-15', // ~14 months from May 2026 → typical co-term scenario
  termMonths: 36,
  vehicleCount: 45,
};

function getMsaMonthsRemaining() {
  if (!proposalData.msaEndDate) return null;
  const end = new Date(proposalData.msaEndDate + 'T00:00:00');
  const now = new Date();
  return Math.max(1, Math.round((end - now) / (1000 * 60 * 60 * 24 * 30.44)));
}

function isMsaAutoExtend() {
  const rem = getMsaMonthsRemaining();
  return rem !== null && rem <= 6;
}

// ── END F2 ───────────────────────────────────────────────────────

const volumeTiers = [
  { min: 1,   max: 9,    label: '1-9',    discount: 0.00 },
  { min: 10,  max: 19,   label: '10-19',  discount: 0.05 },
  { min: 20,  max: 49,   label: '20-49',  discount: 0.10 },
  { min: 50,  max: 99,   label: '50-99',  discount: 0.15 },
  { min: 100, max: 9999, label: '100+',   discount: 0.20 },
];

function getNaturalTierIndex(qty) {
  const idx = volumeTiers.findIndex(t => qty >= t.min && qty <= t.max);
  return idx === -1 ? 0 : idx;
}

function getEffectiveTier(qty, forcedTierIndex = -1) {
  const natural = getNaturalTierIndex(qty);
  // If forcedTierIndex is provided, it must be at least the natural one to apply higher discount
  const effective = forcedTierIndex === -1 ? natural : Math.max(natural, forcedTierIndex);
  return { ...volumeTiers[effective], index: effective, naturalIndex: natural };
}

function getApprovalRole(skip) {
  if (skip === 1) return 'Associate Director';
  if (skip >= 2) return 'Director';
  return 'System';
}

function getTermMultiplier(term) {
  const t = parseInt(term);
  if (t <= 12) return 1.0;
  if (t <= 24) return 0.9;
  if (t <= 36) return 0.8;
  if (t <= 48) return 0.75;
  return 0.7; // 49+ months
}

function getPromoMultiplier(coreKey, promoType) {
  const isVideo = coreKey === 'vtu-ffc' || coreKey === 'vtu-dual';
  return (promoType === 'Media' && isVideo) ? 0.8 : 1.0;
}

function formatMoney(n) {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function calcBundle(bundle, termStr, promoType, forcedTierIndex = -1, tierQty = null) {
  const term = parseInt(termStr) || 36;
  const termMult  = getTermMultiplier(term);
  const qtyBasis  = tierQty == null ? bundle.qty : tierQty;
  const tierObj   = getEffectiveTier(qtyBasis, forcedTierIndex);
  const tierMult  = 1 - tierObj.discount;
  const promoMult = getPromoMultiplier(bundle.coreKey, promoType);
  const unitPrice = bundle.basePrice * termMult * tierMult * promoMult;
  const monthly   = unitPrice * bundle.qty;
  return { unitPrice, monthly, tier: tierObj, tierMult, promoMult, termMult };
}

function calcOption(opt, promoType = 'Standard', forcedTierIndex = -1) {
  let totalMonthly = 0, totalUnits = 0;
  opt.bundles.forEach(b => { totalUnits += b.qty; });
  opt.bundles.forEach(b => {
    const bundlePromo = b.promoType || promoType;
    const { monthly } = calcBundle(b, opt.term, bundlePromo, forcedTierIndex, totalUnits);
    totalMonthly += monthly;
  });
  const avgUnit = totalUnits > 0 ? totalMonthly / totalUnits : 0;
  return { totalMonthly, totalUnits, avgUnit };
}

function getOptionPromotion(opt) {
  if (!opt) return proposalData.promoType;
  return opt.promoType || proposalData.promoType;
}

function buildPromoChips(opt) {
  if (!opt.bundles || opt.bundles.length === 0) {
    return '<span style="font-size:11px;color:var(--gray-400);">No bundles yet</span>';
  }
  const videoBundles = opt.bundles.filter(b => isVideoCore(b.coreKey));
  if (videoBundles.length === 0) {
    return '<span class="promo-chip-opt">Standard</span>';
  }
  const fallback = getOptionPromotion(opt);
  return videoBundles.map(b => {
    const bPromo = b.promoType || fallback;
    const isMedia = bPromo === 'Media';
    return `<span class="promo-chip-opt ${isMedia ? 'media' : ''}" onclick="openConfigureBundle(${opt.id}, ${b.id})" title="Click to edit bundle promotion">${isMedia ? 'Media Promo −20%' : 'Standard'}&nbsp;<span class="material-symbols-outlined" style="font-size:10px;vertical-align:middle;">edit</span></span>`;
  }).join('');
}

function getOptPromoLabel(opt) {
  if (!opt.bundles || opt.bundles.length === 0) return 'Standard';
  const fallback = getOptionPromotion(opt);
  const promos = opt.bundles.map(b => b.promoType || fallback);
  const allMedia = promos.every(p => p === 'Media');
  const anyMedia = promos.some(p => p === 'Media');
  if (allMedia) return 'Media Promo';
  if (anyMedia) return 'Mixed';
  return 'Standard';
}

function buildOptPromoDropdownRows(opt) {
  const forcedTier = (opt.forcedTierIndex !== undefined) ? opt.forcedTierIndex : -1;
  const currentLabel = getOptPromoLabel(opt);
  const hasVideoBundles = opt.bundles.some(b => isVideoCore(b.coreKey));
  let totalUnits = 0;
  opt.bundles.forEach(b => { totalUnits += b.qty; });

  return PROMOS.map(promo => {
    const eligible = !promo.videoOnly || hasVideoBundles;
    const isSel = currentLabel === promo.label;

    let pricesHtml = '';
    if (opt.bundles.length > 0 && eligible) {
      let totalMonthly = 0;
      opt.bundles.forEach(b => {
        const bundlePromo = (promo.key === 'Media' && !isVideoCore(b.coreKey)) ? 'Standard' : promo.key;
        const { monthly } = calcBundle(b, opt.term, bundlePromo, forcedTier, totalUnits);
        totalMonthly += monthly;
      });
      let stdMonthly = 0;
      opt.bundles.forEach(b => { const { monthly } = calcBundle(b, opt.term, 'Standard', forcedTier, totalUnits); stdMonthly += monthly; });
      const savings = stdMonthly - totalMonthly;
      pricesHtml = `
        <div class="promo-dropdown-row-prices">
          <div class="promo-dropdown-row-unit">${formatMoney(totalMonthly)}/mo</div>
          ${savings > 0.005 ? `<div class="promo-dropdown-row-savings">−${formatMoney(savings)}/mo</div>` : ''}
        </div>`;
    }

    const lockHtml = !eligible
      ? `<div class="promo-dropdown-row-lock"><span class="material-symbols-outlined" style="font-size:11px;">lock</span> No camera bundles</div>`
      : '';

    return `
      <div class="promo-dropdown-row ${isSel ? 'selected' : ''} ${!eligible ? 'disabled' : ''}"
           ${eligible ? `onclick="setOptionPromo(${opt.id}, '${promo.key}')"` : ''}>
        <div class="promo-dropdown-row-left">
          <div class="promo-dropdown-radio"></div>
          <div>
            <div class="promo-dropdown-row-name">${promo.label}</div>
            <div class="promo-dropdown-row-sub">${promo.sub}</div>
            ${lockHtml}
          </div>
        </div>
        ${pricesHtml}
      </div>`;
  }).join('');
}

function toggleOptTierDropdown(optId, event) {
  event.stopPropagation();
  document.querySelectorAll('[id^="opt-tier-dd-"]').forEach(el => {
    if (el.id !== `opt-tier-dd-${optId}`) el.classList.add('hidden');
  });
  document.getElementById(`opt-tier-dd-${optId}`)?.classList.toggle('hidden');
}

function selectOptTier(optId, forcedIdx) {
  const opt = options.find(o => o.id === optId);
  if (!opt) return;
  opt.forcedTierIndex = forcedIdx;
  // Approval needed when forced tier is above natural
  const naturalIdx = getNaturalTierIndex(
    opt.bundles.reduce((s, b) => s + (b.qty || 0), 0)
  );
  if (forcedIdx > naturalIdx) {
    proposalData.approvalStatus = 'Pending';
  } else if (proposalData.approvalStatus === 'Pending') {
    proposalData.approvalStatus = null;
  }
  document.getElementById(`opt-tier-dd-${optId}`)?.classList.add('hidden');
  renderOptions();
}

function toggleOptTermDropdown(optId, event) {
  event.stopPropagation();
  document.querySelectorAll('[id^="opt-term-dd-"]').forEach(el => {
    if (el.id !== `opt-term-dd-${optId}`) el.classList.add('hidden');
  });
  document.getElementById(`opt-term-dd-${optId}`)?.classList.toggle('hidden');
}

function selectOptTerm(optId, val) {
  document.getElementById(`opt-term-dd-${optId}`)?.classList.add('hidden');
  updateTerm(optId, val);
}

function toggleOptPromoDropdown(optId, event) {
  event.stopPropagation();
  document.querySelectorAll('[id^="opt-promo-dd-"]').forEach(el => {
    if (el.id !== `opt-promo-dd-${optId}`) el.classList.add('hidden');
  });
  document.getElementById(`opt-promo-dd-${optId}`)?.classList.toggle('hidden');
}

function setOptionPromo(optId, promoKey) {
  const opt = options.find(o => o.id === optId);
  if (!opt) return;
  opt.promoType = promoKey;
  opt.bundles.forEach(b => { b.promoType = promoKey; });
  document.getElementById(`opt-promo-dd-${optId}`)?.classList.add('hidden');
  renderOptions();
  if (screen === 'selection') renderSelectionOptions();
}

// ── DATA & STATE ──────────────────────────────────────────────────
let screen = 'drafting';
// Initial app route:
// - 'sf-convert' keeps Salesforce convert mock as entry screen
// - 'drafting' opens ValuCal directly on Drafting (empty/options screen)
const INITIAL_APP_ROUTE = 'sf-convert';

function getInitialRoute() {
  const routeParam = new URLSearchParams(window.location.search).get('route');
  const route = (routeParam || INITIAL_APP_ROUTE || '').trim().toLowerCase();
  if (route === 'sf-convert' || route === 'drafting') return route;
  return 'drafting';
}


// ── FIELD VALIDATION HELPERS ────────────────────────────────────
function showFieldError(fieldId, msg) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.style.borderColor = '#EE001E';
  el.style.borderWidth = '2px';
  let errEl = document.getElementById(fieldId + '-err');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.id = fieldId + '-err';
    errEl.style.cssText = 'color:#EE001E;font-size:11px;margin-top:4px;';
    el.parentNode.appendChild(errEl);
  }
  errEl.textContent = msg;
}
function clearFieldError(fieldId) {
  const el = document.getElementById(fieldId);
  if (el) { el.style.borderColor = ''; el.style.borderWidth = ''; }
  const errEl = document.getElementById(fieldId + '-err');
  if (errEl) errEl.remove();
}

// ── MARK DEAD DEAL ───────────────────────────────────────────────
function updateMarkDeadBtn() {
  const hasAnyBundle = options.some(opt => opt.bundles && opt.bundles.length > 0);
  const draftMenuWrap = document.getElementById('draft-more-wrap');
  if (draftMenuWrap) draftMenuWrap.classList.remove('hidden');
  if (!hasAnyBundle) {
    document.getElementById('more-menu-draft')?.classList.add('hidden');
    document.getElementById('draft-more-btn')?.setAttribute('aria-expanded', 'false');
  }
  ['menu-mark-dead-draft', 'menu-mark-dead-selection'].forEach((id) => {
    const menuItem = document.getElementById(id);
    if (!menuItem) return;
    menuItem.classList.toggle('disabled', !hasAnyBundle);
    if (id === 'menu-mark-dead-draft') {
      menuItem.classList.toggle('hidden', !hasAnyBundle);
    }
  });
  const historyItem = document.getElementById('menu-view-history-draft');
  if (historyItem) {
    historyItem.classList.toggle('disabled', !proposalWasSentToCustomer);
    historyItem.classList.toggle('hidden', !proposalWasSentToCustomer);
  }
}

function openMarkDeadModal() {
  document.getElementById('mark-dead-overlay').classList.add('open');
  updateMarkDeadConfirmBtn();
}

function closeMarkDeadModal() {
  document.getElementById('mark-dead-overlay').classList.remove('open');
  document.getElementById('dead-reason-select').value = '';
  updateMarkDeadConfirmBtn();
}

function updateMarkDeadConfirmBtn() {
  const select = document.getElementById('dead-reason-select');
  const btn = document.getElementById('btn-confirm-rejection');
  if (!select || !btn) return;
  btn.disabled = !select.value;
}

function confirmMarkDead() {
  const reason = document.getElementById('dead-reason-select')?.value;
  if (!reason) {
    alert('Please select a reason before confirming.');
    return;
  }
  closeMarkDeadModal();
  // Navigate to deal result
  enterDealResult('rejected');
}

// ── F2: MSA CONTEXT BAR ──────────────────────────────────────────
function renderMsaContextBar() {
  const bar = document.getElementById('msa-context-bar');
  if (!bar) return;
  if (!proposalData.isAddOn) { bar.innerHTML = ''; return; }

  const rem = getMsaMonthsRemaining();
  const autoExtend = isMsaAutoExtend();
  const isGov = proposalData.segment === 'Government';

  const endDisplay = proposalData.msaEndDate
    ? new Date(proposalData.msaEndDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  let chips = '';
  if (autoExtend && !isGov) {
    chips += `<span class="msa-autoextend-chip"><span class="material-symbols-outlined" style="font-size:13px;">autorenew</span> Auto-extend will apply</span>`;
  }
  if (isGov) {
    chips += `<span class="msa-gov-chip"><span class="material-symbols-outlined" style="font-size:12px;">account_balance</span> Gov — separate contract terms apply</span>`;
  }

  bar.innerHTML = `
    <div class="msa-context-bar">
      <span class="material-symbols-outlined" style="font-size:16px; flex-shrink:0;">handshake</span>
      <span>Add-on to <span class="msa-bar-id">${proposalData.msaId}</span></span>
      <span class="msa-bar-sep">|</span>
      <span>MSA expires <strong>${endDisplay}</strong></span>
      ${rem !== null && !isGov ? `<span class="msa-bar-sep">|</span><span><strong>${rem}</strong> months remaining${autoExtend ? '' : ' — co-term applied'}</span>` : ''}
      ${chips}
    </div>`;
}

// ── APPROVAL SNACKBAR ────────────────────────────────────────────
function updateApprovalSnackbar() {
  const wrap = document.getElementById('approval-snackbar-wrap');
  if (!wrap) return;
  // Forced = any option has a tier override above its natural tier
  const isForced  = Array.isArray(options) && options.some(o => (o.forcedTierIndex !== undefined ? o.forcedTierIndex : -1) !== -1);
  const isApproved = proposalData.approvalStatus === 'Approved';
  const isPending  = proposalData.approvalStatus === 'Pending';
  const hasOptions = Array.isArray(options) && options.some(opt => opt.bundles && opt.bundles.length > 0);

  if (!isForced || isApproved) {
    wrap.innerHTML = '';
    // Re-enable all option buttons
    document.querySelectorAll('.btn-select-contract').forEach(btn => {
      btn.disabled = false;
      btn.textContent = 'Select & create contract';
    });
    return;
  }

  if (isPending) {
    wrap.innerHTML = `
      <div class="success-banner approval-success-inline">
        <div class="success-banner-left">
          <span class="material-symbols-outlined success-banner-icon">check_circle</span>
          <div>
          <div class="success-banner-title">Approval request has been processed.</div>
          <div class="success-banner-sub">Your request is under review. You'll be notified once approved.</div>
          </div>
        </div>
      </div>`;
    // Keep buttons disabled while pending
    document.querySelectorAll('.btn-select-contract').forEach(btn => {
      btn.disabled = true;
      btn.textContent = 'Requires approval';
    });
    return;
  }

  // Show warning snackbar
  wrap.innerHTML = `
    <div class="approval-snackbar warning">
      <div class="approval-snackbar-left">
        <span class="material-symbols-outlined approval-snackbar-icon">warning</span>
        <div>
        <div class="approval-snackbar-text">This configuration requires administrative approval.</div>
        <div class="approval-snackbar-sub">${hasOptions ? 'A forced tier override has been applied to this proposal.' : 'Add at least one option before requesting approval.'}</div>
        </div>
      </div>
      <button class="btn-request-approval-snack" onclick="requestApproval()" ${hasOptions ? '' : 'disabled'}>Request approval</button>
    </div>`;

  // Disable all option buttons
  document.querySelectorAll('.btn-select-contract').forEach(btn => {
    btn.disabled = true;
    btn.textContent = 'Requires approval';
  });
}

function requestApproval() {
  if (!Array.isArray(options) || !options.some(opt => opt.bundles && opt.bundles.length > 0)) return;
  openApprovalRequestModal();
}

function openProposalDocFromNav(event) {
  if (event) event.stopPropagation();
  openProposalPdfTab();
}

function openContractDocFromNav(event) {
  if (event) event.stopPropagation();
  openContractPdfTab();
}

// ═══════════════════════════════════════════════════════════════
// HEADER NAV — faithful to Figma 6496:48400
// ═══════════════════════════════════════════════════════════════
function renderNav() {
  const el = document.getElementById('vc-nav');
  if (!el) return;
  touchCurrentStepDates();

  // ── Determine current nav state ──────────────────────────────
  const cSub = (typeof contractSubState !== 'undefined') ? contractSubState : 'pre-send';

  // Map app screen → { phase, activeMajor, activeSub }
  let activeMajor = 'proposal'; // 'proposal' | 'contract' | 'payment' | 'result'
  let activeSub   = 'drafting'; // sub-step key within the active major step

  if      (screen === 'drafting')        { activeMajor = 'proposal';  activeSub = 'drafting'; }
  else if (screen === 'review')          { activeMajor = 'proposal';  activeSub = 'review'; }
  else if (screen === 'selection')       { activeMajor = 'proposal';  activeSub = 'selection'; }
  else if (screen === 'contract-review') {
    // Contract review-send remains under Contract.
    // Signature completed / payment setup moves the active major step to Payment setup.
    if (cSub === 'pre-send' || cSub === 'waiting') {
      activeMajor = 'contract';
      activeSub = cSub === 'pre-send' ? 'review-send' : 'sign-pay';
    } else {
      activeMajor = 'payment';
      activeSub = 'sign-pay';
    }
  }
  else if (screen === 'deal-result')     { activeMajor = 'result'; activeSub = 'result'; }

  // Which majors are done?
  const majorOrder  = ['proposal', 'contract', 'payment', 'result'];
  const activeIdx   = majorOrder.indexOf(activeMajor);
  const majorState  = (key) => {
    const i = majorOrder.indexOf(key);
    if (i < activeIdx)  return 'done';
    if (i === activeIdx) return 'active';
    return 'pending';
  };

  // Dates per major (set when completed)
  const dates = window._navDates || {};

  // ── SVG builders ─────────────────────────────────────────────

  // Checkmark SVG for done circles
  const checkSvg = `<svg width="14" height="11" viewBox="0 0 14 11" fill="none">
    <path d="M1.5 5.5L5.5 9.5L12.5 1.5" stroke="white" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  function escapeHtmlAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeHtmlText(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function substepTooltipHtml(subs, phase = '') {
    if (!Array.isArray(subs) || subs.length === 0) return '';
    return subs.map((s) => {
      const isSkippedProposalReview = phase === 'proposal' && s.key === 'review' && !s.date;
      const displayDate = isSkippedProposalReview ? 'Skipped' : (s.date || '--');
      return `<div class="ns-tooltip-row"><strong>${escapeHtmlText(s.label)}</strong>: ${escapeHtmlText(displayDate)}</div>`;
    }).join('');
  }

  // Info icon with custom tooltip card
  function infoIcon(tooltipHtml = '') {
    return `<span class="ns-info-wrap" role="img" aria-label="Info">
      <svg class="ns-info-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1" fill="none"/>
        <circle cx="8" cy="4.8" r="0.9" fill="currentColor"/>
        <path d="M8 7.2V12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
      <span class="ns-tooltip-card" role="tooltip" aria-label="Step details">
        <span class="ns-tooltip-body">${tooltipHtml || '<div class="ns-tooltip-row">Completion details</div>'}</span>
      </span>
    </span>`;
  }

  function substepTooltip(subs, phase = '', extraHtml = '') {
    const body = `${substepTooltipHtml(subs, phase)}${extraHtml || ''}`;
    return infoIcon(body);
  }

  // Chevron shape — the overlapping arrow separator
  // fill = background of the tab to its LEFT, border matches its right edge context
  function chevron(bgFill, borderColor) {
    return `<div class="ns-chevron">
      <svg viewBox="0 0 12 72" fill="none" xmlns="http://www.w3.org/2000/svg"
        width="12" height="72"
        style="display:block;position:absolute;top:0;left:0;width:12px;height:72px;">
        <path d="M0 24L12 36L0 48Z" fill="${bgFill}"/>
        <path d="M0 0V24L12 36L0 48V72" stroke="${borderColor}" stroke-width="1" fill="none"/>
      </svg>
    </div>`;
  }

  // ── Step circle HTML ─────────────────────────────────────────
  function circle(state, num) {
    if (state === 'done')    return `<div class="ns-circle done">${checkSvg}</div>`;
    if (state === 'active')  return `<div class="ns-circle active">${num}</div>`;
    return `<div class="ns-circle pending">${num}</div>`;
  }

  // ── Step label+date block ────────────────────────────────────
  function stepInfo(state, label, date, showInfo, tooltipHtml = '') {
    const dateStr = date || '--';
    const info    = showInfo ? tooltipHtml : '';
    return `<div class="ns-label ${state}">${label}</div>
            <div class="ns-date">${dateStr}${info}</div>`;
  }

  // ── Sub-steps strip builder ───────────────────────────────────
  function subStrip(subs, activeSubKey, allDone, layout) {
    const isPair = layout === 'pair';
    const activeSubIdx = subs.findIndex(s => s.key === activeSubKey);
    const canOpenSelectionFromReview = screen === 'review';
    let dotsHtml = '';
    subs.forEach((s, i) => {
      let st = allDone || i < activeSubIdx ? 'done'
               : i === activeSubIdx ? 'active' : 'pending';
      if (s.key === 'review' && proposalWasSentToCustomer && st === 'pending') {
        st = 'done';
      }
      if (screen === 'review' && s.key === 'selection' && hasVisitedSelectionStep() && st === 'pending') {
        st = 'done';
      }
      const defaultDate = '--';
      const isClickableSelection = s.key === 'selection' && canOpenSelectionFromReview;
      const isActiveSub = i === activeSubIdx;
      const activeMark = isActiveSub ? ' ns-sub--active' : '';
      const subClass = isClickableSelection
        ? `ns-sub ns-sub--to-selection${activeMark}`
        : `ns-sub${activeMark}`;
      const a11y = isClickableSelection
        ? ' role="link" tabindex="0" title="Open option selection (without sending yet)" onclick="returnToOptionSelectionFromReview()" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();returnToOptionSelectionFromReview();}"'
        : '';
      dotsHtml += `<div class="${subClass}"${a11y}>
        <div class="ns-sub-dot ${st}"></div>
        <div class="ns-sub-name">${s.label}</div>
        <div class="ns-sub-date">${s.date || defaultDate}</div>
      </div>`;
    });
    const subsClass = isPair ? 'ns-subs ns-subs--pair' : 'ns-subs';
    return `<div class="${subsClass}">
      <div class="ns-subs-inner">
        <div class="ns-subs-line"></div>
        ${dotsHtml}
      </div>
    </div>`;
  }

  // ── Build each major step ─────────────────────────────────────

  const proposalSubs = [
    { key:'drafting',   label:'Drafting', date: dates.proposal_drafting },
    { key:'review',     label:'Review & send', date: dates.proposal_review },
    { key:'selection',  label:'Selection', date: dates.proposal_selection },
  ];
  const contractSubs = [
    { key:'review-send', label:'Review & send', date: dates.contract_review_send },
    { key:'sign-pay',    label:'Signature', date: dates.contract_sign_pay },
  ];

  const proposalDocHtml = document.getElementById('prop-doc-viewer')?.innerHTML || '';
  const contractDocHtml =
    document.getElementById('contract-doc-viewer')?.innerHTML ||
    document.getElementById('contract-doc-viewer2')?.innerHTML ||
    '';
  const canViewProposalDoc = !!dates.proposal_review || !!proposalDocHtml.trim();
  const canViewContractDoc = !!dates.contract_review_send || !!contractDocHtml.trim();
  const proposalDocLink = canViewProposalDoc
    ? `<div class="ns-tooltip-doc-row"><button type="button" class="ns-tooltip-doc-link" onclick="openProposalDocFromNav(event)"><span class="material-symbols-outlined ns-tooltip-doc-icon" aria-hidden="true">description</span><span class="ns-tooltip-doc-text">View doc</span></button></div>`
    : '';
  const contractDocLink = canViewContractDoc
    ? `<div class="ns-tooltip-doc-row"><button type="button" class="ns-tooltip-doc-link" onclick="openContractDocFromNav(event)"><span class="material-symbols-outlined ns-tooltip-doc-icon" aria-hidden="true">description</span><span class="ns-tooltip-doc-text">View doc</span></button></div>`
    : '';

  let html = '';

  // ── STEP 1: Proposal ──────────────────────────────────────────
  const pState = majorState('proposal');
  const pChevronFill    = pState === 'active' ? '#F8F3E9'
                        : pState === 'done'   ? '#fff'
                        :                       '#F8F7F5';
  const pChevronBorder  = pState === 'active' ? '#DDDAD4'
                        : pState === 'done'   ? '#DDDAD4'
                        :                       '#DDDAD4';

  if (pState === 'active') {
    // Active Proposal: stone tab + chevron + sub-steps
    html += `<div class="ns-wrap ns-first" style="z-index:4;">
      <div class="ns-cell ns-active" style="padding-right:0;">
        <div class="ns-content">
          ${circle('active', '1')}
          ${stepInfo('active', 'Proposal', '--', false)}
        </div>
      </div>
      ${chevron('#F8F3E9', '#DDDAD4')}
      ${subStrip(proposalSubs, activeSub, false, 'triple')}
      ${chevron('#fff', '#DDDAD4')}
    </div>`;
  } else {
    // Done Proposal: white tab, green circle, date + info
    html += `<div class="ns-wrap ns-first" style="z-index:4;">
      <div class="ns-cell ns-done" style="padding-left:8px;">
        <div class="ns-content">
          ${circle('done', '1')}
          ${stepInfo('done', 'Proposal', dates.proposal_selection || dates.proposal || '--', true, substepTooltip(proposalSubs, 'proposal', proposalDocLink))}
        </div>
      </div>
      ${chevron('#fff', '#DDDAD4')}
    </div>`;
  }

  // ── STEP 2: Contract ──────────────────────────────────────────
  const cState = majorState('contract');

  if (cState === 'active') {
    html += `<div class="ns-wrap active-phase" style="z-index:3;">
      <div class="ns-cell ns-active" style="padding-right:0;padding-left:6px;">
        <div class="ns-content">
          ${circle('active', '2')}
          ${stepInfo('active', 'Contract', dates.contract || '--', false)}
        </div>
      </div>
      ${chevron('#F8F3E9', '#DDDAD4')}
      ${subStrip(contractSubs, activeSub, false, 'pair')}
      ${chevron('#fff', '#DDDAD4')}
    </div>`;
  } else if (cState === 'done') {
    html += `<div class="ns-wrap active-phase" style="z-index:3;">
      <div class="ns-cell ns-done" style="padding-left:6px;">
        <div class="ns-content">
          ${circle('done', '2')}
          ${stepInfo('done', 'Contract', dates.contract || '--', true, substepTooltip(contractSubs, 'contract', contractDocLink))}
        </div>
      </div>
      ${chevron('#fff', '#DDDAD4')}
    </div>`;
  } else {
    html += `<div class="ns-wrap collapsed-phase" style="z-index:3;">
      <div class="ns-cell ns-pending" style="padding-left:6px;">
        <div class="ns-content">
          ${circle('pending', '2')}
          ${stepInfo('pending', 'Contract', '--', false)}
        </div>
      </div>
      ${chevron('#F8F7F5', '#DDDAD4')}
    </div>`;
  }

  // ── STEP 3: Payment setup ─────────────────────────────────────
  const paState = majorState('payment');

  if (paState === 'active') {
    html += `<div class="ns-wrap active-phase" style="z-index:2;">
      <div class="ns-cell ns-active" style="padding-left:16px;">
        <div class="ns-content">
          ${circle('active', '3')}
          ${stepInfo('active', 'Payment setup', dates.payment || '--', false)}
        </div>
      </div>
      ${chevron('#F8F3E9', '#DDDAD4')}
    </div>`;
  } else if (paState === 'done') {
    html += `<div class="ns-wrap active-phase" style="z-index:2;">
      <div class="ns-cell ns-done" style="padding-left:16px;">
        <div class="ns-content">
          ${circle('done', '3')}
          ${stepInfo('done', 'Payment setup', dates.payment || '--', false)}
        </div>
      </div>
      ${chevron('#fff', '#DDDAD4')}
    </div>`;
  } else {
    html += `<div class="ns-wrap collapsed-phase" style="z-index:2;">
      <div class="ns-cell ns-pending" style="padding-left:16px;">
        <div class="ns-content">
          ${circle('pending', '3')}
          ${stepInfo('pending', 'Payment setup', '--', false)}
        </div>
      </div>
      ${chevron('#F8F7F5', '#DDDAD4')}
    </div>`;
  }

  // ── STEP 4: Deal result ───────────────────────────────────────
  // Last step — no chevron, has border
  const rState = majorState('result');
  html += `<div class="ns-wrap collapsed-phase" style="z-index:1;">
    <div class="ns-cell ns-pending ns-last" style="padding-left:16px;${rState==='active'?'background:#F8F3E9;border-bottom:1px solid #000;':rState==='done'?'background:#fff;':''}">
      <div class="ns-content">
        ${circle(rState, '4')}
        ${stepInfo(rState, 'Deal result', rState==='done'?(dates.result||'--'):rState==='active'?(dates.result || '--'):'--', rState==='done')}
      </div>
    </div>
  </div>`;

  el.innerHTML = html;
  updateReviewBackToSelectionHint();
}

// Store nav dates when steps complete
window._navDates = window._navDates || {};
function formatUsDate(date) {
  return new Intl.DateTimeFormat('en-US').format(date);
}
function formatExpirationDisplayDate(date) {
  return formatUsDate(date);
}
function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function addCalendarDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
function getLastDayOfCurrentMonthIso() {
  const now = new Date();
  return toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}
function parseProposalDate(value) {
  if (!value || typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const parsed = new Date(y, m - 1, d);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const [m, d, y] = raw.split('/').map(Number);
    const parsed = new Date(y, m - 1, d);
    if (Number.isNaN(parsed.getTime())) return null;
    if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) return null;
    return parsed;
  }

  return null;
}
function getExpirationBounds() {
  const today = startOfDay(new Date());
  const maxDate = addCalendarDays(today, 60);
  return { minDate: today, maxDate };
}
function clampExpirationDate(date) {
  const { minDate, maxDate } = getExpirationBounds();
  if (date < minDate) return minDate;
  if (date > maxDate) return maxDate;
  return date;
}
function getDefaultExpirationDate() {
  const { minDate } = getExpirationBounds();
  return clampExpirationDate(addCalendarDays(minDate, 14));
}
function getSelectedExpirationDate() {
  const ids = ['proposal-expiration-date', 'contract-expiration-date', 'contract-sign-expiration-date'];
  for (const id of ids) {
    const input = document.getElementById(id);
    const parsed = parseProposalDate(input?.value || '');
    if (parsed) return clampExpirationDate(startOfDay(parsed));
  }
  return getDefaultExpirationDate();
}
function configureExpirationInput(input) {
  if (!input) return;
  const { minDate, maxDate } = getExpirationBounds();
  input.min = toIsoDate(minDate);
  input.max = toIsoDate(maxDate);
}
function syncExpirationInputs(date) {
  const normalizedDate = clampExpirationDate(startOfDay(date));
  const isoValue = toIsoDate(normalizedDate);
  ['proposal-expiration-date', 'contract-expiration-date', 'contract-sign-expiration-date'].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    configureExpirationInput(input);
    input.value = isoValue;
  });
}
function validateAndSyncExpirationFrom(sourceId) {
  const source = document.getElementById(sourceId);
  if (!source) {
    syncExpirationInputs(getSelectedExpirationDate());
    return true;
  }
  configureExpirationInput(source);
  const parsed = parseProposalDate(source.value || '');
  if (!parsed) {
    source.value = toIsoDate(getSelectedExpirationDate());
    return false;
  }
  const normalized = clampExpirationDate(startOfDay(parsed));
  syncExpirationInputs(normalized);
  return true;
}
function navToday() {
  return formatUsDate(new Date());
}
function touchNavDate(key, overwrite = false) {
  if (!key) return;
  window._navDates = window._navDates || {};
  if (overwrite || !window._navDates[key]) window._navDates[key] = navToday();
}
function touchCurrentStepDates() {
  touchNavDate('proposal_drafting');
  if (screen === 'review') {
    touchNavDate('proposal_review');
  } else if (screen === 'selection') {
    touchNavDate('proposal_selection');
  } else if (screen === 'contract-review') {
    if (contractSubState === 'pre-send' || contractSubState === 'waiting') {
      touchNavDate('contract_review_send');
    } else {
      touchNavDate('contract_sign_pay');
    }
  } else if (screen === 'deal-result') {
    touchNavDate('result');
  }
}

/** True after the user has reached Selection at least once (e.g. sent from Review, or came back from Contract). */
function hasVisitedSelectionStep() {
  return !!(window._navDates && window._navDates['proposal_selection']);
}

function updateReviewBackToSelectionHint() {
  const btn = document.getElementById('btn-skip-to-selection');
  if (!btn) return;
  const canSkip = screen === 'review';
  btn.classList.toggle('hidden', !canSkip);
  btn.disabled = !canSkip;
}

/**
 * From Review: go to Finalize selection without sending the proposal (or again if already sent).
 * Does not run handleSend / success banner.
 */
function returnToOptionSelectionFromReview() {
  if (screen !== 'review') return;
  screen = 'selection';
  hideProposalReviewModal();
  document.getElementById('screen-drafting').classList.add('hidden');
  document.getElementById('screen-proposal-selection').classList.remove('hidden');
  const sendBtn = document.getElementById('footer-send');
  sendBtn.innerText = 'Select Winning Option';
  sendBtn.classList.add('hidden');
  sendBtn.disabled = true;
  const d2 = document.getElementById('substep-dot-2');
  const d3 = document.getElementById('substep-dot-3');
  const l2 = document.getElementById('substep-line-2');
  const l3 = document.getElementById('substep-label-3');
  if (d2) d2.className = 'prop-step-dot done';
  if (d3) d3.className = 'prop-step-dot active';
  if (l2) l2.className = 'prop-line done';
  if (l3) l3.classList.remove('muted');
  document.getElementById('footer-back')?.classList.remove('hidden');
  document.getElementById('footer-back')?.classList.add('visible');
  renderSelectionOptions();
  updateMarkDeadBtn();
  updateSendBtn();
  renderNav();
}

let options = [];
let nextOptId = 1;

let proposalData = {
  name: 'New Proposal',
  promoType: 'Media',
  contractType: 'Flex',
  vcmiMode: 'VMI',
  closeDate: '',
  forcedTierIndex: -1, 
  approvalStatus: 'None', // 'None', 'Pending', 'Approved'
  lockedTerm: null,      // F1: set to opt.term when client selects an option
  // F2: MSA add-on / co-term
  isAddOn: false,        // true when adding vehicles to an existing MSA
  msaId: '',             // e.g. 'MSA-2024-0391'
  msaEndDate: '',        // ISO date string; drives co-term calculation
  wavesEnabled: false,   // F3: deployment wave planning
  // Segment & deal classification (gates Enterprise/Gov fields)
  segment: 'SMB',        // 'SMB' | 'Enterprise' | 'Government'
  poNumber: '',          // Enterprise & Gov: Purchase Order / MIPR #
  costCenter: '',        // Enterprise: cost center / GL code
  contractVehicle: '',   // Gov: GSA Schedule, SEWP V, etc.
  contractingOfficerName: '',
  contractingOfficerEmail: '',
  contractingOfficerPhone: '',
};
let seasonalConfig = { startMonth: '', endMonth: '' };
let proposalWasSentToCustomer = false;

let bld = { targetOptId: null, targetBundleId: null, qty: 15, coreKey: null, coreName: null, corePrice: 0, selectedFeatures: [], promoType: 'Standard' };

// ── UI HELPERS ──────────────────────────────────
function dismissBanner() {
  const b = document.getElementById('warning-banner');
  if (b) b.classList.add('hidden');
  document.getElementById('vc-body')?.classList.remove('has-banner');
}

function dismissSuccessBanner() {
  document.getElementById('success-banner')?.classList.add('hidden');
  document.getElementById('vc-body')?.classList.remove('has-banner');
}

let bannerTimer = null;
function showSuccessBanner(title, sub) {
  if (bannerTimer) clearTimeout(bannerTimer);
  document.getElementById('success-title').innerText = title;
  document.getElementById('success-sub').innerText = sub;
  document.getElementById('success-banner').classList.remove('hidden');
  document.getElementById('vc-body').classList.add('has-banner');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  bannerTimer = setTimeout(dismissSuccessBanner, 4500);
}

function showNotif(title, sub) {
  showSuccessBanner(title, sub);
}
function dismissGlobalBanner() {
  document.getElementById('global-approval-banner').classList.add('hidden');
}

// ── MENU INTERACTION ────────────────────────────
function toggleSidebar(open) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (open) {
    sidebar.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  } else {
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function openCaseStudiesPage(event) {
  if (event) event.preventDefault();
  toggleSidebar(false);
  openCaseStudiesModal();
}

function openResourcesPage(event) {
  if (event) event.preventDefault();
  toggleSidebar(false);
  openResourcesModal();
}

function openCaseStudiesModal() {
  const overlay = document.getElementById('case-studies-overlay');
  const frame = document.getElementById('case-studies-frame');
  if (!overlay || !frame) return;
  if (frame.getAttribute('src') === 'about:blank') {
    frame.setAttribute('src', 'case studies/caseStudies.html');
  }
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCaseStudiesModal() {
  const overlay = document.getElementById('case-studies-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function openResourcesModal() {
  const overlay = document.getElementById('resources-overlay');
  const frame = document.getElementById('resources-frame');
  if (!overlay || !frame) return;
  if (frame.getAttribute('src') === 'about:blank') {
    frame.setAttribute('src', 'resources/valuCalResources.html');
  }
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeResourcesModal() {
  const overlay = document.getElementById('resources-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// ── CONFIGURE BUNDLE ────────────────────────────
function openConfigureBundle(optId, bundleId) {
  bld.targetOptId = optId || null;
  bld.targetBundleId = bundleId || null;

  const optionLabelEl = document.getElementById('bundle-option-label');
  if (optionLabelEl) {
    if (optId) {
      const optionIndex = options.findIndex((o) => o.id === optId);
      optionLabelEl.innerText = `Option ${Math.max(1, optionIndex + 1)}`;
    } else {
      optionLabelEl.innerText = `Option ${options.length + 1}`;
    }
  }
  
  // Set term label based on option
  const term = optId ? (options.find(o => o.id === optId)?.term || 36) : 36;
  document.getElementById('preview-term-badge').innerText = `${term} month term contract`;
  
  // Sync promo state with bundle or proposal default
  if (bundleId) {
    const opt = options.find(o => o.id === optId);
    const bundle = opt.bundles.find(b => b.id === bundleId);
    bld.qty = bundle.qty;
    bld.promoType = bundle.promoType || proposalData.promoType || 'Standard';
    bld.selectedFeatures = Array.isArray(bundle.features) ? [...bundle.features] : [];
    selectCore(bundle.coreKey);
    Object.keys(featurePricing).forEach(featureKey => {
      const checkbox = document.getElementById(`addon-${featureKey}`);
      if (checkbox) checkbox.checked = bld.selectedFeatures.includes(featureKey);
    });
    const evcSelect = document.getElementById('evc-type-select');
    if (evcSelect) evcSelect.value = bundle.evcType || 'sides-rear-cargo';
    const sd128 = document.getElementById('sd-card-128');
    const sd256 = document.getElementById('sd-card-256');
    if (sd128 && sd256) {
      const has256 = bld.selectedFeatures.includes('sd-256');
      sd256.checked = has256;
      sd128.checked = !has256;
    }
    syncAddonControls();
    document.getElementById('qty-display').value = bld.qty;
    document.getElementById('btn-create').innerText = 'Update Bundle';
  } else {
    bld.qty = 1;
    bld.coreKey = null;
    bld.promoType = proposalData.promoType || 'Standard';
    bld.selectedFeatures = [];
    document.getElementById('core-label').innerText = 'Select core';
    document.getElementById('core-label').parentElement.classList.remove('selected');
    document.getElementById('qty-display').value = bld.qty;
    document.getElementById('addons-section').classList.add('hidden');
    Object.keys(featurePricing).forEach(featureKey => {
      const checkbox = document.getElementById(`addon-${featureKey}`);
      if (checkbox) checkbox.checked = false;
    });
    const evcSelect = document.getElementById('evc-type-select');
    if (evcSelect) evcSelect.value = 'sides-rear-cargo';
    const sd128 = document.getElementById('sd-card-128');
    const sd256 = document.getElementById('sd-card-256');
    if (sd128 && sd256) {
      sd128.checked = true;
      sd256.checked = false;
    }
    document.getElementById('btn-create').innerText = 'Create Bundle';
    document.getElementById('btn-create').disabled = true;
    document.getElementById('preview-lines').classList.add('hidden');
    document.getElementById('preview-price-val').innerText = '--';
    // Reset accordion state so they open fresh on next core selection
    ['acc-video','acc-vehicle'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('open'); delete el.dataset.manualToggle; }
    });
  }
  
  renderPromoCards();
  document.getElementById('bundle-overlay').classList.add('open');
}

function closeBundleModal() { document.getElementById('bundle-overlay').classList.remove('open'); }
function toggleCoreDropdown() { 
  document.getElementById('core-dropdown').classList.toggle('hidden');
  document.getElementById('bundle-promo-dropdown').classList.add('hidden');
}

function isVehicleCore(coreKey) {
  return coreKey === 'vtu' || coreKey === 'vtu-ffc' || coreKey === 'vtu-dual';
}

function isVideoCore(coreKey) {
  return coreKey === 'vtu-ffc' || coreKey === 'vtu-dual';
}

function getSelectedEvcType() {
  const el = document.getElementById('evc-type-select');
  return el ? el.value : 'sides-rear-cargo';
}

function getEvcTypeLabel(type) {
  const map = {
    'sides-rear-cargo': 'Sides, Rear & Cargo',
    'sides': 'Sides',
    'sides-rear': 'Sides & Rear',
    'rear-cargo': 'Rear and Cargo'
  };
  return map[type] || map['sides-rear-cargo'];
}

function getFeatureState(coreKey, selectedFeatures = []) {
  const isVehicle = isVehicleCore(coreKey);
  const isVideo = isVideoCore(coreKey);
  const hasEvc = selectedFeatures.includes('evc');
  return {
    'driver-id': { visible: isVehicle, enabled: isVehicle },
    'privacy': { visible: isVehicle, enabled: isVehicle },
    'logbook': { visible: isVehicle, enabled: isVehicle },
    'sd-256': { visible: isVideo, enabled: isVideo },
    'adas': { visible: isVideo, enabled: isVideo },
    'evc': { visible: isVideo, enabled: isVideo },
    'monitor': { visible: isVideo, enabled: isVideo && hasEvc }
  };
}

function syncAddonControls() {
  const section = document.getElementById('addons-section');
  if (!section) return;
  const state = getFeatureState(bld.coreKey, bld.selectedFeatures || []);
  const rowMap = {
    'driver-id': document.getElementById('addon-driver-id-row'),
    'privacy': document.getElementById('addon-privacy-row'),
    'logbook': document.getElementById('addon-logbook-row'),
    'adas': document.getElementById('addon-adas-row'),
    'evc': document.getElementById('addon-evc-row'),
    'monitor': document.getElementById('addon-monitor-row')
  };

  let visibleCount = 0;
  Object.keys(rowMap).forEach((featureKey) => {
    const checkbox = document.getElementById(`addon-${featureKey}`);
    const row = rowMap[featureKey];
    if (!checkbox || !row) return;
    const cfg = state[featureKey] || { visible: false, enabled: false };
    if (cfg.visible) visibleCount += 1;
    const shouldShowRow = featureKey === 'monitor'
      ? (cfg.visible && cfg.enabled)
      : cfg.visible;
    row.style.display = shouldShowRow ? 'block' : 'none';
    checkbox.disabled = !cfg.enabled;
    if (!shouldShowRow || !cfg.enabled) checkbox.checked = false;
  });

  const sdRow = document.getElementById('addon-sd-card-row');
  const sd128 = document.getElementById('sd-card-128');
  const sd256 = document.getElementById('sd-card-256');
  const sdVisible = !!(state['sd-256'] && state['sd-256'].visible);
  if (sdRow) sdRow.style.display = sdVisible ? 'block' : 'none';
  if (sd128 && sd256 && !sdVisible) {
    sd128.checked = true;
    sd256.checked = false;
  }
  if (sdVisible) visibleCount += 1;

  const hasVideo = isVideoCore(bld.coreKey);
  const hasVehicle = isVehicleCore(bld.coreKey);

  // Accordion visibility
  const accVideo = document.getElementById('acc-video');
  const accVehicle = document.getElementById('acc-vehicle');
  if (accVideo) accVideo.style.display = hasVideo ? 'block' : 'none';
  if (accVehicle) accVehicle.style.display = hasVehicle ? 'block' : 'none';

  // Auto-open accordion when core is first selected
  if (hasVideo && accVideo && !accVideo.classList.contains('open') && !accVideo.dataset.manualToggle) accVideo.classList.add('open');
  if (hasVehicle && accVehicle && !accVehicle.classList.contains('open') && !accVehicle.dataset.manualToggle) accVehicle.classList.add('open');

  // Update accordion badges
  const videoBadge = document.getElementById('acc-video-badge');
  const vehicleBadge = document.getElementById('acc-vehicle-badge');
  if (videoBadge) {
    const videoSelected = bld.selectedFeatures.filter(k => ['evc','monitor','adas','sd-256'].includes(k)).length;
    videoBadge.textContent = videoSelected;
    videoBadge.classList.toggle('visible', videoSelected > 0);
  }
  if (vehicleBadge) {
    const vehicleSelected = bld.selectedFeatures.filter(k => ['driver-id','privacy','logbook'].includes(k)).length;
    vehicleBadge.textContent = vehicleSelected;
    vehicleBadge.classList.toggle('visible', vehicleSelected > 0);
  }

  const evcCheckbox = document.getElementById('addon-evc');
  const evcOptions = document.getElementById('addon-evc-options');
  const evcLabelText = document.getElementById('addon-evc-label-text');
  const showEvcOptions = hasVideo && !!(evcCheckbox && evcCheckbox.checked);
  if (evcOptions) evcOptions.style.display = showEvcOptions ? 'block' : 'none';
  if (evcLabelText) evcLabelText.style.fontWeight = showEvcOptions ? '700' : '400';
  if (!showEvcOptions) {
    const evcSelect = document.getElementById('evc-type-select');
    if (evcSelect) evcSelect.value = 'sides-rear-cargo';
  }

  bld.selectedFeatures = [];
  ['driver-id', 'privacy', 'logbook', 'adas', 'evc', 'monitor'].forEach((featureKey) => {
    const checkbox = document.getElementById(`addon-${featureKey}`);
    if (checkbox && checkbox.checked) bld.selectedFeatures.push(featureKey);
  });
  if (sdVisible && sd256 && sd256.checked) bld.selectedFeatures.push('sd-256');

  section.style.display = visibleCount > 0 ? 'block' : 'none';
}

function onAddonChange() {
  syncAddonControls();
  updateBundlePreview();
}

function toggleAddonAccordion(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('open');
  el.dataset.manualToggle = '1';
}

function selectBundlePromo(val, silent = false) {
  // Legacy shim — promo is now set via selectPromoCard() in the bundle modal
  bld.promoType = (val === 'media') ? 'Media' : 'Standard';
  if (!silent) updateBundlePreview();
}

function togglePromoDropdown() {
  document.getElementById('bundle-promo-dropdown').classList.toggle('hidden');
  document.getElementById('core-dropdown').classList.add('hidden');
}

// Promo catalogue — add entries here to extend to future promotions
const PROMOS = [
  { key: 'Standard',    label: 'Standard',     sub: 'No promotional discount',                  videoOnly: false },
  { key: 'Media',       label: 'Media Promo',  sub: '−20% on camera-core bundles only',           videoOnly: true  }
];

function renderPromoCards() {
  const dropdown = document.getElementById('bundle-promo-dropdown');
  const labelEl  = document.getElementById('bundle-promo-label');
  const note     = document.getElementById('promo-eligibility-note');
  if (!dropdown) return;

  const isVideo   = isVideoCore(bld.coreKey);
  const optId     = bld.targetOptId;
  const term      = optId ? (options.find(o => o.id === optId)?.term || 36) : 36;
  const forcedTier = optId ? ((options.find(o => o.id === optId)?.forcedTierIndex) ?? -1) : -1;
  const selectedFeatures = bld.selectedFeatures || [];
  const addOnBase = selectedFeatures.reduce((sum, k) => sum + (featurePricing[k] || 0), 0);
  const basePrice = (bld.corePrice || 0) + addOnBase;
  const dummyBundle = { basePrice, qty: bld.qty || 1, coreKey: bld.coreKey || 'vtu' };
  const selected  = bld.promoType || 'Standard';

  // Pre-calc Standard price for savings comparison
  let stdUnit = 0;
  if (bld.coreKey) {
    ({ unitPrice: stdUnit } = calcBundle(dummyBundle, term, 'Standard', forcedTier));
  }

  dropdown.innerHTML = PROMOS.map(promo => {
    const eligible  = !promo.videoOnly || isVideo;
    const isSel     = selected === promo.key;
    let pricesHtml  = '';
    if (bld.coreKey && eligible) {
      const { unitPrice, monthly } = calcBundle(dummyBundle, term, promo.key, forcedTier);
      const savings = stdUnit - unitPrice;
      pricesHtml = `
        <div class="promo-dropdown-row-prices">
          <div class="promo-dropdown-row-unit">${formatMoney(unitPrice)}/unit</div>
          <div class="promo-dropdown-row-mo">${formatMoney(monthly)}/mo</div>
          ${savings > 0.005 ? `<div class="promo-dropdown-row-savings">−${formatMoney(savings)}/unit</div>` : ''}
        </div>`;
    }

    const lockHtml = !eligible
      ? `<div class="promo-dropdown-row-lock"><span class="material-symbols-outlined" style="font-size:11px;">lock</span> Camera cores only</div>`
      : '';

    return `
      <div class="promo-dropdown-row ${isSel ? 'selected' : ''} ${!eligible ? 'disabled' : ''}"
           ${eligible ? `onclick="selectPromoCard('${promo.key}')"` : ''}>
        <div class="promo-dropdown-row-left">
          <div class="promo-dropdown-radio"></div>
          <div>
            <div class="promo-dropdown-row-name">${promo.label}</div>
            <div class="promo-dropdown-row-sub">${promo.sub}</div>
            ${lockHtml}
          </div>
        </div>
        ${pricesHtml}
      </div>`;
  }).join('');

  // Update trigger label
  if (labelEl) {
    const p = PROMOS.find(p => p.key === selected);
    labelEl.innerText = p ? p.label : selected;
  }

  // Eligibility note below trigger
  if (note) {
    if (!bld.coreKey) {
      note.innerText = '';
    } else if (isVideo) {
      note.innerText = `Media Promo (−20%) applies to camera bundles. ${bld.coreName || 'This core'} is eligible.`;
    } else {
      note.innerText = 'Media Promo applies to VTU + Camera cores only. This core does not qualify.';
    }
  }
}

function selectPromoCard(val) {
  if (val === 'Media' && !isVideoCore(bld.coreKey)) return;
  bld.promoType = val;
  document.getElementById('bundle-promo-dropdown').classList.add('hidden');
  updateBundlePreview();
}

function selectCore(key) {
  const core = corePricing[key];
  bld.coreKey = key;
  bld.coreName = core.name;
  bld.corePrice = core.price;
  document.getElementById('core-label').innerText = core.name;
  document.getElementById('core-label').parentElement.classList.add('selected');
  document.getElementById('core-dropdown').classList.add('hidden');
  document.getElementById('addons-section').classList.remove('hidden');
  document.getElementById('addons-section').style.display = 'block';
  bld.selectedFeatures = [];
  Object.keys(featurePricing).forEach(featureKey => {
    const checkbox = document.getElementById(`addon-${featureKey}`);
    if (checkbox) checkbox.checked = false;
  });
  const sd128 = document.getElementById('sd-card-128');
  const sd256 = document.getElementById('sd-card-256');
  if (sd128 && sd256) {
    sd128.checked = true;
    sd256.checked = false;
  }
  syncAddonControls();
  document.getElementById('btn-create').disabled = false;
  updateBundlePreview();
}

function changeQty(d) {
  bld.qty = Math.max(1, bld.qty + d);
  document.getElementById('qty-display').value = bld.qty;
  updateBundlePreview();
}

function setQty(rawValue) {
  const n = parseInt(rawValue, 10);
  if (Number.isNaN(n)) return;
  bld.qty = Math.max(1, n);
  document.getElementById('qty-display').value = bld.qty;
  updateBundlePreview();
}

function updateBundlePreview() {
  if(!bld.coreKey) return;
  
  const optId = bld.targetOptId;
  const term = optId ? (options.find(o => o.id === optId)?.term || 36) : 36;
  const promoType = bld.promoType || 'Standard';
  const forcedTier = optId ? ((options.find(o => o.id === optId)?.forcedTierIndex) ?? -1) : -1;
  
  syncAddonControls();
  const addOnBase = (bld.selectedFeatures || []).reduce((sum, featureKey) => sum + (featurePricing[featureKey] || 0), 0);
  const basePrice = bld.corePrice + addOnBase;
  const dummyBundle = { basePrice, qty: bld.qty, coreKey: bld.coreKey };
  const { monthly } = calcBundle(dummyBundle, term, promoType, forcedTier);
  
  document.getElementById('preview-price-val').innerText = Math.round(monthly).toLocaleString();
  document.getElementById('preview-lines').classList.remove('hidden');
  const featureLines = (bld.selectedFeatures || []).map(featureKey =>
    `<div class="preview-line"><span>${featureLabels[featureKey] || featureKey}</span><span>+$${featurePricing[featureKey].toFixed(2)}</span></div>`
  ).join('');
  document.getElementById('preview-lines').innerHTML = `
    <div class="preview-line"><span>${bld.coreName}</span><span>$${bld.corePrice.toFixed(2)}</span></div>
    ${featureLines}
    <div class="preview-line"><strong>Bundle subtotal (base)</strong><strong>$${basePrice.toFixed(2)}</strong></div>
  `;
  renderPromoCards();
}

function createBundle() {
  const wasEditingExistingBundle = !!bld.targetOptId && !!bld.targetBundleId;
  const wasAddingToExistingOption = !!bld.targetOptId && !bld.targetBundleId;
  const optId = bld.targetOptId || nextOptId++;
  syncAddonControls();
  const selectedFeatures = [...(bld.selectedFeatures || [])];
  const addOnBase = selectedFeatures.reduce((sum, featureKey) => sum + (featurePricing[featureKey] || 0), 0);
  const bundleData = { 
    id: bld.targetBundleId || Date.now(), 
    coreKey: bld.coreKey, 
    coreName: bld.coreName, 
    basePrice: bld.corePrice + addOnBase,
    baseCorePrice: bld.corePrice,
    features: selectedFeatures,
    evcType: selectedFeatures.includes('evc') ? getSelectedEvcType() : null,
    qty: bld.qty,
    promoType: bld.promoType || 'Standard'
  };
  
  if (bld.targetOptId) {
     const opt = options.find(o => o.id === bld.targetOptId);
     if(opt) {
       if (bld.targetBundleId) {
         const idx = opt.bundles.findIndex(b => b.id === bld.targetBundleId);
         opt.bundles[idx] = bundleData;
       } else {
         opt.bundles.push(bundleData);
       }
     }
  } else {
     // F2: co-term for add-on orders (non-Gov); default to MSA remaining months
     const isCoTerm = proposalData.isAddOn && proposalData.segment !== 'Government';
     const initTerm = isCoTerm ? (getMsaMonthsRemaining() ?? 36) : 36;
     options.push({ id: optId, name: 'Option ' + (options.length + 1), term: initTerm, bundles: [bundleData], waves: [], forcedTierIndex: -1 });
  }
  
  closeBundleModal();
  renderOptions();
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('options-grid').classList.remove('hidden');
  const optionNumber = options.findIndex((o) => o.id === optId) + 1;
  if (!bld.targetOptId) {
    logProposalEvent('Option created', `Option ${Math.max(1, optionNumber)} was created.`);
  } else if (wasEditingExistingBundle) {
    logProposalEvent('Option edited', `Option ${Math.max(1, optionNumber)} configuration was updated.`);
  } else if (wasAddingToExistingOption) {
    logProposalEvent('Option edited', `A new bundle was added to Option ${Math.max(1, optionNumber)}.`);
  }
}

// ── RENDER OPTIONS ────────────────────────────
function renderOptions() {
  setTimeout(() => { if (typeof updateApprovalSnackbar === 'function') { updateApprovalSnackbar(); updateMarkDeadBtn(); renderMsaContextBar(); } }, 0);
  const grid = document.getElementById('options-grid');
  grid.innerHTML = '';

  // Update Header Labels
  const nameEls = document.querySelectorAll('.header-prop-name');
  nameEls.forEach(el => el.innerText = proposalData.name);
  
  const promoEls = document.querySelectorAll('.header-prop-promo');
  promoEls.forEach(el => el.innerText = proposalData.promoType);
  
  // Tier label — per-option now; show summary in header
  const tierEls = document.querySelectorAll('.header-prop-tier');
  const forcedOpts = options.filter(o => (o.forcedTierIndex !== undefined ? o.forcedTierIndex : -1) !== -1);
  const isApproved = proposalData.approvalStatus === 'Approved';
  const isForced = forcedOpts.length > 0;
  tierEls.forEach(el => {
    if (!isForced) {
      el.innerText = 'Auto';
    } else if (isApproved) {
      el.innerHTML = `Forced <span class="tier-status tier-status-approved">(Approved)</span>`;
    } else {
      el.innerHTML = `Forced <span class="tier-status tier-status-pending">(Approval required)</span>`;
    }
  });

  if (!proposalData.closeDate) {
    proposalData.closeDate = getLastDayOfCurrentMonthIso();
  }
  const closeDateDisplayEl = document.getElementById('header-prop-close-date-display');
  const closeDateInputEl = document.getElementById('header-prop-close-date-input');
  const vcmiModeEl = document.getElementById('header-prop-vcmi-mode');
  const vcmiContextEl = document.getElementById('header-prop-vcmi-context');
  if (closeDateDisplayEl) {
    const parsedClose = parseProposalDate(proposalData.closeDate);
    closeDateDisplayEl.textContent = parsedClose ? formatUsDate(parsedClose) : '--/--/----';
  }
  if (closeDateInputEl) closeDateInputEl.value = proposalData.closeDate;
  if (vcmiModeEl) vcmiModeEl.textContent = proposalData.vcmiMode || 'VMI';
  if (vcmiContextEl) vcmiContextEl.textContent = getVcmiContextLabel();

  updateSeasonalPill();
  updateSegmentHeader();

  // Sync gov-mode card width on options grid
  const _grid = document.getElementById('options-grid');
  if (_grid) {
    _grid.classList.toggle('gov-mode', proposalData.wavesEnabled && proposalData.segment === 'Government');
  }

  // Hide Global Approval Banner as requested (moving to inline indicator)
  const banner = document.getElementById('global-approval-banner');
  if (banner) banner.classList.add('hidden');
  
  // Ensure layout doesn't keep extra padding if no other banners are present
  const warningBanner = document.getElementById('warning-banner');
  if (!warningBanner || warningBanner.classList.contains('hidden')) {
    document.getElementById('vc-body').classList.remove('has-banner');
  }

  // Update button state
  updateSendBtn();

  options.forEach((opt, i) => {
    const optTier = (opt.forcedTierIndex !== undefined) ? opt.forcedTierIndex : -1;
    const optionPromoType = getOptionPromotion(opt);
    const { totalMonthly, totalUnits, avgUnit } = calcOption(opt, optionPromoType, optTier);
    const tierObj = getEffectiveTier(totalUnits, optTier);
    const tier = tierObj;
    const skip = tier.index - tier.naturalIndex;
    const requiresApproval = skip > 0 && proposalData.approvalStatus !== 'Approved';

    let bundlesHtml = '';
    opt.bundles.forEach(b => {
      const bundlePromo = b.promoType || optionPromoType;
      const { unitPrice, monthly, tier: bt } = calcBundle(b, opt.term, bundlePromo, optTier, totalUnits);
      const hasDisc   = bt.discount > 0;
      const isVideo   = b.coreKey === 'vtu-ffc' || b.coreKey === 'vtu-dual';
      const promoApplied = bundlePromo === 'Media' && isVideo;
      const featureKeys = Array.isArray(b.features) ? b.features : [];
      const videoFeatureKeys = ['sd-256', 'adas', 'evc', 'monitor'];
      const vehicleFeatureKeys = ['driver-id', 'privacy', 'logbook'];
      let videoFeatures = featureKeys
        .filter(k => videoFeatureKeys.includes(k))
        .map((k) => {
          if (k === 'evc') return `EVC (${getEvcTypeLabel(b.evcType)})`;
          return featureLabels[k] || k;
        });
      if (isVideo && !featureKeys.includes('sd-256')) {
        videoFeatures = ['128 GB SD Card', ...videoFeatures];
      }
      const vehicleFeatures = featureKeys
        .filter(k => vehicleFeatureKeys.includes(k))
        .map(k => featureLabels[k] || k);
      const featureMeta = `
        ${videoFeatures.length ? `<div class="bundle-feature-line"><strong>Video:</strong> ${videoFeatures.join(', ')}</div>` : ''}
        ${vehicleFeatures.length ? `<div class="bundle-feature-line"><strong>Vehicle features:</strong> ${vehicleFeatures.join(', ')}</div>` : ''}
      `;
      let discBadges = '';
      if (hasDisc)    discBadges += `<span class="disc-badge">${(bt.discount*100)}% Volume disc</span> `;
      if (promoApplied) discBadges += `<span class="disc-badge" style="background:#0076CE">Media Promo −20%</span>`;

      bundlesHtml += `
        <div class="bundle-row">
          <div class="bundle-row-top">
            <div class="bundle-row-actions">
               <button class="btn-circle-action" title="Edit bundle" onclick="openConfigureBundle(${opt.id}, ${b.id})">
                 <span class="material-symbols-outlined" style="font-size:18px;">edit</span>
               </button>
               <button class="btn-circle-action" title="Delete bundle" onclick="deleteBundle(${opt.id}, ${b.id})">
                 <span class="material-symbols-outlined" style="font-size:18px;">delete</span>
               </button>
            </div>
            <div class="bundle-row-header">
              <div class="bundle-row-name">${b.coreName}</div>
              ${discBadges ? `<div style="flex-shrink:0;display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">${discBadges}</div>` : ''}
            </div>
            ${featureMeta}
          </div>
          <div class="bundle-row-bottom">
            <div class="bundle-stat-row">
              <div class="bundle-stat-cell">
                <div class="bundle-stat-label">Qty</div>
                <div class="bundle-stat-value">${b.qty} <span>units</span></div>
              </div>
              <div class="bundle-stat-cell">
                <div class="bundle-stat-label">Unit price</div>
                <div class="bundle-stat-value">${formatMoney(unitPrice)}<span>/unit</span></div>
              </div>
              <div class="bundle-stat-cell">
                <div class="bundle-stat-label">Monthly</div>
                <div class="bundle-stat-value">${formatMoney(monthly)}<span>/mo</span></div>
              </div>
            </div>
          </div>
        </div>`;
    });

    const card = document.createElement('div');
    card.className = 'option-card';
    
    let actionHtml = '';
    if (requiresApproval) {
      const role = getApprovalRole(skip);
      const isPending = proposalData.approvalStatus === 'Pending';
      actionHtml = `
        <button class="btn-request-approval ${isPending ? 'approved' : ''}" disabled>
          ${isPending ? 'Approval Requested' : 'Request approval'}
        </button>
        <div class="approval-sublabel ${isPending ? 'approved' : ''}">
          ${isPending ? 'Awaiting ' + role + ' decision' : 'Requires ' + role + ' Approval'}
        </div>
      `;
    } else {
      actionHtml = `
        <button class="btn-select-contract btn-select-contract--lg" onclick="selectOption(${opt.id})">Select &amp; create contract</button>
      `;
    }

    // Pre-compute per-option prices for term and tier dropdowns
    const _termPx = ['12','24','36','48','60'].map(t => {
      if (totalUnits === 0) return '';
      const { totalMonthly: tm } = calcOption({...opt, term: t}, optionPromoType, optTier);
      return ' — ' + formatMoney(tm) + '/mo';
    });
    const _tierPx = [-1, 1, 2, 3, 4].map(ti => {
      if (totalUnits === 0) return '';
      const { totalMonthly: tm } = calcOption(opt, optionPromoType, ti);
      return ' — ' + formatMoney(tm) + '/mo';
    });

    // F2: co-term — lock term display when add-on (non-Gov)
    const isCoTerm = proposalData.isAddOn && proposalData.segment !== 'Government';
    const _termLabels = ['12 months','24 months','36 months','48 months','60 months'];
    const _termVals   = ['12','24','36','48','60'];
    const termRows = _termVals.map((tv, idx) => {
      const isSel = String(opt.term) === tv;
      const priceStr = _termPx[idx] ? _termPx[idx].replace(' — ', '') : '';
      return `<div class="dropdown-option opt-term-row ${isSel ? 'opt-term-row--selected' : ''}" onclick="selectOptTerm(${opt.id}, '${tv}')">
        <span class="opt-term-row-label">${_termLabels[idx]}</span>
        ${priceStr ? `<span class="opt-term-row-price">${priceStr}</span>` : ''}
      </div>`;
    }).join('');

    // Tier dropdown rows — only tiers >= natural tier are selectable
    const _naturalIdx = getNaturalTierIndex(totalUnits);
    const _currentForcedIdx = opt.forcedTierIndex ?? -1;
    const _effectiveTierIdx = _currentForcedIdx === -1 ? _naturalIdx : Math.max(_naturalIdx, _currentForcedIdx);
    const _isApproved = proposalData.approvalStatus === 'Approved';
    const tierRows = totalUnits > 0 ? volumeTiers.map((t, idx) => {
      const isNatural = idx === _naturalIdx;
      const isAboveNatural = idx > _naturalIdx;
      const isSel = idx === _effectiveTierIdx;
      const isDisabled = idx < _naturalIdx;
      const skip = idx - _naturalIdx;
      const approvalRole = getApprovalRole(skip);
      const { totalMonthly: tierMonthly } = calcOption(opt, optionPromoType, idx);
      const approvalHtml = isAboveNatural && !_isApproved
        ? `<span class="opt-tier-row-approval"><span class="material-symbols-outlined" style="font-size:10px;">approval</span>${approvalRole} approval</span>`
        : '';
      return `<div class="dropdown-option opt-tier-row ${isSel ? 'opt-tier-row--selected' : ''} ${isDisabled ? 'opt-tier-row--disabled' : ''}"
        ${!isDisabled ? `onclick="selectOptTier(${opt.id}, ${idx})"` : ''}>
        <div class="opt-tier-row-left">
          <span class="opt-tier-row-label">${t.label}${isNatural ? ' <span style="font-size:10px;color:var(--gray-600);">(auto)</span>' : ''}</span>
          ${approvalHtml}
        </div>
        <span class="opt-tier-row-price">${formatMoney(tierMonthly)}/mo</span>
      </div>`;
    }).join('') : '<div class="dropdown-option" style="color:var(--gray-400);font-size:12px;padding:8px 16px;">Add bundles first</div>';

    const tierDropdownHtml = `
      <div class="custom-select-wrap">
        <button class="custom-select-btn selected" onclick="toggleOptTierDropdown(${opt.id}, event)">
          <span>${volumeTiers[_effectiveTierIdx]?.label ?? '—'}</span>
          <span class="material-symbols-outlined">expand_more</span>
        </button>
        <div class="custom-dropdown hidden" id="opt-tier-dd-${opt.id}">
          ${tierRows}
        </div>
      </div>`;

    const termFieldHtml = isCoTerm
      ? `<div style="display:flex;align-items:flex-end;gap:8px;">
           <div style="flex:0 0 70%;min-width:0;">
             <div class="field-label">Contract term</div>
             <div class="coterm-display">
               <strong>${opt.term} months</strong>&ensp;<span style="font-size:12px;color:var(--gray-600);">Co-term · MSA ${proposalData.msaId}</span>
             </div>
           </div>
           <div style="flex:0 0 calc(30% - 8px);"><div class="field-label">Tier</div>${tierDropdownHtml}</div>
         </div>`
      : `<div style="display:flex;align-items:flex-end;gap:8px;">
           <div style="flex:0 0 70%;min-width:0;">
             <div class="field-label">Contract term</div>
             <div class="custom-select-wrap">
               <button class="custom-select-btn selected" onclick="toggleOptTermDropdown(${opt.id}, event)">
                 <span>${opt.term} months</span>
                 <span class="material-symbols-outlined">expand_more</span>
               </button>
               <div class="custom-dropdown hidden" id="opt-term-dd-${opt.id}">
                 ${termRows}
               </div>
             </div>
           </div>
           <div style="flex:0 0 calc(30% - 8px);"><div class="field-label">Tier</div>${tierDropdownHtml}</div>
         </div>`;

    card.innerHTML = `
      <div class="option-card-header">
         <span>Option ${i+1}</span>
         <div class="option-card-header-actions">
          <button title="Delete option" onclick="deleteOption(${opt.id})"><span class="material-symbols-outlined" style="color:white;font-size:14px;">delete</span></button>
          <button title="Duplicate option" onclick="duplicateOption(${opt.id})"><span class="material-symbols-outlined" style="color:white;font-size:14px;">content_copy</span></button>
         </div>
      </div>
      <div class="option-card-body">
         <div style="margin-bottom:10px;">
           ${termFieldHtml}
         </div>
         <div class="opt-totals-row">
           <div class="opt-totals-cell">
             <div class="opt-totals-label">Total qty</div>
             <div class="opt-totals-value">${totalUnits} <span>units</span></div>
           </div>
           <div class="opt-totals-cell">
             <div class="opt-totals-label">Avg unit price</div>
             <div class="opt-totals-value">${totalUnits > 0 ? formatMoney(avgUnit) : '—'}<span>${totalUnits > 0 ? '/unit' : ''}</span></div>
           </div>
           <div class="opt-totals-cell">
             <div class="opt-totals-label">Monthly total</div>
             <div class="opt-totals-value">${formatMoney(totalMonthly)}<span>/mo</span></div>
           </div>
         </div>
         
         ${actionHtml}

         <div class="bundles-list">
            <div class="bundles-label"><span class="material-symbols-outlined" style="font-size:20px;">package_2</span> Bundle configured (${opt.bundles.length})</div>
            ${bundlesHtml || '<div style="font-size:11px;color:var(--gray-400);padding:16px;text-align:center;">No Bundles yet</div>'}
            <button class="btn-add-bundle" onclick="openConfigureBundle(${opt.id})">+ Add Bundle</button>
         </div>
         ${proposalData.wavesEnabled ? buildOptWavesHtml(opt, totalUnits) : ''}
      </div>`;
    grid.appendChild(card);
  });

  const addCard = document.createElement('div');
  addCard.className = 'add-option-card';
  addCard.onclick = () => openConfigureBundle();
  addCard.innerHTML = `+ Add option ${options.length + 1}`;
  grid.appendChild(addCard);
  updateOptionsGridAlignment();
}

function updateSeasonalPill() {
  const toMonthShort = (month) => {
    if (!month || typeof month !== 'string') return '';
    const clean = month.trim();
    if (!clean) return '';
    return clean.slice(0, 3);
  };
  const slots = [
    document.getElementById('seasonal-pill-slot'),
    document.getElementById('seasonal-pill-slot-drafting')
  ].filter(Boolean);
  if (!slots.length) return;
  const { startMonth, endMonth } = seasonalConfig || {};
  if (!startMonth || !endMonth) {
    slots.forEach((slot) => {
      slot.classList.add('hidden');
      slot.innerHTML = '';
    });
    return;
  }
  slots.forEach((slot) => {
    slot.classList.remove('hidden');
    const startShort = toMonthShort(startMonth);
    const endShort = toMonthShort(endMonth);
    slot.innerHTML = `<span class="seasonal-badge gray-low-contrast"><span class="seasonal-inline-text"><span class="seasonal-inline-label">Seasonal:</span> ${startShort}-${endShort}</span><button type="button" class="seasonal-remove-btn" aria-label="Remove seasonal billing" title="Remove seasonal billing" onclick="clearSeasonalConfig(event)">\u00d7</button></span>`;
  });
}

function openSeasonalModal() {
  document.getElementById('more-menu-draft')?.classList.add('hidden');
  document.getElementById('draft-more-btn')?.setAttribute('aria-expanded', 'false');
  const startSel = document.getElementById('seasonal-start-month');
  const endSel = document.getElementById('seasonal-end-month');
  if (startSel && seasonalConfig.startMonth) startSel.value = seasonalConfig.startMonth;
  if (endSel && seasonalConfig.endMonth) endSel.value = seasonalConfig.endMonth;
  document.getElementById('seasonal-modal')?.classList.add('open');
}

function closeSeasonalModal() {
  document.getElementById('seasonal-modal')?.classList.remove('open');
}

function applySeasonalConfig() {
  const startMonth = document.getElementById('seasonal-start-month')?.value || '';
  const endMonth = document.getElementById('seasonal-end-month')?.value || '';
  seasonalConfig = { startMonth, endMonth };
  closeSeasonalModal();
  updateSeasonalPill();
  showNotif('Seasonal billing configured', `Active months: ${startMonth} to ${endMonth}.`);
}

function clearSeasonalConfig(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  seasonalConfig = { startMonth: '', endMonth: '' };
  updateSeasonalPill();
  showNotif('Seasonal billing removed', 'Seasonal billing window was cleared.');
}

function updateOptionsGridAlignment() {
  const grid = document.getElementById('options-grid');
  if (!grid) return;
  const hasOverflow = grid.scrollWidth > grid.clientWidth + 1;
  grid.classList.toggle('options-grid--has-overflow', hasOverflow);
}

function getVcmiContextLabel() {
  const contractType = (proposalData.contractType || 'Flex').toLowerCase();
  return contractType === 'fixed'
    ? 'CMI edit at order level (Fixed)'
    : 'CMI edit in bundle (Flex)';
}

function enterProposalMetaEdit(fieldKey) {
  if (fieldKey !== 'close-date') return;
  const field = document.getElementById('proposal-close-date-field');
  const display = document.getElementById('header-prop-close-date-display');
  const input = document.getElementById('header-prop-close-date-input');
  if (!field || !display || !input) return;
  field.classList.add('is-editing');
  display.classList.add('hidden');
  input.classList.remove('hidden');
  input.focus();
}

function saveProposalMetaField(fieldKey) {
  if (fieldKey !== 'close-date') return;
  const field = document.getElementById('proposal-close-date-field');
  const display = document.getElementById('header-prop-close-date-display');
  const input = document.getElementById('header-prop-close-date-input');
  if (!field || !display || !input) return;
  const parsed = parseProposalDate(input.value);
  proposalData.closeDate = parsed ? toIsoDate(parsed) : getLastDayOfCurrentMonthIso();
  input.value = proposalData.closeDate;
  display.textContent = formatUsDate(parseProposalDate(proposalData.closeDate));
  input.classList.add('hidden');
  display.classList.remove('hidden');
  field.classList.remove('is-editing');
  field.classList.add('is-saved');
  setTimeout(() => field.classList.remove('is-saved'), 900);
}

function toggleVcmiMode() {
  document.getElementById('more-menu-selection')?.classList.add('hidden');
  proposalData.vcmiMode = proposalData.vcmiMode === 'VMI' ? 'CMI' : 'VMI';
  const modeEl = document.getElementById('header-prop-vcmi-mode');
  const fieldEl = document.getElementById('proposal-vcmi-field');
  if (modeEl) modeEl.textContent = proposalData.vcmiMode;
  if (fieldEl) {
    fieldEl.classList.add('is-saved');
    setTimeout(() => fieldEl.classList.remove('is-saved'), 900);
  }
  renderOptions();
}

// ── EDIT PROPOSAL MODAL ─────────────────────────
function openEditProposalModal() {
  // Segment radios
  const seg = proposalData.segment || 'SMB';
  document.querySelectorAll('input[name="edit-segment"]').forEach(r => {
    r.checked = r.value === seg;
  });
  _syncEditSegmentSections(seg);
  // Enterprise
  const poEl = document.getElementById('edit-po-number');
  const ccEl = document.getElementById('edit-cost-center');
  if (poEl) poEl.value = proposalData.poNumber || '';
  if (ccEl) ccEl.value = proposalData.costCenter || '';
  // Government
  const govPoEl = document.getElementById('edit-gov-po');
  const cvEl   = document.getElementById('edit-contract-vehicle');
  const coName = document.getElementById('edit-co-name');
  const coEmail= document.getElementById('edit-co-email');
  const coPhone= document.getElementById('edit-co-phone');
  if (govPoEl) govPoEl.value = proposalData.poNumber || '';
  if (cvEl)    cvEl.value    = proposalData.contractVehicle || '';
  if (coName)  coName.value  = proposalData.contractingOfficerName || '';
  if (coEmail) coEmail.value = proposalData.contractingOfficerEmail || '';
  if (coPhone) coPhone.value = proposalData.contractingOfficerPhone || '';

  document.getElementById('edit-proposal-overlay').classList.add('open');
}

function closeEditProposalModal() {
  document.getElementById('edit-proposal-overlay').classList.remove('open');
}

function onEditSegmentChange() {
  const sel = document.querySelector('input[name="edit-segment"]:checked');
  if (sel) _syncEditSegmentSections(sel.value);
}

function _syncEditSegmentSections(seg) {
  const entSection = document.getElementById('edit-ent-section');
  const govSection = document.getElementById('edit-gov-section');
  if (entSection) entSection.classList.toggle('hidden', seg !== 'Enterprise');
  if (govSection) govSection.classList.toggle('hidden', seg !== 'Government');
}

function saveProposalDraft() {
  logProposalEvent('Proposal saved', 'Proposal draft was saved.');
  showSuccessBanner('Proposal saved', 'Your proposal draft has been saved successfully.');
}

function saveProposalInfo() {
  // Segment
  const selSeg = document.querySelector('input[name="edit-segment"]:checked');
  const newSeg = selSeg ? selSeg.value : (proposalData.segment || 'SMB');
  proposalData.segment = newSeg;

  // Segment-specific fields
  if (newSeg === 'Enterprise') {
    proposalData.poNumber   = (document.getElementById('edit-po-number')  || {}).value || '';
    proposalData.costCenter = (document.getElementById('edit-cost-center') || {}).value || '';
    proposalData.contractVehicle = '';
    proposalData.contractingOfficerName = '';
    proposalData.contractingOfficerEmail = '';
    proposalData.contractingOfficerPhone = '';
  } else if (newSeg === 'Government') {
    proposalData.poNumber           = (document.getElementById('edit-gov-po')          || {}).value || '';
    proposalData.contractVehicle    = (document.getElementById('edit-contract-vehicle') || {}).value || '';
    proposalData.contractingOfficerName  = (document.getElementById('edit-co-name')    || {}).value || '';
    proposalData.contractingOfficerEmail = (document.getElementById('edit-co-email')   || {}).value || '';
    proposalData.contractingOfficerPhone = (document.getElementById('edit-co-phone')   || {}).value || '';
    proposalData.costCenter = '';
  } else {
    // SMB — clear all deal-classification fields
    proposalData.poNumber = '';
    proposalData.costCenter = '';
    proposalData.contractVehicle = '';
    proposalData.contractingOfficerName = '';
    proposalData.contractingOfficerEmail = '';
    proposalData.contractingOfficerPhone = '';
  }

  updateSegmentHeader();
  closeEditProposalModal();
  renderOptions();
  logProposalEvent('Proposal settings updated', `Segment: ${newSeg}.`);
}

function updateSegmentHeader() {
  const seg = proposalData.segment || 'SMB';
  const pill = document.getElementById('header-prop-segment-pill');
  const poWrap = document.getElementById('header-prop-po');
  const poVal  = document.getElementById('header-prop-po-val');
  if (pill) {
    pill.className = 'segment-pill ' + seg.toLowerCase();
    pill.textContent = seg;
  }
  if (poWrap && poVal) {
    const hasPO = proposalData.poNumber && proposalData.poNumber.trim().length > 0;
    poWrap.classList.toggle('hidden', !hasPO);
    if (hasPO) poVal.textContent = proposalData.poNumber;
  }
}

function cycleSegment() {
  const cycle = ['SMB', 'Enterprise', 'Government'];
  const idx = cycle.indexOf(proposalData.segment || 'SMB');
  proposalData.segment = cycle[(idx + 1) % cycle.length];
  // Changing segment clears deal-classification fields to avoid stale data
  proposalData.poNumber = '';
  proposalData.costCenter = '';
  proposalData.contractVehicle = '';
  proposalData.contractingOfficerName = '';
  proposalData.contractingOfficerEmail = '';
  proposalData.contractingOfficerPhone = '';
  updateSegmentHeader();
  renderOptions();
  logProposalEvent('Segment changed', `Proposal segment set to ${proposalData.segment}.`);
}

function fillProposalMessageDefaults() {
  const toEl = document.getElementById('prop-msg-to');
  const subjectEl = document.getElementById('prop-msg-subject');
  const bodyEl = document.getElementById('prop-msg-body');
  if (!toEl || !subjectEl || !bodyEl) return;

  // Only pre-fill once per modal open (don't overwrite manual edits)
  const alreadyFilled = bodyEl.dataset.autofilled === 'true';

  subjectEl.value = subjectEl.value || 'Verizon Connect info & pricing';
  toEl.value = toEl.value || 'laura.mendez@acmelogistics.com';

  if (!alreadyFilled) {
    // Build per-option pricing blocks as rich HTML
    const optionBlocksHtml = options.map(opt => {
      let totalUnits = 0;
      opt.bundles.forEach(b => { totalUnits += b.qty; });
      const forcedIdx = opt.forcedTierIndex ?? -1;
      const termMonths = parseInt(opt.term);
      const termYears = termMonths / 12;
      const termLabel = Number.isInteger(termYears) ? `${termYears} Year` : `${termMonths} Month`;
      const hasMedia = opt.bundles.some(b => (b.promoType || 'Standard') === 'Media' && isVideoCore(b.coreKey));
      const promoSuffix = hasMedia ? ' *20% off Promotional Pricing*' : '';
      const { totalMonthly } = calcOption(opt, getOptionPromotion(opt), forcedIdx);

      const bundleLinesHtml = opt.bundles.map(b => {
        const { unitPrice } = calcBundle(b, opt.term, b.promoType || 'Standard', forcedIdx, totalUnits);
        const featNames = (b.features || b.selectedFeatures || []).map(k => featureLabels[k] || k).filter(Boolean);
        const desc = featNames.length ? `${b.coreName} + ${featNames.join(' + ')}` : b.coreName;
        return `<b>$${unitPrice.toFixed(2)}/mo per ${desc}</b>`;
      }).join('<br>');

      const totalLine = `<b style="color:#ee001e;">Total on ${totalUnits} ${totalUnits === 1 ? 'Vehicle' : 'Vehicles'}: $${totalMonthly.toFixed(2)}/mo with zero down</b>`;

      return `<b>Costs:</b> <i>Based on ${termLabel} Agreement${promoSuffix}</i><br><b>$0 Equipment/Activation Costs</b><br>${bundleLinesHtml}<br>${totalLine}`;    }).join('<br><br>');

    bodyEl.innerHTML =
      `[Contact name],<br><br>` +
      `Thank you for your time today. The quote and info we discussed are all below. If anything pops up between now and then, feel free to reach out directly - [Your phone]<br><br>` +
      optionBlocksHtml +
      `<br><br>` +
      `<b>This is a complete price lock guarantee on the services!</b><br>` +
      `<b>Professional Installation Included</b><br>` +
      `Zero cost to start service<br>` +
      `<b>Waived Equipment Cost&nbsp; - $399/$699 Equipment Cost waived</b><br>` +
      `Waived Activation Fees<br>` +
      `45 Day Roll out period applied<br><br>` +
      `Key Differentiators:<br>` +
      `<ul style="margin:6px 0 0;padding-left:22px;">` +
      `<li>Verizon <u>guarantees service uptime of 99.9%</u> or agreement becomes void</li>` +
      `<li><u>No 3rd Parties</u>. Verizon provides in house support, hardware, and most importantly, Network</li>` +
      `<li>Defaults to month-to-month intervals after initial agreement</li>` +
      `<li>Largest network with the least amount of down time</li>` +
      `<li>Only <u>TRUE Satellite &amp; Cell tower based system</u> - no dead-zones, only delayed-zones</li>` +
      `<li>Free and unlimited system trainings</li>` +
      `</ul>`;

    bodyEl.dataset.autofilled = 'true';
  }

  updateCharCount(bodyEl);
  updateSendBtn();
}

function handleRequestApproval() {
  if (proposalData.approvalStatus === 'Approved') return;
  openApprovalRequestModal();
}

function openApprovalRequestModal() {
  const justificationInput = document.getElementById('approval-justification');
  const justificationError = document.getElementById('approval-justification-error');
  if (justificationInput) justificationInput.value = '';
  if (justificationError) justificationError.classList.add('hidden');
  updateApprovalRequestSubmitState();
  const overlay = document.getElementById('approval-request-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeApprovalRequestModal() {
  const overlay = document.getElementById('approval-request-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function updateApprovalRequestSubmitState() {
  const justification = document.getElementById('approval-justification')?.value.trim() || '';
  const submitBtn = document.getElementById('approval-submit-btn');
  const justificationError = document.getElementById('approval-justification-error');
  if (justificationError && justification) justificationError.classList.add('hidden');
  if (submitBtn) submitBtn.disabled = !justification;
}

function triggerApprovalUpload() {
  document.getElementById('approval-upload-input')?.click();
}

function handleApprovalUploadChange(input) {
  const fileNameEl = document.getElementById('approval-upload-filename');
  const fileName = input?.files?.[0]?.name || '';
  if (!fileNameEl) return;
  if (!fileName) {
    fileNameEl.classList.add('hidden');
    fileNameEl.textContent = '';
    return;
  }
  fileNameEl.textContent = `Attached: ${fileName}`;
  fileNameEl.classList.remove('hidden');
}

function submitApprovalRequest() {
  const justification = document.getElementById('approval-justification')?.value.trim() || '';
  if (!justification) {
    const justificationError = document.getElementById('approval-justification-error');
    if (justificationError) justificationError.classList.remove('hidden');
    document.getElementById('approval-justification')?.focus();
    return;
  }
  proposalData.approvalStatus = 'Pending';
  closeApprovalRequestModal();
  updateApprovalSnackbar();
  renderOptions();
  if (screen === 'selection') renderSelectionOptions();
  showSuccessBanner('Approval request submitted', 'Your pricing request is now under review.');
}

function toggleMoreMenu() {
  let screenId = 'more-menu-draft';
  if (screen === 'review') screenId = 'more-menu-review';
  if (screen === 'selection') screenId = 'more-menu-selection';
  const menu = document.getElementById(screenId);
  if (menu) {
    menu.classList.toggle('hidden');
    if (screen === 'selection') {
      const trigger = document.querySelector('#screen-proposal-selection .btn-more-dots');
      const isOpen = !menu.classList.contains('hidden');
      trigger?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
  }
}

function closeSelectionMoreMenu() {
  const menu = document.getElementById('more-menu-selection');
  if (menu) {
    menu.classList.add('hidden');
    const trigger = document.querySelector('#screen-proposal-selection .btn-more-dots');
    trigger?.setAttribute('aria-expanded', 'false');
  }
}

function selectionMenuEditProposal() {
  closeSelectionMoreMenu();
  // Editing from Selection returns user to Drafting first.
  screen = 'drafting';
  document.getElementById('screen-proposal-selection').classList.add('hidden');
  hideProposalReviewModal();
  document.getElementById('screen-contract').classList.add('hidden');
  document.getElementById('screen-deal-result').classList.add('hidden');
  document.getElementById('screen-drafting').classList.remove('hidden');
  document.getElementById('vc-body').style.paddingTop = '159px';
  document.getElementById('success-banner').style.top = '159px';
  const sendBtn = document.getElementById('footer-send');
  sendBtn.classList.add('hidden');
  sendBtn.innerText = 'Send Proposal';
  sendBtn.onclick = handleSend;
  updateSendBtn();
  const backBtn = document.getElementById('footer-back');
  backBtn.classList.remove('visible');
  renderOptions();
  const hasOptions = Array.isArray(options) && options.length > 0;
  document.getElementById('empty-state')?.classList.toggle('hidden', hasOptions);
  document.getElementById('options-grid')?.classList.toggle('hidden', !hasOptions);
  updateMarkDeadBtn();
  renderNav();
}

function viewProposalHistory() {
  closeSelectionMoreMenu();
  document.getElementById('more-menu-draft')?.classList.add('hidden');
  document.getElementById('draft-more-btn')?.setAttribute('aria-expanded', 'false');
  document.getElementById('more-menu-contract')?.classList.add('hidden');
  document.getElementById('more-menu-contract2')?.classList.add('hidden');
  openProposalHistoryModal();
}

function viewProposalHistoryFromDraft() {
  if (!proposalWasSentToCustomer) return;
  viewProposalHistory();
}

function markDealDead() {
  alert('Deal marked as dead');
  let screenId = 'more-menu-draft';
  if (screen === 'review') screenId = 'more-menu-review';
  if (screen === 'selection') screenId = 'more-menu-selection';
  const menu = document.getElementById(screenId);
  if (menu) menu.classList.add('hidden');
}

function openTierSettingsFromMenu(event) {
  if (event) event.stopPropagation();
  document.getElementById('more-menu-draft')?.classList.add('hidden');
  document.getElementById('draft-more-btn')?.setAttribute('aria-expanded', 'false');
  openEditProposalModal();
  document.getElementById('edit-prop-tier')?.focus();
}

// ── OPTION ACTIONS ──────────────────────────────
function setOptTier(optId, val) {
  const opt = options.find(o => o.id === optId);
  if (!opt) return;
  const oldTier = opt.forcedTierIndex;
  opt.forcedTierIndex = parseInt(val);
  // Reset approval if any option changed
  if (oldTier !== opt.forcedTierIndex) {
    proposalData.approvalStatus = 'None';
    const newTier = opt.forcedTierIndex;
    if (newTier >= 0 && oldTier === -1) {
      logProposalEvent('Tier override applied', `Option tier forced to Tier ${volumeTiers[newTier].label}.`);
    } else if (newTier >= 0 && oldTier >= 0) {
      logProposalEvent('Tier override updated', `Option tier changed from Tier ${volumeTiers[oldTier].label} to Tier ${volumeTiers[newTier].label}.`);
    } else if (newTier === -1 && oldTier >= 0) {
      logProposalEvent('Tier override removed', `Option tier returned to standard (auto) tiering.`);
    }
  }
  renderOptions();
  updateApprovalSnackbar();
}

function duplicateOption(id) {
  const src = options.find(o => o.id === id);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = nextOptId++;
  copy.name = 'Option ' + (options.length + 1);
  options.push(copy);
  renderOptions();
  const optionNumber = options.findIndex((o) => o.id === copy.id) + 1;
  logProposalEvent('Option created', `Option ${Math.max(1, optionNumber)} was duplicated.`);
}

function deleteBundle(optId, bundleId) {
  const opt = options.find(o => o.id === optId);
  if (opt) {
    opt.bundles = opt.bundles.filter(b => b.id !== bundleId);
    renderOptions();
  }
}

function updateTerm(id, val) {
  if (proposalData.lockedTerm !== null) return; // F1: term frozen after option selection
  const opt = options.find(o => o.id === id);
  if (opt) {
    opt.term = parseInt(val);
    renderOptions();
    const optionNumber = options.findIndex((o) => o.id === id) + 1;
    logProposalEvent('Option edited', `Option ${Math.max(1, optionNumber)} term was updated to ${val} months.`);
  }
}

function updateOptionPromotion(id, val) {
  const opt = options.find(o => o.id === id);
  if (!opt) return;
  opt.promoType = val;
  renderOptions();
  if (screen === 'selection') renderSelectionOptions();
}

function selectOption(id) {
  bld.selectedOptionId = id;
  const optionNumber = options.findIndex((o) => o.id === id) + 1;
  logProposalEvent('Option selected', `Option ${Math.max(1, optionNumber)} was selected.`);
  if (!isAccountReady()) {
    accountSetupOpenedFromOptionSelection = true;
    requestAnimationFrame(() => openAccountValidationScreen());
    return;
  }
  accountSetupOpenedFromOptionSelection = false;
  openConfirmSelectionModal();
}

// ══════════════════════════════════════════════════════════════
// FULFILLMENT MODULE (Advanced)
// ══════════════════════════════════════════════════════════════
let ffMainTab   = 'addresses';
let ffActiveTab = 'addresses';
let ffReturnPending = false;

// Addresses & Contacts
let ffAddresses = [{ id: 1, saved: false, addr1: '', addr2: '', city: '', state: '', zip: '', country: 'United States' }];
let ffContacts  = [{ id: 1, saved: false, name: '', phone: '', email: '' }];

// Vehicles — keyed by bundle id
// Bundles come from the active selected option
let ffVehicles  = {};
let ffSelected  = [];
let ffBulkOn    = false;
let ffBulkType  = '';
let ffBulkF = { shippingId:'', shippingContactId:'', installAddressId:'', installContactId:'', sameAsShipping: false, waveId: '', isEmergency: false, hasWheelchairLift: false, masterSwitchOff: false, hasCompetitorDevice: false, installType: '' };
let ffInputMethod = 'vin';
let ffVinInput  = '';
let ffYmm       = { year:'', make:'', model:'', qty: 1 };
let ffDot       = '';
let ffSearch    = '';
let ffBundleForms = {};
let ffWaves = {}; // { [bundleId]: [{ id, name, targetDate, vehicleIds: [] }] }
let ffFormEditMode = {}; // { [bundleId]: true } — force edit mode even after validation
let ffVehicleExpanded = {}; // { [vehicleId]: true } — expand/collapse assignment detail row
let ffDotSelected = [];     // VINs selected from mock DOT fleet list

// ── YMM cascading data ────────────────────────────────────────────
const FF_YEARS = Array.from({length: 12}, (_, i) => String(2026 - i));
const FF_MAKES_MODELS = {
  'Ford':          ['E-350','E-450','Escape','Explorer','F-150','F-250','F-350','F-450','F-550','Maverick','Ranger','Super Duty','Transit','Transit Connect'],
  'Chevrolet':     ['Colorado','Equinox','Express 2500','Express 3500','Silverado 1500','Silverado 2500HD','Silverado 3500HD','Suburban','Tahoe','Traverse'],
  'GMC':           ['Acadia','Canyon','Savana 2500','Savana 3500','Sierra 1500','Sierra 2500HD','Sierra 3500HD','Terrain','Yukon','Yukon XL'],
  'Ram':           ['1500','2500','3500','4500','5500','ProMaster 1500','ProMaster 2500','ProMaster 3500','ProMaster City'],
  'Toyota':        ['Camry','Highlander','Land Cruiser','RAV4','Sequoia','Sienna','Tacoma','Tundra'],
  'Nissan':        ['Frontier','NV200','NV1500','NV2500HD','NV3500HD','Titan'],
  'Mercedes-Benz': ['Metris','Sprinter 1500','Sprinter 2500','Sprinter 3500'],
  'Freightliner':  ['Cascadia','M2 106','Sprinter 2500','Sprinter 3500'],
  'International': ['CV Series','HX Series','LT Series','MV Series'],
  'Kenworth':      ['T270','T370','T440','T470','T680','T880','W990'],
  'Peterbilt':     ['220','337','348','365','389','579','589'],
  'Isuzu':         ['FTR','FVR','FXR','NPR','NPR-HD','NQR','NRR'],
  'Hino':          ['155','195','258LP','268','268A','338'],
  'Volvo':         ['VHD','VNL','VNR','VNX'],
  'Mack':          ['Anthem','Granite','LR Electric','MD Series','Pinnacle'],
  'Honda':         ['CR-V','Passport','Pilot','Ridgeline'],
  'Jeep':          ['Cherokee','Gladiator','Grand Cherokee','Wrangler'],
  'Hyundai':       ['Ioniq 5','Ioniq 6','Santa Fe','Tucson'],
};
// Mock fleet registration (shown in DOT tab — no manual DOT input needed)
const FF_DOT_FLEET_MOCK = [
  {vin:'1FTEW1EP5LFB12345',ymm:'2020 Ford F-150',          cls:'LD',make:'Ford',         year:'2020'},
  {vin:'1GC4YPEY5LF234567',ymm:'2020 Chevrolet Silverado 3500HD',cls:'HD',make:'Chevrolet',year:'2020'},
  {vin:'3C7WRTCL9LG345678',ymm:'2020 Ram 3500',            cls:'HD',make:'Ram',           year:'2020'},
  {vin:'1FTBW2CM5JEB56789',ymm:'2018 Ford F-350 Super Duty',cls:'HD',make:'Ford',         year:'2018'},
  {vin:'1GTG5BEA3J1234567',ymm:'2018 GMC Sierra 2500HD',   cls:'HD',make:'GMC',           year:'2018'},
  {vin:'WD3PE8CD0JP234567',ymm:'2018 Mercedes-Benz Sprinter 2500',cls:'MD',make:'Mercedes-Benz',year:'2018'},
  {vin:'1FDUF5GT7GEA12345',ymm:'2016 Ford E-350',          cls:'MD',make:'Ford',          year:'2016'},
  {vin:'2GCEC19T891234567',ymm:'2016 Chevrolet Silverado 1500',cls:'LD',make:'Chevrolet', year:'2016'},
  {vin:'1N6AA0EC9FN234567',ymm:'2015 Nissan Titan',         cls:'LD',make:'Nissan',        year:'2015'},
  {vin:'5TFJX4GN8FX123456',ymm:'2015 Toyota Tacoma',       cls:'LD',make:'Toyota',        year:'2015'},
];

function getFFBundleForm(bundleId) {
  if (!ffBundleForms[bundleId]) {
    ffBundleForms[bundleId] = {
      installType: 'vmi',
      shipAddr1: '',
      shipAddr2: '',
      shipCity: '',
      shipState: '',
      shipCountry: 'United States',
      shipZip: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      installSameAsShipping: true,
      shipAddressId: '',
      shipContactId: '',
      installAddressId: '',
      installContactId: '',
      coordinatorName: '',
      coordinatorPhone: '',
      coordinatorEmail: '',
      siteNotes: '',
    };
  }
  return ffBundleForms[bundleId];
}

function getBundles() {
  const opt = options.find(o => o.id === (typeof selectedOptionId !== 'undefined' ? selectedOptionId : null));
  if (opt && opt.bundles && opt.bundles.length > 0) return opt.bundles;
  // Fallback: use first option with bundles
  const fallback = options.find(o => o.bundles && o.bundles.length > 0);
  if (fallback) return fallback.bundles;
  return [{ id: 'default', coreName: 'Bundle 1', qty: 10 }];
}

function ensureVehicleArrays() {
  getBundles().forEach(b => { if (!ffVehicles[b.id]) ffVehicles[b.id] = []; });
}

function openFulfillmentModal() {
  ensureVehicleArrays();

  // ── Seed ffWaves from contract-phase opt.waves (if wavesEnabled) ──────────
  // Only import waves that have been dispatched (processed) — Contracted = not yet processed.
  if (proposalData.wavesEnabled) {
    const opt = options.find(o => o.id === (typeof selectedOptionId !== 'undefined' ? selectedOptionId : null))
              || options.find(o => o.bundles && o.bundles.length > 0);
    if (opt && Array.isArray(opt.waves) && opt.waves.length > 0) {
      const PROCESSED_STATUSES = ['Dispatched', 'Pending Bind', 'Active-Billing'];
      const processedWaves = opt.waves.filter(w => PROCESSED_STATUSES.includes(w.slotStatus || ''));
      // Seed each bundle's ffWaves with processed contract waves (only if not yet seeded)
      getBundles().forEach(b => {
        if (!ffWaves[b.id]) ffWaves[b.id] = [];
        processedWaves.forEach(cw => {
          const alreadySeeded = ffWaves[b.id].some(fw => String(fw.contractWaveId) === String(cw.id));
          if (!alreadySeeded) {
            ffWaves[b.id].push({
              id: Date.now() + Math.random(),
              contractWaveId: cw.id,
              name: cw.name,
              targetDate: cw.targetDate || '',
              vehicleIds: [],
            });
          }
        });
      });
    }
  }

  ffMainTab = 'vehicles';
  ffActiveTab = getBundles()[0]?.id || 'default';
  ffReturnPending = false;
  document.getElementById('fftab-addresses').className = 'ff-tab';
  document.getElementById('fftab-vehicles').className  = 'ff-tab active';
  document.getElementById('fulfillment-overlay').classList.add('open');
  renderFF();
}

function openFulfillmentModalFromDealResult() {
  openFulfillmentModal();
  // If already submitted, open directly to summary tab
  if (proposalData.fulfillmentSubmitted) {
    switchFulfillmentMainTab('summary');
  }
}

function closeFulfillmentModal() {
  document.getElementById('fulfillment-overlay').classList.remove('open');
}

function switchFulfillmentMainTab(tab) {
  ffMainTab = tab;
  ffActiveTab = tab === 'addresses' ? 'addresses' : tab === 'summary' ? 'summary' : (getBundles()[0]?.id || 'default');
  ffReturnPending = false;
  document.getElementById('fftab-addresses').className = 'ff-tab' + (tab === 'addresses' ? ' active' : '');
  document.getElementById('fftab-vehicles').className  = 'ff-tab' + (tab === 'vehicles'  ? ' active' : '');
  document.getElementById('fftab-summary').className   = 'ff-tab' + (tab === 'summary'   ? ' active' : '');
  renderFF();
}

function switchFulfillmentTab(tabId) { /* legacy compat — no-op */ }

function ffSetTab(tab, pending = false) {
  ffActiveTab = tab;
  if (pending) ffReturnPending = true;
  renderFF();
}
function ffGoToAddresses(pending = false) {
  ffMainTab = 'addresses'; ffActiveTab = 'addresses';
  if (pending) ffReturnPending = true;
  document.getElementById('fftab-addresses').className = 'ff-tab active';
  document.getElementById('fftab-vehicles').className  = 'ff-tab';
  renderFF();
}
function ffGoToVehicles() {
  ffMainTab = 'vehicles';
  ffActiveTab = getBundles()[0]?.id || 'default';
  ffReturnPending = false;
  document.getElementById('fftab-addresses').className = 'ff-tab';
  document.getElementById('fftab-vehicles').className  = 'ff-tab active';
  renderFF();
}

function renderFF() { renderFFSidebar(); renderFFContent(); }

// ── SIDEBAR ──
function renderFFSidebar() {
  const s = document.getElementById('ff-sidebar');
  const bundles = getBundles();
  s.innerHTML = bundles.map(b => {
    const bv = ffVehicles[b.id] || [];
    const added = bv.length;
    const ready = bv.filter(v => isVehicleReadyForBundle(v, b)).length;
    const waveCount = (ffWaves[b.id] || []).length;
    const cap = getEffectiveBundleQtyCap(b.id);
    const isWaveCapped = cap < b.qty;
    const addedPct = Math.min((added / cap) * 100, 100);
    const readyPct = Math.min((ready / cap) * 100, 100);
    return `<div class="ff-sidebar-item ${ffActiveTab===b.id?'active':''}" onclick="ffSetTab('${b.id}')">
      <div class="ff-sidebar-item-label">${b.coreName}</div>
      <div class="ff-sidebar-item-sub">${added} / ${cap} added${isWaveCapped ? ` <span style="opacity:.7;">(of ${b.qty} total)</span>` : ''} · ${ready} ready</div>
      <div style="height:3px;background:#E5E7EB;border-radius:2px;margin:4px 0 2px;position:relative;overflow:hidden;">
        <div style="position:absolute;left:0;top:0;height:100%;width:${addedPct}%;background:#D1D5DB;border-radius:2px;"></div>
        <div style="position:absolute;left:0;top:0;height:100%;width:${readyPct}%;background:#1B5E20;border-radius:2px;"></div>
      </div>
      ${waveCount > 0 ? `<div class="ff-sidebar-item-sub" style="color:var(--brand-blue)">${waveCount} wave${waveCount!==1?'s':''}</div>` : ''}
    </div>`;
  }).join('');
}

// ── CONTENT ──
function renderFFContent() {
  const c = document.getElementById('ff-body');
  if (ffMainTab === 'summary') { c.innerHTML = renderFFSummary(); return; }
  const activeBundleId = ffActiveTab === 'addresses' || ffActiveTab === 'contacts'
    ? (getBundles()[0]?.id || 'default')
    : ffActiveTab;
  c.innerHTML = renderFFVehicles(activeBundleId);
}

// ── ADDRESSES ──
function renderFFAddresses() {
  const cards = ffAddresses.map((a, i) => `
    <div class="ff-card">
      <div class="ff-card-header">
        <div class="ff-card-title">Location ${i+1}</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="${a.saved?'ff-badge-saved':'ff-badge-unsaved'}">${a.saved?'✓ Saved':'Not saved'}</span>
          ${ffAddresses.length > 1 ? `<button class="ff-remove-btn" onclick="ffRemoveAddress(${a.id})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>` : ''}
        </div>
      </div>
      <div class="ff-form-grid">
        <div class="ff-form-group" style="grid-column:span 2"><label class="ff-label">Address line 1 *</label>
          <input class="ff-input" type="text" value="${a.addr1}" placeholder="123 Main St" onchange="ffUpdateAddr(${a.id},'addr1',this.value)" ${a.saved?'disabled':''}></div>
        <div class="ff-form-group" style="grid-column:span 2"><label class="ff-label">Address line 2</label>
          <input class="ff-input" type="text" value="${a.addr2}" placeholder="Suite, floor…" onchange="ffUpdateAddr(${a.id},'addr2',this.value)" ${a.saved?'disabled':''}></div>
        <div class="ff-form-group"><label class="ff-label">Country</label>
          <select class="ff-select" onchange="ffUpdateAddr(${a.id},'country',this.value)" ${a.saved?'disabled':''}>
            <option ${(a.country||'United States')==='United States'?'selected':''}>United States</option>
            <option ${a.country==='Canada'?'selected':''}>Canada</option>
            <option ${a.country==='Mexico'?'selected':''}>Mexico</option>
          </select></div>
        <div class="ff-form-group"><label class="ff-label">City</label>
          <input class="ff-input" type="text" value="${a.city}" placeholder="Tampa" onchange="ffUpdateAddr(${a.id},'city',this.value)" ${a.saved?'disabled':''}></div>
        <div class="ff-form-group"><label class="ff-label">State</label>
          <input class="ff-input" type="text" value="${a.state}" placeholder="FL" onchange="ffUpdateAddr(${a.id},'state',this.value)" ${a.saved?'disabled':''}></div>
        <div class="ff-form-group"><label class="ff-label">Zip *</label>
          <input class="ff-input" type="text" value="${a.zip}" placeholder="33602" onchange="ffUpdateAddr(${a.id},'zip',this.value)" ${a.saved?'disabled':''}></div>
      </div>
      <div class="ff-action-row">
        <span style="font-size:12px;color:var(--gray-600);">${a.saved?'':'Fill address and zip to save'}</span>
        <button class="ff-save-btn ${a.saved?'done':''}" onclick="ffSaveAddress(${a.id})">${a.saved?'✓ Saved':'Validate &amp; save'}</button>
      </div>
    </div>`).join('');

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
      <div><div style="font-size:15px;font-weight:700;margin-bottom:3px;">Account locations</div>
        <div style="font-size:12px;color:var(--gray-600);">Addresses used for shipping and installation.</div></div>
      ${ffReturnPending ? `<button class="ff-return-btn" onclick="ffGoToVehicles()">↩ Return to Vehicles</button>` : ''}
    </div>
    ${cards}
    <button class="ff-add-btn" onclick="ffAddAddress()">+ Add another location</button>`;
}

function ffUpdateAddr(id, f, v) { ffAddresses = ffAddresses.map(a => a.id===id ? {...a,[f]:v} : a); }
function ffSaveAddress(id) {
  const a = ffAddresses.find(x => x.id===id);
  if (!a.addr1 || !a.zip) { alert('Please fill address line 1 and zip.'); return; }
  const name = a.addr1 + (a.city?', '+a.city:'') + (a.zip?' '+a.zip:'');
  ffAddresses = ffAddresses.map(x => x.id===id ? {...x, saved:true, name} : x);
  renderFF();
}
function ffRemoveAddress(id) { if (ffAddresses.length>1) { ffAddresses=ffAddresses.filter(a=>a.id!==id); renderFF(); } }
function ffAddAddress() { ffAddresses.push({id:Date.now(),saved:false,name:'',addr1:'',addr2:'',city:'',state:'',zip:'',country:'United States'}); renderFF(); }

// ── CONTACTS ──
function renderFFContacts() {
  const cards = ffContacts.map((c, i) => `
    <div class="ff-card">
      <div class="ff-card-header">
        <div class="ff-card-title">Contact ${i+1}</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="${c.saved?'ff-badge-saved':'ff-badge-unsaved'}">${c.saved?'✓ Saved':'Not saved'}</span>
          ${ffContacts.length>1?`<button class="ff-remove-btn" onclick="ffRemoveContact(${c.id})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>`:''}
        </div>
      </div>
      <div class="ff-form-grid">
        <div class="ff-form-group"><label class="ff-label">Name *</label>
          <input class="ff-input" type="text" value="${c.name}" placeholder="John Smith" onchange="ffUpdateContact(${c.id},'name',this.value)" ${c.saved?'disabled':''}></div>
        <div class="ff-form-group"><label class="ff-label">Phone</label>
          <input class="ff-input" type="text" value="${c.phone}" placeholder="+1 (555) 000-0000" onchange="ffUpdateContact(${c.id},'phone',this.value)" ${c.saved?'disabled':''}></div>
        <div class="ff-form-group" style="grid-column:span 2"><label class="ff-label">Email</label>
          <input class="ff-input" type="email" value="${c.email}" placeholder="john@company.com" onchange="ffUpdateContact(${c.id},'email',this.value)" ${c.saved?'disabled':''}></div>
      </div>
      <div class="ff-action-row"><span></span>
        <button class="ff-save-btn ${c.saved?'done':''}" onclick="ffSaveContact(${c.id})">${c.saved?'✓ Saved':'Save contact'}</button>
      </div>
    </div>`).join('');

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
      <div><div style="font-size:15px;font-weight:700;margin-bottom:3px;">Account contacts</div>
        <div style="font-size:12px;color:var(--gray-600);">Contacts for receiving and coordinating installation.</div></div>
      ${ffReturnPending ? `<button class="ff-return-btn" onclick="ffGoToVehicles()">↩ Return to Vehicles</button>` : ''}
    </div>
    ${cards}
    <button class="ff-add-btn" onclick="ffAddContact()">+ Add another contact</button>`;
}

function ffUpdateContact(id,f,v){ffContacts=ffContacts.map(c=>c.id===id?{...c,[f]:v}:c);}
function ffSaveContact(id){
  const c=ffContacts.find(x=>x.id===id);
  if(!c.name){alert('Please enter a name.');return;}
  ffContacts=ffContacts.map(x=>x.id===id?{...x,saved:true}:x);renderFF();
}
function ffRemoveContact(id){if(ffContacts.length>1){ffContacts=ffContacts.filter(c=>c.id!==id);renderFF();}}
function ffAddContact(){ffContacts.push({id:Date.now(),saved:false,name:'',phone:'',email:''});renderFF();}

function ffUpdateBundleForm(bundleId, field, value) {
  const form = getFFBundleForm(bundleId);
  form[field] = value;
}

function ffValidateBundleDetails(bundleId) {
  const form = getFFBundleForm(bundleId);
  if (!form.shipAddr1 || !form.shipCity || !form.shipZip) {
    alert('Please complete shipping address (Address 1, City, Zip/Postal Code).');
    return;
  }
  if (!form.contactName || !form.contactPhone) {
    alert('Please complete contact name and phone.');
    return;
  }

  // Validate install address when not same as shipping
  const bundle = getBundles().find(b => String(b.id) === String(bundleId));
  const requiresInstall = bundleRequiresInstallation(bundle || { id: bundleId });
  if (requiresInstall && !form.installSameAsShipping && !form.installAddressId) {
    alert('Please select or enter an installation address, or check "Installation Address is the same as shipping".');
    return;
  }

  const addressId = Date.now();
  const addressName = `${form.shipAddr1}${form.shipCity ? ', ' + form.shipCity : ''}${form.shipZip ? ' ' + form.shipZip : ''}`;
  ffAddresses.push({
    id: addressId,
    saved: true,
    name: addressName,
    addr1: form.shipAddr1,
    addr2: form.shipAddr2,
    city: form.shipCity,
    state: '',
    zip: form.shipZip,
    country: form.shipCountry || 'United States',
  });

  const contactId = Date.now() + 1;
  ffContacts.push({
    id: contactId,
    saved: true,
    name: form.contactName,
    phone: form.contactPhone,
    email: form.contactEmail,
  });

  form.shipAddressId = String(addressId);
  form.shipContactId = String(contactId);
  form.installAddressId = form.installSameAsShipping ? String(addressId) : form.installAddressId;
  form.installContactId = form.installSameAsShipping ? String(contactId) : form.installContactId;

  // Switch to view mode
  delete ffFormEditMode[bundleId];

  showSuccessBanner('Address validated', 'Shipping and contact details were saved for assignment.');
  renderFFContent();
}

function ffEnterEditMode(bundleId) {
  ffFormEditMode[bundleId] = true;
  renderFFContent();
}

function ffUseSavedAddress(bundleId, addressId, scope) {
  if (!addressId) return;
  const form = getFFBundleForm(bundleId);
  const addr = ffAddresses.find(a => String(a.id) === String(addressId));
  if (!addr) return;
  if (scope === 'ship') {
    form.shipAddressId = String(addressId);
    form.shipAddr1 = addr.addr1 || '';
    form.shipAddr2 = addr.addr2 || '';
    form.shipCity  = addr.city  || '';
    form.shipState = addr.state || '';
    form.shipZip   = addr.zip   || '';
    form.shipCountry = addr.country || 'United States';
    if (form.installSameAsShipping) {
      form.installAddressId = String(addressId);
    }
  } else {
    form.installAddressId = String(addressId);
  }
  renderFFContent();
}

function ffUseSavedContact(bundleId, contactId, scope) {
  if (!contactId) return;
  const form = getFFBundleForm(bundleId);
  const contact = ffContacts.find(c => String(c.id) === String(contactId));
  if (!contact) return;
  if (scope === 'ship') {
    form.shipContactId = String(contactId);
    form.contactName  = contact.name  || '';
    form.contactPhone = contact.phone || '';
    form.contactEmail = contact.email || '';
    if (form.installSameAsShipping) {
      form.installContactId = String(contactId);
    }
  } else {
    form.installContactId = String(contactId);
  }
  renderFFContent();
}

// ── VEHICLES ──
function bundleRequiresInstallation(bundle) {
  if (!bundle || bundle.coreKey === 'asset-nonpowered') return false;
  const form = getFFBundleForm(bundle.id);
  return form.installType !== 'cmi';
}

// Per-vehicle override: v.installType takes precedence over bundle-level form.installType
function vehicleRequiresInstallation(v, bundle) {
  if (!bundle || bundle.coreKey === 'asset-nonpowered') return false;
  const vType = v.installType || getFFBundleForm(bundle.id).installType || 'vmi';
  return vType !== 'cmi';
}

function isVehicleReadyForBundle(v, bundle) {
  if (v.telematics === 'OEM Detected') return !!(v.activationContact && v.vehicleName);
  const hasShipping = v.shippingId && v.shippingContactId && v.vehicleName;
  if (!hasShipping) return false;
  if (!vehicleRequiresInstallation(v, bundle)) return true;
  return !!(v.installAddressId && v.installContactId);
}

function getGlobalVinSet(excludeBundleId = null, excludeVehicleId = null) {
  const set = new Set();
  Object.keys(ffVehicles).forEach(bundleId => {
    if (excludeBundleId && String(bundleId) === String(excludeBundleId)) return;
    (ffVehicles[bundleId] || []).forEach(v => {
      if (excludeVehicleId && String(v.id) === String(excludeVehicleId)) return;
      if (!v.vin) return;
      set.add(v.vin.trim().toUpperCase());
    });
  });
  return set;
}

// Returns how many vehicles are currently fulfillable for a bundle.
// When wavesEnabled and contract waves exist, caps to the sum of qty from dispatched waves only.
// Falls back to bundle.qty when waves are not in use.
function getEffectiveBundleQtyCap(bundleId) {
  const bundle = getBundles().find(b => String(b.id) === String(bundleId));
  if (!bundle) return Infinity;
  if (!proposalData.wavesEnabled) return bundle.qty;
  const opt = options.find(o => o.id === (typeof selectedOptionId !== 'undefined' ? selectedOptionId : null))
            || options.find(o => o.bundles && o.bundles.length > 0);
  const cWaves = (opt && Array.isArray(opt.waves)) ? opt.waves : [];
  if (cWaves.length === 0) return bundle.qty; // no contract waves — full bundle available
  const PROCESSED = ['Dispatched', 'Pending Bind', 'Active-Billing'];
  const dispatchedQty = cWaves
    .filter(w => PROCESSED.includes(w.slotStatus || ''))
    .reduce((sum, w) => sum + (Number(w.qty) || 0), 0);
  // If no waves are dispatched yet, cap is 0 (nothing available)
  // Cap is also bounded by bundle.qty (can't exceed total contracted)
  return Math.min(dispatchedQty, bundle.qty);
}

function canAddVehiclesToBundle(bundleId) {
  const savedA = ffAddresses.filter(a => a.saved).length;
  const savedC = ffContacts.filter(c => c.saved).length;
  if (savedA === 0 || savedC === 0) {
    alert('Please save at least one address and one contact before assigning vehicles.');
    ffGoToAddresses(true);
    return false;
  }
  const cap = getEffectiveBundleQtyCap(bundleId);
  const used = (ffVehicles[bundleId] || []).length;
  if (cap === 0) {
    alert('No dispatched waves yet. Advance a wave to "Dispatched" status from the option card before assigning vehicles.');
    return false;
  }
  if (used >= cap) {
    const bundle = getBundles().find(b => String(b.id) === String(bundleId));
    const isWaveCapped = proposalData.wavesEnabled && cap < (bundle ? bundle.qty : Infinity);
    alert(isWaveCapped
      ? `Dispatched wave capacity reached (${cap} vehicles). Advance the next wave to "Dispatched" to unlock more.`
      : `Quantity cap reached for this bundle (${cap}).`);
    return false;
  }
  return true;
}

function renderFFVehicles(bundleId) {
  const bundle   = getBundles().find(b => String(b.id) === String(bundleId)) || { id: bundleId, coreName: 'Bundle', qty: 10 };
  const bv       = ffVehicles[bundleId] || [];
  const form     = getFFBundleForm(bundleId);
  const isCMI    = form.installType === 'cmi';
  const requiresInstall = bundleRequiresInstallation(bundle);
  const allOEM   = bv.length > 0 && bv.every(v => v.telematics === 'OEM Detected');
  if (!requiresInstall && ffBulkType === 'installation') ffBulkType = '';
  const readyN   = bv.filter(v => isVehicleReadyForBundle(v, bundle)).length;
  const partialN = bv.filter(v => {
    const hasAny = v.telematics === 'OEM Detected'
      ? (v.activationContact || v.vehicleName)
      : (v.shippingId||v.shippingContactId||v.installAddressId||v.installContactId||v.vehicleName);
    return hasAny && !isVehicleReadyForBundle(v, bundle);
  }).length;
  const selInB   = ffSelected.filter(id => bv.find(v => String(v.id) === String(id)));
  const savedA   = ffAddresses.filter(a=>a.saved);
  const savedC   = ffContacts.filter(c=>c.saved);
  const aOpts = `<option value="">Select address…</option>${savedA.map(a=>`<option value="${a.id}">${a.name||'Location '+a.id}</option>`).join('')}<option value="ADD_NEW" style="font-weight:700;color:#009EDB">+ Add new</option>`;
  const cOpts = `<option value="">Select contact…</option>${savedC.map(c=>`<option value="${c.id}">${c.name||'Contact '+c.id}</option>`).join('')}<option value="ADD_NEW" style="font-weight:700;color:#009EDB">+ Add new</option>`;
  const waves    = ffWaves[bundleId] || [];
  // isEditing: show form when no address saved yet, or user explicitly requested edit mode
  const isEditing = !form.shipAddressId || ffFormEditMode[bundleId] === true;

  // Contract wave context (used in both vehicle rows and wave panel)
  const PROCESSED_STATUSES = ['Dispatched', 'Pending Bind', 'Active-Billing'];
  const _contractOpt = proposalData.wavesEnabled
    ? (options.find(o => o.id === (typeof selectedOptionId !== 'undefined' ? selectedOptionId : null))
       || options.find(o => o.bundles && o.bundles.length > 0))
    : null;
  const contractWaves = (_contractOpt && Array.isArray(_contractOpt.waves)) ? _contractOpt.waves : [];
  // Effective cap — dispatched wave qty only (or full bundle.qty if no wave plan)
  const effectiveCap = getEffectiveBundleQtyCap(bundleId);
  const atQtyCap = bv.length >= effectiveCap;
  // Context label for progress bar
  const dispatchedWaveNames = contractWaves.filter(w => PROCESSED_STATUSES.includes(w.slotStatus||'')).map(w=>w.name);
  const pendingWaveQty = contractWaves
    .filter(w => !PROCESSED_STATUSES.includes(w.slotStatus||''))
    .reduce((s,w)=>s+(Number(w.qty)||0),0);
  const waveCapLabel = dispatchedWaveNames.length > 0
    ? ` (${dispatchedWaveNames.join(' + ')})`
    : '';
  const waveNextLabel = pendingWaveQty > 0
    ? `<span style="font-size:9px;color:var(--gray-400);margin-left:4px;">· ${pendingWaveQty} in pending wave${dispatchedWaveNames.length > 0 ? '' : 's'}</span>`
    : '';

  const filtered = bv.filter(v => {
    if (!ffSearch) return true;
    const s = ffSearch.toLowerCase();
    return (v.vin||'').toLowerCase().includes(s)||(v.ymm||'').toLowerCase().includes(s)||(v.vehicleName||'').toLowerCase().includes(s);
  });

  // Input method
  const methodMeta = {
    vin: { title: 'Option A: Bulk add via VIN', helper: 'Paste one or multiple VINs separated by commas.' },
    ymm: { title: 'Option B: Manual YMM entry', helper: 'Add vehicles by year, make, model and quantity.' },
    dot: { title: 'Option C: DOT fleet lookup', helper: 'Search by US DOT Number and add vehicles.' },
  };
  let inputHtml = '';
  if (ffInputMethod === 'vin') {
    const lines = ffVinInput.split(',').map(s=>s.trim()).filter(Boolean);
    const valid = lines.filter(v=>v.length===17).length;
    inputHtml = `<div class="ff-form-group" style="margin:0">
      <label class="ff-label" style="display:flex;justify-content:space-between;">
        <span>Paste one or multiple VINs</span>
        ${lines.length?`<span style="color:${valid===lines.length?'#1B5E20':'#dc2626'};font-weight:700">${valid}/${lines.length} valid</span>`:''}
      </label>
      <textarea class="ff-textarea" style="min-height:52px;" placeholder="Paste one or multiple VINs (comma-separated)..." oninput="ffVinInput=this.value;">${ffVinInput}</textarea>
      <button class="ff-save-btn" style="margin-top:7px;" onclick="ffProcessVins('${bundleId}')" ${atQtyCap?'disabled':''}>Process &amp; Add</button>
    </div>`;
  } else if (ffInputMethod === 'ymm') {
    const makeOpts = Object.keys(FF_MAKES_MODELS).sort().map(m =>
      `<option value="${m}" ${ffYmm.make===m?'selected':''}>${m}</option>`).join('');
    const modelOpts = (FF_MAKES_MODELS[ffYmm.make] || []).map(m =>
      `<option value="${m}" ${ffYmm.model===m?'selected':''}>${m}</option>`).join('');
    inputHtml = `<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
      <div class="ff-form-group" style="flex:0 0 88px;margin:0"><label class="ff-label">Year</label>
        <select class="ff-select" onchange="ffYmm.year=this.value;renderFFContent()">
          <option value="">Year…</option>
          ${FF_YEARS.map(y=>`<option value="${y}" ${ffYmm.year===y?'selected':''}>${y}</option>`).join('')}
        </select></div>
      <div class="ff-form-group" style="flex:1;min-width:120px;margin:0"><label class="ff-label">Make</label>
        <select class="ff-select" onchange="ffYmm.make=this.value;ffYmm.model='';renderFFContent()">
          <option value="">Make…</option>${makeOpts}
        </select></div>
      <div class="ff-form-group" style="flex:1.4;min-width:130px;margin:0"><label class="ff-label">Model</label>
        <select class="ff-select" ${!ffYmm.make?'disabled':''} onchange="ffYmm.model=this.value;renderFFContent()">
          <option value="">${ffYmm.make?'Model…':'Select make first'}</option>${modelOpts}
        </select></div>
      <div class="ff-form-group" style="margin:0;width:auto;"><label class="ff-label">QTY</label>
        <div style="display:flex;align-items:center;border:1.5px solid var(--gray-200);border-radius:999px;height:36px;padding:0 8px;gap:6px;background:white;">
          <button style="border:none;background:none;cursor:pointer;font-size:15px" onclick="ffYmm.qty=Math.max(1,ffYmm.qty-1);renderFFContent()">−</button>
          <span style="font-size:13px;font-weight:700;min-width:18px;text-align:center">${ffYmm.qty}</span>
          <button style="border:none;background:none;cursor:pointer;font-size:15px" onclick="ffYmm.qty++;renderFFContent()">+</button>
        </div>
      </div>
      <button class="ff-save-btn" style="height:36px;border-radius:999px;padding:0 18px;" onclick="ffAddYMM('${bundleId}')" ${atQtyCap||!ffYmm.year||!ffYmm.make||!ffYmm.model?'disabled':''}>Add</button>
    </div>`;
  } else {
    // Fleet registration list — no manual input needed
    const globalVinsSet = getGlobalVinSet();
    const availableDot = FF_DOT_FLEET_MOCK.filter(v => !globalVinsSet.has(v.vin));
    const dotRows = availableDot.map(v => {
      const sel = ffDotSelected.includes(v.vin);
      const telem = detectTelematics(v.make, v.year);
      return `<label style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f3f3f3;cursor:pointer;font-size:12px;">
        <input type="checkbox" class="vds-checkbox-ff" ${sel?'checked':''} onchange="ffDotSelected=this.checked?[...ffDotSelected,'${v.vin}']:ffDotSelected.filter(x=>x!=='${v.vin}');renderFFContent()">
        <span style="font-family:monospace;font-size:10px;color:var(--gray-600);width:140px;flex-shrink:0;">${v.vin}</span>
        <span style="flex:1;font-weight:600;">${v.ymm}</span>
        <span style="font-size:10px;color:var(--gray-600);width:26px;">${v.cls}</span>
        ${telem==='OEM Detected'?`<span class="ff-badge-oem" style="font-size:9px;padding:1px 5px;">OEM</span>`:`<span style="font-size:10px;color:var(--gray-400);">Std</span>`}
      </label>`;
    }).join('');
    inputHtml = `<div>
      <div style="font-size:11px;color:var(--gray-600);margin-bottom:6px;">Fleet registration on file — select vehicles to add to this bundle:</div>
      <div style="max-height:180px;overflow-y:auto;border:1px solid var(--gray-200);border-radius:6px;padding:2px 10px;">
        ${dotRows || '<div style="font-size:12px;color:var(--gray-400);padding:8px 0;">All registered vehicles already assigned.</div>'}
      </div>
      <button class="ff-save-btn" style="margin-top:8px;" onclick="ffAddDotSelected('${bundleId}')" ${ffDotSelected.length===0||atQtyCap?'disabled':''}>Add ${ffDotSelected.length?ffDotSelected.length+' ':''}selected</button>
    </div>`;
  }

  // Bulk bar
  let bulkHtml = '';
  if (bv.length > 0) {
    if (!ffBulkOn) {
      bulkHtml = `<button class="ff-btn-start-bulk" onclick="ffBulkOn=true;renderFFContent()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
        Bulk action
      </button>`;
    } else {
      const actSel = `<select class="ff-select" style="width:190px;" onchange="ffBulkType=this.value;renderFFContent()">
        <option value="">Select action…</option>
        <option value="shipping" ${ffBulkType==='shipping'?'selected':''}>Shipping info</option>
        ${requiresInstall ? `<option value="installation" ${ffBulkType==='installation'?'selected':''}>Installation info</option>` : ''}
        ${waves.length > 0 ? `<option value="wave" ${ffBulkType==='wave'?'selected':''}>Assign to wave</option>` : ''}
        <option value="attributes" ${ffBulkType==='attributes'?'selected':''}>Set attributes</option>
        <option value="installtype" ${ffBulkType==='installtype'?'selected':''}>Install type (VMI/CMI)</option>
      </select>`;
      let flds = '';
      if (ffBulkType==='shipping') flds=`
        <div><select class="ff-select" style="min-width:160px;" onchange="ffBulkField('shippingId',this.value,'addresses')">${aOpts}</select></div>
        <div><select class="ff-select" style="min-width:160px;" onchange="ffBulkField('shippingContactId',this.value,'contacts')">${cOpts}</select></div>
        <label style="font-size:11px;display:flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap"><input type="checkbox" class="vds-checkbox-ff" ${ffBulkF.sameAsShipping?'checked':''} onchange="ffBulkF.sameAsShipping=this.checked"> Same as install</label>`;
      else if (ffBulkType==='installation') flds=`
        <div><select class="ff-select" style="min-width:160px;" onchange="ffBulkField('installAddressId',this.value,'addresses')">${aOpts}</select></div>
        <div><select class="ff-select" style="min-width:160px;" onchange="ffBulkField('installContactId',this.value,'contacts')">${cOpts}</select></div>`;
      else if (ffBulkType==='wave') flds=`
        <div><select class="ff-select" style="min-width:160px;" onchange="ffBulkField('waveId',this.value,'')">
          <option value="">Unassigned</option>
          ${waves.map(w=>`<option value="${w.id}">${w.name}</option>`).join('')}
        </select></div>`;
      else if (ffBulkType==='attributes') flds=`
        <label style="font-size:12px;display:flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap;"><input type="checkbox" class="vds-checkbox-ff" ${ffBulkF.isEmergency?'checked':''} onchange="ffBulkF.isEmergency=this.checked"> Emergency</label>
        <label style="font-size:12px;display:flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap;"><input type="checkbox" class="vds-checkbox-ff" ${ffBulkF.hasWheelchairLift?'checked':''} onchange="ffBulkF.hasWheelchairLift=this.checked"> Wheelchair lift</label>
        <label style="font-size:12px;display:flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap;"><input type="checkbox" class="vds-checkbox-ff" ${ffBulkF.masterSwitchOff?'checked':''} onchange="ffBulkF.masterSwitchOff=this.checked"> Master switch off</label>
        <label style="font-size:12px;display:flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap;"><input type="checkbox" class="vds-checkbox-ff" ${ffBulkF.hasCompetitorDevice?'checked':''} onchange="ffBulkF.hasCompetitorDevice=this.checked"> Competitor device</label>`;
      else if (ffBulkType==='installtype') flds=`
        <label style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;"><input type="radio" name="bulk-installtype" value="vmi" ${ffBulkF.installType==='vmi'?'checked':''} onchange="ffBulkF.installType=this.value"> VMI &mdash; Verizon installs</label>
        <label style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;"><input type="radio" name="bulk-installtype" value="cmi" ${ffBulkF.installType==='cmi'?'checked':''} onchange="ffBulkF.installType=this.value"> CMI &mdash; Customer installs</label>`;
      bulkHtml = `<div class="ff-bulk-bar ff-fadein">
        <div class="ff-bulk-hdr">
          <span class="ff-bulk-title">Bulk action</span>
          <button class="ff-remove-btn" onclick="ffBulkOn=false;ffBulkType='';renderFFContent()"><svg width="14" height="14" viewBox="0 0 15.185 15.185" fill="currentColor"><path d="M 8.889 7.593 L 15.185 13.889 L 13.889 15.185 L 7.593 8.889 L 1.296 15.185 L 0 13.889 L 6.296 7.593 L 0 1.296 L 1.296 0 L 7.593 6.296 L 13.889 0 L 15.185 1.296 L 8.889 7.593 Z"/></svg></button>
        </div>
        <div class="ff-bulk-fields">${actSel}${flds}</div>
        <div class="ff-bulk-footer">
          <span class="ff-bulk-count">Selected: <strong style="color:#009EDB">${selInB.length}</strong></span>
          <button class="ff-bulk-apply" ${selInB.length===0||!ffBulkType?'disabled':''} onclick="ffApplyBulk('${bundleId}')">Apply</button>
        </div>
      </div>`;
    }
  }

  // Vehicle table — compact rows, per-column attribute checkboxes, expandable detail
  let rowsHtml = '';
  const allFilteredSel = filtered.length > 0 && filtered.every(v => ffSelected.includes(String(v.id)));
  const filterBar = `
    <div class="ff-select-all-row">
      <label style="display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;color:var(--gray-600);cursor:pointer">
        <input type="checkbox" class="vds-checkbox-ff" ${allFilteredSel?'checked':''} onchange="ffToggleFiltered('${bundleId}',this.checked)"> Select all${ffSearch?' (filtered)':''}
      </label>
      <div class="ff-filter-wrap">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input class="ff-filter" type="text" placeholder="Filter VIN / YMM / name…" value="${ffSearch}" oninput="ffSearch=this.value;renderFFContent()">
      </div>
    </div>`;
  if (filtered.length === 0) {
    rowsHtml = filterBar + `<div class="ff-empty-state">${ffSearch ? 'No vehicles match "'+ffSearch+'"' : 'Add vehicles above to begin assignment'}</div>`;
  } else {
    rowsHtml = filterBar + `
    <table class="ff-v-table ff-v-table--compact">
      <thead>
        <tr>
          <th style="width:28px;"></th>
          <th style="text-align:left;">Vehicle</th>
          <th style="text-align:left;min-width:90px;">Name</th>
          <th style="text-align:left;min-width:80px;">Plate</th>
          <th style="width:26px;" title="Emergency vehicle"><span class="material-symbols-outlined" style="font-size:13px;color:#991B1B;">emergency</span></th>
          <th style="width:26px;" title="Wheelchair lift"><span class="material-symbols-outlined" style="font-size:13px;color:#3730A3;">accessible</span></th>
          <th style="width:26px;" title="Master switch off"><span class="material-symbols-outlined" style="font-size:13px;color:#374151;">power_off</span></th>
          <th style="width:26px;" title="Competitor device — removal at install"><span class="material-symbols-outlined" style="font-size:13px;color:#92400E;">build</span></th>
          <th style="width:58px;">Status</th>
          <th style="width:50px;"></th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(v => {
          const isReady = isVehicleReadyForBundle(v, bundle);
          const hasAny = v.telematics === 'OEM Detected'
            ? (v.activationContact || v.vehicleName)
            : (v.shippingId||v.shippingContactId||v.vehicleName);
          const isPartial = !!(hasAny && !isReady);
          const isOEM = v.telematics === 'OEM Detected';
          const assignedWave = waves.find(w => String(w.id) === String(v.waveId));
          const vInstallType = v.installType || form.installType || 'vmi';
          const vRequiresInstall = bundle.coreKey !== 'asset-nonpowered' && vInstallType !== 'cmi';
          const bundleInstallType = form.installType || 'vmi';
          const installOverridden = v.installType && v.installType !== bundleInstallType;
          const expanded = !!ffVehicleExpanded[String(v.id)];
          const vWaveOpts = `<option value="">Unassigned</option>${waves.map(w=>{
            const cw = contractWaves.find(c => String(c.id) === String(w.contractWaveId));
            const cwLabel = cw ? ` [${cw.slotStatus||'Contracted'}]` : '';
            return `<option value="${w.id}" ${String(w.id)===String(v.waveId)?'selected':''}>${w.name}${cwLabel}</option>`;
          }).join('')}`;
          const statusEl = isReady
            ? `<span style="color:var(--green);font-size:10px;font-weight:700;display:flex;align-items:center;gap:1px;"><span class="material-symbols-outlined" style="font-size:12px;">check_circle</span>Ready</span>`
            : isPartial
              ? `<span style="color:#f97316;font-size:10px;font-weight:700;display:flex;align-items:center;gap:1px;"><span class="material-symbols-outlined" style="font-size:12px;">pending</span>Partial</span>`
              : `<span style="color:var(--gray-400);font-size:10px;display:flex;align-items:center;gap:1px;"><span class="material-symbols-outlined" style="font-size:12px;">radio_button_unchecked</span>Empty</span>`;
          const detailRow = expanded ? `
            <tr class="ff-v-detail-row">
              <td colspan="10">
                <div style="padding:10px 12px 12px 28px;">
                  <div style="display:flex;align-items:center;gap:16px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--gray-200);">
                    <span style="font-size:11px;font-weight:700;color:var(--gray-600);">INSTALL TYPE</span>
                    <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;white-space:nowrap;">
                      <input type="radio" name="vit-${v.id}" value="vmi" ${vInstallType==='vmi'?'checked':''} onchange="ffUpdateVeh('${bundleId}','${v.id}','installType','vmi');renderFFContent()"> VMI — Verizon installs
                    </label>
                    <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;white-space:nowrap;">
                      <input type="radio" name="vit-${v.id}" value="cmi" ${vInstallType==='cmi'?'checked':''} onchange="ffUpdateVeh('${bundleId}','${v.id}','installType','cmi');renderFFContent()"> CMI — Customer installs
                    </label>
                    ${installOverridden ? `<span style="font-size:10px;font-weight:700;background:#FEF3C7;color:#92400E;border-radius:999px;padding:1px 7px;">Overrides bundle default (${bundleInstallType.toUpperCase()})</span>` : ''}
                    <button class="ff-text-link" style="margin-left:auto;" onclick="ffUpdateVeh('${bundleId}','${v.id}','installType','${bundleInstallType}');renderFFContent()">Reset to bundle default</button>
                  </div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                  ${isOEM ? `
                    <div class="ff-form-group" style="margin:0;grid-column:1/-1;">
                      <label class="ff-label">Activation Contact <span style="color:var(--gray-400)">(fleet manager authorizing OEM access)</span></label>
                      <input class="ff-input" type="text" placeholder="Name and/or email" value="${v.activationContact||''}" onchange="ffUpdateVeh('${bundleId}','${v.id}','activationContact',this.value)">
                    </div>` : `
                    <div class="ff-form-group" style="margin:0;"><label class="ff-label">Shipping address</label>
                      <select class="ff-select" onchange="ffVehicleDrop('${bundleId}','${v.id}','shippingId',this.value,'addresses')">${aOpts.replace(`value="${v.shippingId||''}"`,`value="${v.shippingId||''}" selected`)}</select></div>
                    <div class="ff-form-group" style="margin:0;"><label class="ff-label">Shipping contact</label>
                      <select class="ff-select" onchange="ffVehicleDrop('${bundleId}','${v.id}','shippingContactId',this.value,'contacts')">${cOpts.replace(`value="${v.shippingContactId||''}"`,`value="${v.shippingContactId||''}" selected`)}</select></div>
                    ${vRequiresInstall ? `
                    <div style="grid-column:1/-1;"><button class="ff-text-link" onclick="ffCopyShipping('${bundleId}','${v.id}')">Copy shipping → installation</button></div>
                    <div class="ff-form-group" style="margin:0;"><label class="ff-label">Install address</label>
                      <select class="ff-select" onchange="ffVehicleDrop('${bundleId}','${v.id}','installAddressId',this.value,'addresses')">${aOpts.replace(`value="${v.installAddressId||''}"`,`value="${v.installAddressId||''}" selected`)}</select></div>
                    <div class="ff-form-group" style="margin:0;"><label class="ff-label">Install contact</label>
                      <select class="ff-select" onchange="ffVehicleDrop('${bundleId}','${v.id}','installContactId',this.value,'contacts')">${cOpts.replace(`value="${v.installContactId||''}"`,`value="${v.installContactId||''}" selected`)}</select></div>` : `
                    <div style="grid-column:1/-1;font-size:11px;color:var(--gray-600);padding:2px 0;">CMI — no installation address required.</div>`}`}
                  ${waves.length > 0 ? `<div class="ff-form-group" style="margin:0;"><label class="ff-label">Install wave</label>
                    <select class="ff-select" onchange="ffAssignVehicleWave('${bundleId}','${v.id}',this.value)">${vWaveOpts}</select></div>` : ''}
                  </div>
                </div>
              </td>
            </tr>` : '';
          return `
            <tr class="ff-v-row-main${ffSelected.includes(String(v.id))?' ff-v-row-sel':''}">
              <td style="padding:5px 4px;"><input type="checkbox" class="vds-checkbox-ff" ${ffSelected.includes(String(v.id))?'checked':''} onchange="ffToggleSel('${v.id}',this.checked)"></td>
              <td style="padding:5px 8px;">
                <div style="font-family:monospace;font-size:10px;color:var(--gray-600);" title="${v.vin}">${v.vin.length>13?v.vin.slice(0,10)+'…':v.vin}</div>
                <div style="font-size:11px;font-weight:600;">${v.ymm||'Vehicle'}</div>
                ${isOEM?`<span class="ff-badge-oem" style="font-size:9px;padding:1px 4px;">OEM</span>`:''}
                ${installOverridden?`<span style="font-size:9px;font-weight:700;background:#FEF3C7;color:#92400E;border-radius:3px;padding:0 4px;">${vInstallType.toUpperCase()}</span>`:''}
                ${assignedWave?`<span style="font-size:9px;color:var(--brand-blue);font-weight:700;">↗ ${assignedWave.name}</span>`:''}
              </td>
              <td style="padding:4px 6px;"><input class="ff-input" style="height:28px;font-size:12px;padding:2px 6px;" type="text" placeholder="Name…" value="${v.vehicleName||''}" onchange="ffUpdateVeh('${bundleId}','${v.id}','vehicleName',this.value)"></td>
              <td style="padding:4px 6px;"><input class="ff-input" style="height:28px;font-size:12px;padding:2px 6px;" type="text" placeholder="ABC-1234" value="${v.plate||''}" onchange="ffUpdateVeh('${bundleId}','${v.id}','plate',this.value)"></td>
              <td style="padding:4px;text-align:center;"><input type="checkbox" class="vds-checkbox-ff" ${v.isEmergency?'checked':''} onchange="ffUpdateVeh('${bundleId}','${v.id}','isEmergency',this.checked)"></td>
              <td style="padding:4px;text-align:center;"><input type="checkbox" class="vds-checkbox-ff" ${v.hasWheelchairLift?'checked':''} onchange="ffUpdateVeh('${bundleId}','${v.id}','hasWheelchairLift',this.checked)"></td>
              <td style="padding:4px;text-align:center;"><input type="checkbox" class="vds-checkbox-ff" ${v.masterSwitchOff?'checked':''} onchange="ffUpdateVeh('${bundleId}','${v.id}','masterSwitchOff',this.checked)"></td>
              <td style="padding:4px;text-align:center;"><input type="checkbox" class="vds-checkbox-ff" ${v.hasCompetitorDevice?'checked':''} onchange="ffUpdateVeh('${bundleId}','${v.id}','hasCompetitorDevice',this.checked)"></td>
              <td style="padding:4px 6px;">${statusEl}</td>
              <td style="padding:4px;text-align:right;white-space:nowrap;">
                <button class="btn-circle-action" style="width:24px;height:24px;" title="${expanded?'Collapse':'Assignments'}" onclick="ffVehicleExpanded[String('${v.id}')]=!ffVehicleExpanded[String('${v.id}')];renderFFContent()">
                  <span class="material-symbols-outlined" style="font-size:14px;">${expanded?'expand_less':'expand_more'}</span>
                </button>
                <button class="ff-v-remove" onclick="ffRemoveVehicle('${bundleId}','${v.id}')"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
              </td>
            </tr>
            ${detailRow}`;
        }).join('')}
      </tbody>
    </table>`;
  }

  // Wave management panel
  // (contractWaves, PROCESSED_STATUSES, contractWaves already defined above)
  const lockedContractWaves = contractWaves.filter(cw => !PROCESSED_STATUSES.includes(cw.slotStatus || ''));
  const hasContractWaves = contractWaves.length > 0;

  const wavePanel = `
    <div class="ff-wave-panel">
      ${hasContractWaves ? `
      <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;padding:8px 10px;display:flex;gap:8px;font-size:11px;color:#1D4ED8;line-height:1.5;margin-bottom:10px;">
        <span class="material-symbols-outlined" style="font-size:14px;flex-shrink:0;margin-top:1px;">sync</span>
        <span>Waves are sourced from the contract. Only <strong>Dispatched</strong> or later waves are available for vehicle assignment. Advance wave status from the option card to unlock them.</span>
      </div>` : `
      <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;padding:8px 10px;display:flex;gap:8px;font-size:11px;color:#1D4ED8;line-height:1.5;margin-bottom:10px;">
        <span class="material-symbols-outlined" style="font-size:14px;flex-shrink:0;margin-top:1px;">info</span>
        <span><strong>Waves</strong> split your fleet install into groups with separate target dates. Assign each vehicle to a wave using the expand (▾) button on any vehicle row above.</span>
      </div>`}
      <div class="ff-wave-panel-header">
        <span class="ff-panel-title" style="font-size:16px;">Installation Waves</span>
        <span style="font-size:11px;color:var(--gray-600)">${waves.length} available · ${bv.filter(v=>v.waveId).length} scheduled</span>
        ${!hasContractWaves ? `<button class="ff-wave-add-btn" onclick="ffAddWave('${bundleId}')">+ Add Wave</button>` : ''}
      </div>
      ${waves.length === 0 && lockedContractWaves.length === 0
        ? `<div style="font-size:12px;color:var(--gray-400);padding:4px 0;">${hasContractWaves ? 'No dispatched waves yet. Advance wave status from the option card.' : 'No waves defined. Add a wave to plan phased installation.'}</div>`
        : `${waves.map(w => {
            const wvCount = bv.filter(v => String(v.waveId) === String(w.id)).length;
            // Look up contract wave status if seeded from contract
            const cw = contractWaves.find(c => String(c.id) === String(w.contractWaveId));
            const cwSc = cw ? getSlotStatusConfig(cw.slotStatus || 'Contracted') : null;
            return `<div class="ff-wave-card">
              <div style="display:flex;align-items:center;gap:10px;flex:1;flex-wrap:wrap;">
                <input class="ff-input" type="text" value="${w.name}" style="font-weight:700;font-size:13px;max-width:130px;" onchange="ffUpdateWave('${bundleId}',${w.id},'name',this.value)">
                <div>
                  <label class="ff-label" style="font-size:10px;margin-bottom:2px;display:block;">Target date</label>
                  <input class="ff-input" type="date" value="${w.targetDate||''}" style="font-size:12px;" onchange="ffUpdateWave('${bundleId}',${w.id},'targetDate',this.value)">
                </div>
                ${cwSc ? `<span class="ss-chip ${cwSc.cssClass}" style="font-size:9px;padding:2px 7px;"><span class="material-symbols-outlined" style="font-size:11px;">${cwSc.icon}</span>${cwSc.label}</span>` : ''}
                <span class="ff-wave-count">${wvCount} vehicle${wvCount!==1?'s':''}</span>
              </div>
              ${!hasContractWaves ? `<button class="ff-remove-btn" onclick="ffRemoveWave('${bundleId}',${w.id})" title="Remove wave"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>` : ''}
            </div>`;
          }).join('')}
          ${lockedContractWaves.map(cw => {
            const sc = getSlotStatusConfig(cw.slotStatus || 'Contracted');
            return `<div class="ff-wave-card" style="opacity:0.55;pointer-events:none;background:#F9FAFB;">
              <div style="display:flex;align-items:center;gap:10px;flex:1;flex-wrap:wrap;">
                <span style="font-weight:700;font-size:13px;color:var(--gray-600);min-width:130px;">${cw.name}</span>
                ${cw.targetDate ? `<span style="font-size:11px;color:var(--gray-400);">${cw.targetDate}</span>` : ''}
                <span class="ss-chip ${sc.cssClass}" style="font-size:9px;padding:2px 7px;"><span class="material-symbols-outlined" style="font-size:11px;">${sc.icon}</span>${sc.label}</span>
                <span style="font-size:10px;color:var(--gray-400);font-style:italic;">Not yet dispatched — locked</span>
              </div>
            </div>`;
          }).join('')}`}
    </div>`;

  return `
    <div style="padding-bottom:16px;border-bottom:1px solid var(--gray-200);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div class="ff-panel-title" style="font-size:22px;">Shipping Details</div>
        ${!isEditing ? `<button class="ff-save-btn" style="background:transparent;border:1px solid var(--gray-300);color:var(--gray-600);padding:5px 12px;font-size:11px;display:flex;align-items:center;gap:4px;" onclick="ffEnterEditMode('${bundleId}')"><span class="material-symbols-outlined" style="font-size:13px;">edit</span> Edit</button>` : ''}
      </div>
      ${isEditing ? `
      ${allOEM ? `<div class="ff-oem-notice"><span class="ff-badge-oem">All OEM</span>&nbsp; All vehicles in this bundle use OEM telematics — no hardware shipping required.</div>` : `
      ${savedA.length > 0 ? `<div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:6px;padding:8px 10px;display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
        <span class="material-symbols-outlined" style="font-size:15px;color:#0284C7;flex-shrink:0;">bookmark</span>
        <div style="display:flex;gap:8px;align-items:center;flex:1;flex-wrap:wrap;">
          <div style="display:flex;gap:6px;align-items:center;flex:1;min-width:180px;">
            <label style="font-size:11px;font-weight:700;color:#0369A1;white-space:nowrap;">Shipping address:</label>
            <select class="ff-select" style="flex:1;" onchange="ffUseSavedAddress('${bundleId}',this.value,'ship');this.value=''">
              <option value="">— select saved —</option>
              ${savedA.map(a=>`<option value="${a.id}" ${String(form.shipAddressId)===String(a.id)?'selected':''}>${a.name||'Location '+a.id}</option>`).join('')}
            </select>
          </div>
          ${savedC.length > 0 ? `<div style="display:flex;gap:6px;align-items:center;flex:1;min-width:160px;">
            <label style="font-size:11px;font-weight:700;color:#0369A1;white-space:nowrap;">Contact:</label>
            <select class="ff-select" style="flex:1;" onchange="ffUseSavedContact('${bundleId}',this.value,'ship');this.value=''">
              <option value="">— select saved —</option>
              ${savedC.map(c=>`<option value="${c.id}" ${String(form.shipContactId)===String(c.id)?'selected':''}>${c.name||'Contact '+c.id}</option>`).join('')}
            </select>
          </div>` : ''}
        </div>
        ${(form.shipAddressId||form.shipContactId) ? `<span style="font-size:10px;font-weight:700;color:#0369A1;white-space:nowrap;display:flex;align-items:center;gap:3px;"><span class="material-symbols-outlined" style="font-size:12px;">check_circle</span>Applied</span>` : ''}
      </div>` : ''}
      <div style="display:grid;grid-template-columns:1fr;gap:8px;">
        <div class="ff-form-group"><label class="ff-label">Address 1</label><input class="ff-input" type="text" value="${form.shipAddr1}" onchange="ffUpdateBundleForm('${bundleId}','shipAddr1',this.value)"></div>
        <div class="ff-form-group"><label class="ff-label">Address 2</label><input class="ff-input" type="text" value="${form.shipAddr2}" onchange="ffUpdateBundleForm('${bundleId}','shipAddr2',this.value)"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-top:8px;">
        <div class="ff-form-group"><label class="ff-label">Country</label>
          <select class="ff-select" onchange="ffUpdateBundleForm('${bundleId}','shipCountry',this.value)">
            <option ${(form.shipCountry||'United States')==='United States'?'selected':''}>United States</option>
            <option ${form.shipCountry==='Canada'?'selected':''}>Canada</option>
            <option ${form.shipCountry==='Mexico'?'selected':''}>Mexico</option>
          </select>
        </div>
        <div class="ff-form-group"><label class="ff-label">City</label><input class="ff-input" type="text" value="${form.shipCity}" placeholder="Tampa" onchange="ffUpdateBundleForm('${bundleId}','shipCity',this.value)"></div>
        <div class="ff-form-group"><label class="ff-label">State / Province</label><input class="ff-input" type="text" value="${form.shipState||''}" placeholder="FL" onchange="ffUpdateBundleForm('${bundleId}','shipState',this.value)"></div>
        <div class="ff-form-group"><label class="ff-label">Zip/Postal Code</label><input class="ff-input" type="text" value="${form.shipZip}" onchange="ffUpdateBundleForm('${bundleId}','shipZip',this.value)"></div>
      </div>
      <div style="border-top:1px solid var(--gray-200);margin:12px 0 10px;"></div>
      <div class="ff-panel-title" style="font-size:13px;margin-bottom:8px;">Shipping Contact</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        <div class="ff-form-group"><label class="ff-label">Contact Name</label><input class="ff-input" type="text" value="${form.contactName}" onchange="ffUpdateBundleForm('${bundleId}','contactName',this.value)"></div>
        <div class="ff-form-group"><label class="ff-label">Phone</label><input class="ff-input" type="text" value="${form.contactPhone}" onchange="ffUpdateBundleForm('${bundleId}','contactPhone',this.value)"></div>
        <div class="ff-form-group"><label class="ff-label">Email</label><input class="ff-input" type="email" value="${form.contactEmail}" onchange="ffUpdateBundleForm('${bundleId}','contactEmail',this.value)"></div>
      </div>
      ${requiresInstall ? `<div style="border-top:1px solid var(--gray-200);margin:12px 0 8px;"></div>
      <div class="ff-panel-title" style="font-size:13px;margin-bottom:8px;">Installation Address</div>
      <label style="font-size:12px;display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <input type="checkbox" class="vds-checkbox-ff" ${form.installSameAsShipping ? 'checked' : ''} onchange="ffUpdateBundleForm('${bundleId}','installSameAsShipping',this.checked);renderFFContent()">
        Installation Address is the same as shipping
      </label>
      ${!form.installSameAsShipping ? `
        ${!form.installAddressId ? `<div style="background:#FFF3CD;border:1px solid #FFC107;border-radius:6px;padding:7px 10px;font-size:11px;color:#856404;margin-bottom:8px;display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:14px;">warning</span>Select a saved installation address or enter one below.</div>` : ''}
        ${savedA.length > 0 ? `<div style="background:#F0F9FF;border:1px solid #BAE6FD;border-radius:6px;padding:8px 10px;display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
          <span class="material-symbols-outlined" style="font-size:15px;color:#0284C7;flex-shrink:0;">bookmark</span>
          <div style="display:flex;gap:8px;align-items:center;flex:1;flex-wrap:wrap;">
            <div style="display:flex;gap:6px;align-items:center;flex:1;min-width:180px;">
              <label style="font-size:11px;font-weight:700;color:#0369A1;white-space:nowrap;">Install address:</label>
              <select class="ff-select" style="flex:1;" onchange="ffUseSavedAddress('${bundleId}',this.value,'install');this.value=''">
                <option value="">— select saved —</option>
                ${savedA.map(a=>`<option value="${a.id}" ${String(form.installAddressId)===String(a.id)?'selected':''}>${a.name||'Location '+a.id}</option>`).join('')}
              </select>
            </div>
            ${savedC.length > 0 ? `<div style="display:flex;gap:6px;align-items:center;flex:1;min-width:160px;">
              <label style="font-size:11px;font-weight:700;color:#0369A1;white-space:nowrap;">Contact:</label>
              <select class="ff-select" style="flex:1;" onchange="ffUseSavedContact('${bundleId}',this.value,'install');this.value=''">
                <option value="">— select saved —</option>
                ${savedC.map(c=>`<option value="${c.id}" ${String(form.installContactId)===String(c.id)?'selected':''}>${c.name||'Contact '+c.id}</option>`).join('')}
              </select>
            </div>` : ''}
          </div>
          ${(form.installAddressId||form.installContactId) ? `<span style="font-size:10px;font-weight:700;color:#0369A1;white-space:nowrap;display:flex;align-items:center;gap:3px;"><span class="material-symbols-outlined" style="font-size:12px;">check_circle</span>Applied</span>` : ''}
        </div>` : ''}
      ` : ''}
      ` : isCMI ? `<div class="ff-cmi-notice" style="margin-top:8px;"><span class="material-symbols-outlined" style="font-size:15px;vertical-align:middle;">info</span>&nbsp; CMI selected — customer arranges device installation. No Verizon technician will be dispatched.</div>` : ''}
      <div style="border-top:1px solid var(--gray-200);margin:12px 0 8px;"></div>
      <div class="ff-panel-title" style="font-size:13px;margin-bottom:6px;">On-site Fleet Coordinator <span style="font-weight:400;color:var(--gray-400);font-size:10px;">(optional)</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        <div class="ff-form-group"><label class="ff-label">Name</label><input class="ff-input" type="text" value="${form.coordinatorName}" placeholder="Jane Smith" onchange="ffUpdateBundleForm('${bundleId}','coordinatorName',this.value)"></div>
        <div class="ff-form-group"><label class="ff-label">Phone</label><input class="ff-input" type="text" value="${form.coordinatorPhone}" placeholder="+1 (555) 000-0000" onchange="ffUpdateBundleForm('${bundleId}','coordinatorPhone',this.value)"></div>
        <div class="ff-form-group"><label class="ff-label">Email</label><input class="ff-input" type="email" value="${form.coordinatorEmail}" placeholder="jane@fleet.com" onchange="ffUpdateBundleForm('${bundleId}','coordinatorEmail',this.value)"></div>
      </div>
      <div style="margin-top:8px;">
        <div class="ff-form-group"><label class="ff-label">Site Access &amp; Notes <span style="font-weight:400;color:var(--gray-400);">(gate codes, hours, PPE…)</span></label>
        <textarea class="ff-textarea" style="min-height:56px;" placeholder="e.g. Gate code #4521, access Mon–Fri 7am–5pm, hard hat required" oninput="ffUpdateBundleForm('${bundleId}','siteNotes',this.value)">${form.siteNotes||''}</textarea></div>
      </div>
      <button class="ff-save-btn" style="margin-top:10px;" onclick="ffValidateBundleDetails('${bundleId}')">Save &amp; Continue</button>
      `}
      ` : (() => {
        // View mode — compact summary card
        const shipAddr = ffAddresses.find(a => String(a.id) === String(form.shipAddressId));
        const shipContact = ffContacts.find(c => String(c.id) === String(form.shipContactId));
        const installAddr = form.installSameAsShipping ? shipAddr : ffAddresses.find(a => String(a.id) === String(form.installAddressId));
        const installContact = form.installSameAsShipping ? shipContact : ffContacts.find(c => String(c.id) === String(form.installContactId));
        return `<div style="background:#F8FAFC;border:1px solid var(--gray-200);border-radius:8px;padding:12px 14px;font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;">
          <div>
            <div style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Shipping Address</div>
            <div style="font-weight:600;">${shipAddr ? shipAddr.name : '—'}</div>
            ${shipContact ? `<div style="color:var(--gray-600);margin-top:2px;">${shipContact.name}${shipContact.phone ? ' · ' + shipContact.phone : ''}${shipContact.email ? ' · ' + shipContact.email : ''}</div>` : ''}
          </div>
          ${requiresInstall ? `<div>
            <div style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Installation Address</div>
            ${form.installSameAsShipping ? `<div style="color:var(--gray-500);font-style:italic;">Same as shipping</div>` : `<div style="font-weight:600;">${installAddr ? installAddr.name : '—'}</div>${installContact ? `<div style="color:var(--gray-600);margin-top:2px;">${installContact.name}${installContact.phone ? ' · ' + installContact.phone : ''}</div>` : ''}`}
          </div>` : `<div>
            <div style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Install Type</div>
            <div>${isCMI ? 'CMI – Customer installs' : 'VMI – Verizon installs'}</div>
          </div>`}
          ${form.coordinatorName ? `<div>
            <div style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">On-site Coordinator</div>
            <div style="color:var(--gray-600);">${form.coordinatorName}${form.coordinatorPhone ? ' · ' + form.coordinatorPhone : ''}</div>
          </div>` : ''}
          ${form.siteNotes ? `<div style="grid-column:1/-1;">
            <div style="font-size:10px;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Site Notes</div>
            <div style="color:var(--gray-600);">${form.siteNotes}</div>
          </div>` : ''}
        </div>`;
      })()}
    </div>
    ${isEditing ? `<div style="padding-top:16px;"><div style="background:#FFF3CD;border:1px solid #FFC107;border-radius:8px;padding:14px 16px;display:flex;align-items:center;gap:10px;font-size:12px;color:#856404;">
        <span class="material-symbols-outlined" style="font-size:18px;color:#F59E0B;">lock</span>
        <span>Save address details above before assigning vehicles.</span>
      </div></div>` : `
    <div style="padding-top:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span class="ff-panel-title" style="font-size:20px;">Vehicle Assignment</span>
        <div style="width:210px;">
          <div class="ff-progress-row"><span><strong>${bv.length}</strong> / ${effectiveCap}${waveCapLabel} added</span>${waveNextLabel}</div>
          <div class="ff-progress-track">
            <div style="position:absolute;left:0;top:0;height:100%;background:#D1D5DB;border-radius:999px;width:${Math.min((bv.length/effectiveCap)*100,100)}%;"></div>
            <div class="ff-progress-orange" style="width:${Math.min(((readyN+partialN)/effectiveCap)*100,100)}%"></div>
            <div class="ff-progress-green" style="width:${Math.min((readyN/effectiveCap)*100,100)}%"></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:3px;font-size:9px;color:var(--gray-600);">
            ${readyN>0?`<span style="display:flex;align-items:center;gap:3px"><span style="width:6px;height:6px;background:#1B5E20;border-radius:1px;display:inline-block"></span>${readyN} ready</span>`:''}
            ${partialN>0?`<span style="display:flex;align-items:center;gap:3px"><span style="width:6px;height:6px;background:#f97316;border-radius:1px;display:inline-block"></span>${partialN} partial</span>`:''}
            ${(bv.length-readyN-partialN)>0?`<span style="display:flex;align-items:center;gap:3px"><span style="width:6px;height:6px;background:#E5E7EB;border-radius:1px;display:inline-block;border:1px solid #ccc"></span>${bv.length-readyN-partialN} empty</span>`:''}
            ${bv.length===0?`<span style="color:var(--gray-400)">Add vehicles below</span>`:''}
          </div>
        </div>
      </div>
      <div class="ff-method-tabs ff-method-tabs--vehicle">
        <button class="ff-method-tab ff-method-tab--vehicle ${ffInputMethod==='vin'?'active':''}" onclick="ffInputMethod='vin';renderFFContent()">Option A: Bulk add via VIN</button>
        <button class="ff-method-tab ff-method-tab--vehicle ${ffInputMethod==='ymm'?'active':''}" onclick="ffInputMethod='ymm';renderFFContent()">Option B: Manual YMM entry</button>
        <button class="ff-method-tab ff-method-tab--vehicle ${ffInputMethod==='dot'?'active':''}" onclick="ffInputMethod='dot';renderFFContent()">Option C: DOT fleet lookup</button>
      </div>
      <div class="ff-method-panel">
        <div class="ff-method-panel-title">${methodMeta[ffInputMethod].title}</div>
        <div class="ff-method-panel-helper">${methodMeta[ffInputMethod].helper}</div>
        ${inputHtml}
      </div>
    </div>
    <div class="ff-panel" style="min-height:260px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span class="ff-panel-title">Inventory Assignment</span>
        <span style="font-size:11px;color:var(--gray-600)">${bv.length} vehicles</span>
      </div>
      ${bulkHtml}
      ${rowsHtml}
    </div>
    ${wavePanel}
    `}
`;
}

// Vehicle actions
function detectTelematics(make, year) {
  const y = parseInt(year, 10);
  const mk = (make || '').trim().toLowerCase();
  if (!Number.isFinite(y)) return 'Standard';
  if ((mk === 'ford' || mk === 'lincoln') && y >= 2020) return 'OEM Detected';
  if (['chevrolet', 'gmc', 'buick', 'cadillac'].includes(mk) && y >= 2015) return 'OEM Detected';
  return 'Standard';
}

function ffProcessVins(bId) {
  if (!ffVinInput.trim()) return;
  if (!canAddVehiclesToBundle(bId)) return;
  const globalVins = getGlobalVinSet();
  const bundle = getBundles().find(b => String(b.id) === String(bId));
  const form = getFFBundleForm(bId);
  const qtyCap = getEffectiveBundleQtyCap(bId);
  let remaining = Math.max(0, qtyCap - (ffVehicles[bId] || []).length);
  let duplicateCount = 0;
  let overCapCount = 0;
  ffVinInput.split(',').map(s=>s.trim()).filter(Boolean).forEach(vin => {
    const normalized = vin.toUpperCase();
    if (globalVins.has(normalized)) { duplicateCount += 1; return; }
    if (remaining <= 0) { overCapCount += 1; return; }
    ffVehicles[bId].push({
      id:Date.now()+Math.random(),
      vin:normalized,ymm:'Vehicle',cls:'MD',telematics:'Standard',vehicleName:'',plate:'',
      installType: form.installType || 'vmi',
      shippingId:form.shipAddressId || '',
      shippingContactId:form.shipContactId || '',
      installAddressId:(form.installSameAsShipping ? (form.shipAddressId || '') : (form.installAddressId || '')),
      installContactId:(form.installSameAsShipping ? (form.shipContactId || '') : (form.installContactId || '')),
      activationContact:'', waveId:null,
      isEmergency: false, hasWheelchairLift: false, masterSwitchOff: false, hasCompetitorDevice: false,
    });
    globalVins.add(normalized);
    remaining -= 1;
  });
  if (duplicateCount > 0) alert(`${duplicateCount} duplicate VIN(s) were ignored.`);
  if (overCapCount > 0) alert(`${overCapCount} vehicle(s) were ignored due to bundle quantity cap.`);
  ffVinInput=''; renderFF();
}
function ffAddYMM(bId) {
  if (!ffYmm.year||!ffYmm.make||!ffYmm.model) { alert('Fill Year, Make and Model.'); return; }
  if (!canAddVehiclesToBundle(bId)) return;
  const bundle = getBundles().find(b => String(b.id) === String(bId));
  const form = getFFBundleForm(bId);
  const qtyCap = getEffectiveBundleQtyCap(bId);
  const remaining = Math.max(0, qtyCap - (ffVehicles[bId] || []).length);
  const addCount = Math.min(ffYmm.qty, remaining);
  const telematics = detectTelematics(ffYmm.make, ffYmm.year);
  for(let i=0;i<addCount;i++) {
    ffVehicles[bId].push({
      id:Date.now()+Math.random(),
      vin:`TBD-${Date.now().toString(36)}-${i}`,
      ymm:`${ffYmm.year} ${ffYmm.make} ${ffYmm.model}`,
      cls:'MD',
      year: ffYmm.year,
      make: ffYmm.make,
      telematics,
      vehicleName:'',
      plate:'',
      installType: form.installType || 'vmi',
      shippingId:form.shipAddressId || '',
      shippingContactId:form.shipContactId || '',
      installAddressId:(form.installSameAsShipping ? (form.shipAddressId || '') : (form.installAddressId || '')),
      installContactId:(form.installSameAsShipping ? (form.shipContactId || '') : (form.installContactId || '')),
      activationContact:'', waveId:null,
      isEmergency: false, hasWheelchairLift: false, masterSwitchOff: false, hasCompetitorDevice: false,
    });
  }
  if (addCount < ffYmm.qty) alert(`${ffYmm.qty - addCount} vehicle(s) were ignored due to bundle quantity cap.`);
  ffYmm={year:'',make:'',model:'',qty:1}; renderFF();
}
function ffAddDOT(bId) {
  if (!ffDot) { alert('Enter a DOT number.'); return; }
  if (!canAddVehiclesToBundle(bId)) return;
  const globalVins = getGlobalVinSet();
  const bundle = getBundles().find(b => String(b.id) === String(bId));
  const form = getFFBundleForm(bId);
  const qtyCap = getEffectiveBundleQtyCap(bId);
  let remaining = Math.max(0, qtyCap - (ffVehicles[bId] || []).length);
  let duplicateCount = 0;
  let overCapCount = 0;
  ['1HGBH41JXMN109186','2T1BURHE0JC074678','3VWDA2AJ4EM350125'].forEach(vin => {
    const normalized = vin.toUpperCase();
    if (globalVins.has(normalized)) { duplicateCount += 1; return; }
    if (remaining <= 0) { overCapCount += 1; return; }
    ffVehicles[bId].push({
      id:Date.now()+Math.random(),vin:normalized,ymm:'DOT Fleet Vehicle',cls:'MD',telematics:'Standard',vehicleName:'',plate:'',
      shippingId:form.shipAddressId || '',
      shippingContactId:form.shipContactId || '',
      installAddressId:(form.installSameAsShipping ? (form.shipAddressId || '') : (form.installAddressId || '')),
      installContactId:(form.installSameAsShipping ? (form.shipContactId || '') : (form.installContactId || '')),
      isEmergency: false, hasWheelchairLift: false, masterSwitchOff: false, hasCompetitorDevice: false,
    });
    globalVins.add(normalized);
    remaining -= 1;
  });
  if (duplicateCount > 0) alert(`${duplicateCount} duplicate VIN(s) were ignored.`);
  if (overCapCount > 0) alert(`${overCapCount} vehicle(s) were ignored due to bundle quantity cap.`);
  ffDot=''; renderFF();
}
function ffRemoveVehicle(bId,vId) { ffVehicles[bId]=ffVehicles[bId].filter(v=>v.id!==vId); ffSelected=ffSelected.filter(id=>id!==vId); renderFF(); }
function ffUpdateVeh(bId,vId,f,v) { ffVehicles[bId]=ffVehicles[bId].map(vh=>String(vh.id)===String(vId)?{...vh,[f]:v}:vh); }
function ffToggleSel(vId,checked) { const sid=String(vId); ffSelected=checked?[...new Set([...ffSelected,sid])]:ffSelected.filter(id=>id!==sid); renderFFContent(); }
function ffToggleAll(bId,checked) {
  const ids=ffVehicles[bId].map(v=>String(v.id));
  ffSelected=checked?[...new Set([...ffSelected,...ids])]:ffSelected.filter(id=>!ids.includes(id));
  renderFFContent();
}
function ffToggleFiltered(bId, checked) {
  const bv = ffVehicles[bId] || [];
  const s = (ffSearch||'').toLowerCase();
  const filteredIds = bv.filter(v => !s || (v.vin||'').toLowerCase().includes(s)||(v.ymm||'').toLowerCase().includes(s)||(v.vehicleName||'').toLowerCase().includes(s)).map(v=>String(v.id));
  ffSelected = checked ? [...new Set([...ffSelected,...filteredIds])] : ffSelected.filter(id=>!filteredIds.includes(id));
  renderFFContent();
}
function ffAddDotSelected(bId) {
  const existing = getGlobalVinSet();
  const toAdd = FF_DOT_FLEET_MOCK.filter(v => ffDotSelected.includes(v.vin) && !existing.has(v.vin));
  if (!ffVehicles[bId]) ffVehicles[bId] = [];
  const bundle = getBundles().find(b => String(b.id) === String(bId));
  const form = getFFBundleForm(bId);
  const qtyCap = getEffectiveBundleQtyCap(bId);
  let remaining = Math.max(0, qtyCap - ffVehicles[bId].length);
  toAdd.forEach(v => {
    if (remaining <= 0) return;
    const telem = detectTelematics(v.make, v.year);
    ffVehicles[bId].push({
      id: Date.now()+Math.random(), vin: v.vin, ymm: v.ymm, year: v.year, make: v.make, cls: v.cls, telematics: telem,
      vehicleName:'', plate:'',
      installType: form.installType || 'vmi',
      shippingId: form.shipAddressId || '',
      shippingContactId: form.shipContactId || '',
      installAddressId: (form.installSameAsShipping ? (form.shipAddressId || '') : (form.installAddressId || '')),
      installContactId: (form.installSameAsShipping ? (form.shipContactId || '') : (form.installContactId || '')),
      activationContact:'', waveId:null,
      isEmergency:false, hasWheelchairLift:false, masterSwitchOff:false, hasCompetitorDevice:false,
    });
    remaining -= 1;
  });
  ffDotSelected = [];
  renderFFContent();
}
function ffCopyShipping(bId,vId) { ffVehicles[bId]=ffVehicles[bId].map(v=>v.id===vId?{...v,installAddressId:v.shippingId,installContactId:v.shippingContactId}:v); renderFFContent(); }
function ffVehicleDrop(bId,vId,f,val,tab) {
  if (val==='ADD_NEW') { ffGoToAddresses(true); return; }
  ffVehicles[bId]=ffVehicles[bId].map(v=>v.id===vId?{...v,[f]:val}:v); renderFFContent();
}
function ffBulkField(f,val,tab) {
  if (val==='ADD_NEW') { ffGoToAddresses(true); return; }
  ffBulkF[f]=val; renderFFContent();
}
function ffApplyBulk(bId) {
  ffVehicles[bId]=ffVehicles[bId].map(v=>{
    if (!ffSelected.includes(String(v.id))) return v;
    const u={};
    if (ffBulkType==='shipping') {
      if(ffBulkF.shippingId) u.shippingId=ffBulkF.shippingId;
      if(ffBulkF.shippingContactId) u.shippingContactId=ffBulkF.shippingContactId;
      if(ffBulkF.sameAsShipping){u.installAddressId=u.shippingId||v.shippingId;u.installContactId=u.shippingContactId||v.shippingContactId;}
    } else if(ffBulkType==='installation'){
      if(ffBulkF.installAddressId) u.installAddressId=ffBulkF.installAddressId;
      if(ffBulkF.installContactId) u.installContactId=ffBulkF.installContactId;
    } else if(ffBulkType==='wave'){
      u.waveId = ffBulkF.waveId ? Number(ffBulkF.waveId) : null;
    } else if(ffBulkType==='attributes'){
      u.isEmergency = ffBulkF.isEmergency;
      u.hasWheelchairLift = ffBulkF.hasWheelchairLift;
      u.masterSwitchOff = ffBulkF.masterSwitchOff;
      u.hasCompetitorDevice = ffBulkF.hasCompetitorDevice;
    } else if(ffBulkType==='installtype' && ffBulkF.installType){
      u.installType = ffBulkF.installType;
    }
    return{...v,...u};
  });
  ffSelected=[]; renderFF();
}

// ── WAVE MANAGEMENT ──
function ffAddWave(bId) {
  if (!ffWaves[bId]) ffWaves[bId] = [];
  const n = ffWaves[bId].length + 1;
  ffWaves[bId].push({ id: Date.now(), name: `Wave ${n}`, targetDate: '', vehicleIds: [] });
  renderFFContent();
}
function ffRemoveWave(bId, wId) {
  ffWaves[bId] = (ffWaves[bId] || []).filter(w => w.id !== Number(wId));
  (ffVehicles[bId] || []).forEach(v => { if (String(v.waveId) === String(wId)) v.waveId = null; });
  renderFF();
}
function ffUpdateWave(bId, wId, field, val) {
  const w = (ffWaves[bId] || []).find(x => x.id === Number(wId));
  if (w) w[field] = val;
}
function ffAssignVehicleWave(bId, vId, wId) {
  ffVehicles[bId] = ffVehicles[bId].map(v => v.id === vId ? {...v, waveId: wId ? Number(wId) : null} : v);
  renderFFContent();
}

// ── SUMMARY TAB ──
function renderFFSummary() {
  const bundles = getBundles();
  const savedA  = ffAddresses.filter(a => a.saved);
  const savedC  = ffContacts.filter(c => c.saved);
  const submitted     = proposalData.fulfillmentSubmitted;
  const submitDate    = proposalData.fulfillmentSubmittedDate || '';

  const warnings = [];
  bundles.forEach(b => {
    const form  = getFFBundleForm(b.id);
    const bv    = ffVehicles[b.id] || [];
    if (bv.length === 0) warnings.push(`<strong>${b.coreName}</strong>: No vehicles added`);
    const notReady = bv.filter(v => !isVehicleReadyForBundle(v, b)).length;
    if (notReady > 0) warnings.push(`<strong>${b.coreName}</strong>: ${notReady} vehicle${notReady!==1?'s':''} missing assignment data`);
    if (!form.contactName) warnings.push(`<strong>${b.coreName}</strong>: Missing shipping contact`);
  });
  if (savedA.length === 0) warnings.push('No validated addresses on file');

  const summaryContent = buildSummaryContent(bundles, savedA, savedC);

  if (submitted) {
    return `<div class="ff-summary-submitted-banner" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="material-symbols-outlined" style="font-size:22px;color:var(--green)">check_circle</span>
        <div>
          <div style="font-weight:700;font-size:14px;">Submitted to Ops</div>
          <div style="font-size:12px;color:var(--gray-600);">Sent on ${submitDate}</div>
        </div>
      </div>
      <button type="button" class="vds-btn-secondary" style="font-size:12px;padding:4px 12px;" onclick="ffAmendFulfillment()">
        <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;margin-right:3px;">edit</span>Amend
      </button>
    </div>
    <div style="display:flex;align-items:center;gap:0;margin:16px 0;padding:12px 16px;background:var(--gray-100);border-radius:6px;font-size:11px;overflow-x:auto;">
      <span style="font-weight:700;color:var(--green);white-space:nowrap;">&#10003; ValuCal</span>
      <span style="color:var(--gray-400);margin:0 6px;">→</span>
      <span style="font-weight:600;color:var(--gray-600);white-space:nowrap;">DealHub CPQ</span>
      <span style="color:var(--gray-400);margin:0 6px;">→</span>
      <span style="font-weight:600;color:var(--gray-600);white-space:nowrap;">Ops Portal</span>
      <span style="color:var(--gray-400);margin:0 6px;">→</span>
      <span style="font-weight:600;color:var(--gray-600);white-space:nowrap;">Salesforce</span>
    </div>
    ${summaryContent}`;
  }

  return `
    ${warnings.length > 0
      ? `<div class="ff-summary-warnings">
          <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:#92400e;display:flex;align-items:center;gap:6px;">
            <span class="material-symbols-outlined" style="font-size:16px;">warning</span>
            ${warnings.length} item${warnings.length!==1?'s':''} need attention before submitting
          </div>
          ${warnings.map(w=>`<div class="ff-summary-warning-item">• ${w}</div>`).join('')}
        </div>`
      : `<div class="ff-summary-ready">
          <span class="material-symbols-outlined" style="font-size:18px;">check_circle</span>
          All information complete — ready to submit to ops.
        </div>`}
    ${summaryContent}
    <div style="margin-top:24px;padding-top:20px;border-top:2px solid var(--gray-200);display:flex;justify-content:flex-end;">
      <button class="vds-btn-primary" style="min-width:200px;" onclick="submitFulfillmentToOps()">
        <span class="material-symbols-outlined" style="vertical-align:middle;font-size:16px;margin-right:6px;">send</span>
        Submit to Ops
      </button>
    </div>`;
}

function buildSummaryContent(bundles, savedA, savedC) {
  return `<div style="display:flex;flex-direction:column;gap:16px;">
    ${bundles.map(b => {
      const form      = getFFBundleForm(b.id);
      const bv        = ffVehicles[b.id] || [];
      const waves     = ffWaves[b.id] || [];
      const oemCount  = bv.filter(v => v.telematics === 'OEM Detected').length;
      const stdCount  = bv.length - oemCount;
      const readyCount = bv.filter(v => isVehicleReadyForBundle(v, b)).length;
      const isCMI    = form.installType === 'cmi';

      // Resolve saved addresses and contacts
      const shipAddr  = ffAddresses.find(a => String(a.id) === String(form.shipAddressId));
      const shipAddrLabel = shipAddr ? (shipAddr.name || [shipAddr.addr1, shipAddr.city, shipAddr.state, shipAddr.zip].filter(Boolean).join(', ')) : null;
      const installAddrSame = form.installSameAsShipping;
      const installAddr = installAddrSame ? shipAddr : ffAddresses.find(a => String(a.id) === String(form.installAddressId));
      const installAddrLabel = installAddr ? (installAddr.name || [installAddr.addr1, installAddr.city, installAddr.state, installAddr.zip].filter(Boolean).join(', ')) : null;
      const shipContact = ffContacts.find(c => String(c.id) === String(form.shipContactId));
      const installContact = installAddrSame ? shipContact : ffContacts.find(c => String(c.id) === String(form.installContactId));

      return `<div class="ff-summary-bundle">
        <div class="ff-summary-bundle-header">
          <span style="font-size:15px;font-weight:800;">${b.coreName}</span>
          <span class="ff-install-type-badge ${isCMI ? 'cmi' : 'vmi'}">${isCMI ? 'CMI' : 'VMI'}</span>
          <span style="font-size:11px;color:var(--gray-600);margin-left:auto;">${readyCount}/${b.qty} ready</span>
        </div>
        <div class="ff-summary-grid">
          ${shipAddrLabel ? `<div class="ff-summary-row"><span class="ff-summary-label">Ship to</span><span>${shipAddrLabel}${shipContact ? ' · ' + shipContact.name : ''}</span></div>` : ''}
          ${!installAddrSame && installAddrLabel ? `<div class="ff-summary-row"><span class="ff-summary-label">Install at</span><span>${installAddrLabel}${installContact ? ' · ' + installContact.name : ''}</span></div>` : (shipAddrLabel ? `<div class="ff-summary-row"><span class="ff-summary-label">Install at</span><span style="color:var(--gray-400)">Same as shipping</span></div>` : '')}
          ${form.coordinatorName ? `<div class="ff-summary-row"><span class="ff-summary-label">Fleet Coordinator</span><span>${form.coordinatorName}${form.coordinatorPhone?' · '+form.coordinatorPhone:''}</span></div>` : ''}
          ${form.siteNotes ? `<div class="ff-summary-row"><span class="ff-summary-label">Site Notes</span><span style="white-space:pre-wrap">${form.siteNotes}</span></div>` : ''}
          <div class="ff-summary-row"><span class="ff-summary-label">Vehicles</span><span>${bv.length} total${oemCount > 0 ? ` (${oemCount} OEM activation, ${stdCount} standard)` : ''}</span></div>
          ${bv.filter(v=>v.isEmergency).length>0?`<div class="ff-summary-row"><span class="ff-summary-label">Emergency vehicles</span><span>${bv.filter(v=>v.isEmergency).length}</span></div>`:''}
          ${bv.filter(v=>v.hasWheelchairLift).length>0?`<div class="ff-summary-row"><span class="ff-summary-label">Wheelchair lift</span><span>${bv.filter(v=>v.hasWheelchairLift).length}</span></div>`:''}
          ${bv.filter(v=>v.masterSwitchOff).length>0?`<div class="ff-summary-row"><span class="ff-summary-label">Master switch off</span><span>${bv.filter(v=>v.masterSwitchOff).length}</span></div>`:''}
          ${bv.filter(v=>v.hasCompetitorDevice).length>0?`<div class="ff-summary-row" style="background:#FFFBEB;"><span class="ff-summary-label" style="color:#92400E;">&#9888; Competitor removal</span><span style="color:#92400E;">${bv.filter(v=>v.hasCompetitorDevice).length} vehicle${bv.filter(v=>v.hasCompetitorDevice).length!==1?'s':''} — removal required at install</span></div>`:''}
          ${waves.length > 0 ? `<div class="ff-summary-row"><span class="ff-summary-label">Install Waves</span>
            <div>${waves.map(w => {
              const cnt = bv.filter(v => String(v.waveId) === String(w.id)).length;
              return `<div style="font-size:12px;margin-bottom:3px;"><strong>${w.name}</strong> — ${cnt} vehicle${cnt!==1?'s':''}${w.targetDate ? ' · target: '+new Date(w.targetDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : ''}</div>`;
            }).join('')}</div>
          </div>` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function submitFulfillmentToOps() {
  const bundles = getBundles();
  // Validate: at least one vehicle per bundle
  const missingVehicles = bundles.filter(b => (ffVehicles[b.id] || []).length === 0);
  if (missingVehicles.length > 0) {
    alert(`Please add vehicles for: ${missingVehicles.map(b => b.coreName).join(', ')}`);
    return;
  }

  proposalData.fulfillmentSubmitted = true;
  proposalData.fulfillmentSubmittedDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  logProposalEvent('Fulfillment submitted', 'Fulfillment configuration submitted to Ops.');

  // Serialize snapshot
  if (!proposalData.fulfillmentSnapshot) {
    proposalData.fulfillmentSnapshot = {
      addresses: ffAddresses.filter(a => a.saved),
      contacts:  ffContacts.filter(c => c.saved),
      bundleForms: JSON.parse(JSON.stringify(ffBundleForms)),
      waves: JSON.parse(JSON.stringify(ffWaves)),
    };
  }

  closeFulfillmentModal();
  if (typeof showSuccessBanner === 'function') showSuccessBanner('Fulfillment submitted to Ops', 'Your fulfillment configuration has been sent. The team will follow up shortly.');
  if (typeof updateFulfillmentBtn === 'function') updateFulfillmentBtn();
  if (typeof updateDealResultFulfillmentCta === 'function') updateDealResultFulfillmentCta();
}

function ffAmendFulfillment() {
  if (!confirm('Re-opening will allow you to edit the fulfillment configuration. Changes may require re-submission. Continue?')) return;
  proposalData.fulfillmentSubmitted = false;
  proposalData.fulfillmentSnapshot = null;
  renderFFContent();
}

function saveFulfillmentConfig() {
  const totalVehicles = Object.values(ffVehicles).reduce((sum, arr) => sum + arr.length, 0);
  const savedAddrs = ffAddresses.filter(a => a.saved).length;

  if (savedAddrs === 0 && totalVehicles === 0) {
    alert('Please add at least one address and some vehicles to continue.');
    return;
  }

  // Show syncing state  
  const saveBtn = document.querySelector('.fulfillment-footer .vds-btn-primary');
  if (saveBtn) { saveBtn.textContent = 'Syncing...'; saveBtn.disabled = true; }

  setTimeout(() => {
    const badge = document.getElementById('account-badge');
    if (badge) { badge.className = 'vds-badge vds-badge-green badge-ready'; badge.textContent = 'Account ready'; }
    const banner = document.getElementById('warning-banner');
    if (banner) { banner.classList.add('hidden'); const body = document.getElementById('vc-body'); if(body) body.classList.remove('has-banner'); }
    // Serialize fulfillment data snapshot into proposalData for downstream use
    if (!proposalData.fulfillmentSnapshot) {
      proposalData.fulfillmentSnapshot = {
        addresses: ffAddresses.filter(a => a.saved),
        contacts:  ffContacts.filter(c => c.saved),
        bundleForms: JSON.parse(JSON.stringify(ffBundleForms)),
        waves: JSON.parse(JSON.stringify(ffWaves)),
      };
    }
    closeFulfillmentModal();
    if (typeof showSuccessBanner === 'function') showSuccessBanner('Fulfillment configured', 'Addresses and vehicles synchronized successfully.');
    if (saveBtn) { saveBtn.textContent = 'Save Configuration'; saveBtn.disabled = false; }
    if (typeof updateFulfillmentBtn === 'function') updateFulfillmentBtn();
  }, 1200);
}

// Legacy compat stubs (from zip) — replaced by above
function addMockLocation() { ffAddresses.push({id:Date.now(),saved:true,name:'Warehouse B · 456 Supply Dr, Austin TX 73301',addr1:'456 Supply Dr',addr2:'',city:'Austin',state:'TX',zip:'73301',country:'United States'}); openFulfillmentModal(); }
function addMockContact() { ffContacts.push({id:Date.now(),saved:true,name:'Mark Sloan',phone:'+1 555 111 2222',email:'mark@client.com'}); openFulfillmentModal(); }
function addMockVin() { ffAddYMM('default'); }
function deleteFulfillmentItem() {}
function renderFulfillmentTables() {}

function showToast(msg) { if (typeof showSuccessBanner === 'function') showSuccessBanner(msg, ''); }


function closeConfirmModal() {
  document.getElementById('confirm-selection-overlay').classList.remove('open');
}

function getSelectedOptionSummary() {
  const selectedId = bld.selectedOptionId;
  const opt = options.find((o) => o.id === selectedId);
  if (!opt) return null;
  const optionNumber = Math.max(1, options.findIndex((o) => o.id === selectedId) + 1);
  const { totalMonthly } = calcOption(opt, getOptionPromotion(opt), (opt.forcedTierIndex ?? -1));
  return {
    optionLabel: `Option ${optionNumber}`,
    optionValue: `${formatMoney(totalMonthly)}/month`
  };
}

function openConfirmSelectionModal() {
  const overlay = document.getElementById('confirm-selection-overlay');
  if (!overlay) return;
  const body = document.getElementById('confirm-selection-body');
  const summary = getSelectedOptionSummary();
  if (body) {
    if (summary) {
      body.innerHTML = `You selected <strong>${summary.optionLabel}</strong> with a value of <strong>${summary.optionValue}</strong>.<br><br>This will lock the quoting session and initiate the contract generation process.`;
    } else {
      body.textContent = 'This will lock the quoting session and initiate the contract generation process.';
    }
  }
  overlay.classList.add('open');
}

function confirmAndLockDeal() {
  closeConfirmModal();
  navigateToContractReviewFromSelection();
}

// ── CONTRACT SUB-STATE ─────────────────────────────────────────
// States: 'waiting' → 'signed' → 'payment' → 'closed'
let contractSubState = 'waiting';
let selectedOpt = null;

function enterContractScreen(opt) {
  clearSignatureCompletionSimulation();
  selectedOpt = opt;
  syncExpirationInputs(getSelectedExpirationDate());
  contractSubState = 'pre-send'; // before sending e-sign
  touchNavDate('contract_review_send');
  // Show phase 1 (message form), hide phase 2
  document.getElementById('contract-phase-review').classList.remove('hidden');
  document.getElementById('contract-phase-signpay').classList.add('hidden');
  document.getElementById('contract-sub-stepper')?.classList.add('hidden');
  // Stepper: step 1 active
  const d1 = document.getElementById('c-dot-1');
  const d2 = document.getElementById('c-dot-2');
  const l1 = document.getElementById('c-line-1');
  if (d1) d1.className = 'c-step-dot active';
  if (document.getElementById('c-dot-label-2')) document.getElementById('c-dot-label-2').className = 'c-step-label muted';
  if (d2) d2.className = 'c-step-dot pending';
  if (l1) l1.className = 'c-line';
  // Footer
  const contractSendBtn = document.getElementById('contract-send-btn');
  if (contractSendBtn) {
    contractSendBtn.classList.remove('hidden');
    contractSendBtn.innerText = 'Send E-Sign Link';
    contractSendBtn.disabled = false;
  }
  document.getElementById('footer-back').classList.remove('visible');
  document.getElementById('footer-back').classList.add('hidden');
  renderContractDoc(opt);
}

function isFulfillmentComplete() {
  // All bundles must have at least 1 vehicle and required assignments.
  // Non-powered assets only require shipping + contact + vehicle name.
  const bundles = getBundles();
  if (!bundles || bundles.length === 0) return false;
  return bundles.every(b => {
    const bv = ffVehicles[b.id] || [];
    const requiresInstall = bundleRequiresInstallation(b);
    return bv.length > 0 && bv.every(v => {
      const hasShipping = v.shippingId && v.shippingContactId && v.vehicleName;
      if (!hasShipping) return false;
      if (!requiresInstall) return true;
      return v.installAddressId && v.installContactId;
    });
  });
}

function getFulfillmentProgressPercent() {
  const bundles = getBundles();
  if (!bundles || bundles.length === 0) return 10;

  let totalRequired = 0;
  let totalAdded = 0;
  let totalReady = 0;

  bundles.forEach((b) => {
    const qty = Math.max(0, Number(b.qty) || 0);
    if (qty === 0) return;
    totalRequired += qty;
    const bv = ffVehicles[b.id] || [];
    totalAdded += Math.min(bv.length, qty);
    const readyCount = bv.filter((v) => isVehicleReadyForBundle(v, b)).length;
    totalReady += Math.min(readyCount, qty);
  });

  if (totalRequired === 0) return 10;
  if (isFulfillmentComplete()) return 100;

  // Weighted progress: adding vehicles moves progress, fully configured vehicles move it faster.
  const weightedRatio = ((totalAdded * 0.55) + (totalReady * 0.45)) / totalRequired;
  const pct = Math.round(weightedRatio * 100);
  return Math.max(10, Math.min(99, pct));
}

function hasAnyFulfillmentVehicle() {
  const bundles = getBundles();
  if (!bundles || bundles.length === 0) return false;
  return bundles.some((b) => {
    const bv = ffVehicles[b.id] || [];
    return bv.length > 0;
  });
}

function updateDealResultFulfillmentCta() {
  const primaryBtn = document.getElementById('deal-result-primary-btn');
  const badge = document.getElementById('deal-result-ff-badge');
  const pct = getFulfillmentProgressPercent();
  const submitted = proposalData.fulfillmentSubmitted;

  if (primaryBtn) {
    if (submitted) {
      primaryBtn.textContent = 'View fulfillment summary';
    } else {
      primaryBtn.textContent = `Continue fulfillment process (${pct}%)`;
    }
  }

  if (badge) {
    if (submitted) {
      badge.textContent = 'Fulfillment submitted';
      badge.style.background = '#dcfce7';
      badge.style.color = 'var(--green)';
      badge.style.borderColor = '#86efac';
    } else if (pct >= 100) {
      badge.textContent = 'Fulfillment complete';
      badge.style.background = '#dcfce7';
      badge.style.color = 'var(--green)';
      badge.style.borderColor = '#86efac';
    } else if (hasAnyFulfillmentVehicle()) {
      badge.textContent = `Fulfillment in progress (${pct}%)`;
      badge.style.background = '#fffbeb';
      badge.style.color = '#92400e';
      badge.style.borderColor = '#fcd34d';
    } else {
      badge.textContent = 'Fulfillment not started';
      badge.style.background = 'var(--gray-100)';
      badge.style.color = 'var(--gray-600)';
      badge.style.borderColor = 'var(--gray-300)';
    }
  }
}

function updateFulfillmentBtn() {
  const btn = document.querySelector('.sp-fulfillment-btn');
  const progress = getFulfillmentProgressPercent();
  const hasVehicles = hasAnyFulfillmentVehicle();

  if (btn) {
    if (progress >= 100) {
      btn.className = 'sp-fulfillment-btn ready';
    } else {
      btn.className = 'sp-fulfillment-btn';
    }
    btn.textContent = hasVehicles
      ? `Continue fulfillment process (${progress}%)`
      : 'Configure fulfillment';
  }

  updateDealResultFulfillmentCta();
}

function updateContractSubState() {
  updateContractSimulationMenuVisibility();
  const statusText = document.getElementById('sp-status-text');
  const dot2 = document.getElementById('c-dot-2');
  const line2 = document.getElementById('c-line-2');
  const dot3 = document.getElementById('c-dot-3');
  const date2 = document.getElementById('contract-date-2');
  const markSignedBtn = document.getElementById('sp-mark-signed-btn');

  if (contractSubState === 'waiting') {
    showSuccessBanner('Contract sent', 'The DocuSign link has been sent to the client for digital signature.');
    if (statusText) statusText.textContent = 'Awaiting customer signature — confirm with the customer and click "Mark as signed" once completed.';
    if (markSignedBtn) markSignedBtn.style.display = '';

  } else if (contractSubState === 'signed') {
    clearSignatureCompletionSimulation();
    if (markSignedBtn) markSignedBtn.style.display = 'none';
    showSuccessBanner('Contract signed', 'The customer has successfully signed. They will now be redirected to the payment setup portal.');
    if (statusText) statusText.textContent = 'Contact the customer to finalize their payment setup.';
    if (date2) date2.textContent = new Date().toLocaleDateString();

  } else if (contractSubState === 'payment') {
    clearSignatureCompletionSimulation();
    touchNavDate('contract');
    touchNavDate('contract_sign_pay');
    touchNavDate('payment');
    showSuccessBanner('Payment method configured.', '');
    logProposalEvent('Payment setup configured', 'Payment setup was completed.');
    if (statusText) statusText.textContent = 'Signature and payment setup configured.';
    if (dot2) dot2.className = 'c-step-dot done';
    if (line2) line2.className = 'c-line done';
    if (dot3) dot3.className = 'c-step-dot active';
    if (date2) date2.textContent = new Date().toLocaleDateString();

    // Auto-navigate to Deal Result after 4 seconds
    setTimeout(() => enterDealResult(), 4000);
  }

  updateFulfillmentBtn();
}

function resendContractLink() {
  logProposalEvent('Contract re-sent', 'The contract e-sign link was re-sent to the customer.');
  showSuccessBanner('Contract re-sent', 'A new e-sign link was sent to the customer.');
}

function enterDealResult(mode = 'won') {
  clearSignatureCompletionSimulation();
  // Hide all main screens, show deal result
  document.getElementById('screen-drafting').classList.add('hidden');
  hideProposalReviewModal();
  document.getElementById('screen-proposal-selection').classList.add('hidden');
  document.getElementById('screen-contract').classList.add('hidden');
  document.getElementById('screen-deal-result').classList.remove('hidden');
  dismissSuccessBanner();

  // Update main stepper — both steps done
  const dot1 = document.getElementById('step-dot-1');
  const dot2m = document.getElementById('step-dot-2');
  if (dot1) { dot1.className = 'vc-step-dot done'; dot1.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">check</span>'; }
  if (dot2m) { dot2m.className = 'vc-step-dot done'; dot2m.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">check</span>'; }

  // Set deal result dates
  const today = new Date().toLocaleDateString();
  const d1 = document.getElementById('deal-date-1');
  const d2 = document.getElementById('deal-date-2');
  const d3 = document.getElementById('deal-date-3');
  if (d1) d1.textContent = today;
  if (d2) d2.textContent = today;
  if (d3) d3.textContent = today;

  // Footer — hide send, hide back
  document.getElementById('footer-send').classList.add('hidden');
  document.getElementById('footer-back').classList.remove('visible');
  document.getElementById('footer-back').style.display = 'none';

  touchNavDate('result', true);
  const iconWrap = document.getElementById('deal-result-icon');
  const title = document.getElementById('deal-result-title');
  const subtitle = document.getElementById('deal-result-subtitle');
  const primaryBtn = document.getElementById('deal-result-primary-btn');
  const subStepper = document.getElementById('deal-result-substepper');
  const closeRow = document.getElementById('deal-result-close-row');
  if (subStepper) subStepper.style.display = 'none';

  if (iconWrap && title && subtitle && primaryBtn) {
    if (mode === 'rejected') {
      if (closeRow) closeRow.style.display = 'none';
      iconWrap.innerHTML = `<svg width="52" height="56" viewBox="0 0 52 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="2" width="36" height="46" rx="3" stroke="#000" stroke-width="2"/>
        <line x1="12" y1="16" x2="32" y2="16" stroke="#000" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="24" x2="32" y2="24" stroke="#000" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="32" x2="22" y2="32" stroke="#000" stroke-width="2" stroke-linecap="round"/>
        <circle cx="38" cy="44" r="11" fill="#000"/>
        <path d="M33.5 39.5L42.5 48.5M42.5 39.5L33.5 48.5" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
      title.innerHTML = 'Deal marked as closed-lost';
      subtitle.innerHTML = 'The quoting session has been closed based on the selected rejection reason.';
      primaryBtn.textContent = 'Start a new proposal';
      primaryBtn.onclick = () => closeDealResult();
    } else {
      if (closeRow) closeRow.style.display = 'flex';
      iconWrap.innerHTML = `<svg width="52" height="56" viewBox="0 0 52 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="2" width="36" height="46" rx="3" stroke="#000" stroke-width="2"/>
        <line x1="12" y1="16" x2="32" y2="16" stroke="#000" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="24" x2="32" y2="24" stroke="#000" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="32" x2="22" y2="32" stroke="#000" stroke-width="2" stroke-linecap="round"/>
        <circle cx="38" cy="44" r="11" fill="#000"/>
        <path d="M33 44l3.5 3.5L43 40.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
      title.innerHTML = 'Contract signed and payment<br>configured';
      subtitle.innerHTML = 'The contract is fully executed and the payment method has been set up.<br>Ready for hardware fulfillment.';
      primaryBtn.textContent = `Continue fulfillment process (${getFulfillmentProgressPercent()}%)`;
      primaryBtn.onclick = () => openFulfillmentModal();
    }
  }
  screen = 'deal-result';
  renderNav();
}

function closeDealResult() {
  document.getElementById('more-menu-deal-result')?.classList.add('hidden');
  // Return to drafting and restore full drafting UI state
  proposalWasSentToCustomer = false;
  screen = 'drafting';
  document.getElementById('screen-proposal-selection')?.classList.add('hidden');
  hideProposalReviewModal();
  document.getElementById('screen-contract')?.classList.add('hidden');
  document.getElementById('screen-deal-result').classList.add('hidden');
  document.getElementById('screen-drafting').classList.remove('hidden');
  document.getElementById('vc-body').style.paddingTop = '159px';
  document.getElementById('success-banner').style.top = '159px';

  const sendBtn = document.getElementById('footer-send');
  sendBtn.classList.add('hidden');
  sendBtn.textContent = 'Send Proposal';
  sendBtn.onclick = handleSend;
  updateSendBtn();

  const back = document.getElementById('footer-back');
  back.style.display = '';
  back.classList.remove('visible');

  renderOptions();
  const hasOptions = Array.isArray(options) && options.length > 0;
  document.getElementById('empty-state')?.classList.toggle('hidden', hasOptions);
  document.getElementById('options-grid')?.classList.toggle('hidden', !hasOptions);
  updateMarkDeadBtn();
  renderNav();
}

function viewSignedContract() {
  document.getElementById('more-menu-deal-result')?.classList.add('hidden');
  // Go back to contract screen in read-only mode
  document.getElementById('screen-deal-result').classList.add('hidden');
  document.getElementById('screen-contract').classList.remove('hidden');
  document.getElementById('footer-back').classList.add('visible');
  screen = 'contract-review';
}

function simulateContractSigned() {
  if (contractSubState !== 'waiting') return;
  clearSignatureCompletionSimulation();
  document.getElementById('more-menu-contract')?.classList.add('hidden');
  document.getElementById('more-menu-contract2')?.classList.add('hidden');
  startSignatureCompletedModalCountdown();
}
function simulatePaymentSetup() {
  if (contractSubState !== 'signed' && contractSubState !== 'waiting') return;
  clearSignatureCompletionSimulation();
  contractSubState = 'payment';
  document.getElementById('more-menu-contract')?.classList.add('hidden');
  document.getElementById('more-menu-contract2')?.classList.add('hidden');
  updateContractSubState();
  renderNav();
}

function openContractModifyConfirmModal() {
  document.getElementById('more-menu-contract')?.classList.add('hidden');
  document.getElementById('more-menu-contract2')?.classList.add('hidden');
  const t = document.getElementById('contract-modify-title');
  const b = document.getElementById('contract-modify-body');
  const p = document.getElementById('contract-modify-proceed-btn');
  if (t) t.textContent = 'Modify proposal?';
  if (b) b.textContent = 'If you modify the proposal, you will return to the Proposal section and the current contract progress will be discarded. Are you sure you want to proceed?';
  if (p) p.textContent = 'Proceed';
  contractConfirmProceedAction = 'modify-proposal';
  document.getElementById('contract-modify-overlay')?.classList.add('open');
}

function closeContractModifyConfirmModal() {
  contractConfirmProceedAction = null;
  document.getElementById('contract-modify-overlay')?.classList.remove('open');
}

function proceedContractModifyFromContract() {
  if (contractConfirmProceedAction === 'view-contract') {
    closeContractModifyConfirmModal();
    viewSignedContract();
    return;
  }
  closeContractModifyConfirmModal();
  clearSignatureCompletionSimulation();
  contractSubState = 'pre-send';
  logProposalEvent('Contract returned to drafting', 'Contract flow was sent back to Drafting.');
  selectionMenuEditProposal();
}

function openDealResultViewContractConfirmModal() {
  document.getElementById('more-menu-deal-result')?.classList.add('hidden');
  const t = document.getElementById('contract-modify-title');
  const b = document.getElementById('contract-modify-body');
  const p = document.getElementById('contract-modify-proceed-btn');
  if (t) t.textContent = 'Open contract?';
  if (b) b.textContent = 'You are about to open the signed contract view from Deal result. Are you sure you want to proceed?';
  if (p) p.textContent = 'Proceed';
  contractConfirmProceedAction = 'view-contract';
  document.getElementById('contract-modify-overlay')?.classList.add('open');
}

function toggleDealResultMenu(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const m = document.getElementById('more-menu-deal-result');
  if (!m) return;
  const shouldOpen = m.classList.contains('hidden');
  m.classList.toggle('hidden', !shouldOpen);
}

function updateContractSimulationMenuVisibility() {
  const showContractSigned = contractSubState === 'waiting';
  const showPaymentSetup = contractSubState === 'signed';
  const hasAnyAction = showContractSigned || showPaymentSetup;

  ['contract', 'contract2'].forEach((suffix) => {
    document.getElementById(`sim-title-${suffix}`)?.classList.toggle('hidden', !hasAnyAction);
    document.getElementById(`sim-contract-signed-${suffix}`)?.classList.toggle('hidden', !showContractSigned);
    document.getElementById(`sim-payment-setup-${suffix}`)?.classList.toggle('hidden', !showPaymentSetup);
  });
}

function toggleContractMenu2(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  updateContractSimulationMenuVisibility();
  const m1 = document.getElementById('more-menu-contract');
  const m2 = document.getElementById('more-menu-contract2');
  if (!m2) return;
  m1?.classList.add('hidden');
  const shouldOpen = m2.classList.contains('hidden');
  m2.classList.toggle('hidden', !shouldOpen);
}

function toggleContractMenu(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  updateContractSimulationMenuVisibility();
  const m1 = document.getElementById('more-menu-contract');
  const m2 = document.getElementById('more-menu-contract2');
  if (!m1) return;
  m2?.classList.add('hidden');
  const shouldOpen = m1.classList.contains('hidden');
  m1.classList.toggle('hidden', !shouldOpen);
}

document.addEventListener('click', (event) => {
  const target = event.target;

  const clickedDraftMore = target.closest('#draft-more-wrap');
  if (!clickedDraftMore) {
    document.getElementById('more-menu-draft')?.classList.add('hidden');
    document.getElementById('draft-more-btn')?.setAttribute('aria-expanded', 'false');
  }

  const clickedReviewMore = target.closest('#proposal-review-overlay .selection-more-wrap');
  if (!clickedReviewMore) {
    document.getElementById('more-menu-review')?.classList.add('hidden');
  }

  const clickedSelectionMore = target.closest('#screen-proposal-selection .selection-more-wrap');
  if (!clickedSelectionMore) {
    document.getElementById('more-menu-selection')?.classList.add('hidden');
    document.querySelector('#screen-proposal-selection .btn-more-dots')?.setAttribute('aria-expanded', 'false');
  }

  const clickedMaterialsDropdown = target.closest('#materials-btn, #materials-menu');
  if (!clickedMaterialsDropdown) {
    document.getElementById('materials-menu')?.classList.add('hidden');
  }

  document.getElementById('more-menu-contract')?.classList.add('hidden');
  document.getElementById('more-menu-contract2')?.classList.add('hidden');
  document.getElementById('more-menu-deal-result')?.classList.add('hidden');

  const clickedBundlePromo = target.closest('#bundle-promo-btn, #bundle-promo-dropdown');
  if (!clickedBundlePromo) {
    document.getElementById('bundle-promo-dropdown')?.classList.add('hidden');
  }
  const clickedCoreDropdown = target.closest('#core-btn, #core-dropdown');
  if (!clickedCoreDropdown) {
    document.getElementById('core-dropdown')?.classList.add('hidden');
  }
  if (!target.closest('[id^="opt-term-dd-"]') && !target.closest('[onclick*="toggleOptTermDropdown"]')) {
    document.querySelectorAll('[id^="opt-term-dd-"]').forEach(el => el.classList.add('hidden'));
  }
  if (!target.closest('[id^="opt-tier-dd-"]') && !target.closest('[onclick*="toggleOptTierDropdown"]')) {
    document.querySelectorAll('[id^="opt-tier-dd-"]').forEach(el => el.classList.add('hidden'));
  }
  if (!target.closest('[id^="opt-promo-dd-"]') && !target.closest('[onclick*="toggleOptPromoDropdown"]')) {
    document.querySelectorAll('[id^="opt-promo-dd-"]').forEach(el => el.classList.add('hidden'));
  }
});

  function renderContractDoc(opt) {
  const optTierDoc = (opt.forcedTierIndex !== undefined) ? opt.forcedTierIndex : -1;
  const optionPromoType = getOptionPromotion(opt);
  const { totalMonthly, totalUnits } = calcOption(opt, optionPromoType, optTierDoc);
  const dateStr = formatUsDate(new Date());
  const expirationDate = getSelectedExpirationDate();
  const expirationStr = formatExpirationDisplayDate(expirationDate);

  const rowsHtml = opt.bundles.map(b => {
    const bundlePromo = b.promoType || optionPromoType;
    const { unitPrice, monthly } = calcBundle(b, opt.term, bundlePromo, optTierDoc, totalUnits);
    return `
      <tr>
        <td style="padding:14px 16px; border-bottom:1px solid #f0f0f0; font-size:13px; color:#1a1a1a;">${b.coreName}</td>
        <td style="padding:14px 16px; border-bottom:1px solid #f0f0f0; font-size:13px; color:#1a1a1a;">${b.qty}</td>
        <td style="padding:14px 16px; border-bottom:1px solid #f0f0f0; font-size:13px; color:#1a1a1a;">${formatMoney(unitPrice)}</td>
        <td style="padding:14px 16px; border-bottom:1px solid #f0f0f0; font-size:13px; font-weight:700; color:#1a1a1a;">${formatMoney(monthly)}</td>
      </tr>
    `;
  }).join('');

  const promoHtml = optionPromoType && optionPromoType !== 'None'
    ? `<div style="display:flex; align-items:center; gap:8px; background:#F0FDF4; border:1px solid #BBF7D0; border-radius:8px; padding:14px 16px;">
        <span class="material-symbols-outlined" style="color:#059669; font-size:20px; flex-shrink:0;">sell</span>
        <div>
          <div style="font-size:10px; color:#059669; font-weight:700; letter-spacing:0.02em;">Promo applied</div>
          <div style="font-size:13px; font-weight:700; color:#065F46;">${optionPromoType} Promotion</div>
        </div>
      </div>`
    : '';

  document.getElementById('contract-doc-viewer').innerHTML = `
    <div class="doc-page-outer">
    <div class="vc-doc-shell">
      <div class="vc-doc-brand-line"></div>
      <div class="vc-doc-inner">

        <\!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px;">
          <img src="https://raw.githubusercontent.com/catalinaypun/valu-cal-app/393563638315e21a9ce0a395f797c851de8be70d/resources/verizon-connect-logo.svg" alt="Verizon Connect" style="height:28px; display:block;">
          <div style="text-align:right; font-size:11px; color:#7a7a7a; line-height:1.6;">
            <div style="font-size:13px; font-weight:700; color:#1a1a1a;">Apex Construction LLC</div>
            123 Industrial Pkwy, Tampa FL 33602<br>
            Date: ${dateStr}
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1.15fr 0.85fr; border-top:1px solid #efefef; border-bottom:1px solid #efefef; overflow:hidden; margin:0 -24px 18px;">
          <div style="background:#111; color:#fff; padding:22px 20px;">
            <div style="font-size:30px; line-height:1.06; font-weight:400; margin-bottom:10px;">Contract built for fast, confident execution</div>
            <div style="font-size:16px; line-height:1.35; color:rgba(255,255,255,0.92);">Clear terms, streamlined signature, and a smooth path from agreement to deployment.</div>
            <div style="margin-top:12px; font-size:12px; color:rgba(255,255,255,0.9);">Ref: CPQ-8492-A</div>
            <div style="margin-top:8px;">
              <span style="display:inline-flex; align-items:center; background:#EE001E; color:#fff; border-radius:999px; padding:4px 10px; font-size:12px; font-weight:700;">Expiration: ${expirationStr}</span>
            </div>
          </div>
          <div style="background:#D1D5DB url('https://images.contentstack.io/v3/assets/blt0371ecb1478c7909/blt65a932e3237c46d9/688161b889e3963781bad1ea/vzc-monarch-DOT-desktop-us.webp?auto=webp?w=1920&height=undefined,&q=75&auto=webp') center center / cover no-repeat; display:flex; align-items:flex-end; padding:14px;">
            <div style="font-size:11px; color:#fff; font-weight:600; letter-spacing:0.02em; background:rgba(0,0,0,0.5); border-radius:999px; padding:4px 10px;">Contract package overview</div>
          </div>
        </div>

        <div style="font-size:10px; letter-spacing:0.04em; color:#ee001e; font-weight:700; margin-bottom:6px;">Solution brief</div>
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:4px;">
          <div style="font-size:28px; font-weight:900; color:#1a1a1a; line-height:1.1;">${proposalData.isAddOn ? 'Service Order' : 'Purchase Agreement'}</div>
          ${proposalData.isAddOn ? `<span style="display:inline-flex;align-items:center;gap:5px;background:#EFF6FF;border:1px solid #BFDBFE;color:#1D4ED8;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;"><span class="material-symbols-outlined" style="font-size:13px;">handshake</span>Add-on · ${proposalData.msaId}</span>` : ''}
        </div>
        <div style="margin-bottom:28px;"></div>
        <div style="height:1px; background:#efefef; margin-bottom:28px;"></div>

        <\!-- Agreement terms cards -->
        <div style="font-size:12px; font-weight:800; letter-spacing:0.02em; color:#1a1a1a; margin-bottom:14px;">Agreement terms</div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:28px;">
          <div style="border:1px solid #efefef; border-radius:8px; padding:14px 16px;">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
              <span class="material-symbols-outlined" style="color:#ee001e; font-size:18px;">calendar_month</span>
              <span style="font-size:10px; color:#7a7a7a; font-weight:600; letter-spacing:0.02em;">Contract length</span>
            </div>
            <div style="font-size:20px; font-weight:900; color:#1a1a1a;">${opt.term} <span style="font-size:13px; font-weight:400; color:#545454;">months</span></div>
          </div>
          <div style="border:1px solid #efefef; border-radius:8px; padding:14px 16px;">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
              <span class="material-symbols-outlined" style="color:#ee001e; font-size:18px;">receipt_long</span>
              <span style="font-size:10px; color:#7a7a7a; font-weight:600; letter-spacing:0.02em;">Billing cycle</span>
            </div>
            <div style="font-size:20px; font-weight:900; color:#1a1a1a;">Monthly</div>
          </div>
          <div style="border:1px solid #efefef; border-radius:8px; padding:14px 16px;">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px;">
              <span class="material-symbols-outlined" style="color:#ee001e; font-size:18px;">location_on</span>
              <span style="font-size:10px; color:#7a7a7a; font-weight:600; letter-spacing:0.02em;">Total units</span>
            </div>
            <div style="font-size:20px; font-weight:900; color:#1a1a1a;">${totalUnits} <span style="font-size:13px; font-weight:400; color:#545454;">vehicles</span></div>
          </div>
        </div>

        ${promoHtml ? promoHtml + '<div style="height:1px; background:#efefef; margin:24px 0;"></div>' : '<div style="height:1px; background:#efefef; margin:24px 0;"></div>'}

        <\!-- Hardware table -->
        <div style="font-size:12px; font-weight:800; letter-spacing:0.02em; color:#1a1a1a; margin-bottom:14px;">Hardware &amp; services</div>
        <table style="width:100%; border-collapse:collapse; border:1px solid #efefef; border-radius:8px; overflow:hidden; font-family:inherit;">
          <thead>
            <tr style="background:#fafafa;">
              <th style="text-align:left; padding:10px 16px; font-size:10px; font-weight:700; letter-spacing:0.02em; color:#7a7a7a; border-bottom:1px solid #efefef;">Description</th>
              <th style="text-align:left; padding:10px 16px; font-size:10px; font-weight:700; letter-spacing:0.02em; color:#7a7a7a; border-bottom:1px solid #efefef;">Qty</th>
              <th style="text-align:left; padding:10px 16px; font-size:10px; font-weight:700; letter-spacing:0.02em; color:#7a7a7a; border-bottom:1px solid #efefef;">Unit / mo</th>
              <th style="text-align:left; padding:10px 16px; font-size:10px; font-weight:700; letter-spacing:0.02em; color:#7a7a7a; border-bottom:1px solid #efefef;">Total / mo</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <\!-- What's included -->
        <div style="height:1px; background:#efefef; margin:28px 0;"></div>
        <div style="font-size:12px; font-weight:800; letter-spacing:0.02em; color:#1a1a1a; margin-bottom:14px;">What's included</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:28px;">
          ${[
            ['rocket_launch',   'Professional installation'],
            ['headset_mic',     '24/7 customer support'],
            ['phone_iphone',    'Web &amp; mobile platform access'],
            ['update',          'Automatic software updates'],
            ['assignment_turned_in', 'Onboarding &amp; training'],
            ['verified_user',   'Waived hardware &amp; activation fee'],
          ].map(([icon, label]) => `
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="material-symbols-outlined" style="color:#ee001e; font-size:18px; flex-shrink:0;">${icon}</span>
              <span style="font-size:13px; color:#1a1a1a;">${label}</span>
            </div>
          `).join('')}
        </div>

        ${buildWaveInstallScheduleHtml(opt)}

        ${(function() {
          const seg = proposalData.segment || 'SMB';
          if (seg === 'SMB') return '';
          const rows = [];
          if (proposalData.poNumber) rows.push(['Purchase Order #', proposalData.poNumber]);
          if (seg === 'Enterprise' && proposalData.costCenter) rows.push(['Cost center / GL', proposalData.costCenter]);
          if (seg === 'Government') {
            if (proposalData.contractVehicle) rows.push(['Contract vehicle', proposalData.contractVehicle]);
            if (proposalData.contractingOfficerName) rows.push(['Contracting Officer', proposalData.contractingOfficerName]);
            if (proposalData.contractingOfficerEmail) rows.push(['CO email', proposalData.contractingOfficerEmail]);
            if (proposalData.contractingOfficerPhone) rows.push(['CO phone', proposalData.contractingOfficerPhone]);
          }
          if (!rows.length) return '';
          const segColor = seg === 'Government' ? '#166534' : '#1D4ED8';
          const segBg    = seg === 'Government' ? '#F0FDF4' : '#EFF6FF';
          const segBdr   = seg === 'Government' ? '#BBF7D0' : '#BFDBFE';
          const rowsHtml = rows.map(([k,v]) => `
            <tr>
              <td style="padding:9px 14px;font-size:11px;font-weight:700;color:#7a7a7a;border-bottom:1px solid #f0f0f0;width:40%;">${k}</td>
              <td style="padding:9px 14px;font-size:13px;color:#1a1a1a;border-bottom:1px solid #f0f0f0;">${v.replace(/</g,'&lt;')}</td>
            </tr>`).join('');
          return `
          <div style="height:1px; background:#efefef; margin:28px 0;"></div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
            <div style="font-size:12px; font-weight:800; letter-spacing:0.02em; color:#1a1a1a;">${seg} deal information</div>
            <span style="display:inline-flex;align-items:center;border-radius:999px;padding:2px 10px;font-size:10px;font-weight:700;border:1.5px solid ${segBdr};background:${segBg};color:${segColor};">${seg}</span>
          </div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #efefef;border-radius:8px;overflow:hidden;">
            <tbody>${rowsHtml}</tbody>
          </table>`;
        })()}

        <!-- Total -->
        <div style="background:#1a1a1a; border-radius:8px; padding:20px 24px; display:flex; justify-content:space-between; align-items:center;">
          <div style="color:#fff; font-size:13px; font-weight:400; opacity:0.7;">Total monthly investment</div>
          <div style="color:#fff; font-size:28px; font-weight:900; letter-spacing:-0.02em;">${formatMoney(totalMonthly)}<span style="font-size:14px; font-weight:400; opacity:0.7;">/mo</span></div>
        </div>

        <\!-- Signature block -->
        <div style="margin-top:32px; padding-top:24px; border-top:1px solid #efefef;">
          <div style="font-size:12px; font-weight:800; letter-spacing:0.02em; color:#1a1a1a; margin-bottom:18px;">Signatures</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:32px;">
            <div>
              <div style="height:1px; background:#1a1a1a; margin-bottom:8px;"></div>
              <div style="font-size:11px; color:#7a7a7a;">Customer signature &amp; date</div>
            </div>
            <div>
              <div style="height:1px; background:#1a1a1a; margin-bottom:8px;"></div>
              <div style="font-size:11px; color:#7a7a7a;">Verizon Connect representative &amp; date</div>
            </div>
          </div>
        </div>

        <div style="margin-top:28px; font-size:11px; color:#aaa; line-height:1.6; border-top:1px solid #f4f4f4; padding-top:16px;">
          This agreement is subject to Verizon Connect Terms of Service. Pricing is valid until ${expirationStr}.
        </div>

      </div>
    </div>
    </div>
  `;
  requestAnimationFrame(scaleDocPages);
  
  fillContractMessageDefaults(opt, totalMonthly);
}

function fillContractMessageDefaults(opt, totalMonthly) {
  const optionId = opt?.id;
  const optionNumber = Math.max(1, options.findIndex((o) => o.id === optionId) + 1);
  const term = Number(opt?.term) || 36;
  const monthly = typeof totalMonthly === 'number' ? totalMonthly : 0;
  const expirationStr = formatExpirationDisplayDate(getSelectedExpirationDate());

  const msgTo = document.getElementById('contract-msg-to');
  if (msgTo) {
    msgTo.value = proposalWasSentToCustomer ? 'acme.logistics@acmecorp.com' : 'laura.mendez@acmelogistics.com';
  }

  const msgSub = document.getElementById('contract-msg-subject');
  if (msgSub) {
    msgSub.value = `Contract package ready - Option ${optionNumber}`;
  }

  const msgBody = document.getElementById('contract-msg-body');
  if (msgBody) {
    msgBody.value = `Hi Laura,

Great news — we prepared your contract package based on Option ${optionNumber}.

Contract summary:
- Term: ${term} months
- Estimated monthly investment: ${formatMoney(monthly)}
- Total units: ${totalUnitsForOption(opt)}

Please review the attached agreement and use the e-sign link to proceed.

Contract access is available until ${expirationStr}.

If you have any questions before signing, I can help right away.

Best regards,
ValuCal Sales Team`;
    updateContractCharCount(msgBody);
  }

  updateContractSendBtn();
}

function totalUnitsForOption(opt) {
  if (!opt || !Array.isArray(opt.bundles)) return 0;
  return opt.bundles.reduce((sum, b) => sum + (Number(b.qty) || 0), 0);
}

function escapeForInlineScript(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/<\/script>/gi, '<\\/script>')
    .replace(/\$\{/g, '\\${');
}

let pdfViewerActiveFilename = 'document.pdf';

function closePdfViewerModal() {
  const overlay = document.getElementById('pdf-viewer-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function openPdfViewerModal({ title, sourceHtml, filename }) {
  if (!sourceHtml || !sourceHtml.trim()) return;
  const overlay = document.getElementById('pdf-viewer-overlay');
  const titleEl = document.getElementById('pdf-viewer-title');
  const contentEl = document.getElementById('pdf-viewer-content');
  if (!overlay || !titleEl || !contentEl) return;
  titleEl.textContent = title || 'Document preview';
  contentEl.innerHTML = sourceHtml;
  pdfViewerActiveFilename = filename || 'document.pdf';
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

async function ensureHtml2PdfLoaded() {
  if (window.html2pdf) return true;
  const existing = document.getElementById('html2pdf-lib');
  if (existing) {
    await new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('load failed')), { once: true });
    });
    return !!window.html2pdf;
  }
  const script = document.createElement('script');
  script.id = 'html2pdf-lib';
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  document.head.appendChild(script);
  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });
  return !!window.html2pdf;
}

async function downloadPdfFromModal() {
  const content = document.getElementById('pdf-viewer-content');
  const btn = document.getElementById('pdf-viewer-download-btn');
  if (!content || !btn) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Preparing...';
  try {
    const ready = await ensureHtml2PdfLoaded();
    if (!ready || !window.html2pdf) return;
    await window.html2pdf()
      .set({
        margin: 10,
        filename: pdfViewerActiveFilename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      })
      .from(content)
      .save();
  } catch (err) {
    console.error('PDF generation failed', err);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function printPdfFromModal() {
  const content = document.getElementById('pdf-viewer-content');
  if (!content) return;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Print preview</title><link rel="stylesheet" href="styles.css"></head><body><div class="doc-viewer">${content.innerHTML}</div></body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 150);
}

function openProposalPdfTab() {
  const source = document.getElementById('prop-doc-viewer')?.innerHTML || '';
  openPdfViewerModal({
    title: 'Proposal preview',
    sourceHtml: source,
    filename: 'Fleet_Solutions_Proposal.pdf',
  });
}

function openContractPdfTab() {
  const source =
    document.getElementById('contract-doc-viewer')?.innerHTML ||
    document.getElementById('contract-doc-viewer2')?.innerHTML ||
    '';
  openPdfViewerModal({
    title: 'Purchase Agreement',
    sourceHtml: source,
    filename: 'Purchase_Agreement.pdf',
  });
}

function updateContractSendBtn() {
  const to = document.getElementById('contract-msg-to')?.value.trim();
  const sub = document.getElementById('contract-msg-subject')?.value.trim();
  const body = document.getElementById('contract-msg-body')?.value.trim();
  const btn = document.getElementById('contract-send-btn');
  if (btn && screen === 'contract-review') btn.disabled = !(to && sub && body);
}

let proposalReviewPreviewOnly = false;
let proposalReviewLayoutTimer = null;

function setProposalReviewLayout(previewOnly) {
  const nextPreviewOnly = !!previewOnly;
  const modalEl = document.querySelector('#proposal-review-overlay .proposal-review-modal');
  const btn = document.getElementById('proposal-layout-toggle-btn');
  const icon = document.getElementById('proposal-layout-toggle-icon');
  if (proposalReviewLayoutTimer) {
    clearTimeout(proposalReviewLayoutTimer);
    proposalReviewLayoutTimer = null;
  }
  if (modalEl) {
    if (nextPreviewOnly) {
      // First fade/slide out message pane, then switch layout.
      modalEl.classList.remove('is-preview-revealing');
      modalEl.classList.add('is-preview-hiding');
      proposalReviewLayoutTimer = setTimeout(() => {
        modalEl.classList.remove('is-preview-hiding');
        modalEl.classList.add('is-preview-focus');
        proposalReviewLayoutTimer = null;
      }, 200);
    } else {
      // Restore layout first, then animate message pane appearance.
      modalEl.classList.remove('is-preview-focus', 'is-preview-hiding');
      modalEl.classList.add('is-preview-revealing');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          modalEl.classList.remove('is-preview-revealing');
        });
      });
    }
  }
  proposalReviewPreviewOnly = nextPreviewOnly;
  if (icon) icon.textContent = proposalReviewPreviewOnly ? 'close_fullscreen' : 'open_in_full';
  if (btn) {
    const label = proposalReviewPreviewOnly ? 'Show message panel' : 'Expand proposal view';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }
}

function toggleProposalMessagePane() {
  setProposalReviewLayout(!proposalReviewPreviewOnly);
}

function handleProposalReviewModalClick(event) {
  const clickedMaterialsDropdown = event.target.closest('#materials-btn, #materials-menu');
  if (!clickedMaterialsDropdown) {
    document.getElementById('materials-menu')?.classList.add('hidden');
  }
}

function showProposalReviewModal() {
  if (proposalReviewLayoutTimer) {
    clearTimeout(proposalReviewLayoutTimer);
    proposalReviewLayoutTimer = null;
  }
  // Initialize expiration date (today + 14 days) if not already set
  syncExpirationInputs(getSelectedExpirationDate());
  // Initialize close date to last day of current month if not already set
  const closeDateInput = document.getElementById('proposal-close-date');
  if (closeDateInput && !closeDateInput.value) {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    closeDateInput.value = lastDay.toISOString().split('T')[0];
  }
  setProposalReviewLayout(false);
  document.getElementById('proposal-review-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  initRoiConfigPanel();
}

function hideProposalReviewModal() {
  document.getElementById('proposal-review-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
  // Reset autofill flag so re-opening regenerates the body from current option data
  const bodyEl = document.getElementById('prop-msg-body');
  if (bodyEl) bodyEl.dataset.autofilled = '';
}

function closeProposalReviewModal() {
  if (screen === 'review') {
    screen = 'drafting';
    renderNav();
  }
  document.getElementById('screen-drafting')?.classList.remove('hidden');
  document.getElementById('footer-back')?.classList.remove('visible');
  document.getElementById('footer-back')?.classList.add('hidden');
  document.getElementById('footer-send')?.classList.add('hidden');
  hideProposalReviewModal();
  updateSendBtn();
}

  function updateContractCharCount(el) {
  document.getElementById('contract-char-count').innerText = el.value.length + '/2000';
}

function deleteOption(id) {
  const optionNumber = options.findIndex((o) => o.id === id) + 1;
  options = options.filter(o => o.id !== id);
  if(options.length === 0) {
    document.getElementById('empty-state').classList.remove('hidden');
    document.getElementById('options-grid').classList.add('hidden');
  } else {
    renderOptions();
  }
  logProposalEvent('Option edited', `Option ${Math.max(1, optionNumber)} was removed.`);
}

// ══════════════════════════════════════════════════════════════
// WAVE PLAN MODULE (F3) — Pre-contract deployment wave planning
// ══════════════════════════════════════════════════════════════

const SLOT_STATUSES = ['Contracted', 'Dispatched', 'Pending Bind', 'Active-Billing', 'Suspended', 'Lapsed', 'Terminated'];

function getSlotStatusConfig(status) {
  const map = {
    'Contracted':     { label: 'Contracted',          cssClass: 'ss-contracted',     icon: 'contract',       color: '#1D4ED8' },
    'Dispatched':     { label: 'Dispatched',           cssClass: 'ss-dispatched',     icon: 'local_shipping', color: '#C2410C' },
    'Pending Bind':   { label: 'Pending Bind',         cssClass: 'ss-pending-bind',   icon: 'link',           color: '#92400E' },
    'Active-Billing': { label: 'Active \u00b7 Billing', cssClass: 'ss-active-billing', icon: 'check_circle',   color: '#166534' },
    'Suspended':      { label: 'Suspended',            cssClass: 'ss-suspended',      icon: 'pause_circle',   color: '#7E22CE' },
    'Lapsed':         { label: 'Lapsed',               cssClass: 'ss-lapsed',         icon: 'block',          color: '#6B7280' },
    'Terminated':     { label: 'Terminated',           cssClass: 'ss-terminated',     icon: 'cancel',         color: '#9CA3AF' },
  };
  return map[status] || map['Contracted'];
}

function toggleWavesEnabled() {
  proposalData.wavesEnabled = !proposalData.wavesEnabled;
  // Update menu item text to reflect state
  const menuBtn = document.getElementById('menu-wave-plan-draft');
  if (menuBtn) {
    menuBtn.textContent = proposalData.wavesEnabled
      ? '\u2714 Deployment waves (on)'
      : 'Deployment waves';
  }
  // Close the dropdown
  document.getElementById('more-menu-draft')?.classList.add('hidden');
  document.getElementById('draft-more-btn')?.setAttribute('aria-expanded', 'false');
  renderOptions();
  if (proposalData.wavesEnabled) {
    showSuccessBanner('Wave plan enabled', 'Add deployment waves to each option below. Waves will appear in the contract document.');
  }
}

function addOptWave(optId) {
  const opt = options.find(o => o.id === optId);
  if (!opt) return;
  if (!Array.isArray(opt.waves)) opt.waves = [];
  const n = opt.waves.length + 1;
  opt.waves.push({ id: Date.now(), name: 'Wave ' + n, targetDate: '', qty: 0, slotStatus: 'Contracted', appropsRef: '', appropsExpiry: '' });
  renderOptions();
}

function removeOptWave(optId, waveId) {
  const opt = options.find(o => o.id === optId);
  if (!opt || !Array.isArray(opt.waves)) return;
  opt.waves = opt.waves.filter(w => w.id !== waveId);
  renderOptions();
}

function updateOptWave(optId, waveId, field, val) {
  const opt = options.find(o => o.id === optId);
  if (!opt || !Array.isArray(opt.waves)) return;
  const wave = opt.waves.find(w => w.id === waveId);
  if (wave) wave[field] = val;
  // Re-render only the alloc badge without full render to avoid losing focus
  // For qty changes, do a targeted update of the badge
  const card = document.querySelector(`.option-card [data-wave-alloc="${optId}"]`);
  if (card && field === 'qty') {
    const optionPromoType = getOptionPromotion(opt);
    const { totalUnits } = calcOption(opt, optionPromoType, (opt.forcedTierIndex ?? -1));
    card.outerHTML = buildWaveAllocBadgeHtml(opt, totalUnits);
  }
}

const WAVE_ADVANCE_CHAIN = ['Contracted', 'Dispatched', 'Pending Bind', 'Active-Billing'];

function advanceOptWaveNext(optId, waveId) {
  const opt = options.find(o => o.id === optId);
  if (!opt || !Array.isArray(opt.waves)) return;
  const wave = opt.waves.find(w => w.id === waveId);
  if (!wave) return;
  const curIdx = WAVE_ADVANCE_CHAIN.indexOf(wave.slotStatus || 'Contracted');
  if (curIdx < 0 || curIdx >= WAVE_ADVANCE_CHAIN.length - 1) return; // already at end
  const nextStatus = WAVE_ADVANCE_CHAIN[curIdx + 1];
  wave.slotStatus = nextStatus;
  // In-place DOM update — no full re-render, preserves input focus
  const sc = getSlotStatusConfig(nextStatus);
  const chipEl = document.querySelector(`[data-wave-chip="${optId}-${waveId}"]`);
  const btnEl  = document.querySelector(`[data-wave-advance="${optId}-${waveId}"]`);
  if (chipEl) {
    chipEl.className = `ss-chip ${sc.cssClass}`;
    chipEl.innerHTML = `<span class="material-symbols-outlined">${sc.icon}</span>${sc.label}`;
  }
  if (btnEl) {
    const newIdx  = WAVE_ADVANCE_CHAIN.indexOf(nextStatus);
    const newNext = newIdx < WAVE_ADVANCE_CHAIN.length - 1 ? WAVE_ADVANCE_CHAIN[newIdx + 1] : null;
    if (newNext) {
      btnEl.innerHTML = `<span class="material-symbols-outlined" style="font-size:12px;">arrow_forward</span> ${newNext}`;
    } else {
      btnEl.outerHTML = `<span class="wave-advance-done"><span class="material-symbols-outlined" style="font-size:12px;">check_circle</span> Active</span>`;
    }
  }
}

function buildWaveAllocBadgeHtml(opt, totalUnits) {
  const waves = opt.waves || [];
  const allocated = waves.reduce((s, w) => s + (Number(w.qty) || 0), 0);
  const delta = totalUnits - allocated;
  if (waves.length === 0) return `<span data-wave-alloc="${opt.id}" style="font-size:10px;color:var(--gray-400)">No waves yet</span>`;
  if (delta === 0) return `<span data-wave-alloc="${opt.id}" class="wave-plan-alloc-badge wave-plan-alloc-ok">\u2713 ${allocated}\u202f/\u202f${totalUnits} allocated</span>`;
  if (delta > 0)  return `<span data-wave-alloc="${opt.id}" class="wave-plan-alloc-badge wave-plan-alloc-warn">${allocated}\u202f/\u202f${totalUnits} (\u2212${delta} unscheduled)</span>`;
  return `<span data-wave-alloc="${opt.id}" class="wave-plan-alloc-badge wave-plan-alloc-over">${allocated}\u202f/\u202f${totalUnits} (+${Math.abs(delta)} over)</span>`;
}

function buildOptWavesHtml(opt, totalUnits) {
  const waves = Array.isArray(opt.waves) ? opt.waves : [];
  const isGov = proposalData.segment === 'Government';

  const rowsHtml = waves.map(w => {
    const sc = getSlotStatusConfig(w.slotStatus || 'Contracted');
    const curAdvIdx  = WAVE_ADVANCE_CHAIN.indexOf(w.slotStatus || 'Contracted');
    const nextStatus = curAdvIdx >= 0 && curAdvIdx < WAVE_ADVANCE_CHAIN.length - 1
      ? WAVE_ADVANCE_CHAIN[curAdvIdx + 1] : null;
    const safeName = (w.name || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeAppRef = (w.appropsRef || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Appropriations expiry warning: if targetDate > appropsExpiry, flag it
    let appropWarn = '';
    if (isGov && w.appropsExpiry && w.targetDate && w.targetDate > w.appropsExpiry) {
      appropWarn = `<div class="approp-warn"><span class="material-symbols-outlined" style="font-size:11px;">warning</span>Wave date past approp. expiry</div>`;
    }
    const govCols = isGov ? `
        <td>
          <input class="wave-plan-name-input" type="text" value="${safeAppRef}" placeholder="FY26-OA-001"
            onchange="updateOptWave(${opt.id}, ${w.id}, 'appropsRef', this.value)" style="width:100px;">
          <input class="wave-plan-date-input" type="date" value="${w.appropsExpiry || ''}" style="margin-top:4px;"
            onchange="updateOptWave(${opt.id}, ${w.id}, 'appropsExpiry', this.value)" title="Appropriations expiry date">
          ${appropWarn}
        </td>` : '';
    return `<tr>
        <td><input class="wave-plan-name-input" type="text" value="${safeName}"
          onchange="updateOptWave(${opt.id}, ${w.id}, 'name', this.value)"></td>
        <td><input class="wave-plan-date-input" type="date" value="${w.targetDate || ''}"
          onchange="updateOptWave(${opt.id}, ${w.id}, 'targetDate', this.value)"></td>
        <td><input class="wave-plan-qty-input" type="number" min="0" value="${w.qty || ''}" placeholder="0"
          oninput="updateOptWave(${opt.id}, ${w.id}, 'qty', parseInt(this.value)||0)"></td>
        <td>
          <span class="ss-chip ${sc.cssClass}" data-wave-chip="${opt.id}-${w.id}">
            <span class="material-symbols-outlined">${sc.icon}</span>${sc.label}
          </span><br>
          ${nextStatus
            ? `<button class="wave-advance-btn" data-wave-advance="${opt.id}-${w.id}" onclick="advanceOptWaveNext(${opt.id}, ${w.id})">
                <span class="material-symbols-outlined" style="font-size:12px;">arrow_forward</span> ${nextStatus}
               </button>`
            : `<span class="wave-advance-done"><span class="material-symbols-outlined" style="font-size:12px;">check_circle</span> Active</span>`
          }
        </td>
        ${govCols}
        <td><button class="wave-plan-del-btn" onclick="removeOptWave(${opt.id}, ${w.id})" title="Remove wave">
          <span class="material-symbols-outlined" style="font-size:15px;">delete</span>
        </button></td>
      </tr>`;
  }).join('');

  const govTh = isGov ? `<th>Approp. ref &amp; expiry</th>` : '';
  const tableHtml = waves.length > 0
    ? `<table class="wave-plan-table">
        <thead><tr>
          <th>Wave</th>
          <th>Target date</th>
          <th>Units</th>
          <th>Slot status <span style="font-size:9px;font-weight:400;opacity:.6;">(demo \u25b6)</span></th>
          ${govTh}
          <th></th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>`
    : `<div style="font-size:11px;color:var(--gray-400);padding:4px 0 8px;">No waves defined yet. Add waves to plan phased deployment.</div>`;

  const footnote = isGov
    ? `Lifecycle: Contracted \u2192 Dispatched \u2192 Pending\u00a0Bind \u2192 Active-Billing.
       <strong>Lapsed</strong>: appropriation expires before dispatch \u2014 no billing, inventory released (no ECF).
       Commercial lapse: 30-day grace \u2192 pool floor billing (BR-44/45).`
    : `Lifecycle: Contracted \u2192 Dispatched \u2192 Pending\u00a0Bind \u2192 Active-Billing.
       Pool floor billing activates 30\u00a0days after target date lapses undispatched (BR-44/45).`;

  return `<div class="wave-plan-section">
    <div class="wave-plan-section-header">
      <div class="wave-plan-section-title">
        <span class="material-symbols-outlined" style="font-size:14px;">waves</span>
        Deployment Waves
        ${isGov ? '<span class="segment-pill government" style="cursor:default;pointer-events:none;margin-left:4px;">Gov</span>' : ''}
      </div>
      ${buildWaveAllocBadgeHtml(opt, totalUnits)}
    </div>
    ${tableHtml}
    <button class="wave-plan-add-btn" onclick="addOptWave(${opt.id})">
      <span class="material-symbols-outlined" style="font-size:14px;">add</span> Add wave
    </button>
    <div style="font-size:10px;color:var(--gray-400);margin-top:8px;line-height:1.6;">${footnote}</div>
  </div>`;
}

function getWavePlanIssues() {
  if (!proposalData.wavesEnabled) return [];
  const issues = [];
  options.forEach((opt, i) => {
    const waves = Array.isArray(opt.waves) ? opt.waves : [];
    if (waves.length === 0) return; // no waves defined = no validation needed
    const optionPromoType = getOptionPromotion(opt);
    const { totalUnits } = calcOption(opt, optionPromoType, (opt.forcedTierIndex ?? -1));
    const allocated = waves.reduce((s, w) => s + (Number(w.qty) || 0), 0);
    if (allocated !== totalUnits) {
      issues.push(`Option ${i + 1}: ${allocated} / ${totalUnits} units scheduled in waves`);
    }
    waves.forEach((w, wi) => {
      if (!w.targetDate) issues.push(`Option ${i + 1}, Wave ${wi + 1}: no target date set`);
    });
  });
  return issues;
}

function buildWaveInstallScheduleHtml(opt) {
  const waves = Array.isArray(opt && opt.waves) ? opt.waves : [];
  if (!waves.length) return '';
  const isGov = proposalData.segment === 'Government';
  const govTh = isGov
    ? `<th style="text-align:left; padding:10px 16px; font-size:10px; font-weight:700; letter-spacing:0.02em; color:#7a7a7a; border-bottom:1px solid #efefef;">Approp. ref / expiry</th>`
    : '';
  const rows = waves.map(w => {
    const dateStr = w.targetDate
      ? new Date(w.targetDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'TBD';
    const qty = Number(w.qty) || 0;
    let govTd = '';
    if (isGov) {
      const ref = (w.appropsRef || '').replace(/</g, '&lt;') || '&mdash;';
      const expStr = w.appropsExpiry
        ? new Date(w.appropsExpiry + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'N/A';
      const warn = w.appropsExpiry && w.targetDate && w.targetDate > w.appropsExpiry
        ? ` <span style="color:#92400E;font-weight:700;font-size:10px;">\u26a0 Expiry before wave date</span>`
        : '';
      govTd = `<td style="padding:12px 16px; border-bottom:1px solid #f0f0f0; font-size:12px; color:#1a1a1a;">${ref}<br><span style="color:#6B7280;font-size:11px;">${expStr}</span>${warn}</td>`;
    }
    return `<tr>
        <td style="padding:12px 16px; border-bottom:1px solid #f0f0f0; font-size:13px; color:#1a1a1a; font-weight:600;">${(w.name || 'Wave').replace(/</g,'&lt;')}</td>
        <td style="padding:12px 16px; border-bottom:1px solid #f0f0f0; font-size:13px; color:#1a1a1a;">${dateStr}</td>
        <td style="padding:12px 16px; border-bottom:1px solid #f0f0f0; font-size:13px; color:#1a1a1a;">${qty}</td>
        <td style="padding:12px 16px; border-bottom:1px solid #f0f0f0; font-size:11px; font-weight:700; color:#1D4ED8;">Contracted \u2014 Not Billing</td>
        ${govTd}
      </tr>`;
  }).join('');
  const govFootnote = isGov
    ? ` Government slots may enter <strong>Lapsed</strong> if appropriation expires before dispatch (no ECF, inventory released). `
    : '';
  return `
    <div style="height:1px; background:#efefef; margin:28px 0;"></div>
    <div style="font-size:12px; font-weight:800; letter-spacing:0.02em; color:#1a1a1a; margin-bottom:14px;">Installation schedule</div>
    <table style="width:100%; border-collapse:collapse; border:1px solid #efefef; border-radius:8px; overflow:hidden; font-family:inherit;">
      <thead>
        <tr style="background:#fafafa;">
          <th style="text-align:left; padding:10px 16px; font-size:10px; font-weight:700; letter-spacing:0.02em; color:#7a7a7a; border-bottom:1px solid #efefef;">Wave</th>
          <th style="text-align:left; padding:10px 16px; font-size:10px; font-weight:700; letter-spacing:0.02em; color:#7a7a7a; border-bottom:1px solid #efefef;">Target date</th>
          <th style="text-align:left; padding:10px 16px; font-size:10px; font-weight:700; letter-spacing:0.02em; color:#7a7a7a; border-bottom:1px solid #efefef;">Units</th>
          <th style="text-align:left; padding:10px 16px; font-size:10px; font-weight:700; letter-spacing:0.02em; color:#7a7a7a; border-bottom:1px solid #efefef;">Initial slot status</th>
          ${govTh}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:10px; font-size:11px; color:#7a7a7a; line-height:1.6;">
      Units enter <strong>Active-Billing</strong> upon device activation. <strong>Pending Bind</strong> slots (on-site, not yet activated) do not count toward the billing floor.
      Contracted units undispatched 30\u00a0days past target date activate the pool floor per MSA \u00a74.2 (BR-44/45).${govFootnote}
    </div>`;
}

// ── END WAVE PLAN MODULE ─────────────────────────────────────────

function handleSend() {
  if(screen === 'drafting') {
    const requiresApprovalGate = options.some(o => (o.forcedTierIndex ?? -1) !== -1) && proposalData.approvalStatus !== 'Approved';
    if (requiresApprovalGate) return;
    // Wave plan soft validation (F3)
    const waveIssues = getWavePlanIssues();
    if (waveIssues.length > 0) {
      if (!confirm('Wave plan has incomplete items:\n\n\u2022 ' + waveIssues.join('\n\u2022 ') + '\n\nContinue sending proposal anyway?\n(Waves can be updated before contract creation.)')) return;
    }
    logProposalEvent('Review & send started', 'Proposal moved to Review & send.');
    screen = 'review';
    showProposalReviewModal();
    document.getElementById('footer-send').classList.add('hidden');
    document.getElementById('footer-back').classList.remove('visible');
    document.getElementById('footer-back').classList.add('hidden');
    
    // Global stepper is relevant
    // sub-stepper removed — nav is in header

    // Update Steppers
    document.getElementById('substep-dot-1').className = 'prop-step-dot done';
    document.getElementById('substep-date-1').innerText = new Date().toLocaleDateString();
    document.getElementById('substep-dot-2').className = 'prop-step-dot active';
    document.getElementById('substep-line-1').className = 'prop-line done';
    document.getElementById('substep-label-2').classList.remove('muted');
    
    renderProposalDoc();
    fillProposalMessageDefaults();
    updateSendBtn();
    renderNav();
  } else if (screen === 'review') {
    const isResend = proposalWasSentToCustomer === true;
    proposalWasSentToCustomer = true;
    touchNavDate('proposal_review', true);
    logProposalEvent(isResend ? 'Proposal re-sent' : 'Proposal sent', 'Proposal email was sent from Review & send.');
    screen = 'drafting';
    hideProposalReviewModal();
    document.getElementById('screen-proposal-selection').classList.add('hidden');
    document.getElementById('screen-drafting').classList.remove('hidden');
    
    document.getElementById('substep-dot-2').className = 'prop-step-dot done';
    document.getElementById('substep-date-2').innerText = new Date().toLocaleDateString();
    document.getElementById('substep-dot-3').className = 'prop-step-dot pending';
    document.getElementById('substep-line-2').className = 'prop-line';
    document.getElementById('substep-label-3').classList.add('muted');

    showSuccessBanner('Proposal sent successfully', 'Your Fleet Solutions Proposal has been sent to acme.logistics@acmecorp.com');
    
    const sendBtn = document.getElementById('footer-send');
    sendBtn.innerText = 'Send Proposal';
    sendBtn.classList.add('hidden');
    sendBtn.disabled = false;
    
    renderOptions();
    updateMarkDeadBtn();
    updateSendBtn();
    renderNav();
  } else if (screen === 'contract-review') {
    // Validate message fields
    const to = document.getElementById('contract-msg-to').value.trim();
    if (!to) { alert('Please enter a recipient email.'); return; }
    // Switch to phase 2: Sign & Payment
    document.getElementById('contract-phase-review').classList.add('hidden');
    document.getElementById('contract-phase-signpay').classList.remove('hidden');
    document.getElementById('contract-sub-stepper')?.classList.add('hidden');
    // Sync doc viewer 2
    const v1 = document.getElementById('contract-doc-viewer');
    const v2 = document.getElementById('contract-doc-viewer2');
    if (v1 && v2) {
      v2.innerHTML = v1.innerHTML;
      // Recompute scale using the new container width in Signature phase.
      requestAnimationFrame(scaleDocPages);
    }
    // Stepper: step 1 done → step 2 active
    const d1 = document.getElementById('c-dot-1');
    const d2 = document.getElementById('c-dot-2');
    const l1 = document.getElementById('c-line-1');
    if (d1) { d1.className = 'c-step-dot done'; }
    if (l1) l1.className = 'c-line done';
    if (d2) d2.className = 'c-step-dot active';
    if (document.getElementById('c-dot-label-2')) document.getElementById('c-dot-label-2').className = 'c-step-label';
    const date1 = document.getElementById('contract-date-1');
    if (date1) date1.textContent = new Date().toLocaleDateString();
    // Set state and update chips
    contractSubState = 'waiting';
    logProposalEvent('Contract sent', 'Contract was sent for signature and payment setup.');
    touchNavDate('contract_review_send', true);
    touchNavDate('contract_sign_pay', true);
    updateContractSubState();
    document.getElementById('contract-send-btn')?.classList.add('hidden');
    document.getElementById('footer-back').classList.remove('hidden');
    document.getElementById('footer-back').classList.add('visible');
    renderNav();
  }
}

function renderSolOptions() {
  const grid = document.getElementById('sol-options-grid');
  grid.innerHTML = options.map((opt, i) => {
    const { totalMonthly } = calcOption(opt, getOptionPromotion(opt), (opt.forcedTierIndex ?? -1));
    const itemsHtml = opt.bundles.map(b => `<div class="sol-option-item">${b.qty}x ${b.coreName}</div>`).join('');
    return `
      <div class="sol-option-card">
        <div class="sol-option-label"><span>Option ${i+1}</span><span style="color:var(--gray-400); font-weight:400;">${opt.term} Mos</span></div>
        <div class="sol-option-price">${formatMoney(totalMonthly)}<span>/mo</span></div>
        <div class="sol-option-hw">Included hardware</div>
        ${itemsHtml}
      </div>`;
  }).join('');
}

function renderSelectionOptions() {
  const grid = document.getElementById('selection-grid');
  grid.innerHTML = options.map((opt, i) => {
    const optionPromoType = getOptionPromotion(opt);
    const { totalMonthly, totalUnits, avgUnit } = calcOption(opt, optionPromoType, (opt.forcedTierIndex ?? -1));
    const tier = getEffectiveTier(totalUnits, (opt.forcedTierIndex ?? -1));
    const skip = tier.index - tier.naturalIndex;
    const requiresApproval = skip > 0 && proposalData.approvalStatus !== 'Approved';

    let tierBadgeHtml = '';
    if (tier && tier.discount > 0) {
      tierBadgeHtml = `<span class="tier-badge">${tier.label}</span>`;
    } else if (totalUnits > 0) {
      tierBadgeHtml = `<span class="tier-badge" style="background:var(--gray-100);color:var(--gray-600);">${tier ? tier.label : '1-9'}</span>`;
    }

    let actionHtml = '';
    if (requiresApproval) {
      const role = getApprovalRole(skip);
      const isPending = proposalData.approvalStatus === 'Pending';
      actionHtml = `
        <button class="btn-request-approval ${isPending ? 'approved' : ''}" disabled>
          ${isPending ? 'Approval Requested' : 'Request approval'}
        </button>
        <div class="approval-sublabel ${isPending ? 'approved' : ''}">
          ${isPending ? 'Awaiting ' + role + ' decision' : 'Requires ' + role + ' Approval'}
        </div>
      `;
    } else {
      actionHtml = `
        <button class="btn-select-contract btn-select-contract--lg" onclick="selectOption(${opt.id})">Select &amp; create contract</button>
      `;
    }

    const videoFeatureKeys = ['sd-256', 'adas', 'evc', 'monitor'];
    const vehicleFeatureKeys = ['driver-id', 'privacy', 'logbook'];

    let bundlesHtml = '';
    opt.bundles.forEach(b => {
      const bundlePromo = b.promoType || optionPromoType;
      const { unitPrice, monthly, tier: bt } = calcBundle(b, opt.term, bundlePromo, (opt.forcedTierIndex ?? -1), totalUnits);
      const hasDisc = bt.discount > 0;
      const isVideo = b.coreKey === 'vtu-ffc' || b.coreKey === 'vtu-dual';
      const promoApplied = bundlePromo === 'Media' && isVideo;
      const featureKeys = Array.isArray(b.features) ? b.features : [];
      let videoFeatures = featureKeys
        .filter(k => videoFeatureKeys.includes(k))
        .map((k) => {
          if (k === 'evc') return `EVC (${getEvcTypeLabel(b.evcType)})`;
          return featureLabels[k] || k;
        });
      if (isVideo && !featureKeys.includes('sd-256')) {
        videoFeatures = ['128 GB SD Card', ...videoFeatures];
      }
      const vehicleFeatures = featureKeys
        .filter(k => vehicleFeatureKeys.includes(k))
        .map(k => featureLabels[k] || k);
      const featureMeta = `
        ${videoFeatures.length ? `<div class="bundle-feature-line"><strong>Video:</strong> ${videoFeatures.join(', ')}</div>` : ''}
        ${vehicleFeatures.length ? `<div class="bundle-feature-line"><strong>Vehicle features:</strong> ${vehicleFeatures.join(', ')}</div>` : ''}
      `;
      let discBadges = '';
      if (hasDisc) discBadges += `<span class="disc-badge">${(bt.discount*100)}% Volume disc</span> `;
      if (promoApplied) discBadges += `<span class="disc-badge" style="background:#0076CE">Media Promo −20%</span>`;

      bundlesHtml += `
        <div class="bundle-row">
          <div class="bundle-row-name">${b.coreName} <span style="float:right;font-weight:400;font-size:11px;color:var(--gray-600)">QTY: ${b.qty}</span></div>
          ${featureMeta}
          <div class="bundle-row-price">${formatMoney(monthly)}<span>/month</span></div>
          <div class="bundle-row-unit">${formatMoney(unitPrice)}/unit</div>
          <div style="margin-top:6px;">${discBadges}</div>
        </div>`;
    });

    return `
      <div class="option-card option-card--readonly">
        <div class="option-card-header">
          <span>Option ${i+1}</span>
        </div>
        <div class="option-card-body">
          <div class="term-readonly-block">
            <div class="field-label term-readonly-label">Contract term</div>
            <div class="term-readonly-value">${opt.term} months</div>
          </div>
          <div class="monthly-total">
            <div class="field-label" style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;">
              <span>Monthly total</span>
              <div style="display:flex; align-items:center; gap:8px;">
                ${tierBadgeHtml}
                <span style="color:var(--gray-600); font-size:11px; font-weight:400;">Qty: ${totalUnits}</span>
              </div>
            </div>
            <div class="monthly-amount">${formatMoney(totalMonthly)}<span>/month</span></div>
            <div class="per-unit">${formatMoney(avgUnit)}/unit (avg)</div>
          </div>
          ${actionHtml}
          <div class="bundles-list">
            <div class="bundles-label"><span class="material-symbols-outlined" style="font-size:20px;">package_2</span> Bundle configured (${opt.bundles.length})</div>
            ${bundlesHtml || '<div style="font-size:11px;color:var(--gray-400);padding:16px;text-align:center;">No Bundles yet</div>'}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── ROI CONFIG PANEL ─────────────────────────────────────────────

function roiHasVideo() {
  return options.some(opt => opt.bundles && opt.bundles.some(b => isVideoCore(b.coreKey)));
}

function toggleRoiConfigPanel() {
  const body = document.getElementById('roi-config-body');
  const chevron = document.getElementById('roi-config-chevron');
  if (!body) return;
  const isOpen = !body.classList.contains('hidden');
  body.classList.toggle('hidden', isOpen);
  chevron?.classList.toggle('open', !isOpen);
}

function toggleRoiCat(cat) {
  const body = document.getElementById(`roi-cat-${cat}`);
  if (body) body.classList.toggle('hidden');
}

function syncRoiSafetyState() {
  const hasVideo = roiHasVideo();
  const icon = document.getElementById('roi-safety-icon');
  const title = document.getElementById('roi-safety-title');
  const badge = document.getElementById('roi-safety-badge');
  const body = document.getElementById('roi-cat-safety');
  if (!icon) return;
  if (hasVideo) {
    icon.textContent = 'videocam';
    icon.style.color = 'var(--red)';
    if (title) { title.textContent = 'Safety & Cameras'; title.style.color = 'var(--black)'; }
    if (badge) { badge.textContent = 'Auto-enabled'; badge.style.color = 'var(--green)'; badge.style.borderColor = 'var(--green)'; }
    if (body) body.classList.remove('hidden');
  } else {
    icon.textContent = 'videocam_off';
    icon.style.color = 'var(--gray-400)';
    if (title) { title.textContent = 'Safety & Cameras'; title.style.color = 'var(--gray-400)'; }
    if (badge) { badge.textContent = 'No video options'; badge.style.color = 'var(--gray-400)'; badge.style.borderColor = 'var(--gray-300)'; }
    if (body) body.classList.add('hidden');
  }
}

function getRoiConfig() {
  const billingMethod = document.getElementById('roi-billing-method')?.value || 'perJob';
  return {
    productivity: {
      enabled: document.getElementById('roi-productivity-enabled')?.checked ?? true,
      billingMethod,
      avgBillRate:    parseFloat(document.getElementById('roi-avg-bill-rate')?.value)    || 150,
      jobsPerWeek:    parseFloat(document.getElementById('roi-jobs-per-week')?.value)    || 12,
      efficiencyGain: parseFloat(document.getElementById('roi-efficiency-gain')?.value)  || 15,
    },
    fuel: {
      enabled: document.getElementById('roi-fuel-enabled')?.checked ?? true,
      costPerGallon:      parseFloat(document.getElementById('roi-cost-per-gallon')?.value) || 2.95,
      galSavedPerWeekVeh: parseFloat(document.getElementById('roi-gal-saved')?.value)       || 2,
    },
    payroll: {
      enabled: document.getElementById('roi-payroll-enabled')?.checked ?? true,
      otHoursPerWeek: parseFloat(document.getElementById('roi-ot-hours')?.value)      || 1,
      hourlyRate:     parseFloat(document.getElementById('roi-hourly-rate')?.value)    || 25,
      includeMaint:   document.getElementById('roi-include-maint')?.checked ?? true,
      maintSavePerVeh: parseFloat(document.getElementById('roi-maint-save')?.value)   || 100,
    },
    safety: {
      hasVideo: roiHasVideo(),
      avgAccidentCost:    parseFloat(document.getElementById('roi-accident-cost')?.value)      || 25000,
      accidentsPerYear:   parseFloat(document.getElementById('roi-accidents-per-year')?.value) || 1,
      liabilityPct:       parseFloat(document.getElementById('roi-liability-pct')?.value)      || 40,
    }
  };
}

function onRoiChange() {
  // Keep billing method label in sync
  const method = document.getElementById('roi-billing-method')?.value;
  const label = document.getElementById('roi-jobs-label');
  if (label) label.textContent = method === 'perHour' ? 'Hrs / Wk / Veh' : 'Jobs / Wk / Veh';
  // Show/hide maint row
  const includeMaint = document.getElementById('roi-include-maint')?.checked;
  const maintRow = document.getElementById('roi-maint-row');
  if (maintRow) maintRow.classList.toggle('hidden', !includeMaint);
  // Re-render doc live if ROI page is selected
  const roiCb = document.querySelector('[data-material-key="roi"]');
  if (roiCb?.checked) renderProposalDoc();
}

function initRoiConfigPanel() {
  syncRoiSafetyState();
  onRoiChange();
}

  function toggleMaterialsMenu() {
  document.getElementById('materials-menu').classList.toggle('hidden');
}

function updateMaterialsLabel() {
  const labelEl = document.getElementById('materials-label');
  const btnEl = document.getElementById('materials-btn');
  const menuEl = document.getElementById('materials-menu');
  if (!labelEl || !btnEl || !menuEl) return;

  const selectedLabels = Array.from(menuEl.querySelectorAll('.materials-menu-item input[type="checkbox"]'))
    .filter((cb) => cb?.checked)
    .map((cb) => cb?.dataset?.materialLabel?.trim())
    .filter(Boolean);

  if (!selectedLabels.length) {
    labelEl.textContent = 'Select materials';
    btnEl.classList.remove('has-selection');
    return;
  }

  labelEl.textContent = selectedLabels.join(' + ');
  btnEl.classList.add('has-selection');
}

function getSelectedMaterials() {
  const menu = document.getElementById('materials-menu');
  const keys = new Set(['quote']); // always included
  if (!menu) return keys;
  menu.querySelectorAll('.materials-menu-item input[type="checkbox"]').forEach(cb => {
    if (cb.checked && cb.dataset.materialKey) keys.add(cb.dataset.materialKey);
  });
  return keys;
}

function toggleMaterial(el) {
  const cb = el.querySelector('input');
  if (!cb || cb.disabled) return;
  if (!(window.event && window.event.target === cb)) {
    cb.checked = !cb.checked;
  }
  renderProposalDoc();
}

function renderProposalDoc() {
  updateMaterialsLabel();
  const viewer = document.getElementById('prop-doc-viewer');
  if (!viewer) return;

  const dateStr = formatUsDate(new Date());
  const expirationInput = document.getElementById('proposal-expiration-date');
  let expirationStr;
  if (expirationInput && expirationInput.value) {
    const parsedExpiration = parseProposalDate(expirationInput.value);
    expirationStr = parsedExpiration ? formatExpirationDisplayDate(clampExpirationDate(startOfDay(parsedExpiration))) : formatExpirationDisplayDate(getDefaultExpirationDate());
  } else {
    expirationStr = formatExpirationDisplayDate(getDefaultExpirationDate());
  }

  const selectedMaterials = getSelectedMaterials();
  const pages = [];
  let pageNum = 1;

  // Shared page footer disclaimer
  const DISCLAIMER = 'This quotation is for illustrative purpose only and does not constitute a formal offer or contractual agreement. Final configurations and pricing may vary. For complete terms and conditions, please contact your sales representative.';
  const COPYRIGHT = '© 2026 Verizon Connect. All Rights Reserved.';
  const VZC_LOGO = `<img src="https://raw.githubusercontent.com/catalinaypun/valu-cal-app/393563638315e21a9ce0a395f797c851de8be70d/resources/verizon-connect-logo.svg" alt="Verizon Connect" style="height:26px;display:block;margin-top:2px;">`;

  function wrapPage(content, num) {
    return `<div class="doc-page-outer" style="margin-bottom:16px;"><div class="vc-doc-shell"><div class="vc-doc-brand-line"></div><div class="vc-doc-inner" style="min-height:1040px;padding-bottom:60px;position:relative;">${content}<div style="position:absolute;bottom:16px;left:0;right:0;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;"><div style="font-size:8.5px;color:#999;line-height:1.45;max-width:460px;">${DISCLAIMER}</div><div style="text-align:right;flex-shrink:0;"><div style="font-size:8.5px;color:#999;">${COPYRIGHT}</div><div style="font-size:11px;color:#222;font-weight:600;margin-top:2px;">${num}</div></div></div></div></div></div>`;
  }

  // Simple header used on pages 2-4
  function simpleHeader() {
    return `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;"><div><div style="font-size:28px;font-weight:900;color:#ee001e;line-height:1.1;">Quote</div><div style="font-size:11px;color:#555;margin-top:3px;">${dateStr}&nbsp;&nbsp;<strong style="font-weight:600;">|</strong>&nbsp;&nbsp;<strong style="font-weight:600;">Ref</strong> Prop-9284</div></div>${VZC_LOGO}</div><div style="height:1px;background:#e0e0e0;margin:10px -24px 20px;"></div>`;
  }

  // ── PAGE 1: Quote (always) ─────────────────────────────────────
  {
    const optionTablesHtml = options.map((opt, i) => {
      let totalUnits = 0;
      opt.bundles.forEach(b => { totalUnits += b.qty; });
      const forcedIdx = opt.forcedTierIndex ?? -1;
      let optTotal = 0;

      const rowsHtml = opt.bundles.map(b => {
        const { unitPrice, monthly } = calcBundle(b, opt.term, b.promoType || 'Standard', forcedIdx, totalUnits);
        optTotal += monthly;
        const featNames = (b.features || b.selectedFeatures || []).map(k => {
          if (k === 'evc') return `EVC (${typeof getEvcTypeLabel === 'function' ? getEvcTypeLabel(b.evcType) : (b.evcType || 'Dual')})`;
          return featureLabels[k] || k;
        }).filter(Boolean);
        const featHtml = featNames.length
          ? `<ul style="margin:3px 0 0;padding-left:14px;">${featNames.map(n => `<li style="font-size:10px;color:#555;margin:1px 0;">${n}</li>`).join('')}</ul>`
          : '';
        return `<tr><td style="padding:11px 16px;font-size:12px;vertical-align:top;border-bottom:1px solid #f0f0f0;">${b.qty}</td><td style="padding:11px 16px;font-size:12px;vertical-align:top;border-bottom:1px solid #f0f0f0;"><div style="font-weight:500;">${b.coreName}</div>${featHtml}</td><td style="padding:11px 16px;font-size:12px;text-align:right;vertical-align:top;border-bottom:1px solid #f0f0f0;white-space:nowrap;">${formatMoney(unitPrice)}</td><td style="padding:11px 16px;font-size:12px;text-align:right;vertical-align:top;border-bottom:1px solid #f0f0f0;font-weight:600;white-space:nowrap;">${formatMoney(monthly)}</td></tr>`;
      }).join('');

      return `<div style="margin-bottom:24px;"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;"><div style="font-size:16px;font-weight:900;color:#ee001e;">Option ${i + 1}</div><div style="font-size:13px;font-weight:700;color:#1a1a1a;">${opt.term} Month</div></div><div style="height:1px;background:#1a1a1a;margin-bottom:0;"></div><table style="width:100%;border-collapse:collapse;"><thead><tr style="border-bottom:1px solid #d8d8d8;"><th style="padding:9px 16px;text-align:left;font-size:11px;font-weight:700;color:#333;">QTY</th><th style="padding:9px 16px;text-align:left;font-size:11px;font-weight:700;color:#333;">Description</th><th style="padding:9px 16px;text-align:right;font-size:11px;font-weight:700;color:#333;">Unit price</th><th style="padding:9px 16px;text-align:right;font-size:11px;font-weight:700;color:#333;">Total</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="4" style="padding:16px;font-size:12px;color:#aaa;text-align:center;">No bundles added</td></tr>'}</tbody></table><div style="display:flex;justify-content:flex-end;align-items:baseline;padding:10px 16px 2px;gap:14px;"><div style="font-size:12px;font-weight:800;color:#ee001e;">Total Monthly Payment</div><div style="font-size:16px;font-weight:900;color:#ee001e;">${formatMoney(optTotal)}</div></div><div style="text-align:right;padding-right:16px;font-size:8.5px;color:#999;">*Excludes applicable taxes</div></div>`;
    }).join('');

    const page1 = `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;"><div><div style="font-size:28px;font-weight:900;color:#ee001e;line-height:1.1;">Quote</div><div style="font-size:11px;color:#555;margin-top:3px;">${dateStr}&nbsp;&nbsp;<strong style="font-weight:600;">|</strong>&nbsp;&nbsp;<strong style="font-weight:600;">Ref</strong> Prop-9284</div></div>${VZC_LOGO}</div><div style="background:#f8f3e9;padding:14px 24px;margin:12px -24px 22px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;font-size:11px;color:#222;"><div><div style="font-weight:700;margin-bottom:4px;font-size:11px;">Prepared by</div><div>Lisa Sullivan</div><div style="color:#666;">lisa.sullivan@verizonconnect.com</div><div style="color:#666;">(304) 555-0192</div></div><div><div style="font-weight:700;margin-bottom:4px;font-size:11px;">Prepared for</div><div>Apex Construction LLC</div><div style="color:#666;">123 Industrial PKWY, Tampa FL 33602, USA</div></div><div style="text-align:right;"><div style="font-weight:700;margin-bottom:4px;font-size:11px;">Valid until</div><div>${expirationStr}</div></div></div>${optionTablesHtml || '<div style="color:#aaa;font-size:13px;padding:24px 0;text-align:center;">No options added yet.</div>'}`;
    pages.push(wrapPage(page1, pageNum++));
  }

  // ── PAGE 2: Onboarding Flyer (optional) ───────────────────────
  if (selectedMaterials.has('onboarding')) {
    const HERO_IMG = `https://images.contentstack.io/v3/assets/blt0371ecb1478c7909/blt65a932e3237c46d9/688161b889e3963781bad1ea/vzc-monarch-DOT-desktop-us.webp?auto=webp?w=1920&q=75&auto=webp`;
    const CREW_IMG = `https://images.contentstack.io/v3/assets/blt0371ecb1478c7909/blt65a932e3237c46d9/688161b889e3963781bad1ea/vzc-monarch-DOT-desktop-us.webp?auto=webp?w=800&q=75&auto=webp`;
    const page2 = `${simpleHeader()}<div style="position:relative;margin:0 -24px 24px;overflow:hidden;height:240px;background:#4a5568 url('${HERO_IMG}') center/cover no-repeat;"><div style="position:absolute;left:24px;top:24px;width:46%;background:#ee001e;color:#fff;padding:22px 18px 18px;border-radius:6px;"><div style="font-size:21px;font-weight:700;line-height:1.18;margin-bottom:10px;">Fast, no&#8209;hassle onboarding with Verizon Connect</div><div style="font-size:12px;line-height:1.4;">Minimize disruption,<br><strong>Maximize ROI.</strong></div></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:26px;"><div style="font-size:12px;color:#222;line-height:1.65;">Running a fleet leaves you with little time to spare. That's why we designed an onboarding process that delivers <strong>fast results with minimal vehicle downtime.</strong> Here's what you can expect:</div><div>${[['Dedicated onboarding success expert','A single point of contact to guide you every step of the way'],['Flexible installation scheduling','Evenings and weekends available, so daily routes stay intact'],['Complete control, always','Pick the installation window that works for you. We handle the logistics']].map(([t,d]) => `<div style="margin-bottom:12px;"><div style="font-size:12px;font-weight:700;color:#1a1a1a;">${t}</div><div style="font-size:11px;color:#555;line-height:1.45;">${d}</div></div>`).join('')}</div></div><div><div style="font-size:16px;font-weight:800;color:#ee001e;margin-bottom:2px;">Your proven, three-step journey</div><div style="font-size:11px;color:#888;margin-bottom:16px;">Efficient. Predictable. Outcome-driven.</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;"><div>${[['Plan for success','We help you prepare for a smooth rollout, minimizing disruption to your business and accelerating ROI.'],['Install with confidence','Our professional installers are experts at installing fleet management solutions, ensuring your installation goes right the first time to minimize fleet downtime.'],['Activate day-one impact','Gain instant access to live tracking, real-time alerts, and the insights required to improve driver safety and operational efficiency, reduce fuel costs, and stay compliant.']].map(([t,d]) => `<div style="margin-bottom:14px;"><div style="font-size:12px;font-weight:700;color:#1a1a1a;margin-bottom:4px;">${t}</div><div style="font-size:11px;color:#555;line-height:1.5;">${d}</div></div>`).join('')}</div><div style="background:#4a5568 url('${CREW_IMG}') center/cover no-repeat;border-radius:6px;min-height:240px;"></div></div></div>`;
    pages.push(wrapPage(page2, pageNum++));
  }

  // ── PAGE 3: Case Study (optional) ─────────────────────────────
  if (selectedMaterials.has('case-study')) {
    const page3 = `${simpleHeader()}<div style="font-size:11px;font-weight:700;color:#555;margin-bottom:2px;">ROI Success history</div><div style="font-size:20px;font-weight:800;color:#ee001e;margin-bottom:18px;">Safety &amp; Insurance</div><div style="border:1px solid #e0e0e0;border-radius:8px;padding:18px 20px;margin-bottom:18px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><div style="color:#d4a800;font-size:18px;letter-spacing:3px;">&#9733;&#9733;&#9733;&#9733;&#9733;</div><div style="font-size:10px;font-weight:700;color:#555;border:1px solid #ccc;border-radius:4px;padding:3px 8px;">Verified result</div></div><div style="font-size:13px;color:#1a1a1a;margin-bottom:6px;">"Deflected a false claim, saved $200,000 on insurance premiums."</div><div style="font-size:11px;color:#555;"><strong>Bill Howe,</strong> B.A.M Trucking</div><div style="background:#f8f3e9;border:1px solid #e9dfc9;border-radius:6px;padding:12px 14px;margin-top:14px;display:flex;align-items:flex-start;gap:10px;"><span class="material-symbols-outlined" style="font-size:16px;color:#555;flex-shrink:0;margin-top:1px;">verified_user</span><div><div style="font-size:11px;font-weight:700;color:#1a1a1a;margin-bottom:2px;">Proven outcome</div><div style="font-size:11px;color:#444;line-height:1.5;">Reduced accidents by 87%, exonerated drivers from false claims.</div></div></div></div><div style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;margin-bottom:24px;"><div style="display:grid;grid-template-columns:1fr 1fr;"><div style="padding:16px 18px;border-right:1px solid #e0e0e0;"><div style="font-size:12px;font-weight:700;margin-bottom:10px;">Common challenges</div><ul style="margin:0;padding-left:16px;font-size:11px;color:#444;line-height:1.9;"><li>False accident claims</li><li>High insurance premiums</li><li>Reputation damage</li></ul></div><div style="padding:16px 18px;"><div style="font-size:12px;font-weight:700;margin-bottom:10px;">Verizon Connect Solution</div><ul style="margin:0;padding-left:16px;font-size:11px;color:#444;line-height:1.9;"><li>Dashcams (Integrated Video)</li><li>Harsh driving alerts</li><li>Driver safety scorecards</li></ul></div></div></div><div style="background:#1a1a1a;border-radius:8px;padding:32px 24px;text-align:center;"><div style="margin-bottom:8px;"><span class="material-symbols-outlined" style="font-size:28px;color:#fff;">videocam</span></div><div style="font-size:17px;font-weight:800;color:#fff;margin-bottom:8px;">Want to see the full story?</div><div style="font-size:12px;color:#bbb;margin-bottom:20px;">Scan or click below to view the full success story and video testimonial.</div><div style="display:inline-block;background:#fff;color:#1a1a1a;font-size:12px;font-weight:700;padding:10px 28px;border-radius:999px;cursor:default;">Watch video</div></div>`;
    pages.push(wrapPage(page3, pageNum++));
  }

  // ── PAGE 4: ROI / Business Impact Analysis (optional) ─────────
  if (selectedMaterials.has('roi')) {
    let totalUnitsAll = 0;
    options.forEach(opt => opt.bundles.forEach(b => { totalUnitsAll += b.qty; }));
    const fleetSize = totalUnitsAll || 50;
    const cfg = getRoiConfig();

    // Compute per-category monthly values
    const weeksPerMonth = 52 / 12;

    let grossMonthly = 0;
    const roiRows = [];

    // Productivity
    if (cfg.productivity.enabled) {
      const { billingMethod, avgBillRate, jobsPerWeek, efficiencyGain } = cfg.productivity;
      let monthlyGain;
      if (billingMethod === 'perHour') {
        monthlyGain = avgBillRate * jobsPerWeek * (efficiencyGain / 100) * fleetSize * weeksPerMonth;
      } else {
        monthlyGain = avgBillRate * jobsPerWeek * (efficiencyGain / 100) * fleetSize * weeksPerMonth;
      }
      grossMonthly += monthlyGain;
      const methodLabel = billingMethod === 'perHour' ? 'Hrs/Wk/Veh' : 'Jobs/Wk/Veh';
      roiRows.push({ icon: 'trending_up', title: 'Productivity', detail: `${methodLabel}: ${jobsPerWeek} &nbsp;|&nbsp; Rate: $${avgBillRate.toFixed(2)} &nbsp;|&nbsp; Gain: ${efficiencyGain}%`, label: 'Monthly Gain', value: formatMoney(monthlyGain) });
    }

    // Fuel
    if (cfg.fuel.enabled) {
      const { costPerGallon, galSavedPerWeekVeh } = cfg.fuel;
      const monthlyGain = costPerGallon * galSavedPerWeekVeh * fleetSize * weeksPerMonth;
      grossMonthly += monthlyGain;
      roiRows.push({ icon: 'local_gas_station', title: 'Fuel Cost Reduction', detail: `Avg: $${costPerGallon}/gal &nbsp;|&nbsp; Saved: ${galSavedPerWeekVeh} gal/wk`, label: 'Monthly Gain', value: formatMoney(monthlyGain) });
    }

    // Payroll & Maint
    if (cfg.payroll.enabled) {
      const { otHoursPerWeek, hourlyRate, includeMaint, maintSavePerVeh } = cfg.payroll;
      const payrollMonthly = hourlyRate * otHoursPerWeek * fleetSize * weeksPerMonth;
      const maintMonthly = includeMaint ? (maintSavePerVeh * fleetSize / 12) : 0;
      const totalMonthly = payrollMonthly + maintMonthly;
      grossMonthly += totalMonthly;
      const detail = `Rate: $${hourlyRate}/hr &nbsp;|&nbsp; Reduced: ${otHoursPerWeek} hrs/wk${includeMaint ? ` &nbsp;|&nbsp; Maint: $${maintSavePerVeh}/veh/yr` : ''}`;
      roiRows.push({ icon: 'attach_money', title: 'Payroll' + (includeMaint ? ' &amp; Maintenance' : ' Optimization'), detail, label: 'Monthly Savings', value: formatMoney(totalMonthly) });
    }

    // Safety & Cameras (auto)
    const safetyEnabled = cfg.safety.hasVideo;
    let estAnnualLiability = 0;
    if (safetyEnabled) {
      const { avgAccidentCost, accidentsPerYear, liabilityPct } = cfg.safety;
      estAnnualLiability = avgAccidentCost * accidentsPerYear * (liabilityPct / 100);
      const safetyMonthly = estAnnualLiability / 12;
      grossMonthly += safetyMonthly;
      roiRows.push({ icon: 'shield', title: 'Safety &amp; Cameras', detail: `Avg Accident: $${avgAccidentCost.toLocaleString()} &nbsp;|&nbsp; Liability reduction: ${liabilityPct}%`, label: 'Est. Monthly Savings', value: formatMoney(safetyMonthly) });
    }

    let sysInvestment = 0;
    if (options.length > 0) {
      const firstOpt = options[0];
      const { totalMonthly } = calcOption(firstOpt, getOptionPromotion(firstOpt), firstOpt.forcedTierIndex ?? -1);
      sysInvestment = totalMonthly;
    }
    const netBenefit = grossMonthly - sysInvestment;
    const roiRatio = sysInvestment > 0 ? (grossMonthly / sysInvestment).toFixed(1) : '—';

    const roiRowsHtml = roiRows.map(r => `<div style="display:flex;justify-content:space-between;align-items:center;padding:13px 0;border-bottom:1px solid #f0f0f0;"><div style="display:flex;align-items:center;gap:12px;"><div style="width:36px;height:36px;border:1px solid #e0e0e0;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:18px;color:#555;">${r.icon}</span></div><div><div style="font-size:12px;font-weight:700;color:#1a1a1a;margin-bottom:2px;">${r.title}</div><div style="font-size:10px;color:#888;">${r.detail}</div></div></div><div style="text-align:right;flex-shrink:0;"><div style="font-size:10px;color:#888;margin-bottom:1px;">${r.label}</div><div style="font-size:14px;font-weight:700;color:#1a1a1a;">${r.value}</div></div></div>`).join('');

    const page4 = `${simpleHeader()}<div style="font-size:20px;font-weight:800;color:#1a1a1a;margin-bottom:4px;">Business Impact Analysis</div><div style="margin-bottom:18px;">${roiRowsHtml || '<div style="font-size:12px;color:#aaa;padding:16px 0;text-align:center;">No categories selected.</div>'}</div><div style="background:#f8f3e9;border:1px solid #e9dfc9;border-radius:8px;padding:20px;margin-bottom:22px;text-align:center;"><div style="font-size:14px;font-weight:800;color:#ee001e;margin-bottom:2px;">Estimated Monthly Financial Impact</div><div style="font-size:10px;color:#888;margin-bottom:16px;">Based on fleet size: ${fleetSize}</div><div style="display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;"><div><div style="font-size:22px;font-weight:900;color:#1a1a1a;">${formatMoney(grossMonthly)}</div><div style="background:#16a34a;color:#fff;font-size:9px;font-weight:700;border-radius:3px;padding:2px 7px;margin-top:4px;display:inline-block;">Gross Monthly Savings</div></div><div style="font-size:22px;color:#555;font-weight:300;">−</div><div><div style="font-size:22px;font-weight:900;color:#1a1a1a;">${formatMoney(sysInvestment)}</div><div style="font-size:10px;color:#888;margin-top:4px;">System Investment</div></div><div style="font-size:22px;color:#555;font-weight:300;">=</div><div><div style="font-size:22px;font-weight:900;color:#1a1a1a;">${formatMoney(netBenefit)}</div><div style="background:#1d4ed8;color:#fff;font-size:9px;font-weight:700;border-radius:3px;padding:2px 7px;margin-top:4px;display:inline-block;">Net Monthly Benefit</div></div></div><div style="font-size:11px;color:#555;margin-top:12px;">ROI Ratio ${roiRatio}:1</div></div>${safetyEnabled ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;"><div><div style="font-size:14px;font-weight:800;color:#1a1a1a;margin-bottom:8px;">Video Safety ROI and Liability Protection</div><div style="font-size:11px;color:#444;line-height:1.65;">Implementing Video Telematics (Dash Cams) significantly reduces liability exposure by providing exonerating evidence in false claims and improving driver behavior. Industry data suggests commercial fleets can reduce accident frequency by up to 40%.*</div></div><div style="border:1px solid #e0e0e0;border-radius:8px;padding:16px;"><div style="margin-bottom:12px;"><div style="font-size:10px;color:#888;margin-bottom:2px;">AVG Cost of Accident</div><div style="font-size:13px;font-weight:700;color:#1a1a1a;">${formatMoney(cfg.safety.avgAccidentCost)}</div></div><div style="margin-bottom:12px;"><div style="font-size:10px;color:#888;margin-bottom:2px;">EST Accidents Avoided</div><div style="font-size:13px;font-weight:700;color:#1a1a1a;">${cfg.safety.accidentsPerYear} / Year</div></div><div><div style="font-size:10px;color:#888;margin-bottom:2px;">EST Annual Liability Savings</div><div style="font-size:14px;font-weight:800;color:#16a34a;">${formatMoney(estAnnualLiability)}</div><div style="font-size:10px;color:#888;">Non-recurring / Insurance</div></div></div></div>` : ''}`;
    pages.push(wrapPage(page4, pageNum++));
  }

  viewer.innerHTML = pages.join('');
  fillProposalMessageDefaults();
  requestAnimationFrame(scaleDocPages);
}

function onProposalExpirationChange() {
  if (!validateAndSyncExpirationFrom('proposal-expiration-date')) return;
  renderProposalDoc();
}
function onContractExpirationChange(sourceId) {
  if (!validateAndSyncExpirationFrom(sourceId)) return;
  renderProposalDoc();
  if (selectedOpt) renderContractDoc(selectedOpt);
}

function goBack() { 
  if(screen==='review') { 
    closeProposalReviewModal();
  } else if (screen === 'selection') {
    screen = 'review';
    renderNav();
    document.getElementById('screen-proposal-selection').classList.add('hidden');
    document.getElementById('screen-drafting').classList.remove('hidden');
    showProposalReviewModal();

    document.getElementById('substep-dot-2').className = 'prop-step-dot active';
    document.getElementById('substep-dot-3').className = 'prop-step-dot pending';
    document.getElementById('substep-line-2').className = 'prop-line';
    document.getElementById('substep-label-3').classList.add('muted');
    
    renderProposalDoc();
  } else if (screen === 'contract-review') {
    // If in phase 2 (sign&pay), go back to phase 1 (review form)
    const phase2 = document.getElementById('contract-phase-signpay');
    if (phase2 && !phase2.classList.contains('hidden')) {
      clearSignatureCompletionSimulation();
      phase2.classList.add('hidden');
      document.getElementById('contract-phase-review').classList.remove('hidden');
      document.getElementById('contract-sub-stepper')?.classList.add('hidden');
      contractSubState = 'pre-send';
      // Restore stepper to step 1
      const d1=document.getElementById('c-dot-1');const d2=document.getElementById('c-dot-2');const l1=document.getElementById('c-line-1');
      if(d1)d1.className='c-step-dot active';if(d2)d2.className='c-step-dot pending';if(l1)l1.className='c-line';
      if(document.getElementById('c-dot-label-2'))document.getElementById('c-dot-label-2').className='c-step-label muted';
      const contractSendBtn = document.getElementById('contract-send-btn');
      if (contractSendBtn) {
        contractSendBtn.classList.remove('hidden');
        contractSendBtn.innerText='Send E-Sign Link';
      }
      document.getElementById('footer-back').classList.remove('visible');
      document.getElementById('footer-back').classList.add('hidden');
      return;
    }
    screen = 'selection'; 
    document.getElementById('screen-contract').classList.add('hidden');
    document.getElementById('screen-proposal-selection').classList.remove('hidden');
    // sub-stepper removed — nav is in header
    document.getElementById('vc-body').style.paddingTop = '159px';
    document.getElementById('success-banner').style.top = '159px';
    document.getElementById('footer-send').innerText = 'Select Winning Option';
    document.getElementById('footer-back').classList.remove('hidden');
    
    const sendBtn = document.getElementById('footer-send');
    sendBtn.onclick = () => {
       sendBtn.disabled = true;
    };
    
    renderSelectionOptions();
    updateMarkDeadBtn();
  }
}
function updateCharCount(el) { 
  const len = el.value !== undefined ? el.value.length : (el.textContent || '').length;
  document.getElementById('char-count').innerText = len; 
  updateSendBtn();
}
function updateSendBtn() {
  const btn = document.getElementById('footer-send');
  const draftingBtn = document.getElementById('drafting-review-btn');
  const reviewSendBtn = document.getElementById('review-send-proposal-btn');
  if (screen === 'drafting') {
    const hasAnyBundle = options.some(opt => opt.bundles && opt.bundles.length > 0);
    const requiresApprovalGate = options.some(o => (o.forcedTierIndex ?? -1) !== -1) && proposalData.approvalStatus !== 'Approved';
    const disableReviewSend = !hasAnyBundle || requiresApprovalGate;
    if (draftingBtn) draftingBtn.disabled = disableReviewSend;
    if (btn) btn.disabled = disableReviewSend;
  } else if (screen === 'review') {
    const to = document.getElementById('prop-msg-to')?.value.trim() ?? '';
    const closeDate = document.getElementById('proposal-close-date')?.value.trim() ?? '';
    const closeDateError = document.getElementById('close-date-error');
    const closeDateEmpty = closeDate === '';
    if (closeDateError) closeDateError.classList.toggle('hidden', !closeDateEmpty);
    const disabled = (to === '') || closeDateEmpty;
    if (reviewSendBtn) reviewSendBtn.disabled = disabled;
    if (btn) btn.disabled = disabled;
  } else if (screen === 'selection') {
    btn.innerText = 'Select Winning Option';
    btn.disabled = true; // Enabled when a card is selected
  } else if (screen === 'contract-review') {
    const to = document.getElementById('contract-msg-to').value.trim();
    btn.disabled = (to === ""); 
  }
}

function onSfOrderTypeChange() {
  const val = document.getElementById('sf-order-type')?.value;
  const msaRef = document.getElementById('sf-msa-ref');
  if (msaRef) msaRef.style.display = val === 'addon' ? '' : 'none';
}

function handleConvertToValuCal() {
  const orderType = document.getElementById('sf-order-type')?.value ?? 'new';
  if (orderType === 'addon') {
    proposalData.isAddOn = true;
    proposalData.msaId = DEMO_MSA.id;
    proposalData.msaEndDate = DEMO_MSA.endDate;
  } else {
    proposalData.isAddOn = false;
    proposalData.msaId = '';
    proposalData.msaEndDate = '';
  }
  const sfScreen = document.getElementById('sf-convert-screen');
  const vcAppUi = document.getElementById('vc-app-ui');
  if (sfScreen) sfScreen.classList.add('hidden');
  if (vcAppUi) vcAppUi.classList.remove('hidden');
  openAccountValidationScreen();
}

function handleStartProposal() {
  // Read order type so proposalData is seeded correctly (same as Convert)
  const orderType = document.getElementById('sf-order-type')?.value ?? 'new';
  if (orderType === 'addon') {
    proposalData.isAddOn = true;
    proposalData.msaId = DEMO_MSA.id;
    proposalData.msaEndDate = DEMO_MSA.endDate;
  } else {
    proposalData.isAddOn = false;
    proposalData.msaId = '';
    proposalData.msaEndDate = '';
  }
  openDraftingRoute();
}

function openDraftingRoute() {
  const sfScreen = document.getElementById('sf-convert-screen');
  const vcAppUi = document.getElementById('vc-app-ui');
  if (sfScreen) sfScreen.classList.add('hidden');
  if (vcAppUi) vcAppUi.classList.remove('hidden');

  screen = 'drafting';
  document.getElementById('screen-drafting')?.classList.remove('hidden');
  hideProposalReviewModal();
  document.getElementById('screen-proposal-selection')?.classList.add('hidden');
  document.getElementById('screen-contract')?.classList.add('hidden');
  document.getElementById('screen-deal-result')?.classList.add('hidden');

  document.getElementById('vc-body').style.paddingTop = '159px';
  document.getElementById('success-banner').style.top = '159px';

  const sendBtn = document.getElementById('footer-send');
  if (sendBtn) {
    sendBtn.classList.add('hidden');
    sendBtn.innerText = 'Send Proposal';
    sendBtn.onclick = handleSend;
  }
  const backBtn = document.getElementById('footer-back');
  backBtn?.classList.remove('visible');
  backBtn?.classList.add('hidden');
}

function applyInitialRoute() {
  const initialRoute = getInitialRoute();
  if (initialRoute === 'sf-convert') return;
  openDraftingRoute();
}

// ── PDF-style document scaling ───────────────────────────────────
// Documents are rendered at a fixed 794px page width and scaled
// via CSS transform to fit their container, like a PDF viewer.
function scaleDocPages() {
  document.querySelectorAll('.doc-page-outer').forEach(outer => {
    const page = outer.querySelector('.vc-doc-shell');
    if (!page) return;
    const containerW = outer.clientWidth;
    if (!containerW) return;
    const sidePad = 16;
    const availW = containerW - sidePad * 2;
    const scale = availW / 794;
    page.style.transform = `scale(${scale})`;
    page.style.transformOrigin = 'top left';
    page.style.marginLeft = sidePad + 'px';
    outer.style.height = Math.ceil(page.scrollHeight * scale + sidePad * 2) + 'px';
  });
}
window.addEventListener('resize', scaleDocPages);

// ── Initial render ──────────────────────────────────────────────
applyInitialRoute();
renderNav();
renderOptions();
updateApprovalSnackbar();
updateMarkDeadBtn();
renderAccountValidationScreen();
renderValidationPageStatus();
updateAccountBadgeFromValidation();
window.addEventListener('resize', updateOptionsGridAlignment);

window.__SINGLE_CASE_STUDIES_DOC = "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <title>Case Studies & ROI</title>\n  <style>\n\n@font-face {\n  font-family: 'Archivo';\n  src: url('https://cdn.jsdelivr.net/gh/catalinaypun/valu-cal-app@main/fonts/Verizon%20NHG%20eDS%20Light.ttf') format('truetype');\n  font-weight: 300;\n  font-style: normal;\n}\n@font-face {\n  font-family: 'Archivo';\n  src: url('https://cdn.jsdelivr.net/gh/catalinaypun/valu-cal-app@main/fonts/Verizon%20NHG%20eDS%20Regular.ttf') format('truetype');\n  font-weight: 400;\n  font-style: normal;\n}\n@font-face {\n  font-family: 'Archivo';\n  src: url('https://cdn.jsdelivr.net/gh/catalinaypun/valu-cal-app@main/fonts/Verizon%20NHG%20eDS%20Bold.ttf') format('truetype');\n  font-weight: 700;\n  font-style: normal;\n}\n\n:root {\n  --black: #000;\n  --white: #fff;\n  --stone: #f8f7f5;\n  --gray-100: #f3f3f4;\n  --gray-200: #dddad4;\n  --gray-400: #aaa7a3;\n  --gray-600: #716f6d;\n}\n\n* { box-sizing: border-box; }\nbody {\n  margin: 0;\n  font-family: \"Archivo\", Arial, sans-serif;\n  background: var(--white);\n  color: var(--black);\n}\n.page {\n  max-width: 1240px;\n  margin: 0 auto;\n  padding: 20px 20px 24px;\n}\n.top {\n  display: flex;\n  justify-content: flex-end;\n  align-items: center;\n  gap: 16px;\n  margin-bottom: 14px;\n}\n.search {\n  height: 44px;\n  width: 360px;\n  max-width: 100%;\n  border: 1px solid var(--black);\n  border-radius: 8px;\n  padding: 0 12px;\n  font-family: \"Archivo\", Arial, sans-serif;\n  font-size: 14px;\n}\n.tabs {\n  display: flex;\n  gap: 36px;\n  margin-bottom: 18px;\n  padding-bottom: 2px;\n  border-bottom: 1px solid var(--gray-200);\n}\n.tab {\n  border: none;\n  border-radius: 0;\n  height: 52px;\n  padding: 0;\n  background: transparent;\n  font-weight: 700;\n  font-family: \"Archivo\", Arial, sans-serif;\n  font-size: 16px;\n  line-height: 1;\n  letter-spacing: 0;\n  cursor: pointer;\n  color: var(--black);\n  position: relative;\n  display: inline-flex;\n  align-items: center;\n}\n.tab.active {\n  color: #e60020;\n}\n.tab.active::after {\n  content: \"\";\n  position: absolute;\n  left: 0;\n  right: 0;\n  bottom: -4px;\n  height: 7px;\n  border-radius: 999px;\n  background: #e60020;\n}\n.grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));\n  gap: 14px;\n}\n.card {\n  background: var(--white);\n  border: 1px solid var(--gray-200);\n  border-top-width: 4px;\n  border-radius: 8px;\n  padding: 16px;\n  box-shadow: 0 2px 8px rgba(0,0,0,0.04);\n}\n.card h3 {\n  margin: 0 0 8px;\n  font-size: 18px;\n  font-weight: 700;\n}\n.meta {\n  font-size: 11px;\n  color: var(--gray-600);\n  margin-bottom: 10px;\n  text-transform: uppercase;\n  letter-spacing: 0.2px;\n}\n.quote {\n  font-size: 13px;\n  line-height: 1.45;\n}\n.tags {\n  margin-top: 12px;\n  display: flex;\n  gap: 6px;\n  flex-wrap: wrap;\n}\n.tag {\n  font-size: 11px;\n  border: 1px solid var(--gray-200);\n  border-radius: 999px;\n  padding: 2px 8px;\n  background: var(--gray-100);\n  color: #3f3f46;\n}\n.view-btn {\n  margin-top: 12px;\n  border: none;\n  background: var(--black);\n  color: var(--white);\n  border-radius: 999px;\n  min-height: 36px;\n  padding: 8px 14px;\n  font-size: 12px;\n  font-weight: 700;\n  font-family: \"Archivo\", Arial, sans-serif;\n  cursor: pointer;\n}\n.overlay {\n  position: fixed;\n  inset: 0;\n  background: rgba(0,0,0,0.55);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  z-index: 4000;\n}\n.overlay.hidden {\n  display: none;\n}\n.detail {\n  width: min(760px, 94vw);\n  background: var(--white);\n  border-radius: 12px;\n  border: 1px solid var(--gray-200);\n  overflow: hidden;\n}\n.detail-header {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  background: var(--white);\n  color: var(--black);\n  padding: 12px 16px;\n  border-bottom: 1px solid var(--gray-200);\n}\n.detail-header h2 {\n  margin: 0;\n  font-size: 20px;\n  font-weight: 700;\n}\n.close-btn {\n  border: none;\n  background: transparent;\n  color: var(--black);\n  font-size: 22px;\n  line-height: 1;\n  cursor: pointer;\n}\n.close-btn:hover { opacity: 0.7; }\n.detail-body {\n  padding: 18px;\n}\n.company {\n  font-weight: 700;\n  margin: 0 0 8px;\n}\n.impact {\n  color: #1f6b45;\n  font-weight: 700;\n}\n.cols {\n  margin-top: 12px;\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 16px;\n}\n.cols h3 {\n  margin: 0 0 8px;\n}\n.cols ul {\n  margin: 0;\n  padding-left: 18px;\n}\n.watch {\n  display: inline-block;\n  margin-top: 16px;\n  text-decoration: none;\n  color: var(--white);\n  background: var(--black);\n  min-height: 36px;\n  padding: 9px 14px;\n  border-radius: 999px;\n  font-weight: 700;\n  font-size: 13px;\n}\n.empty {\n  background: var(--white);\n  border: 1px dashed var(--gray-200);\n  border-radius: 8px;\n  padding: 24px;\n  font-size: 13px;\n  color: var(--gray-600);\n}\n\n@media (max-width: 860px) {\n  .top { flex-direction: column; align-items: stretch; }\n  .search { width: 100%; }\n  .cols { grid-template-columns: 1fr; }\n  .tabs { gap: 16px; overflow-x: auto; }\n  .tab { font-size: 16px; height: 44px; white-space: nowrap; }\n  .tab.active::after { height: 5px; }\n}\n</style>\n</head>\n<body>\n  <main class=\"page\">\n    <header class=\"top\">\n      <input id=\"search\" class=\"search\" type=\"search\" placeholder=\"Search industry, company, or pain point...\" />\n    </header>\n\n    <div class=\"tabs\">\n      <button class=\"tab active\" data-tab=\"industry\">By Industry</button>\n      <button class=\"tab\" data-tab=\"roi\">By ROI / Pain Point</button>\n    </div>\n\n    <section id=\"grid\" class=\"grid\"></section>\n  </main>\n\n  <div id=\"detail-overlay\" class=\"overlay hidden\">\n    <article class=\"detail\">\n      <header class=\"detail-header\">\n        <h2 id=\"detail-title\"></h2>\n        <button id=\"close-detail\" class=\"close-btn\" type=\"button\" aria-label=\"Close\">&times;</button>\n      </header>\n      <div class=\"detail-body\">\n        <p id=\"detail-company\" class=\"company\"></p>\n        <p id=\"detail-quote\" class=\"quote\"></p>\n        <p id=\"detail-impact\" class=\"impact\"></p>\n        <div class=\"cols\">\n          <div>\n            <h3>Pain Points</h3>\n            <ul id=\"detail-pains\"></ul>\n          </div>\n          <div>\n            <h3>VZC Solutions</h3>\n            <ul id=\"detail-solutions\"></ul>\n          </div>\n        </div>\n        <a id=\"detail-link\" class=\"watch\" href=\"#\" target=\"_blank\" rel=\"noreferrer\">Watch Video / Open Case</a>\n      </div>\n    </article>\n  </div>\n\n  <script>\nconst CASES = [\n  {\n    id: \"landscaping\",\n    type: \"industry\",\n    title: \"Landscaping\",\n    color: \"#16a34a\",\n    company: \"Apex Landscaping\",\n    quote: \"GPS data helped verify real arrival/departure times and replace paper logs.\",\n    impact: \"Improved verification and reduced manual admin work.\",\n    painPoints: [\"Verify hours\", \"Prevent side jobs\", \"Protect equipment\"],\n    solutions: [\"Automated timesheets\", \"Proof of service\", \"Asset tracking\"],\n    link: \"https://www.verizonconnect.com/resources/case-study/apex-landscaping/\"\n  },\n  {\n    id: \"towing\",\n    type: \"industry\",\n    title: \"Towing\",\n    color: \"#f59e42\",\n    company: \"Wrecker Service\",\n    quote: \"PTO monitoring exposed unauthorized work and improved dispatch confidence.\",\n    impact: \"Recovered revenue and improved operational control.\",\n    painPoints: [\"Unauthorized jobs\", \"ETA pressure\", \"PTO monitoring\"],\n    solutions: [\"PTO alerts\", \"Closest-driver dispatch\", \"Route visibility\"],\n    link: \"https://www.youtube.com/watch?v=Anv6jqcmi34\"\n  },\n  {\n    id: \"transportation\",\n    type: \"industry\",\n    title: \"Transportation\",\n    color: \"#2563eb\",\n    company: \"Redwey Transport\",\n    quote: \"Geofencing and visibility improved payroll accuracy and compliance.\",\n    impact: \"Better ELD compliance and safer operations.\",\n    painPoints: [\"Passenger safety\", \"Billable-hour verification\", \"Compliance pressure\"],\n    solutions: [\"Driver behavior monitoring\", \"Arrival/departure proof\", \"Automated reporting\"],\n    link: \"https://www.verizonconnect.com/resources/case-study/redwey-transport/\"\n  },\n  {\n    id: \"plumbing_hvac\",\n    type: \"industry\",\n    title: \"Plumbing & HVAC\",\n    color: \"#0891b2\",\n    company: \"Bill Howe Plumbing\",\n    quote: \"Fleet visibility helped significantly reduce annual accidents.\",\n    impact: \"Lower risk exposure and improved dispatch efficiency.\",\n    painPoints: [\"Emergency response\", \"Hours verification\", \"After-hours usage\"],\n    solutions: [\"Closest-driver routing\", \"Time verification\", \"Usage oversight\"],\n    link: \"https://www.verizonconnect.com/resources/case-study/bill-howe-plumbing-decreases-annual-accidents/\"\n  },\n  {\n    id: \"pest_control\",\n    type: \"industry\",\n    title: \"Pest Control\",\n    color: \"#047857\",\n    company: \"Pest & Termite Consultants\",\n    quote: \"Proof-of-service reporting helped resolve customer disputes instantly.\",\n    impact: \"Higher trust and fewer service disputes.\",\n    painPoints: [\"No-show claims\", \"Tech tracking\", \"Route inefficiency\"],\n    solutions: [\"Proof of service\", \"Route replay\", \"Faster customer response\"],\n    link: \"https://www.verizonconnect.com/resources/case-study/pest-termite-consultants/\"\n  },\n  {\n    id: \"construction\",\n    type: \"industry\",\n    title: \"Construction\",\n    color: \"#eab308\",\n    company: \"J&M Contracting\",\n    quote: \"An alert led to quick recovery of high-value equipment.\",\n    impact: \"$50K asset protected from theft loss.\",\n    painPoints: [\"Asset theft\", \"Unverified usage\", \"Job cost control\"],\n    solutions: [\"Asset tracking\", \"Geofences\", \"Utilization reports\"],\n    link: \"https://www.verizonconnect.com/resources/case-study/jm-contracting/\"\n  },\n  {\n    id: \"oil_fields\",\n    type: \"industry\",\n    title: \"Oil Fields\",\n    color: \"#374151\",\n    company: \"3C Oilfield Services\",\n    quote: \"Knowing teammate locations improved incident response in remote areas.\",\n    impact: \"Improved lone-worker safety and response readiness.\",\n    painPoints: [\"Remote operations\", \"Lone worker risk\", \"Asset maintenance\"],\n    solutions: [\"Live location visibility\", \"Safer dispatch\", \"Maintenance scheduling\"],\n    link: \"https://www.verizonconnect.com/resources/case-study/3c-oilfield-services-llc/\"\n  },\n  {\n    id: \"safety\",\n    type: \"roi\",\n    title: \"Safety & Insurance\",\n    color: \"#1d4ed8\",\n    company: \"B.A.M. Trucking\",\n    quote: \"Video evidence helped contest claims and lower insurance exposure.\",\n    impact: \"Reduced risk and supported claims defense.\",\n    painPoints: [\"False claims\", \"Insurance costs\", \"Driver safety\"],\n    solutions: [\"Dashcams\", \"Safety coaching\", \"Driver scorecards\"],\n    link: \"https://www.verizonconnect.com/resources/case-study/bam-trucking/\"\n  },\n  {\n    id: \"theft\",\n    type: \"roi\",\n    title: \"Theft & Asset Recovery\",\n    color: \"#dc2626\",\n    company: \"J&M Contracting\",\n    quote: \"Location data enabled fast police support and asset recovery.\",\n    impact: \"Reduced theft downtime and avoided replacement costs.\",\n    painPoints: [\"Asset theft\", \"High deductibles\", \"Unauthorized usage\"],\n    solutions: [\"Movement alerts\", \"Geofence breaches\", \"Asset trackers\"],\n    link: \"https://www.verizonconnect.com/resources/case-study/jm-contracting/\"\n  },\n  {\n    id: \"payroll\",\n    type: \"roi\",\n    title: \"Payroll Savings\",\n    color: \"#15803d\",\n    company: \"Concrete Coring Company\",\n    quote: \"Automated time verification reduced payroll leakage.\",\n    impact: \"Lower labor waste and cleaner time records.\",\n    painPoints: [\"Manual logs\", \"Rounded timecards\", \"Overtime uncertainty\"],\n    solutions: [\"Automated timestamps\", \"Route history checks\", \"Smart reports\"],\n    link: \"https://www.verizonconnect.com/resources/case-study/fleetmatics-gps-tracking-helps-concrete-coring-company-beat-economic-recession/\"\n  },\n  {\n    id: \"fuel\",\n    type: \"roi\",\n    title: \"Fuel Savings\",\n    color: \"#4f46e5\",\n    company: \"Tree-care Company\",\n    quote: \"Route and idling controls reduced monthly fuel spend significantly.\",\n    impact: \"Approx. $2,000 monthly fuel savings.\",\n    painPoints: [\"Idling\", \"Inefficient routes\", \"Traffic delays\"],\n    solutions: [\"Idling alerts\", \"Route optimization\", \"Traffic overlays\"],\n    link: \"https://www.verizonconnect.com/resources/case-study/tree-care-company-cuts-fuel-costs-by-2000-a-month-with-gps-fleet-management/\"\n  },\n  {\n    id: \"revenue\",\n    type: \"roi\",\n    title: \"Increase Revenue\",\n    color: \"#9333ea\",\n    company: \"Pool Sure\",\n    quote: \"Fleet optimization enabled more daily jobs without adding vehicles.\",\n    impact: \"Higher daily capacity and stronger utilization.\",\n    painPoints: [\"Missed opportunities\", \"Limited emergency capacity\", \"Low utilization\"],\n    solutions: [\"Nearest-tech dispatch\", \"More jobs per day\", \"Fleet visibility\"],\n    link: \"https://www.verizonconnect.com/resources/case-study/poolsure/\"\n  }\n];\n\nlet activeType = \"industry\";\nlet searchText = \"\";\nlet selected = null;\n\nconst grid = document.getElementById(\"grid\");\nconst search = document.getElementById(\"search\");\nconst tabs = Array.from(document.querySelectorAll(\".tab\"));\n\nconst detailOverlay = document.getElementById(\"detail-overlay\");\nconst detailTitle = document.getElementById(\"detail-title\");\nconst detailCompany = document.getElementById(\"detail-company\");\nconst detailQuote = document.getElementById(\"detail-quote\");\nconst detailImpact = document.getElementById(\"detail-impact\");\nconst detailPains = document.getElementById(\"detail-pains\");\nconst detailSolutions = document.getElementById(\"detail-solutions\");\nconst detailLink = document.getElementById(\"detail-link\");\nconst closeDetail = document.getElementById(\"close-detail\");\n\nfunction getFiltered() {\n  return CASES.filter((item) => item.type === activeType).filter((item) => {\n    if (!searchText) return true;\n    const s = searchText.toLowerCase();\n    return (\n      item.title.toLowerCase().includes(s) ||\n      item.company.toLowerCase().includes(s) ||\n      item.quote.toLowerCase().includes(s) ||\n      item.painPoints.some((p) => p.toLowerCase().includes(s))\n    );\n  });\n}\n\nfunction renderCards() {\n  const items = getFiltered();\n  if (items.length === 0) {\n    grid.innerHTML = '<div class=\"empty\">No case studies found for this filter.</div>';\n    return;\n  }\n  grid.innerHTML = items\n    .map(\n      (item) => `\n      <article class=\"card\" style=\"border-top-color:${item.color}\">\n        <div class=\"meta\">${item.type === \"industry\" ? \"Industry\" : \"ROI / Pain Point\"}</div>\n        <h3>${item.title}</h3>\n        <p class=\"quote\"><strong>${item.company}:</strong> \"${item.quote}\"</p>\n        <div class=\"tags\">${item.painPoints.map((p) => `<span class=\"tag\">${p}</span>`).join(\"\")}</div>\n        <button class=\"view-btn\" type=\"button\" data-id=\"${item.id}\">View Details</button>\n      </article>\n    `\n    )\n    .join(\"\");\n\n  Array.from(document.querySelectorAll(\".view-btn\")).forEach((btn) => {\n    btn.addEventListener(\"click\", () => openDetail(btn.dataset.id));\n  });\n}\n\nfunction openDetail(id) {\n  selected = CASES.find((c) => c.id === id);\n  if (!selected) return;\n  detailTitle.textContent = selected.title;\n  detailCompany.textContent = selected.company;\n  detailQuote.textContent = `\"${selected.quote}\"`;\n  detailImpact.textContent = `Impact: ${selected.impact}`;\n  detailPains.innerHTML = selected.painPoints.map((p) => `<li>${p}</li>`).join(\"\");\n  detailSolutions.innerHTML = selected.solutions.map((s) => `<li>${s}</li>`).join(\"\");\n  detailLink.href = selected.link || \"#\";\n  detailOverlay.classList.remove(\"hidden\");\n}\n\nfunction closeModal() {\n  detailOverlay.classList.add(\"hidden\");\n  selected = null;\n}\n\nsearch.addEventListener(\"input\", (e) => {\n  searchText = e.target.value.trim();\n  renderCards();\n});\n\ntabs.forEach((tab) => {\n  tab.addEventListener(\"click\", () => {\n    activeType = tab.dataset.tab;\n    tabs.forEach((t) => t.classList.toggle(\"active\", t === tab));\n    renderCards();\n  });\n});\n\ncloseDetail.addEventListener(\"click\", closeModal);\ndetailOverlay.addEventListener(\"click\", (e) => {\n  if (e.target === detailOverlay) closeModal();\n});\n\nrenderCards();\n<\/script>\n</body>\n</html>";
window.__SINGLE_RESOURCES_DOC = "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <title>Resources</title>\n  <style>\n\n@font-face {\n  font-family: 'Archivo';\n  src: url('https://cdn.jsdelivr.net/gh/catalinaypun/valu-cal-app@main/fonts/Verizon%20NHG%20eDS%20Light.ttf') format('truetype');\n  font-weight: 300;\n  font-style: normal;\n}\n@font-face {\n  font-family: 'Archivo';\n  src: url('https://cdn.jsdelivr.net/gh/catalinaypun/valu-cal-app@main/fonts/Verizon%20NHG%20eDS%20Regular.ttf') format('truetype');\n  font-weight: 400;\n  font-style: normal;\n}\n@font-face {\n  font-family: 'Archivo';\n  src: url('https://cdn.jsdelivr.net/gh/catalinaypun/valu-cal-app@main/fonts/Verizon%20NHG%20eDS%20Bold.ttf') format('truetype');\n  font-weight: 700;\n  font-style: normal;\n}\n\n:root {\n  --black: #000;\n  --white: #fff;\n  --stone: #f8f7f5;\n  --gray-100: #f3f3f4;\n  --gray-200: #dddad4;\n  --gray-400: #aaa7a3;\n  --gray-600: #716f6d;\n  --red: #e60020;\n}\n\n* { box-sizing: border-box; }\nbody {\n  margin: 0;\n  font-family: \"Archivo\", Arial, sans-serif;\n  background: var(--white);\n  color: var(--black);\n}\n.resources-page {\n  max-width: 1220px;\n  margin: 0 auto;\n  padding: 20px;\n}\n.resources-head p {\n  margin: 6px 0 14px;\n  color: var(--gray-600);\n  font-size: 13px;\n}\n.resources-tabs {\n  display: flex;\n  gap: 36px;\n  border-bottom: 1px solid var(--gray-200);\n  margin-bottom: 14px;\n  padding-bottom: 2px;\n}\n.r-tab {\n  border: none;\n  background: transparent;\n  font-family: \"Archivo\", Arial, sans-serif;\n  font-size: 16px;\n  font-weight: 700;\n  height: 52px;\n  padding: 0;\n  color: var(--black);\n  position: relative;\n  cursor: pointer;\n  display: inline-flex;\n  align-items: center;\n}\n.r-tab.active { color: var(--red); }\n.r-tab.active::after {\n  content: \"\";\n  position: absolute;\n  left: 0;\n  right: 0;\n  bottom: -4px;\n  height: 6px;\n  border-radius: 999px;\n  background: var(--red);\n}\n\n.resources-content { min-height: 300px; }\n.search {\n  width: min(440px, 100%);\n  height: 44px;\n  border: 1px solid var(--black);\n  border-radius: 8px;\n  padding: 0 12px;\n  margin-bottom: 12px;\n  font-family: \"Archivo\", Arial, sans-serif;\n}\n.deck {\n  border: 1px solid var(--gray-200);\n  border-radius: 8px;\n  overflow: hidden;\n  background: var(--white);\n  margin-bottom: 12px;\n}\n.deck-title {\n  padding: 10px 12px;\n  background: var(--gray-100);\n  font-size: 12px;\n  font-weight: 700;\n  letter-spacing: 0.2px;\n}\n.deck-row {\n  display: flex;\n  justify-content: space-between;\n  gap: 10px;\n  align-items: center;\n  border-top: 1px solid var(--gray-200);\n  padding: 9px 12px;\n  font-size: 12px;\n}\n.code {\n  font-family: Menlo, Consolas, monospace;\n  font-size: 11px;\n}\n.copy-btn {\n  border: 1.5px solid var(--black);\n  border-radius: 999px;\n  min-height: 30px;\n  padding: 5px 12px;\n  background: var(--white);\n  cursor: pointer;\n  font-size: 11px;\n  font-weight: 700;\n  font-family: \"Archivo\", Arial, sans-serif;\n}\n.copy-btn:hover {\n  background: #f5f5f5;\n}\n\n.table-wrap {\n  border: 1px solid var(--gray-200);\n  border-radius: 8px;\n  background: var(--white);\n  overflow: auto;\n  margin-bottom: 12px;\n}\ntable {\n  width: 100%;\n  border-collapse: collapse;\n  min-width: 760px;\n}\nth, td {\n  border-bottom: 1px solid var(--gray-200);\n  padding: 10px 10px;\n  font-size: 12px;\n  text-align: right;\n}\nth:first-child, td:first-child { text-align: left; }\nthead th {\n  background: var(--white);\n  font-weight: 700;\n  font-size: 16px;\n  letter-spacing: 0.2px;\n  border-bottom: 1px solid var(--black);\n}\n.empty {\n  border: 1px dashed var(--gray-200);\n  background: var(--white);\n  border-radius: 8px;\n  padding: 18px;\n  font-size: 13px;\n  color: var(--gray-600);\n}\n\n@media (max-width: 860px) {\n  .resources-tabs { gap: 16px; overflow-x: auto; }\n  .r-tab { font-size: 16px; height: 44px; white-space: nowrap; }\n  .r-tab.active::after { height: 5px; bottom: -3px; }\n}\n\n</style>\n</head>\n<body>\n  <main class=\"resources-page\">\n    <header class=\"resources-head\">\n      <p>Reference content for pricing and promo support.</p>\n    </header>\n\n    <div class=\"resources-tabs\">\n      <button class=\"r-tab active\" data-tab=\"promo\">Promo codes</button>\n      <button class=\"r-tab\" data-tab=\"std\">Standard pricing</button>\n      <button class=\"r-tab\" data-tab=\"evc\">EVC pricing</button>\n      <button class=\"r-tab\" data-tab=\"eft\">EFT</button>\n    </div>\n\n    <section id=\"resources-content\" class=\"resources-content\"></section>\n  </main>\n\n  <script>\nconst promoCategories = [\n  { title: \"Standard 1st Pitch\", codes: [\"FLEX LevelUp 1st Pitch: STND no MF / 12M\", \"FLEX LevelUp 1st Pitch: STND no MF / 24M\", \"FLEX LevelUp 1st Pitch: STND w/MF / 36M\"] },\n  { title: \"Standard 2nd Pitch\", codes: [\"FLEX LevelUp 2nd Pitch: STND % DISC / 24M\", \"FLEX LevelUp 2nd Pitch: STND % DISC / 36M\", \"FLEX LevelUp 2nd Pitch: STND % DISC / 48M\"] },\n  { title: \"Media\", codes: [\"FLEX LevelUp PREF % DISC - MEDIA / 12M\", \"FLEX LevelUp PREF % DISC - MEDIA / 24M\", \"FLEX LevelUp PREF % DISC - MEDIA / 36M\"] },\n  { title: \"GROUP\", codes: [\"FLEX LevelUp PREF % DISC - GROUP / 12M\", \"FLEX LevelUp PREF % DISC - GROUP / 24M\", \"FLEX LevelUp PREF % DISC - GROUP / 36M\"] }\n];\n\nconst stdRows = [\n  { name: \"Vehicle Tracking - Standalone\", p12: 57.26, p24: 48.63, p36: 44.42, p48: 42.38, p60: 40.75 },\n  { name: \"Forward/Road Facing Cam\", p12: 47.27, p24: 38.14, p36: 33.76, p48: 31.72, p60: 30.09 },\n  { name: \"Dual Cam\", p12: 52.27, p24: 43.14, p36: 38.76, p48: 36.72, p60: 35.09 },\n  { name: \"Powered Asset Tracking\", p12: 34.50, p24: 26.25, p36: 22.17, p48: 20.63, p60: 19.50 }\n];\n\nconst evcRows = [\n  { name: \"DVR & Rear Camera Bundle\", p12: 69.54, p24: 53.28, p36: 46.51, p48: 43.43, p60: 41.18 },\n  { name: \"DVR / Rear / Cargo\", p12: 89.81, p24: 66.42, p36: 57.27, p48: 53.15, p60: 50.27 },\n  { name: \"DVR / Rear / 2 Sides\", p12: 110.08, p24: 79.56, p36: 68.03, p48: 62.86, p60: 59.36 }\n];\n\nconst eftRows = [\n  { name: \"Vehicle Tracking\", total: 366, p12: 30.50, p24: 15.25, p36: 10.17, p48: 7.63, p60: 6.10 },\n  { name: \"Forward/Road Facing Cam\", total: 546, p12: 45.50, p24: 22.75, p36: 15.17, p48: 11.38, p60: 9.10 },\n  { name: \"Dual Cam\", total: 582, p12: 48.50, p24: 24.25, p36: 16.17, p48: 12.13, p60: 9.70 },\n  { name: \"Powered Assets\", total: 330, p12: 27.50, p24: 13.75, p36: 9.17, p48: 6.88, p60: 5.50 }\n];\n\nconst content = document.getElementById(\"resources-content\");\nconst tabs = Array.from(document.querySelectorAll(\".r-tab\"));\nlet activeTab = \"promo\";\n\nfunction fmt(n) {\n  return typeof n === \"number\" ? `${n.toFixed(2)}` : n;\n}\n\nfunction renderTable(rows, includeTotal = false) {\n  const head = includeTotal\n    ? \"<tr><th>Product</th><th>Total</th><th>12M</th><th>24M</th><th>36M</th><th>48M</th><th>60M</th></tr>\"\n    : \"<tr><th>Product</th><th>12M</th><th>24M</th><th>36M</th><th>48M</th><th>60M</th></tr>\";\n  const body = rows.map((r) => includeTotal\n    ? `<tr><td>${r.name}</td><td>${fmt(r.total)}</td><td>${fmt(r.p12)}</td><td>${fmt(r.p24)}</td><td>${fmt(r.p36)}</td><td>${fmt(r.p48)}</td><td>${fmt(r.p60)}</td></tr>`\n    : `<tr><td>${r.name}</td><td>${fmt(r.p12)}</td><td>${fmt(r.p24)}</td><td>${fmt(r.p36)}</td><td>${fmt(r.p48)}</td><td>${fmt(r.p60)}</td></tr>`\n  ).join(\"\");\n  return `<div class=\"table-wrap\"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;\n}\n\nfunction renderPromo() {\n  content.innerHTML = `\n    <input id=\"promo-search\" class=\"search\" placeholder=\"Search promo codes...\" />\n    <div id=\"promo-list\"></div>\n  `;\n  const search = document.getElementById(\"promo-search\");\n  const list = document.getElementById(\"promo-list\");\n\n  function draw() {\n    const q = (search.value || \"\").trim().toLowerCase();\n    const filtered = promoCategories\n      .map((cat) => ({ ...cat, codes: cat.codes.filter((c) => c.toLowerCase().includes(q)) }))\n      .filter((cat) => cat.codes.length > 0);\n    if (filtered.length === 0) {\n      list.innerHTML = '<div class=\"empty\">No promo codes match this search.</div>';\n      return;\n    }\n    list.innerHTML = filtered.map((cat) => `\n      <section class=\"deck\">\n        <div class=\"deck-title\">${cat.title}</div>\n        ${cat.codes.map((code) => `\n          <div class=\"deck-row\">\n            <div class=\"code\">${code}</div>\n            <button class=\"copy-btn\" data-code=\"${code.replace(/\"/g, \"&quot;\")}\">Copy</button>\n          </div>\n        `).join(\"\")}\n      </section>\n    `).join(\"\");\n\n    Array.from(list.querySelectorAll(\".copy-btn\")).forEach((btn) => {\n      btn.addEventListener(\"click\", async () => {\n        const code = btn.dataset.code || \"\";\n        try {\n          await navigator.clipboard.writeText(code);\n          btn.textContent = \"Copied\";\n          setTimeout(() => { btn.textContent = \"Copy\"; }, 900);\n        } catch {\n          btn.textContent = \"Copy failed\";\n          setTimeout(() => { btn.textContent = \"Copy\"; }, 1000);\n        }\n      });\n    });\n  }\n\n  search.addEventListener(\"input\", draw);\n  draw();\n}\n\nfunction renderActive() {\n  if (activeTab === \"promo\") return renderPromo();\n  if (activeTab === \"std\") {\n    content.innerHTML = renderTable(stdRows);\n    return;\n  }\n  if (activeTab === \"evc\") {\n    content.innerHTML = renderTable(evcRows);\n    return;\n  }\n  content.innerHTML = renderTable(eftRows, true);\n}\n\ntabs.forEach((tab) => {\n  tab.addEventListener(\"click\", () => {\n    activeTab = tab.dataset.tab;\n    tabs.forEach((t) => t.classList.toggle(\"active\", t === tab));\n    renderActive();\n  });\n});\n\nrenderActive();\n\n<\/script>\n</body>\n</html>\n";

window.openCaseStudiesModal = function openCaseStudiesModalSingle() {
  const overlay = document.getElementById('case-studies-overlay');
  if (!overlay) return;
  const frame = document.getElementById('case-studies-frame');
  if (frame) frame.setAttribute('srcdoc', window.__SINGLE_CASE_STUDIES_DOC || '');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.openResourcesModal = function openResourcesModalSingle() {
  const overlay = document.getElementById('resources-overlay');
  if (!overlay) return;
  const frame = document.getElementById('resources-frame');
  if (frame) frame.setAttribute('srcdoc', window.__SINGLE_RESOURCES_DOC || '');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
};


(function() {
  'use strict';

  // ── Demo state ──────────────────────────────────────────────
  window.demoState = {
    account: {
      name:    'Apex Construction LLC',
      sfId:    'SF-001-APEX-2024',
      contact: 'Taylor Brooks',
      title:   'Fleet Manager',
      email:   'tbrooks@apexconstruction.com',
      segment: 'SMB'
    },
    deal:      null,
    contract:  null,
    signature: null,
    salesforce: null
  };

  var DEMO_SYSTEMS = [
    { key: 'valuecal',   label: 'ValuCal',    sub: 'Pricing Engine' },
    { key: 'dealhub',    label: 'DealHub',    sub: 'CPQ + Contract' },
    { key: 'docusign',   label: 'DocuSign',   sub: 'eSign' },
    { key: 'salesforce', label: 'Salesforce', sub: 'Closed Won' }
  ];
  var activeDemoSystem = 'valuecal';
  var completedSystems = [];

  // ── Lifecycle bar ───────────────────────────────────────────
  function renderLifecycleBar() {
    var container = document.getElementById('demo-lc-systems');
    if (!container) return;
    var activeIdx = DEMO_SYSTEMS.findIndex(function(s) { return s.key === activeDemoSystem; });
    var html = '';
    DEMO_SYSTEMS.forEach(function(sys, i) {
      if (i > 0) html += '<span class="demo-lc-arrow">&#x203A;</span>';
      var cls = 'demo-lc-sys';
      if (i < activeIdx)   cls += ' done';
      else if (i === activeIdx) cls += ' active';
      else                  cls += ' future';
      html += '<div class="' + cls + '" onclick="demoNavBack(\'' + sys.key + '\')">';
      html += '<div class="demo-lc-dot"></div>' + sys.label;
      html += '</div>';
    });
    container.innerHTML = html;
  }

  window.demoNavBack = function(key) {
    var currentIdx = DEMO_SYSTEMS.findIndex(function(s) { return s.key === activeDemoSystem; });
    var targetIdx  = DEMO_SYSTEMS.findIndex(function(s) { return s.key === key; });
    if (targetIdx >= currentIdx) return; // no skipping forward
    setActiveSystem(key);
  };

  window.setActiveSystem = function(key) {
    activeDemoSystem = key;
    renderLifecycleBar();
    // Hide all system screens
    document.querySelectorAll('.demo-sys-screen').forEach(function(el) {
      el.classList.remove('open');
    });
    // Show/hide ValuCal UI (not the shell — the shell contains demo elements too)
    var vcAppUi  = document.getElementById('vc-app-ui');
    var sfConvert = document.getElementById('sf-convert-screen');
    if (key === 'valuecal') {
      if (vcAppUi) vcAppUi.classList.remove('hidden');
      // sfConvert stays as-is (user navigates it naturally)
    } else {
      // Close any open ValuCal overlays so they don't block the bridge or target screen
      document.querySelectorAll('.overlay.open').forEach(function(el) {
        el.classList.remove('open');
      });
      document.body.style.overflow = '';
      if (vcAppUi) vcAppUi.classList.add('hidden');
      if (sfConvert) sfConvert.classList.add('hidden');
      var screenId = 'screen-' + (key === 'salesforce' ? 'sf-closed' : key);
      var screen = document.getElementById(screenId);
      if (screen) screen.classList.add('open');
    }
  };

  // ── Bridge overlay ──────────────────────────────────────────
  var _bridgeContinueFn = null;

  window.showBridge = function(fromLabel, toLabel, payload, continueFn) {
    _bridgeContinueFn = continueFn;
    // Close any open ValuCal modals so they don't block the bridge overlay
    document.querySelectorAll('.overlay.open').forEach(function(el) {
      el.classList.remove('open');
    });
    document.body.style.overflow = '';
    var overlay = document.getElementById('demo-bridge-overlay');
    if (!overlay) { if (typeof continueFn === 'function') continueFn(); return; }

    document.getElementById('demo-bridge-from').textContent = fromLabel;
    document.getElementById('demo-bridge-to').textContent   = toLabel;

    var rowsHtml = payload.map(function(item) {
      return '<div class="demo-bridge-row">' +
        '<div class="demo-bridge-key">' + item[0] + '</div>' +
        '<div class="demo-bridge-val">' + item[1] + '</div>' +
        '</div>';
    }).join('');
    document.getElementById('demo-bridge-payload-rows').innerHTML = rowsHtml;

    var statusEl  = document.getElementById('demo-bridge-status');
    var continueBtn = document.getElementById('demo-bridge-continue');
    statusEl.className = 'demo-bridge-status sending';
    statusEl.innerHTML = '<span class="material-symbols-outlined">sync</span> Sending data payload&hellip;';
    continueBtn.classList.remove('visible');

    overlay.classList.add('open');

    setTimeout(function() {
      statusEl.className = 'demo-bridge-status received';
      statusEl.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Received &#10003; &mdash; Ready to continue';
      continueBtn.classList.add('visible');
    }, 1500);
  };

  window.bridgeContinue = function() {
    var overlay = document.getElementById('demo-bridge-overlay');
    if (overlay) overlay.classList.remove('open');
    var fn = _bridgeContinueFn;
    _bridgeContinueFn = null;
    if (typeof fn === 'function') setTimeout(fn, 300);
  };

  // ── Shared helper: build demoState.deal from ValuCal globals ─
  function buildDealState() {
    var pd   = (typeof proposalData !== 'undefined') ? proposalData : {};
    var opts = (typeof options !== 'undefined') ? options : [];
    // selectedOpt is set by enterContractScreen before confirmAndLockDeal is called
    var opt  = (typeof selectedOpt !== 'undefined' && selectedOpt) ? selectedOpt : null;
    // Also try bld.selectedOptionId as fallback
    if (!opt) {
      var selId = (typeof bld !== 'undefined') ? bld.selectedOptionId : null;
      if (selId != null) opt = opts.find(function(o) { return o.id === selId; }) || null;
    }
    var fleet = 0, monthly = 0, termMonths = 36, promoType = 'Standard';
    var optNum = opt ? (opts.findIndex(function(o) { return o.id === opt.id; }) + 1) : 1;
    if (optNum < 1) optNum = 1;
    if (opt && opt.bundles && opt.bundles.length) {
      fleet = opt.bundles.reduce(function(s, b) { return s + (b.qty || 0); }, 0);
      termMonths = parseInt(opt.term || pd.contractType || 36) || 36;
      promoType  = opt.promoType || pd.promoType || 'Standard';
      try {
        var promo = (typeof getOptionPromotion === 'function') ? getOptionPromotion(opt) : null;
        var calc  = (typeof calcOption === 'function') ? calcOption(opt, promo, pd.forcedTierIndex) : null;
        if (calc && calc.totalMonthly) monthly = calc.totalMonthly;
      } catch (e) {}
    }
    if (!fleet)   fleet   = 23;
    if (!monthly) monthly = 736;
    var unitPrice  = fleet > 0 ? monthly / fleet : 0;
    var contractId = 'DH-' + new Date().getFullYear() + '-' + (Math.floor(Math.random() * 90000) + 10000);
    demoState.deal = {
      optionLabel: 'Option ' + optNum, optionId: opt ? opt.id : null,
      fleet: fleet, unitPrice: unitPrice, monthly: monthly, term: termMonths,
      promoType: promoType, totalContract: monthly * termMonths, contractId: contractId
    };
  }

  function launchBridgeToDealHub() {
    var d = demoState.deal, a = demoState.account;
    var fmt2 = function(n) { return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
    window.showBridge('ValuCal', 'DealHub', [
      ['Account',      a.name],
      ['Opportunity',  d.optionLabel],
      ['Fleet Size',   d.fleet + ' vehicles'],
      ['Unit Price',   '$' + fmt2(d.unitPrice) + '/unit/mo'],
      ['Monthly',      '$' + fmt2(d.monthly) + '/mo'],
      ['Term',         d.term + ' months'],
      ['Promo',        d.promoType],
      ['Contract ID',  d.contractId]
    ], window.openDealHub);
  }

  // ── Bridge shortcut — assigned here so it's always available ─
  window.demoLaunchBridgeShortcut = function() {
    document.querySelectorAll('.custom-dropdown').forEach(function(m) { m.classList.add('hidden'); });
    buildDealState();
    launchBridgeToDealHub();
  };

  // ── Bridge overrides removed ─────────────────────────────────
  // confirmAndLockDeal and openFulfillmentModal now run natively in ValuCal.
  // The DealHub/DocuSign/SF demo screens are accessible via the "System tour"
  // button on the Deal Result screen (calls launchBridgeToDealHub() directly).

  // ── DealHub functions ───────────────────────────────────────
  window.openDealHub = function() {
    setActiveSystem('dealhub');
    populateDealHub();
  };

  function fmtMoney(n) {
    return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  window.populateDealHub = function() {
    if (!demoState.deal) return;
    var d = demoState.deal, a = demoState.account;

    function setTxt(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

    setTxt('dh-acct-name',     a.name);
    setTxt('dh-contact-name',  a.contact);
    setTxt('dh-contract-id',   d.contractId);
    setTxt('dh-contract-id-label', d.contractId);
    setTxt('dh-opp-label',     d.optionLabel);
    setTxt('dh-fleet-size',    d.fleet + ' units');
    setTxt('dh-promo-type',    d.promoType);
    setTxt('dh-contract-term', d.term + ' months (Flex)');
    setTxt('dh-monthly-val',   fmtMoney(d.monthly) + '/mo');
    setTxt('dh-total-val',     fmtMoney(d.totalContract));

    // Product table
    var tbody = document.getElementById('dh-product-table-body');
    if (tbody) {
      tbody.innerHTML =
        '<tr>' +
        '<td>VTU-Dual AI Dashcam</td>' +
        '<td class="mono">VTU-DUAL-HD-AI</td>' +
        '<td>' + d.fleet + '</td>' +
        '<td>SaaS Subscription</td>' +
        '<td class="right">' + fmtMoney(d.unitPrice) + '</td>' +
        '<td class="right bold">' + fmtMoney(d.monthly) + '</td>' +
        '</tr>';
    }

    // Default expiry = 14 days from now
    var expInput = document.getElementById('dh-expiration-date');
    if (expInput && !expInput.value) {
      var exp = new Date(); exp.setDate(exp.getDate() + 14);
      expInput.value = exp.toISOString().split('T')[0];
      expInput.min   = new Date().toISOString().split('T')[0];
    }

    // Pre-fill signer email
    var emailInput = document.getElementById('dh-signer-email');
    if (emailInput && !emailInput.value) emailInput.value = a.email;

    // Status pill
    var pill = document.getElementById('dh-status-pill');
    if (pill) { pill.textContent = 'Ready'; pill.className = 'dh-status-pill sent'; }
  };

  window.dhSendToDocuSign = function() {
    if (!demoState.deal) return;
    var d = demoState.deal, a = demoState.account;
    var expInput   = document.getElementById('dh-expiration-date');
    var expDate    = expInput ? expInput.value : '';
    var emailInput = document.getElementById('dh-signer-email');
    var signerEmail = emailInput ? emailInput.value : a.email;

    var envelopeId = 'DS-' + (Math.floor(Math.random() * 900000) + 100000);
    var now = new Date().toLocaleString('en-US', {month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});

    demoState.contract = {
      id:          d.contractId,
      generatedAt: now,
      expiresAt:   expDate,
      status:      'Sent for Signature'
    };
    demoState.signature = {
      envelopeId:  envelopeId,
      status:      'pending',
      signerName:  a.contact,
      signerEmail: signerEmail
    };

    showBridge('DealHub', 'DocuSign', [
      ['Envelope ID',   '<code>' + envelopeId + '</code>'],
      ['Document',      'MSA Contract &middot; ' + d.contractId],
      ['Signer',        a.contact + ' &lt;' + signerEmail + '&gt;'],
      ['Account',       a.name],
      ['Contract Value', fmtMoney(d.monthly) + '/mo &times; ' + d.term + ' mo'],
      ['Expires',       expDate || 'Not set'],
      ['Delivery',      'Email &rarr; DocuSign secure link']
    ], openDocuSign);
  };

  // ── DocuSign functions ──────────────────────────────────────
  window.openDocuSign = function() {
    setActiveSystem('docusign');
    populateDocuSign();
  };

  var dsSignState = { sig: false, init1: false, init2: false };

  window.populateDocuSign = function() {
    if (!demoState.signature || !demoState.deal) return;
    var d = demoState.deal, a = demoState.account, c = demoState.contract, ds = demoState.signature;

    function setTxt(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

    setTxt('ds-envelope-id-display', ds.envelopeId);
    setTxt('ds-signer-display',      a.contact);
    setTxt('ds-doc-contract-id',     'Contract #' + d.contractId);
    setTxt('ds-doc-generated',       c ? c.generatedAt : '—');
    setTxt('ds-doc-account',         a.name);
    setTxt('ds-doc-contact',         a.contact + ', ' + a.title);
    setTxt('ds-doc-fleet',           d.fleet);
    setTxt('ds-doc-unit-price',      fmtMoney(d.unitPrice));
    setTxt('ds-doc-monthly',         fmtMoney(d.monthly));
    setTxt('ds-doc-term',            d.term + ' months (Flex)');
    setTxt('ds-doc-total',           fmtMoney(d.totalContract));
    setTxt('ds-doc-promo',           d.promoType);
    setTxt('ds-doc-expires',         c ? (c.expiresAt || '—') : '—');
    setTxt('ds-vzc-date',            new Date().toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}));

    // Reset signing state
    dsSignState = { sig: false, init1: false, init2: false };
    resetDsField('ds-sig-field-main',
      '<span class="material-symbols-outlined ds-sig-field-icon">draw</span><span class="ds-sig-field-hint">Click to sign</span>');
    resetDsField('ds-initials-1', 'Initials');
    resetDsField('ds-initials-2', 'Init.');
    setTxt('ds-sig-date', '');
    updateDsState();
  };

  function resetDsField(id, innerHtml) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('signed');
    el.innerHTML = innerHtml;
  }

  function updateDsState() {
    var done = dsSignState.sig && dsSignState.init1 && dsSignState.init2;
    var remaining = [!dsSignState.sig, !dsSignState.init1, !dsSignState.init2].filter(Boolean).length;

    var adoptBtn = document.getElementById('ds-adopt-btn');
    if (adoptBtn) adoptBtn.disabled = !done;

    var countEl = document.getElementById('ds-remaining-count');
    if (countEl) countEl.textContent = done ? 'All fields complete' : remaining + ' field' + (remaining !== 1 ? 's' : '') + ' remaining';

    function updateAction(numId, txtId, isDone) {
      var num = document.getElementById(numId);
      var txt = document.getElementById(txtId);
      if (num) { num.className = 'ds-action-num' + (isDone ? ' done' : ''); if (isDone) num.innerHTML = '<span class="material-symbols-outlined" style="font-size:11px;">check</span>'; }
      if (txt) txt.className = 'ds-action-text' + (isDone ? ' done' : '');
    }
    updateAction('ds-action-1-num', 'ds-action-1-txt', dsSignState.sig);
    updateAction('ds-action-2-num', 'ds-action-2-txt', dsSignState.init1);
    updateAction('ds-action-3-num', 'ds-action-3-txt', dsSignState.init2);

    var banner = document.getElementById('ds-complete-banner');
    if (banner) { if (done) banner.classList.add('show'); else banner.classList.remove('show'); }
  }

  window.dsClickSignature = function() {
    if (dsSignState.sig) return;
    dsSignState.sig = true;
    var field = document.getElementById('ds-sig-field-main');
    if (field) {
      field.classList.add('signed');
      field.innerHTML = '<span class="ds-sig-text-display">' + demoState.account.contact + '</span>';
    }
    var dateEl = document.getElementById('ds-sig-date');
    if (dateEl) dateEl.textContent = 'Signed: ' + new Date().toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'});
    updateDsState();
  };

  window.dsClickInitials = function(num) {
    var key = num === 1 ? 'init1' : 'init2';
    if (dsSignState[key]) return;
    dsSignState[key] = true;
    var initials = demoState.account.contact.split(' ').map(function(n) { return n[0]; }).join('.');
    var field = document.getElementById('ds-initials-' + num);
    if (field) {
      field.classList.add('signed');
      field.innerHTML = '<span class="ds-initials-display">' + initials + '</span>';
    }
    updateDsState();
  };

  window.dsAdoptAndSign = function() {
    var btn = document.getElementById('ds-adopt-btn');
    if (btn && btn.disabled) return;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-outlined">sync</span> Completing…'; }

    var signedAt = new Date().toLocaleString('en-US', {month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});
    demoState.signature.status   = 'completed';
    demoState.signature.signedAt = signedAt;

    setTimeout(function() {
      if (btn) { btn.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Signed &#10003;'; btn.classList.add('completed'); }
      setTimeout(function() { dsShowSFBridge(); }, 800);
    }, 1200);
  };

  function dsShowSFBridge() {
    var d  = demoState.deal, a = demoState.account, ds = demoState.signature;
    var oppId = 'OPP-' + (Math.floor(Math.random() * 900000) + 100000);
    var today = new Date().toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'});
    demoState.salesforce = {
      oppId: oppId, closeDate: today,
      monthly: d.monthly, arr: d.monthly * 12
    };

    showBridge('DocuSign', 'Salesforce', [
      ['Envelope ID',  '<code>' + ds.envelopeId + '</code>'],
      ['Status',       '<span style="color:#059669;font-weight:700;">Completed &#10003;</span>'],
      ['Signed By',    ds.signerName],
      ['Signed At',    ds.signedAt],
      ['Contract',     d.contractId],
      ['Opp Update',   'Stage &rarr; <strong>Closed Won</strong>'],
      ['Opp ID',       '<code>' + oppId + '</code>'],
      ['ARR',          '<strong>' + fmtMoney(d.monthly * 12) + '/yr</strong>']
    ], openSalesforceClosed);
  }

  // ── Salesforce functions ────────────────────────────────────
  window.openSalesforceClosed = function() {
    setActiveSystem('salesforce');
    populateSalesforceClosed();
  };

  window.populateSalesforceClosed = function() {
    var d = demoState.deal, a = demoState.account, sf = demoState.salesforce, ds = demoState.signature;
    if (!d || !sf) return;

    function setTxt(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

    setTxt('sf-opp-name',    a.name + ' — ' + d.optionLabel);
    setTxt('sf-opp-name-bc', a.name);
    setTxt('sf-opp-id',      sf.oppId);
    setTxt('sf-mrr',         fmtMoney(d.monthly) + '/mo');
    setTxt('sf-arr',         fmtMoney(sf.arr) + '/yr');
    setTxt('sf-close-date',  sf.closeDate);
    setTxt('sf-d-account',   a.name);
    setTxt('sf-d-contact',   a.contact);
    setTxt('sf-d-product',   'VTU-Dual AI Dashcam');
    setTxt('sf-d-fleet',     d.fleet + ' vehicles');
    setTxt('sf-d-term',      d.term + ' months');
    setTxt('sf-d-promo',     d.promoType);
    setTxt('sf-d-unit-price', fmtMoney(d.unitPrice) + '/mo');
    setTxt('sf-d-contract',  d.contractId);
    setTxt('sf-d-envelope',  ds ? ds.envelopeId : '—');
    setTxt('sf-d-signed-by', ds ? ds.signerName : '—');
    setTxt('sf-d-signed-at', ds ? ds.signedAt : '—');
    setTxt('sf-act-signed-by', a.contact);
    setTxt('sf-act-time-1',  ds ? ds.signedAt : sf.closeDate);
  };

  window.sfContinueToFulfillment = function() {
    setActiveSystem('valuecal');
    // Re-show the SF convert section hidden earlier (if needed)
    var sfConvert = document.querySelector('.sf-convert-shell');
    if (sfConvert) sfConvert.style.display = '';
    // Try to navigate ValuCal to the deal-won result screen
    try {
      if (typeof enterDealResult === 'function') { enterDealResult('won'); return; }
    } catch(e) {}
    // Fallback: navigate to deal-result screen directly
    try {
      var dr = document.getElementById('screen-deal-result');
      if (dr) {
        document.querySelectorAll('[id^="screen-"]').forEach(function(el) { el.classList.add('hidden'); });
        dr.classList.remove('hidden');
      }
    } catch(e) {}
  };

  // ── Reset ───────────────────────────────────────────────────
  window.demoReset = function() { window.location.reload(); };

  // ── Init ────────────────────────────────────────────────────
  renderLifecycleBar();

})();
