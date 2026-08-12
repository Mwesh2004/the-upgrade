import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { Resend } from 'resend';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import helmet from 'helmet';

import {
  initializeDatabase,
  logActivity,
  getActivityLogs,
  getSubscribers,
  addSubscriber,
  deleteSubscriber,
  getIssues,
  addIssue,
  getCreatorUsers,
  addCreatorUser,
  updateCreatorUser,
  deleteCreatorUser
} from './server/db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

const SITE_URL = 'https://the-upgrade.vercel.app';

/*
|--------------------------------------------------------------------------
| JWT SECRET
|--------------------------------------------------------------------------
*/

let JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    console.error(
      'CRITICAL SECURITY ERROR: JWT_SECRET environment variable is missing in production.'
    );

    process.exit(1);
  }

  JWT_SECRET = crypto.randomBytes(32).toString('hex');

  console.log('Generated random JWT_SECRET for development.');
}

/*
|--------------------------------------------------------------------------
| RESEND
|--------------------------------------------------------------------------
*/

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/*
|--------------------------------------------------------------------------
| DATA DIRECTORY
|--------------------------------------------------------------------------
*/

const DATA_DIR = path.join(__dirname, 'server', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/*
|--------------------------------------------------------------------------
| CREATOR USERS
|--------------------------------------------------------------------------
*/

let users = [];

if (process.env.CREATOR_USERS) {
  try {
    users = JSON.parse(process.env.CREATOR_USERS);

    console.log(
      'Loaded role-based access user accounts from environment variable.'
    );
  } catch (err) {
    console.error(
      'Failed to parse CREATOR_USERS environment variable:',
      err.message
    );
  }
} else {
  const USERS_FILE = path.join(DATA_DIR, 'users.json');

  if (fs.existsSync(USERS_FILE)) {
    try {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));

      console.log(
        'Loaded role-based access user accounts from local users.json file.'
      );
    } catch (err) {
      console.error('Failed to load users.json:', err.message);
    }
  } else {
    console.warn(
      'WARNING: No user credentials loaded. Creator portal logins will fail.'
    );
  }
}

/*
|--------------------------------------------------------------------------
| SECURITY HEADERS
|--------------------------------------------------------------------------
|
| These are intentionally handled here instead of next.config.ts because
| this application uses Vite + Express.
|
*/

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: {
      policy: 'same-origin'
    },
    crossOriginResourcePolicy: {
      policy: 'same-origin'
    },
    frameguard: {
      action: 'sameorigin'
    },
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },
    noSniff: true
  })
);

/*
|--------------------------------------------------------------------------
| CUSTOM SECURITY HEADERS
|--------------------------------------------------------------------------
*/

app.use((req, res, next) => {
  /*
   * Content Security Policy
   *
   * We remove unsafe-eval.
   *
   * unsafe-inline remains temporarily because the current Vite frontend
   * may contain inline scripts/styles.
   */

  const csp = [
    "default-src 'self'",

    /*
     * IMPORTANT:
     * unsafe-eval has been removed.
     */
    [
      "script-src",
      "'self'",
      "'unsafe-inline'",
      'https://*.vercel.app',
      'https://*.google.com',
      'https://*.googletagmanager.com',
      'https://*.google-analytics.com'
    ].join(' '),

    /*
     * Styles
     */
    [
      "style-src",
      "'self'",
      "'unsafe-inline'",
      'https://fonts.googleapis.com'
    ].join(' '),

    /*
     * Fonts
     */
    [
      "font-src",
      "'self'",
      'https://fonts.gstatic.com',
      'data:'
    ].join(' '),

    /*
     * Images
     */
    [
      "img-src",
      "'self'",
      'data:',
      'blob:',
      'https:'
    ].join(' '),

    /*
     * API / fetch / websocket connections
     */
    [
      "connect-src",
      "'self'",
      SITE_URL,
      'https:',
      'wss:'
    ].join(' '),

    /*
     * Frames
     */
    [
      "frame-src",
      "'self'",
      'https:'
    ].join(' '),

    /*
     * Prevent plugins
     */
    "object-src 'none'",

    /*
     * Prevent base tag injection
     */
    "base-uri 'self'",

    /*
     * Forms may only submit to our own origin
     */
    "form-action 'self'",

    /*
     * Prevent other sites from framing this site.
     *
     * This is the CSP equivalent of X-Frame-Options.
     */
    "frame-ancestors 'self'",

    /*
     * Force HTTPS resources
     */
    'upgrade-insecure-requests'
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);

  /*
   * Clickjacking protection
   */
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  /*
   * MIME sniffing protection
   */
  res.setHeader('X-Content-Type-Options', 'nosniff');

  /*
   * Referrer protection
   */
  res.setHeader(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );

  /*
   * Browser feature restrictions
   */
  res.setHeader(
    'Permissions-Policy',
    [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'bluetooth=()',
      'accelerometer=()',
      'gyroscope=()',
      'magnetometer=()'
    ].join(', ')
  );

  /*
   * Cross-origin isolation policies
   */
  res.setHeader(
    'Cross-Origin-Opener-Policy',
    'same-origin'
  );

  res.setHeader(
    'Cross-Origin-Resource-Policy',
    'same-origin'
  );

  /*
   * Remove Express fingerprint.
   */
  res.removeHeader('X-Powered-By');

  next();
});

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
|
| DO NOT use:
|
| cors({
|   origin: true
| })
|
| because that can reflect arbitrary origins.
|
*/

