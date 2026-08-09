import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');

// ============================================================
// DATA DIRECTORY
// ============================================================

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.warn(
      'Warning: Could not create data directory:',
      err.message
    );
  }
}

// ============================================================
// DATABASE CONFIGURATION
// ============================================================

const DATABASE_URL =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;

const isPG = !!DATABASE_URL;

let pool = null;

if (isPG) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

// ============================================================
// LOCAL JSON HELPERS
// ============================================================

function getJSONPath(filename) {
  return path.join(DATA_DIR, filename);
}

// In-memory cache for serverless environments
const memoryDbCache = {};

function readJSONFile(filename, defaultVal = '[]') {
  const filePath = getJSONPath(filename);

  if (!fs.existsSync(filePath)) {
    if (memoryDbCache[filename]) {
      return memoryDbCache[filename];
    }

    const parsedDefault = JSON.parse(defaultVal);
    memoryDbCache[filename] = parsedDefault;

    try {
      fs.writeFileSync(
        filePath,
        defaultVal,
        'utf8'
      );
    } catch (err) {
      console.warn(
        `Warning: Failed to write default JSON file ${filename} ` +
        `(likely read-only serverless FS):`,
        err.message
      );
    }

    return parsedDefault;
  }

  try {
    const content = fs.readFileSync(
      filePath,
      'utf8'
    );

    return JSON.parse(content);
  } catch (err) {
    if (memoryDbCache[filename]) {
      return memoryDbCache[filename];
    }

    try {
      return JSON.parse(defaultVal);
    } catch (parseErr) {
      return [];
    }
  }
}

function writeJSONFile(filename, data) {
  memoryDbCache[filename] = data;

  try {
    const filePath = getJSONPath(filename);

    fs.writeFileSync(
      filePath,
      JSON.stringify(data, null, 2),
      'utf8'
    );
  } catch (err) {
    console.warn(
      `Warning: Failed to write local JSON file ${filename} ` +
      `(likely read-only serverless FS):`,
      err.message
    );
  }
}

// ============================================================
// DATABASE INITIALIZATION
// ============================================================

let dbInitialized = false;

function initLocalJSON() {
  // Ensure local JSON databases exist
  readJSONFile('subscribers.json', '[]');
  readJSONFile('activity-log.json', '[]');
  readJSONFile('issues.json', '[]');

  // Ensure users.json exists
  const localUsers = readJSONFile(
    'users.json',
    '[]'
  );

  if (localUsers.length === 0) {
    const defaultPassword =
      process.env.DEFAULT_ADMIN_PASSWORD ||
      crypto.randomBytes(8).toString('hex');

    if (!process.env.DEFAULT_ADMIN_PASSWORD) {
      console.log(`
======================================================
⚠️ SECURITY NOTICE

DEFAULT_ADMIN_PASSWORD is not set.

Generated safe default admin password:
${defaultPassword}

Please save this and change it in the dashboard.
======================================================
`);
    }

    const hashedDefault =
      bcrypt.hashSync(defaultPassword, 10);

    const defaultUsers = [
      {
        username: 'berylbytes',
        password: hashedDefault,
        name: 'BerylBytes',
        role: 'superadmin',
        permissions: [
          'metrics:read',
          'subscribers:read',
          'subscribers:write',
          'issues:write',
          'logs:read'
        ]
      }
    ];

    writeJSONFile(
      'users.json',
      defaultUsers
    );
  } else {
    let updated = false;

    localUsers.forEach((u) => {
      if (
        (u.username === 'superadmin' ||
          u.username === 'berylbytes') &&
        u.name !== 'BerylBytes'
      ) {
        u.name = 'BerylBytes';
        updated = true;
      }
    });

    if (
      !localUsers.some(
        (u) => u.username === 'berylbytes'
      )
    ) {
      const defaultPassword =
        process.env.DEFAULT_ADMIN_PASSWORD ||
        crypto.randomBytes(8).toString('hex');

      localUsers.unshift({
        username: 'berylbytes',
        password: bcrypt.hashSync(
          defaultPassword,
          10
        ),
        name: 'BerylBytes',
        role: 'superadmin',
        permissions: [
          'metrics:read',
          'subscribers:read',
          'subscribers:write',
          'issues:write',
          'logs:read'
        ]
      });

      updated = true;

      console.log(
        `Created berylbytes user with auto-generated password: ${defaultPassword}`
      );
    }

    if (updated) {
      writeJSONFile(
        'users.json',
        localUsers
      );
    }
  }
}

