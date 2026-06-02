const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Freeman <verify@freemanapp.online>';
const PRIVACY_CONTACT_EMAIL = process.env.PRIVACY_CONTACT_EMAIL || 'support@freemanapp.online';
const AUTH_CONTINUE_URL = process.env.AUTH_CONTINUE_URL || 'https://www.freemanapp.online/';
const APP_OPEN_URL = process.env.APP_OPEN_URL || 'freeman://login-callback';
const ADMOB_PUBLISHER_ID = process.env.ADMOB_PUBLISHER_ID || 'pub-4447142275737847';
const EMAIL_VERIFY_SECRET = process.env.EMAIL_VERIFY_SECRET || RESEND_API_KEY || OPENROUTER_API_KEY || 'freeman-dev-email-secret';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODELS = [
  'openrouter/free',
  'google/gemma-4-26b-a4b-it:free',
  'openai/gpt-oss-20b:free',
  'minimax/minimax-m2.5:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
];
const MODEL_TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS || 9000);
const AI_OVERALL_TIMEOUT_MS = Number(process.env.AI_OVERALL_TIMEOUT_MS || 28000);
const MAX_REQUESTS_PER_MIN = Number(process.env.MAX_REQUESTS_PER_MIN || 20);
const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 2000;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const DISABLED_MODELS = new Set([
  'deepseek/deepseek-v4-flash:free',
  'inclusionai/ring-2.6-1t:free',
]);
const PREFERRED_MODEL = 'openrouter/free';

function resolveModels() {
  const configuredModels = (process.env.OPENROUTER_MODELS || DEFAULT_MODELS.join(','))
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)
    .filter((model) => !DISABLED_MODELS.has(model));

  const orderedModels = [
    PREFERRED_MODEL,
    ...configuredModels,
    ...DEFAULT_MODELS,
  ].filter((model) => !DISABLED_MODELS.has(model));

  return [...new Set(orderedModels)];
}

const models = resolveModels();

const recoveryScope =
  'Freeman AI only helps users beat porn/sexual-content addiction, manage urges, recover after relapse, build healthy routines, improve accountability, and protect their streak. In this recovery context, "gooning" means masturbating with heavy porn consumption. Refuse unrelated topics briefly and redirect to recovery support.';

const therapistStyle =
  'Use a professional, therapist-like recovery-coach style without claiming to be a licensed therapist or giving medical diagnosis. Start by reflecting the user\'s emotion or situation in one calm sentence. Then give 1-3 practical steps using evidence-informed methods like urge surfing, stimulus control, grounding, CBT-style thought reframing, relapse-chain review, and implementation intentions. Keep the tone warm, steady, non-shaming, and adult. Avoid hype, lectures, religious framing, moral judgment, and long essays. End with one focused question or a simple next action.';

const requestLog = new Map();
let firebaseAdmin;

function sendJson(res, status, body, requestId) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET, HEAD',
    'Cache-Control': 'no-store',
    ...(requestId ? { 'X-Request-Id': requestId } : {}),
  });
  res.end(JSON.stringify({ ...body, requestId }));
}

function sendJsonHead(res, status, requestId) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET, HEAD',
    'Cache-Control': 'no-store',
    ...(requestId ? { 'X-Request-Id': requestId } : {}),
  });
  res.end();
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': status >= 400 ? 'no-store' : 'public, max-age=300',
  });
  res.end(html);
}

function sendHtmlHead(res, status) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': status >= 400 ? 'no-store' : 'public, max-age=300',
  });
  res.end();
}

function sendTextHead(res, status) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': status >= 400 ? 'no-store' : 'public, max-age=300',
  });
  res.end();
}

