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

/* ============================================================
   ENVIRONMENT / SECURITY CONFIGURATION
============================================================ */

const isProduction =
  process.env.NODE_ENV === 'production' ||
  !!process.env.VERCEL;

let JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (isProduction) {
    console.error(
      'CRITICAL SECURITY ERROR: JWT_SECRET environment variable is missing in production!'
    );

    process.exit(1);
  }

  JWT_SECRET = crypto.randomBytes(32).toString('hex');

  console.log(
    'Generated random JWT_SECRET for development.'
  );
}

/* ============================================================
   CORS
============================================================ */

const allowedOrigins = [
  'https://the-upgrade.vercel.app',
  'https://theupgrade.co.ke',
  'https://www.theupgrade.co.ke'
];

app.use(
  cors({
    origin(origin, callback) {
      // Allow server-to-server / same-origin requests with no Origin header
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error('CORS policy violation')
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

/* ============================================================
   HELMET
============================================================ */

app.use(
  helmet({
    contentSecurityPolicy: false,

    crossOriginEmbedderPolicy: false,

    frameguard: {
      action: 'deny'
    },

    noSniff: true,

    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    }
  })
);

/* ============================================================
   BODY PARSING
============================================================ */

app.use(
  express.json({
    limit: '10kb'
  })
);

app.use(cookieParser());

/* ============================================================
   GLOBAL SECURITY HEADERS
============================================================ */

app.use((req, res, next) => {
  res.setHeader(
    'X-Frame-Options',
    'DENY'
  );

  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );

  res.setHeader(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );

  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );

  res.setHeader(
    'Cross-Origin-Opener-Policy',
    'same-origin'
  );

  res.setHeader(
    'Cross-Origin-Resource-Policy',
    'same-origin'
  );

  // HSTS only makes sense over HTTPS.
  if (isProduction) {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }

  next();
});

/* ============================================================
   CSP
============================================================ */

/*
  IMPORTANT:

  This CSP is intentionally handled by Express.

  Do NOT add a second conflicting CSP in another server/config
  file unless you know exactly why you need it.

  'unsafe-inline' / 'unsafe-eval' may still be required by the
  current Vite frontend depending on how the application is
  bundled.

  Once the frontend is confirmed not to require them, they
  should be removed.
*/

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",

      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel.app https://*.google.com https://*.googletagmanager.com https://*.google-analytics.com",

      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

      "font-src 'self' https://fonts.gstatic.com data:",

      "img-src 'self' data: blob: https:",

      "connect-src 'self' https: wss:",

      "frame-src 'self' https:",

      "object-src 'none'",

      "base-uri 'self'",

      "form-action 'self'",

      "frame-ancestors 'none'",

      "upgrade-insecure-requests"
    ].join('; ')
  );

  next();
});

/* ============================================================
   MALFORMED JSON HANDLER
============================================================ */

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

  next(err);
});

/* ============================================================
   STATIC FRONTEND
============================================================ */

app.use(
  express.static(
    path.join(__dirname, 'dist')
  )
);

/* ============================================================
   RATE LIMITING
============================================================ */

const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 150,

  message: {
    error:
      'Too many requests. Please try again later.'
  },

  standardHeaders: true,

  legacyHeaders: false,

  skip: (req) => {
    return req.path === '/auth/status';
  }
});

app.use(
  '/api',
  globalApiLimiter
);

/* ============================================================
   DATABASE INITIALIZATION
============================================================ */

let dbInitPromise = null;