// ============================================================
// INITIALIZE DATABASE
// ============================================================

export async function initializeDatabase() {
  if (dbInitialized) return;

  // ----------------------------------------------------------
  // LOCAL JSON MODE
  // ----------------------------------------------------------

  if (!pool) {
    initLocalJSON();

    console.log(
      'Database initialized in [Local JSON Fallback] mode.'
    );

    dbInitialized = true;
    return;
  }

  // ----------------------------------------------------------
  // POSTGRESQL MODE
  // ----------------------------------------------------------

  try {
    const client = await pool.connect();

    console.log(
      'Successfully connected to remote PostgreSQL database!'
    );

    // --------------------------------------------------------
    // SUBSCRIBERS TABLE
    // --------------------------------------------------------

    await client.query(`
      CREATE TABLE IF NOT EXISTS subscribers (
        email TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        source TEXT NOT NULL
      );
    `);

    // --------------------------------------------------------
    // ISSUES TABLE
    // --------------------------------------------------------

    await client.query(`
      CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY,
        number TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        excerpt TEXT NOT NULL,
        date TEXT NOT NULL,
        readTime TEXT NOT NULL,
        question TEXT NOT NULL,
        content TEXT NOT NULL
      );
    `);

    // --------------------------------------------------------
    // ACTIVITY LOG TABLE
    // --------------------------------------------------------

    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL
      );
    `);

    // --------------------------------------------------------
    // CREATOR USERS TABLE
    // --------------------------------------------------------

    await client.query(`
      CREATE TABLE IF NOT EXISTS creator_users (
        username TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        permissions TEXT[] NOT NULL
      );
    `);

    // --------------------------------------------------------
    // SEED ISSUES IF EMPTY
    // --------------------------------------------------------

    const issuesCheck = await client.query(
      'SELECT COUNT(*) FROM issues'
    );

    const count = parseInt(
      issuesCheck.rows[0].count,
      10
    );

    if (count === 0) {
      console.log(
        'PostgreSQL issues table is empty. Seeding default articles catalog...'
      );

      const localIssuesFile =
        getJSONPath('issues.json');

      let defaultIssues = [];

      if (fs.existsSync(localIssuesFile)) {
        try {
          defaultIssues = JSON.parse(
            fs.readFileSync(
              localIssuesFile,
              'utf8'
            )
          );
        } catch (err) {
          console.error(
            'Failed to parse issues.json:',
            err.message
          );
        }
      }

      for (const issue of defaultIssues) {
        await client.query(
          `
          INSERT INTO issues
          (
            id,
            number,
            title,
            category,
            excerpt,
            date,
            "readTime",
            question,
            content
          )
          VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING
          `,
          [
            issue.id,
            issue.number,
            issue.title,
            issue.category,
            issue.excerpt,
            issue.date || 'May 2026',
            issue.readTime,
            issue.question,
            issue.content
          ]
        );
      }

      console.log(
        `Seeded ${defaultIssues.length} default issues into PostgreSQL successfully.`
      );
    }

    // --------------------------------------------------------
    // SEED CREATOR USERS IF EMPTY
    // --------------------------------------------------------

    const usersCheck = await client.query(
      'SELECT COUNT(*) FROM creator_users'
    );

    const userCount = parseInt(
      usersCheck.rows[0].count,
      10
    );

    if (userCount === 0) {
      console.log(
        'PostgreSQL creator_users table is empty. Seeding default accounts...'
      );

      const localUsersFile =
        getJSONPath('users.json');

      let defaultUsers = [];

      if (fs.existsSync(localUsersFile)) {
        try {
          defaultUsers = JSON.parse(
            fs.readFileSync(
              localUsersFile,
              'utf8'
            )
          );
        } catch (err) {
          console.error(
            'Failed to parse users.json file:',
            err.message
          );
        }
      }

      // Ensure BerylBytes exists
      const hasBerylBytes =
        defaultUsers.some(
          (u) => u.username === 'berylbytes'
        );

      if (!hasBerylBytes) {
        const defaultPassword =
          process.env.DEFAULT_ADMIN_PASSWORD ||
          crypto.randomBytes(8).toString('hex');

        if (!process.env.DEFAULT_ADMIN_PASSWORD) {
          console.log(`
======================================================
⚠️ PG SECURITY NOTICE

DEFAULT_ADMIN_PASSWORD is not set.

Generated safe default admin password:
${defaultPassword}
======================================================
`);
        }

        defaultUsers.unshift({
          username: 'berylbytes',
          password: bcrypt.hashSync(
            defaultPassword,
            10
          ),
          name: 'BerylBytes',
          role: 'superadmin',
          permissions: [
            'metrics:read',
            'subscribers:read',
            'subscribers:write',
            'issues:write',
            'logs:read'
          ]
        });
      }

      // Hash plain-text passwords
      defaultUsers.forEach((u) => {
        if (
          u.password &&
          !u.password.startsWith('$2b$')
        ) {
          u.password = bcrypt.hashSync(
            u.password,
            10
          );
        }
      });

      for (const u of defaultUsers) {
        await client.query(
          `
          INSERT INTO creator_users
          (
            username,
            password,
            name,
            role,
            permissions
          )
          VALUES
          ($1, $2, $3, $4, $5)
          ON CONFLICT (username)
          DO UPDATE SET
            password = EXCLUDED.password,
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            permissions = EXCLUDED.permissions
          `,
          [
            u.username,
            u.password,
            u.name,
            u.role,
            u.permissions
          ]
        );
      }

      console.log(
        `Seeded ${defaultUsers.length} creator user accounts into PostgreSQL successfully.`
      );
    }

    client.release();

    console.log(
      'PostgreSQL database schemas verified & ready.'
    );

    dbInitialized = true;

  } catch (err) {
    console.error(
      'WARNING: Failed to initialize PostgreSQL database:',
      err.message
    );

    console.error(
      'Falling back to local JSON storage mode. Portal will still work.'
    );

    // Disable PG mode so all functions use JSON
    pool = null;

    initLocalJSON();

    dbInitialized = true;
  }
}

// ============================================================
// 1. LOG ACTIVITY
// ============================================================

export async function logActivity(
  action,
  details
) {
  const now = new Date();

  const timestamp =
    now.toLocaleTimeString(
      'en-US',
      {
        hour12: false
      }
    ) +
    '.' +
    String(
      now.getMilliseconds()
    ).padStart(3, '0');

  if (pool) {
    try {
      await pool.query(
        `
        INSERT INTO activity_log
        (timestamp, action, details)
        VALUES ($1, $2, $3)
        `,
        [
          timestamp,
          action,
          details
        ]
      );
    } catch (err) {
      console.error(
        'Failed to log activity to PostgreSQL:',
        err.message
      );
    }
  } else {
    try {
      const logs =
        readJSONFile(
          'activity-log.json'
        );

      logs.unshift({
        timestamp,
        action,
        details
      });

      if (logs.length > 200) {
        logs.pop();
      }

      writeJSONFile(
        'activity-log.json',
        logs
      );

    } catch (err) {
      console.error(
        'Failed to write local logs:',
        err.message
      );
    }
  }
}

// ============================================================
// 2. FETCH ACTIVITY LOGS
// ============================================================

export async function getActivityLogs() {
  if (pool) {
    const res = await pool.query(
      `
      SELECT timestamp, action, details
      FROM activity_log
      ORDER BY id DESC
      LIMIT 200
      `
    );

    return res.rows;
  }

  return readJSONFile(
    'activity-log.json'
  );
}

// ============================================================
// 3. FETCH SUBSCRIBERS
// ============================================================

export async function getSubscribers() {
  if (pool) {
    const res = await pool.query(
      `
      SELECT email, date, source
      FROM subscribers
      ORDER BY email ASC
      `
    );

    return res.rows;
  }

  return readJSONFile(
    'subscribers.json'
  );
}

// ============================================================
// 4. ADD SUBSCRIBER
// ============================================================

export async function addSubscriber(
  email,
  source
) {
  const today = new Date();

  const dateStr =
    today.toLocaleDateString(
      'en-US',
      {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }
    );

  if (pool) {
    await pool.query(
      `
      INSERT INTO subscribers
      (email, date, source)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO NOTHING
      `,
      [
        email,
        dateStr,
        source
      ]
    );

    return;
  }

  const subs =
    readJSONFile(
      'subscribers.json'
    );

  if (
    !subs.some(
      (s) =>
        s.email.toLowerCase() ===
        email.toLowerCase()
    )
  ) {
    subs.unshift({
      email,
      date: dateStr,
      source
    });

    writeJSONFile(
      'subscribers.json',
      subs
    );
  }
}

// ============================================================
// 5. DELETE SUBSCRIBER
// ============================================================

export async function deleteSubscriber(
  email
) {
  if (pool) {
    const res = await pool.query(
      `
      DELETE FROM subscribers
      WHERE LOWER(email) = LOWER($1)
      `,
      [email]
    );

    return res.rowCount > 0;
  }

  const subs =
    readJSONFile(
      'subscribers.json'
    );

  const filtered =
    subs.filter(
      (sub) =>
        sub.email.toLowerCase() !==
        email.toLowerCase()
    );

  if (
    subs.length !==
    filtered.length
  ) {
    writeJSONFile(
      'subscribers.json',
      filtered
    );

    return true;
  }

  return false;
}

// ============================================================
// 6. FETCH ISSUES
// ============================================================

export async function getIssues() {
  if (pool) {
    const res = await pool.query(
      `
      SELECT
        id,
        number,
        title,
        category,
        excerpt,
        date,
        "readTime",
        question,
        content
      FROM issues
      ORDER BY id DESC
      `
    );

    return res.rows;
  }

  return readJSONFile(
    'issues.json'
  );
}

// ============================================================
// 7. ADD ISSUE
// ============================================================

export async function addIssue(
  issue
) {
  if (pool) {
    await pool.query(
      `
      INSERT INTO issues
      (
        id,
        number,
        title,
        category,
        excerpt,
        date,
        "readTime",
        question,
        content
      )
      VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        issue.id,
        issue.number,
        issue.title,
        issue.category,
        issue.excerpt,
        issue.date,
        issue.readTime,
        issue.question,
        issue.content
      ]
    );

    return;
  }

  const issues =
    readJSONFile(
      'issues.json'
    );

  issues.unshift(issue);

  writeJSONFile(
    'issues.json',
    issues
  );
}

