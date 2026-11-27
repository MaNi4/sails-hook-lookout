const fs = require('fs');
const path = require('path');

/**
 * Versioned migrations of the PostgreSQL adapter: migrations/NNN-name.sql, applied
 * in order, each once. lookout_migrations lists the applied ones.
 *
 * Several app instances may lift at once: an advisory lock lets one of them migrate
 * while the others wait, then find nothing left to do.
 *
 * Rules for a migration file (test/migrations.test.js checks the first two):
 * - Its first statement records it: INSERT INTO lookout_migrations (name) VALUES ('NNN-name').
 *   Only 001 creates that table first. Applied again by hand, the file then fails on
 *   its first statement (duplicate key), before it changes anything.
 * - No BEGIN or COMMIT: it runs in a transaction of its own, here or in psql
 *   (--single-transaction), so it is applied completely or not at all.
 * - Never edit a released migration; add a new one.
 */

const DIR = path.join(__dirname, 'migrations');
const PSQL = 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction';
const LOCK = "hashtext('sails-hook-lookout:migrations')";

/** Path to show in a command: relative to the app (where it is usually run from) when inside it. */
function displayPath(file) {
  const relative = path.relative(process.cwd(), file);
  return relative.startsWith('..') || path.isAbsolute(relative) ? file : relative;
}

function readMigrations() {
  return fs.readdirSync(DIR)
    .filter(file => /^\d{3}-[\w-]+\.sql$/.test(file))
    .sort()
    .map(file => ({
      name: file.slice(0, -'.sql'.length),
      file: path.join(DIR, file),
      sql: fs.readFileSync(path.join(DIR, file), 'utf8')
    }));
}

/**
 * @param {object} deps
 * @param {(sql: string, params: Array) => Promise<Array<object>>} deps.query
 * @param {(during: (query) => Promise<any>) => Promise<any>} deps.withConnection runs `during` on one connection
 * @param {Array<{ name: string, sql: string, file?: string }>} [deps.migrations]
 */
module.exports = function createMigrations({ query, withConnection, migrations = readMigrations() }) {
  async function appliedNames(run) {
    const [{ ready }] = await run("SELECT to_regclass('lookout_migrations') IS NOT NULL AS ready", []);
    if (!ready) {
      return new Set();
    }
    return new Set((await run('SELECT name FROM lookout_migrations', [])).map(row => row.name));
  }

  async function apply(run, migration) {
    await run('BEGIN', []);
    try {
      // No parameters: sent as one simple query, so a file may hold several statements.
      await run(migration.sql, []);
      const recorded = await run('SELECT 1 FROM lookout_migrations WHERE name = $1', [migration.name]);
      if (!recorded.length) {
        throw new Error('it does not record itself in lookout_migrations');
      }
      await run('COMMIT', []);
    } catch (err) {
      await run('ROLLBACK', []);
      throw new Error(`Lookout: migration ${migration.name} failed, nothing of it was applied: ${err.message}`);
    }
  }

  return {
    /**
     * @param {Array<string>} names pending migrations, from pendingMigrations()
     * @returns {string} the shell command that applies them, for `migrate: false`
     */
    migrationCommand: function (names) {
      const files = migrations.filter(migration => names.includes(migration.name)).map(migration => displayPath(migration.file));
      return [PSQL, ...files.map(file => `-f ${file}`)].join(' \\\n  ');
    },

    pendingMigrations: async function () {
      const applied = await appliedNames(query);
      return migrations.filter(migration => !applied.has(migration.name)).map(migration => migration.name);
    },

    migrate: function () {
      return withConnection(async run => {
        await run(`SELECT pg_advisory_lock(${LOCK})`, []);
        try {
          const applied = await appliedNames(run);
          const ran = [];
          for (const migration of migrations) {
            if (!applied.has(migration.name)) {
              await apply(run, migration);
              ran.push(migration.name);
            }
          }
          return ran;
        } finally {
          await run(`SELECT pg_advisory_unlock(${LOCK})`, []);
        }
      });
    }
  };
};
