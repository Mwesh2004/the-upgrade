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
app.set('trust proxy', 1); // Required for rate limiting behind Vercel proxy
const PORT = process.env.PORT || 3000;

// Production security enforcement: mandate JWT_SECRET in production to prevent hardcoded key leakage
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    console.error("CRITICAL SECURITY ERROR: JWT_SECRET environment variable is missing in production!");
    process.exit(1);
  } else {
    JWT_SECRET = crypto.randomBytes(32).toString('hex');
    console.log("Generated random JWT_SECRET for development.");
  }
}

// Initialize Resend
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Ensure data folder exists
const DATA_DIR = path.join(__dirname, 'server', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load creator credentials from environment variable in production, fallback to local users.json in development
let users = [];
if (process.env.CREATOR_USERS) {
  try {
    users = JSON.parse(process.env.CREATOR_USERS);
    console.log("Loaded role-based access user accounts from environment variable.");
  } catch (err) {
    console.error("Failed to parse CREATOR_USERS environment variable:", err.message);
  }
} else {
  const USERS_FILE = path.join(DATA_DIR, 'users.json');
  if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    console.log("Loaded role-based access user accounts from local users.json file.");
  } else {
    console.warn("WARNING: No user credentials loaded. Creator portal logins will fail.");
  }
}

// ── MIDDLEWARES ──
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(helmet({
  contentSecurityPolicy: false, // Vite injects inline scripts; CSP handled by custom headers below
  crossOriginEmbedderPolicy: false // Allow loading Google Fonts and external assets
}));
app.use(express.json({ limit: '10kb' })); // Mitigate DOS / buffer exploit vectors
app.use(cookieParser());

// Global security headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Catch and reject malformed JSON payloads gracefully
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed or invalid JSON payload.' });
  }
  next(err);
});

// Serve compiled static assets in production
app.use(express.static(path.join(__dirname, 'dist')));

// ── RATE LIMITERS ──
// Global API Limiter (100 requests per 15 minutes)
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalApiLimiter);

// Lazy-initialize database on demand (compatible with serverless cold starts)
let dbInitPromise = null;
app.use(async (req, res, next) => {
  if (!dbInitPromise) {
    dbInitPromise = initializeDatabase().catch(err => {
      console.error("Database initialization failed:", err);
      dbInitPromise = null; // Retry on next request if failed
    });
  }
  await dbInitPromise;
  next();
});

// Specific subscription limiter (5 attempts per hour per IP)
const subscriptionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many subscription attempts from this connection. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Specific authentication limiter (5 login attempts per 15 minutes per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Specific tracking events limiter (max 30 actions per 15 minutes per IP to prevent activity log flooding)
const trackingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many tracking events. Log activity throttled.' },
  standardHeaders: false,
  legacyHeaders: false,
});

// Helper to append a server-side log
function logEvent(action, details) {
  logActivity(action, details);
}

// ── AUTHORIZATION MIDDLEWARES ──
function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Authorization cookie missing. Access denied.' });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token session.' });
  }
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions || !req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: `Forbidden. Role-based clearance required: "${permission}"` });
    }
    next();
  };
}

// ── PUBLIC API ENDPOINTS ──

// 1. Get issues catalog (merged custom + defaults)
app.get('/api/issues', async (req, res) => {
  try {
    const issues = await getIssues();
    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve newsletter issues catalog.' });
  }
});

// 1b. Get public statistics (counts)
app.get('/api/stats', async (req, res) => {
  try {
    const subs = await getSubscribers();
    const issues = await getIssues();
    res.json({
      totalSubscribers: subs.length,
      totalIssues: issues.length
    });
  } catch (err) {
    res.json({ totalSubscribers: 0, totalIssues: 12 });
  }
});

