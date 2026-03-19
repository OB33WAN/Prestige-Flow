(() => {
  const DEFAULT_CONFIG = {
    web3forms: {
      accessKey: '',
      endpoint: 'https://api.web3forms.com/submit',
      fromName: 'Prestige Flow Website',
      businessEmail: 'info@prestigeflow.co.uk'
    },
    stripe: {
      paymentLinks: {
        default: '',
        drainage: '',
        'emergency-drainage': '',
        plumbing: '',
        'cctv-survey': ''
      }
    }
  };

  const mergeConfig = (base, incoming) => ({
    ...base,
    ...incoming,
    web3forms: { ...base.web3forms, ...(incoming?.web3forms || {}) },
    stripe: {
      ...base.stripe,
      ...(incoming?.stripe || {}),
      paymentLinks: {
        ...base.stripe.paymentLinks,
        ...(incoming?.stripe?.paymentLinks || {})
      }
    }
  });

  const config = mergeConfig(DEFAULT_CONFIG, window.PrestigeFlowConfig || {});

  const onReady = (fn) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
      return;
    }
    fn();
  };

  const isConfigured = (value) => typeof value === 'string' && value.trim() && !value.startsWith('REPLACE_ME_');

  const formTypeFromElement = (form) => {
    const marker = (form.getAttribute('data-static-form') || '').toLowerCase();
    const text = (form.closest('section')?.textContent || '').toLowerCase();

    if (marker.includes('booking') || text.includes('book')) return 'booking';
    if (marker.includes('quote') || text.includes('quote')) return 'quote';
    if (text.includes('callback')) return 'callback';
    if (text.includes('contact')) return 'contact';
    return 'enquiry';
  };

  const createFormStatus = (form) => {
    const existing = form.nextElementSibling;
    if (existing && existing.classList.contains('pf-form-feedback')) {
      return existing;
    }

    const status = document.createElement('div');
    status.className = 'pf-form-feedback';
    status.hidden = true;
    form.insertAdjacentElement('afterend', status);
    return status;
  };

  const setFormStatus = (statusEl, kind, message) => {
    statusEl.hidden = false;
    statusEl.className = 'pf-form-feedback ' + (kind === 'error' ? 'pf-form-feedback-error' : 'pf-form-feedback-success');
    statusEl.textContent = message;
  };

  const setupCookieBanner = () => {
    const storageKey = 'pf_gdpr_accepted_' + new Date().toDateString();
    const choice = sessionStorage.getItem(storageKey);
    const acceptBtn = document.querySelector('[data-testid="button-accept-cookies"]');
    const rejectBtn = document.querySelector('[data-testid="button-reject-cookies"]');
    const banner = acceptBtn?.closest('.fixed.bottom-0.left-0.right-0.z-50');

    if (!banner) return;
    if (choice) {
      banner.style.display = 'none';
    }

    const saveChoice = (value) => {
      sessionStorage.setItem(storageKey, value);
      localStorage.setItem('pf_cookie_consent', value);
      banner.style.display = 'none';
    };

    acceptBtn?.addEventListener('click', () => saveChoice('accepted'));
    rejectBtn?.addEventListener('click', () => saveChoice('rejected'));
  };

  const setupFaqAccordions = () => {
    const buttons = Array.from(document.querySelectorAll('[data-testid^="button-faq-"]'));
    if (!buttons.length) return;

    buttons.forEach((button) => {
      const contentId = button.getAttribute('aria-controls');
      const region = contentId ? document.getElementById(contentId) : null;
      if (!region) return;

      region.hidden = true;
      region.setAttribute('aria-hidden', 'true');
      button.setAttribute('aria-expanded', 'false');

      button.addEventListener('click', () => {
        const isOpen = button.getAttribute('aria-expanded') === 'true';
        buttons.forEach((otherBtn) => {
          const otherId = otherBtn.getAttribute('aria-controls');
          const otherRegion = otherId ? document.getElementById(otherId) : null;
          if (!otherRegion) return;
          otherBtn.setAttribute('aria-expanded', 'false');
          otherRegion.hidden = true;
          otherRegion.setAttribute('aria-hidden', 'true');
        });

        if (!isOpen) {
          button.setAttribute('aria-expanded', 'true');
          region.hidden = false;
          region.setAttribute('aria-hidden', 'false');
        }
      });
    });
  };

  const setupMobileMenu = () => {
    const button = document.querySelector('[data-testid="button-mobile-menu"]');
    const desktopNav = document.querySelector('header nav');
    if (!button || !desktopNav) return;

    const overlay = document.createElement('div');
    overlay.className = 'pf-mobile-overlay';
    overlay.hidden = true;

    const panel = document.createElement('aside');
    panel.className = 'pf-mobile-panel';

    const logo = document.querySelector('header [data-testid="link-logo"]');
    let menuContent = '';
    if (logo) {
      menuContent = '<div class="pf-mobile-logo mb-6 pb-4 border-b border-[#d4af37]/20">' + logo.innerHTML + '</div>';
    }
    menuContent += desktopNav.innerHTML;
    panel.innerHTML = menuContent;

    const close = () => {
      overlay.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('pf-menu-open');
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    panel.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', close);
    });

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    button.addEventListener('click', () => {
      const opening = overlay.hidden;
      overlay.hidden = !opening;
      button.setAttribute('aria-expanded', opening ? 'true' : 'false');
      document.body.classList.toggle('pf-menu-open', opening);
    });
  };

  const setupComboboxFallbacks = () => {
    const comboButtons = Array.from(document.querySelectorAll('button[role="combobox"]'));

    comboButtons.forEach((button) => {
      const parent = button.parentElement;
      if (!parent) return;

      const select = parent.querySelector('select');
      if (!select) return;

      const buttonClasses = button.getAttribute('class') || '';
      const placeholder = button.textContent?.trim() || 'Select';

      select.removeAttribute('aria-hidden');
      select.removeAttribute('tabindex');
      select.style.position = 'static';
      select.style.width = '100%';
      select.style.height = 'auto';
      select.style.padding = '';
      select.style.margin = '';
      select.style.overflow = '';
      select.style.clip = '';
      select.style.whiteSpace = '';
      select.style.overflowWrap = '';
      select.className = buttonClasses;

      const hasPlaceholder = Array.from(select.options).some((opt) => opt.value === '');
      if (!hasPlaceholder) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = placeholder;
        opt.selected = true;
        opt.disabled = false;
        select.insertBefore(opt, select.firstChild);
      }

      button.style.display = 'none';
    });
  };

  const setupPricingDropdownFallbacks = () => {
    const REGION_KEY = 'pf_region';

    const pricing = {
      london: {
        label: 'London',
        drainage: { daytime: 120, evening: 140, weekend: 140 },
        plumbing: { daytime: 105, evening: 115, weekend: 115 }
      },
      'reading-slough': {
        label: 'Reading, Slough & Other Regions',
        drainage: { daytime: 110, evening: 130, weekend: 130 },
        plumbing: { daytime: 95, evening: 110, weekend: 110 }
      }
    };

    const periodLabels = {
      daytime: 'Daytime Rate (8am-6pm)',
      evening: 'Out of Hours Rate (6pm-8am)',
      weekend: 'Weekend Rate'
    };

    const getRegion = () => {
      const storedRegion = localStorage.getItem(REGION_KEY);
      if (!storedRegion) return 'london';
      return storedRegion === 'london' ? 'london' : 'reading-slough';
    };
    const getPeriod = () => {
      const now = new Date();
      const day = now.getDay();
      const hour = now.getHours();

      if (day === 0 || day === 6) return 'weekend';
      return hour >= 8 && hour < 18 ? 'daytime' : 'evening';
    };

    const updateUi = () => {
      const regionKey = getRegion();
      const periodKey = getPeriod();
      const region = pricing[regionKey];
      const periodDetail = {
        daytime: 'Mon-Fri 8am-6pm',
        evening: 'Mon-Fri 6pm-8am',
        weekend: 'Weekends (Sat & Sun)'
      };

      document.querySelectorAll('[data-testid^="button-region-selector"]').forEach((btn) => {
        btn.childNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
            node.textContent = region.label;
          }
        });
      });

      document.querySelectorAll('[data-testid="badge-current-rate"]').forEach((badge) => {
        const icon = badge.querySelector('svg');
        badge.textContent = periodLabels[periodKey];
        if (icon) {
          badge.prepend(icon);
          badge.insertBefore(document.createTextNode(' '), icon.nextSibling);
        }
      });

      document.querySelectorAll('[data-testid="current-rate-display"]').forEach((panel) => {
        const valueEls = panel.querySelectorAll('p.text-lg');
        if (valueEls[0]) valueEls[0].textContent = `£${region.drainage[periodKey]}/hr`;
        if (valueEls[1]) valueEls[1].textContent = `£${region.plumbing[periodKey]}/hr`;
      });

      const updateCardPrice = (buttonTestId, serviceKey) => {
        const button = document.querySelector(`[data-testid="${buttonTestId}"]`);
        const card = button?.closest('[data-testid^="card-service-"]');
        if (!card) return;

        const pricingBlock = card.querySelector('.p-6.space-y-5.pt-0 .flex.flex-col.gap-1');
        if (!pricingBlock) return;

        const mainEl = pricingBlock.querySelector('div');
        const detailEl = pricingBlock.querySelector('p');

        let activeRate = null;
        let detailText = '';

        if (serviceKey === 'drainage') {
          activeRate = region.drainage[periodKey];
          detailText = periodDetail[periodKey];
        } else if (serviceKey === 'emergency') {
          // Emergency follows the same regional rate structure as drainage.
          activeRate = region.drainage[periodKey];
          detailText = periodDetail[periodKey];
        } else if (serviceKey === 'plumbing') {
          activeRate = region.plumbing[periodKey];
          detailText = periodDetail[periodKey];
        }

        if (activeRate == null) return;

        if (mainEl) mainEl.textContent = `From £${activeRate}/hr + VAT`;
        if (detailEl) detailEl.textContent = detailText;
      };

      updateCardPrice('button-service-drainage-service', 'drainage');
      updateCardPrice('button-service-emergency-drainage', 'emergency');
      updateCardPrice('button-service-plumbing-service', 'plumbing');

      const updateBookingOptionPrice = (testId, amountText, detailText) => {
        const label = document.querySelector(`[data-testid="${testId}"]`);
        if (!label) return;

        const amountEl = label.querySelector('.text-right p');
        if (amountEl) amountEl.textContent = amountText;

        const detailEl = label.querySelector('.flex-1 .text-sm.text-muted-foreground');
        if (detailEl && detailText) detailEl.textContent = detailText;
      };

      updateBookingOptionPrice('radio-service-drainage', `£${region.drainage[periodKey]}/hr + VAT`, `Drain unblocking, cleaning, repairs (${periodDetail[periodKey]})`);
      updateBookingOptionPrice('radio-service-emergency-drainage', `£${region.drainage[periodKey]}/hr + VAT`, `Immediate response for urgent issues (${periodDetail[periodKey]})`);
      updateBookingOptionPrice('radio-service-plumbing', `£${region.plumbing[periodKey]}/hr + VAT`, `Repairs, installations, maintenance (${periodDetail[periodKey]})`);

      const bookingMeta = document.querySelector('[data-testid="button-next-step"]')
        ?.closest('.shadcn-card')
        ?.querySelector('.text-sm.text-muted-foreground');
      if (bookingMeta) {
        bookingMeta.textContent = `Choose the service you need. Prices shown for ${region.label} (${periodDetail[periodKey]}).`;
      }
    };

    const attachRegionDropdowns = () => {
      const regionButtons = Array.from(document.querySelectorAll('button[aria-haspopup="menu"][data-testid^="button-region-selector"]'));

      regionButtons.forEach((button) => {
        const controls = button.getAttribute('aria-controls');
        const hasMenu = controls ? Boolean(document.getElementById(controls)) : false;
        if (hasMenu) return;
        if (button.dataset.pfRegionFallback === '1') return;

        button.dataset.pfRegionFallback = '1';

        const select = document.createElement('select');
        select.dataset.pfRegionSelect = '1';
        select.className = button.className;
        select.style.maxWidth = '220px';

        select.innerHTML = [
          '<option value="london">London</option>',
          '<option value="reading-slough">Reading, Slough & Other Regions</option>'
        ].join('');

        select.value = getRegion();
        select.addEventListener('change', () => {
          localStorage.setItem(REGION_KEY, select.value);
          updateUi();
        });

        button.insertAdjacentElement('afterend', select);
        button.style.display = 'none';
      });
    };

    attachRegionDropdowns();
    updateUi();
    window.setInterval(updateUi, 60000);
  };

  const setupMenuButtonFallbacks = () => {
    const menuButtons = Array.from(document.querySelectorAll('button[aria-haspopup="menu"]'));

    menuButtons.forEach((button) => {
      const controls = button.getAttribute('aria-controls');
      const hasMenu = controls ? Boolean(document.getElementById(controls)) : false;
      if (hasMenu) return;

      button.addEventListener('click', () => {
        const text = (button.textContent || '').toLowerCase();
        if (text.includes('region') || text.includes('london') || text.includes('area')) {
          window.location.href = '/areas';
          return;
        }

        const parentLink = button.closest('a');
        if (parentLink?.getAttribute('href')) {
          window.location.href = parentLink.getAttribute('href');
        }
      });
    });
  };

  const setupHeaderScroll = () => {
    const header = document.querySelector('header');
    if (!header) return;

    let lastScrollY = 0;
    let isHidden = false;

    window.addEventListener('scroll', () => {
      const currentScrollY = window.scrollY;
      const headerHeight = header.offsetHeight;

      if (currentScrollY > headerHeight) {
        if (currentScrollY > lastScrollY && !isHidden) {
          header.style.transform = 'translateY(-100%)';
          isHidden = true;
        } else if (currentScrollY < lastScrollY && isHidden) {
          header.style.transform = 'translateY(0)';
          isHidden = false;
        }
      } else {
        header.style.transform = 'translateY(0)';
        isHidden = false;
      }

      lastScrollY = currentScrollY;
    }, { passive: true });
  };

  const setupWeb3Forms = () => {
    const forms = Array.from(document.querySelectorAll('form[data-static-form]'));
    if (!forms.length) return;

    forms.forEach((form) => {
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      const statusEl = createFormStatus(form);

      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!isConfigured(config.web3forms.accessKey)) {
          setFormStatus(statusEl, 'error', 'Form is not configured yet. Add WEB3FORMS_ACCESS_KEY in js/site-config.js.');
          return;
        }

        const oldBtnText = submitBtn?.textContent || '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Sending...';
        }

        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());
        const email = String(formData.get('email') || '').trim();
        const formType = formTypeFromElement(form);

        payload.access_key = config.web3forms.accessKey;
        payload.subject = 'Prestige Flow ' + formType.toUpperCase() + ' submission';
        payload.from_name = config.web3forms.fromName;
        payload.botcheck = '';
        payload.source = window.location.href;
        payload.form_type = formType;
        payload.submitted_at = new Date().toISOString();
        if (email) {
          payload.replyto = email;
          payload.ccemail = email;
        }

        try {
          const response = await fetch(config.web3forms.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const result = await response.json().catch(() => ({}));
          if (!response.ok || result.success === false) {
            throw new Error(result.message || 'Submission failed');
          }

          const emailLine = email
            ? ' A confirmation copy has been requested for ' + email + '.'
            : ' Add your email in the form to receive a confirmation copy.';

          setFormStatus(
            statusEl,
            'success',
            'Thanks, your request was sent to ' + config.web3forms.businessEmail + '.' + emailLine
          );
          form.reset();
        } catch (error) {
          setFormStatus(statusEl, 'error', 'Could not send your request right now. Please call 07743 565339.');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = oldBtnText;
          }
        }
      });
    });
  };

  const setupBookingPaymentFallback = () => {
    const REGION_KEY = 'pf_region';
    const PAYMENT_LINK_MAP_PATH = '/data/stripe-payment-link-map.json';
    const nextBtn = document.querySelector('[data-testid="button-next-step"]');
    if (!nextBtn) return;

    const labels = Array.from(document.querySelectorAll('[data-testid^="radio-service-"]'));
    const getServiceValue = (label) => label.querySelector('[role="radio"]')?.getAttribute('value') || 'default';
    const paymentLinks = config.stripe?.paymentLinks || {};
    const skuLinks = config.stripe?.paymentLinksBySku || {};

    let selectedService = getServiceValue(labels[0] || document.body);
    let paymentLinkCache = null;
    let paymentLinkLoadPromise = null;

    const notice = document.createElement('div');
    notice.className = 'pf-booking-note';
    notice.setAttribute('aria-live', 'polite');
    nextBtn.parentElement?.insertBefore(notice, nextBtn);

    const getRegion = () => {
      const storedRegion = localStorage.getItem(REGION_KEY);
      if (!storedRegion) return 'london';
      return storedRegion === 'london' ? 'london' : 'reading-slough';
    };

    const getPeriod = () => {
      const now = new Date();
      const day = now.getDay();
      const hour = now.getHours();

      if (day === 0 || day === 6) return 'weekend';
      return hour >= 8 && hour < 18 ? 'daytime' : 'evening';
    };

    const serviceToken = {
      drainage: 'DRAIN',
      'emergency-drainage': 'EMER',
      plumbing: 'PLUM',
      'cctv-survey': 'CCTV'
    };

    const periodToken = {
      daytime: 'DAY',
      evening: 'EVE',
      weekend: 'WKD'
    };

    const buildSku = (service) => {
      const regionPrefix = getRegion() === 'london' ? 'LON' : 'REG';
      if (service === 'cctv-survey') {
        return `${regionPrefix}-CCTV-FIX`;
      }

      const servicePart = serviceToken[service];
      const periodPart = periodToken[getPeriod()];
      if (!servicePart || !periodPart) return '';
      return `${regionPrefix}-${servicePart}-${periodPart}`;
    };

    const loadPaymentLinks = async () => {
      if (paymentLinkCache) return paymentLinkCache;
      if (paymentLinkLoadPromise) return paymentLinkLoadPromise;

      paymentLinkLoadPromise = (async () => {
        const fromConfig = {};
        Object.entries(skuLinks || {}).forEach(([sku, url]) => {
          if (isConfigured(url)) fromConfig[sku] = url;
        });

        try {
          const response = await fetch(PAYMENT_LINK_MAP_PATH, {
            cache: 'no-store'
          });
          if (!response.ok) throw new Error('Payment link map not found');

          const data = await response.json();
          const fromFile = {};
          (data.payment_links || []).forEach((entry) => {
            if (entry?.sku && isConfigured(entry.payment_link_url)) {
              fromFile[entry.sku] = entry.payment_link_url;
            }
          });

          paymentLinkCache = {
            ...fromConfig,
            ...fromFile
          };
          return paymentLinkCache;
        } catch (_) {
          paymentLinkCache = fromConfig;
          return paymentLinkCache;
        }
      })();

      return paymentLinkLoadPromise;
    };

    const getServiceFallbackLink = (service) => {
      if (service === 'default') return paymentLinks.default || '';
      return paymentLinks[service] || paymentLinks.default || '';
    };

    const periodLabel = {
      daytime: 'Mon-Fri 8am-6pm',
      evening: 'Mon-Fri 6pm-8am',
      weekend: 'Weekends'
    };

    const serviceLabel = {
      drainage: 'Drainage Service',
      'emergency-drainage': 'Emergency Drainage (24/7)',
      plumbing: 'Plumbing Service',
      'cctv-survey': 'CCTV Drain Survey',
      default: 'Service'
    };

    const renderSelectionSummary = () => {
      const regionName = getRegion() === 'london' ? 'London' : 'Reading, Slough & Other Regions';
      const periodName = periodLabel[getPeriod()] || 'Current Rate Window';
      const selectedLabel = serviceLabel[selectedService] || serviceLabel.default;
      notice.textContent = `${selectedLabel} selected for ${regionName} (${periodName}). You will continue via a secure Stripe checkout redirect.`;
    };

    const setSelection = (serviceValue) => {
      selectedService = serviceValue || 'default';
      labels.forEach((label) => {
        const value = getServiceValue(label);
        const isActive = value === selectedService;
        const radio = label.querySelector('[role="radio"]');
        if (radio) {
          radio.setAttribute('aria-checked', isActive ? 'true' : 'false');
          radio.setAttribute('data-state', isActive ? 'checked' : 'unchecked');
        }
      });

      renderSelectionSummary();
    };

    labels.forEach((label) => {
      label.addEventListener('click', () => setSelection(getServiceValue(label)));
    });

    nextBtn.disabled = false;
    nextBtn.removeAttribute('disabled');
    nextBtn.innerHTML = 'Continue to Secure Stripe Checkout Redirect <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock h-4 w-4 ml-2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
    void loadPaymentLinks();

    nextBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      const oldLabel = nextBtn.innerHTML;
      nextBtn.disabled = true;
      notice.textContent = 'Preparing secure Stripe checkout redirect...';
      nextBtn.textContent = 'Opening secure Stripe checkout redirect...';

      const sku = buildSku(selectedService);
      const loadedLinks = await loadPaymentLinks();
      const serviceLink = getServiceFallbackLink(selectedService);
      const destination = (sku && loadedLinks[sku]) || serviceLink;

      if (!isConfigured(destination)) {
        notice.textContent = 'Stripe is not yet configured. Add payment links in js/site-config.js or data/stripe-payment-link-map.json.';
        nextBtn.disabled = false;
        nextBtn.innerHTML = oldLabel;
        return;
      }

      window.location.href = destination;
    });

    setSelection(selectedService);
  };

  onReady(() => {
    document.body.style.pointerEvents = '';
    setupCookieBanner();
    setupFaqAccordions();
    setupMobileMenu();
    setupComboboxFallbacks();
    setupPricingDropdownFallbacks();
    setupMenuButtonFallbacks();
    setupHeaderScroll();
    setupWeb3Forms();
    setupBookingPaymentFallback();
  });
})();
