import fs from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import { pageFiles } from './site-files.mjs';

const origin = 'https://prestigeflow.co.uk';
const businessData = JSON.parse(await fs.readFile('data/business.json', 'utf8'));
const files = await pageFiles();
const redirects = new Map();
async function writeIfChanged(file, contents) {
  try {
    if (await fs.readFile(file, 'utf8') === contents) return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.writeFile(file, contents);
}
const routeOf = file => '/' + path.relative(process.cwd(), file).split(path.sep).join('/').replace(/index\.html$/, '');
for (const file of files) {
  const $ = load(await fs.readFile(file, 'utf8'));
  const refresh = $('meta[http-equiv="refresh"]').attr('content');
  if (refresh) redirects.set(routeOf(file).replace(/\/$/, ''), refresh.split(/url=/i)[1].trim().replace(/\/$/, '') + '/');
}
let pages = 0;
for (const file of files) {
  const $ = load(await fs.readFile(file, 'utf8'));
  const route = routeOf(file);
  const target = redirects.get(route.replace(/\/$/, ''));
  if (target) {
    await writeIfChanged(file, `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page moved | Prestige Flow</title><meta name="robots" content="noindex, follow"><link rel="canonical" href="${origin}${target}"><meta http-equiv="refresh" content="0; url=${target}"></head><body><p>This page has moved. <a href="${target}">Continue to Prestige Flow</a>.</p></body></html>\n`);
    continue;
  }
  pages++;
  $('script:not([src])').each((_, el) => { if ($(el).text().includes('googletagmanager.com/gtm.js')) $(el).remove(); });
  $('noscript').each((_, el) => { if ($(el).html()?.includes('googletagmanager.com/ns.html')) $(el).remove(); });
  $('html').attr('lang', 'en-GB');
  $('#seo-fallback').remove();
  $('form').each((_, formEl) => {
    const form = $(formEl);
    form.attr('data-static-form', route.startsWith('/quote/') ? 'quote' : route.startsWith('/contact/') ? 'contact' : 'callback');
    form.find('button[role="combobox"]').each((_, buttonEl) => {
      const button = $(buttonEl), select = button.parent().find('select');
      if (!select.length) return;
      select.attr({id:button.attr('id'),name:'service',class:button.attr('class')}).removeAttr('style aria-hidden tabindex');
      button.remove();
    });
    form.find('[role="radiogroup"]').each((_, groupEl) => {
      $(groupEl).find('button[role="radio"]').each((_, buttonEl) => {
        const button = $(buttonEl), input = button.parent().find('input[type="radio"]');
        input.attr({id:button.attr('id'),name:'urgency',class:'pf-native-radio'}).removeAttr('style aria-hidden tabindex');
        button.remove();
      });
    });
    form.find('label[for]').each((_, labelEl) => {
      const label = $(labelEl), field = form.find('[id]').filter((_, fieldEl) => $(fieldEl).attr('id') === label.attr('for'));
      if (label.text().includes('*') && field.is('input,select,textarea')) field.attr('required', '');
    });
  });
  $('link[rel="canonical"]').remove();
  $('head').append(`<link rel="canonical" href="${origin}${route}">`);
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href.startsWith('/') || href.startsWith('//')) return;
    const url = new URL(href, origin);
    const destination = redirects.get(url.pathname.replace(/\/$/, ''));
    if (destination) $(el).attr('href', destination + url.search + url.hash);
    else if (!path.extname(url.pathname)) $(el).attr('href', url.pathname.replace(/\/$/, '') + '/' + url.search + url.hash);
  });
  $('a[target="_blank"]').attr('rel', 'noopener noreferrer');
  $('a[href^="tel:"]').each((_, el) => {
    const link = $(el);
    if (!link.text().trim() && !link.attr('aria-label') && !link.attr('title')) {
      link.attr('aria-label', 'Call Prestige Flow on 07743 565339');
    }
  });
  $('a > button').each((_, el) => {
    const button = $(el), anchor = button.parent();
    for (const [key, value] of Object.entries(el.attribs)) if (!['type', 'disabled'].includes(key)) anchor.attr(key, value);
    anchor.html(button.html());
  });
  const title = $('title').text();
  const description = $('meta[name="description"]').first().attr('content') || $('main p').first().text().slice(0,160);
  $('meta[name="description"]').remove();
  $('<meta>').attr({name:'description',content:description}).appendTo('head');
  for (const name of ['robots', 'viewport']) $('meta[name="' + name + '"]').slice(1).remove();
  for (const [key, value] of Object.entries({'og:title': title, 'og:description': description, 'og:url': origin + route, 'og:image': origin + '/share-image.jpg', 'og:locale': 'en_GB', 'og:type': route.startsWith('/blog/') && route !== '/blog/' ? 'article' : 'website'})) {
    $(`meta[property="${key}"]`).remove();
    $('<meta>').attr({property:key, content:value}).appendTo('head');
  }
  for (const [key, value] of Object.entries({'twitter:card':'summary_large_image','twitter:title':title,'twitter:description':description,'twitter:image':origin+'/share-image.jpg'})) {
    $(`meta[name="${key}"]`).remove();
    $('<meta>').attr({name:key,content:value}).appendTo('head');
  }
  // Remove stale review counts, fabricated centre-of-London coordinates and duplicate business entities.
  $('script[type="application/ld+json"]').remove();
  const business = {
    '@type':'Plumber',
    '@id':origin+'/#business',
    name:businessData.name,
    url:businessData.url,
    telephone:businessData.telephone,
    email:businessData.email,
    image:origin+'/logo.jpg',
    logo:origin+'/logo.jpg',
    identifier:{'@type':'PropertyValue',propertyID:'Companies House company number',value:businessData.companyNumber},
    address:{'@type':'PostalAddress',...businessData.address},
    areaServed:businessData.areaServed,
    sameAs:businessData.sameAs,
    // These are the published office hours, distinct from 24/7 emergency-call availability.
    openingHoursSpecification:[{'@type':'OpeningHoursSpecification',dayOfWeek:['Monday','Tuesday','Wednesday','Thursday','Friday'],opens:'08:00',closes:'18:00'}],
    contactPoint:{'@type':'ContactPoint',telephone:businessData.telephone,contactType:'24/7 emergency service',availableLanguage:'English',hoursAvailable:[{'@type':'OpeningHoursSpecification',dayOfWeek:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],opens:'00:00',closes:'23:59'}]}
  };
  const graph = [business,{'@type':'WebSite','@id':origin+'/#website',url:origin+'/',name:'Prestige Flow LTD',publisher:{'@id':business['@id']}},{'@type':'WebPage','@id':origin+route+'#webpage',url:origin+route,name:title,description,inLanguage:'en-GB',isPartOf:{'@id':origin+'/#website'}}];
  if (route !== '/') {
    const parts=route.split('/').filter(Boolean);
    graph.push({'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:origin+'/'},...parts.map((part,i)=>({'@type':'ListItem',position:i+2,name:i===parts.length-1?$('h1').first().text():part[0].toUpperCase()+part.slice(1),item:origin+'/'+parts.slice(0,i+1).join('/')+'/'}))]});
  }
  if (route.startsWith('/services/') && route !== '/services/') graph.push({'@type':'Service',name:$('h1').first().text(),url:origin+route,provider:{'@id':business['@id']},areaServed:business.areaServed});
  const questions = [];
  $('[data-testid^="button-faq-"]').each((_, el) => {
    const answer = $('[id]').filter((_, node) => $(node).attr('id') === $(el).attr('aria-controls')).text().trim();
    if (answer) questions.push({'@type':'Question',name:$(el).text().trim(),acceptedAnswer:{'@type':'Answer',text:answer}});
  });
  if (questions.length) graph.push({'@type':'FAQPage','@id':origin+route+'#faq',mainEntity:questions});
  if (route.startsWith('/blog/') && route !== '/blog/') {
    const visibleDate = $('main span').map((_, el) => $(el).text().trim()).get().find(text => /^\d{1,2} [A-Z][a-z]+ \d{4}$/u.test(text));
    const parsedDate = visibleDate ? new Date(`${visibleDate} 12:00:00 UTC`) : null;
    const datePublished = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString().slice(0, 10) : null;
    const hasVisibleByline = $('main').text().includes('By Prestige Flow LTD');
    graph.push({'@type':'BlogPosting',headline:$('h1').first().text(),description,url:origin+route,mainEntityOfPage:{'@id':origin+route+'#webpage'},publisher:{'@id':business['@id']},author:{'@type':'Organization',name:'Prestige Flow LTD',url:origin+'/about/'},...(datePublished ? {datePublished,dateModified:datePublished} : {}),image:origin+'/share-image.jpg'});
    if (!hasVisibleByline || !datePublished) console.warn(`Review visible author/date before publishing article schema: ${file}`);
  }
  $('head').append($('<script type="application/ld+json">').text(JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c')));
  if (route==='/') await writeIfChanged('local-business-schema.jsonld',JSON.stringify({'@context':'https://schema.org',...business},null,2)+'\n');
  if (route==='/booking/' && !$('noscript[data-booking-fallback]').length) $('main').prepend('<noscript data-booking-fallback><p>Online booking requires JavaScript. Please call <a href="tel:+447743565339">07743 565339</a> to book.</p></noscript>');
  await writeIfChanged(file,$.html());
}
console.log(`Repaired ${pages} content pages and ${redirects.size} legacy redirects.`);
