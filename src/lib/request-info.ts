/** Who made a request: IP, rough location and device. Vercel adds the location headers. */
export type RequestInfo = {
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  userAgent: string | null;
};

function decode(value: string | null) {
  if (!value) return null;
  try { return decodeURIComponent(value); } catch { return value; }
}

export function requestInfo(request: Request | null | undefined): RequestInfo {
  if (!request) return { ip: null, country: null, region: null, city: null, userAgent: null };
  const h = request.headers;
  const ip = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || h.get("x-forwarded-for")?.split(",")[0]?.trim()
    || h.get("x-real-ip")
    || null;
  return {
    ip,
    country: h.get("x-vercel-ip-country") || null,
    region: decode(h.get("x-vercel-ip-country-region")),
    city: decode(h.get("x-vercel-ip-city")),
    userAgent: h.get("user-agent")?.slice(0, 400) || null,
  };
}
