let repo = 'jgreyesriv/d3-contour-plot';
let branch = 'master';

function error(e) {
  if (e instanceof Error) {
    alert(e.message);
    throw e;
  } else {
    alert(e);
    throw new Error(e);
  }
}

async function github_api(req) {
  let r = await fetch(
    'https://api.github.com/repos/'+repo+(req&&req[0]!=='/'?'/':'')+req,
    { method: 'GET',
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
  if (!r.ok) error(`Error fetching "${req}": ${r.status}: ${r.statusText}`);
  r = await r.json();
  if ('message' in r) error(`Error fetching "${req}": ${r.message}`);
  return r;
}

async function get_data_files() {
  const { tree, truncated } = await github_api(
    'git/trees/'+branch+':data?recursive=1');
  if (truncated) error('Tree was truncated');
  return tree;
}

let plot_data;
async function load_plot(path) {
  const r = await fetch(
    'https://raw.githubusercontent.com/'+repo+'/'+branch+'/data/'+path+'.json',
    { method: 'GET' });
  if (!r.ok) error(`Error fetching "${req}": ${r.status}: ${r.statusText}`);
  plot_data = await r.json().catch(error);
  make_contour_plot();
}

const _id = id => document.getElementById(id);
function make(p,...tags) {
  for (const t of tags)
    p = p.appendChild(document.createElement(t))
  return p;
}
function clear(x) {
  for (let c; c = x.firstChild; ) x.removeChild(c);
  return x;
}
const round = x => x.toFixed(4).replace(/\.?0*$/,'');

document.addEventListener('DOMContentLoaded', () => {
  const search = window.location.search.match(/(?<=\?)[^&]*/);
  const href = window.location.href.replace(/\?.*/,'');
  { const m = href.match(/^https?:\/\/([^\/]+)\.github\.io(\/[^\/]+)/);
    if (m) repo = m[1]+m[2];
    _id('github').href = 'https://github.com/'+repo;
  }
  (async () => {
    branch = (await github_api('')).default_branch;

    let current_path = [ ];
    let node = make(_id('menu'),'ul');
    node.className = 'file-tree';
    const tree = await get_data_files();
    for (const f of tree) {
      if (f.type!=='blob' || !f.path.endsWith('.json')) continue;
      const path = f.path.split('/');
      const name = path.pop();
      let n = 0;
      while (n < path.length && current_path[n]===path[n]) ++n;
      while (current_path.length > n) {
        current_path.pop();
        node = node.parentNode.parentNode;
      }
      current_path = path;
      while (n < path.length) {
        const li = make(node,'li');
        const span = make(li,'span');
        span.classList.add('dir');
        span.textContent = path[n];
        node = make(li,'ul');
        ++n;
        span.onclick = function() {
          this.parentNode.classList.toggle("exp");
        };
      }
      { const path = encodeURIComponent(f.path.replace(/\.json$/,''));
        const link = make(node,'li','a');
        link.textContent = name.replace(/\.json$/,'');
        link.href = 'https://raw.githubusercontent.com/'
          + repo+'/'+branch+'/data/'+path+'.json';
        link.target = '_blank';
        link.onclick = function(e) {
          e.preventDefault();
          window.history.pushState({ path }, '', href+'?'+path);
          load_plot(path);
        };
      }
    }

    if (search) {
      const path = search[0];
      load_plot(path).then(() => {
        window.history.replaceState({ path }, '', href+'?'+path);
      }).catch(e => {
        console.error(e);
        window.history.replaceState({ }, '', href);
      });
    }
  })();

  for (const x of _id('options').querySelectorAll('input[type="checkbox"]'))
    x.onchange = make_contour_plot;
});
window.onpopstate = function(e) {
  load_plot(e.state.path);
};

function make_contour_plot() {
  const { data, title, vars } = plot_data;

  if (!Array.isArray(data)) {
    alert('data must be an array');
    return;
  }
  if (data.length < 3) {
    alert('data array must contain at least 3 points');
    return;
  }

  const opts = { };
  for (const x of _id('options').querySelectorAll('input[type="checkbox"]'))
    opts[x.name] = x.checked;

  const fig = clear(_id('plot'));
  { const cap = make(fig,'figcaption');
    title.split(/\^(\d+)/).forEach((x,i) => {
      if (i%2) make(cap,'sup').textContent = x;
      else cap.appendChild(document.createTextNode(x));
    });
  }

  const margin = { top: 10, right: 50, bottom: 20, left: 30, z: 25, zleft: 2 },
        width  = 500 + margin.left + margin.right + margin.z,
        height = 500 + margin.bottom + margin.top;

  const ncont = 28;

  const sx = d3.scaleLinear()
    .domain(d3.extent(data, d => d[0])).nice()
    .range([margin.left, width - margin.right - margin.z]);
  const sy = d3.scaleLinear()
    .domain(d3.extent(data, d => d[1])).nice()
    .range([height - margin.bottom, margin.top]);
  const ry = sy.range();
  { const a = Math.round((ry[0]-ry[1])/10);
    ry[0] -= a;
    ry[1] += a;
  }
  const sz = d3.scaleLinear()
    .domain(d3.extent(data, d => d[2])).nice()
    .range(ry);
  // https://github.com/d3/d3-scale-chromatic
  const sc = d3.scaleSequential(d3.interpolateTurbo) // Viridis, Turbo, RdYlGn
    .domain(sz.domain());
  const scn = d3.scaleSequential(d3.interpolateTurbo)
    .domain([-1,ncont-1]);

  const ax = d3.axisBottom(sx);
  const ay = d3.axisLeft(sy);
  const az = d3.axisRight(sz);

  const svg = d3.select(fig).append('svg')
    .attrs({ viewBox: [0,0,width,height], width: width, height: height });

  const g_axes = svg.append('g')
  g_axes.append('g').attrs({
    transform: `translate(0,${height-margin.bottom})`
  }).call(ax);
  g_axes.append('g').attrs({
    transform: `translate(${margin.left},0)`
  }).call(ay);
  g_axes.append('g').attrs({
    transform: `translate(${width-margin.right+margin.zleft},0)`
  }).call(az);
  g_axes.selectAll('line,path').attr('stroke','#000');
  g_axes.selectAll('text').attr('fill','#000');
  g_axes.selectAll('*').attr('class',null);

  { // Draw color scale =============================================
    const color_scale_edges = Array(ncont+1);
    { const [b,a] = sz.range(), d = (b-a)/ncont;
      for (let i=ncont; i; ) { --i;
        color_scale_edges[i] = Math.ceil(a + d*i);
      }
      color_scale_edges[ncont] = b;
    }

    svg.append('g').style('stroke','none')
      .selectAll("rect").data(d3.range(ncont)).join("rect")
      .attrs({ x: width-margin.right-margin.z+margin.zleft, width: margin.z })
      .attrs(i => ({
        y: color_scale_edges[i],
        height: color_scale_edges[i+1] - color_scale_edges[i] + 1,
        fill: scn(ncont-i-1)
      }));
  }

  const delaunay = d3.Delaunay.from(data, d => sx(d[0]), d => sy(d[1]));
  const {points, halfedges, triangles, hull} = delaunay;

  const [z0,z3] = sz.domain();
  const dz = (z3-z0)/ncont;

  // Interpolate along triangulation edges ==========================
  const cont_pts = [ ];

  const points_on_edge = ((p1,p2,t) => {
    if (p1[2] > p2[2]) [p1,p2] = [p2,p1];
    const dxdz = (p2[0]-p1[0])/(p2[2]-p1[2]), x0 = p1[0] - dxdz*p1[2];
    const dydz = (p2[1]-p1[1])/(p2[2]-p1[2]), y0 = p1[1] - dydz*p1[2];
    for (let c=Math.ceil((p1[2]-z0)/dz); ; ++c) {
      const z = z0 + c*dz;
      if (z > p2[2]) break;
      let v1 = p1[3], v2 = p2[3];
      if (v1 > v2) [v1,v2] = [v2,v1];
      cont_pts.push([ v1, v2, c, t, x0 + dxdz*z, y0 + dydz*z ]); // *****
    }
  });
  const make_polygon = ((p0) => {
    const polygon = [ [p0[4],p0[5]] ];
    for (let p1 = p0, p = p0[6]; p!==p0; ) {
      polygon.push([p[4],p[5]]);
      const j = p[6]==p1 ? 7 : 6;
      p = (p1 = p)[j];
    }
    return polygon;
  });

  { const point = (i => [ points[i*2], points[i*2+1], data[i][2], i ]);
    let i = halfedges.length;
    while (i) {
      const j = halfedges[--i];
      if (j < i) continue;
      points_on_edge(point(triangles[i]), point(triangles[j]), i);
    }
    if ((i = hull.length)>1) {
      let h = point(hull[0]);
      while (i)
        points_on_edge(h, (h = point(hull[--i])));
    }
  }
  cont_pts.sort(([a1,a2,a3],[b1,b2,b3]) => a1-b1 || a2-b2 || a3-b3);

  const c_points = new Float32Array(cont_pts.length*3);
  for (let i=cont_pts.length; i; ) {
    let j = (--i)*3;
    c_points[  j] = cont_pts[i][4];
    c_points[++j] = cont_pts[i][5];
    c_points[++j] = cont_pts[i][2];
  }

  // Connect points on contours =====================================
  const open_chains = [ ];
  const closed_chains = [ ];

  // TODO: test for only 3 points
  for (let i=0, n=cont_pts.length, prev_t, v; i<n; ++i) {
    const pi = cont_pts[i];
    if (pi===null) continue;
    let t = pi[3];
    if (t==null) continue;
    if (t!==prev_t) {
      prev_t = t;
      t = [ t, halfedges[t] ];
      v = [ triangles[t[0]], triangles[t[1]], null, null ];

      for (let k=2; k; ) {
        for (let l=t[--k];;) {
          if (!((++l)%3)) l-=3;
          const p = triangles[l];
          if (p!==v[1-k]) {
            v[2+k] = p;
            break;
          }
        }
      }
    }

    cont_pts[i] = null;
    linking_loop:
    for (let l=2; l<4; ++l) {
      for (let k=0; k<2; ++k) {
        const u = [ v[k], v[l] ];
        if (u[0] > u[1]) [u[0],u[1]] = [u[1],u[0]];
        let j = cont_pts.findIndex( // TODO: binary search
          p => p && p[0]===u[0] && p[1]===u[1] && p[2]===pi[2]
        );
        if (j===-1) continue;
        let pj = cont_pts[j];
        pi.push(pj);
        pj.push(pi);
        if (pj[3]==null) { // check if chain is complete
          cont_pts[j] = null;
          let prev = pj, p = pj[6];
          for (;;) {
            if (p.length < 8) {
              if (p[3]==null) open_chains.push(pj);
              break;
            }
            const i = p[6]==prev ? 7 : 6;
            p = (prev = p)[i];
          }
        } if (pj.length===8) {
          cont_pts[j] = null;
          let prev = pj, p = pj[6];
          for (;;) {
            if (p.length < 8) {
              if (p[3]!=null) break;
              if (pj[3]==null) {
                open_chains.push(pj);
                break;
              }
              prev = p;
              p = pj[7];
              pj = prev;
              continue;
            }
            if (p===pj) {
              closed_chains.push(pj);
              break;
            }
            const i = p[6]==prev ? 7 : 6;
            p = (prev = p)[i];
          }
        }
        if (pi.length===8) break linking_loop;
      }
    }
  }

  let c_indices;
  let hull_color = 0;

  if (opts.fill) {
    const n  = open_chains.length*2;
    const nh = hull.length;
    const nclosed1 = closed_chains.length;
    const polygons = [ ];

    // Fix descending closed contours ===============================
    for (const p0 of closed_chains) {
      const ref = p0[ data[p0[0]][2] < data[p0[1]][2] ? 0 : 1 ]*2;
      const polygon = make_polygon(p0);
      polygons.push(polygon);
      if (d3.polygonContains( // descending if ref is inside
        polygon, [ points[ref], points[ref+1] ]
      )) --p0[2];
    }

    // Complete contours ============================================
    const open_ends = Array(n);
    for (let i=open_chains.length; i;) {
      const p0 = open_chains[--i];
      let prev = p0, p = p0[6];
      for (;;) {
        if (p[3]==null) break;
        const j = p[6]==prev ? 7 : 6;
        p = (prev = p)[j];
      }
      p = [ p0, p ];

      for (let j=2; j; ) {
        const pj = p[--j];
        const h = hull.findIndex( // TODO: binary search
          (h,i,hs) => {
            let h2 = hs[(i+1)%hs.length];
            if (h > h2) [h,h2] = [h2,h];
            return h===pj[0] && h2===pj[1];
          }
        );
        const ph = hull[h];
        const dx = points[ph*2  ] - pj[4];
        const dy = points[ph*2+1] - pj[5];
        open_ends[i*2+j] = [ h, dx*dx+dy*dy, i, pj ];
      }
    }
    open_ends.sort(([a1,a2],[b1,b2]) => a1-b1 || a2-b2);

    for (let i=0, m=n/2; m; i=(i+1)%n) {
      const p = open_ends[i];
      if (!p) continue;
      let h = p[0];
      let e = p[3];
      const c = e[2];

      let i2=i, p2;
      for (;;) {
        p2 = open_ends[i2=(i2+1)%n];
        if (p2 && p2[3][2]===c) break;
      }
      const h2 = p2[0];
      const e2 = p2[3];

      if (e2[2]===c && data[hull[h]][2] < data[hull[(h+1)%nh]][2]) {
        do {
          const k = hull[h=(h+1)%nh]*2;
          e.push((e = [,,,,points[k],points[k+1],e]));
        } while (h!==h2);
        e.push(e2);
        e2.push(e);
        open_ends[i ] = null;
        open_ends[i2] = null;
        const o = p[2], o2 = p2[2];
        if (o2===o) closed_chains.push(p[3]);
        else open_ends[open_ends.findIndex(p => p && p[2]===o2)][2] = o;
        --m;
      }
    }

    // bottom color =================================================
    const nclosed2 = closed_chains.length;
    for (let i=nclosed1; i<nclosed2; ++i)
      polygons.push(make_polygon(closed_chains[i]));

    closed1: for (let i=0; i<nclosed1; ++i) {
      for (let j=0; j<nclosed2; ++j)
        if (d3.polygonContains(polygons[j],polygons[i][0]))
          continue closed1;
      hull_color = closed_chains[i][2]+1;
      break;
    }

    // Sort contours by area ========================================
    c_indices = new Uint32Array(closed_chains.length);
    const c_areas = new Float32Array(closed_chains.length);
    for (let i=closed_chains.length; i; ) {
      let area = 0;
      const p0 = closed_chains[--i];
      let p1 = p0, p = p0[6];
      for (;;) {
        area += p1[4]*p[5] - p1[5]*p[4];
        if (p===p0) break;
        const j = p[6]==p1 ? 7 : 6;
        p = (p1 = p)[j];
      }
      c_areas[c_indices[i] = i] = Math.abs(area);
    }
    c_indices.sort((a,b) => c_areas[b] - c_areas[a]);
  }

  // Draw contours ==================================================
  let g = svg.append('g');
  g.style(opts.fill ? 'stroke' : 'fill', 'none');

  g.selectAll('path').data(
    (opts.fill
    ? function*(){
        for (const i of c_indices) yield closed_chains[i];
      }
    : function*(){
        for (const x of closed_chains) yield x;
        for (const x of open_chains) yield x;
      })()
  ).join('path')
    .attrs(p0 => {
      let d = `M${round(p0[4])} ${round(p0[5])}`;
      let prev = p0, p = p0[6];
      for (;;) {
        if (p===p0) {
          d += 'z';
          break;
        }
        d += `L${round(p[4])} ${round(p[5])}`;
        if (p.length < 8) break; // for open contours
        const j = p[6]==prev ? 7 : 6;
        p = (prev = p)[j];
      }
      const attrs = { d };
      attrs[opts.fill ? 'fill' : 'stroke'] = scn(p0[2]);
      return attrs;
    });

  { let h = hull[0]*2;
    let d = `M${round(points[h])} ${round(points[h+1])}`;
    for (let i=hull.length; i; ) {
      h = hull[--i]*2;
      d += `L${round(points[h])} ${round(points[h+1])}`;
    }
    d += 'z';
    const attrs = { d };
    attrs[opts.fill ? 'fill' : 'stroke'] = scn(hull_color);
    g.append('path').lower().attrs(attrs);
  }

  if (opts.tria) { // draw triangulation
    svg.append('path').attrs({
      d: delaunay.render(),
      fill: 'none', stroke: '#000', 'stroke-width': 0.5
    });
  }
  if (opts.dpts) { // draw data points
    svg.append('g').attrs({ stroke: '#000', 'stroke-width': 0.5 })
      .selectAll('circle').data(data).join('circle')
      .attrs(d => ({ cx: sx(d[0]), cy: sy(d[1]), r: 2, fill: sc(d[2]) }));
  }
  if (opts.ipts) { // draw interpolation points
    svg.append('g').attrs({ stroke: '#fff', 'stroke-width': 0.5 })
      .selectAll('circle').data(d3.range(cont_pts.length)).join('circle')
      .attrs(i => ({
        cx: c_points[i*=3], cy: c_points[++i], r: 2,
        fill: scn(c_points[++i])
      }));
  }

  // label axes
  g = svg.append('g').attrs({
    'font-family': 'sans-serif',
    'font-size': 12,
    'font-weight': 'bold'
  });
  g.append('text').attrs({
    x: width-margin.right-margin.z, y: height-margin.bottom-5,
    'text-anchor': 'end'
  }).text(vars[0]);
  g.append('text').attrs({
    x: margin.left+5, y: margin.top+10, 'text-anchor': 'start'
  }).text(vars[1]);
}

const dummy_a = document.createElement('a');

function save_svg(svg) {
  dummy_a.href = URL.createObjectURL(new Blob(
    [ '<?xml version="1.0" encoding="UTF-8"?>\n',
      svg.outerHTML
      // add xml namespace
      .replace(/^<svg\s*(?=[^>]*>)/,'<svg xmlns="'+svg.namespaceURI+'" ')
      // self-closing tags
      .replace(/<([^ <>\t]+)([^>]*)>\s*<\/\1>/g,'<$1$2/>')
      // terse style
      .replace(/(?<=style=")([^"]+)/g, (m,_1) => _1.replace(/\s*:\s*/g,':'))
      // hex colors
      .replace(/(?<=[:"])rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g,
        (m,_1,_2,_3) => [_1,_2,_3].reduce( (a,x) =>
          a+Math.round(parseFloat(x)).toString(16).padStart(2,'0'), '#')
      )
      // round translations
      .replace(/(?<=translate)\(([0-9.]+),([0-9.]+)\)/g,
        (m,_1,_2) => `(${round(parseFloat(_1))},${round(parseFloat(_2))})`
      )
    ],
    { type:"image/svg+xml;charset=utf-8" }
  ));
  dummy_a.download =
    decodeURIComponent(window.location.search.match(/(?<=\?)[^&]*/))
    .replaceAll('/',' ') + '.svg';
  dummy_a.click();
}

window.addEventListener('keydown', function(e) { // Ctrl + s
  if ( e.ctrlKey && !(e.shiftKey || e.altKey || e.metaKey)
    && ((e.which || e.keyCode) === 83)
  ) {
    const svg = _id('plot').querySelector('svg');
    if (svg) {
      e.preventDefault();
      save_svg(svg);
    }
  }
});