function legalPage({ title, updated, children }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} | Freeman</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #07090f;
        color: #e5edf5;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.65;
      }
      header {
        padding: 44px 20px 22px;
        border-bottom: 1px solid #1b2433;
        background: radial-gradient(circle at top, #123023 0%, #07090f 52%);
      }
      main, .inner {
        width: min(880px, 100%);
        margin: 0 auto;
      }
      main { padding: 28px 20px 56px; }
      .eyebrow {
        color: #67c093;
        font-weight: 900;
        letter-spacing: 1.8px;
        text-transform: uppercase;
        font-size: 12px;
      }
      h1 {
        margin: 10px 0 8px;
        font-size: clamp(34px, 7vw, 58px);
        line-height: 1;
      }
      h2 {
        margin: 34px 0 10px;
        color: #f8fafc;
        font-size: 23px;
        line-height: 1.18;
      }
      h3 {
        margin: 24px 0 8px;
        color: #dbeafe;
        font-size: 17px;
      }
      p, li { color: #b8c4d4; font-size: 15px; }
      a { color: #72d19f; font-weight: 800; }
      ul { padding-left: 22px; }
      .card {
        border: 1px solid #1f2b3d;
        border-radius: 22px;
        background: linear-gradient(155deg, #0e1420, #0a0e16);
        padding: 20px;
        margin: 20px 0;
      }
      .muted { color: #8fa0b5; }
      .updated { color: #8fa0b5; margin: 0; }
      .nav {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }
      .nav a {
        border: 1px solid #263547;
        border-radius: 999px;
        padding: 8px 12px;
        color: #dbeafe;
        text-decoration: none;
        background: #101827;
      }
      label {
        display: block;
        color: #dbeafe;
        font-weight: 800;
        margin: 14px 0 6px;
      }
      input, textarea {
        width: 100%;
        border: 1px solid #273449;
        border-radius: 14px;
        background: #090f18;
        color: #f8fafc;
        padding: 12px 14px;
        font: inherit;
      }
      textarea { min-height: 120px; resize: vertical; }
      button {
        margin-top: 16px;
        border: 0;
        border-radius: 16px;
        padding: 13px 18px;
        background: #2f7d55;
        color: #fff;
        font-weight: 900;
        font-size: 15px;
        cursor: pointer;
      }
      footer {
        border-top: 1px solid #1b2433;
        padding: 22px 20px 34px;
        color: #8fa0b5;
      }
    </style>
  </head>
  <body>
    <header>
      <div class="inner">
        <div class="eyebrow">Freeman</div>
        <h1>${escapeHtml(title)}</h1>
        <p class="updated">Last updated: ${escapeHtml(updated)}</p>
        <nav class="nav" aria-label="Legal pages">
          <a href="/">Home</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms</a>
          <a href="/delete-account">Delete Account</a>
        </nav>
      </div>
    </header>
    <main>${children}</main>
    <footer>
      <div class="inner">Freeman support: <a href="mailto:${escapeHtml(PRIVACY_CONTACT_EMAIL)}">${escapeHtml(PRIVACY_CONTACT_EMAIL)}</a></div>
    </footer>
  </body>
</html>`;
}

function privacyPolicyPage() {
  return legalPage({
    title: 'Privacy Policy',
    updated: 'May 23, 2026',
    children: `
      <div class="card">
        <p>This Privacy Policy explains how Freeman ("Freeman", "the app", "we", "our", or "us") collects, uses, stores, and shares information when you use the Freeman mobile app, Freeman browser extension, and related backend services.</p>
        <p>The app is designed for personal recovery support from pornography and compulsive sexual-content use. Because recovery information can be sensitive, Freeman intentionally keeps detailed recovery logs on your device unless a feature clearly needs cloud processing.</p>
      </div>

      <h2>Developer and privacy contact</h2>
      <p>For privacy questions, account deletion, or data requests, contact us at <a href="mailto:${escapeHtml(PRIVACY_CONTACT_EMAIL)}">${escapeHtml(PRIVACY_CONTACT_EMAIL)}</a>.</p>

      <h2>Information Freeman collects or stores</h2>
      <h3>Account and authentication data</h3>
      <ul>
        <li>Email address, Firebase user ID, display name/username, authentication provider, and email verification status.</li>
        <li>Google sign-in profile identifiers when you choose Google sign-in.</li>
      </ul>

      <h3>Profile and onboarding data</h3>
      <ul>
        <li>Onboarding answers, selected recovery goals, motivation, risky time, risky apps/categories, accountability contact field if entered, usual sleep/check-in reminder time, plan selection, widget setup state, and content blocker guide state.</li>
        <li>Account and pairing state such as selected recovery plan, extension access, and local preference flags.</li>
      </ul>

      <h3>Recovery data stored locally on your device</h3>
      <ul>
        <li>Daily check-ins, relapse status, notes, triggers, streak state, freeze/unfreeze state, score, and relapse history are stored locally on your device for the current app design.</li>
        <li>Freeman does not intentionally upload detailed check-in notes, relapse notes, trigger text, or full recovery logs to our server by default.</li>
      </ul>

      <h3>AI assistant messages</h3>
      <ul>
        <li>Messages you send to the AI assistant are sent to Freeman's backend so the assistant can respond.</li>
        <li>The backend sends the minimum conversation content needed to an AI provider through OpenRouter. Do not enter emergency, medical, financial, legal, or highly identifying information into the chat.</li>
      </ul>

      <h3>Content blocker and VPN data</h3>
      <ul>
        <li>The Android content blocker uses a local VPN-style network interface to help filter adult domains on the device.</li>
        <li>Filtering decisions are intended to happen locally on the device. Freeman does not sell browsing history and does not use content blocker traffic for advertising.</li>
        <li>Android may show a VPN/key icon while filtering is active because the local blocker uses Android VPN APIs.</li>
      </ul>

      <h3>Browser extension data</h3>
      <ul>
        <li>The extension stores its settings locally in the browser, including custom blocked sites and pairing state.</li>
        <li>The extension checks a Firebase pairing record to confirm that your Freeman Premium account is active. The pairing record can include access code, user ID, email, username, selected plan, Premium status, and whether browser access is enabled.</li>
      </ul>

      <h3>Device, diagnostics, and service data</h3>
      <ul>
        <li>We may process IP address, request timing, backend request IDs, rate-limit counters, error messages, and basic server logs to secure and operate the service.</li>
        <li>App stores, Firebase, Google Play, Resend, Render, and OpenRouter may process technical logs according to their own policies.</li>
      </ul>

      <h2>How Freeman uses information</h2>
      <ul>
        <li>Create and secure your account.</li>
        <li>Remember onboarding, reminder, widget, content blocker, subscription, and extension pairing settings.</li>
        <li>Provide recovery tracking, streak features, local reminders, AI support, content blocker guidance, and browser extension access.</li>
        <li>Verify subscriptions and trial/paid access.</li>
        <li>Send account verification and support emails.</li>
        <li>Prevent abuse, rate-limit requests, debug errors, and improve reliability.</li>
      </ul>

      <h2>Sharing and processors</h2>
      <p>Freeman does not sell personal data. We share data only with service providers needed to run the app:</p>
      <ul>
        <li><strong>Firebase/Google:</strong> authentication, Firestore profile/pairing records, and Google sign-in.</li>
        <li><strong>Google Play:</strong> store distribution and app review.</li>
        <li><strong>OpenRouter and AI model providers:</strong> AI assistant messages needed to generate replies.</li>
        <li><strong>Resend:</strong> account verification and support email delivery.</li>
        <li><strong>Render:</strong> backend hosting and operational logs.</li>
        <li><strong>Browser stores:</strong> extension distribution if you install the extension from a browser marketplace.</li>
      </ul>

      <h2>Security</h2>
      <ul>
        <li>Freeman uses HTTPS for backend communication.</li>
        <li>Firebase Authentication manages account sign-in.</li>
        <li>Firestore security rules should restrict user profile records to authenticated users and approved extension pairing reads.</li>
        <li>Detailed recovery logs are kept locally by default to reduce cloud exposure.</li>
      </ul>

      <h2>Data retention and deletion</h2>
      <ul>
        <li>Local recovery data remains on your device until you clear app data, uninstall the app, or a future in-app deletion flow removes it.</li>
        <li>Cloud account/profile records are retained while your account is active.</li>
        <li>You can request deletion at <a href="/delete-account">/delete-account</a>. After verification, we will delete or anonymize associated Firebase profile and pairing records and, where technically possible, authentication records.</li>
        <li>Some records may be retained if required for security, fraud prevention, legal compliance, payment records, or backup integrity.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>You can avoid entering sensitive free-text notes.</li>
        <li>You can disable the content blocker at any time in the app.</li>
        <li>You can unlink or stop using the browser extension.</li>
        <li>You can request account deletion or ask privacy questions by email.</li>
      </ul>

      <h2>Children</h2>
      <p>Freeman is not intended for children under 13. If you believe a child provided personal information, contact us so we can review and delete it where appropriate.</p>

      <h2>Changes</h2>
      <p>We may update this Privacy Policy as the app changes. The "Last updated" date shows the latest version.</p>
    `,
  });
}

function termsPage() {
  return legalPage({
    title: 'Terms and Conditions',
    updated: 'May 23, 2026',
    children: `
      <div class="card">
        <p>These Terms and Conditions govern your use of Freeman, including the mobile app, browser extension, AI assistant, content blocker features, and related backend services.</p>
      </div>

      <h2>Recovery support, not medical care</h2>
      <p>Freeman is a self-help and habit recovery tool. It is not medical, psychological, legal, or emergency advice. If you may harm yourself or someone else, or you need urgent mental health support, contact local emergency services or a qualified professional immediately.</p>

      <h2>Accounts</h2>
      <ul>
        <li>You are responsible for keeping your account credentials secure.</li>
        <li>You must provide accurate account information and use an email address you control.</li>
        <li>You may request account deletion at <a href="/delete-account">/delete-account</a>.</li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not use Freeman for illegal activity, harassment, abuse, spying, or harming other users.</li>
        <li>Do not attempt to bypass, overload, reverse engineer, or attack Freeman backend services.</li>
        <li>Do not submit content to the AI assistant that you do not have the right to share.</li>
      </ul>

      <h2>AI assistant limitations</h2>
      <p>The AI assistant is designed only for recovery support related to pornography/sexual-content addiction, urges, relapse reflection, routines, and accountability. AI responses may be incomplete or wrong. You are responsible for decisions you make based on the app.</p>

      <h2>Content blocker limitations</h2>
      <p>The content blocker and browser extension are protective tools, not guarantees. No blocker can catch every website, app, phrase, image, DNS path, private browsing mode, browser, network configuration, or future bypass method. You are responsible for device settings, permissions, and supervision decisions.</p>

      <h2>Subscriptions and trials</h2>
      <ul>
        <li>Freeman is a free app and does not require a paid subscription to use the current mobile experience or browser extension pairing flow.</li>
        <li>Feature availability may change as the app evolves.</li>
      </ul>

      <h2>Availability</h2>
      <p>We may change, suspend, or discontinue features. Backend services, AI providers, browser stores, Firebase, Google Play, Resend, or network conditions may affect availability.</p>

      <h2>Disclaimer and liability</h2>
      <p>Freeman is provided "as is" to the maximum extent allowed by law. We do not promise uninterrupted service, perfect filtering, guaranteed recovery outcomes, or error-free AI responses. To the maximum extent allowed by law, Freeman is not liable for indirect, incidental, special, consequential, or punitive damages.</p>

      <h2>Contact</h2>
      <p>Questions about these Terms can be sent to <a href="mailto:${escapeHtml(PRIVACY_CONTACT_EMAIL)}">${escapeHtml(PRIVACY_CONTACT_EMAIL)}</a>.</p>
    `,
  });
}

function deleteAccountPage(message = '') {
  return legalPage({
    title: 'Delete Account',
    updated: 'May 23, 2026',
    children: `
      ${message ? `<div class="card"><p>${escapeHtml(message)}</p></div>` : ''}
      <div class="card">
        <p>Use this page to request deletion of your Freeman account and associated cloud data. This is the web deletion request option required for users who created an account in the app.</p>
      </div>

      <h2>What deletion includes</h2>
      <ul>
        <li>Firebase Authentication account where we can verify ownership.</li>
        <li>Firestore profile settings connected to your account.</li>
        <li>Browser extension pairing records connected to your account.</li>
      </ul>

      <h2>What may remain</h2>
      <ul>
        <li>Local app data on your phone until you clear app data or uninstall Freeman.</li>
        <li>Records required by law or by service providers you use may be retained for compliance or fraud prevention.</li>
        <li>Security logs or backup records retained for a limited period where required for abuse prevention or legal compliance.</li>
      </ul>

      <form method="post" action="/delete-account">
        <label for="email">Freeman account email</label>
        <input id="email" name="email" type="email" required autocomplete="email" placeholder="you@example.com" />
        <label for="details">Optional details</label>
        <textarea id="details" name="details" placeholder="Add anything that helps us verify or process the request. Do not include passwords."></textarea>
        <button type="submit">Request account deletion</button>
      </form>

      <p class="muted">You can also email <a href="mailto:${escapeHtml(PRIVACY_CONTACT_EMAIL)}">${escapeHtml(PRIVACY_CONTACT_EMAIL)}</a> from your Freeman account email. We may ask you to verify account ownership before deletion.</p>
    `,
  });
}

function getFirebaseAdmin() {
  if (firebaseAdmin !== undefined) return firebaseAdmin;

  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (serviceAccountJson) {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
        });
      } else if (projectId && clientEmail && privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
      } else {
        firebaseAdmin = null;
        return firebaseAdmin;
      }
    }
    firebaseAdmin = admin;
    return firebaseAdmin;
  } catch (error) {
    console.warn('Firebase Admin unavailable:', error.message);
    firebaseAdmin = null;
    return firebaseAdmin;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function homePage() {
  const playStoreSearchUrl = 'https://play.google.com/store/search?q=Freeman&c=apps';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Freeman</title>
    <meta name="description" content="Freeman is the official developer website for the Freeman recovery app, browser extension, and support pages." />
    <style>
      * { box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
        margin: 0;
        background:
          radial-gradient(circle at top, rgba(53, 130, 92, 0.24), transparent 26%),
          radial-gradient(circle at 20% 12%, rgba(43, 99, 72, 0.18), transparent 22%),
          linear-gradient(180deg, #06080d 0%, #070b11 54%, #05070a 100%);
        color: #eef4ee;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      a { color: inherit; }
      .wrap { width: min(1120px, calc(100% - 40px)); margin: 0 auto; }
      .topbar {
        position: sticky;
        top: 0;
        z-index: 20;
        backdrop-filter: blur(18px);
        background: rgba(6, 8, 13, 0.72);
        border-bottom: 1px solid rgba(129, 194, 152, 0.12);
      }
      .topbar .inner {
        width: min(1120px, calc(100% - 40px));
        margin: 0 auto;
        padding: 16px 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
      }
      .brand { display: flex; align-items: center; gap: 12px; text-decoration: none; }
      .mark {
        width: 42px; height: 42px; border-radius: 14px;
        background:
          radial-gradient(circle at 30% 30%, rgba(112, 216, 150, 0.36), transparent 46%),
          linear-gradient(145deg, #12291d, #0a1010);
        border: 1px solid rgba(117, 201, 142, 0.22);
        display: grid; place-items: center;
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.34);
        color: #81d9a4;
        font-weight: 900;
      }
      .brand h1 { margin: 0; font-size: 17px; line-height: 1; }
      .brand p { margin: 4px 0 0; color: #8ba59a; font-size: 12px; }
      .nav { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
      .nav a {
        text-decoration: none; color: #d8e8dd; font-size: 13px; font-weight: 800;
        padding: 10px 14px; border-radius: 999px;
        border: 1px solid rgba(129, 194, 152, 0.14);
        background: rgba(12, 16, 20, 0.9);
      }
      .hero { padding: 74px 0 34px; }
      .hero-grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 24px; align-items: stretch; }
      .panel {
        border: 1px solid rgba(129, 194, 152, 0.14);
        border-radius: 28px;
        background: linear-gradient(155deg, rgba(11, 16, 20, 0.96), rgba(8, 11, 15, 0.92));
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
      }
      .hero-copy { padding: 34px; }
      .eyebrow {
        display: inline-flex; align-items: center; gap: 8px;
        color: #8be0a7; font-size: 12px; font-weight: 900; letter-spacing: 1.9px; text-transform: uppercase;
      }
      .eyebrow::before {
        content: ""; width: 10px; height: 10px; border-radius: 999px; background: #4bbf7b;
        box-shadow: 0 0 0 6px rgba(75, 191, 123, 0.12);
      }
      h2 {
        margin: 14px 0 12px;
        font-size: clamp(42px, 7vw, 74px);
        line-height: 0.95;
        letter-spacing: -1.8px;
      }
      .lede { margin: 0; max-width: 58ch; color: #a9b6ae; font-size: 17px; line-height: 1.7; }
      .cta-row { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }
      .btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 10px;
        text-decoration: none; border-radius: 16px; padding: 14px 18px;
        font-weight: 900; font-size: 14px; border: 1px solid transparent;
      }
      .btn.primary {
        background: linear-gradient(145deg, #3fa56f, #276f4c);
        color: #f5fff8;
        box-shadow: 0 18px 42px rgba(31, 126, 75, 0.24);
      }
      .btn.secondary {
        background: rgba(15, 20, 26, 0.9);
        border-color: rgba(129, 194, 152, 0.16);
        color: #dce7df;
      }
      .mini-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 22px; }
      .mini {
        padding: 16px; border-radius: 20px;
        background: rgba(11, 15, 19, 0.9);
        border: 1px solid rgba(129, 194, 152, 0.12);
      }
      .mini strong { display: block; margin-bottom: 6px; font-size: 13px; color: #eef4ee; }
      .mini span { color: #94a99f; font-size: 13px; line-height: 1.55; }
      .side {
        padding: 22px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 18px;
      }
      .app-card {
        padding: 24px;
        border-radius: 24px;
        background:
          radial-gradient(circle at top, rgba(67, 156, 102, 0.22), transparent 42%),
          linear-gradient(180deg, rgba(13, 18, 22, 0.98), rgba(9, 12, 16, 0.94));
        border: 1px solid rgba(129, 194, 152, 0.14);
      }
      .badge {
        display: inline-flex; align-items: center; padding: 7px 10px; border-radius: 999px;
        background: rgba(63, 165, 111, 0.15); color: #95edb9; font-size: 12px; font-weight: 900;
        letter-spacing: 0.7px; text-transform: uppercase;
      }
      .stat { margin-top: 20px; display: grid; gap: 12px; }
      .stat div {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 12px 14px; border-radius: 16px;
        background: rgba(11, 15, 19, 0.82);
        border: 1px solid rgba(129, 194, 152, 0.1);
      }
      .stat span { color: #9bad9f; font-size: 13px; }
      .stat strong { color: #eef4ee; font-size: 13px; }
      .section { padding: 8px 0 56px; }
      .section h3 {
        margin: 0 0 14px; font-size: 15px; letter-spacing: 1.3px;
        text-transform: uppercase; color: #84d4a5;
      }
      .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
      .card {
        padding: 20px; border-radius: 22px;
        background: linear-gradient(180deg, rgba(12, 17, 21, 0.95), rgba(9, 12, 16, 0.95));
        border: 1px solid rgba(129, 194, 152, 0.12);
        min-height: 170px;
      }
      .card h4 { margin: 0 0 8px; font-size: 18px; color: #f0f6f1; }
      .card p { margin: 0; color: #9bad9f; font-size: 14px; line-height: 1.65; }
      .card a { display: inline-flex; margin-top: 14px; color: #95edb9; font-weight: 900; text-decoration: none; }
      .legal { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 16px; }
      .legal .card { min-height: auto; }
      .footer { padding: 24px 0 48px; color: #7f9286; font-size: 13px; }
      .footer a { color: #95edb9; text-decoration: none; font-weight: 800; }
      .footer-links { display: flex; flex-wrap: wrap; gap: 10px 18px; margin-top: 10px; }
      @media (max-width: 860px) {
        .hero-grid, .cards, .legal { grid-template-columns: 1fr; }
        .topbar .inner { align-items: flex-start; flex-direction: column; }
        .nav { justify-content: flex-start; }
        .hero { padding-top: 40px; }
        .hero-copy { padding: 24px; }
      }
    </style>
  </head>
  <body>
    <div class="topbar">
      <div class="inner">
        <a class="brand" href="/">
          <div class="mark">F</div>
          <div>
            <h1>Freeman</h1>
            <p>Recovery, blocking, and accountability</p>
          </div>
        </a>
        <nav class="nav" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#legal">Legal</a>
          <a href="${escapeHtml(playStoreSearchUrl)}" target="_blank" rel="noreferrer">Google Play</a>
        </nav>
      </div>
    </div>

    <main class="wrap">
      <section class="hero">
        <div class="hero-grid">
          <div class="panel hero-copy">
            <div class="eyebrow">Freeman</div>
            <h2>Official developer website for Freeman.</h2>
            <p class="lede">
              Freeman combines daily check-ins, urge support, content blocking, streak tracking, and a recovery-focused AI assistant in one calm interface. This site hosts the store-facing developer pages, legal pages, and app-ads.txt file AdMob crawls.
            </p>
            <div class="cta-row">
              <a class="btn primary" href="${escapeHtml(playStoreSearchUrl)}" target="_blank" rel="noreferrer">Google Play</a>
              <a class="btn secondary" href="#legal">Read the policies</a>
            </div>
            <div class="mini-grid">
              <div class="mini">
                <strong>Developer site</strong>
                <span>Store listing contact, policy pages, and app-ads.txt live here.</span>
              </div>
              <div class="mini">
                <strong>App + blocker</strong>
                <span>One flow for the phone app, browser pairing, and content protection.</span>
              </div>
            </div>
          </div>

          <aside class="panel side">
            <div class="app-card">
              <span class="badge">Simple, cool, focused</span>
              <div class="stat">
                <div><span>Daily check-ins</span><strong>On device</strong></div>
                <div><span>Content blocker</span><strong>Android VPN</strong></div>
                <div><span>AI support</span><strong>Recovery only</strong></div>
                <div><span>Extension</span><strong>Premium linked</strong></div>
              </div>
            </div>
            <p style="margin:0;color:#9bad9f;font-size:14px;line-height:1.7;">
              The public app listing is still coming soon, so the Google Play button points to Play search for now.
            </p>
          </aside>
        </div>
      </section>

      <section id="features" class="section">
        <h3>What it does</h3>
        <div class="cards">
          <div class="card">
            <h4>Check-ins that stay simple</h4>
            <p>Log your day, mark relapse or recovery, and keep the app focused on the next right step.</p>
          </div>
          <div class="card">
            <h4>Blocking and support</h4>
            <p>Use the content blocker and browser extension together when you want stronger protection across devices.</p>
          </div>
          <div class="card">
            <h4>AI assistant</h4>
            <p>Talk through urges, resets, and plans with a helper that stays on recovery and nothing else.</p>
          </div>
        </div>
      </section>

      <section id="legal" class="section">
        <h3>Legal</h3>
        <div class="legal">
          <div class="card">
            <h4>Privacy Policy</h4>
            <p>What Freeman stores, what stays local, what cloud services are used, and how your recovery data is handled.</p>
            <a href="/privacy">Open Privacy Policy</a>
          </div>
          <div class="card">
            <h4>Terms and Conditions</h4>
            <p>How Freeman works, subscription rules, AI limits, acceptable use, and account responsibilities.</p>
            <a href="/terms">Open Terms</a>
          </div>
          <div class="card">
            <h4>Delete Account</h4>
            <p>Request removal of your cloud account and pairing records through the deletion form.</p>
            <a href="/delete-account">Request deletion</a>
          </div>
        </div>
      </section>

      <div class="footer">
        Support: <a href="mailto:${escapeHtml(PRIVACY_CONTACT_EMAIL)}">${escapeHtml(PRIVACY_CONTACT_EMAIL)}</a>
        <div class="footer-links">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms</a>
          <a href="/delete-account">Delete Account</a>
          <a href="/app-ads.txt">app-ads.txt</a>
        </div>
      </div>
    </main>
  </body>
</html>`;
}

function appAdsTxt() {
  return `google.com, ${ADMOB_PUBLISHER_ID}, DIRECT, f08c47fec0942fa0\n`;
}

function robotsTxt() {
  return `User-agent: Google-adstxt\nDisallow:\n\nUser-agent: Googlebot\nDisallow:\n\nUser-agent: Mediapartners-Google\nDisallow:\n`;
}

function sitemapXml() {
  const urls = [
    '/',
    '/privacy',
    '/terms',
    '/delete-account',
    '/app-ads.txt',
    '/robots.txt',
  ];
  const now = new Date().toISOString();
  const entries = urls
    .map((path) => `  <url><loc>${escapeHtml(`https://www.freemanapp.online${path}`)}</loc><lastmod>${now}</lastmod></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function extensionSetupPage(code) {
  const safeCode = escapeHtml(code || '');
  const chromeUrl = process.env.CHROME_EXTENSION_URL || '';
  const edgeUrl = process.env.EDGE_EXTENSION_URL || '';
  const firefoxUrl = process.env.FIREFOX_EXTENSION_URL || '';

  function storeLink(label, url) {
    if (!url) {
      return `<div class="store disabled"><strong>${label}</strong><span>Store link coming soon</span></div>`;
    }
    return `<a class="store" href="${escapeHtml(url)}" target="_blank" rel="noreferrer"><strong>${label}</strong><span>Install extension</span></a>`;
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Freeman Browser Setup</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: #07090f;
        color: #f8fafc;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 28px 16px;
      }
      main {
        width: min(520px, 100%);
        border: 1px solid #1c2536;
        border-radius: 28px;
        background: linear-gradient(155deg, #0f1523, #090d16);
        padding: 28px;
        box-shadow: 0 24px 80px rgba(0,0,0,.45);
      }
      .eyebrow {
        color: #3d8f6b;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 1.6px;
        text-transform: uppercase;
      }
      h1 {
        margin: 10px 0 10px;
        font-size: 34px;
        line-height: 1.05;
      }
      p {
        margin: 0;
        color: #94a3b8;
        font-size: 15px;
        line-height: 1.6;
      }
      .code {
        margin: 22px 0;
        border: 1px solid #274132;
        background: #0a1410;
        border-radius: 18px;
        padding: 16px;
      }
      .code span {
        display: block;
        color: #94a3b8;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 1px;
        text-transform: uppercase;
        margin-bottom: 8px;
      }
      .code strong {
        display: block;
        color: #5bb98b;
        font-size: 30px;
        letter-spacing: 2px;
      }
      .stores {
        display: grid;
        gap: 10px;
        margin: 20px 0;
      }
      .store {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        text-decoration: none;
        color: #f8fafc;
        border: 1px solid #1f2937;
        border-radius: 16px;
        padding: 14px 16px;
        background: #101827;
      }
      .store span { color: #5bb98b; font-weight: 800; }
      .store.disabled { opacity: .62; }
      .steps {
        margin-top: 18px;
        padding-left: 20px;
        color: #cbd5e1;
        line-height: 1.7;
      }
      .note {
        margin-top: 18px;
        color: #64748b;
        font-size: 13px;
      }
      button {
        width: 100%;
        border: 0;
        border-radius: 16px;
        padding: 14px 16px;
        background: #3d8f6b;
        color: #07100c;
        font-size: 15px;
        font-weight: 900;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">Freeman browser protection</div>
      <h1>Connect your computer blocker</h1>
      <p>Install Freeman on this browser, open the extension settings, then paste your access code.</p>
      <div class="code">
        <span>Your access code</span>
        <strong id="accessCode">${safeCode || 'Open from the app'}</strong>
      </div>
      <button type="button" onclick="navigator.clipboard?.writeText(document.getElementById('accessCode').textContent)">Copy access code</button>
      <div class="stores">
        ${storeLink('Chrome / Brave', chromeUrl)}
        ${storeLink('Microsoft Edge', edgeUrl)}
        ${storeLink('Firefox', firefoxUrl)}
      </div>
      <ol class="steps">
        <li>Install the Freeman extension for your browser.</li>
        <li>Open the extension popup, then open Settings.</li>
        <li>Paste the access code and press Link app.</li>
        <li>Turn on protection and allow Incognito/private browsing if needed.</li>
      </ol>
      <p class="note">If the store links are not active yet, the extension still needs to be published to the browser stores.</p>
    </main>
  </body>
</html>`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const recent = (requestLog.get(ip) || []).filter((time) => now - time < windowMs);
  recent.push(now);
  requestLog.set(ip, recent);
  return recent.length > MAX_REQUESTS_PER_MIN;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function makeRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) return [];

  return rawMessages
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      content: String(message?.content || '').slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((message) => message.content.trim().length > 0);
}

function isClearlyOffTopic(text) {
  const normalized = text.toLowerCase();
  const recoveryTerms = [
    'urge',
    'relapse',
    'porn',
    'addiction',
    'trigger',
    'streak',
    'clean',
    'habit',
    'recovery',
    'masturb',
    'tempt',
    'craving',
    'accountability',
    'discipline',
    'block',
    'anxiety',
    'stress',
    'bored',
    'routine',
    'motivation',
    'withdrawal',
    'dopamine',
    'nofap',
    'goon',
    'gooning',
    'sexual',
    'adult site',
  ];
  const unrelatedQuestionTerms = [
    'homework',
    'math',
    'code',
    'program',
    'recipe',
    'weather',
    'stock',
    'crypto',
    'movie',
    'game',
    'history',
    'politics',
    'translate',
    'write an essay',
    'solve',
    'capital of',
  ];

  const hasRecoveryTerm = recoveryTerms.some((term) => normalized.includes(term));
  const hasUnrelatedQuestion = unrelatedQuestionTerms.some((term) => normalized.includes(term));
  return hasUnrelatedQuestion && !hasRecoveryTerm;
}

function offTopicReply() {
  return 'I can only help with recovery from porn or sexual-content addiction. Tell me what you are feeling right now: an urge, a trigger, a relapse, boredom, stress, or a routine problem.';
}

function providerFallbackReply(text) {
  const normalized = text.toLowerCase();

  if (normalized.includes('relapse') || normalized.includes('relapsed')) {
    return 'The AI provider is slow right now, but your next step is simple: log the relapse honestly, leave the trigger environment, drink water, and write one sentence about what started it. Do not turn this into a binge.';
  }

  if (normalized.includes('urge') || normalized.includes('goon') || normalized.includes('porn') || normalized.includes('trigger')) {
    return 'The AI provider is slow right now, so use the emergency plan: put the phone away, stand up, leave the room, breathe slowly for one minute, and wait ten minutes before making any decision.';
  }

  return 'The AI provider is slow right now. Keep this recovery-focused: name the feeling, remove the easiest trigger, and take one small action that protects your streak for the next ten minutes.';
}

function verificationEmailHtml(link) {
  const safeLink = escapeHtml(link);

  return `<!doctype html>
<html lang="en">
  <head>
    <style>
      @keyframes freemanVerifyPulse {
        0%, 100% { transform: scale(1); box-shadow: 0 0 0 rgba(61,143,107,0); }
        50% { transform: scale(1.035); box-shadow: 0 0 22px rgba(61,143,107,0.32); }
      }
      .freeman-verify-button {
        animation: freemanVerifyPulse 2.4s ease-in-out infinite;
      }
      .freeman-verify-button:hover {
        transform: scale(1.04);
      }
    </style>
  </head>
  <body style="margin:0;background:#07090f;color:#f8fafc;font-family:Inter,Arial,sans-serif;padding:28px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#0e1220;border:1px solid #1c2536;border-radius:24px;padding:0;">
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 8px;color:#3d8f6b;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Freeman</p>
          <h1 style="margin:0 0 12px;color:#ffffff;font-size:30px;line-height:1.12;">Confirm your email</h1>
          <p style="margin:0 0 22px;color:#94a3b8;font-size:15px;line-height:1.6;">Confirm this email address to finish setting up your Freeman account.</p>
          <a class="freeman-verify-button" href="${safeLink}" style="display:inline-block;background:#3d8f6b;color:#07100d;text-decoration:none;font-weight:900;font-size:15px;padding:14px 22px;border-radius:14px;box-shadow:0 10px 26px rgba(61,143,107,0.24);transition:transform 160ms ease,box-shadow 160ms ease;">Verify email</a>
          <p style="margin:22px 0 0;color:#64748b;font-size:13px;line-height:1.55;">If the button does not work, copy and paste this link into your browser:</p>
          <p style="word-break:break-all;margin:8px 0 0;color:#94a3b8;font-size:12px;line-height:1.5;">${safeLink}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function verificationEmailText(link) {
  return `Confirm your Freeman email address:\n\n${link}\n\nAfter confirming, return to the Freeman app and log in.`;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signEmailVerificationPayload(payload) {
  return crypto.createHmac('sha256', EMAIL_VERIFY_SECRET).update(payload).digest('base64url');
}

function getRequestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : 'https://freeman-ai-proxy.onrender.com';
}

function createVerificationToken(uid, email) {
  const payload = base64UrlEncode(JSON.stringify({
    uid,
    email,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  }));
  const signature = signEmailVerificationPayload(payload);
  return `${payload}.${signature}`;
}

function verifyEmailToken(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) {
    throw new Error('Invalid verification link.');
  }

  const expected = signEmailVerificationPayload(payload);
  const givenBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (givenBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(givenBuffer, expectedBuffer)) {
    throw new Error('Invalid verification link.');
  }

  const data = JSON.parse(base64UrlDecode(payload));
  if (!data.uid || !data.email || !data.exp || Date.now() > Number(data.exp)) {
    throw new Error('Verification link expired. Return to the app and request a new one.');
  }

  return data;
}

function generateVerificationLink(req, uid, email) {
  const token = encodeURIComponent(createVerificationToken(uid, email));
  return `${getRequestOrigin(req)}/api/auth/verify-email?token=${token}`;
}

async function sendResendEmail({ to, subject, html, text }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to,
      subject,
      html,
      text,
    }),
  });

  const body = await response.text();
  let data;
  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    data = { raw: body };
  }

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Resend failed with ${response.status}`);
    error.status = response.status;
    error.code = 'EMAIL_SEND_FAILED';
    throw error;
  }

  return data;
}

async function handleDeleteAccountRequest(req, res) {
  const ip = getClientIp(req);
  if (isRateLimited(`delete-account:${ip}`)) {
    sendHtml(res, 429, deleteAccountPage('Too many deletion requests from this network. Wait a minute and try again.'));
    return;
  }

  const rawBody = await readBody(req);
  const contentType = String(req.headers['content-type'] || '');
  let email = '';
  let details = '';

  if (contentType.includes('application/json')) {
    try {
      const payload = JSON.parse(rawBody);
      email = String(payload.email || '').trim().toLowerCase();
      details = String(payload.details || '').trim();
    } catch {
      sendHtml(res, 400, deleteAccountPage('Invalid request body. Enter your account email and try again.'));
      return;
    }
  } else {
    const params = new URLSearchParams(rawBody);
    email = String(params.get('email') || '').trim().toLowerCase();
    details = String(params.get('details') || '').trim();
  }

  if (!email || !email.includes('@')) {
    sendHtml(res, 400, deleteAccountPage('Enter the email address connected to your Freeman account.'));
    return;
  }

  const safeDetails = details.slice(0, 2000);
  if (RESEND_API_KEY) {
    try {
      await sendResendEmail({
        to: PRIVACY_CONTACT_EMAIL,
        subject: `Freeman account deletion request: ${email}`,
        text: `Account deletion request\n\nEmail: ${email}\nIP: ${ip}\n\nDetails:\n${safeDetails || '(none)'}`,
        html: `<h1>Freeman account deletion request</h1><p><strong>Email:</strong> ${escapeHtml(email)}</p><p><strong>IP:</strong> ${escapeHtml(ip)}</p><p><strong>Details:</strong></p><pre>${escapeHtml(safeDetails || '(none)')}</pre>`,
      });
    } catch (error) {
      console.warn('Deletion request email failed:', error.message);
      sendHtml(res, 500, deleteAccountPage(`We could not send the deletion request automatically. Email ${PRIVACY_CONTACT_EMAIL} from your Freeman account email instead.`));
      return;
    }
  }

  sendHtml(res, 200, deleteAccountPage(`Deletion request received for ${email}. We will review and may contact you to verify account ownership before deleting cloud records.`));
}

async function handleSendVerificationEmail(req, res) {
  const requestId = makeRequestId();
  const admin = getFirebaseAdmin();

  if (!admin) {
    sendJson(res, 503, { error: 'Firebase Admin is not configured on the backend', code: 'FIREBASE_ADMIN_NOT_CONFIGURED' }, requestId);
    return;
  }

  if (!RESEND_API_KEY) {
    sendJson(res, 503, { error: 'RESEND_API_KEY is not configured on the backend', code: 'RESEND_NOT_CONFIGURED' }, requestId);
    return;
  }

  const ip = getClientIp(req);
  if (isRateLimited(`verify:${ip}`)) {
    sendJson(res, 429, { error: 'Too many verification email requests. Wait a minute and try again.', code: 'RATE_LIMITED' }, requestId);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body', code: 'BAD_JSON' }, requestId);
    return;
  }

  const idToken = String(payload.idToken || '').trim();
  if (!idToken) {
    sendJson(res, 400, { error: 'Missing Firebase ID token', code: 'MISSING_ID_TOKEN' }, requestId);
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const email = decoded.email;
    if (!email) {
      sendJson(res, 400, { error: 'Firebase account has no email address', code: 'EMAIL_MISSING' }, requestId);
      return;
    }

    const link = generateVerificationLink(req, decoded.uid, email);

    await sendResendEmail({
      to: email,
      subject: 'Verify your Freeman account',
      html: verificationEmailHtml(link),
      text: verificationEmailText(link),
    });

    sendJson(res, 200, { ok: true, email }, requestId);
  } catch (error) {
    console.warn(`[${requestId}] verification email failed: ${error.message}`);
    sendJson(res, error.status || 500, { error: error.message || 'Could not send verification email', code: 'VERIFICATION_EMAIL_FAILED' }, requestId);
  }
}

async function handleSignup(req, res) {
  const requestId = makeRequestId();
  const admin = getFirebaseAdmin();

  if (!admin) {
    sendJson(res, 503, { error: 'Firebase Admin is not configured on the backend', code: 'FIREBASE_ADMIN_NOT_CONFIGURED' }, requestId);
    return;
  }

  if (!RESEND_API_KEY) {
    sendJson(res, 503, { error: 'RESEND_API_KEY is not configured on the backend', code: 'RESEND_NOT_CONFIGURED' }, requestId);
    return;
  }

  const ip = getClientIp(req);
  if (isRateLimited(`signup:${ip}`)) {
    sendJson(res, 429, { error: 'Too many signup attempts. Wait a minute and try again.', code: 'RATE_LIMITED' }, requestId);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body', code: 'BAD_JSON' }, requestId);
    return;
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const username = String(payload.username || '').trim().slice(0, 50);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6 || !username) {
    sendJson(res, 400, { error: 'Enter username, valid email, and a 6+ character password.', code: 'BAD_SIGNUP_INPUT' }, requestId);
    return;
  }

  try {
    let userRecord;
    let created = false;

    try {
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: username,
        emailVerified: false,
      });
      created = true;
    } catch (error) {
      if (error?.code !== 'auth/email-already-exists') {
        throw error;
      }

      userRecord = await admin.auth().getUserByEmail(email);
      if (userRecord.emailVerified) {
        sendJson(res, 409, { error: 'Account already exists. Log in instead.', code: 'ACCOUNT_EXISTS' }, requestId);
        return;
      }
    }

    const link = generateVerificationLink(req, userRecord.uid, email);

    await sendResendEmail({
      to: email,
      subject: 'Verify your Freeman account',
      html: verificationEmailHtml(link),
      text: verificationEmailText(link),
    });

    sendJson(res, 200, {
      ok: true,
      created,
      uid: userRecord.uid,
      email,
    }, requestId);
  } catch (error) {
    console.warn(`[${requestId}] signup failed: ${error.message}`);
    sendJson(res, error.status || 500, { error: error.message || 'Could not create account', code: error.code || 'SIGNUP_FAILED' }, requestId);
  }
}

async function handleVerifyEmail(req, res) {
  const admin = getFirebaseAdmin();

  if (!admin) {
    sendHtml(res, 503, '<h1>Freeman verification is temporarily unavailable.</h1><p>Try again later.</p>');
    return;
  }

  try {
    const url = new URL(req.url, getRequestOrigin(req));
    const token = url.searchParams.get('token');
    const payload = verifyEmailToken(token);
    const userRecord = await admin.auth().getUser(payload.uid);

    if (userRecord.email?.toLowerCase() !== String(payload.email).toLowerCase()) {
      throw new Error('This verification link does not match the account email.');
    }

    if (!userRecord.emailVerified) {
      await admin.auth().updateUser(payload.uid, { emailVerified: true });
    }

    sendHtml(
      res,
      200,
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Freeman email verified</title>
    <style>
      body{margin:0;min-height:100vh;background:#07090f;color:#f8fafc;font-family:Inter,Arial,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px}
      main{max-width:520px;background:#0e1220;border:1px solid #1c2536;border-radius:24px;padding:28px}
      p{color:#94a3b8;line-height:1.55}
      @keyframes openButtonBreathe{0%,100%{transform:scale(1);box-shadow:0 10px 28px rgba(61,143,107,.22)}50%{transform:scale(1.025);box-shadow:0 14px 36px rgba(61,143,107,.36)}}
      a{display:inline-block;margin-top:12px;background:#3d8f6b;color:#07100d;text-decoration:none;font-weight:900;padding:13px 18px;border-radius:14px;box-shadow:0 10px 28px rgba(61,143,107,.22);transition:transform .16s ease,box-shadow .16s ease;animation:openButtonBreathe 2.5s ease-in-out infinite}
      a:hover{transform:scale(1.045);box-shadow:0 16px 42px rgba(61,143,107,.42)}
      a:active{transform:scale(.94);box-shadow:0 6px 18px rgba(61,143,107,.24)}
    </style>
  </head>
  <body>
    <main>
      <h1>Email confirmed</h1>
      <p>Your Freeman account is verified. Return to the app and log in.</p>
      <a href="${escapeHtml(APP_OPEN_URL)}">Open Freeman</a>
      <p>If the button does not open the app, close this page and open Freeman from your home screen.</p>
    </main>
  </body>
</html>`,
    );
  } catch (error) {
    sendHtml(
      res,
      400,
      `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;background:#07090f;color:#f8fafc;padding:28px"><h1>Verification failed</h1><p>${escapeHtml(error.message || 'The verification link is invalid.')}</p></body></html>`,
    );
  }
}

function isRetryableError(error) {
  const message = String(error.message || '').toLowerCase();
  const modelUnavailable =
    message.includes('no longer available') ||
    message.includes('not a valid model') ||
    message.includes('model unavailable') ||
    message.includes('has transitioned to a paid model');

  if (modelUnavailable) return true;
  if (!error.status) return true;
  return RETRYABLE_STATUSES.has(error.status);
}

async function callOpenRouter({ model, messages, username }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://freeman.local',
        'X-Title': 'Freeman',
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 420,
        messages: [
          {
            role: 'system',
            content:
              `You are Freeman AI, a calm recovery assistant for ${username}. ${recoveryScope} ${therapistStyle} If the user reports an urge, prioritize immediate safety: change location, remove access, slow breathing, delay for ten minutes, and contact support if needed. If the user reports relapse, interrupt shame, identify the trigger chain, and create one repair step for the next hour. Do not answer general knowledge, coding, school, entertainment, politics, finance, or unrelated requests. For unrelated requests, say you can only help with recovery and ask what recovery challenge they are facing. If the user seems in immediate danger or may harm themselves or someone else, tell them to contact local emergency services or crisis support immediately.`,
          },
          ...messages,
        ],
      }),
    });
  } catch (error) {
    const nextError = new Error(error?.name === 'AbortError' ? 'OpenRouter request timed out' : error.message || 'OpenRouter network error');
    nextError.status = undefined;
    nextError.model = model;
    throw nextError;
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(data?.error?.message || `OpenRouter failed with ${response.status}`);
    error.status = response.status;
    error.model = model;
    throw error;
  }

  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    const error = new Error('OpenRouter returned an empty response');
    error.status = 502;
    error.model = model;
    throw error;
  }

  return reply;
}

