const { test } = require('node:test');
const assert = require('node:assert/strict');
const readDeclarations = require('../lib/declarations');

const page = { exits: { success: { viewTemplatePath: 'pages/one-blog' } } };
const properties = ({ blog }) => ({ blogId: blog.id });

function action(lookout, base = page) {
  return Object.assign({}, base, { lookout: lookout });
}

test('reads valid declarations and skips actions without one', () => {
  const declarations = readDeclarations({
    'blogs/view-one-blog': action({ name: 'blog:view', properties: properties }),
    'blogs/view-blogs': page,
    'legacy/classic-action': null
  });
  assert.deepEqual(Object.keys(declarations), ['blogs/view-one-blog']);
  assert.equal(declarations['blogs/view-one-blog'].name, 'blog:view');
  assert.equal(declarations['blogs/view-one-blog'].properties, properties);
});

test('properties are optional', () => {
  const declarations = readDeclarations({ 'faq/view-faq': action({ name: 'faq:view' }) });
  assert.equal(declarations['faq/view-faq'].properties, undefined);
});

test('name is required and validated', () => {
  assert.throws(() => readDeclarations({ a: action({ properties: properties }) }), /"a": `lookout.name` is required/);
  assert.throws(() => readDeclarations({ a: action({ name: 'has space' }) }), /lookout.name/);
  assert.throws(() => readDeclarations({ a: action({ name: 'x'.repeat(65) }) }), /lookout.name/);
});

test('rejects other shapes, unknown keys and non-function properties', () => {
  assert.throws(() => readDeclarations({ a: action(true) }), /must be an object/);
  assert.throws(() => readDeclarations({ a: action({ name: 'a:view', view: properties }) }), /unknown `lookout` key\(s\) view/);
  assert.throws(() => readDeclarations({ a: action({ name: 'a:view', properties: { blogId: 1 } }) }), /must be a function/);
});

test('rejects actions that do not render a view', () => {
  const download = { exits: { success: { outputType: 'ref' } } };
  assert.throws(() => readDeclarations({ a: action({ name: 'doc:download' }, download) }), /only on actions that render a view/);
});

test('reports every problem at once', () => {
  try {
    readDeclarations({ a: action({}), b: action({ name: 'ok:name', properties: 1 }) });
    assert.fail('should throw');
  } catch (err) {
    assert.match(err.message, /"a"/);
    assert.match(err.message, /"b"/);
  }
});