const allowedOrigins = [
  SITE_URL,
  'http://localhost:3000',
  'http://localhost:3001'
];

app.use(
  cors({
    origin: function (origin, callback) {
      /*
       * Allow requests without Origin.
       *
       * This is required for things such as server-to-server requests,
       * curl and some browser navigation scenarios.
       */
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error('CORS policy: origin not allowed.')
      );
    },

    credentials: true,

    methods: [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization'
    ]
  })
);

/*
|--------------------------------------------------------------------------
| BODY PARSERS
|--------------------------------------------------------------------------
*/

app.use(
  express.json({
    limit: '10kb'
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: '10kb'
  })
);

app.use(cookieParser());

/*
|--------------------------------------------------------------------------
| MALFORMED JSON HANDLER
|--------------------------------------------------------------------------
*/

app.use((err, req, res, next) => {
  if (
    err instanceof SyntaxError &&
    err.status === 400 &&
    'body' in err
  ) {
    return res.status(400).json({
      error: 'Malformed or invalid JSON payload.'
    });
  }

  if (err.message?.startsWith('CORS policy')) {
    return res.status(403).json({
      error: 'Origin not allowed.'
    });
  }

  next(err);
});

/*
|--------------------------------------------------------------------------
| STATIC FRONTEND
|--------------------------------------------------------------------------
*/

app.use(
  express.static(
    path.join(__dirname, 'dist'),
    {
      index: 'index.html',
      maxAge: process.env.VERCEL ? '1h' : 0
    }
  )
);

/*
|--------------------------------------------------------------------------
| RATE LIMITING
|--------------------------------------------------------------------------
*/

const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,

  message: {
    error: 'Too many requests. Please try again later.'
  },

  standardHeaders: true,
  legacyHeaders: false,

  skip: (req) => {
    return !req.path.startsWith('/api');
  }
});

app.use('/api', globalApiLimiter);

/*
|--------------------------------------------------------------------------
| DATABASE INITIALIZATION
|--------------------------------------------------------------------------
*/

let dbInitPromise = null;

app.use(async (req, res, next) => {
  try {
    if (!dbInitPromise) {
      dbInitPromise = initializeDatabase().catch((err) => {
        console.error(
          'Database initialization failed:',
          err
        );

        dbInitPromise = null;

        throw err;
      });
    }

    await dbInitPromise;

    next();
  } catch (err) {
    res.status(503).json({
      error: 'Database temporarily unavailable.'
    });
  }
});

/*
|--------------------------------------------------------------------------
| SPECIFIC RATE LIMITERS
|--------------------------------------------------------------------------
*/

const subscriptionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,

  message: {
    error:
      'Too many subscription attempts from this connection. Please try again later.'
  },

  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,

  message: {
    error:
      'Too many login attempts. Please try again after 15 minutes.'
  },

  standardHeaders: true,
  legacyHeaders: false
});

const trackingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,

  message: {
    error:
      'Too many tracking events. Log activity throttled.'
  },

  standardHeaders: false,
  legacyHeaders: false
});

/*
|--------------------------------------------------------------------------
| LOGGING
|--------------------------------------------------------------------------
*/

function logEvent(action, details) {
  try {
    logActivity(action, details);
  } catch (err) {
    console.error('Activity log failed:', err.message);
  }
}

/*
|--------------------------------------------------------------------------
| AUTHORIZATION
|--------------------------------------------------------------------------
*/

function authenticateToken(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      error:
        'Authorization cookie missing. Access denied.'
    });
  }

  try {
    const verified = jwt.verify(
      token,
      JWT_SECRET
    );

    req.user = verified;

    next();
  } catch (err) {
    return res.status(401).json({
      error:
        'Invalid or expired token session.'
    });
  }
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (
      !req.user ||
      !Array.isArray(req.user.permissions) ||
      !req.user.permissions.includes(permission)
    ) {
      return res.status(403).json({
        error:
          `Forbidden. Role-based clearance required: "${permission}"`
      });
    }

    next();
  };
}

function requireSuperadmin(req, res, next) {
  if (
    !req.user ||
    req.user.role !== 'superadmin'
  ) {
    return res.status(403).json({
      error:
        'Forbidden. Superadmin role clearance required.'
    });
  }

  next();
}

/*
|--------------------------------------------------------------------------
| PUBLIC API
|--------------------------------------------------------------------------
*/

/*
 * GET ISSUES
 */

app.get('/api/issues', async (req, res) => {
  try {
    const issues = await getIssues();

    res.json(issues);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error:
        'Failed to retrieve newsletter issues catalog.'
    });
  }
});

/*
 * PUBLIC STATISTICS
 */

app.get('/api/stats', async (req, res) => {
  try {
    const subs = await getSubscribers();
    const issues = await getIssues();

    res.json({
      totalSubscribers: subs.length,
      totalIssues: issues.length
    });
  } catch (err) {
    res.json({
      totalSubscribers: 0,
      totalIssues: 12
    });
  }
});

/*
|--------------------------------------------------------------------------
| SUBSCRIBE
|--------------------------------------------------------------------------
*/

