import React, { useState, useMemo, useId } from 'react';
import * as d3 from 'd3';

// -----------------------------------------------------------------------------
// 1. COLOR CONFIGURATIONS
// -----------------------------------------------------------------------------

// Total annual precipitation — discrete threshold bins (cool teal range, mm)
const PRECIP_BINS = [
  { max: 49.9, color: '#C4EBE6', label: '0–49.9 mm' },
  { max: 99.9, color: '#8DE5E0', label: '50–99.9 mm' },
  { max: 149.9, color: '#32C7C6', label: '100–149.9 mm' },
  { max: 199.9, color: '#389998', label: '150–199.9 mm' },
  { max: Infinity, color: '#1C4D4C', label: '200+ mm' },
];
const getPrecipitationColor = (val) => PRECIP_BINS.find((b) => val <= b.max).color;

// Shared warm gradient used for BOTH annual temperature and annual heat
// index, each pinned to the app's own fixed global range (per the
// Temperature / Heat Index range panels) rather than the range of whatever
// subset of years happens to be plotted — so colors stay comparable no
// matter which years are shown.
const heatGradientStops = [
  '#EDEDED',
  '#B7BDF1',
  '#A8E4CB',
  '#FAE84A',
  '#FFA179',
  '#F25A2A',
  '#861D68',
  '#41033B',
];

const TEMP_RANGE = { min: 17.3, max: 37.6, ticks: [17.3, 22.4, 27.5, 32.5, 37.6] };
const HI_RANGE = { min: 16.0, max: 38.5, ticks: [16.0, 21.6, 27.3, 32.9, 38.5] };

const cssGradient = (stops) => `linear-gradient(90deg, ${stops.join(', ')})`;

// Evenly spaces the color stops across a fixed [min, max] domain (instead of
// d3.ticks(), which won't reliably return exactly stops.length points).
function makeFixedColorScale({ min, max }, stops) {
  const domain = stops.map((_, i) => min + (i * (max - min)) / (stops.length - 1));
  return d3.scaleLinear().domain(domain).range(stops).interpolate(d3.interpolateRgb).clamp(true);
}

// -----------------------------------------------------------------------------
// 2. SHAPE GENERATORS
// -----------------------------------------------------------------------------

// Thin, straight-edged dagger/spike for the Heat Index ring — no bulge.
function spikePath(midAngle, halfWidth, rBase, rTip) {
//   const b1x = rBase * Math.sin(midAngle - halfWidth);
//   const b1y = -rBase * Math.cos(midAngle - halfWidth);
//   const b2x = rBase * Math.sin(midAngle + halfWidth);
//   const b2y = -rBase * Math.cos(midAngle + halfWidth);
//   const tx = rTip * Math.sin(midAngle);
//   const ty = -rTip * Math.cos(midAngle);
//   return `M ${b1x} ${b1y} L ${tx} ${ty} L ${b2x} ${b2y} Z`;
const bx = rBase * Math.sin(midAngle);
  const by = -rBase * Math.cos(midAngle);
  const tx = rTip * Math.sin(midAngle);
  const ty = -rTip * Math.cos(midAngle);
  const rMid = rBase + (rTip - rBase) * 0.55;
  const lx = rMid * Math.sin(midAngle - halfWidth);
  const ly = -rMid * Math.cos(midAngle - halfWidth);
  const rx = rMid * Math.sin(midAngle + halfWidth);
  const ry = -rMid * Math.cos(midAngle + halfWidth);
  return `M ${bx} ${by} Q ${lx} ${ly} ${tx} ${ty} Q ${rx} ${ry} ${bx} ${by} Z`;
}

// A curved path riding along the top of a given radius, used to set text on
// via <textPath> so ring annotations read like labels on a dial.
function topArcPath(r, spanDeg = 200) {
  const half = (spanDeg / 2) * (Math.PI / 180);
  const x1 = r * Math.sin(-half);
  const y1 = -r * Math.cos(-half);
  const x2 = r * Math.sin(half);
  const y2 = -r * Math.cos(half);
  return `M ${x1} ${y1} A ${r} ${r} 0 1 1 ${x2} ${y2}`;
}

