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
      legacyPaymentLinksEnabled: false,
      paymentLinks: {
        default: '',
        drainage: '',
        'emergency-drainage': '',
        plumbing: '',
        'cctv-survey': ''
      }
    },
    crm: { apiBaseUrl: '' },
    oldSitePayments: { apiBaseUrl: '' }
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
    },
    crm: { ...base.crm, ...(incoming?.crm || {}) },
    oldSitePayments: { ...base.oldSitePayments, ...(incoming?.oldSitePayments || {}) }
  });

  const config = mergeConfig(DEFAULT_CONFIG, window.PrestigeFlowConfig || {});
  // The old site's payment service is separate from the new site and CRM.
  const crmApiBaseUrl = String(config.crm?.apiBaseUrl || '').trim().replace(/\/+$/, '');
  const oldSitePaymentsApiBaseUrl = String(config.oldSitePayments?.apiBaseUrl || '').trim().replace(/\/+$/, '');

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

  // Public prices now use one unified London & South East Region rate set.
  const REGION_KEY = 'pf_region_v3';
  const GEO_CACHE_KEY = 'pf_region_geo_cache_v2';
  const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const REGION_LABELS = {
    london: 'London & South East Region',
    regional: 'London & South East Region'
  };
  const REGION_RATES = {
    london: {
      drainage: { daytime: '£120/hr', evening: '£140/hr', weekend: '£140/hr' },
      plumbing: { daytime: '£105/hr', evening: '£115/hr', weekend: '£115/hr' },
      cctv: '£175 + VAT (fixed)'
    },
    regional: {
      drainage: { daytime: '£120/hr', evening: '£140/hr', weekend: '£140/hr' },
      plumbing: { daytime: '£105/hr', evening: '£115/hr', weekend: '£115/hr' },
      cctv: '£175 + VAT (fixed)'
    }
  };
  const FALLBACK_RATE_AMOUNTS = {
    DRAIN: { daytime: 12000, evening: 14000, weekend: 14000 },
    EMER: { daytime: 12000, evening: 14000, weekend: 14000 },
    PLUM: { daytime: 10500, evening: 11500, weekend: 11500 },
    CCTV: { fixed: 17500 }
  };
  let liveRatesLoaded = false;
  let liveRateAmounts = null;
  let liveCheckoutEnabled = false;
  const loadLiveRates = async () => {
    const base = oldSitePaymentsApiBaseUrl;
    if (!base) return;
    try {
      const response = await withTimeout(fetch(`${base}/api/public/rates`, { mode: 'cors', credentials: 'omit', cache: 'no-store' }), 5000);
      if (!response.ok) return;
      const { rates, checkoutEnabled } = await response.json();
      liveRateAmounts = rates;
      liveCheckoutEnabled = checkoutEnabled === true;
      const moneyPerHour = pence => `£${(Number(pence) / 100).toFixed(Number(pence) % 100 ? 2 : 0)}/hr`;
      for (const [key, code] of [['london','regional'],['regional','regional']]) {
        REGION_RATES[key] = {
          drainage: Object.fromEntries(['daytime','evening','weekend'].map(period => [period,moneyPerHour(rates?.[code]?.DRAIN?.[period])])),
          plumbing: Object.fromEntries(['daytime','evening','weekend'].map(period => [period,moneyPerHour(rates?.[code]?.PLUM?.[period])])),
          cctv: `£${(Number(rates?.[code]?.CCTV?.fixed || 0) / 100).toFixed(2)} + VAT (fixed)`
        };
      }
      liveRatesLoaded = true;
      applyRegionToPage(getStoredRegion());
    } catch (_) { /* Show the approved fallback prices until the CRM is reachable. */ }
  };
  const PERIOD_BADGE_LABELS = {
    daytime: 'Daytime Rate (8am-6pm)',
    evening: 'Evening Rate (6pm-8am)',
    weekend: 'Weekend Rate'
  };
  const LONDON_BOUNDS = {
    minLat: 51.28,
    maxLat: 51.70,
    minLon: -0.52,
    maxLon: 0.33
  };

  const storageGet = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  };

  // Keep GA/GTM conversion data anonymous and respect the site's analytics consent choice.
  const trackConversion = (eventName, details = {}) => {
    if (storageGet('pf_cookie_consent') !== 'accepted') return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: eventName,
      page_path: window.location.pathname,
      ...details
    });
  };

  const storageSet = (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (_) {
      // Ignore storage failures in private browsing or restricted contexts.
    }
  };

  try {
    // Drop the now-retired manual override so it cannot mislabel automatic rates.
    window.localStorage.removeItem('pf_region');
    window.localStorage.removeItem('pf_region_geo_cache');
  } catch (_) { /* Ignore restricted storage. */ }

  const normalizeRegion = (_value) => 'regional';

  const getRegionLabel = (region) => REGION_LABELS[normalizeRegion(region)] || REGION_LABELS.london;

  const getStoredRegion = () => 'regional';

  const setStoredRegion = (region, source) => {
    storageSet(REGION_KEY, normalizeRegion(region));
    storageSet(REGION_KEY, 'regional');
  };

  const getCurrentPeriod = () => {
    const now = new Date();
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
    const hour = Number(parts.hour);
    if (parts.weekday === 'Sun' || parts.weekday === 'Sat') return 'weekend';
    return (hour >= 8 && hour < 18) ? 'daytime' : 'evening';
  };

  const getAppointmentPeriod = (dateValue, timeValue) => {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue || '');
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue || '');
    if (!dateMatch || !timeMatch) return null;
    const [, year, month, day] = dateMatch;
    const [, hourText, minuteText] = timeMatch;
    const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay();
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (hour > 23 || minute > 59) return null;
    if (weekday === 0 || weekday === 6) return 'weekend';
    return (hour >= 8 && hour < 18) ? 'daytime' : 'evening';
  };

  const withTimeout = async (promise, timeoutMs) => {
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error('timeout')), timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    }
  };

  const submitCRMIntake = async (payload) => {
    const baseUrl = crmApiBaseUrl;
    if (!isConfigured(baseUrl)) return null;
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error('The CRM connection must use HTTPS.');
    }
    const normalized = {
      form_type: payload.form_type || 'enquiry',
      name: payload.name || payload.full_name || '',
      email: payload.email || '',
      phone: payload.phone || payload.telephone || '',
      address: payload.address || '',
      postcode: payload.postcode || '',
      date: payload.date || '',
      time: payload.time || '',
      notes: payload.notes || payload.message || payload.details || '',
      service: payload.service || '',
      region: payload.region || '',
      rate_period: payload.rate_period || '',
      sku: payload.sku || '',
      reference: payload.reference || '',
      card_charge_consent: payload.card_charge_consent === true,
      source: payload.source || window.location.href,
      website: payload.website || ''
    };
    const response = await withTimeout(fetch(new URL('/api/public/intake', url.origin), {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(normalized)
    }), 15000);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.accepted !== true) throw new Error(result.error || 'CRM could not save the enquiry.');
    return result;
  };

  const submitOldSiteBooking = async (payload) => {
    if (!isConfigured(oldSitePaymentsApiBaseUrl)) throw new Error('The old-site payment service is not connected.');
    const url = new URL(oldSitePaymentsApiBaseUrl);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('The old-site payment connection must use HTTPS.');
    const response = await withTimeout(fetch(new URL('/api/public/bookings', url.origin), {
      method: 'POST', mode: 'cors', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    }), 20000);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.accepted !== true || !result.checkoutUrl) throw new Error(result.error || 'Secure checkout could not be started.');
    return result;
  };

  const submitOldSiteEnquiry = async (payload) => {
    if (!isConfigured(oldSitePaymentsApiBaseUrl)) throw new Error('The old-site email service is not connected.');
    const url = new URL(oldSitePaymentsApiBaseUrl);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('The old-site email connection must use HTTPS.');
    const { access_key, from_name, replyto, ccemail, ...fields } = payload;
    const response = await withTimeout(fetch(new URL('/api/public/enquiries', url.origin), {
      method: 'POST', mode: 'cors', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ form_type: payload.form_type, fields, source: payload.source, website: payload.website || '' })
    }), 20000);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.accepted !== true) throw new Error(result.error || 'Your request could not be emailed.');
    return result;
  };

  const isLondonGeo = (geo) => {
    const lat = Number(geo?.latitude ?? geo?.lat);
    const lon = Number(geo?.longitude ?? geo?.lon ?? geo?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      if (
        lat >= LONDON_BOUNDS.minLat &&
        lat <= LONDON_BOUNDS.maxLat &&
        lon >= LONDON_BOUNDS.minLon &&
        lon <= LONDON_BOUNDS.maxLon
      ) {
        return true;
      }
    }

    const fields = [geo?.city, geo?.region, geo?.region_code, geo?.county]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());

    return fields.some((value) => value.includes('london'));
  };

  const readCachedGeoRegion = () => {
    const cached = storageGet(GEO_CACHE_KEY);
    if (!cached) return null;
    try {
      const parsed = JSON.parse(cached);
      if (!parsed?.region || !parsed?.timestamp) return null;
      if ((Date.now() - Number(parsed.timestamp)) > GEO_CACHE_TTL_MS) return null;
      return normalizeRegion(parsed.region);
    } catch (_) {
      return null;
    }
  };

  const cacheGeoRegion = (region) => {
    storageSet(GEO_CACHE_KEY, JSON.stringify({
      region: normalizeRegion(region),
      timestamp: Date.now()
    }));
  };

  const detectRegionFromGeo = async () => {
    const cachedRegion = readCachedGeoRegion();
    if (cachedRegion) return cachedRegion;

    const response = await withTimeout(fetch('https://ipapi.co/json/', { cache: 'no-store' }), 4000);
    if (!response.ok) throw new Error('geo lookup failed');
    const geo = await response.json();
    const region = isLondonGeo(geo) ? 'london' : 'regional';
    cacheGeoRegion(region);
    return region;
  };

  // Fallback 2: browser Geolocation API + postcodes.io reverse geocoding.
  // More accurate than IP (handles VPNs / corporate proxies) but requires
  // a browser permission prompt. Only attempted when IP geo fails.
  const detectRegionFromPostcode = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('geolocation-unavailable'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        ({ coords: { latitude, longitude } }) => {
          withTimeout(
            fetch(
              `https://api.postcodes.io/postcodes?lon=${longitude}&lat=${latitude}&limit=1`,
              { cache: 'no-store' }
            ),
            5000
          )
            .then((resp) => {
              if (!resp.ok) throw new Error('postcodes-api');
              return resp.json();
            })
            .then((data) => {
              const result = data?.result?.[0];
              if (!result) {
                // postcodes.io returned no results — use bounding box on browser coords
                const detected = isLondonGeo({ latitude, longitude }) ? 'london' : 'regional';
                cacheGeoRegion(detected);
                resolve(detected);
                return;
              }
              // postcodes.io sets region="London" for all Greater London postcodes
              const regionText = String(result.region || '').toLowerCase();
              const districtText = String(result.admin_district || '').toLowerCase();
              const isLondon =
                regionText === 'london' ||
                districtText.includes('london') ||
                isLondonGeo({ latitude, longitude });
              const detected = isLondon ? 'london' : 'regional';
              cacheGeoRegion(detected);
              resolve(detected);
            })
            .catch(() => {
              // postcodes.io unavailable — pure bounding-box on browser coords
              const detected = isLondonGeo({ latitude, longitude }) ? 'london' : 'regional';
              cacheGeoRegion(detected);
              resolve(detected);
            });
        },
        (err) => reject(err),
        { timeout: 8000, maximumAge: 300000 }
      );
    });

  const walkTextNodes = (root, visit) => {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parentName = node.parentElement?.tagName;
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (parentName === 'SCRIPT' || parentName === 'STYLE' || parentName === 'NOSCRIPT') {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let current = walker.nextNode();
    while (current) {
      visit(current);
      current = walker.nextNode();
    }
  };

  const updateRegionDecorators = (region) => {
    const label = getRegionLabel(region);

    document.querySelectorAll('[data-pf-auto-region]').forEach((tag) => { tag.textContent = label; });

    document.querySelectorAll('span').forEach((span) => {
      const text = span.textContent?.trim() || '';
      if (/^Prices for:\s*(?:London|Reading|Slough)/i.test(text)) span.textContent = 'Prices for: ' + label;
    });
  };

  const updateCurrentRateDisplay = (region) => {
    const period = getCurrentPeriod();
    const rateSet = REGION_RATES[normalizeRegion(region)] || REGION_RATES.london;
    const badge = document.querySelector('[data-testid="badge-current-rate"]');
    const rateDisplay = document.querySelector('[data-testid="current-rate-display"]');
    document.documentElement.dataset.pfRateRegion = normalizeRegion(region);
    document.documentElement.dataset.pfRatePeriod = period;
    if (rateDisplay) {
      rateDisplay.dataset.rateRegion = normalizeRegion(region);
      rateDisplay.dataset.ratePeriod = period;
    }

    if (badge) {
      const textNode = [...badge.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (textNode) textNode.textContent = PERIOD_BADGE_LABELS[period] || PERIOD_BADGE_LABELS.daytime;
    }

    if (rateDisplay) {
      const prices = rateDisplay.querySelectorAll('p.text-lg.font-bold.text-primary');
      if (prices[0]) prices[0].textContent = rateSet.drainage[period];
      if (prices[1]) prices[1].textContent = rateSet.plumbing[period];
    }

    // Remove the global rate strip: service-specific prices remain in their
    // own sections and the booking flow still loads the live regional rates.
    document.querySelectorAll('[data-pf-current-rates]').forEach((element) => element.remove());
  };

  const applyRegionToPage = (region) => {
    const normalizedRegion = normalizeRegion(region);
    updateRegionDecorators(normalizedRegion);
    updateCurrentRateDisplay(normalizedRegion);
  };

  const setupRegionSelectorButtons = () => {
    document.querySelectorAll('[data-testid^="button-region-selector"]').forEach((btn) => {
      const label = document.createElement('span');
      label.className = 'inline-flex items-center gap-1 text-primary font-medium';
      label.dataset.pfAutoRegion = '';
      label.textContent = getRegionLabel('regional');
      btn.replaceWith(label);
    });
  };

  const setupAutomaticRegionPricing = () => {
    applyRegionToPage('regional');
    void loadLiveRates();

    let lastPeriod = getCurrentPeriod();
    const refreshTimeBasedRates = () => {
      const currentPeriod = getCurrentPeriod();
      if (currentPeriod === lastPeriod) return;
      lastPeriod = currentPeriod;
      applyRegionToPage('regional');
    };
    window.setInterval(refreshTimeBasedRates, 60000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshTimeBasedRates();
    });
  };

  const formTypeFromElement = (form) => {
    const marker = (form.getAttribute('data-static-form') || '').toLowerCase();
    if (['booking', 'quote', 'callback', 'contact'].includes(marker)) return marker;
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
    const acceptBtn = document.querySelector('[data-testid="button-accept-cookies"]');
    const rejectBtn = document.querySelector('[data-testid="button-reject-cookies"]');
    const banner = acceptBtn?.closest('.fixed.bottom-0.left-0.right-0.z-50');
    const loadAnalytics = () => {
      if (document.querySelector('[data-pf-analytics]')) return;
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      const script = document.createElement('script');
      script.async = true; script.dataset.pfAnalytics = 'true';
      script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-TL8TG8CW';
      document.head.appendChild(script);
    };
    const choice = storageGet('pf_cookie_consent');
    if (choice === 'accepted') loadAnalytics();
    if (!banner) return;
    if (!choice) document.body.classList.add('pf-consent-open');
    if (choice) banner.style.display = 'none';
    const saveChoice = value => { storageSet('pf_cookie_consent', value); banner.style.display = 'none'; document.body.classList.remove('pf-consent-open'); if (value === 'accepted') loadAnalytics(); };
    acceptBtn?.addEventListener('click', () => saveChoice('accepted'));
    rejectBtn?.addEventListener('click', () => saveChoice('rejected'));
    const settings = document.createElement('button');
    settings.type = 'button'; settings.textContent = 'Cookie settings';
    settings.addEventListener('click', () => { banner.style.display = ''; document.body.classList.add('pf-consent-open'); });
    document.querySelector('footer')?.appendChild(settings);

    document.addEventListener('click', (event) => {
      const link = event.target?.closest?.('a[href]');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      if (/^tel:/i.test(href)) trackConversion('phone_call_click', { contact_method: 'phone' });
      else if (/^mailto:/i.test(href)) trackConversion('email_click', { contact_method: 'email' });
    });
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

      // Region-selector buttons have their own dedicated handler — skip entirely
      if ((button.getAttribute('data-testid') || '').startsWith('button-region-selector')) return;

      button.addEventListener('click', () => {
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
          document.body.classList.add('pf-header-hidden');
        } else if (currentScrollY < lastScrollY && isHidden) {
          header.style.transform = 'translateY(0)';
          isHidden = false;
          document.body.classList.remove('pf-header-hidden');
        }
      } else {
        header.style.transform = 'translateY(0)';
        isHidden = false;
        document.body.classList.remove('pf-header-hidden');
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

        if (!isConfigured(config.web3forms.accessKey) && !isConfigured(crmApiBaseUrl) && !isConfigured(oldSitePaymentsApiBaseUrl)) {
          setFormStatus(statusEl, 'error', 'Form is not configured yet.');
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

        if (!isConfigured(oldSitePaymentsApiBaseUrl)) payload.access_key = config.web3forms.accessKey;
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

        let crmPromise = Promise.resolve(null);
        try {
          if (isConfigured(crmApiBaseUrl)) crmPromise = submitCRMIntake(payload);
          const emailPromise = isConfigured(oldSitePaymentsApiBaseUrl)
            ? submitOldSiteEnquiry(payload).then(result => ({ ok: true, result }))
            : isConfigured(config.web3forms.accessKey) ? fetch(config.web3forms.endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify(payload)
            }).then(async response => {
              const result = await response.json().catch(() => ({}));
              return { ok: response.ok && result.success === true, result };
            }) : Promise.resolve({ ok: false, result: {} });
          const [emailResult, crmResult] = await Promise.allSettled([emailPromise, crmPromise]);
          let emailSent = false;
          let emailResponse = {};
          if (emailResult.status === 'fulfilled') {
            emailResponse = emailResult.value?.result || {};
            emailSent = emailResult.value?.ok === true;
          }
          const crmSaved = crmResult.status === 'fulfilled' && crmResult.value !== null;
          if (!emailSent && !crmSaved) {
            throw new Error('Request could not be sent or saved.');
          }
          trackConversion('generate_lead', {
            lead_type: formType,
            lead_destination: crmSaved && emailSent ? 'crm_and_email' : crmSaved ? 'crm' : 'email'
          });
          if (crmResult.status === 'rejected') {
            setFormStatus(statusEl, 'error', emailSent
              ? 'Your request reached our email, but did not sync to the CRM. Please call 07743 565339 to make sure it is logged.'
              : 'Your request could not be saved to the CRM. Please try again or call 07743 565339.');
            return;
          }
          setFormStatus(
            statusEl,
            'success',
            (crmSaved ? 'Thanks, your request has been added to the Prestige Flow CRM.' + (emailSent ? ' A confirmation email has also been sent.' : '') : 'Thanks, your request has been sent to Prestige Flow.' + (email ? ' A confirmation copy will be emailed to you.' : ''))
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
    const PAYMENT_LINK_MAP_PATH = '/data/stripe-payment-link-map.json';
    const PRODUCT_MAP_PATH = '/data/stripe-product-map.json';

    // Require the main card wrapper — bail out on non-booking pages
    const mainCard = document.querySelector('[data-testid="button-next-step"]')
      ?.closest('.shadcn-card');
    if (!mainCard) return;
    mainCard.classList.add('pf-booking');

    // ─── Shared helpers ────────────────────────────────────────────────────────
    const paymentLinks = config.stripe.paymentLinks || {};
    const skuLinks = config.stripe.paymentLinksBySku || {};

    let paymentLinkCache = null;
    let paymentLinkLoadPromise = null;
    let productMapCache = null; // null = not loaded; {} = loaded but empty or error; {sku:…} = loaded ok
    let productMapLoadPromise = null;

    const getRegion = () => {
      return getStoredRegion();
    };

    const setRegion = (value) => {
      setStoredRegion(value, 'manual');
      applyRegionToPage(value);
    };

    const getPeriod = () => {
      return selectedPeriod;
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

    const getPriceAmount = (sku, productMap) => {
      if (liveRatesLoaded && liveRateAmounts) {
        const match = /^(LON|REG)-(DRAIN|EMER|PLUM|CCTV)-(DAY|EVE|WKD|FIX)$/.exec(sku || '');
        if (match) {
          const [,area,service,period] = match;
          const key = area === 'LON' ? 'london' : 'regional';
          const ratePeriod = ({DAY:'daytime',EVE:'evening',WKD:'weekend',FIX:'fixed'})[period];
          return Number(liveRateAmounts?.[key]?.[service]?.[ratePeriod]) || 0;
        }
      }
      const match = /^(?:LON|REG)-(DRAIN|EMER|PLUM|CCTV)-(DAY|EVE|WKD|FIX)$/.exec(sku || '');
      if (match) {
        const [,service,period] = match;
        const ratePeriod = ({DAY:'daytime',EVE:'evening',WKD:'weekend',FIX:'fixed'})[period];
        return Number(FALLBACK_RATE_AMOUNTS[service]?.[ratePeriod]) || Number(productMap?.[sku]?.amount_pence) || 0;
      }
      return Number(productMap?.[sku]?.amount_pence) || 0;
    };

    const getPriceLabel = (sku, productMap) => {
      const amountPence = getPriceAmount(sku, productMap);
      if (amountPence > 0) {
        const pounds = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(amountPence / 100);
        return sku.endsWith('-FIX') ? `£${pounds} + VAT (fixed)` : `£${pounds}/hr + VAT`;
      }
      const entry = productMap?.[sku];
      if (!entry) return null;
      const pounds = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(entry.amount_pence / 100);
      return sku.endsWith('-FIX') ? `£${pounds} + VAT (fixed)` : `£${pounds}/hr + VAT`;
    };

    const getDestination = (service, region, linkMap) => {
      const sku = buildSku(service, region);
      if (sku && /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/.test(linkMap?.[sku] || '')) return { url: linkMap[sku], sku };
      return { url: '', sku }; // Never charge a generic or different service price.
    };

    // ─── Step state ────────────────────────────────────────────────────────────
    let currentStep = 1; // 1=service, 2=details, 3=confirm
    let selectedRegion = getRegion();
    let selectedService = '';
    let selectedPeriod = getCurrentPeriod();
    let customerDetails = { name: '', phone: '', email: '', address: '', postcode: '', date: '', time: '', notes: '' };

    // ─── Step indicator ────────────────────────────────────────────────────────
    // Find the step dots wrapper — it contains exactly the step circles
    const stepContainer = mainCard.previousElementSibling;

    const STEP_LABELS = ['Select Service', 'Your Details', 'Confirm Request'];

    const renderStepIndicator = () => {
      if (!stepContainer) return;
      requestAnimationFrame(() => { const heading = mainCard.querySelector('.text-2xl'); if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); mainCard.scrollIntoView({ block: 'start', behavior: 'instant' }); } });
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

    const paymentResult = new URLSearchParams(window.location.search);
    if (['received','success'].includes(paymentResult.get('payment'))) {
      const reference = paymentResult.get('reference') || 'your booking';
      mainCard.innerHTML = cardShell('Deposit received', 'Your payment was completed securely through Stripe.', iconCheck,
        `<div class="rounded-lg border border-[#d4af37]/35 bg-[rgba(212,175,55,0.08)] p-4 text-sm"><p class="font-semibold mb-2">Your 10% deposit has been charged.</p><p>Your booking request is now with Prestige Flow. We will contact you to confirm the requested date and time. If we cannot accept the slot, our staff will arrange any refund manually through Stripe; your bank may take several working days to show it.</p><p class="mt-3">Booking reference: <strong>${escapeHtml(reference)}</strong></p></div>`,
        `<a class="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2" href="/">Return to homepage</a>`);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    const renderStep1 = () => loadProductMap().then(renderStep2);

    const renderStep2 = (productMap) => {
      const services = ['drainage', 'emergency-drainage', 'plumbing', 'cctv-survey'];
      const period = getPeriod();
      const regionLabel = getRegionLabel(selectedRegion);

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
            <p class="text-xs text-muted-foreground">${svc === 'cctv-survey' ? 'All days' : escapeHtml(PERIOD_LABEL[period])}</p>
          </div>
        </label>`;
      }).join('');

      const footer = `${btn('Continue' + iconArrow, 'bg-primary text-primary-foreground border border-primary-border', 'button-step2-next', 'disabled')}`;

      mainCard.innerHTML = cardShell(
        'Select Your Service',
        `Prices for ${regionLabel} · ${PERIOD_LABEL[period]}`,
        iconWrench,
        `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4"><div class="flex flex-col gap-1.5"><label for="pf-visit-date" class="text-sm font-medium">Requested visit date</label><input id="pf-visit-date" type="date" value="${escapeHtml(customerDetails.date)}" required class="w-full rounded-md border p-2"/></div><div class="flex flex-col gap-1.5"><label for="pf-visit-time" class="text-sm font-medium">Preferred arrival time (UK time)</label><input id="pf-visit-time" type="time" value="${escapeHtml(customerDetails.time)}" required class="w-full rounded-md border p-2"/></div></div><p class="text-sm mb-4">The rate updates from your requested date and time: weekdays 8am–6pm, weekday evenings 6pm–8am, or weekends. We will confirm availability.</p><div role="radiogroup" aria-label="Service" class="grid gap-3">${serviceCards}</div><div class="mt-4 pf-booking-note" aria-live="polite"></div>`,
        footer
      );

      const visitDateInput = mainCard.querySelector('#pf-visit-date');
      const visitTimeInput = mainCard.querySelector('#pf-visit-time');
      const todayUK = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      visitDateInput.min = todayUK;
      const updateVisitPeriod = () => {
        customerDetails.date = visitDateInput.value;
        customerDetails.time = visitTimeInput.value;
        const appointmentPeriod = getAppointmentPeriod(customerDetails.date, customerDetails.time);
        if (appointmentPeriod && appointmentPeriod !== selectedPeriod) {
          selectedPeriod = appointmentPeriod;
          renderStep2(productMap);
        }
      };
      visitDateInput.addEventListener('change', updateVisitPeriod);
      visitTimeInput.addEventListener('change', updateVisitPeriod);
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

      nextBtn2.addEventListener('click', () => {
        customerDetails.date = visitDateInput.value;
        customerDetails.time = visitTimeInput.value;
        if (!customerDetails.date) { note.textContent = 'Please choose your requested visit date.'; visitDateInput.focus(); return; }
        if (!customerDetails.time) { note.textContent = 'Please choose your preferred arrival time in UK time.'; visitTimeInput.focus(); return; }
        const appointmentPeriod = getAppointmentPeriod(customerDetails.date, customerDetails.time);
        if (!appointmentPeriod) { note.textContent = 'Please choose a valid visit date and time.'; return; }
        if (appointmentPeriod !== selectedPeriod) { selectedPeriod = appointmentPeriod; renderStep2(productMap); return; }
        if (!selectedService) { note.textContent = 'Please select a service to continue.'; return; }
        currentStep = 2;
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
          ${field('pf-email', 'Email Address', 'email', true, 'e.g. john@example.com', customerDetails.email)}
          ${field('pf-address', 'Service Address', 'text', true, 'House number and street', customerDetails.address)}
          ${field('pf-postcode', 'Service Postcode', 'text', true, 'e.g. UB4 0AY', customerDetails.postcode)}
          <div class="flex flex-col gap-1.5">
            <label for="pf-notes" class="text-sm font-medium">Additional Notes <span class="text-muted-foreground text-xs">(optional)</span></label>
            <textarea id="pf-notes" name="pf-notes" class="${inputClass} resize-none" rows="3" placeholder="Describe the issue briefly or add access notes…">${escapeHtml(customerDetails.notes)}</textarea>
          </div>
        </div>
        <p class="text-xs text-muted-foreground mt-3">Your details are not submitted at this step. They will be sent with your booking when secure Stripe checkout is connected. Read our <a href="/privacy/">privacy notice</a>.</p>
        <div class="mt-3 pf-booking-note" aria-live="polite"></div>`;

      const footer = `
        ${btn(iconBack + 'Back', 'border border-[var(--button-outline)]', 'button-step3-back')}
        ${btn('Review & Confirm' + iconArrow, 'bg-primary text-primary-foreground border border-primary-border', 'button-step3-next')}`;

      mainCard.innerHTML = cardShell('Your Booking Details', 'We\'ll show you a full summary before any payment is taken', iconUser, bodyHtml, footer);

      const saveDetails = () => {
        for (const key of ['name', 'phone', 'email', 'address', 'postcode', 'notes']) {
          customerDetails[key] = mainCard.querySelector('#pf-' + key)?.value.trim() || '';
        }
      };
      mainCard.querySelector('[data-testid="button-step3-back"]').addEventListener('click', () => {
        saveDetails();
        currentStep = 1;
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

        saveDetails();
        for (const input of mainCard.querySelectorAll('input')) { if (!input.reportValidity()) return; }
        if (!/^[+\d\s().-]{7,20}$/.test(phone) || phone.replace(/\D/g, '').length < 10) { note.textContent = 'Please enter a valid phone number.'; return; }
        if (!/^(GIR 0AA|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})$/i.test(customerDetails.postcode)) { note.textContent = 'Please enter a valid UK postcode.'; return; }
        const appointmentPeriod = getAppointmentPeriod(customerDetails.date, customerDetails.time);
        if (!appointmentPeriod || (selectedService !== 'cctv-survey' && appointmentPeriod !== selectedPeriod)) { note.textContent = 'The selected rate does not match your requested appointment time. Go back and check the visit date and UK time.'; return; }
        currentStep = 3;
        renderStepIndicator();
        Promise.all([loadProductMap(), loadPaymentLinks()]).then(([pm, links]) => renderStep4(pm, links));
      });
    };

    const renderStep4 = (productMap, linkMap) => {
      const regionLabel   = getRegionLabel(selectedRegion);
      const period        = getPeriod();
      const sku           = buildSku(selectedService, selectedRegion);
      const priceLabel    = getPriceLabel(sku, productMap);
      const { url: destination } = getDestination(selectedService, selectedRegion, linkMap);
      const isFixed       = sku.endsWith('-FIX');
      const product = productMap[sku] || {};
      const firstHourTotalPence = Math.round(getPriceAmount(sku, productMap) * 1.2);
      const depositPence = Math.round(firstHourTotalPence / 10);
      // The standalone booking API charges the 10% deposit now. Staff manage
      // any refund manually in Stripe Dashboard if a requested slot is declined.
      const dynamicBookingCheckout = isConfigured(oldSitePaymentsApiBaseUrl) && liveCheckoutEnabled;
      // Legacy Payment Links charge the entire listed price and cannot honour
      // the 10% deposit/refund-on-rejection booking policy, so booking never uses them.
      const legacyStripeCheckout = false;
      const checkoutReady = dynamicBookingCheckout || legacyStripeCheckout;
      const priceDisplay  = priceLabel || 'Price on request';
      const money = pence => '£' + (pence / 100).toFixed(2);

      const row = (label, value, highlight = false) =>
        `<div class="flex justify-between items-center py-2.5 border-b last:border-0">
          <span class="text-sm text-muted-foreground">${escapeHtml(label)}</span>
          <span class="text-sm font-medium${highlight ? ' text-primary font-semibold' : ''}">${escapeHtml(value)}</span>
        </div>`;

      const bodyHtml = `
        <div class="rounded-lg border bg-muted/30 p-4 mb-4">
          ${row('Area', regionLabel)}
          ${row('Service', SERVICE_LABEL[selectedService] || selectedService)}
          ${row('Rate Period', isFixed ? 'Fixed price, all days' : PERIOD_LABEL[period])}
          ${row('Requested Date and Time (UK)', customerDetails.date + ' at ' + customerDetails.time)}
          ${row('Service Address', customerDetails.address + ', ' + customerDetails.postcode)}
          ${row('Rate before VAT', priceDisplay, true)}
          ${row(isFixed ? 'Fixed survey total including VAT' : 'First hour total including 20% VAT', money(firstHourTotalPence), true)}
          ${dynamicBookingCheckout ? row(isFixed ? '10% booking deposit on fixed survey' : '10% booking deposit on first hour', money(depositPence)) : legacyStripeCheckout ? row(isFixed ? 'Stripe payment' : 'First hour payment via Stripe', priceDisplay) : row('Payment', 'Secure Stripe checkout is being connected')}
          ${dynamicBookingCheckout ? row('Remaining labour balance', 'Charged at completion only with your explicit card-storage consent; otherwise arranged manually') : ''}
          ${isFixed ? '' : row('Additional labour', 'Billed in agreed half-hour blocks after the first hour; parts are separate')}
          ${customerDetails.name  ? row('Your Name', customerDetails.name)   : ''}
          ${customerDetails.phone ? row('Phone',     customerDetails.phone)   : ''}
          ${customerDetails.email ? row('Email',     customerDetails.email)   : ''}
        </div>
        ${customerDetails.notes ? `<div class="rounded-lg border bg-muted/30 p-3 mb-4"><p class="text-xs text-muted-foreground font-medium mb-1">Your notes:</p><p class="text-sm">${escapeHtml(customerDetails.notes)}</p></div>` : ''}
        <div class="rounded-lg border border-[#d4af37]/30 bg-[rgba(212,175,55,0.06)] p-3 text-sm">
          <p class="font-medium mb-1">${dynamicBookingCheckout ? '💳 Secure Stripe deposit payment' : legacyStripeCheckout ? '💳 Secure Stripe payment' : 'Secure online booking checkout'}</p>
        <p class="text-muted-foreground text-xs">${dynamicBookingCheckout ? `The ${money(depositPence)} deposit is 10% of the VAT-inclusive first hour${isFixed ? ' fixed survey fee' : ''} and is charged immediately at checkout. Prestige Flow will review your requested slot. If we cannot accept it, staff will arrange a refund manually through Stripe; your bank may take several working days to show the refund. Labour beyond the first hour is charged in half-hour blocks at the agreed rate. Parts are excluded and agreed separately. Your card details are handled by Stripe.` : legacyStripeCheckout ? `Stripe will charge the displayed ${isFixed ? 'fixed survey price' : 'first-hour service rate'} plus applicable VAT at checkout. This legacy Payment Link cannot take a 10% deposit, confirm your appointment slot, or charge the later labour balance. Prestige Flow will confirm availability separately. Your card details are handled by Stripe.` : 'Secure checkout is being connected and this booking cannot be completed online yet. Call Prestige Flow on 07743 565339 to arrange and confirm your visit. Online payment will be available once the new Stripe booking flow is connected.'}</p>
        </div>
        ${dynamicBookingCheckout ? `<label class="flex items-start gap-3 rounded-lg border p-3 mt-3 text-sm cursor-pointer" for="pf-card-charge-consent"><input id="pf-card-charge-consent" type="checkbox" class="mt-1"/><span>Optional: I authorize Prestige Flow to securely save my card for this booking and charge the agreed remaining labour balance when the job is completed. This does not change the deposit: 10% is charged now. If Prestige Flow cannot accept my requested slot, staff will arrange a refund manually. The remaining labour is charged in started half-hour blocks after the first hour; parts are excluded. Without this opt-in, the final balance will be arranged manually.</span></label>` : ''}
        <div class="mt-3 pf-booking-note" aria-live="polite"></div>`;

      const payBtnText = !checkoutReady
        ? 'Secure Checkout Not Connected'
        : dynamicBookingCheckout
        ? `Pay 10% deposit securely${iconArrow}`
        : legacyStripeCheckout
        ? priceLabel
          ? `Pay ${priceLabel.replace(' + VAT', '')} + VAT via Stripe${iconArrow}`
          : `Proceed to Stripe Checkout${iconArrow}`
        : priceLabel
        ? `Pay ${priceLabel.replace(' + VAT', '')} + VAT via Stripe${iconArrow}`
        : `Proceed to Stripe Checkout${iconArrow}`;

      const footer = `
        ${btn(iconBack + 'Back', 'border border-[var(--button-outline)]', 'button-step4-back')}
        ${btn(payBtnText, 'bg-primary text-primary-foreground border border-primary-border text-base font-semibold', 'button-step4-pay', (checkoutReady && (dynamicBookingCheckout ? isConfigured(oldSitePaymentsApiBaseUrl) : isConfigured(destination))) ? '' : 'disabled')}`;

      mainCard.innerHTML = cardShell(checkoutReady ? 'Confirm & Pay' : 'Online Booking Setup', checkoutReady ? 'Review your booking — then continue to secure Stripe checkout' : 'Secure online booking will be available once Stripe is connected.', iconCheck, bodyHtml, footer);
      if (!checkoutReady) {
        const note = mainCard.querySelector('.pf-booking-note');
        if (note) note.innerHTML = 'To book now, call <a class="underline font-medium" href="tel:+447743565339">07743 565339</a>. Online checkout will be enabled before launch.';
      }

      mainCard.querySelector('[data-testid="button-step4-back"]').addEventListener('click', () => {
        currentStep = 2;
        renderStepIndicator();
        renderStep3();
      });

      mainCard.querySelector('[data-testid="button-step4-pay"]')?.addEventListener('click', async () => {
        if (!checkoutReady) return;
        const payBtn = mainCard.querySelector('[data-testid="button-step4-pay"]');
        const note   = mainCard.querySelector('.pf-booking-note');
        payBtn.disabled = true;
        if (note) note.textContent = 'Preparing secure Stripe checkout redirect…';
        try {
          if (!isConfigured(config.web3forms.accessKey) && !isConfigured(oldSitePaymentsApiBaseUrl)) throw new Error('Booking service unavailable');
          const reference = 'PF-' + crypto.randomUUID();
          const cardChargeConsent = mainCard.querySelector('#pf-card-charge-consent')?.checked === true;
          const bookingDepositAmount = dynamicBookingCheckout ? money(depositPence) : 'Not applicable';
          const bookingDepositPercentage = dynamicBookingCheckout ? 10 : 'Not applicable';
          const remainingBalanceInstructions = dynamicBookingCheckout
            ? 'Labour balance charged at job completion only with the customer\'s explicit stored-card consent; otherwise arranged manually. Parts are excluded.'
            : legacyStripeCheckout
              ? 'Existing Stripe Payment Link charges the full first-hour service rate or fixed survey price immediately. Additional labour is billed in agreed half-hour blocks and paid separately; parts are excluded.'
              : 'No automatic saved-card balance is configured; confirm payment arrangements with the customer. Parts are excluded.';
          const bookingPayload = { ...customerDetails, form_type: 'booking',
            service: SERVICE_LABEL[selectedService], region: selectedRegion, rate_period: period,
            card_charge_consent: cardChargeConsent,
            sku, reference, first_hour_including_vat: money(firstHourTotalPence), deposit_amount: bookingDepositAmount, deposit_percentage: bookingDepositPercentage,
            remaining_balance_due: remainingBalanceInstructions,
            source: window.location.origin + '/booking/' };
          const tasks = [];
          if (isConfigured(config.web3forms.accessKey) && !dynamicBookingCheckout) tasks.push(withTimeout(fetch(config.web3forms.endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ access_key: config.web3forms.accessKey, subject: 'Prestige Flow booking request ' + reference,
              from_name: config.web3forms.fromName, botcheck: '', ...customerDetails, replyto: customerDetails.email,
              service: SERVICE_LABEL[selectedService], region: regionLabel, rate_period: period, rate_period_label: PERIOD_LABEL[period],
              sku, reference, first_hour_including_vat: money(firstHourTotalPence), deposit_amount: bookingDepositAmount, deposit_percentage: bookingDepositPercentage,
              card_charge_consent: cardChargeConsent,
              remaining_balance_due: remainingBalanceInstructions,
          payment_status: dynamicBookingCheckout ? `10% deposit (${money(depositPence)}) is charged immediately at Stripe Checkout; if the requested slot is rejected, staff arrange the refund manually in Stripe. Remaining labour charged at completion only with explicit saved-card consent. Parts excluded.` : legacyStripeCheckout ? `Customer is being redirected to the existing Stripe Payment Link for the ${isFixed ? 'fixed survey rate' : 'first-hour service rate'}. Payment is immediate at Stripe checkout. Appointment availability must be confirmed separately.` : 'No payment is authorised or captured; checkout is not connected.' })
          }).then(async response => ({ kind: 'email', ok: response.ok && (await response.json().catch(() => ({}))).success === true })), 15000));
          if (dynamicBookingCheckout) tasks.push(submitOldSiteBooking(bookingPayload).then(result => ({ kind: 'old-site-payment', ok: true, emailQueued: result.emailQueued === true, paymentUrl: result.checkoutUrl, bookingReference: result.bookingReference })));
          const outcomes = await Promise.allSettled(tasks);
          const emailResult = outcomes.find(result => result.status === 'fulfilled' && result.value.kind === 'email');
          const crmResult = outcomes.find(result => result.status === 'fulfilled' && result.value.kind === 'old-site-payment');
          const emailSent = (emailResult?.status === 'fulfilled' && emailResult.value.ok) || (crmResult?.status === 'fulfilled' && crmResult.value.emailQueued);
          const crmSaved = Boolean(crmResult);
          if (dynamicBookingCheckout && !crmSaved) throw new Error('Your email may have been sent, but secure checkout could not be started. No payment was taken; please call 07743 565339.');
          if (!emailSent && !crmSaved) throw new Error('Booking request could not be emailed or saved.');
          trackConversion('generate_lead', {
            lead_type: 'booking',
            service_type: selectedService,
            service_area: selectedRegion,
            lead_destination: crmSaved && emailSent ? 'crm_and_email' : crmSaved ? 'crm' : 'email'
          });
          if (isConfigured(oldSitePaymentsApiBaseUrl) && dynamicBookingCheckout && !crmSaved) {
            mainCard.innerHTML = cardShell('Booking Request Needs Follow-up', 'The email request was sent, but this booking did not sync to the CRM. Please call us to confirm it is logged.', iconCheck, `<p class="text-sm">No payment was taken. Call <a href="tel:+447743565339">07743 565339</a> and give us your preferred visit time: ${escapeHtml(customerDetails.date)} at ${escapeHtml(customerDetails.time)} UK time.</p>`, '');
            return;
          }
          const crmOutcome = outcomes.find(result => result.status === 'fulfilled' && result.value.kind === 'old-site-payment');
          const dynamicPaymentUrl = crmOutcome?.status === 'fulfilled' ? crmOutcome.value.paymentUrl : '';
          if (dynamicPaymentUrl) {
            window.location.assign(dynamicPaymentUrl);
            return;
          }
          if (!checkoutReady || dynamicBookingCheckout) {
            const checkoutFailed = crmOutcome?.status === 'fulfilled' && crmOutcome.value.checkoutError;
            const paymentMessage = checkoutFailed
              ? 'Your booking request was saved, but secure deposit checkout could not be started. No payment was taken. Please call 07743 565339 so we can help complete your booking.'
              : 'No payment was authorized or taken; payment arrangements will be confirmed with you separately.';
            mainCard.innerHTML = cardShell('Request Received', `Thank you — your booking request was ${crmSaved ? 'saved in our CRM and ' : ''}sent to Prestige Flow. It is not a confirmed appointment and no payment was taken. Call us on 07743 565339 to arrange and confirm your visit. ${paymentMessage}`, iconCheck, `<p class="text-sm">Call <a href="tel:+447743565339">07743 565339</a> to arrange your visit.</p>`, '');
            return;
          }
          const checkout = new URL(destination);
          checkout.searchParams.set('client_reference_id', reference);
          checkout.searchParams.set('prefilled_email', customerDetails.email);
          window.location.assign(checkout.href);
        } catch (_) {
          note.textContent = error instanceof Error ? error.message : 'We could not send your booking details. No payment has been taken. Please try again or call 07743 565339.';
          payBtn.disabled = false;
        }
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

  const setupHomepageParticles = () => {
    const canvas = document.querySelector('[data-pf-hero-particles]');
    if (!canvas) return;
    const context = canvas.getContext?.('2d', { alpha: true });
    const hero = canvas.closest('section');
    if (!context || !hero) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const particles = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let lastFrame = 0;
    const random = (min, max) => Math.random() * (max - min) + min;

    const resize = () => {
      const rect = hero.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(44, Math.max(18, Math.round(width / 28)));
      particles.length = 0;
      for (let i = 0; i < count; i++) {
        particles.push({
          x: random(0, width),
          y: random(0, height),
          vx: reducedMotion ? 0 : random(-0.16, 0.16),
          vy: reducedMotion ? 0 : random(-0.14, 0.14),
          radius: random(1, 2.2),
          gold: Math.random() > 0.28
        });
      }
      draw(0);
    };

    const draw = (delta) => {
      context.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        if (!reducedMotion && delta > 0) {
          a.x += a.vx * delta;
          a.y += a.vy * delta;
          if (a.x < -4) a.x = width + 4;
          if (a.x > width + 4) a.x = -4;
          if (a.y < -4) a.y = height + 4;
          if (a.y > height + 4) a.y = -4;
        }
        context.beginPath();
        context.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
        context.fillStyle = a.gold ? 'rgba(212, 175, 55, 0.62)' : 'rgba(232, 239, 250, 0.48)';
        context.fill();
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > 112) continue;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.strokeStyle = `rgba(212, 175, 55, ${(1 - distance / 112) * 0.14})`;
          context.lineWidth = 0.7;
          context.stroke();
        }
      }
    };

    const animate = (time) => {
      frame = 0;
      if (!visible || document.hidden || reducedMotion) return;
      const delta = lastFrame ? Math.min(32, time - lastFrame) : 16;
      lastFrame = time;
      draw(delta);
      frame = window.requestAnimationFrame(animate);
    };
    const start = () => {
      if (reducedMotion) { draw(0); return; }
      if (visible && !document.hidden && !frame) frame = window.requestAnimationFrame(animate);
    };
    const stop = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      lastFrame = 0;
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        visible ? start() : stop();
      }, { threshold: 0 });
      observer.observe(hero);
    }
    start();
  };

  onReady(() => {
    document.body.style.pointerEvents = '';
    setupHomepageParticles();
    setupCookieBanner();
    setupFaqAccordions();
    setupMobileMenu();
    setupComboboxFallbacks();
    setupMenuButtonFallbacks();
    setupRegionSelectorButtons();
    setupAutomaticRegionPricing();
    setupHeaderScroll();
    setupWeb3Forms();
    setupBookingPaymentFallback();
    setupGoogleReviewSummary();
    const instagramFallback = document.querySelector("[data-pf-instagram-fallback]");
    if (instagramFallback) window.setTimeout(() => { instagramFallback.hidden = false; }, 12000);
  });
})();
