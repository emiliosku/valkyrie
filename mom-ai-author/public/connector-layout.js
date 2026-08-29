'use strict';

(function exposeLayout(root) {
  const dimensions = { '1x2': { width: 2, height: 1 }, '2x2': { width: 2, height: 2 }, '2x3': { width: 3, height: 2 }, '4x8': { width: 8, height: 4 } };
  function placements(candidate) {
    const a = dimensions[candidate.tileA.shape]; const b = dimensions[candidate.tileB.shape]; const match = candidate.matchingPorts[0]; const originA = { x: 0, y: 0 }; const originB = { x: 0, y: 0 };
    if (candidate.edgeA === 'north' || candidate.edgeA === 'south') { originB.x = a.width * match.portA.offset - b.width * match.portB.offset; originB.y = candidate.edgeA === 'south' ? a.height : -b.height; }
    else { originB.x = candidate.edgeA === 'east' ? a.width : -b.width; originB.y = a.height * match.portA.offset - b.height * match.portB.offset; }
    return { originA, originB };
  }
  const api = { dimensions, placements };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MomConnectorLayout = api;
}(typeof window === 'undefined' ? globalThis : window));
