let repo = 'ivankp/d3-contour-plot';

async function github_api(req) {
  let r = await fetch(
    'https://api.github.com/repos/'+repo+(req&&req[0]!=='/'?'/':'')+req,
    { method: 'GET',
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
  if (!r.ok) throw new Error(
    `Error fetching "${req}": ${r.status}: ${r.statusText}`);
  r = await r.json();
  if ('message' in r) throw new Error(
    `Error fetching "${req}": ${r.message}`);
  return r;
}

async function get_data_files() {
  const info = await github_api('');
  const { default_branch } = info;
  const { tree, truncated } = await github_api(
    'git/trees/'+default_branch+':data?recursive=1');
  if (truncated) throw new Error('Tree was truncated');
  return { tree, branch: default_branch };
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

document.addEventListener('DOMContentLoaded', () => {
  { const m = window.location.href.match(
      /^https?:\/\/([^.]+)\.github\.io\/([^\/]+)/);
    if (m) repo = m[1]+'/'+m[2];
    _id('github').href = 'https://github.com/'+repo;
  }
  (async () => {
    let current_path = [ ];
    let node = make(_id('menu'),'ul');
    node.className = 'file-tree';
    const { tree, branch } = await get_data_files();
    for (const f of tree) {
      if (f.type!=='blob') continue;
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
      const span = make(node,'li','span');
      span.classList.add('file');
      span.textContent = name.replace(/\.json$/,'');
      span.onclick = async function() {
        const r = await fetch(
          'https://raw.githubusercontent.com/'+repo+'/'+branch
          +'/data/'+encodeURIComponent(f.path),
          { method: 'GET' });
        if (!r.ok) throw new Error(
          `Error fetching "${req}": ${r.status}: ${r.statusText}`);
        make_contour_plot(clear(_id('plot')), await r.json());
      };
    }
  })();
});

function make_contour_plot(fig,{data,title,vars}) {
  if (!Array.isArray(data)) {
    alert('data must be an array');
    return;
  }
  if (data.length < 3) {
    alert('data array must contain at least 3 points');
    return;
  }

  make(fig,'figcaption').textContent = title;

  const margin = { top: 10, right: 50, bottom: 20, left: 30, z: 25 },
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

  const svg = d3.select(fig).append('svg')
    .attrs({ viewBox: [0,0,width,height], width: width, height: height });

  const ax = d3.axisBottom(sx);
  const ay = d3.axisLeft(sy);
  const az = d3.axisRight(sz);

  svg.append('g').attrs({
    transform: `translate(0,${height-margin.bottom})`
  }).call(ax);
  svg.append('g').attrs({
    transform: `translate(${margin.left},0)`
  }).call(ay);
  svg.append('g').attrs({
    transform: `translate(${width-margin.right},0)`
  }).call(az);

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
      .attrs({ x: width-margin.right-margin.z, width: margin.z })
      .attrs(i => ({
        y: color_scale_edges[i],
        height: color_scale_edges[i+1] - color_scale_edges[i] + 1,
        fill: scn(ncont-i-1)
      }));
  }

  const delaunay = d3.Delaunay.from(data, d => sx(d[0]), d => sy(d[1]));
  const {points, halfedges, triangles, hull} = delaunay;

  // // draw triangulation
  // svg.append('path').attrs({
  //   d: delaunay.render(),
  //   fill: 'none',
  //   stroke: '#000'
  // });

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
      cont_pts.push([ v1, v2, c, t, x0 + dxdz*z, y0 + dydz*z ]);
    }
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

  // // draw interpolation points
  // svg.append('g').selectAll('circle').data(cont_pts).join('circle')
  //   .attrs(p => ({
  //     cx: p[4], cy: p[5], r: 2,
  //     fill: scn(p[2])
  //   }));

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

  { // Fill contours ================================================
    const open_ends = Array(open_chains.length*2);
    for (let i=open_chains.length; i;) {
      const p0 = open_chains[--i];
      let prev = p0, p = p0[6];
      for (;;) {
        if (p[3]==null) break;
        const i = p[6]==prev ? 7 : 6;
        p = (prev = p)[i];
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

    for (let i=0, n=open_ends.length, nh=hull.length; i<n; ++i) {
      const p1 = open_ends[i];
      if (!p1) continue;
      let j = (i+1)%n;
      let p2 = open_ends[j];
      const e1 = p1[3];
      let e2 = p2[3];
      if (e1[2] < e2[2] || p1[2]===p2[2]) { // fill forward
        while (!p2 || p1[2]!==p2[2])
          p2 = open_ends[j=(j+1)%n];
        e2 = p2[3];
        for (let h=p2[0], h1=p1[0]; h!==h1; h=(h||nh)-1) {
          const k = hull[h]*2;
          e2.push((e2 = [,,,, points[k], points[k+1], e2 ]));
        }
      } else { // fill backward
        j = i;
        do {
          p2 = open_ends[j=(j||n)-1];
        } while (!p2 || p1[2]!==p2[2]);
        e2 = p2[3];
        for (let h=p2[0], h1=p1[0]; h!==h1; h=(h+1)%nh) {
          const k = hull[h]*2;
          e2.push((e2 = [,,,, points[k], points[k+1], e2 ]));
        }
      }
      e1.push(e2);
      e2.push(e1);
      closed_chains.push(e1);
      open_ends[i] = null;
      open_ends[j] = null;
    }
  }

  // Draw contours ==================================================
  let g = svg.append('g').style('stroke','none');

  g.selectAll('path').data(
    closed_chains
  ).join('path')
    .attrs(p0 => {
      const c = scn(p0[2]);
      let fill = 'none';
      let path = `M${p0[4]} ${p0[5]}`;
      let prev = p0, p = p0[6];
      for (;;) {
        if (p===p0) {
          path += 'z';
          fill = c;
          break;
        }
        path += `L${p[4]} ${p[5]}`;
        if (p.length < 8) break;
        const i = p[6]==prev ? 7 : 6;
        p = (prev = p)[i];
      }
      return { d: path, fill };
    });

  g.append('path').lower().attrs({
      d: delaunay.renderHull(),
      fill: scn(0)
    });

  g = svg.append('g').styles({
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
