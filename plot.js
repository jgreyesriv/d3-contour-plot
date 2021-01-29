document.addEventListener('DOMContentLoaded', () => {
  const margin = { top: 10, right: 50, bottom: 20, left: 30, z: 25 },
        width  = 500 + margin.left + margin.right + margin.z,
        height = 500 + margin.bottom + margin.top;

  const ncont = 7;

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
  const sc = d3.scaleSequential(d3.interpolateRdYlGn)
    .domain(sz.domain());
  const scn = d3.scaleSequential(d3.interpolateRdYlGn)
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

  svg.append('g').selectAll('circle').data(data).join('circle')
    .attrs(d => ({
      cx: sx(d[0]), cy: sy(d[1]), r: 1,
      fill: sc(d[2])
    }));

  const [z0,z3] = sz.domain();
  const dz = (z3-z0)/ncont;

  const cont_pts = [ ];

  const points_on_edge = ((x1,y1,z1,x2,y2,z2) => {
    if (z1 > z2) [x1,y1,z1,x2,y2,z2] = [x2,y2,z2,x1,y1,z1];
    const dxdz = (x2-x1)/(z2-z1), x0 = x1 - dxdz*z1;
    const dydz = (y2-y1)/(z2-z1), y0 = y1 - dydz*z1;
    for (let i=Math.ceil((z1-z0)/dz); ; ++i) {
      const z = z0 + i*dz;
      if (z > z2) break;
      cont_pts.push([ x0 + dxdz*z, y0 + dydz*z, i ]);
    }
  });

  { const {points, halfedges, triangles, hull} = delaunay;
    const point = (i => {
      const z = data[i][2];
      return [ points[i*=2], points[i+1], z ];
    });
    for (let i=halfedges.length; i; ) { --i;
      const j = halfedges[i];
      if (j < i) continue;
      points_on_edge(...point(triangles[i]), ...point(triangles[j]));
    }
    let i = hull.length;
    if (i) {
      let h1, h2 = point(hull[--i]);
      while (i) {
        h1 = h2;
        h2 = point(hull[--i]);
        points_on_edge(...h1, ...h2);
      }
      points_on_edge(...h2, ...point(hull[hull.length-1]));
    }
  }

  svg.append('g').selectAll('circle').data(cont_pts).join('circle')
    .attrs(d => ({
      cx: d[0], cy: d[1], r: 2,
      fill: scn(d[2])
    }));
});
