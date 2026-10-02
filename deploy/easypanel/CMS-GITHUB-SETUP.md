# CMS and GitHub review workflow

The site remains static HTML and stays on the EasyPanel VPS. Decap CMS edits Markdown records in `content/cms/`; the build renders those records into ordinary HTML under `/services/`, `/industries/` and `/areas/`. Existing hand-built pages are left untouched. CMS edits cannot change existing prices, payment terms, canonical rules, redirects or structured data.

## What is ready in the repository

- `/admin/` contains the Decap CMS editor and structured fields for page title, meta description, URL slug, H1, image alt text, copy sections and internal links.
- Drafts use GitHub editorial workflow and Open Authoring so outside editors can submit pull requests without permission to publish directly.
- `npm run build` renders draft records during the CI/build process; CMS records must have at least 300 useful words, three sections and valid metadata. It blocks placeholders, duplicate/conflicting routes and external links in the internal-link field.
- The GitHub Actions workflow validates pull requests. It no longer publishes to GitHub Pages; EasyPanel should deploy the VPS site after an approved merge.

## Account-side setup still required

1. **Add a GitHub OAuth app.** In GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App**. Set the homepage to `https://cms-auth.prestigeflow.co.uk` and callback URL to `https://cms-auth.prestigeflow.co.uk/callback`. Keep the generated client secret private. Editors need their own GitHub accounts. With Open Authoring they work on a fork and submit a PR; give them no repository write access.
2. **Deploy the OAuth proxy.** Decap's GitHub backend requires an OAuth handler. A Worker is prepared in `deploy/cloudflare/cms-auth/`; it validates OAuth state and limits token messages to Prestige Flow CMS origins. In that directory, run `npm install`, `npx wrangler login`, `npm run typecheck`, then add `GITHUB_OAUTH_ID` and `GITHUB_OAUTH_SECRET` as Cloudflare Worker secrets and run `npm run deploy`. The Wrangler config attaches `cms-auth.prestigeflow.co.uk` as the custom domain, which creates its DNS record and TLS certificate. Never put the client secret in `admin/config.yml` or the website. Do not test CMS login until the custom domain resolves and the Worker responds over HTTPS.
3. **Point EasyPanel at GitHub for the site build.** The current upload-based `old-web` service must use the GitHub source `OB33WAN/Prestige-Flow`, branch `main` after review, build path `/`, and Dockerfile `deploy/easypanel/site.Dockerfile`. The Dockerfile runs build and SEO/link checks, then serves the generated static site on port 80. Its `OLD_SITE_API_ORIGIN` build argument defaults to the separate HTTPS EasyPanel domain for `old-site-payments-api`; it explicitly clears the CRM and Web3Forms fallbacks from the published site. Keep `staging.prestigeflow.co.uk` attached to `old-web` for the first deployment; do not point the apex domain at it yet.
4. **Enable EasyPanel Auto Deploy** for that GitHub source. EasyPanel's repository webhook should build after a merge to `main`. Check the deployment log after merging a harmless CMS test page.
5. **Protect `main` in GitHub.** Require the successful Actions check named **build** before merge, require a review from you, and prevent direct pushes by agency accounts. Agency drafts stay out of the live site until you approve the pull request. The four-hour response promise is limited to eligible Reading and Maidenhead postcodes; do not extend it to London or other locations.
6. Open `https://prestigeflow.co.uk/admin/`, sign in with GitHub, create a draft and move it to **Ready for review**. Verify the pull request and its successful checks before merging. Once EasyPanel deploys, confirm the page, canonical URL and sitemap entry.

## Important boundaries

Do not change the site's payment or prices in CMS content. New service pages should quote no numeric rates; link to the managed rates/booking pages instead. Avoid unverified accreditations, guarantees, response times, testimonials or location claims. Canonicals and schema are generated and controlled by the build. Existing pages are still maintained in HTML; this first CMS stage is for new SEO landing pages only. Convert existing page copy into CMS records only when a page-by-page migration is planned and reviewed.

Decap editorial workflow: https://decapcms.org/docs/editorial-workflows/ · Open Authoring: https://decapcms.org/docs/open-authoring/ · GitHub OAuth proxy setup: https://decapcms.org/docs/backends-overview/#using-github-with-an-oauth-proxy · EasyPanel Git sources: https://easypanel.io/docs/services/app
