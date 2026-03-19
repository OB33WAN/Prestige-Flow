import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { load } from 'cheerio';

const distDir = path.resolve(process.cwd(), 'dist');
const staticScriptPath = path.join(distDir, 'assets', 'static-site.js');
const staticCssPath = path.join(distDir, 'assets', 'static-site.css');
const staticConfigPath = path.join(distDir, 'assets', 'site-config.js');

async function getHtmlFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await getHtmlFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase() === 'index.html') {
      files.push(fullPath);
    }
  }

  return files;
}

function parseFaqFromJsonLd($) {
  const result = [];

  $('script[type="application/ld+json"]').each((_, node) => {
    const raw = $(node).html()?.trim();
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const graphItems = Array.isArray(parsed?.['@graph']) ? parsed['@graph'] : [parsed];

      for (const item of graphItems) {
        if (item?.['@type'] !== 'FAQPage' || !Array.isArray(item.mainEntity)) {
          continue;
        }

        for (const entity of item.mainEntity) {
          const answer = entity?.acceptedAnswer?.text;
          if (typeof answer === 'string' && answer.trim()) {
            result.push(answer.trim());
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  });

  return result;
}

function normalizeBody($) {
  const body = $('body');
  const bodyStyle = (body.attr('style') || '').replace(/pointer-events\s*:\s*none\s*;?/gi, '').trim();

  if (bodyStyle) {
    body.attr('style', bodyStyle);
  } else {
    body.removeAttr('style');
  }

  body.removeAttr('data-scroll-locked');
  body.removeAttr('aria-hidden');
  body.removeAttr('data-aria-hidden');

  $('#root').removeAttr('aria-hidden');
  $('#root').removeAttr('data-aria-hidden');

  $('span[data-radix-focus-guard]').remove();
  $('body > div[role="dialog"]').remove();
  $('body > div.fixed.inset-0.z-50').remove();
}

function convertFormsToStatic($) {
  // Convert form fields to have static fallback text
  $('input[type="text"], input[type="email"], input[type="tel"], textarea').each((_, elem) => {
    const $elem = $(elem);
    const placeholder = $elem.attr('placeholder') || '';
    const dataTestid = $elem.attr('data-testid') || '';
    
    // Add role and aria attributes for static context
    if (!$elem.attr('aria-label')) {
      $elem.attr('aria-label', placeholder || dataTestid.replace(/[^a-z]/gi, ' ').trim());
    }
  });

  // Convert button behaviors to data attributes for fallback linking
  $('button[type="submit"]').each((_, elem) => {
    const $btn = $(elem);
    const formId = $btn.closest('form').attr('id');
    const action = $btn.closest('form').attr('action') || '';
    const testid = $btn.attr('data-testid') || '';
    
    // Preserve form context for fallback handling
    if (!$btn.attr('data-form-context')) {
      $btn.attr('data-form-context', JSON.stringify({ formId, action, testid }));
    }
  });

  // Disable React-style form submissions and add static fallbacks
  $('form').each((_, elem) => {
    const $form = $(elem);
    const action = ($form.attr('action') || '').trim();
    const method = ($form.attr('method') || 'POST').toUpperCase();
    const testid = ($form.attr('data-testid') || '').trim();

    if (!action || action === '#' || method === 'GET') {
      const typeHint = testid || 'general';
      $form.attr('data-static-form', typeHint);
      $form.attr('data-no-react-submit', 'true');
      $form.removeAttr('onsubmit');
    }
  });
}

function convertFaqToStatic($) {
  const faqAnswers = parseFaqFromJsonLd($);
  if (!faqAnswers.length) {
    return;
  }

  $('[data-testid^="text-answer-"]').each((index, node) => {
    const answer = faqAnswers[index];
    if (!answer) {
      return;
    }

    const el = $(node);
    el.html(`<div class="pb-4 pt-0 text-muted-foreground leading-relaxed">${answer}</div>`);
    el.attr('hidden', 'hidden');
    el.attr('aria-hidden', 'true');
    el.attr('data-static-faq', 'true');
  });
}

function removeReactRuntime($) {
  $('script[type="module"]').remove();
  $('link[rel="modulepreload"]').remove();

  $('script[src]').each((_, node) => {
    const src = $(node).attr('src') || '';
    if (/\/assets\/.+\.js($|\?)/i.test(src)) {
      $(node).remove();
    }
  });
}

function ensureStaticAssets($) {
  if (!$('link[href="/assets/static-site.css"]').length) {
    $('head').append('\n<link rel="stylesheet" href="/assets/static-site.css">');
  }

  if (!$('script[src="/assets/site-config.js"]').length) {
    $('body').append('\n<script src="/assets/site-config.js" defer></script>');
  }

  if (!$('script[src="/assets/static-site.js"]').length) {
    $('body').append('\n<script src="/assets/static-site.js" defer></script>');
  }
}

async function writeStaticAssets() {
  await fs.mkdir(path.dirname(staticScriptPath), { recursive: true });
  const siteConfig = {
    web3forms: {
      accessKey: process.env.WEB3FORMS_ACCESS_KEY || 'REPLACE_ME_WEB3FORMS_ACCESS_KEY',
      endpoint: 'https://api.web3forms.com/submit',
      fromName: 'Prestige Flow Website',
      businessEmail: 'info@prestigeflow.co.uk'
    },
    stripe: {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'REPLACE_ME_STRIPE_PUBLISHABLE_KEY',
      secretKeyNotice: 'Do not place STRIPE_SECRET_KEY in static files. Use Stripe Payment Links or a secure backend.',
      paymentLinks: {
        default: process.env.STRIPE_PAYMENT_LINK_DEFAULT || 'REPLACE_ME_STRIPE_PAYMENT_LINK_DEFAULT',
        drainage: process.env.STRIPE_PAYMENT_LINK_DRAINAGE || '',
        'emergency-drainage': process.env.STRIPE_PAYMENT_LINK_EMERGENCY || '',
        plumbing: process.env.STRIPE_PAYMENT_LINK_PLUMBING || '',
        'cctv-survey': process.env.STRIPE_PAYMENT_LINK_CCTV || ''
      }
    }
  };

  const configJs = `window.PrestigeFlowConfig = ${JSON.stringify(siteConfig, null, 2)};\n`;

  const js = `(() => {
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
    const nextBtn = document.querySelector('[data-testid="button-next-step"]');
    if (!nextBtn) return;

    const labels = Array.from(document.querySelectorAll('[data-testid^="radio-service-"]'));
    const radioButtons = labels.map((label) => label.querySelector('[role="radio"]')).filter(Boolean);

    const getServiceValue = (label) => label.querySelector('[role="radio"]')?.getAttribute('value') || 'default';
    const paymentLinks = config.stripe.paymentLinks || {};

    let selectedService = getServiceValue(labels[0] || document.body);

    const notice = document.createElement('div');
    notice.className = 'pf-booking-note';
    nextBtn.parentElement?.insertBefore(notice, nextBtn);

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
    };

    labels.forEach((label) => {
      label.addEventListener('click', () => setSelection(getServiceValue(label)));
    });

    nextBtn.disabled = false;
    nextBtn.removeAttribute('disabled');
    nextBtn.textContent = 'Continue to Secure Payment';

    nextBtn.addEventListener('click', (event) => {
      event.preventDefault();
      const destination = paymentLinks[selectedService] || paymentLinks.default;

      if (!isConfigured(destination)) {
        notice.textContent = 'Stripe payment link is not configured yet. Set STRIPE_PAYMENT_LINK_DEFAULT in assets/site-config.js.';
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
`;

  const css = `.pf-mobile-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 16, 30, 0.58);
  z-index: 70;
}

.pf-mobile-panel {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(86vw, 380px);
  background: #1a2842;
  border-left: 1px solid rgba(212, 175, 55, 0.2);
  overflow-y: auto;
  padding: 1.25rem;
}

.pf-mobile-logo {
  display: flex;
  align-items: center;
  justify-content: center;
}

.pf-mobile-logo img {
  max-height: 3rem;
  width: auto;
}

.pf-mobile-panel button {
  width: 100%;
  justify-content: flex-start;
}

body.pf-menu-open {
  overflow: hidden;
}

header {
  transition: transform 0.3s ease-in-out;
}

.pf-form-feedback {
  margin-top: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.9rem;
  line-height: 1.4;
}

.pf-form-feedback-success {
  background-color: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #166534;
}

.pf-form-feedback-error {
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #991b1b;
}

.pf-booking-note {
  margin-bottom: 0.5rem;
  color: #f59e0b;
  font-size: 0.9rem;
}
`;

  await fs.writeFile(staticConfigPath, configJs, 'utf8');
  await fs.writeFile(staticScriptPath, js, 'utf8');
  await fs.writeFile(staticCssPath, css, 'utf8');

  // Rename hashed CSS bundles to stable names and remove unused JS bundles
  const assetsDir = path.join(distDir, 'assets');
  const assetFiles = await fs.readdir(assetsDir);

  for (const f of assetFiles) {
    if (/^index-[^.]+\.css$/.test(f)) {
      await fs.copyFile(path.join(assetsDir, f), path.join(assetsDir, 'styles.css'));
      await fs.unlink(path.join(assetsDir, f));
    } else if (/^ServiceAreaMap-[^.]+\.css$/.test(f)) {
      await fs.copyFile(path.join(assetsDir, f), path.join(assetsDir, 'service-area-map.css'));
      await fs.unlink(path.join(assetsDir, f));
    } else if (f.endsWith('.js') && f !== 'site-config.js' && f !== 'static-site.js') {
      await fs.unlink(path.join(assetsDir, f));
    }
  }
}

function renameCssBundles($) {
  $('link[rel="stylesheet"]').each((_, node) => {
    const href = $(node).attr('href') || '';
    if (/\/assets\/index-[^/]+\.css/.test(href)) {
      $(node).attr('href', '/assets/styles.css');
      $(node).removeAttr('crossorigin');
    }
    if (/\/assets\/ServiceAreaMap-[^/]+\.css/.test(href)) {
      $(node).attr('href', '/assets/service-area-map.css');
      $(node).removeAttr('crossorigin');
    }
  });
}

function injectTrustpilotScript($) {
  if (!$('.trustpilot-widget').length) return;
  if ($('script[src*="trustpilot.com"]').length) return;
  $('head').append('\n<script async src="https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js"></script>');
}

async function processFile(filePath) {
  const html = await fs.readFile(filePath, 'utf8');
  const $ = load(html, { decodeEntities: false });

  removeReactRuntime($);
  renameCssBundles($);
  injectTrustpilotScript($);
  normalizeBody($);
  convertFaqToStatic($);
  convertFormsToStatic($);
  ensureStaticAssets($);

  const output = $.html({ decodeEntities: false });
  await fs.writeFile(filePath, output, 'utf8');
}

async function main() {
  const htmlFiles = await getHtmlFiles(distDir);
  await writeStaticAssets();

  for (const filePath of htmlFiles) {
    await processFile(filePath);
  }

  console.log(`Converted ${htmlFiles.length} pages to static HTML/CSS/JS mode.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});