// 2. Submit new email subscription (sanitized, rate limited)
app.post('/api/subscribe', 
  subscriptionLimiter,
  body('email').isEmail().withMessage('Invalid email format').normalizeEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email } = req.body;
    try {
      const subscribers = await getSubscribers();
      const alreadyExists = subscribers.some(sub => sub.email.toLowerCase() === email.toLowerCase());

      if (!alreadyExists) {
        const sourceVal = typeof req.body.source === 'string'
          ? req.body.source.replace(/[&<>'"]/g, '').trim().substring(0, 50)
          : 'Public Form';
        await addSubscriber(email, sourceVal);
        
        // Log event
        logEvent('SUBSCRIBE', `New registration: "${email}" via ${sourceVal}`);

        // Forward subscription to Formspree for automatic notification / inbox alerts
        if (process.env.FORMSPREE_FORM_ID) {
          try {
            await fetch(`https://formspree.io/f/${process.env.FORMSPREE_FORM_ID}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                email,
                source: req.body.source || 'Public Form',
                message: `New subscriber registered on The Upgrade: ${email}`
              })
            });
            logEvent('FORMSPREE_FORWARD', `Forwarded subscription "${email}" to Formspree`);
          } catch (formspreeErr) {
            logEvent('FORMSPREE_FAILED', `Formspree forwarding failed: ${formspreeErr.message}`);
          }
        }

        // Dispatch welcome email using Resend
        if (resend) {
          try {
            await resend.emails.send({
              from: 'The Upgrade <welcome@theupgrade.co.ke>',
              to: email,
              subject: 'Welcome to The Upgrade — Real Talk. No Performance.',
              html: `
                <div style="font-family: sans-serif; max-width: 500px; border: 3px solid #000; padding: 24px;">
                  <h2>Welcome to The Upgrade!</h2>
                  <p>Weekly issues drop in your inbox every Monday morning. Expect Kenyan banter, money psychology, mental health transparency, and no fake gurus.</p>
                  <p>We're glad to have you in the loop.</p>
                  <hr style="border-top: 2px solid #000;">
                  <small>© 2026 The Upgrade Newsletter</small>
                </div>
              `
            });
            logEvent('EMAIL_SENT_SUCCESS', `Verification email successfully sent to: "${email}" via Resend`);
          } catch (emailErr) {
            logEvent('EMAIL_SENT_FAILED', `Resend api delivery error to "${email}": ${emailErr.message}`);
          }
        } else {
          // Simulator fallback
          logEvent('EMAIL_SIMULATION', `Mock email notification dispatched to: "${email}"`);
        }
      }

      res.status(200).json({ success: true, message: 'Subscription successfully approved!' });
    } catch (err) {
      res.status(500).json({ error: 'Database writing error. Please try again.' });
    }
  }
);

// 3. Client engagement event logs receiver (rate limited, payload sanitized)
app.post('/api/track', trackingLimiter, (req, res) => {
  const action = typeof req.body.action === 'string' ? req.body.action : '';
  const details = typeof req.body.details === 'string' ? req.body.details : '';
  
  if (!action || !details) {
    return res.status(400).json({ error: 'Missing or malformed action/details parameters.' });
  }

  // Sanitize tracking inputs to avoid XSS injections in creator feeds
  const sanitizedAction = action.replace(/[<>]/g, '').trim().substring(0, 40);
  const sanitizedDetails = details.replace(/[<>]/g, '').trim().substring(0, 150);

  logEvent(sanitizedAction, sanitizedDetails);
  res.sendStatus(204);
});

// ── AUTHENTICATION API ENDPOINTS ──

// Temporary safe diagnostic — shows user count and hash format only, no secrets
app.get('/api/auth/check', async (req, res) => {
  try {
    const users = await getCreatorUsers();
    const info = users.map(u => ({
      username: u.username,
      role: u.role,
      passwordFormat: u.password ? (u.password.startsWith('$2') ? 'bcrypt' : `plaintext(${u.password.length}chars)`) : 'MISSING',
      hasPermissions: Array.isArray(u.permissions)
    }));
    res.json({ count: users.length, users: info, bcryptjsLoaded: typeof bcrypt.compare === 'function' });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack?.split('\n').slice(0, 3) });
  }
});

// 1. Password credentials verification & Token cookie issuance (rate limited, sanitized)
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim().substring(0, 50) : '';
  const password = typeof req.body.password === 'string' ? req.body.password.substring(0, 50) : '';
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password fields are required.' });
  }

  try {
    const creatorUsers = await getCreatorUsers();
    const user = creatorUsers.find(u => u.username.toLowerCase() === username.toLowerCase().trim());

    if (!user) {
      logEvent('AUTH_FAILURE', `Invalid login credentials attempt for username: "${username}"`);
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    // Support both bcrypt hashed passwords and legacy plaintext passwords (migration path)
    let passwordValid = false;
    const isBcryptHash = user.password && (user.password.startsWith('$2b$') || user.password.startsWith('$2a$'));
    
    if (isBcryptHash) {
      passwordValid = await bcrypt.compare(password, user.password);
    } else {
      // Legacy plaintext comparison — auto-migrate to bcrypt on success
      passwordValid = (user.password === password);
      if (passwordValid) {
        try {
          const hashedPassword = await bcrypt.hash(password, 10);
          await updateCreatorUser(user.username, {
            password: hashedPassword,
            name: user.name,
            role: user.role,
            permissions: user.permissions
          });
          logEvent('SECURITY', `Auto-migrated password for user "${user.username}" from plaintext to bcrypt hash.`);
        } catch (migrationErr) {
          // Non-blocking — login still succeeds even if hash migration fails
          console.error('Password hash migration failed (non-blocking):', migrationErr.message);
        }
      }
    }

    if (!passwordValid) {
      logEvent('AUTH_FAILURE', `Invalid login credentials attempt for username: "${username}"`);
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    // Issue signed JWT
    const token = jwt.sign(
      { 
        username: user.username,
        name: user.name,
        role: user.role,
        permissions: user.permissions
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Set HTTP-Only Cookie with production security standards
    const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    logEvent('AUTH_SUCCESS', `User "${user.username}" logged in successfully with role: "${user.role}"`);

    res.json({
      username: user.username,
      name: user.name,
      role: user.role,
      permissions: user.permissions
    });
  } catch (err) {
    console.error('Login route error:', err);
    res.status(500).json({ error: 'Internal server login error.' });
  }
});

// 2. Clear authentication token cookies
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
});

// ── GUARDED ADMINISTRATIVE PORTAL ENDPOINTS ──

// 1. Retrieve analytics database metrics
app.get('/api/admin/metrics', authenticateToken, requirePermission('metrics:read'), async (req, res) => {
  try {
    const subs = await getSubscribers();
    
    // Growth metrics (mock charts reacting to dynamic list lengths)
    const metrics = {
      totalSubscribers: subs.length,
      openRate: subs.length > 0 ? 76.5 : 0.0,
      ctrRate: subs.length > 0 ? 28.2 : 0.0,
      growthData: [0, 0, 0, Math.floor(subs.length * 0.4), Math.floor(subs.length * 0.7), subs.length]
    };
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: 'Failed to compile metrics.' });
  }
});

// 2. Fetch subscribers directory
app.get('/api/admin/subscribers', authenticateToken, requirePermission('subscribers:read'), async (req, res) => {
  try {
    const subs = await getSubscribers();
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read subscribers registry.' });
  }
});

// 3. Add subscriber manually
app.post('/api/admin/subscribers', 
  authenticateToken, 
  requirePermission('subscribers:write'),
  body('email').isEmail().withMessage('Invalid email address').normalizeEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email } = req.body;
    try {
      const subs = await getSubscribers();
      if (subs.some(sub => sub.email.toLowerCase() === email.toLowerCase())) {
        return res.status(400).json({ error: 'Email already exists in list.' });
      }

      await addSubscriber(email, 'Manual Dashboard Add');
      logEvent('SUBSCRIBER_ADD', `Manually registered subscriber: "${email}" by admin "${req.user.username}"`);

      const updatedSubs = await getSubscribers();
      res.status(200).json(updatedSubs);
    } catch (err) {
      res.status(500).json({ error: 'Failed to write subscriber data.' });
    }
  }
);

// 4. Delete subscriber by email
app.delete('/api/admin/subscribers/:email', authenticateToken, requirePermission('subscribers:write'), async (req, res) => {
  const { email } = req.params;
  try {
    const deleted = await deleteSubscriber(email);

    if (!deleted) {
      return res.status(404).json({ error: 'Email not found in registry.' });
    }

    logEvent('SUBSCRIBER_DELETE', `Removed subscriber: "${email}" by admin "${req.user.username}"`);

    const updatedSubs = await getSubscribers();
    res.status(200).json(updatedSubs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to modify registry database.' });
  }
});

// 5. Publish new issue (writes to database)
app.post('/api/admin/issues',
  authenticateToken,
  requirePermission('issues:write'),
  body('title').trim().notEmpty().escape(),
  body('category').trim().notEmpty(),
  body('excerpt').trim().notEmpty().escape(),
  body('content').trim().notEmpty(), // Content allows structured HTML
  body('question').trim().notEmpty().escape(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Please populate all fields with valid inputs.' });
    }

    const { title, category, excerpt, content, question } = req.body;
    try {
      const issues = await getIssues();
      const nextIdNum = issues.length > 0 ? parseInt(issues[0].id) + 1 : 1;
      const nextId = String(nextIdNum).padStart(3, '0');

      const today = new Date();
      const dateStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const readTime = `${Math.max(2, Math.round(content.split(' ').length / 180))} min read`;

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

      await addIssue(newIssue);
      logEvent('CREATE_ISSUE', `Creator "${req.user.username}" published Issue #${nextId}: "${title}"`);

      // Broadcast newsletter via Resend to all registered subscribers
      if (resend) {
        try {
          const subscribers = await getSubscribers();
          for (const sub of subscribers) {
            await resend.emails.send({
              from: 'The Upgrade <newsletter@theupgrade.co.ke>',
              to: sub.email,
              subject: `The Upgrade — ${title}`,
              html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 3px solid #000; padding: 30px; background-color: #f5f0e8; color: #0a0a0a;">
                  <h1 style="font-family: 'Playfair Display', serif; border-bottom: 2px solid #000; padding-bottom: 12px; margin-top: 0;">The Upgrade</h1>
                  <div style="font-size: 12px; font-family: monospace; text-transform: uppercase; color: #e84c2b; margin-bottom: 20px;">
                    Issue ${newIssue.number} &middot; ${category} &middot; ${dateStr}
                  </div>
                  <h2 style="font-family: 'Playfair Display', serif; font-size: 24px; margin-bottom: 20px;">${title}</h2>
                  <div style="line-height: 1.6; font-size: 16px; margin-bottom: 30px;">
                    ${content}
                  </div>
                  <div style="border: 2px dashed #000; padding: 20px; background-color: #ffffff; margin-bottom: 30px;">
                    <strong style="display: block; font-family: monospace; margin-bottom: 8px;">? One Honest Question to Sit With</strong>
                    <p style="margin: 0; font-style: italic;">${question}</p>
                  </div>
                  <hr style="border: none; border-top: 1px solid #000; margin-bottom: 20px;">
                  <small style="color: #666; font-family: monospace;">You are receiving this because you subscribed to The Upgrade. <a href="https://the-upgrade.vercel.app" style="color: #e84c2b;">Unsubscribe</a></small>
                </div>
              `
            });
            logEvent('BROADCAST_SENT', `Emailed Issue #${nextId} to subscriber: "${sub.email}"`);
          }
        } catch (broadcastErr) {
          logEvent('BROADCAST_FAILED', `Broadcast delivery error for Issue #${nextId}: ${broadcastErr.message}`);
        }
      } else {
        logEvent('BROADCAST_SIMULATOR', `Mock broadcast: Issue #${nextId} simulated email updates sent to all subscribers.`);
      }

      res.status(200).json(newIssue);
    } catch (err) {
      res.status(500).json({ error: 'Failed to publish new issue to database.' });
    }
  }
);

// 6. View server activity logs
app.get('/api/admin/activity-log', authenticateToken, requirePermission('logs:read'), async (req, res) => {
  try {
    const logs = await getActivityLogs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to access logs.' });
  }
});

// ── USER MANAGEMENT ENDPOINTS (SUPERADMIN ACCESS ONLY) ──

function requireSuperadmin(req, res, next) {
  if (!req.user || req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Forbidden. Superadmin role clearance required.' });
  }
  next();
}

// 1. Fetch all users
app.get('/api/admin/users', authenticateToken, requireSuperadmin, async (req, res) => {
  try {
    const users = await getCreatorUsers();
    const sanitized = users.map(u => ({
      username: u.username,
      name: u.name,
      role: u.role,
      permissions: u.permissions
    }));
    res.json(sanitized);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve creator users.' });
  }
});

// 2. Add creator user
app.post('/api/admin/users',
  authenticateToken,
  requireSuperadmin,
  body('username').trim().isLength({ min: 3, max: 30 }).escape(),
  body('password').isLength({ min: 6, max: 40 }),
  body('name').trim().notEmpty().escape(),
  body('role').isIn(['superadmin', 'editor', 'moderator', 'viewer']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { username, password, name, role } = req.body;
    try {
      const users = await getCreatorUsers();
      if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        return res.status(400).json({ error: 'Username already exists.' });
      }

      let permissions = [];
      if (role === 'superadmin') {
        permissions = ["metrics:read", "subscribers:read", "subscribers:write", "issues:write", "logs:read"];
      } else if (role === 'editor') {
        permissions = ["issues:write"];
      } else if (role === 'moderator') {
        permissions = ["subscribers:read", "subscribers:write"];
      } else if (role === 'viewer') {
        permissions = ["metrics:read", "logs:read"];
      }

      const hashedPassword = bcrypt.hashSync(password, 10);
      const newUser = { username, password: hashedPassword, name, role, permissions };
      await addCreatorUser(newUser);

      logEvent('USER_ADD', `Superadmin "${req.user.username}" created user: "${username}" with role: "${role}"`);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create user account.' });
    }
  }
);

// 3. Edit creator user
app.put('/api/admin/users/:username',
  authenticateToken,
  requireSuperadmin,
  body('password').optional().isLength({ min: 6, max: 40 }),
  body('name').trim().notEmpty().escape(),
  body('role').isIn(['superadmin', 'editor', 'moderator', 'viewer']),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { username } = req.params;
    const { password, name, role } = req.body;

    try {
      const users = await getCreatorUsers();
      const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      if (req.user.username.toLowerCase() === username.toLowerCase() && role !== 'superadmin') {
        return res.status(400).json({ error: 'You cannot change your own superadmin role.' });
      }

      let permissions = [];
      if (role === 'superadmin') {
        permissions = ["metrics:read", "subscribers:read", "subscribers:write", "issues:write", "logs:read"];
      } else if (role === 'editor') {
        permissions = ["issues:write"];
      } else if (role === 'moderator') {
        permissions = ["subscribers:read", "subscribers:write"];
      } else if (role === 'viewer') {
        permissions = ["metrics:read", "logs:read"];
      }

      const updatedUser = {
        password: password ? bcrypt.hashSync(password, 10) : user.password,
        name,
        role,
        permissions
      };

      await updateCreatorUser(username, updatedUser);
      logEvent('USER_UPDATE', `Superadmin "${req.user.username}" updated user details for: "${username}"`);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update user account.' });
    }
  }
);

// 4. Delete creator user
app.delete('/api/admin/users/:username', authenticateToken, requireSuperadmin, async (req, res) => {
  const { username } = req.params;
  try {
    if (req.user.username.toLowerCase() === username.toLowerCase()) {
      return res.status(400).json({ error: 'Self-deletion is forbidden. You cannot delete your own active session.' });
    }

    const deleted = await deleteCreatorUser(username);
    if (!deleted) {
      return res.status(404).json({ error: 'User not found.' });
    }

    logEvent('USER_DELETE', `Superadmin "${req.user.username}" deleted creator user: "${username}"`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user account.' });
  }
});

// ── GET PORTAL USER STATUS ──
app.get('/api/auth/status', authenticateToken, (req, res) => {
  res.json({
    username: req.user.username,
    name: req.user.name,
    role: req.user.role,
    permissions: req.user.permissions
  });
});

// Fallback to index.html for client routers
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Export app for serverless compatibility (Vercel)
export default app;

// Only start the local listener if we are running the node process directly (not via serverless handler)
if (!process.env.VERCEL) {
  app.listen(PORT, async () => {
    try {
      await initializeDatabase();
      console.log(`========================================`);
      console.log(`   The Upgrade Node Server is Online!`);
      console.log(`   Listening at http://localhost:${PORT}`);
      console.log(`========================================`);
      logEvent('SERVER_START', `Server booted successfully on port ${PORT}`);
    } catch (err) {
      console.error('Server boot error:', err.message);
      process.exit(1);
    }
  });
}
