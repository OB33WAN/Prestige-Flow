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
    },
    crm: { apiBaseUrl: '' }
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
    crm: { ...base.crm, ...(incoming?.crm || {}) }
  });

  const config = mergeConfig(DEFAULT_CONFIG, window.PrestigeFlowConfig || {});
  const crmApiBaseUrl = String(config.crm?.apiBaseUrl || window.location.origin).trim().replace(/\/+$/, '');

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

  // Version the auto-detected area state so old manually selected regions do
  // not keep overriding location-based prices after the selector is removed.
  const REGION_KEY = 'pf_region_v2';
  const REGION_SOURCE_KEY = 'pf_region_source_v2';
  const GEO_CACHE_KEY = 'pf_region_geo_cache_v2';
  const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const REGION_LABELS = {
    london: 'London',
    regional: 'Reading, Slough & SE'
  };
  const REGION_RATES = {
    london: {
      drainage: { daytime: '£140/hr', evening: '£160/hr', weekend: '£160/hr' },
      plumbing: { daytime: '£105/hr', evening: '£115/hr', weekend: '£115/hr' },
      cctv: '£175 + VAT (fixed)'
    },
    regional: {
      drainage: { daytime: '£140/hr', evening: '£160/hr', weekend: '£160/hr' },
      plumbing: { daytime: '£95/hr', evening: '£110/hr', weekend: '£110/hr' },
      cctv: '£175 + VAT (fixed)'
    }
  };
  let liveRatesLoaded = false;
  let liveRateAmounts = null;
  let liveCheckoutEnabled = false;
  const loadLiveRates = async () => {
    const base = crmApiBaseUrl;
    if (!base) return;
    try {
      const response = await withTimeout(fetch(`${base}/api/public/rates`, { mode: 'cors', credentials: 'omit', cache: 'no-store' }), 5000);
      if (!response.ok) return;
      const { rates, checkoutEnabled } = await response.json();
      liveRateAmounts = rates;
      liveCheckoutEnabled = checkoutEnabled === true;
      const moneyPerHour = pence => `£${(Number(pence) / 100).toFixed(Number(pence) % 100 ? 2 : 0)}/hr`;
      for (const [key, code] of [['london','london'],['regional','regional']]) {
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
    window.localStorage.removeItem('pf_region_source');
    window.localStorage.removeItem('pf_region_geo_cache');
  } catch (_) { /* Ignore restricted storage. */ }

  const normalizeRegion = (value) => value === 'regional' ? 'regional' : 'london';

  const getRegionLabel = (region) => REGION_LABELS[normalizeRegion(region)] || REGION_LABELS.london;

  const getStoredRegion = () => normalizeRegion(storageGet(REGION_KEY));

  const setStoredRegion = (region, source) => {
    storageSet(REGION_KEY, normalizeRegion(region));
    if (source) storageSet(REGION_SOURCE_KEY, source);
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

  const swapVariant = (text, londonValue, regionalValue, region) => {
    const target = region === 'regional' ? regionalValue : londonValue;
    return text.split(londonValue).join(target).split(regionalValue).join(target);
  };

  const pricingOriginals = new WeakMap();
  const updateServiceRoots = (region) => {
    const main = document.querySelector('main');
    if (!main || window.location.pathname.startsWith('/booking')) return;
    walkTextNodes(main, node => {
      if (node.parentElement.closest('[data-pricing-table]')) return;
      if (!pricingOriginals.has(node)) pricingOriginals.set(node, node.nodeValue);
      const original = pricingOriginals.get(node);
      if (!/£\s*\d+(?:\.\d{1,2})?(?=\s*(?:\/|per\b|\+))/i.test(original)) return;

      // Change only copy inside an unambiguous plumbing service card/section.
      // Broad mixed-service copy and the all-area comparison table stay intact.
      let service = '';
      for (let el = node.parentElement; el && el !== main.parentElement; el = el.parentElement) {
        const text = el.textContent || '';
        if (text.length > 320) continue;
        const plumbing = /plumb/i.test(text);
        const drainage = /drain/i.test(text);
        const cctv = /cctv/i.test(text);
        if (Number(plumbing) + Number(drainage) + Number(cctv) === 1) {
          service = plumbing ? 'plumbing' : drainage ? 'drainage' : 'cctv';
          break;
        }
      }
      // Dedicated plumbing landing pages can have large copy blocks whose
      // closest useful heading is outside the small-card text scan above.
      if (!service && /\/plumbing(?:\/|$)/i.test(window.location.pathname)) service = 'plumbing';
      if (!service) return;
      const rateSet = REGION_RATES[normalizeRegion(region)];
      const periodText = original.toLowerCase();
      const oldAmount = Number(original.match(/£\s*(\d+(?:\.\d{1,2})?)/)?.[1]);
      const originalRates = REGION_RATES[normalizeRegion(region)];
      const knownDayRate = service === 'plumbing' ? [95,105].includes(oldAmount) : service === 'cctv' ? false : oldAmount === 140;
      const pricePeriod = /weekend|\bsat(?:urday)?\b|\bsun(?:day)?\b/.test(periodText) ? 'weekend' : /8\s*am\s*(?:-|–|to)\s*6\s*pm|daytime/.test(periodText) ? 'daytime' : /6\s*pm\s*(?:-|–|to)\s*8\s*am|evening/.test(periodText) ? 'evening' : knownDayRate ? 'daytime' : /from\s*£/i.test(original) ? 'daytime' : getCurrentPeriod();
      const priceText = service === 'plumbing' ? rateSet.plumbing[pricePeriod] : service === 'cctv' ? rateSet.cctv : rateSet.drainage[pricePeriod];
      const numericRate = priceText.match(/[\d.]+/)?.[0];
      if (!numericRate) return;
      node.nodeValue = original.replace(/£\s*\d+(?:\.\d{1,2})?(?=\s*(?:\/|per\b|\+))/gi, '£' + numericRate);
    });
  };

  const updateRegionDecorators = (region) => {
    const label = getRegionLabel(region);

    document.querySelectorAll('[data-testid^="button-region-selector"]').forEach((btn) => {
      const textNode = [...btn.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (textNode) textNode.textContent = label;
    });
    document.querySelectorAll('[data-pf-auto-region]').forEach((tag) => { tag.textContent = label; });

    const inlineBanner = document.querySelector('[data-testid="button-region-selector-inline"]');
    if (inlineBanner) {
      const labelNode = inlineBanner.parentElement?.querySelector('span:not(.text-muted-foreground)');
      if (labelNode && !labelNode.querySelector('button')) {
        labelNode.textContent = 'Showing prices for ' + label;
      }
    }

    document.querySelectorAll('span').forEach((span) => {
      const text = span.textContent?.trim() || '';
      if (text === 'Prices for: London' || text === 'Prices for: Reading, Slough & SE') {
        span.textContent = 'Prices for: ' + label;
      }
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
    updateServiceRoots(normalizedRegion);
  };

  // ─── Region picker dropdown ────────────────────────────────────────────────
  // The static HTML preserved the Radix menu trigger buttons but without their
  // React dropdown logic. We recreate a lightweight dropdown here so users can
  // manually switch between London and Regional pricing from any page.
  let regionDropdownVisible = false;
  let regionDropdownEl = null;

  const closeRegionDropdown = () => {
    if (regionDropdownEl) {
      regionDropdownEl.remove();
      regionDropdownEl = null;
    }
    regionDropdownVisible = false;
  };

  const openRegionDropdown = (anchorBtn) => {
    closeRegionDropdown();

    const currentRegion = getStoredRegion();
    const dropdown = document.createElement('div');
    dropdown.setAttribute('role', 'menu');
    dropdown.setAttribute('aria-label', 'Select pricing area');
    dropdown.style.cssText = [
      'position:fixed',
      'z-index:9999',
      'background:hsl(var(--popover, 0 0% 100%))',
      'color:hsl(var(--popover-foreground, 215 45% 15%))',
      'border:1px solid hsl(var(--border, 215 15% 88%))',
      'border-radius:0.5rem',
      'box-shadow:0 4px 24px rgba(0,0,0,0.18)',
      'padding:0.375rem',
      'min-width:260px'
    ].join(';');

    const options = [
      { value: 'london',   label: 'London',              desc: 'Greater London' },
      { value: 'regional', label: 'Reading, Slough & SE', desc: 'Berkshire, Surrey, Kent, Herts, Bucks & more' }
    ];

    dropdown.innerHTML = [
      `<p style="font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:hsl(var(--muted-foreground,215 15% 55%));padding:0.4rem 0.6rem 0.3rem;">Showing prices for</p>`,
      ...options.map(({ value, label, desc }) => {
        const active = currentRegion === value;
        return `<button type="button" role="menuitem" data-region-pick="${escapeHtml(value)}"
          style="display:flex;align-items:flex-start;gap:0.6rem;width:100%;padding:0.55rem 0.6rem;border-radius:0.35rem;border:none;background:${active ? 'rgba(212,175,55,0.12)' : 'transparent'};cursor:pointer;text-align:left;color:inherit;${active ? 'outline:2px solid rgba(212,175,55,0.5);outline-offset:-2px;' : ''}">
          <span style="font-size:1rem;line-height:1.2;margin-top:0.05rem;color:hsl(var(--primary,45 80% 28%))">${active ? '✓' : '○'}</span>
          <span style="flex:1">
            <span style="display:block;font-size:0.875rem;font-weight:${active ? '600' : '500'};color:hsl(var(--popover-foreground,215 45% 15%))">${escapeHtml(label)}</span>
            <span style="display:block;font-size:0.75rem;color:hsl(var(--muted-foreground,215 15% 55%));margin-top:0.1rem">${escapeHtml(desc)}</span>
          </span>
        </button>`;
      })
    ].join('');

    dropdown.querySelectorAll('[data-region-pick]').forEach((item) => {
      item.addEventListener('click', () => {
        const picked = item.getAttribute('data-region-pick');
        setStoredRegion(picked, 'manual');
        applyRegionToPage(picked);
        closeRegionDropdown();
      });
    });

    document.body.appendChild(dropdown);
    regionDropdownEl = dropdown;
    regionDropdownVisible = true;

    // Position below the anchor button
    const rect = anchorBtn.getBoundingClientRect();
    const dropW = 260;
    let left = rect.left;
    if (left + dropW > window.innerWidth - 8) left = window.innerWidth - dropW - 8;
    dropdown.style.top = (rect.bottom + 6 + window.scrollY) + 'px';
    dropdown.style.left = Math.max(8, left) + 'px';
  };

  const setupRegionSelectorButtons = () => {
    document.querySelectorAll('[data-testid^="button-region-selector"]').forEach((btn) => {
      const label = document.createElement('span');
      label.className = 'inline-flex items-center gap-1 text-primary font-medium';
      label.dataset.pfAutoRegion = '';
      label.textContent = getRegionLabel(getStoredRegion());
      const nearbyText = [...(btn.parentElement?.childNodes || [])].find(node => node.nodeType === Node.TEXT_NODE && /Prices for:/i.test(node.textContent || ''));
      if (nearbyText) nearbyText.textContent = nearbyText.textContent.replace(/Prices for:/i, 'Estimated prices for:');
      btn.replaceWith(label);
    });
  };

  const setupAutomaticRegionPricing = () => {
    applyRegionToPage(getStoredRegion());
    const source = storageGet(REGION_SOURCE_KEY);
    if (source !== 'manual') {
      detectRegionFromGeo().then(region => {
        if (storageGet(REGION_SOURCE_KEY) === 'manual') return;
        setStoredRegion(region, 'automatic');
        applyRegionToPage(region);
      }).catch(() => {});
    }
    void loadLiveRates();

    let lastPeriod = getCurrentPeriod();
    const refreshTimeBasedRates = () => {
      const currentPeriod = getCurrentPeriod();
      if (currentPeriod === lastPeriod) return;
      lastPeriod = currentPeriod;
      applyRegionToPage(getStoredRegion());
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

        if (!isConfigured(config.web3forms.accessKey) && !isConfigured(crmApiBaseUrl)) {
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

        let crmPromise = Promise.resolve(null);
        try {
          if (isConfigured(crmApiBaseUrl)) crmPromise = submitCRMIntake(payload);
          const emailPromise = isConfigured(config.web3forms.accessKey) ? fetch(config.web3forms.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify(payload)
          }) : Promise.resolve(null);
          const [emailResult, crmResult] = await Promise.allSettled([emailPromise, crmPromise]);
          let emailSent = false;
          let emailResponse = {};
          if (emailResult.status === 'fulfilled') {
            emailResponse = emailResult.value ? await emailResult.value.json().catch(() => ({})) : {};
            emailSent = Boolean(emailResult.value?.ok && emailResponse.success === true);
          }
          const crmSaved = crmResult.status === 'fulfilled' && crmResult.value !== null;
          if (!emailSent && !crmSaved) {
            throw new Error('Request could not be sent or saved.');
          }
          if (!emailSent && crmSaved) {
            setFormStatus(statusEl, 'error', 'Your request was saved in the CRM, but the email notification failed. Please call 07743 565339 if you need an immediate response.');
            form.reset();
            return;
          }
          if (crmResult.status === 'rejected') {
            setFormStatus(statusEl, 'error', 'Your request reached our email, but did not sync to the CRM. Please call 07743 565339 to make sure it is logged.');
            form.reset();
            return;
          }
          const emailLine = email
            ? ' A confirmation copy has been requested for ' + email + '.'
            : ' Add your email in the form to receive a confirmation copy.';

          setFormStatus(
            statusEl,
            'success',
            (crmSaved ? (emailSent ? 'Thanks, your request was emailed and added to the Prestige Flow CRM.' : 'Thanks, your request was added to the Prestige Flow CRM.') : 'Thanks, your request was sent to ' + config.web3forms.businessEmail + '.' + emailLine)
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
    let currentStep = 1; // 1=area, 2=service, 3=details, 4=confirm
    let selectedRegion = getRegion();
    let selectedService = '';
    let selectedPeriod = getCurrentPeriod();
    let customerDetails = { name: '', phone: '', email: '', address: '', postcode: '', date: '', time: '', notes: '' };

    // ─── Step indicator ────────────────────────────────────────────────────────
    // Find the step dots wrapper — it contains exactly the step circles
    const stepContainer = mainCard.previousElementSibling;

    const STEP_LABELS = ['Select Area', 'Select Service', 'Your Details', 'Confirm & Pay'];

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
            <p class="text-xs text-muted-foreground">${svc === 'cctv-survey' ? 'All days' : escapeHtml(PERIOD_LABEL[period])}</p>
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

      mainCard.querySelector('[data-testid="button-step2-back"]').addEventListener('click', () => {
        currentStep = 1;
        renderStepIndicator();
        renderStep1();
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
          ${field('pf-email', 'Email Address', 'email', true, 'e.g. john@example.com', customerDetails.email)}
          ${field('pf-address', 'Service Address', 'text', true, 'House number and street', customerDetails.address)}
          ${field('pf-postcode', 'Service Postcode', 'text', true, 'e.g. UB4 0AY', customerDetails.postcode)}
          <div class="flex flex-col gap-1.5">
            <label for="pf-notes" class="text-sm font-medium">Additional Notes <span class="text-muted-foreground text-xs">(optional)</span></label>
            <textarea id="pf-notes" name="pf-notes" class="${inputClass} resize-none" rows="3" placeholder="Describe the issue briefly or add access notes…">${escapeHtml(customerDetails.notes)}</textarea>
          </div>
        </div>
        <p class="text-xs text-muted-foreground mt-3">When you continue from the summary, we send these details to Prestige Flow to arrange your visit. Read our <a href="/privacy/">privacy notice</a>. An appointment is confirmed only when our team contacts you.</p>
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

        saveDetails();
        for (const input of mainCard.querySelectorAll('input')) { if (!input.reportValidity()) return; }
        if (!/^[+\d\s().-]{7,20}$/.test(phone) || phone.replace(/\D/g, '').length < 10) { note.textContent = 'Please enter a valid phone number.'; return; }
        if (!/^(GIR 0AA|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})$/i.test(customerDetails.postcode)) { note.textContent = 'Please enter a valid UK postcode.'; return; }
        const appointmentPeriod = getAppointmentPeriod(customerDetails.date, customerDetails.time);
        if (!appointmentPeriod || (selectedService !== 'cctv-survey' && appointmentPeriod !== selectedPeriod)) { note.textContent = 'The selected rate does not match your requested appointment time. Go back and check the visit date and UK time.'; return; }
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
      const product = productMap[sku] || {};
      const firstHourTotalPence = Math.round(getPriceAmount(sku, productMap) * 1.2);
      const depositPence = Math.round(firstHourTotalPence / 10);
      // Existing Stripe links charge the full listed rate. Enable a link only if
      // its mapping explicitly identifies this exact 10% deposit amount.
      const dynamicCrmCheckout = isConfigured(crmApiBaseUrl) && liveCheckoutEnabled;
      const checkoutReady = dynamicCrmCheckout || (product.checkout_ready === true &&
        product.checkout_type === 'deposit' &&
        product.checkout_amount_pence === depositPence);
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
          ${row(isFixed ? '10% booking deposit on fixed survey' : '10% booking deposit on first hour', money(depositPence))}
          ${row('Remaining balance', 'Due on site after the work')}
          ${isFixed ? '' : row('Additional time or work', 'Only with your agreement; balance due on site')}
          ${customerDetails.name  ? row('Your Name', customerDetails.name)   : ''}
          ${customerDetails.phone ? row('Phone',     customerDetails.phone)   : ''}
          ${customerDetails.email ? row('Email',     customerDetails.email)   : ''}
        </div>
        ${customerDetails.notes ? `<div class="rounded-lg border bg-muted/30 p-3 mb-4"><p class="text-xs text-muted-foreground font-medium mb-1">Your notes:</p><p class="text-sm">${escapeHtml(customerDetails.notes)}</p></div>` : ''}
        <div class="rounded-lg border border-[#d4af37]/30 bg-[rgba(212,175,55,0.06)] p-3 text-sm">
          <p class="font-medium mb-1">${checkoutReady ? '💳 Secure Stripe deposit checkout' : 'Booking request — no payment now'}</p>
          <p class="text-muted-foreground text-xs">${checkoutReady ? `Stripe will collect only the ${money(depositPence)} 10% deposit shown above. The remaining balance and any additional agreed work are payable on site.` : `The deposit shown is 10% of the first hour${isFixed ? ' fixed survey fee' : ''}, including VAT. No payment is taken with this request; after confirming availability, we will arrange the deposit. The remaining balance is due on site after the work.`}${checkoutReady ? ' Your card details are handled entirely by Stripe — we never see them.' : ''}</p>
        </div>
        <div class="mt-3 pf-booking-note" aria-live="polite"></div>`;

      const payBtnText = !checkoutReady
        ? `Send Booking Request${iconArrow}`
        : dynamicCrmCheckout
        ? `Pay 10% first-hour deposit${iconArrow}`
        : priceLabel
        ? `Pay ${priceLabel.replace(' + VAT', '')} + VAT via Stripe${iconArrow}`
        : `Proceed to Stripe Checkout${iconArrow}`;

      const footer = `
        ${btn(iconBack + 'Back', 'border border-[var(--button-outline)]', 'button-step4-back')}
        ${btn(payBtnText, 'bg-primary text-primary-foreground border border-primary-border text-base font-semibold', 'button-step4-pay', (dynamicCrmCheckout ? isConfigured(crmApiBaseUrl) : (checkoutReady ? isConfigured(destination) : (isConfigured(config.web3forms.accessKey) || isConfigured(crmApiBaseUrl)))) ? '' : 'disabled')}`;

      mainCard.innerHTML = cardShell(checkoutReady ? 'Confirm & Pay' : 'Request Booking', checkoutReady ? 'Review your booking — then continue to secure Stripe checkout' : 'Review your details and ask us to confirm an appointment', iconCheck, bodyHtml, footer);

      if (!isConfigured(destination) && !checkoutReady) {
        const note = mainCard.querySelector('.pf-booking-note');
        if (note) note.textContent = 'No 10% deposit checkout is connected yet. You can send this booking request; we will confirm availability and arrange the deposit.';
      } else if (!checkoutReady) {
        const note = mainCard.querySelector('.pf-booking-note');
        if (note) note.textContent = 'No 10% deposit checkout is connected yet. You can send this request now; our team will confirm availability and arrange the deposit. The remaining balance is due on site.';
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
        try {
          if (!isConfigured(config.web3forms.accessKey) && !isConfigured(crmApiBaseUrl)) throw new Error('Booking service unavailable');
          const reference = 'PF-' + crypto.randomUUID();
          const bookingPayload = { ...customerDetails, form_type: 'booking',
            service: SERVICE_LABEL[selectedService], region: selectedRegion, rate_period: period,
            sku, reference, first_hour_including_vat: money(firstHourTotalPence), deposit_amount: money(depositPence), deposit_percentage: 10,
            remaining_balance_due: 'On site after the work; any additional time or work must be agreed with the customer.',
            source: window.location.origin + '/booking/' };
          const tasks = [];
          if (isConfigured(config.web3forms.accessKey)) tasks.push(withTimeout(fetch(config.web3forms.endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ access_key: config.web3forms.accessKey, subject: 'Prestige Flow booking request ' + reference,
              from_name: config.web3forms.fromName, botcheck: '', ...customerDetails, replyto: customerDetails.email,
              service: SERVICE_LABEL[selectedService], region: regionLabel, rate_period: period, rate_period_label: PERIOD_LABEL[period],
              sku, reference, first_hour_including_vat: money(firstHourTotalPence), deposit_amount: money(depositPence), deposit_percentage: 10,
              remaining_balance_due: 'On site after the work; any additional time or work must be agreed with the customer.',
              payment_status: `No payment taken in this booking request. Arrange the 10% first-hour deposit (${money(depositPence)}) after confirming availability; remaining balance due on site.` })
          }).then(async response => ({ kind: 'email', ok: response.ok && (await response.json().catch(() => ({}))).success === true })), 15000));
          if (isConfigured(crmApiBaseUrl)) tasks.push(submitCRMIntake(bookingPayload).then(result => ({ kind: 'crm', ok: true, paymentUrl: result?.checkoutUrl || '' })));
          const outcomes = await Promise.allSettled(tasks);
          const emailResult = outcomes.find(result => result.status === 'fulfilled' && result.value.kind === 'email');
          const crmResult = outcomes.find(result => result.status === 'fulfilled' && result.value.kind === 'crm');
          const emailSent = emailResult?.status === 'fulfilled' && emailResult.value.ok;
          const crmSaved = Boolean(crmResult);
          if (!emailSent && !crmSaved) throw new Error('Booking request could not be emailed or saved.');
          if (isConfigured(crmApiBaseUrl) && !crmSaved) {
            mainCard.innerHTML = cardShell('Booking Request Needs Follow-up', 'The email request was sent, but this booking did not sync to the CRM. Please call us to confirm it is logged.', iconCheck, `<p class="text-sm">No payment was taken. Call <a href="tel:+447743565339">07743 565339</a> and give us your preferred visit time: ${escapeHtml(customerDetails.date)} at ${escapeHtml(customerDetails.time)} UK time.</p>`, '');
            return;
          }
          const crmOutcome = outcomes.find(result => result.status === 'fulfilled' && result.value.kind === 'crm');
          const dynamicPaymentUrl = crmOutcome?.status === 'fulfilled' ? crmOutcome.value.paymentUrl : '';
          if (dynamicPaymentUrl) {
            window.location.assign(dynamicPaymentUrl);
            return;
          }
          if (!checkoutReady || dynamicCrmCheckout) {
            mainCard.innerHTML = cardShell('Request Received', `Thank you — your booking request was ${crmSaved ? 'saved in our CRM and ' : ''}sent to Prestige Flow. We will confirm availability and arrange your 10% first-hour deposit; the remaining balance is due on site.`, iconCheck, `<p class="text-sm">No payment has been taken yet. For urgent help, call <a href="tel:+447743565339">07743 565339</a>.</p>`, '');
            return;
          }
          const checkout = new URL(destination);
          checkout.searchParams.set('client_reference_id', reference);
          checkout.searchParams.set('prefilled_email', customerDetails.email);
          window.location.assign(checkout.href);
        } catch (_) {
          note.textContent = 'We could not send your booking details. No payment has been taken. Please try again or call 07743 565339.';
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

  onReady(() => {
    document.body.style.pointerEvents = '';
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
