/**
 * Adds the Lookout script to a rendered HTML page.
 */

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @returns {string} the page with the script before its last </body>; unchanged when there is none
 */
module.exports = function injectScriptTag(html, { src, event, csrf }) {
  const index = html.lastIndexOf('</body>');
  if (index === -1) {
    return html;
  }
  const csrfAttribute = csrf ? ` data-csrf="${escapeAttribute(csrf)}"` : '';
  const tag = `<script src="${escapeAttribute(src)}" defer data-event="${escapeAttribute(event)}"${csrfAttribute}></script>`;
  return html.slice(0, index) + tag + html.slice(index);
};