app.use(
  async (req, res, next) => {
    try {
      if (!dbInitPromise) {
        dbInitPromise =
          initializeDatabase().catch((err) => {
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
      console.error(
        'Database middleware error:',
        err
      );

      return res.status(503).json({
        error:
          'Database service temporarily unavailable.'
      });
    }
  }
);

/* ============================================================
   SPECIFIC RATE LIMITERS
============================================================ */

/*
  Public subscription limiter
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

/*
  Authentication limiter
*/

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

/*
  Tracking limiter
*/

const trackingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 30,

  message: {
    error:
      'Too many tracking events. Log activity throttled.'
  },

  standardHeaders: true,

  legacyHeaders: false
});

/* ============================================================
   ACTIVITY LOGGING
============================================================ */

function logEvent(action, details) {
  try {
    logActivity(action, details);
  } catch (err) {
    console.error(
      'Activity logging failed:',
      err.message
    );
  }
}

/* ============================================================
   AUTHENTICATION
============================================================ */

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

/* ============================================================
   PERMISSION CHECK
============================================================ */

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

/* ============================================================
   PUBLIC API
============================================================ */

/*
  GET ISSUES
*/

app.get(
  '/api/issues',
  async (req, res) => {
    try {
      const issues = await getIssues();

      res.json(issues);
    } catch (err) {
      console.error(
        'Get issues error:',
        err
      );

      res.status(500).json({
        error:
          'Failed to retrieve newsletter issues catalog.'
      });
    }
  }
);

/*
  PUBLIC STATISTICS
*/

app.get(
  '/api/stats',
  async (req, res) => {
    try {
      const subs =
        await getSubscribers();

      const issues =
        await getIssues();

      res.json({
        totalSubscribers:
          subs.length,

        totalIssues:
          issues.length
      });
    } catch (err) {
      res.json({
        totalSubscribers: 0,
        totalIssues: 12
      });
    }
  }
);

/*
  PUBLIC SUBSCRIPTION
*/

app.post(
  '/api/subscribe',

  subscriptionLimiter,

  body('email')
    .isEmail()
    .withMessage('Invalid email format')
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
      const subscribers =
        await getSubscribers();

      const alreadyExists =
        subscribers.some(
          (sub) =>
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
          FORMSPREE
        */

        if (
          process.env.FORMSPREE_FORM_ID
        ) {
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
          RESEND WELCOME EMAIL
        */

        if (
          process.env.RESEND_API_KEY
        ) {
          try {
            const resend =
              new Resend(
                process.env.RESEND_API_KEY
              );

            await resend.emails.send({
              from:
                'The Upgrade <welcome@theupgrade.co.ke>',

              to: email,

              subject:
                'Welcome to The Upgrade — Real Talk. No Performance.',

              html: `
                <div style="font-family:sans-serif;max-width:500px;border:3px solid #000;padding:24px;">
                  <h2>Welcome to The Upgrade!</h2>

                  <p>
                    Weekly issues drop in your inbox every Monday morning.
                    Expect Kenyan banter, money psychology, mental health
                    transparency, and no fake gurus.
                  </p>

                  <p>
                    We're glad to have you in the loop.
                  </p>

                  <hr style="border-top:2px solid #000;">

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
              `Resend delivery error to "${email}": ${emailErr.message}`
            );
          }
        } else {
          logEvent(
            'EMAIL_SIMULATION',
            `Mock email notification dispatched to: "${email}"`
          );
        }
      }

      return res.status(200).json({
        success: true,

        message:
          'Subscription successfully approved!'
      });
    } catch (err) {
      console.error(
        'Subscription error:',
        err
      );

      return res.status(500).json({
        error:
          'Database writing error. Please try again.'
      });
    }
  }
);

/* ============================================================
   TRACKING
============================================================ */

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

    return res.sendStatus(204);
  }
);

/* ============================================================
   AUTH LOGIN
============================================================ */

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
            .substring(0, 100)
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
          (u) =>
            typeof u.username === 'string' &&
            u.username.toLowerCase() ===
              username.toLowerCase()
        );

      /*
        IMPORTANT:

        No user information is returned when
        authentication fails.
      */

      if (!user) {
        logEvent(
          'AUTH_FAILURE',
          `Invalid login attempt`
        );

        return res.status(401).json({
          error:
            'Incorrect username or password.'
        });
      }

      /*
        Production security:

        Only bcrypt passwords are accepted.

        Plaintext passwords are NOT supported.
      */

      const isBcryptHash =
        typeof user.password === 'string' &&
        (
          user.password.startsWith('$2b$') ||
          user.password.startsWith('$2a$') ||
          user.password.startsWith('$2y$')
        );

      if (!isBcryptHash) {
        logEvent(
          'AUTH_FAILURE',
          `Invalid password configuration for account`
        );

        return res.status(401).json({
          error:
            'Incorrect username or password.'
        });
      }

      const passwordValid =
        await bcrypt.compare(
          password,
          user.password
        );

      if (!passwordValid) {
        logEvent(
          'AUTH_FAILURE',
          `Invalid login attempt`
        );

        return res.status(401).json({
          error:
            'Incorrect username or password.'
        });
      }

      /*
        JWT

        Keep only the information required
        by the admin application.
      */

      const token =
        jwt.sign(
          {
            username:
              user.username,

            name:
              user.name,

            role:
              user.role,

            permissions:
              Array.isArray(user.permissions)
                ? user.permissions
                : []
          },

          JWT_SECRET,

          {
            expiresIn: '24h',

            issuer:
              'the-upgrade-admin',

            audience:
              'the-upgrade-admin'
          }
        );

      /*
        HTTP-only secure cookie
      */

      res.cookie(
        'token',
        token,
        {
          httpOnly: true,

          secure: isProduction,

          sameSite: 'strict',

          path: '/',

          maxAge:
            24 * 60 * 60 * 1000
        }
      );

      logEvent(
        'AUTH_SUCCESS',
        `User "${user.username}" logged in successfully`
      );

      return res.json({
        username:
          user.username,

        name:
          user.name,

        role:
          user.role,

        permissions:
          Array.isArray(user.permissions)
            ? user.permissions
            : []
      });

    } catch (err) {
      console.error(
        'Login route error:',
        err
      );

      return res.status(500).json({
        error:
          'Internal server login error.'
      });
    }
  }
);

/* ============================================================
   LOGOUT
============================================================ */

app.post(
  '/api/auth/logout',
  (req, res) => {
    res.clearCookie(
      'token',
      {
        httpOnly: true,

        secure: isProduction,

        sameSite: 'strict',

        path: '/'
      }
    );

    return res.status(200).json({
      success: true,

      message:
        'Logged out successfully.'
    });
  }
);

/* ============================================================
   AUTH STATUS
============================================================ */

app.get(
  '/api/auth/status',

  authenticateToken,

  (req, res) => {
    return res.json({
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

/* ============================================================
   ADMIN METRICS
============================================================ */

app.get(
  '/api/admin/metrics',

  authenticateToken,

  requirePermission(
    'metrics:read'
  ),

  async (req, res) => {
    try {
      const subs =
        await getSubscribers();

      const metrics = {
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
      };

      return res.json(
        metrics
      );
    } catch (err) {
      return res.status(500).json({
        error:
          'Failed to compile metrics.'
      });
    }
  }
);

/* ============================================================
   ADMIN SUBSCRIBERS
============================================================ */

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

      return res.json(subs);
    } catch (err) {
      return res.status(500).json({
        error:
          'Failed to read subscribers registry.'
      });
    }
  }
);

/*
  ADD SUBSCRIBER
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
          (sub) =>
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
        `Manually registered subscriber by admin`
      );

      const updatedSubs =
        await getSubscribers();

      return res.status(200).json(
        updatedSubs
      );
    } catch (err) {
      return res.status(500).json({
        error:
          'Failed to write subscriber data.'
      });
    }
  }
);

/*
  DELETE SUBSCRIBER
*/

app.delete(
  '/api/admin/subscribers/:email',

  authenticateToken,

  requirePermission(
    'subscribers:write'
  ),

  async (req, res) => {
    const email =
      req.params.email;

    try {
      const deleted =
        await deleteSubscriber(
          email
        );

      if (!deleted) {
        return res.status(404).json({
          error:
            'Email not found in registry.'
        });
      }

      logEvent(
        'SUBSCRIBER_DELETE',
        `Removed subscriber by admin`
      );

      const updatedSubs =
        await getSubscribers();

      return res.status(200).json(
        updatedSubs
      );
    } catch (err) {
      return res.status(500).json({
        error:
          'Failed to modify registry database.'
      });
    }
  }
);

/* ============================================================
   CREATE NEWSLETTER ISSUE
============================================================ */

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
    .notEmpty()
    .escape(),

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
              issues[0].id,
              10
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
            content.split(/\s+/).length /
              180
          )
        )} min read`;

      const newIssue = {
        id: nextId,

        number:
          `#${nextId}`,

        title,

        category,

        excerpt,

        date:
          dateStr,

        readTime,

        question,

        content
      };

      await addIssue(
        newIssue
      );

      logEvent(
        'CREATE_ISSUE',
        `Creator published Issue #${nextId}: "${title}"`
      );

      /*
        BROADCAST NEWSLETTER
      */

      if (
        process.env.RESEND_API_KEY
      ) {
        try {
          const resend =
            new Resend(
              process.env.RESEND_API_KEY
            );

          const subscribers =
            await getSubscribers();

          for (
            const sub of subscribers
          ) {
            await resend.emails.send({
              from:
                'The Upgrade <newsletter@theupgrade.co.ke>',

              to:
                sub.email,

              subject:
                `The Upgrade — ${title}`,

              html: `
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:3px solid #000;padding:30px;background:#f5f0e8;color:#0a0a0a;">

                  <h1 style="border-bottom:2px solid #000;padding-bottom:12px;">
                    The Upgrade
                  </h1>

                  <div style="font-size:12px;margin-bottom:20px;">
                    Issue ${newIssue.number}
                    &middot;
                    ${category}
                    &middot;
                    ${dateStr}
                  </div>

                  <h2>
                    ${title}
                  </h2>

                  <div style="line-height:1.6;font-size:16px;margin-bottom:30px;">
                    ${content}
                  </div>

                  <div style="border:2px dashed #000;padding:20px;background:#fff;margin-bottom:30px;">

                    <strong>
                      One Honest Question to Sit With
                    </strong>

                    <p>
                      ${question}
                    </p>

                  </div>

                  <hr>

                  <small>
                    You are receiving this because you subscribed
                    to The Upgrade.
                  </small>

                </div>
              `
            });

            logEvent(
              'BROADCAST_SENT',
              `Emailed Issue #${nextId}`
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
          `Mock broadcast for Issue #${nextId}`
        );
      }

      return res.status(200).json(
        newIssue
      );

    } catch (err) {
      console.error(
        'Issue publishing error:',
        err
      );

      return res.status(500).json({
        error:
          'Failed to publish new issue to database.'
      });
    }
  }
);

/* ============================================================
   ACTIVITY LOG
============================================================ */

app.get(
  '/api/admin/activity-log',

  authenticateToken,

  requirePermission(
    'logs:read'
  ),

  async (req, res) => {
    try {
      const logs =
        await getActivityLogs();

      return res.json(logs);
    } catch (err) {
      return res.status(500).json({
        error:
          'Failed to access logs.'
      });
    }
  }
);

/* ============================================================
   SUPERADMIN
============================================================ */

function requireSuperadmin(
  req,
  res,
  next
) {
  if (
    !req.user ||
    req.user.role !==
      'superadmin'
  ) {
    return res.status(403).json({
      error:
        'Forbidden. Superadmin role clearance required.'
    });
  }

  next();
}

/* ============================================================
   GET USERS
============================================================ */

app.get(
  '/api/admin/users',

  authenticateToken,

  requireSuperadmin,

  async (req, res) => {
    try {
      const users =
        await getCreatorUsers();

      /*
        NEVER return passwords.
      */

      const sanitized =
        users.map(
          (u) => ({
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

      return res.json(
        sanitized
      );
    } catch (err) {
      return res.status(500).json({
        error:
          'Failed to retrieve creator users.'
      });
    }
  }
);

/* ============================================================
   CREATE USER
============================================================ */

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
      min: 8,
      max: 100
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
      const users =
        await getCreatorUsers();

      if (
        users.some(
          (u) =>
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
        await bcrypt.hash(
          password,
          12
        );

      const newUser = {
        username,

        password:
          hashedPassword,

        name,

        role,

        permissions
      };

      await addCreatorUser(
        newUser
      );

      logEvent(
        'USER_ADD',
        `Superadmin created user "${username}" with role "${role}"`
      );

      return res.json({
        success: true
      });

    } catch (err) {
      console.error(
        'Create user error:',
        err
      );

      return res.status(500).json({
        error:
          'Failed to create user account.'
      });
    }
  }
);

/* ============================================================
   UPDATE USER
============================================================ */

app.put(
  '/api/admin/users/:username',

  authenticateToken,

  requireSuperadmin,

  body('password')
    .optional()
    .isLength({
      min: 8,
      max: 100
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

    const username =
      req.params.username;

    const {
      password,
      name,
      role
    } = req.body;

    try {
      const users =
        await getCreatorUsers();

      const user =
        users.find(
          (u) =>
            u.username.toLowerCase() ===
            username.toLowerCase()
        );

      if (!user) {
        return res.status(404).json({
          error:
            'User not found.'
        });
      }

      /*
        Prevent current superadmin
        from removing their own role.
      */

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

      const updatedUser = {
        password:
          password
            ? await bcrypt.hash(
                password,
                12
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
        `Superadmin updated user "${username}"`
      );

      return res.json({
        success: true
      });

    } catch (err) {
      console.error(
        'Update user error:',
        err
      );

      return res.status(500).json({
        error:
          'Failed to update user account.'
      });
    }
  }
);

/* ============================================================
   DELETE USER
============================================================ */

app.delete(
  '/api/admin/users/:username',

  authenticateToken,

  requireSuperadmin,

  async (req, res) => {
    const username =
      req.params.username;

    try {
      /*
        Prevent self-deletion.
      */

      if (
        req.user.username.toLowerCase() ===
        username.toLowerCase()
      ) {
        return res.status(400).json({
          error:
            'Self-deletion is forbidden. You cannot delete your own active session.'
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
        `Superadmin deleted creator user "${username}"`
      );

      return res.json({
        success: true
      });

    } catch (err) {
      return res.status(500).json({
        error:
          'Failed to delete user account.'
      });
    }
  }
);

/* ============================================================
   404 API HANDLER
============================================================ */

app.use(
  '/api',
  (req, res) => {
    return res.status(404).json({
      error:
        'API endpoint not found.'
    });
  }
);

/* ============================================================
   FRONTEND FALLBACK
============================================================ */

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

/* ============================================================
   ERROR HANDLER
============================================================ */

app.use(
  (err, req, res, next) => {
    console.error(
      'Unhandled server error:',
      err
    );

    if (
      res.headersSent
    ) {
      return next(err);
    }

    return res.status(500).json({
      error:
        'Internal server error.'
    });
  }
);

/* ============================================================
   EXPORT
============================================================ */

export default app;

/* ============================================================
   LOCAL SERVER
============================================================ */

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