export default function RadialClimateChart({ data, width = 800, height = 800 }) {
  const [hoveredInfo, setHoveredInfo] = useState(null);
  const uid = useId().replace(/:/g, '');

  // --- Radius layout, innermost -> outermost, with explicit gaps so bands
  // and their annotations get breathing room instead of touching. -----------
  const outerRadius = Math.min(width, height) / 2 - 80;

  const centerRadius = outerRadius * 0.2;
  const tempInnerRadius = outerRadius * 0.34; // Temperature: solid arc ring
  const tempOuterRadius = outerRadius * 0.46;
  const hiInnerRadius = outerRadius * 0.6; // Heat index: thin spikes
  const hiOuterRadius = outerRadius * 0.74;
  const precipRadius = outerRadius * 0.92; // Precipitation: dots

  const labelTempRadius = tempOuterRadius + (hiInnerRadius - tempOuterRadius) * 0.5;
  const labelHiRadius = hiOuterRadius + (precipRadius - hiOuterRadius) * 0.5;
  const labelPrecipRadius = precipRadius + outerRadius * 0.06;
  const yearLabelRadius = precipRadius + outerRadius * 0.14;

  const { angleScale, tempColorScale, hiColorScale, hiTipScale, precipSizeScale } = useMemo(() => {
    const years = data.map((d) => d.year);
    const angle = d3.scaleBand().domain(years).range([0, 2 * Math.PI]).paddingInner(0.15);

    const hiTip = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d.annual_hi))
      .range([hiInnerRadius + (hiOuterRadius - hiInnerRadius) * 0.3, hiOuterRadius]);

    const precipSize = d3.scaleSqrt().domain([0, d3.max(data, (d) => d.annual_prep)]).range([4, 11]);

    return {
      angleScale: angle,
      tempColorScale: makeFixedColorScale(TEMP_RANGE, heatGradientStops),
      hiColorScale: makeFixedColorScale(HI_RANGE, heatGradientStops),
      hiTipScale: hiTip,
      precipSizeScale: precipSize,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, hiInnerRadius, hiOuterRadius]);

  const tempArcGenerator = d3.arc().innerRadius(tempInnerRadius).outerRadius(tempOuterRadius).padAngle(0.02).cornerRadius(1);

  const handleMouseEnter = (event, year, metricLabel, value, unit) => {
    setHoveredInfo({ year, metricLabel, value, unit, x: event.clientX + 15, y: event.clientY - 15 });
  };
  const handleMouseMove = (event) => {
    if (hoveredInfo) setHoveredInfo((prev) => (prev ? { ...prev, x: event.clientX + 15, y: event.clientY - 15 } : null));
  };
  const handleMouseLeave = () => setHoveredInfo(null);

  return (
    <div style={{ width: '100%', maxWidth: width, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: '100%', display: 'block' }}
          onMouseMove={handleMouseMove}
        >
          <defs>
            <path id={`${uid}-arc-temp`} d={topArcPath(labelTempRadius)} fill="none" />
            <path id={`${uid}-arc-hi`} d={topArcPath(labelHiRadius)} fill="none" />
            <path id={`${uid}-arc-precip`} d={topArcPath(labelPrecipRadius)} fill="none" />
          </defs>

          <g transform={`translate(${width / 2}, ${height / 2})`}>
            {/* CENTER */}
            <circle r={centerRadius - 10} fill="none" stroke="#E2E8F0" strokeDasharray="3 3" />
            <text textAnchor="middle" dy="0.35em" fontSize="16px" fontWeight="700" fill="#0F172A">
              ABU DHABI
            </text>

            {/* BAND GUIDELINES */}
            <circle r={tempInnerRadius} fill="none" stroke="#E2E8F0" strokeDasharray="2 2" />
            <circle r={tempOuterRadius} fill="none" stroke="#E2E8F0" strokeDasharray="2 2" />
            <circle r={hiInnerRadius} fill="none" stroke="#E2E8F0" strokeDasharray="2 2" />
            <circle r={hiOuterRadius} fill="none" stroke="#E2E8F0" strokeDasharray="2 2" />
            <circle r={precipRadius} fill="none" stroke="#E2E8F0" strokeDasharray="2 2" />

            {/* RING ANNOTATIONS */}
            <text fontSize="12px" fill="#475569" fontStyle="italic" transform="translate(0, 10px)">
              <textPath href={`#${uid}-arc-temp`} startOffset="50%" textAnchor="middle">
                Average annual temperature
              </textPath>
            </text>
            <text fontSize="12px" fill="#475569" fontStyle="italic">
              <textPath href={`#${uid}-arc-hi`} startOffset="50%" textAnchor="middle">
                Average annual heat index
              </textPath>
            </text>
            <text fontSize="12px" fill="#475569" fontStyle="italic">
              <textPath href={`#${uid}-arc-precip`} startOffset="50%" textAnchor="middle">
                Total annual precipitation
              </textPath>
            </text>

            {data.map((d) => {
              const angle = angleScale(d.year);
              const bandwidth = angleScale.bandwidth();
              const midAngle = angle + bandwidth / 2;

              const spikeHalfWidth = bandwidth * 0.1;
              const hiPath = spikePath(midAngle, spikeHalfWidth, hiInnerRadius, hiTipScale(d.annual_hi));
              const tempArcPath = tempArcGenerator({ startAngle: angle, endAngle: angle + bandwidth });

              const dotX = precipRadius * Math.sin(midAngle);
              const dotY = -precipRadius * Math.cos(midAngle);

              const labelX = yearLabelRadius * Math.sin(midAngle);
              const labelY = -yearLabelRadius * Math.cos(midAngle);
              const rotationDeg = (midAngle * 180) / Math.PI;

              const isTempHovered = hoveredInfo?.year === d.year && hoveredInfo?.metricLabel === 'Annual Temperature';
              const isHIHovered = hoveredInfo?.year === d.year && hoveredInfo?.metricLabel === 'Annual Heat Index';
              const isPrecipHovered = hoveredInfo?.year === d.year && hoveredInfo?.metricLabel === 'Total Precipitation';

              return (
                <g key={d.year}>
                  <text
                    x={labelX}
                    y={labelY}
                    transform={`rotate(${rotationDeg}, ${labelX}, ${labelY})`}
                    textAnchor="middle"
                    fontSize="11px"
                    fill="#64748B"
                  >
                    {d.year}
                  </text>

                  {/* 1. ANNUAL TEMPERATURE — solid arc ring segment */}
                  <path
                    d={tempArcPath}
                    fill={tempColorScale(d.annual_temp)}
                    stroke={isTempHovered ? '#0F172A' : 'none'}
                    strokeWidth={isTempHovered ? 2 : 0}
                    opacity={hoveredInfo && !isTempHovered ? 0.5 : 1}
                    style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                    onMouseEnter={(e) => handleMouseEnter(e, d.year, 'Annual Temperature', d.annual_temp, '°C')}
                    onMouseLeave={handleMouseLeave}
                  />

                  {/* 2. ANNUAL HEAT INDEX — thin straight-edged spike */}
                  <path
                    d={hiPath}
                    fill={hiColorScale(d.annual_hi)}
                    stroke={isHIHovered ? '#0F172A' : 'none'}
                    strokeWidth={isHIHovered ? 2 : 0}
                    opacity={hoveredInfo && !isHIHovered ? 0.5 : 1}
                    style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                    onMouseEnter={(e) => handleMouseEnter(e, d.year, 'Annual Heat Index', d.annual_hi, '°C')}
                    onMouseLeave={handleMouseLeave}
                  />

                  {/* 3. TOTAL PRECIPITATION — outer dot */}
                  <circle
                    cx={dotX}
                    cy={dotY}
                    r={precipSizeScale(d.annual_prep)}
                    fill={getPrecipitationColor(d.annual_prep)}
                    stroke={isPrecipHovered ? '#0F172A' : '#FFFFFF'}
                    strokeWidth={isPrecipHovered ? 2.5 : 1}
                    opacity={hoveredInfo && !isPrecipHovered ? 0.5 : 1}
                    style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                    onMouseEnter={(e) => handleMouseEnter(e, d.year, 'Total Precipitation', d.annual_prep, 'mm')}
                    onMouseLeave={handleMouseLeave}
                  />
                </g>
              );
            })}
          </g>
        </svg>

        {hoveredInfo && (
          <div
            style={{
              position: 'fixed',
              top: hoveredInfo.y,
              left: hoveredInfo.x,
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              pointerEvents: 'none',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
              zIndex: 100,
            }}
          >
            <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '2px' }}>
              Year: <strong>{hoveredInfo.year}</strong>
            </div>
            <div>
              {hoveredInfo.metricLabel}:{' '}
              <span style={{ color: '#38BDF8', fontWeight: 'bold' }}>
                {hoveredInfo.value} {hoveredInfo.unit}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------- */}
      {/* LEGENDS */}
      {/* -------------------------------------------------------------- */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap', marginTop: 16 }}>
        <GradientLegend label="Average annual temperature" stops={heatGradientStops} range={TEMP_RANGE} unit="°C" />
        <GradientLegend label="Average annual heat index" stops={heatGradientStops} range={HI_RANGE} unit="°C" />
        <PrecipLegend />
      </div>
    </div>
  );
}

