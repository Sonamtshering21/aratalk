// Crawler / script detection by user-agent. Dependency-free (also used by tests).
//
// Only real crawlers, link-preview fetchers and scripting tools are matched.
// In-app browsers (Telegram, Discord, Facebook, Messenger, Instagram, WhatsApp)
// and phone models that merely contain "bot" (e.g. "CUBOT KINGKONG 7") are
// regular people and must pass.

const CRAWLER_PATTERNS: RegExp[] = [
  // Name ending in bot/crawler/spider followed by a version: Googlebot/2.1,
  // bingbot/2.0, AhrefsBot/7.0, Discordbot/2.0, UptimeRobot/2.0 …
  /[a-z0-9_-]*(?:bot|crawler|spider|scraper)\/\d/i,
  // "(compatible; YandexBot …)" style crawler tokens.
  /\(compatible;[^)]*(?:bot|crawler|spider)\b/i,
  // Crawlers publish a contact URL like "+http://www.google.com/bot.html".
  /\+https?:\/\//i,
  // Link-preview fetchers whose user-agent starts with their name.
  /^(?:TelegramBot|Twitterbot|facebookexternalhit|facebookcatalog|Slackbot|LinkedInBot|Pinterest|redditbot|Embedly|WhatsApp\/|Applebot|AdsBot-Google|Mediapartners-Google|Google-InspectionTool)/i,
  // Scripting tools and HTTP libraries.
  /\b(?:curl|wget|httpie|python-requests|python-urllib|python-httpx|aiohttp|scrapy|go-http-client|okhttp|axios|node-fetch|undici|libwww-perl|java)\//i,
  /^(?:node|python|got|insomnia|postmanruntime)\b/i,
  // Headless and automated browsers, audits and uptime checks.
  /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|Chrome-Lighthouse|PageSpeed|GTmetrix|Pingdom|StatusCake/i,
];

export function isCrawler(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  if (!ua) return true;
  return CRAWLER_PATTERNS.some((re) => re.test(ua));
}
