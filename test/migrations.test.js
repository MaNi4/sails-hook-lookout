/**
 * The rules every PostgreSQL migration file follows (see adapters/postgresql/migrations.js),
 * checked without a database.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const createMigrations = require('../adapters/postgresql/migrations');

const DIR = path.join(__dirname, '..', 'adapters', 'postgresql', 'migrations');
const files = fs.readdirSync(DIR).filter(file => file.endsWith('.sql')).sort();

function statements(sql) {
  return sql
    .split('\n').filter(line => !line.trim().startsWith('--')).join('\n')
    .split(';').map(statement => statement.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

test('migration files are numbered without gaps', () => {
  assert.ok(files.length > 0);
  files.forEach((file, index) => {
    assert.match(file, /^\d{3}-[a-z0-9-]+\.sql$/);
    assert.equal(Number(file.slice(0, 3)), index + 1, `${file} is out of sequence`);
  });
});

for (const file of files) {
  const name = file.slice(0, -'.sql'.length);
  const [first, second] = statements(fs.readFileSync(path.join(DIR, file), 'utf8'));

  test(`${name} records itself first, so applying it again changes nothing`, () => {
    // Only the first migration creates lookout_migrations before recording itself.
    const record = name === '001-initial' ? second : first;
    if (name === '001-initial') {
      assert.match(first, /^CREATE TABLE IF NOT EXISTS lookout_migrations /);
    }
    assert.equal(record, `INSERT INTO lookout_migrations (name) VALUES ('${name}')`);
  });

  test(`${name} has no BEGIN or COMMIT of its own`, () => {
    const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
    assert.equal(statements(sql).some(statement => /^(BEGIN|COMMIT|ROLLBACK|START TRANSACTION)\b/i.test(statement)), false);
  });
}

test('the command for migrate: false applies exactly the pending files, in one transaction', () => {
  const command = createMigrations({ query: null, withConnection: null }).migrationCommand(['002-event-uuid']);
  assert.match(command, /^psql "\$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction/);
  assert.match(command, /-f \S*002-event-uuid\.sql$/);
  assert.doesNotMatch(command, /001-initial/);
});
