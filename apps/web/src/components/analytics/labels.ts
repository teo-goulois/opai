import type { Dimension } from "@opai/context/analytics/dimension";

import { m } from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

// Umami stores codes (FR, chrome, organicSocial); these turn them into names
// in the interface language. An unknown code is shown as is.

const browsers: Record<string, string> = {
  chrome: "Chrome",
  "chromium-webview": "Chrome WebView",
  crios: "Chrome iOS",
  edge: "Edge (legacy)",
  "edge-chromium": "Edge",
  "edge-ios": "Edge iOS",
  facebook: "Facebook",
  firefox: "Firefox",
  fxios: "Firefox iOS",
  instagram: "Instagram",
  ios: "Safari iOS",
  "ios-webview": "iOS WebView",
  opera: "Opera",
  safari: "Safari",
  samsung: "Samsung Internet",
  yandexbrowser: "Yandex",
};

const channels: Record<string, () => string> = {
  direct: m.analytics_channel_direct,
  referral: m.analytics_channel_referral,
  organicSearch: m.analytics_channel_organic_search,
  paidSearch: m.analytics_channel_paid_search,
  organicSocial: m.analytics_channel_organic_social,
  paidSocial: m.analytics_channel_paid_social,
  organicVideo: m.analytics_channel_organic_video,
  paidVideo: m.analytics_channel_paid_video,
  organicShopping: m.analytics_channel_organic_shopping,
  paidShopping: m.analytics_channel_paid_shopping,
  email: m.analytics_channel_email,
  sms: m.analytics_channel_sms,
  affiliate: m.analytics_channel_affiliate,
  display: m.analytics_channel_display,
};

const devices: Record<string, () => string> = {
  desktop: m.analytics_device_desktop,
  laptop: m.analytics_device_laptop,
  mobile: m.analytics_device_mobile,
  tablet: m.analytics_device_tablet,
};

function displayName(type: "region" | "language", code: string) {
  try {
    return new Intl.DisplayNames(getLocale(), { type }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The flag emoji of a two-letter country code. */
export function flag(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

export function metricLabel(dimension: Dimension, value: string | null): string {
  if (value === null) {
    return dimension === "referrer" || dimension === "query"
      ? m.analytics_value_none()
      : m.analytics_value_unknown();
  }
  switch (dimension) {
    case "country":
      return displayName("region", value);
    case "language":
      return displayName("language", value);
    case "browser":
      return browsers[value] ?? value;
    case "channel":
      return channels[value]?.() ?? value;
    case "device":
      return devices[value]?.() ?? value;
    default:
      return value;
  }
}