async function handleChat(req, res) {
  const requestId = makeRequestId();
  if (!OPENROUTER_API_KEY) {
    sendJson(res, 503, { error: 'OPENROUTER_API_KEY is not set on the backend', code: 'AI_NOT_CONFIGURED' }, requestId);
    return;
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    sendJson(res, 429, { error: 'Proxy rate limit reached. Wait a minute and try again.', code: 'RATE_LIMITED' }, requestId);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body', code: 'BAD_JSON' }, requestId);
    return;
  }

  const username = String(payload.username || 'friend').slice(0, 50);
  const messages = sanitizeMessages(payload.messages);

  if (!messages.length) {
    sendJson(res, 400, { error: 'No chat messages provided', code: 'NO_MESSAGES' }, requestId);
    return;
  }

  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (lastUserMessage && isClearlyOffTopic(lastUserMessage.content)) {
    sendJson(res, 200, { reply: offTopicReply(), model: 'scope-guard' }, requestId);
    return;
  }

  const errors = [];
  const deadline = Date.now() + AI_OVERALL_TIMEOUT_MS;
  for (const model of models) {
    if (Date.now() >= deadline) break;

    try {
      const reply = await callOpenRouter({ model, messages, username });
      sendJson(res, 200, { reply, model }, requestId);
      return;
    } catch (error) {
      errors.push(`${error.model || model}: ${error.message}`);
      console.warn(`[${requestId}] ${error.model || model} failed: ${error.message}`);
      if (!isRetryableError(error)) break;
    }
  }

  const fallbackText = providerFallbackReply(lastUserMessage?.content || '');
  sendJson(res, 200, {
    reply: fallbackText,
    model: 'provider-fallback',
    degraded: true,
    providerErrors: errors.slice(-3),
  }, requestId);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'HEAD' && (req.url === '/' || req.url === '/health')) {
    sendJsonHead(res, 200);
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    sendHtml(res, 200, homePage());
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'freeman-ai-backend',
      configured: Boolean(OPENROUTER_API_KEY),
      models,
      modelTimeoutMs: MODEL_TIMEOUT_MS,
      overallTimeoutMs: AI_OVERALL_TIMEOUT_MS,
    });
    return;
  }

  if (req.method === 'HEAD' && ['/', '/privacy', '/terms', '/delete-account'].includes(req.url || '')) {
    sendHtmlHead(res, 200);
    return;
  }

  if (req.method === 'HEAD' && ['/app-ads.txt', '/robots.txt'].includes(req.url || '')) {
    sendTextHead(res, 200);
    return;
  }

  if (req.method === 'GET' && req.url === '/privacy') {
    sendHtml(res, 200, privacyPolicyPage());
    return;
  }

  if (req.method === 'GET' && req.url === '/terms') {
    sendHtml(res, 200, termsPage());
    return;
  }

  if (req.method === 'GET' && req.url === '/delete-account') {
    sendHtml(res, 200, deleteAccountPage());
    return;
  }

  if (req.method === 'GET' && req.url === '/app-ads.txt') {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(appAdsTxt());
    return;
  }

  if (req.method === 'GET' && req.url === '/robots.txt') {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(robotsTxt());
    return;
  }

  if (req.method === 'GET' && req.url === '/sitemap.xml') {
    res.writeHead(200, {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(sitemapXml());
    return;
  }

  if (req.method === 'POST' && req.url === '/delete-account') {
    handleDeleteAccountRequest(req, res).catch((error) => {
      sendHtml(res, 500, deleteAccountPage(error.message || 'Could not submit account deletion request.'));
    });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/extension')) {
    const url = new URL(req.url, 'https://freeman.local');
    sendHtml(res, 200, extensionSetupPage(url.searchParams.get('code') || ''));
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/api/auth/verify-email')) {
    handleVerifyEmail(req, res).catch((error) => {
      sendHtml(res, 500, `<h1>Verification failed</h1><p>${escapeHtml(error.message || 'Unexpected backend error')}</p>`);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    handleChat(req, res).catch((error) => {
      sendJson(res, 500, { error: error.message || 'Unexpected backend error', code: 'UNEXPECTED_ERROR' });
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/auth/send-verification') {
    handleSendVerificationEmail(req, res).catch((error) => {
      sendJson(res, 500, { error: error.message || 'Unexpected backend error', code: 'UNEXPECTED_ERROR' });
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/auth/signup') {
    handleSignup(req, res).catch((error) => {
      sendJson(res, 500, { error: error.message || 'Unexpected backend error', code: 'UNEXPECTED_ERROR' });
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found', code: 'NOT_FOUND' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Freeman AI proxy listening on http://127.0.0.1:${PORT}`);
});