// ============================================================
// 8. UPDATE ISSUE
// ============================================================

export async function updateIssue(
  id,
  issue
) {
  if (pool) {
    const result = await pool.query(
      `
      UPDATE issues
      SET
        number = $1,
        title = $2,
        category = $3,
        excerpt = $4,
        date = $5,
        "readTime" = $6,
        question = $7,
        content = $8
      WHERE id = $9
      `,
      [
        issue.number,
        issue.title,
        issue.category,
        issue.excerpt,
        issue.date,
        issue.readTime,
        issue.question,
        issue.content,
        id
      ]
    );

    return result.rowCount > 0;
  }

  const issues =
    readJSONFile(
      'issues.json'
    );

  const index =
    issues.findIndex(
      (existingIssue) =>
        String(existingIssue.id) ===
        String(id)
    );

  if (index === -1) {
    return false;
  }

  issues[index] = {
    ...issues[index],
    ...issue,
    id: issues[index].id
  };

  writeJSONFile(
    'issues.json',
    issues
  );

  return true;
}

// ============================================================
// 9. DELETE ISSUE
// ============================================================

export async function deleteIssue(
  id
) {
  if (pool) {
    const result = await pool.query(
      `
      DELETE FROM issues
      WHERE id = $1
      `,
      [id]
    );

    return result.rowCount > 0;
  }

  const issues =
    readJSONFile(
      'issues.json'
    );

  const filtered =
    issues.filter(
      (issue) =>
        String(issue.id) !==
        String(id)
    );

  if (
    filtered.length ===
    issues.length
  ) {
    return false;
  }

  writeJSONFile(
    'issues.json',
    filtered
  );

  return true;
}

