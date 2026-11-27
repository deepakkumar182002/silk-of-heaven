const bad = (message) => Object.assign(new Error(message), { status: 400, expose: true });

/** A link set by the admin: a page of this website ("/shop") or an https:// address. */
export function cleanLink(v) {
  const l = String(v || '').trim().slice(0, 500);
  if (!l) return '';
  if (l.startsWith('/') && !l.startsWith('//')) return l;
  if (/^https?:\/\/[^\s]+$/i.test(l)) return l;
  throw bad('Link must start with "/" (a page of this website) or https://');
}