app.post(
  '/api/subscribe',

  subscriptionLimiter,

  body('email')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),

  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: errors.array()[0].msg
      });
    }

    const { email } = req.body;

    try {
      const subscribers =
        await getSubscribers();

      const alreadyExists =
        subscribers.some(
          sub =>
            sub.email.toLowerCase() ===
            email.toLowerCase()
        );

      if (!alreadyExists) {
        const sourceVal =
          typeof req.body.source === 'string'
            ? req.body.source
                .replace(/[&<>'"]/g, '')
                .trim()
                .substring(0, 50)
            : 'Public Form';

        await addSubscriber(
          email,
          sourceVal
        );

        logEvent(
          'SUBSCRIBE',
          `New registration: "${email}" via ${sourceVal}`
        );

        /*
         * FORMSPREE
         */

        if (process.env.FORMSPREE_FORM_ID) {
          try {
            await fetch(
              `https://formspree.io/f/${process.env.FORMSPREE_FORM_ID}`,
              {
                method: 'POST',

                headers: {
                  'Content-Type':
                    'application/json',
                  Accept:
                    'application/json'
                },

                body: JSON.stringify({
                  email,
                  source:
                    req.body.source ||
                    'Public Form',

                  message:
                    `New subscriber registered on The Upgrade: ${email}`
                })
              }
            );

            logEvent(
              'FORMSPREE_FORWARD',
              `Forwarded subscription "${email}" to Formspree`
            );
          } catch (formspreeErr) {
            logEvent(
              'FORMSPREE_FAILED',
              `Formspree forwarding failed: ${formspreeErr.message}`
            );
          }
        }

        /*
         * RESEND
         */

        if (resend) {
          try {
            await resend.emails.send({
              from:
                'The Upgrade <welcome@theupgrade.co.ke>',

              to: email,

              subject:
                'Welcome to The Upgrade — Real Talk. No Performance.',

              html: `
                <div style="font-family:sans-serif;max-width:500px;border:3px solid #000;padding:24px">
                  <h2>Welcome to The Upgrade!</h2>

                  <p>
                    Weekly issues drop in your inbox every Monday morning.
                    Expect Kenyan banter, money psychology,
                    mental health transparency, and no fake gurus.
                  </p>

                  <p>
                    We're glad to have you in the loop.
                  </p>

                  <hr style="border-top:2px solid #000">

                  <small>
                    © 2026 The Upgrade Newsletter
                  </small>
                </div>
              `
            });

            logEvent(
              'EMAIL_SENT_SUCCESS',
              `Verification email successfully sent to: "${email}" via Resend`
            );
          } catch (emailErr) {
            logEvent(
              'EMAIL_SENT_FAILED',
              `Resend api delivery error to "${email}": ${emailErr.message}`
            );
          }
        } else {
          logEvent(
            'EMAIL_SIMULATION',
            `Mock email notification dispatched to: "${email}"`
          );
        }
      }

      res.status(200).json({
        success: true,
        message:
          'Subscription successfully approved!'
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          'Database writing error. Please try again.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| TRACKING
|--------------------------------------------------------------------------
*/

app.post(
  '/api/track',
  trackingLimiter,
  (req, res) => {
    const action =
      typeof req.body.action === 'string'
        ? req.body.action
        : '';

    const details =
      typeof req.body.details === 'string'
        ? req.body.details
        : '';

    if (!action || !details) {
      return res.status(400).json({
        error:
          'Missing or malformed action/details parameters.'
      });
    }

    const sanitizedAction =
      action
        .replace(/[<>]/g, '')
        .trim()
        .substring(0, 40);

    const sanitizedDetails =
      details
        .replace(/[<>]/g, '')
        .trim()
        .substring(0, 150);

    logEvent(
      sanitizedAction,
      sanitizedDetails
    );

    res.sendStatus(204);
  }
);

/*
|--------------------------------------------------------------------------
| AUTH CHECK
|--------------------------------------------------------------------------
*/

app.get(
  '/api/auth/check',
  async (req, res) => {
    try {
      const creatorUsers =
        await getCreatorUsers();

      const info =
        creatorUsers.map(u => ({
          username: u.username,
          role: u.role,

          passwordFormat:
            u.password
              ? u.password.startsWith('$2')
                ? 'bcrypt'
                : `plaintext(${u.password.length}chars)`
              : 'MISSING',

          hasPermissions:
            Array.isArray(u.permissions)
        }));

      res.json({
        count: creatorUsers.length,
        users: info,
        bcryptjsLoaded:
          typeof bcrypt.compare === 'function'
      });
    } catch (err) {
      res.status(500).json({
        error: err.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

app.post(
  '/api/auth/login',
  authLimiter,
  async (req, res) => {
    const username =
      typeof req.body.username === 'string'
        ? req.body.username
            .trim()
            .substring(0, 50)
        : '';

    const password =
      typeof req.body.password === 'string'
        ? req.body.password
            .substring(0, 50)
        : '';

    if (!username || !password) {
      return res.status(400).json({
        error:
          'Username and password fields are required.'
      });
    }

    try {
      const creatorUsers =
        await getCreatorUsers();

      const user =
        creatorUsers.find(
          u =>
            u.username.toLowerCase() ===
            username.toLowerCase()
        );

      if (!user) {
        logEvent(
          'AUTH_FAILURE',
          `Invalid login credentials attempt for username: "${username}"`
        );

        return res.status(401).json({
          error:
            'Incorrect username or password.'
        });
      }

      let passwordValid = false;

      const isBcryptHash =
        user.password &&
        (
          user.password.startsWith('$2b$') ||
          user.password.startsWith('$2a$')
        );

      if (isBcryptHash) {
        passwordValid =
          await bcrypt.compare(
            password,
            user.password
          );
      } else {
        passwordValid =
          user.password === password;

        if (passwordValid) {
          try {
            const hashedPassword =
              await bcrypt.hash(
                password,
                10
              );

            await updateCreatorUser(
              user.username,
              {
                password:
                  hashedPassword,

                name: user.name,

                role: user.role,

                permissions:
                  user.permissions
              }
            );
          } catch (migrationErr) {
            console.error(
              'Password migration failed:',
              migrationErr.message
            );
          }
        }
      }

      if (!passwordValid) {
        logEvent(
          'AUTH_FAILURE',
          `Invalid login credentials attempt for username: "${username}"`
        );

        return res.status(401).json({
          error:
            'Incorrect username or password.'
        });
      }

      const token =
        jwt.sign(
          {
            username: user.username,
            name: user.name,
            role: user.role,
            permissions:
              user.permissions
          },

          JWT_SECRET,

          {
            expiresIn: '24h'
          }
        );

      const isProduction =
        process.env.NODE_ENV === 'production' ||
        !!process.env.VERCEL;

      res.cookie(
        'token',
        token,
        {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'strict',
          maxAge:
            24 * 60 * 60 * 1000,
          path: '/'
        }
      );

      logEvent(
        'AUTH_SUCCESS',
        `User "${user.username}" logged in successfully with role: "${user.role}"`
      );

      res.json({
        username: user.username,
        name: user.name,
        role: user.role,
        permissions:
          user.permissions
      });
    } catch (err) {
      console.error(
        'Login route error:',
        err
      );

      res.status(500).json({
        error:
          'Internal server login error.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

app.post(
  '/api/auth/logout',
  (req, res) => {
    res.clearCookie(
      'token',
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
            'production' ||
          !!process.env.VERCEL,
        sameSite: 'strict',
        path: '/'
      }
    );

    res.status(200).json({
      success: true,
      message:
        'Logged out successfully.'
    });
  }
);

/*
|--------------------------------------------------------------------------
| AUTH STATUS
|--------------------------------------------------------------------------
*/

app.get(
  '/api/auth/status',
  authenticateToken,
  (req, res) => {
    res.json({
      username:
        req.user.username,

      name:
        req.user.name,

      role:
        req.user.role,

      permissions:
        req.user.permissions
    });
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN API
|--------------------------------------------------------------------------
|
| These routes can remain even if you currently do not have an admin
| dashboard. They are protected and cannot be accessed without a valid
| authentication token and permissions.
|
*/

/*
|--------------------------------------------------------------------------
| METRICS
|--------------------------------------------------------------------------
*/

app.get(
  '/api/admin/metrics',
  authenticateToken,
  requirePermission('metrics:read'),
  async (req, res) => {
    try {
      const subs =
        await getSubscribers();

      res.json({
        totalSubscribers:
          subs.length,

        openRate:
          subs.length > 0
            ? 76.5
            : 0,

        ctrRate:
          subs.length > 0
            ? 28.2
            : 0,

        growthData: [
          0,
          0,
          0,
          Math.floor(
            subs.length * 0.4
          ),
          Math.floor(
            subs.length * 0.7
          ),
          subs.length
        ]
      });
    } catch (err) {
      res.status(500).json({
        error:
          'Failed to compile metrics.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| SUBSCRIBERS
|--------------------------------------------------------------------------
*/

app.get(
  '/api/admin/subscribers',
  authenticateToken,
  requirePermission(
    'subscribers:read'
  ),
  async (req, res) => {
    try {
      const subs =
        await getSubscribers();

      res.json(subs);
    } catch (err) {
      res.status(500).json({
        error:
          'Failed to read subscribers registry.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADD SUBSCRIBER
|--------------------------------------------------------------------------
*/

app.post(
  '/api/admin/subscribers',

  authenticateToken,

  requirePermission(
    'subscribers:write'
  ),

  body('email')
    .isEmail()
    .withMessage(
      'Invalid email address'
    )
    .normalizeEmail(),

  async (req, res) => {
    const errors =
      validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        error:
          errors.array()[0].msg
      });
    }

    const { email } =
      req.body;

    try {
      const subs =
        await getSubscribers();

      if (
        subs.some(
          sub =>
            sub.email.toLowerCase() ===
            email.toLowerCase()
        )
      ) {
        return res.status(400).json({
          error:
            'Email already exists in list.'
        });
      }

      await addSubscriber(
        email,
        'Manual Dashboard Add'
      );

      logEvent(
        'SUBSCRIBER_ADD',
        `Manually registered subscriber: "${email}" by admin "${req.user.username}"`
      );

      const updatedSubs =
        await getSubscribers();

      res.json(updatedSubs);
    } catch (err) {
      res.status(500).json({
        error:
          'Failed to write subscriber data.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| DELETE SUBSCRIBER
|--------------------------------------------------------------------------
*/

app.delete(
  '/api/admin/subscribers/:email',
  authenticateToken,
  requirePermission(
    'subscribers:write'
  ),
  async (req, res) => {
    try {
      const deleted =
        await deleteSubscriber(
          req.params.email
        );

      if (!deleted) {
        return res.status(404).json({
          error:
            'Email not found in registry.'
        });
      }

      logEvent(
        'SUBSCRIBER_DELETE',
        `Removed subscriber: "${req.params.email}" by admin "${req.user.username}"`
      );

      const updatedSubs =
        await getSubscribers();

      res.json(updatedSubs);
    } catch (err) {
      res.status(500).json({
        error:
          'Failed to modify registry database.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| PUBLISH ISSUE
|--------------------------------------------------------------------------
*/

app.post(
  '/api/admin/issues',

  authenticateToken,

  requirePermission(
    'issues:write'
  ),

  body('title')
    .trim()
    .notEmpty()
    .escape(),

  body('category')
    .trim()
    .notEmpty(),

  body('excerpt')
    .trim()
    .notEmpty()
    .escape(),

  body('content')
    .trim()
    .notEmpty(),

  body('question')
    .trim()
    .notEmpty()
    .escape(),

  async (req, res) => {
    const errors =
      validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        error:
          'Please populate all fields with valid inputs.'
      });
    }

    const {
      title,
      category,
      excerpt,
      content,
      question
    } = req.body;

    try {
      const issues =
        await getIssues();

      const nextIdNum =
        issues.length > 0
          ? parseInt(
              issues[0].id
            ) + 1
          : 1;

      const nextId =
        String(nextIdNum)
          .padStart(3, '0');

      const today =
        new Date();

      const dateStr =
        today.toLocaleDateString(
          'en-US',
          {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          }
        );

      const readTime =
        `${Math.max(
          2,
          Math.round(
            content.split(' ').length /
              180
          )
        )} min read`;

      const newIssue = {
        id: nextId,
        number: `#${nextId}`,
        title,
        category,
        excerpt,
        date: dateStr,
        readTime,
        question,
        content
      };

      await addIssue(
        newIssue
      );

      logEvent(
        'CREATE_ISSUE',
        `Creator "${req.user.username}" published Issue #${nextId}: "${title}"`
      );

      /*
       * Broadcast email
       */

      if (resend) {
        try {
          const subscribers =
            await getSubscribers();

          for (
            const sub of subscribers
          ) {
            await resend.emails.send({
              from:
                'The Upgrade <newsletter@theupgrade.co.ke>',

              to: sub.email,

              subject:
                `The Upgrade — ${title}`,

              html: `
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:3px solid #000;padding:30px;background:#f5f0e8;color:#0a0a0a">

                  <h1>The Upgrade</h1>

                  <div style="font-size:12px;text-transform:uppercase;margin-bottom:20px">
                    Issue ${newIssue.number}
                    · ${category}
                    · ${dateStr}
                  </div>

                  <h2>${title}</h2>

                  <div style="line-height:1.6;font-size:16px;margin-bottom:30px">
                    ${content}
                  </div>

                  <div style="border:2px dashed #000;padding:20px;background:#fff">

                    <strong>
                      ? One Honest Question to Sit With
                    </strong>

                    <p>
                      ${question}
                    </p>

                  </div>

                  <hr>

                  <small>
                    You are receiving this because you subscribed to The Upgrade.
                    <a href="${SITE_URL}">
                      Visit The Upgrade
                    </a>
                  </small>

                </div>
              `
            });

            logEvent(
              'BROADCAST_SENT',
              `Emailed Issue #${nextId} to subscriber: "${sub.email}"`
            );
          }
        } catch (broadcastErr) {
          logEvent(
            'BROADCAST_FAILED',
            `Broadcast delivery error for Issue #${nextId}: ${broadcastErr.message}`
          );
        }
      } else {
        logEvent(
          'BROADCAST_SIMULATOR',
          `Mock broadcast: Issue #${nextId} simulated.`
        );
      }

      res.json(
        newIssue
      );
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          'Failed to publish new issue to database.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ACTIVITY LOG
|--------------------------------------------------------------------------
*/

app.get(
  '/api/admin/activity-log',
  authenticateToken,
  requirePermission('logs:read'),
  async (req, res) => {
    try {
      const logs =
        await getActivityLogs();

      res.json(logs);
    } catch (err) {
      res.status(500).json({
        error:
          'Failed to access logs.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| USERS
|--------------------------------------------------------------------------
*/

app.get(
  '/api/admin/users',
  authenticateToken,
  requireSuperadmin,
  async (req, res) => {
    try {
      const creatorUsers =
        await getCreatorUsers();

      const sanitized =
        creatorUsers.map(
          u => ({
            username:
              u.username,

            name:
              u.name,

            role:
              u.role,

            permissions:
              u.permissions
          })
        );

      res.json(
        sanitized
      );
    } catch (err) {
      res.status(500).json({
        error:
          'Failed to retrieve creator users.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| ADD USER
|--------------------------------------------------------------------------
*/

app.post(
  '/api/admin/users',

  authenticateToken,

  requireSuperadmin,

  body('username')
    .trim()
    .isLength({
      min: 3,
      max: 30
    })
    .escape(),

  body('password')
    .isLength({
      min: 6,
      max: 40
    }),

  body('name')
    .trim()
    .notEmpty()
    .escape(),

  body('role')
    .isIn([
      'superadmin',
      'editor',
      'moderator',
      'viewer'
    ]),

  async (req, res) => {
    const errors =
      validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        error:
          errors.array()[0].msg
      });
    }

    const {
      username,
      password,
      name,
      role
    } = req.body;

    try {
      const existingUsers =
        await getCreatorUsers();

      if (
        existingUsers.some(
          u =>
            u.username.toLowerCase() ===
            username.toLowerCase()
        )
      ) {
        return res.status(400).json({
          error:
            'Username already exists.'
        });
      }

      let permissions = [];

      if (
        role === 'superadmin'
      ) {
        permissions = [
          'metrics:read',
          'subscribers:read',
          'subscribers:write',
          'issues:write',
          'logs:read'
        ];
      }

      if (
        role === 'editor'
      ) {
        permissions = [
          'issues:write'
        ];
      }

      if (
        role === 'moderator'
      ) {
        permissions = [
          'subscribers:read',
          'subscribers:write'
        ];
      }

      if (
        role === 'viewer'
      ) {
        permissions = [
          'metrics:read',
          'logs:read'
        ];
      }

      const hashedPassword =
        bcrypt.hashSync(
          password,
          10
        );

      await addCreatorUser({
        username,
        password:
          hashedPassword,
        name,
        role,
        permissions
      });

      logEvent(
        'USER_ADD',
        `Superadmin "${req.user.username}" created user "${username}" with role "${role}"`
      );

      res.json({
        success: true
      });
    } catch (err) {
      res.status(500).json({
        error:
          'Failed to create user account.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| UPDATE USER
|--------------------------------------------------------------------------
*/

app.put(
  '/api/admin/users/:username',

  authenticateToken,

  requireSuperadmin,

  body('password')
    .optional()
    .isLength({
      min: 6,
      max: 40
    }),

  body('name')
    .trim()
    .notEmpty()
    .escape(),

  body('role')
    .isIn([
      'superadmin',
      'editor',
      'moderator',
      'viewer'
    ]),

  async (req, res) => {
    const errors =
      validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        error:
          errors.array()[0].msg
      });
    }

    const {
      username
    } = req.params;

    const {
      password,
      name,
      role
    } = req.body;

    try {
      const existingUsers =
        await getCreatorUsers();

      const user =
        existingUsers.find(
          u =>
            u.username.toLowerCase() ===
            username.toLowerCase()
        );

      if (!user) {
        return res.status(404).json({
          error:
            'User not found.'
        });
      }

      if (
        req.user.username.toLowerCase() ===
          username.toLowerCase() &&
        role !== 'superadmin'
      ) {
        return res.status(400).json({
          error:
            'You cannot change your own superadmin role.'
        });
      }

      let permissions = [];

      if (
        role === 'superadmin'
      ) {
        permissions = [
          'metrics:read',
          'subscribers:read',
          'subscribers:write',
          'issues:write',
          'logs:read'
        ];
      } else if (
        role === 'editor'
      ) {
        permissions = [
          'issues:write'
        ];
      } else if (
        role === 'moderator'
      ) {
        permissions = [
          'subscribers:read',
          'subscribers:write'
        ];
      } else {
        permissions = [
          'metrics:read',
          'logs:read'
        ];
      }

      const updatedUser = {
        password:
          password
            ? bcrypt.hashSync(
                password,
                10
              )
            : user.password,

        name,

        role,

        permissions
      };

      await updateCreatorUser(
        username,
        updatedUser
      );

      logEvent(
        'USER_UPDATE',
        `Superadmin "${req.user.username}" updated user "${username}"`
      );

      res.json({
        success: true
      });
    } catch (err) {
      res.status(500).json({
        error:
          'Failed to update user account.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| DELETE USER
|--------------------------------------------------------------------------
*/

app.delete(
  '/api/admin/users/:username',

  authenticateToken,

  requireSuperadmin,

  async (req, res) => {
    const {
      username
    } = req.params;

    try {
      if (
        req.user.username.toLowerCase() ===
        username.toLowerCase()
      ) {
        return res.status(400).json({
          error:
            'Self-deletion is forbidden.'
        });
      }

      const deleted =
        await deleteCreatorUser(
          username
        );

      if (!deleted) {
        return res.status(404).json({
          error:
            'User not found.'
        });
      }

      logEvent(
        'USER_DELETE',
        `Superadmin "${req.user.username}" deleted creator user "${username}"`
      );

      res.json({
        success: true
      });
    } catch (err) {
      res.status(500).json({
        error:
          'Failed to delete user account.'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get(
  '/api/health',
  (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'The Upgrade API',
      timestamp:
        new Date().toISOString()
    });
  }
);

/*
|--------------------------------------------------------------------------
| FRONTEND FALLBACK
|--------------------------------------------------------------------------
*/

app.get(
  '*',
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        'dist',
        'index.html'
      )
    );
  }
);

/*
|--------------------------------------------------------------------------
| ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use(
  (err, req, res, next) => {
    console.error(
      'Unhandled server error:',
      err
    );

    if (res.headersSent) {
      return next(err);
    }

    res.status(500).json({
      error:
        'Internal server error.'
    });
  }
);

/*
|--------------------------------------------------------------------------
| EXPORT FOR VERCEL
|--------------------------------------------------------------------------
*/

export default app;

/*
|--------------------------------------------------------------------------
| LOCAL DEVELOPMENT SERVER
|--------------------------------------------------------------------------
*/

if (!process.env.VERCEL) {
  app.listen(
    PORT,
    async () => {
      try {
        await initializeDatabase();

        console.log(
          '========================================'
        );

        console.log(
          '   The Upgrade Node Server is Online!'
        );

        console.log(
          `   Listening at http://localhost:${PORT}`
        );

        console.log(
          '========================================'
        );

        logEvent(
          'SERVER_START',
          `Server booted successfully on port ${PORT}`
        );
      } catch (err) {
        console.error(
          'Server boot error:',
          err.message
        );

        process.exit(1);
      }
    }
  );
}