// ============================================================
// 10. FETCH CREATOR USERS
// ============================================================

export async function getCreatorUsers() {
  if (pool) {
    try {
      const res = await pool.query(
        `
        SELECT
          username,
          password,
          name,
          role,
          permissions
        FROM creator_users
        ORDER BY username ASC
        `
      );

      return res.rows;

    } catch (err) {
      console.error(
        'PG getCreatorUsers failed, falling back:',
        err.message
      );
    }
  }

  // Environment variable fallback
  if (process.env.CREATOR_USERS) {
    try {
      return JSON.parse(
        process.env.CREATOR_USERS
      );
    } catch (err) {
      console.error(
        'Failed to parse CREATOR_USERS:',
        err.message
      );
    }
  }

  // Local JSON fallback
  const localUsers =
    readJSONFile(
      'users.json'
    );

  if (
    localUsers &&
    localUsers.length > 0
  ) {
    return localUsers;
  }

  // Last resort
  const defaultPassword =
    process.env.DEFAULT_ADMIN_PASSWORD ||
    'changeme';

  return [
    {
      username: 'berylbytes',
      password: defaultPassword,
      name: 'BerylBytes',
      role: 'superadmin',
      permissions: [
        'metrics:read',
        'subscribers:read',
        'subscribers:write',
        'issues:write',
        'logs:read'
      ]
    }
  ];
}

