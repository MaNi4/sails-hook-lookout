/**
 * Describes where a visit came from, keeping only what is needed (GDPR data
 * minimisation): the path of the page, the domain of an external referrer
 * and utm_* parameters. No query strings, no referrer paths.
 */

const MAX_PATH_LENGTH = 500;
const MAX_UTM_LENGTH = 100;

function parseUrl(value) {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch (unusedErr) {
    return null;
  }
}

function utm(url, name) {
  const value = url ? url.searchParams.get(name) : null;
  return value ? value.slice(0, MAX_UTM_LENGTH) : null;
}

module.exports = function visitProperties({ pageUrl, referrer }) {
  const page = parseUrl(pageUrl);
  const source = parseUrl(referrer);
  const external = source && (!page || source.host !== page.host);

  return {
    landingPage: page ? page.pathname.slice(0, MAX_PATH_LENGTH) : null,
    referringDomain: external ? source.hostname.replace(/^www\./, '') : null,
    utmSource: utm(page, 'utm_source'),
    utmMedium: utm(page, 'utm_medium'),
    utmCampaign: utm(page, 'utm_campaign')
  };
};
