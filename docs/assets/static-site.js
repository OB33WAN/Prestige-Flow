(() => {
  const DEFAULT_CONFIG = {
    web3forms: {
      accessKey: '',
      endpoint: 'https://api.web3forms.com/submit',
      fromName: 'Prestige Flow Website',
      businessEmail: 'info@prestigeflow.co.uk'
    },
    stripe: {
      publishableKey: '',
      secretKeyNotice: 'Do not place STRIPE_SECRET_KEY in static files. Use Stripe Payment Links or a secure backend.',
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
      },
      paymentLinksBySku: {
        ...(incoming?.stripe?.paymentLinksBySku || {})
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
          setFormStatus(statusEl, 'error', 'Form is not configured yet. Add WEB3FORMS_ACCESS_KEY in assets/site-config.js.');
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
    const paymentLinks = config.stripe.paymentLinks || {};
    const skuLinks = config.stripe.paymentLinksBySku || {};

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
    nextBtn.textContent = 'Continue to Secure Stripe Checkout Redirect';
    void loadPaymentLinks();

    nextBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      const oldLabel = nextBtn.textContent;
      nextBtn.disabled = true;
      notice.textContent = 'Preparing secure Stripe checkout redirect...';
      nextBtn.textContent = 'Opening secure Stripe checkout redirect...';

      const sku = buildSku(selectedService);
      const loadedLinks = await loadPaymentLinks();
      const serviceLink = getServiceFallbackLink(selectedService);
      const destination = (sku && loadedLinks[sku]) || serviceLink;

      if (!isConfigured(destination)) {
        notice.textContent = 'Stripe payment link is not configured yet. Set payment links in assets/site-config.js or data/stripe-payment-link-map.json.';
        nextBtn.disabled = false;
        nextBtn.textContent = oldLabel;
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
    setupMenuButtonFallbacks();
    setupHeaderScroll();
    setupWeb3Forms();
    setupBookingPaymentFallback();
  });
})();