// ============================================================
// 11. ADD CREATOR USER
// ============================================================

export async function addCreatorUser(
  user
) {
  if (pool) {
    await pool.query(
      `
      INSERT INTO creator_users
      (
        username,
        password,
        name,
        role,
        permissions
      )
      VALUES
      ($1, $2, $3, $4, $5)
      `,
      [
        user.username,
        user.password,
        user.name,
        user.role,
        user.permissions
      ]
    );

    return;
  }

  const users =
    readJSONFile(
      'users.json'
    );

  if (
    !users.some(
      (u) =>
        u.username.toLowerCase() ===
        user.username.toLowerCase()
    )
  ) {
    users.push(user);

    writeJSONFile(
      'users.json',
      users
    );
  }
}

// ============================================================
// 12. UPDATE CREATOR USER
// ============================================================

export async function updateCreatorUser(
  username,
  updatedUser
) {
  if (pool) {
    await pool.query(
      `
      UPDATE creator_users
      SET
        password = $1,
        name = $2,
        role = $3,
        permissions = $4
      WHERE username = $5
      `,
      [
        updatedUser.password,
        updatedUser.name,
        updatedUser.role,
        updatedUser.permissions,
        username
      ]
    );

    return;
  }

  const users =
    readJSONFile(
      'users.json'
    );

  const index =
    users.findIndex(
      (u) =>
        u.username.toLowerCase() ===
        username.toLowerCase()
    );

  if (index !== -1) {
    users[index] = {
      ...users[index],
      ...updatedUser
    };

    writeJSONFile(
      'users.json',
      users
    );
  }
}

// ============================================================
// 13. DELETE CREATOR USER
// ============================================================

export async function deleteCreatorUser(
  username
) {
  if (pool) {
    const res = await pool.query(
      `
      DELETE FROM creator_users
      WHERE username = $1
      `,
      [username]
    );

    return res.rowCount > 0;
  }

  const users =
    readJSONFile(
      'users.json'
    );

  const filtered =
    users.filter(
      (u) =>
        u.username.toLowerCase() !==
        username.toLowerCase()
    );

  if (
    users.length !==
    filtered.length
  ) {
    writeJSONFile(
      'users.json',
      filtered
    );

    return true;
  }

  return false;
}