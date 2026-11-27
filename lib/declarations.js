/**
 * Reads and validates the `lookout` key of action definitions:
 *
 *   lookout: {
 *     name: 'blog:view',                                // required
 *     properties: ({ blog }) => ({ blogId: blog.id })   // optional, receives the view locals
 *   }
 *
 * Invalid declarations throw at startup, so a typo never fails silently in production.
 */

const NAME = /^[\w.:-]{1,64}$/;
const KEYS = ['name', 'properties'];

function rendersView(definition) {
  return Object.values(definition.exits || {}).some(exit => exit && exit.viewTemplatePath);
}

function problemsOf(identity, definition) {
  const declaration = definition.lookout;
  const where = `Action "${identity}"`;

  if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
    return [`${where}: \`lookout\` must be an object like { name: 'blog:view' }.`];
  }

  const problems = [];
  const unknown = Object.keys(declaration).filter(key => !KEYS.includes(key));
  if (unknown.length) {
    problems.push(`${where}: unknown \`lookout\` key(s) ${unknown.join(', ')} (allowed: ${KEYS.join(', ')}).`);
  }
  if (typeof declaration.name !== 'string' || !NAME.test(declaration.name)) {
    problems.push(`${where}: \`lookout.name\` is required, 1-64 characters of letters, digits, _ . : - (e.g. 'blog:view').`);
  }
  if (declaration.properties !== undefined && typeof declaration.properties !== 'function') {
    problems.push(`${where}: \`lookout.properties\` must be a function returning the event properties.`);
  }
  if (!rendersView(definition)) {
    problems.push(`${where}: \`lookout\` is supported only on actions that render a view (an exit with viewTemplatePath).`);
  }
  return problems;
}

/**
 * @param {Object<string, object|null>} definitions action identity -> action definition (null when not a machine)
 * @returns {Object<string, { name: string, properties?: Function }>} declarations by action identity
 * @throws {Error} listing every invalid declaration
 */
module.exports = function readDeclarations(definitions) {
  const declarations = {};
  const problems = [];

  for (const [identity, definition] of Object.entries(definitions)) {
    if (!definition || definition.lookout === undefined) {
      continue;
    }
    const found = problemsOf(identity, definition);
    if (found.length) {
      problems.push(...found);
    } else {
      declarations[identity] = { name: definition.lookout.name, properties: definition.lookout.properties };
    }
  }

  if (problems.length) {
    throw new Error(`Lookout: invalid declarations:\n- ${problems.join('\n- ')}`);
  }
  return declarations;
};
