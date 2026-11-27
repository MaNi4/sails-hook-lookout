/**
 * Reads what Lookout needs from the request headers. The other modules
 * work with the plain object returned here.
 */
module.exports = function requestContext(req, exclude) {
  return {
    ip: req.ip || '',
    userAgent: req.get('user-agent') || '',
    pageUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    referrer: req.get('referer') || '',
    globalPrivacyControl: req.get('sec-gpc') === '1',
    doNotTrack: req.get('dnt') === '1',
    excluded: Boolean(exclude(req))
  };
};
