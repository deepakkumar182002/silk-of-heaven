const PATHS = {
  cart: <><path d="M3 4h2.2l2.1 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L20.5 8H6.1" /><circle cx="9.5" cy="20" r="1.2" /><circle cx="17" cy="20" r="1.2" /></>,
  heart: <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.3 0 5.6 3.1 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4z" />,
  bag: <><path d="M5 8h14l-1 12.2a1 1 0 0 1-1 .8H7a1 1 0 0 1-1-.8L5 8z" /><path d="M9 10V6.5a3 3 0 0 1 6 0V10" /></>,
  more: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  pencil: <><path d="M4 20l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.2 19 4 20z" /><path d="M14 7l3 3" /></>,
  shuffle: <><path d="M3 7h3.5c2 0 3.3 1 4.4 2.7l2.2 4.6C14.2 16 15.5 17 17.5 17H21" /><path d="M3 17h3.5c1.4 0 2.4-.5 3.3-1.4M14.2 8.4c.9-.9 1.9-1.4 3.3-1.4H21" /><path d="M18.5 4.5L21 7l-2.5 2.5M18.5 14.5L21 17l-2.5 2.5" /></>,
  cloud: <path d="M7 18h10.5a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 7.3 9.6 4.2 4.2 0 0 0 7 18z" />,
  face: <><circle cx="12" cy="12" r="8.5" /><path d="M9 10v.5M15 10v.5M8.8 14.5c1.7 1.6 4.7 1.6 6.4 0" /></>,
  hair: <><path d="M5 20c-.8-6 .4-14 7-14s7.8 8 7 14" /><path d="M8.5 12c2.5 0 5-1.6 6-3.6.6 1.6 1.6 2.8 3 3.4" /><circle cx="12" cy="3.8" r="1.6" /></>,
  makeup: <><path d="M9 21h6v-8H9z" /><path d="M10 13V7.5L14 4v9" /></>,
  body: <><circle cx="12" cy="4.5" r="2" /><path d="M7 9h10M12 9v6M12 15l-3 6M12 15l3 6M7 9l-1.5 5M17 9l1.5 5" /></>,
  hanger: <><path d="M12 7.5a2 2 0 1 1 2-2c0 1.1-2 1.6-2 3.2" /><path d="M12 8.7L3 15.5a1 1 0 0 0 .6 1.8h16.8a1 1 0 0 0 .6-1.8L12 8.7z" /></>,
  acc: <><circle cx="12" cy="14.5" r="5.5" /><path d="M9 4h6l-1.5 4.5h-3z" /></>,
  tattoo: <><path d="M12 3c1.5 3.5 5 5 5 9.5a5 5 0 0 1-10 0C7 8 10.5 6.5 12 3z" /><path d="M12 12v6M10 14.5l2 1.5 2-1.5" /></>,
  details: <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></>,
  randomize: <><path d="M20 11a8 8 0 0 0-14.3-4.6L4 8" /><path d="M4 3.5V8h4.5" /><path d="M4 13a8 8 0 0 0 14.3 4.6L20 16" /><path d="M20 20.5V16h-4.5" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></>,
  tee: <path d="M8.5 4L3.5 7l2 3.5 2-1V20h9V9.5l2 1 2-3.5-5-3c-.5 1.5-1.8 2.4-3.5 2.4S9 5.5 8.5 4z" />,
  athletic: <><path d="M3 15.5c0-1.5.8-2 2-2.5l4.5-2L11 7l3 1.2-.6 2.3c1.8 1.4 4.4 1.8 6.6 2 .7 0 1 .6 1 1.3V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M3 19h18" /></>,
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  formal: <><path d="M8 3.5L4 6v14.5h16V6l-4-2.5" /><path d="M8 3.5l4 6.5 4-6.5M12 10v10.5M8 3.5L6.5 11 9 13M16 3.5l1.5 7.5L15 13" /></>,
  dress: <path d="M9.5 3v3.5L8 10l-3.5 10.5h15L16 10l-1.5-3.5V3M9.5 6.5h5" />,
  hoodie: <><path d="M8.5 4.5c.8-1 2-1.5 3.5-1.5s2.7.5 3.5 1.5L20 8l-1.5 4-2-1V21h-9V11l-2 1L4 8z" /><path d="M9 4.5c0 2.2 1.3 3.8 3 3.8s3-1.6 3-3.8M10.5 8v3M13.5 8v3M9.5 16h5" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>,
  pose: <><circle cx="12" cy="4.5" r="2" /><path d="M12 7v7l-3 7M12 14l3 7M5 6.5l7 2.5 7-2.5" /></>,
  reset: <><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 3.5v5h5" /></>,
  chev: <path d="M6 9l6 6 6-6" />,
  chevRight: <path d="M9 6l6 6-6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  // ---- admin ----
  dashboard: <><rect x="3.5" y="3.5" width="7" height="9" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="15.5" width="7" height="5" rx="1.5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M15.5 4.8a3.3 3.3 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.1-1.6-1.1-2.8 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="14.5" cy="7" r="1" /></>,
  filter: <><circle cx="9" cy="9" r="5.5" /><circle cx="15" cy="9" r="5.5" /><circle cx="12" cy="15" r="5.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12.2a1.5 1.5 0 0 0 1.5 1.3h8a1.5 1.5 0 0 0 1.5-1.3l1-12.2" /><path d="M9 7V4.5h6V7" /></>,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5M5 12h11" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M20.5 16l-5-5-8.5 8.5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>,
  megaphone: <><path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1z" /><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18M10.6 6a8.7 8.7 0 0 1 1.4-.1c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.6M6.6 6.6C3.9 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5a8.6 8.6 0 0 0 4.4-1.2" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.3-4.3" /></>,
  orders: <><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" /><path d="M9 8.5h6M9 12h6" /></>,
  phone: <path d="M5 4h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 5.3 5.3l1.4-2.2L19 14.5V18a2 2 0 0 1-2 2A14 14 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></>,
  chat: <path d="M4 5.5h16v10.5H9.5L5 20v-4H4z" />,
  scissors: <><circle cx="6" cy="6.5" r="2.5" /><circle cx="6" cy="17.5" r="2.5" /><path d="M8 8l12 9M8 16L20 7" /></>,
  box: <><path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>,
  ruler: <><path d="M3.5 15.5l12-12 5 5-12 12z" /><path d="M7 12l2 2M10 9l1.5 1.5M13 6l2 2" /></>,
  minus: <path d="M5 12h14" />,
};

export const ICON_NAMES = Object.keys(PATHS);
export const CATEGORY_ICONS = ['grid', 'tee', 'athletic', 'moon', 'formal', 'dress', 'hoodie', 'hanger', 'acc', 'details', 'heart', 'bag', 'face', 'hair', 'makeup', 'body', 'tattoo', 'cloud'];

export default function Icon({ name, size = 22, fill = 'none', stroke = 1.6, className, style }) {
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
