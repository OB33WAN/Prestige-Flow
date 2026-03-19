# Static Site Output (No React Runtime)

Your plain HTML/CSS/JS export is in:

- `site-html-css-js/`
- `docs/` (GitHub Pages publish target)

Main entry points:

- `site-html-css-js/index.html`
- `site-html-css-js/about/index.html`
- `site-html-css-js/services/index.html`
- `site-html-css-js/areas/index.html`

Static CSS/JS assets:

- `site-html-css-js/assets/index-CaKZeGV3.css` (main site CSS)
- `site-html-css-js/assets/static-site.css` (vanilla helper CSS)
- `site-html-css-js/assets/static-site.js` (vanilla interaction JS)

Important:

- React `type="module"` and `modulepreload` tags are removed from generated pages.
- Pages are static HTML files with linked CSS and plain JS.

Rebuild command:

- `npm run vanilla`

GitHub Pages publish build:

- `npm run pages:build`

This command rebuilds the static site and syncs it to `docs/`.

Preview command:

- `npm run preview`
- Open `http://localhost:4173`

GitHub Pages settings:

- Repository Settings -> Pages
- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/docs`