function GradientLegend({ label, stops, range, unit }) {
  const { min, max, ticks } = range;
  return (
    <div style={{ textAlign: 'left', width: 200 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginBottom: 6 }}>{label}</div>
      <div style={{ width: '100%', height: 10, borderRadius: 5, background: cssGradient(stops) }} />
      <div style={{ position: 'relative', width: '100%', height: 16, marginTop: 2 }}>
        {ticks.map((t) => (
          <span
            key={t}
            style={{
              position: 'absolute',
              left: `${((t - min) / (max - min)) * 100}%`,
              transform: 'translateX(-50%)',
              fontSize: 10,
              color: '#64748B',
              whiteSpace: 'nowrap',
            }}
          >
            {t.toFixed(1)}
          </span>
        ))}
      </div>
    </div>
  );
}

function PrecipLegend() {
  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginBottom: 6 }}>Total annual precipitation</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {PRECIP_BINS.map((b) => (
          <div key={b.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: 62 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: b.color, display: 'inline-block' }} />
            <span style={{ fontSize: 9, color: '#64748B', textAlign: 'center' }}>{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}



// import React, { useState, useMemo } from 'react';
// import * as d3 from 'd3';

// // -----------------------------------------------------------------------------
// // 1. COLOR CONFIGURATIONS
// // -----------------------------------------------------------------------------

// // Total annual precipitation — discrete threshold bins (cool teal range, mm)
// const PRECIP_BINS = [
//   { max: 49.9, color: '#C4EBE6', label: '0–49.9 mm' },
//   { max: 99.9, color: '#8DE5E0', label: '50–99.9 mm' },
//   { max: 149.9, color: '#32C7C6', label: '100–149.9 mm' },
//   { max: 199.9, color: '#389998', label: '150–199.9 mm' },
//   { max: Infinity, color: '#1C4D4C', label: '200+ mm' },
// ];

// const getPrecipitationColor = (val) => PRECIP_BINS.find((b) => val <= b.max).color;

// // Shared warm gradient — used for BOTH annual temperature and annual heat
// // index, each scaled to its own *fixed reference range* (matching the
// // "Annual temperature range" / "Annual heat index range" scales) rather than
// // the min/max of whatever years happen to be filtered into view. This keeps
// // colors comparable across any date-range selection.
// const heatGradientStops = [
//   '#EDEDED',
//   '#B7BDF1',
//   '#A8E4CB',
//   '#FAE84A',
//   '#FFA179',
//   '#F25A2A',
//   '#861D68',
//   '#41033B',
// ];

// const TEMP_RANGE = [17.3, 37.6]; // annual temperature reference range (°C)
// const HI_RANGE = [16.0, 38.5]; // annual heat index reference range (°C)

// const cssGradient = (stops) => `linear-gradient(90deg, ${stops.join(', ')})`;

// // Builds a color scale whose domain is evenly spaced across a FIXED
// // reference range (rather than the data's own min/max), so the 8 gradient
// // stops line up with the published annual range for that metric.
// function makeFixedRangeColor([min, max], stops) {
//   const domain = stops.map((_, i) => min + (i * (max - min)) / (stops.length - 1));
//   const scale = d3
//     .scaleLinear()
//     .domain(domain)
//     .range(stops)
//     .interpolate(d3.interpolateRgb)
//     .clamp(true);
//   return { scale, min, max };
// }

// // 5 evenly-spaced tick labels across a range, matching the reference legend style
// function legendTicks([min, max]) {
//   const step = (max - min) / 4;
//   return [0, 1, 2, 3, 4].map((i) => +(min + i * step).toFixed(1));
// }

// // -----------------------------------------------------------------------------
// // 2. SPIKE SHAPE GENERATOR (heat index) — thin, slightly curved blade
// // -----------------------------------------------------------------------------
// function spikePath(midAngle, halfWidth, rBase, rTip) {
//   const bx = rBase * Math.sin(midAngle);
//   const by = -rBase * Math.cos(midAngle);
//   const tx = rTip * Math.sin(midAngle);
//   const ty = -rTip * Math.cos(midAngle);
//   const rMid = rBase + (rTip - rBase) * 0.55;
//   const lx = rMid * Math.sin(midAngle - halfWidth);
//   const ly = -rMid * Math.cos(midAngle - halfWidth);
//   const rx = rMid * Math.sin(midAngle + halfWidth);
//   const ry = -rMid * Math.cos(midAngle + halfWidth);
//   return `M ${bx} ${by} Q ${lx} ${ly} ${tx} ${ty} Q ${rx} ${ry} ${bx} ${by} Z`;
// }

// // Full-circle path (starting at 12 o'clock, running clockwise) used to run
// // annotation text around each ring's guideline, like the reference chart.
// function ringLabelPath(r) {
//   return `M 0 ${-r} A ${r} ${r} 0 1 1 -0.01 ${-r}`;
// }

// // -----------------------------------------------------------------------------
// // 3. VIEWPORT — fixed internal coordinate system, scaled responsively via viewBox
// // -----------------------------------------------------------------------------
// const VB = 800; // viewBox units (square)

// export default function RadialClimateChart({ data, maxWidth = 800 }) {
//   const [hoveredInfo, setHoveredInfo] = useState(null);

//   const outerRadius = VB / 2 - 100;
//   const precipRadius = outerRadius * 0.94;
//   const hiBaseRadius = outerRadius * 0.74;
//   const hiMaxRadius = precipRadius - 12;
//   const tempOuterRadius = outerRadius * 0.64;
//   const tempInnerRadius = outerRadius * 0.5;
//   const centerRadius = outerRadius * 0.28;

//   const { angleScale, tempColor, hiColor, precipSizeScale, tempArc } = useMemo(() => {
//     const years = data.map((d) => d.year);
//     const angle = d3.scaleBand().domain(years).range([0, 2 * Math.PI]).paddingInner(0.15);

//     const tempColorInfo = makeFixedRangeColor(TEMP_RANGE, heatGradientStops);
//     const hiColorInfo = makeFixedRangeColor(HI_RANGE, heatGradientStops);

//     const precipSize = d3
//       .scaleSqrt()
//       .domain([0, d3.max(data, (d) => d.annual_prep)])
//       .range([4, 11]);

//     const arcGen = d3
//       .arc()
//       .innerRadius(tempInnerRadius)
//       .outerRadius(tempOuterRadius)
//       .padAngle(0.015)
//       .cornerRadius(1);

//     return { angleScale: angle, tempColor: tempColorInfo, hiColor: hiColorInfo, precipSizeScale: precipSize, tempArc: arcGen };
//   }, [data, tempInnerRadius, tempOuterRadius]);

//   const hiTipScale = useMemo(
//     () =>
//       d3
//         .scaleLinear()
//         .domain(d3.extent(data, (d) => d.annual_hi))
//         .range([hiBaseRadius + (hiMaxRadius - hiBaseRadius) * 0.12, hiMaxRadius])
//         .clamp(true),
//     [data, hiBaseRadius, hiMaxRadius]
//   );

//   const handleMouseEnter = (event, year, metricLabel, value, unit) => {
//     setHoveredInfo({ year, metricLabel, value, unit, x: event.clientX + 15, y: event.clientY - 15 });
//   };
//   const handleMouseMove = (event) => {
//     if (hoveredInfo) setHoveredInfo((prev) => (prev ? { ...prev, x: event.clientX + 15, y: event.clientY - 15 } : null));
//   };
//   const handleMouseLeave = () => setHoveredInfo(null);

//   return (
//     <div style={{ width: '100%', maxWidth, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
//       <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
//         <svg
//           viewBox={`0 0 ${VB} ${VB}`}
//           width="100%"
//           height="100%"
//           style={{ display: 'block' }}
//           onMouseMove={handleMouseMove}
//         >
//           <defs>
//             <path id="ring-precip" d={ringLabelPath(precipRadius + 16)} />
//             <path id="ring-hi" d={ringLabelPath(hiMaxRadius + 16)} />
//             <path id="ring-temp" d={ringLabelPath(tempOuterRadius + 16)} />
//           </defs>

//           <g transform={`translate(${VB / 2}, ${VB / 2})`}>
//             {/* CENTER */}
//             <circle r={centerRadius - 10} fill="none" stroke="#E2E8F0" strokeDasharray="3 3" />
//             <text textAnchor="middle" dy="0.35em" fontSize="18px" fontWeight="700" fill="#0F172A">
//               ABU DHABI
//             </text>

//             {/* BAND GUIDELINES */}
//             <circle r={tempInnerRadius} fill="none" stroke="#E2E8F0" strokeDasharray="2 2" />
//             <circle r={tempOuterRadius} fill="none" stroke="#E2E8F0" strokeDasharray="2 2" />
//             <circle r={hiBaseRadius} fill="none" stroke="#E2E8F0" strokeDasharray="2 2" />
//             <circle r={precipRadius} fill="none" stroke="#E2E8F0" strokeDasharray="2 2" />

//             {/* RING ANNOTATIONS */}
//             <text fontSize="13px" fill="#334155" fontWeight="600">
//               <textPath href="#ring-temp" startOffset="1%">
//                 Average annual temperature
//               </textPath>
//             </text>
//             <text fontSize="13px" fill="#334155" fontWeight="600">
//               <textPath href="#ring-hi" startOffset="1%">
//                 Average annual heat index
//               </textPath>
//             </text>
//             <text fontSize="13px" fill="#334155" fontWeight="600">
//               <textPath href="#ring-precip" startOffset="1%">
//                 Total annual precipitation
//               </textPath>
//             </text>

//             {data.map((d) => {
//               const angle = angleScale(d.year);
//               const bandwidth = angleScale.bandwidth();
//               const midAngle = angle + bandwidth / 2;
//               const spikeHalfWidth = bandwidth * 0.14; // thin, slightly curved

//               const hiPath = spikePath(midAngle, spikeHalfWidth, hiBaseRadius, hiTipScale(d.annual_hi));

//               const tempArcPath = tempArc({ startAngle: angle, endAngle: angle + bandwidth });

//               const dotX = precipRadius * Math.sin(midAngle);
//               const dotY = -precipRadius * Math.cos(midAngle);

//               const labelRadius = outerRadius + 14;
//               const labelX = labelRadius * Math.sin(midAngle);
//               const labelY = -labelRadius * Math.cos(midAngle);
//               const rotationDeg = (midAngle * 180) / Math.PI;

//               const isTempHovered = hoveredInfo?.year === d.year && hoveredInfo?.metricLabel === 'Annual Temperature';
//               const isHIHovered = hoveredInfo?.year === d.year && hoveredInfo?.metricLabel === 'Annual Heat Index';
//               const isPrecipHovered = hoveredInfo?.year === d.year && hoveredInfo?.metricLabel === 'Total Precipitation';

//               return (
//                 <g key={d.year}>
//                   <text
//                     x={labelX}
//                     y={labelY}
//                     transform={`rotate(${rotationDeg}, ${labelX}, ${labelY})`}
//                     textAnchor="middle"
//                     fontSize="11px"
//                     fill="#64748B"
//                   >
//                     {d.year}
//                   </text>

//                   {/* 1. ANNUAL TEMPERATURE (INNER SOLID RING) */}
//                   <path
//                     d={tempArcPath}
//                     fill={tempColor.scale(d.annual_temp)}
//                     stroke={isTempHovered ? '#0F172A' : 'none'}
//                     strokeWidth={isTempHovered ? 2 : 0}
//                     opacity={hoveredInfo && !isTempHovered ? 0.5 : 1}
//                     style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
//                     onMouseEnter={(e) => handleMouseEnter(e, d.year, 'Annual Temperature', d.annual_temp, '°C')}
//                     onMouseLeave={handleMouseLeave}
//                   />

//                   {/* 2. ANNUAL HEAT INDEX (THIN OUTWARD SPIKE) */}
//                   <path
//                     d={hiPath}
//                     fill={hiColor.scale(d.annual_hi)}
//                     stroke={isHIHovered ? '#0F172A' : 'none'}
//                     strokeWidth={isHIHovered ? 2 : 0}
//                     opacity={hoveredInfo && !isHIHovered ? 0.5 : 1}
//                     style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
//                     onMouseEnter={(e) => handleMouseEnter(e, d.year, 'Annual Heat Index', d.annual_hi, '°C')}
//                     onMouseLeave={handleMouseLeave}
//                   />

//                   {/* 3. TOTAL PRECIPITATION (OUTER DOT) */}
//                   <circle
//                     cx={dotX}
//                     cy={dotY}
//                     r={precipSizeScale(d.annual_prep)}
//                     fill={getPrecipitationColor(d.annual_prep)}
//                     stroke={isPrecipHovered ? '#0F172A' : '#FFFFFF'}
//                     strokeWidth={isPrecipHovered ? 2.5 : 1}
//                     opacity={hoveredInfo && !isPrecipHovered ? 0.5 : 1}
//                     style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
//                     onMouseEnter={(e) => handleMouseEnter(e, d.year, 'Total Precipitation', d.annual_prep, 'mm')}
//                     onMouseLeave={handleMouseLeave}
//                   />
//                 </g>
//               );
//             })}
//           </g>
//         </svg>

//         {hoveredInfo && (
//           <div
//             style={{
//               position: 'fixed',
//               top: hoveredInfo.y,
//               left: hoveredInfo.x,
//               backgroundColor: '#0F172A',
//               color: '#FFFFFF',
//               padding: '8px 12px',
//               borderRadius: '6px',
//               fontSize: '12px',
//               pointerEvents: 'none',
//               boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
//               zIndex: 100,
//             }}
//           >
//             <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '2px' }}>
//               Year: <strong>{hoveredInfo.year}</strong>
//             </div>
//             <div>
//               {hoveredInfo.metricLabel}:{' '}
//               <span style={{ color: '#38BDF8', fontWeight: 'bold' }}>
//                 {hoveredInfo.value} {hoveredInfo.unit}
//               </span>
//             </div>
//           </div>
//         )}
//       </div>

//       {/* -------------------------------------------------------------- */}
//       {/* LEGENDS */}
//       {/* -------------------------------------------------------------- */}
//       <div
//         style={{
//           display: 'flex',
//           justifyContent: 'center',
//           gap: 'clamp(16px, 4vw, 40px)',
//           flexWrap: 'wrap',
//           marginTop: 8,
//           padding: '0 12px',
//         }}
//       >
//         <GradientLegend label="Annual temperature range" stops={heatGradientStops} range={TEMP_RANGE} unit="°C" />
//         <GradientLegend label="Annual heat index range" stops={heatGradientStops} range={HI_RANGE} unit="°C" />
//         <PrecipLegend />
//       </div>
//     </div>
//   );
// }

// function GradientLegend({ label, stops, range, unit }) {
//   const ticks = legendTicks(range);
//   return (
//     <div style={{ textAlign: 'center', flex: '1 1 180px', maxWidth: 220 }}>
//       <div style={{ fontSize: 'clamp(11px, 1.4vw, 12px)', fontWeight: 600, color: '#0F172A', marginBottom: 6 }}>{label}</div>
//       <div style={{ width: '100%', height: 10, borderRadius: 5, background: cssGradient(stops) }} />
//       <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'clamp(9px, 1.2vw, 10px)', color: '#64748B', marginTop: 4 }}>
//         {ticks.map((t) => (
//           <span key={t}>
//             {t}
//             {unit}
//           </span>
//         ))}
//       </div>
//     </div>
//   );
// }

// function PrecipLegend() {
//   return (
//     <div style={{ textAlign: 'center', flex: '1 1 260px', maxWidth: 320 }}>
//       <div style={{ fontSize: 'clamp(11px, 1.4vw, 12px)', fontWeight: 600, color: '#0F172A', marginBottom: 6 }}>Total annual precipitation</div>
//       <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', justifyContent: 'center', flexWrap: 'wrap' }}>
//         {PRECIP_BINS.map((b) => (
//           <div key={b.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
//             <span style={{ width: 12, height: 12, borderRadius: '50%', background: b.color, display: 'inline-block' }} />
//             <span style={{ fontSize: 9, color: '#64748B', whiteSpace: 'nowrap' }}>{b.label}</span>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }