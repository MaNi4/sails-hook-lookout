/**
 * Checks the properties an action declares for its view (`lookout.view`).
 * They are stored as JSON, so only a small flat object of primitives is allowed.
 */

const KEY = /^[\w.-]{1,40}$/;
const MAX_PROPERTIES = 10;
const MAX_STRING_LENGTH = 200;

function isAllowedValue(value) {
  return (typeof value === 'string' && value.length <= MAX_STRING_LENGTH) ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    typeof value === 'boolean';
}

module.exports = function isValidEventProperties(properties) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return false;
  }
  const entries = Object.entries(properties);
  return entries.length <= MAX_PROPERTIES &&
    entries.every(([key, value]) => KEY.test(key) && isAllowedValue(value));
};
