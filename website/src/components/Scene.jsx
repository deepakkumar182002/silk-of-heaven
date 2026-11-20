import { SITE, FILTERS, realFilters } from '../data.js';

export default function Scene({ grade, real }) {
  const f = FILTERS[grade];
  return (
    <div id="scene">
      <div id="grade" style={{ filter: f.filter }}>
        <div id="bg" style={{ backgroundImage: `url("${SITE.bg}")`, filter: realFilters(real).bg }} />
        <div id="tint" style={{ background: f.tint }} />
      </div>
      <div id="vignette" />
    </div>
  );
}
