(() => {
  const DEFAULT_CONFIG = {
    web3forms: {
      accessKey: '',
      endpoint: 'https://api.web3forms.com/submit',
      fromName: 'Prestige Flow Website',
      businessEmail: 'info@prestigeflow.co.uk'
    },
    reviews: {
      google: {
        endpoint: '',
        profileUrl: 'https://g.page/r/CWoooDggCsiQEBE',
        refreshMs: 3600000,
        provider: 'custom-json'
      }
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
    reviews: {
      ...base.reviews,
      ...(incoming?.reviews || {}),
      google: {
        ...base.reviews.google,
        ...(incoming?.reviews?.google || {})
      }
    },
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

  const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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
        if (text.includes('region') || text.includes('london') || text.includes('area') || text.includes('reading') || text.includes('slough')) {
          // On the booking page the multi-step wizard owns region selection — skip redirect
          const isBookingPage = Boolean(document.querySelector('[data-testid="button-next-step"], [data-testid="button-step1-next"]'));
          if (!isBookingPage) window.location.href = '/areas';
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
    const PRODUCT_MAP_PATH = '/data/stripe-product-map.json';

    // Require the main card wrapper — bail out on non-booking pages
    const mainCard = document.querySelector('[data-testid="button-next-step"]')
      ?.closest('.shadcn-card');
    if (!mainCard) return;

    // ─── Shared helpers ────────────────────────────────────────────────────────
    const paymentLinks = config.stripe.paymentLinks || {};
    const skuLinks = config.stripe.paymentLinksBySku || {};

    let paymentLinkCache = null;
    let paymentLinkLoadPromise = null;
    let productMapCache = null; // null = not loaded; {} = loaded but empty or error; {sku:…} = loaded ok
    let productMapLoadPromise = null;

    const getRegion = () => {
      const s = localStorage.getItem(REGION_KEY);
      return (!s || s === 'london') ? 'london' : 'regional';
    };

    const setRegion = (value) => {
      localStorage.setItem(REGION_KEY, value);
      // Sync the decorative region-selector labels in the page header / hero
      const label = value === 'london' ? 'London' : 'Reading, Slough & SE';
      document.querySelectorAll('[data-testid^="button-region-selector"]').forEach((btn) => {
        const textNode = [...btn.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
        if (textNode) textNode.textContent = label;
      });
      const inlineBanner = document.querySelector('[data-testid="button-region-selector-inline"]');
      if (inlineBanner) {
        const span = inlineBanner.parentElement?.querySelector('span:not(.text-muted-foreground)');
        if (span && !span.querySelector('button')) span.textContent = 'Showing prices for ' + label;
      }
    };

    const getPeriod = () => {
      const now = new Date();
      const day = now.getDay();
      const hour = now.getHours();
      if (day === 0 || day === 6) return 'weekend';
      return (hour >= 8 && hour < 18) ? 'daytime' : 'evening';
    };

    const SERVICE_TOKEN = { drainage: 'DRAIN', 'emergency-drainage': 'EMER', plumbing: 'PLUM', 'cctv-survey': 'CCTV' };
    const PERIOD_TOKEN  = { daytime: 'DAY', evening: 'EVE', weekend: 'WKD' };
    const PERIOD_LABEL  = { daytime: 'Mon-Fri 8am–6pm', evening: 'Mon-Fri 6pm–8am', weekend: 'Weekends' };
    const SERVICE_LABEL = {
      drainage: 'Drainage Service',
      'emergency-drainage': 'Emergency Drainage (24/7)',
      plumbing: 'Plumbing Service',
      'cctv-survey': 'CCTV Drain Survey'
    };
    const SERVICE_DESC  = {
      drainage: 'Drain unblocking, cleaning & repairs',
      'emergency-drainage': 'Immediate response for urgent issues',
      plumbing: 'Repairs, installations & maintenance',
      'cctv-survey': 'Camera inspection with full footage report'
    };
    const SERVICE_ICON  = {
      drainage: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>',
      'emergency-drainage': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      plumbing: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
      'cctv-survey': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>'
    };

    const buildSku = (service, regionOverride) => {
      const region = regionOverride || getRegion();
      const prefix = region === 'london' ? 'LON' : 'REG';
      if (service === 'cctv-survey') return `${prefix}-CCTV-FIX`;
      const sp = SERVICE_TOKEN[service];
      const pp = PERIOD_TOKEN[getPeriod()];
      return (sp && pp) ? `${prefix}-${sp}-${pp}` : '';
    };

    const loadPaymentLinks = async () => {
      if (paymentLinkCache) return paymentLinkCache;
      if (paymentLinkLoadPromise) return paymentLinkLoadPromise;
      paymentLinkLoadPromise = (async () => {
        const fromConfig = {};
        Object.entries(skuLinks || {}).forEach(([sku, url]) => { if (isConfigured(url)) fromConfig[sku] = url; });
        try {
          const r = await fetch(PAYMENT_LINK_MAP_PATH, { cache: 'no-store' });
          if (!r.ok) throw new Error('not found');
          const data = await r.json();
          const fromFile = {};
          (data.payment_links || []).forEach((e) => { if (e?.sku && isConfigured(e.payment_link_url)) fromFile[e.sku] = e.payment_link_url; });
          paymentLinkCache = { ...fromConfig, ...fromFile };
        } catch (_) { paymentLinkCache = fromConfig; }
        return paymentLinkCache;
      })();
      return paymentLinkLoadPromise;
    };

    const loadProductMap = async () => {
      if (productMapCache !== null) return productMapCache;
      if (productMapLoadPromise) return productMapLoadPromise;
      productMapLoadPromise = (async () => {
        try {
          const r = await fetch(PRODUCT_MAP_PATH);
          if (!r.ok) throw new Error('not found');
          const data = await r.json();
          const m = {};
          (data.mapping || []).forEach((e) => { if (e?.sku) m[e.sku] = e; });
          productMapCache = m;
        } catch (_) {
          productMapLoadPromise = null; // allow retry next call
          productMapCache = null;
        }
        return productMapCache || {};
      })();
      return productMapLoadPromise;
    };

    const getPriceLabel = (sku, productMap) => {
      const entry = productMap?.[sku];
      if (!entry) return null;
      const pounds = Math.round(entry.amount_pence / 100);
      return sku.endsWith('-FIX') ? `£${pounds} + VAT (fixed)` : `£${pounds}/hr + VAT`;
    };

    const getDestination = (service, region, linkMap) => {
      const sku = buildSku(service, region);
      if (sku && linkMap?.[sku]) return { url: linkMap[sku], sku };
      const fallback = (service === 'default' ? '' : paymentLinks[service]) || paymentLinks.default || '';
      return { url: fallback, sku };
    };

    // ─── Step state ────────────────────────────────────────────────────────────
    let currentStep = 1; // 1=area, 2=service, 3=details, 4=confirm
    let selectedRegion = getRegion();
    let selectedService = '';
    let customerDetails = { name: '', phone: '', email: '', notes: '' };

    // ─── Step indicator ────────────────────────────────────────────────────────
    // Find the step dots wrapper — it contains exactly the step circles
    const stepContainer = mainCard.previousElementSibling;

    const STEP_LABELS = ['Select Area', 'Select Service', 'Your Details', 'Confirm & Pay'];

    const renderStepIndicator = () => {
      if (!stepContainer) return;
      const gold = '#d4af37';
      const navy = '#1a2842';
      const dots = STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const isActive = n === currentStep;
        const isDone   = n < currentStep;
        const circleBg  = (isActive || isDone) ? gold : '';
        const circleText = (isActive || isDone) ? navy : '';
        const circleClass = `w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${isActive ? 'ring-2 ring-offset-2 ring-[#d4af37]' : ''}`;
        const inner = isDone
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`
          : n;
        const connector = n < STEP_LABELS.length
          ? `<div class="w-12 h-1 mx-1 rounded" style="background:${isDone ? gold : ''}; opacity:${isDone ? 1 : 0.18}; background:${isDone ? gold : 'var(--muted)'};"></div>`
          : '';
        return `<div class="flex items-center" title="${label}"><div class="${circleClass}" style="background:${(isActive||isDone)?gold:''}; color:${(isActive||isDone)?navy :''};" aria-label="Step ${n}: ${label}${isActive?' (current)':isDone?' (done)':''}">${inner}</div>${connector}</div>`;
      }).join('');
      stepContainer.innerHTML = `<div class="flex items-center gap-0">${dots}</div>`;
    };

    // ─── Card renderer ─────────────────────────────────────────────────────────
    const btn = (text, variant, testid, extra = '') =>
      `<button type="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover-elevate active-elevate-2 min-h-9 px-4 py-2 ${variant}" data-testid="${testid}" ${extra}>${text}</button>`;

    const cardShell = (title, subtitle, iconSvg, bodyHtml, footerHtml) => `
      <div class="flex flex-col space-y-1.5 p-6">
        <div class="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2">${iconSvg}${escapeHtml(title)}</div>
        ${subtitle ? `<div class="text-sm text-muted-foreground">${escapeHtml(subtitle)}</div>` : ''}
      </div>
      <div class="p-6 pt-0">${bodyHtml}</div>
      <div class="items-center p-6 pt-0 flex justify-between gap-4">${footerHtml}</div>`;

    const iconMapPin = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>`;
    const iconWrench = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
    const iconUser = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    const iconCheck = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`;
    const iconArrow = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 ml-2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
    const iconBack  = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 mr-2"><path d="m15 18-6-6 6-6"/></svg>`;

    const renderStep1 = () => {
      const areas = [
        { value: 'london',   label: 'London', desc: 'Greater London (E, EC, N, NW, W, SW, SE, WC, and outer boroughs)', badge: 'City rates' },
        { value: 'regional', label: 'Reading, Slough & South East', desc: 'Berkshire (RG, SL), Surrey (KT), Kent (BR, DA), Herts (EN, HA), Bucks (HP, MK), Beds (LU) & surrounding areas', badge: 'Regional rates' }
      ];
      const areaCards = areas.map(({ value, label, desc, badge }) => {
        const isActive = selectedRegion === value;
        const style = isActive
          ? 'border-color:#d4af37; background:rgba(212,175,55,0.08); box-shadow:0 0 0 2px rgba(212,175,55,0.16);'
          : '';
        return `<button type="button" class="w-full flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-all hover-elevate text-left" style="${style}" data-region-choice="${escapeHtml(value)}" aria-pressed="${isActive}">
          <div class="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">${iconMapPin}</div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="font-medium">${escapeHtml(label)}</p>
              <span class="text-xs px-1.5 py-0.5 rounded-full font-medium" style="background:rgba(212,175,55,0.15); color:#d4af37;">${escapeHtml(badge)}</span>
            </div>
            <p class="text-sm text-muted-foreground mt-0.5">${escapeHtml(desc)}</p>
          </div>
        </button>`;
      }).join('');

      const footer = `
        <div class="text-sm text-muted-foreground">Not sure? <a href="/areas" class="text-primary hover:underline">View our area map</a></div>
        ${btn('Select Area & Continue' + iconArrow, 'bg-primary text-primary-foreground border border-primary-border', 'button-step1-next')}`;

      mainCard.innerHTML = cardShell('Select Your Area', 'Pricing differs between London and regional areas', iconMapPin, `<div class="grid gap-3">${areaCards}</div><div class="mt-4 pf-booking-note" aria-live="polite"></div>`, footer);

      mainCard.querySelectorAll('[data-region-choice]').forEach((tile) => {
        const val = tile.getAttribute('data-region-choice');
        tile.addEventListener('click', () => {
          selectedRegion = val;
          mainCard.querySelectorAll('[data-region-choice]').forEach((t) => {
            const active = t.getAttribute('data-region-choice') === selectedRegion;
            t.style.borderColor = active ? '#d4af37' : '';
            t.style.background  = active ? 'rgba(212,175,55,0.08)' : '';
            t.style.boxShadow   = active ? '0 0 0 2px rgba(212,175,55,0.16)' : '';
            t.setAttribute('aria-pressed', String(active));
          });
        });
        tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tile.click(); } });
      });

      mainCard.querySelector('[data-testid="button-step1-next"]').addEventListener('click', () => {
        setRegion(selectedRegion);
        currentStep = 2;
        renderStepIndicator();
        loadProductMap().then(renderStep2);
      });
    };

    const renderStep2 = (productMap) => {
      const services = ['drainage', 'emergency-drainage', 'plumbing', 'cctv-survey'];
      const period = getPeriod();
      const regionLabel = selectedRegion === 'london' ? 'London' : 'Reading, Slough & SE';

      const serviceCards = services.map((svc) => {
        const sku = buildSku(svc, selectedRegion);
        const priceLabel = getPriceLabel(sku, productMap) || '—';
        const isActive = selectedService === svc;
        const activeStyle = isActive ? 'border-color:#d4af37; background:rgba(212,175,55,0.08); box-shadow:0 0 0 2px rgba(212,175,55,0.16);' : '';
        return `<label class="flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all hover-elevate" style="${activeStyle}" data-testid="radio-service-${escapeHtml(svc)}" tabindex="0">
          <button type="button" role="radio" aria-checked="${isActive}" data-state="${isActive ? 'checked' : 'unchecked'}" value="${escapeHtml(svc)}" class="aspect-square h-4 w-4 rounded-full border border-primary text-primary flex-shrink-0" style="${isActive ? 'background:#d4af37; box-shadow:inset 0 0 0 3px white;' : ''}"></button>
          <div class="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">${SERVICE_ICON[svc]}</div>
          <div class="flex-1 min-w-0">
            <p class="font-medium">${escapeHtml(SERVICE_LABEL[svc])}</p>
            <p class="text-sm text-muted-foreground">${escapeHtml(SERVICE_DESC[svc])}</p>
          </div>
          <div class="text-right flex-shrink-0">
            <p class="font-semibold text-primary" data-price-label>${escapeHtml(priceLabel)}</p>
            <p class="text-xs text-muted-foreground">${escapeHtml(PERIOD_LABEL[period])}</p>
          </div>
        </label>`;
      }).join('');

      const footer = `
        ${btn(iconBack + 'Back', 'border border-[var(--button-outline)]', 'button-step2-back')}
        ${btn('Continue' + iconArrow, 'bg-primary text-primary-foreground border border-primary-border', 'button-step2-next', 'disabled')}`;

      mainCard.innerHTML = cardShell(
        'Select Your Service',
        `Prices shown for ${regionLabel} · ${PERIOD_LABEL[period]}`,
        iconWrench,
        `<div role="radiogroup" class="grid gap-3">${serviceCards}</div><div class="mt-4 pf-booking-note" aria-live="polite"></div>`,
        footer
      );

      const note = mainCard.querySelector('.pf-booking-note');
      const nextBtn2 = mainCard.querySelector('[data-testid="button-step2-next"]');

      const setActiveService = (svc) => {
        selectedService = svc;
        mainCard.querySelectorAll('[data-testid^="radio-service-"]').forEach((label) => {
          const v = label.querySelector('[role="radio"]')?.getAttribute('value');
          const active = v === selectedService;
          label.style.borderColor = active ? '#d4af37' : '';
          label.style.background  = active ? 'rgba(212,175,55,0.08)' : '';
          label.style.boxShadow   = active ? '0 0 0 2px rgba(212,175,55,0.16)' : '';
          const radio = label.querySelector('[role="radio"]');
          if (radio) {
            radio.setAttribute('aria-checked', String(active));
            radio.setAttribute('data-state', active ? 'checked' : 'unchecked');
            radio.style.background  = active ? '#d4af37' : '';
            radio.style.boxShadow   = active ? 'inset 0 0 0 3px white' : '';
          }
        });
        if (selectedService) {
          const sku = buildSku(selectedService, selectedRegion);
          const price = getPriceLabel(sku, productMap);
          note.textContent = price
            ? `${SERVICE_LABEL[selectedService]} selected — ${price} (excl. VAT)`
            : `${SERVICE_LABEL[selectedService]} selected.`;
          nextBtn2.disabled = false;
          nextBtn2.removeAttribute('disabled');
        }
      };

      if (selectedService) setActiveService(selectedService);

      mainCard.querySelectorAll('[data-testid^="radio-service-"]').forEach((label) => {
        const svc = label.querySelector('[role="radio"]')?.getAttribute('value');
        if (!svc) return;
        label.addEventListener('click', () => setActiveService(svc));
        label.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveService(svc); } });
      });

      mainCard.querySelector('[data-testid="button-step2-back"]').addEventListener('click', () => {
        currentStep = 1;
        renderStepIndicator();
        renderStep1();
      });

      nextBtn2.addEventListener('click', () => {
        if (!selectedService) { note.textContent = 'Please select a service to continue.'; return; }
        currentStep = 3;
        renderStepIndicator();
        renderStep3();
      });
    };

    const renderStep3 = () => {
      const inputClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-9';
      const field = (id, label, type, required, placeholder, value = '') =>
        `<div class="flex flex-col gap-1.5">
          <label for="${id}" class="text-sm font-medium">${label}${required ? ' <span class="text-destructive" aria-hidden="true">*</span>' : ''}</label>
          <input id="${id}" name="${id}" type="${type}" class="${inputClass}" placeholder="${placeholder}" value="${escapeHtml(value)}"${required ? ' required' : ''}/>
        </div>`;

      const bodyHtml = `
        <div class="grid gap-4">
          ${field('pf-name', 'Full Name', 'text', true, 'e.g. John Smith', customerDetails.name)}
          ${field('pf-phone', 'Phone Number', 'tel', true, 'e.g. 07700 900000', customerDetails.phone)}
          ${field('pf-email', 'Email Address', 'email', false, 'e.g. john@example.com (optional)', customerDetails.email)}
          <div class="flex flex-col gap-1.5">
            <label for="pf-notes" class="text-sm font-medium">Additional Notes <span class="text-muted-foreground text-xs">(optional)</span></label>
            <textarea id="pf-notes" name="pf-notes" class="${inputClass} resize-none" rows="3" placeholder="Describe the issue briefly or add access notes…">${escapeHtml(customerDetails.notes)}</textarea>
          </div>
        </div>
        <p class="text-xs text-muted-foreground mt-3">Your details are used only to prepare your booking summary. They are not stored or shared before payment.</p>
        <div class="mt-3 pf-booking-note" aria-live="polite"></div>`;

      const footer = `
        ${btn(iconBack + 'Back', 'border border-[var(--button-outline)]', 'button-step3-back')}
        ${btn('Review & Confirm' + iconArrow, 'bg-primary text-primary-foreground border border-primary-border', 'button-step3-next')}`;

      mainCard.innerHTML = cardShell('Your Booking Details', 'We\'ll show you a full summary before any payment is taken', iconUser, bodyHtml, footer);

      mainCard.querySelector('[data-testid="button-step3-back"]').addEventListener('click', () => {
        currentStep = 2;
        renderStepIndicator();
        loadProductMap().then(renderStep2);
      });

      mainCard.querySelector('[data-testid="button-step3-next"]').addEventListener('click', () => {
        const name  = mainCard.querySelector('#pf-name')?.value.trim() || '';
        const phone = mainCard.querySelector('#pf-phone')?.value.trim() || '';
        const email = mainCard.querySelector('#pf-email')?.value.trim() || '';
        const notes = mainCard.querySelector('#pf-notes')?.value.trim() || '';
        const note  = mainCard.querySelector('.pf-booking-note');

        if (!name)  { note.textContent = 'Please enter your name.';         mainCard.querySelector('#pf-name')?.focus();  return; }
        if (!phone) { note.textContent = 'Please enter your phone number.'; mainCard.querySelector('#pf-phone')?.focus(); return; }

        customerDetails = { name, phone, email, notes };
        currentStep = 4;
        renderStepIndicator();
        Promise.all([loadProductMap(), loadPaymentLinks()]).then(([pm, links]) => renderStep4(pm, links));
      });
    };

    const renderStep4 = (productMap, linkMap) => {
      const regionLabel   = selectedRegion === 'london' ? 'London' : 'Reading, Slough & South East';
      const period        = getPeriod();
      const sku           = buildSku(selectedService, selectedRegion);
      const priceLabel    = getPriceLabel(sku, productMap);
      const { url: destination } = getDestination(selectedService, selectedRegion, linkMap);
      const isFixed       = sku.endsWith('-FIX');
      const priceDisplay  = priceLabel || 'Price on request';

      const row = (label, value, highlight = false) =>
        `<div class="flex justify-between items-center py-2.5 border-b last:border-0">
          <span class="text-sm text-muted-foreground">${escapeHtml(label)}</span>
          <span class="text-sm font-medium${highlight ? ' text-primary font-semibold' : ''}">${escapeHtml(value)}</span>
        </div>`;

      const bodyHtml = `
        <div class="rounded-lg border bg-muted/30 p-4 mb-4">
          ${row('Area', regionLabel)}
          ${row('Service', SERVICE_LABEL[selectedService] || selectedService)}
          ${row('Rate Period', PERIOD_LABEL[period])}
          ${row('Rate', priceDisplay, true)}
          ${isFixed ? '' : row('Billed as', '1 hour minimum at point of payment')}
          ${customerDetails.name  ? row('Your Name', customerDetails.name)   : ''}
          ${customerDetails.phone ? row('Phone',     customerDetails.phone)   : ''}
          ${customerDetails.email ? row('Email',     customerDetails.email)   : ''}
        </div>
        ${customerDetails.notes ? `<div class="rounded-lg border bg-muted/30 p-3 mb-4"><p class="text-xs text-muted-foreground font-medium mb-1">Your notes:</p><p class="text-sm">${escapeHtml(customerDetails.notes)}</p></div>` : ''}
        <div class="rounded-lg border border-[#d4af37]/30 bg-[rgba(212,175,55,0.06)] p-3 text-sm">
          <p class="font-medium mb-1">💳 Secure Stripe Checkout</p>
          <p class="text-muted-foreground text-xs">You will be redirected to Stripe to pay for the first hour of your booking. Your card details are handled entirely by Stripe — we never see them.</p>
        </div>
        <div class="mt-3 pf-booking-note" aria-live="polite"></div>`;

      const payBtnText = priceLabel
        ? `Pay ${priceLabel.replace(' + VAT', '')} + VAT via Stripe${iconArrow}`
        : `Proceed to Stripe Checkout${iconArrow}`;

      const footer = `
        ${btn(iconBack + 'Back', 'border border-[var(--button-outline)]', 'button-step4-back')}
        ${btn(payBtnText, 'bg-primary text-primary-foreground border border-primary-border text-base font-semibold', 'button-step4-pay', isConfigured(destination) ? '' : 'disabled')}`;

      mainCard.innerHTML = cardShell('Confirm & Pay', 'Review your booking — then continue to secure Stripe checkout', iconCheck, bodyHtml, footer);

      if (!isConfigured(destination)) {
        const note = mainCard.querySelector('.pf-booking-note');
        if (note) note.textContent = 'Payment link not configured. Please call 07743 565339 to book.';
      }

      mainCard.querySelector('[data-testid="button-step4-back"]').addEventListener('click', () => {
        currentStep = 3;
        renderStepIndicator();
        renderStep3();
      });

      mainCard.querySelector('[data-testid="button-step4-pay"]')?.addEventListener('click', async () => {
        const payBtn = mainCard.querySelector('[data-testid="button-step4-pay"]');
        const note   = mainCard.querySelector('.pf-booking-note');
        payBtn.disabled = true;
        if (note) note.textContent = 'Preparing secure Stripe checkout redirect…';
        window.location.href = destination;
      });
    };

    // ─── Boot ──────────────────────────────────────────────────────────────────
    // Pre-load data in background immediately
    void loadPaymentLinks();
    void loadProductMap();

    renderStepIndicator();
    renderStep1();
  };

  const setupGoogleReviewSummary = () => {
    const widgetIframes = Array.from(document.querySelectorAll('[data-testid="google-reviews-widget"]'));
    if (!widgetIframes.length) return;

    const reviewsConfig = config.reviews?.google || {};
    if (!isConfigured(reviewsConfig.endpoint)) return;

    const defaultProfileUrl = isConfigured(reviewsConfig.profileUrl)
      ? reviewsConfig.profileUrl
      : 'https://g.page/r/CWoooDggCsiQEBE';

    const summaries = widgetIframes.map((iframe) => {
      const hostCard = iframe.closest('.space-y-4') || iframe.parentElement;
      if (!hostCard) return null;

      const existing = hostCard.querySelector('[data-pf-google-review-summary]');
      if (existing) return existing;

      const summary = document.createElement('div');
      summary.setAttribute('data-pf-google-review-summary', 'true');
      summary.className = 'rounded-lg border border-[#4285F4]/20 bg-[#4285F4]/[0.06] p-4';
      summary.innerHTML = [
        '<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">',
        '<div>',
        '<p class="text-xs font-semibold uppercase tracking-[0.2em] text-[#1a73e8]">Live Google rating</p>',
        '<div class="mt-2 flex items-center gap-3">',
        '<div class="text-3xl font-bold text-foreground" data-pf-google-rating-value>--</div>',
        '<div>',
        '<div class="text-sm font-medium text-foreground" data-pf-google-review-count>Waiting for review feed</div>',
        '<div class="text-xs text-muted-foreground" data-pf-google-review-updated>Connect a live review endpoint to auto-update this summary.</div>',
        '</div>',
        '</div>',
        '</div>',
        '<a class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium min-h-9 px-4 py-2 border border-[#1a73e8] text-[#1a73e8] hover:bg-[#4285F4]/10" target="_blank" rel="noopener noreferrer" href="', escapeHtml(defaultProfileUrl), '">',
        'Open Google profile',
        '</a>',
        '</div>'
      ].join('');

      hostCard.insertBefore(summary, hostCard.firstChild);
      return summary;
    }).filter(Boolean);

    if (!summaries.length) return;

    const renderState = (payload) => {
      const ratingValue = Number(payload?.ratingValue || payload?.rating || 0);
      const reviewCount = Number(payload?.reviewCount || payload?.count || 0);
      const profileUrl = isConfigured(payload?.profileUrl) ? payload.profileUrl : defaultProfileUrl;
      const updatedAt = payload?.lastUpdated || payload?.updatedAt || '';

      const hasData = Number.isFinite(ratingValue) && ratingValue > 0 && Number.isFinite(reviewCount) && reviewCount > 0;
      const updatedLabel = updatedAt
        ? new Date(updatedAt).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : '';

      summaries.forEach((summary) => {
        const ratingEl = summary.querySelector('[data-pf-google-rating-value]');
        const countEl = summary.querySelector('[data-pf-google-review-count]');
        const updatedEl = summary.querySelector('[data-pf-google-review-updated]');
        const linkEl = summary.querySelector('a');

        if (!ratingEl || !countEl || !updatedEl || !linkEl) return;

        if (!hasData) {
          ratingEl.textContent = '--';
          countEl.textContent = 'Live review feed unavailable';
          updatedEl.textContent = 'The Google widget can still load reviews, but this live summary needs a configured endpoint.';
          linkEl.setAttribute('href', defaultProfileUrl);
          return;
        }

        ratingEl.textContent = ratingValue.toFixed(1);
        countEl.textContent = `${reviewCount} Google reviews`;
        updatedEl.textContent = updatedLabel
          ? `Auto-updated ${updatedLabel}`
          : 'Auto-updated from your Google review feed';
        linkEl.setAttribute('href', profileUrl);
      });
    };

    const renderError = () => {
      renderState(null);
    };

    const loadReviews = async () => {
      try {
        const response = await fetch(reviewsConfig.endpoint, {
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        });

        if (!response.ok) throw new Error('Review feed unavailable');
        const payload = await response.json();
        renderState(payload);
      } catch (_) {
        renderError();
      }
    };

    void loadReviews();

    const refreshMs = Number(reviewsConfig.refreshMs || 0);
    if (Number.isFinite(refreshMs) && refreshMs >= 60000) {
      window.setInterval(() => {
        void loadReviews();
      }, refreshMs);
    }
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
    setupGoogleReviewSummary();
  });
})();
