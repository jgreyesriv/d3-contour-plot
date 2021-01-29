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
  // const sc = d3.scaleSequential(d3.interpolateViridis)
  //   .domain(sz.domain());
  // const sn = d3.scaleLinear()
  //   .domain([0,ncont-1])
  //   .range(sz.domain());
  //   // .clamp(true);
  const sc = d3.scaleSequential(d3.interpolateRdYlGn)
    .domain(sz.domain());
  const scn = d3.scaleSequential(d3.interpolateRdYlGn)
    .domain([0,ncont-1]);
  // const sn = d3.scaleQuantize()
  //   .domain(sz.domain())
  //   .range([ncont,0]);

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

  // console.log(delaunay.triangles);
  // console.log(delaunay.triangles.slice(0,3));
  // console.log(Array.from(delaunay.triangles.slice(0,3)).map(i => data[i]));

  // svg.append('g').selectAll('circle').data(
  //   Array.from(delaunay.triangles.slice(0,3)).map(i => data[i])
  // ).join('circle')
  //   .attrs({ cx: d => sx(d[0]), cy: d => sy(d[1]), r: 2, fill: 'red'});
  // svg.append('g').selectAll('circle').data(
  //   delaunay.triangles.slice(3,6)
  // ).join('circle')
  //   .attrs({ cx: i => sx(data[i][0]), cy: i => sy(data[i][1]), r: 1, fill: 'white'});

  const edges = [ ];
  { const {points, halfedges, triangles, hull} = delaunay;
    for (let i = 0, n = halfedges.length; i < n; ++i) {
      const j = halfedges[i];
      if (j < i) continue;
      let ti = triangles[i];
      let tj = triangles[j];
      const zi = data[ti][2];
      const zj = data[tj][2];
      edges.push([
        [ points[ti*=2], points[ti + 1], zi ],
        [ points[tj*=2], points[tj + 1], zj ]
        // [ sx(data[ti][0]), sy(data[ti][1]) ],
        // [ sx(data[tj][0]), sy(data[tj][1]) ]
      ].sort((a,b) => a[2]-b[2]));
    }
    // let h = hull[0];
    // for (let i = 0, n = hull.length; i < n; ++i) {
    // }
  }
  // edges.sort();
  // for (let i=0, n=edges.length-1; i<n; ++i)
  //   if (edges[i]==edges[i+1]) console.log(edges[i]);

  // svg.append('g').selectAll('path').data(edges).join('path')
  //   .attrs({
  //     d: d => `M${d[0][0]} ${d[0][1]}L${d[1][0]} ${d[1][1]}`,
  //     fill: 'none', stroke: '#000'
  //   });

  const [z0,z3] = sz.domain();
  const dz = (z3-z0)/ncont;

  const cont_pts = [ ];

  for (let ei=edges.length; ei; ) {
    const e = edges[--ei];
    const [x1,y1,z1] = e[0],
          [x2,y2,z2] = e[1];
    const dxdz = (x2-x1)/(z2-z1), x0 = x1 - dxdz*z1;
    const dydz = (y2-y1)/(z2-z1), y0 = y1 - dydz*z1;
    for (let i=Math.ceil((z1-z0)/dz); ; ++i) {
      const z = z0 + i*dz;
      if (z > z2) break;
      cont_pts.push([ x0 + dxdz*z, y0 + dydz*z, i ]);
    }
  }

  svg.append('g').selectAll('circle').data(cont_pts).join('circle')
    .attrs(d => ({
      cx: d[0], cy: d[1], r: 2,
      fill: scn(d[2])
    }));
});
