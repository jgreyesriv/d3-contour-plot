document.addEventListener('DOMContentLoaded', () => {
  const margin = { top: 10, right: 50, bottom: 20, left: 30, z: 25 },
        width  = 500 + margin.left + margin.right + margin.z,
        height = 500 + margin.bottom + margin.top;

  const ncont = 14;

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
  const sc = d3.scaleSequential(d3.interpolateTurbo) // Viridis, RdYlGn
    .domain(sz.domain());
  const scn = d3.scaleSequential(d3.interpolateTurbo)
    .domain([0,ncont-1]);

  const svg = d3.select('#main').append('svg')
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

  { // draw color scale
    const color_scale_edges = Array(ncont+1);
    { const [b,a] = sz.range(), d = (b-a)/ncont;
      for (let i=ncont; i; ) { --i;
        color_scale_edges[i] = Math.ceil(a + d*i);
      }
      color_scale_edges[ncont] = b;
    }

    svg.append('g').selectAll("rect")
      .data(d3.range(ncont).map(i => [
        color_scale_edges[i],
        color_scale_edges[i+1] - color_scale_edges[i] + 1,
        scn(ncont-i-1)
      ]))
    .enter().append("rect")
      .attrs({ x: width-margin.right-margin.z, width: margin.z })
      .attrs(y => ({ y: y[0], height: y[1], fill: y[2] }));
  }

  const delaunay = d3.Delaunay.from(data, d => sx(d[0]), d => sy(d[1]));

  svg.append('path').attrs({
    d: delaunay.render(),
    fill: 'none',
    stroke: '#000'
  });

  const [z0,z3] = sz.domain();
  const dz = (z3-z0)/ncont;

  const {points, halfedges, triangles, hull} = delaunay;
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

  svg.append('g').selectAll('circle').data(cont_pts).join('circle')
    .attrs(p => ({
      cx: p[4], cy: p[5], r: 2,
      fill: scn(p[2])
    }));

  const chains = [ ];

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
              if (p[3]==null) chains.push(pj);
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
                chains.push(pj);
                break;
              }
              prev = p;
              p = pj[7];
              pj = prev;
              continue;
            }
            if (p===pj) {
              chains.push(pj);
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

  svg.append('g').selectAll('path').data(chains).join('path')
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
      return { d: path, stroke: c, fill };
    });
});
