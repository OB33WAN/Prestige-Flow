# Prestige Flow Static Website

Production static website for Prestige Flow LTD.

## Ownership

- Copyright: Prestige Flow LTD
- Digital design and production license: Octopye Digital Designs
- License terms: see LICENSE

## Project Structure

- Root contains source static output and configuration used for local development.
- docs is the GitHub Pages publish directory.
- js/site-config.js is source runtime config.
- docs/assets/site-config.js is published runtime config for GitHub Pages.
- data contains Stripe mapping and import data files.

## Key Features

- Static, SEO-oriented page structure.
- Booking checkout redirect flow using Stripe Payment Links.
- Web3Forms contact and quote form submission.
- Region-aware service pricing display.

## Configuration

### Web3Forms

Configured via:
- js/site-config.js
- docs/assets/site-config.js

Required fields:
- web3forms.accessKey
- web3forms.endpoint
- web3forms.fromName
- web3forms.businessEmail

### Stripe Payment Links

Configured via:
- data/stripe-payment-link-map.json
- optional service fallbacks in js/site-config.js and docs/assets/site-config.js

## Scripts

- npm run export
- npm run vanilla
- npm run pages:build
- npm run links:audit
- npm run preview
- npm run stripe:import
- npm run stripe:import:dry

## GitHub Pages

- Branch: main
- Folder: /docs
- Ensure docs remains in sync after any source changes by running:
  - npm run pages:build

## SEO and AI Discovery Files

- sitemap.xml
- docs/sitemap.xml
- llms.txt
- docs/llms.txt
- local-business-schema.jsonld
- docs/local-business-schema.jsonld

## Contact

- Website: https://prestigeflow.co.uk
- Email: info@prestigeflow.co.uk
- Phone: +44 7743 565339
