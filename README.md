# Prestige Flow website

The public website is plain HTML, CSS and JavaScript and is deployed to GitHub Pages. The build packages only public pages and their assets into `.public-site/`; development files, CRM code and server credentials are not published.

## Build and checks

- `npm ci`
- `npm run build` generates the sitemap and creates `.public-site/`.
- `npm run check` checks page metadata, JSON-LD, canonical URLs, sitemap membership, Stripe mapping consistency and internal links.
- `npm run preview` serves the built site locally at `http://localhost:4173`.
- `npm run test:booking` checks 24 service, area and time combinations, the booking form and the deposit calculation without sending a real email or payment.

GitHub Actions builds and deploys `.public-site/` to GitHub Pages. The custom domain is `prestigeflow.co.uk`; the domain's DNS must point to GitHub Pages before that address can serve the site. Test subdomains under `prestigeflow.co.uk` are supported by the public API origin allowlist.

## CRM and public API

The CRM database and API stay on Prestige Flow Sites. The CRM interface is plain HTML, CSS and JavaScript in `crm/static/`; its deployed copy lives at `/crm/` on the Sites origin beside the API. It uses Sites sign-in and same-origin API requests. GitHub Pages cannot host the CRM database, authentication or server-side secrets, so the CRM interface is excluded from the public website build.

`assets/site-config.js` points the public website at the live Sites API. The API permits only the public rates and booking-intake endpoints from `prestigeflow.co.uk` and its HTTPS subdomains. CRM administration remains same-origin and requires the authorised Sites account. Location-based pricing is resolved at the API edge; displayed prices use the current area and UK appointment time.

## Pricing and bookings

`Rates.txt` records the approved standard rates; the live website reads current values from the CRM rates table. A booking submits a preferred appointment request and does not reserve a visit. The CRM links the booking and enquiry to a client record. The deposit is 10% of the VAT-inclusive first-hour price; the remaining balance is due on site. Stripe checkout remains off until the Stripe connection and webhook details are supplied. Website form notifications use the configured Web3Forms integration; CRM email sending stays disabled until its provider connection is ready.

## SEO and content

The sitemap lists indexable content pages only. Legacy duplicate area routes redirect to relevant pages and are marked `noindex`; they are excluded from the sitemap and internal navigation. `npm run check` verifies the sitemap, canonical URLs, unique titles and descriptions, one visible H1, business schema and link targets. Search Console indexing and external search rankings require verification in Google's own tools and are not guaranteed by markup alone.

Business details used by local-business schema are maintained in `data/business.json` and `local-business-schema.jsonld`. Do not add unverified reviews or map coordinates.

## Integrations

- Public enquiry notifications: Web3Forms configuration in `assets/site-config.js`.
- Public rates and enquiry/booking CRM sync: Sites API origin in `assets/site-config.js`.
- Stripe: disabled pending production checkout and webhook credentials. Never put secret keys in browser files.

Copyright Prestige Flow LTD. Digital design licence: Octopye Digital Designs; see `LICENSE`.
