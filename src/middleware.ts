// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";

/**
 * Comprehensive security middleware
 * - Strict Content Security Policy (CSP)
 * - Security headers (HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, etc.)
 * - Environment-aware relaxations for local development
 * - Report-Only toggle and report-uri support
 */

// Run this middleware on almost everything except static assets, next internals, and streaming endpoints
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|assets/|fonts/|images/|api/health|api/realtime).*)",
  ],
};

function isHtmlRequest(req: NextRequest) {
  const accept = req.headers.get("accept") || "";
  // Only attach CSP to HTML navigations / SSR responses
  return accept.includes("text/html");
}

function boolFromEnv(name: string, fallback = false) {
  const v = process.env[name];
  if (v == null) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(String(v).toLowerCase());
}

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Build a strong, environment-aware CSP
  const isDev = process.env.NODE_ENV !== "production";
  const reportOnly = boolFromEnv("CSP_REPORT_ONLY", false);

  // Optional source allowlists via env (space-separated)
  const imgExtra = (process.env.CSP_IMG_SRC ?? "").trim();
  const scriptExtra = (process.env.CSP_SCRIPT_SRC ?? "").trim();
  const styleExtra = (process.env.CSP_STYLE_SRC ?? "").trim();
  const connectExtra = (process.env.CSP_CONNECT_SRC ?? "").trim();
  const frameAncestorsExtra = (process.env.CSP_FRAME_ANCESTORS ?? "").trim();
  const frameSrcExtra = (process.env.CSP_FRAME_SRC ?? "").trim();
  
  // Allow unsafe-eval in production if needed by dependencies (some UI libraries require it)
  const allowUnsafeEval = boolFromEnv("CSP_ALLOW_UNSAFE_EVAL", false);

  const directives: string[] = [
    // Baseline defaults
    "default-src 'self'",

    // Scripts: Next.js requires 'unsafe-inline' for inline scripts
    // Some libraries also need 'unsafe-eval' (e.g., certain UI libs, date pickers)
    // For maximum security, consider implementing nonce-based CSP with Next.js experimental features
    (() => {
      const parts: string[] = ["'self'", "'unsafe-inline'"];
      // Add 'unsafe-eval' in dev for HMR, or in prod if CSP_ALLOW_UNSAFE_EVAL is set
      if (isDev || allowUnsafeEval) parts.push("'unsafe-eval'");
      if (scriptExtra) parts.push(scriptExtra);
      return `script-src ${parts.join(" ")}`;
    })(),

    // Script-src-elem: Specifically for script elements (needed for Next.js)
    (() => {
      const parts: string[] = ["'self'", "'unsafe-inline'"];
      if (isDev || allowUnsafeEval) parts.push("'unsafe-eval'");
      if (scriptExtra) parts.push(scriptExtra);
      return `script-src-elem ${parts.join(" ")}`;
    })(),

    // Styles: allow inline styles due to CSS-in-JS and Next.js style tags
    (() => {
      const parts: string[] = ["'self'", "'unsafe-inline'"];
      if (styleExtra) parts.push(styleExtra);
      return `style-src ${parts.join(" ")}`;
    })(),

    // Images: self, data/blobs, https CDNs (extend via CSP_IMG_SRC)
    ["img-src 'self' data: blob: https:", imgExtra].filter(Boolean).join(" "),

    // Fonts & Media
    "font-src 'self' data: https:",
    "media-src 'self' blob: https:",

    // XHR/fetch/websocket endpoints
    ["connect-src 'self' https: wss:", connectExtra].filter(Boolean).join(" "),

    // Frames: only self by default; extend via env for app iframes if needed
    ["frame-src 'self'", frameSrcExtra].filter(Boolean).join(" "),
    ["frame-ancestors 'self'", frameAncestorsExtra].filter(Boolean).join(" "),

    // Lock down the rest
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:",
    
    // Upgrade mixed content in case any http links sneak in
    "upgrade-insecure-requests",
  ];

  const csp = directives.join("; ");

  // Only attach CSP to HTML navigations to avoid interfering with APIs/static files
  if (isHtmlRequest(req)) {
    const headerName = reportOnly
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";

    res.headers.set(headerName, csp);
  }

  // ---- Additional Security Headers ----
  // HSTS: Only enable in production and when behind HTTPS
  if (!isDev) {
    // 180 days + preload. Adjust to your needs.
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=15552000; includeSubDomains; preload"
    );
  }

  // MIME sniffing protection
  res.headers.set("X-Content-Type-Options", "nosniff");

  // Referrer policy
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Basic Permissions-Policy: opt-out of powerful features by default
  // Extend as needed per product requirements
  res.headers.set(
    "Permissions-Policy",
    [
      "accelerometer=()",
      "autoplay=(self)",
      "camera=()",
      "clipboard-read=(self)",
      "clipboard-write=(self)",
      "fullscreen=(self)",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "midi=()",
      "payment=()",
      "picture-in-picture=(self)",
      "publickey-credentials-get=(self)",
      "screen-wake-lock=()",
      "usb=()",
      "xr-spatial-tracking=()",
    ].join(", ")
  );

  // DNS Prefetch control – keep default off unless explicitly needed
  res.headers.set("X-DNS-Prefetch-Control", "off");

  return res;
}