import net from "net";
import puppeteer, { type Browser, type Page } from "puppeteer";

const LAUNCH_TIMEOUT_MS = 30000;
const RENDER_TIMEOUT_MS = 45000;

let browserPromise: Promise<Browser> | null = null;

function isPrivateOrInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  // Check if it's an IP address
  const ipType = net.isIP(host);
  if (ipType === 4) {
    const parts = host.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }
    // 0.0.0.0/8
    if (parts[0] === 0) return true;
    // 127.0.0.0/8
    if (parts[0] === 127) return true;
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (Link-local & AWS/Cloud Metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 100.64.0.0/10
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // 198.18.0.0/15
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
    return false;
  } else if (ipType === 6) {
    if (host === "::1" || host === "::") return true;
    if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
    if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
    if (host.startsWith("::ffff:")) {
      const ipv4Part = host.slice(7);
      return isPrivateOrInternalHost(ipv4Part);
    }
    return false;
  }

  // Handle decimal or hex encoded IP strings
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
    return true;
  }

  return false;
}

function sanitizeHtmlForPdf(html: string): string {
  return html
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<iframe[^>]*\/?>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<object[^>]*\/?>/gi, "")
    .replace(/<embed[\s\S]*?<\/embed>/gi, "")
    .replace(/<embed[^>]*\/?>/gi, "")
    .replace(/<applet[\s\S]*?<\/applet>/gi, "")
    .replace(/<applet[^>]*\/?>/gi, "");
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      // Reuse the cached browser only while it is still alive.
      if (existing.isConnected()) return existing;
    } catch {
      // previous launch failed — start over
    }
    browserPromise = null;
  }
  const args = [
    "--disable-dev-shm-usage",
    "--font-render-hinting=none",
  ];

  // Native OS sandboxing: on Windows or in Docker containers (root), --no-sandbox is required for headless PDF generation
  if (
    process.platform === "win32" ||
    process.env.PUPPETEER_NO_SANDBOX === "true" ||
    (typeof process.getuid === "function" && process.getuid() === 0)
  ) {
    args.push("--no-sandbox", "--disable-setuid-sandbox");
  }

  browserPromise = withTimeout(
    puppeteer.launch({
      headless: true,
      args,
    }),
    LAUNCH_TIMEOUT_MS,
    "Starting the PDF engine"
  );
  try {
    return await browserPromise;
  } catch (e) {
    browserPromise = null; // don't cache failures
    throw e;
  }
}

/** Renders a full HTML document to PDF bytes. Templates declare their own @page size/margins. */
export async function renderHtmlToPdf(html: string, pageFormat: string = "A5"): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let browser: Browser;
    try {
      browser = await getBrowser();
    } catch (e) {
      browserPromise = null;
      lastError = e;
      continue;
    }

    let page: Page | null = null;
    try {
      const activePage = await browser.newPage();
      page = activePage;
      // Disable JavaScript to prevent dynamic exploitation
      await activePage.setJavaScriptEnabled(false);

      // Request interception to block non-HTTP protocols, private IPs, and cloud metadata
      await activePage.setRequestInterception(true);
      activePage.on("request", (req) => {
        try {
          const urlStr = req.url();
          // Allow about:blank (initial page / empty src)
          if (urlStr === "about:blank") {
            return req.continue();
          }

          // Allow safe data URIs for inline images or fonts
          if (urlStr.startsWith("data:image/") || urlStr.startsWith("data:font/")) {
            return req.continue();
          }

          const parsed = new URL(urlStr);
          // Strictly allow only http: and https:
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return req.abort("accessdenied");
          }

          // Disallow subframes / nested document navigations
          if (req.isNavigationRequest() && req.frame() !== activePage.mainFrame()) {
            return req.abort("accessdenied");
          }
          if (req.resourceType() === "document" && req.frame() !== activePage.mainFrame()) {
            return req.abort("accessdenied");
          }

          // Block private, loopback, link-local, and cloud metadata destinations
          if (isPrivateOrInternalHost(parsed.hostname)) {
            return req.abort("accessdenied");
          }

          return req.continue();
        } catch {
          return req.abort("accessdenied");
        }
      });

      const safeHtml = sanitizeHtmlForPdf(html);

      await withTimeout(
        activePage.setContent(safeHtml, { waitUntil: "load", timeout: RENDER_TIMEOUT_MS }),
        RENDER_TIMEOUT_MS,
        "Loading the bill document"
      );
      const bytes = await withTimeout(
        activePage.pdf({
          printBackground: true,
          preferCSSPageSize: true,
          format: pageFormat === "A4" ? "A4" : "A5",
          margin: { top: "0", bottom: "0", left: "0", right: "0" },
        }),
        RENDER_TIMEOUT_MS,
        "Generating the PDF"
      );
      return Buffer.from(bytes);
    } catch (e) {
      lastError = e;
      // A wedged browser would fail future renders — drop it so next attempt relaunches fresh
      browserPromise = null;
      browser.close().catch(() => {});
      if (attempt === 1) throw e;
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }
  throw lastError;
}
