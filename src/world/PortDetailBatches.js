// Keep instancing within spatial cells, not across the whole island. Assignment
// uses the centre only; render bounds must include each complete transformed box.
// A long object crossing a cell boundary is never split or clipped.
export function partitionPortDetails(batches, cellSize = 64) {
  if (!(cellSize > 0) || !Number.isFinite(cellSize)) throw Error('invalid_port_detail_cell_size');
  const result=[];
  for (const [surface,items] of batches) {
    const cells=new Map();
    for (const item of items) {
      const cell=`${Math.floor(item.x/cellSize)},${Math.floor(item.z/cellSize)}`;
      if(!cells.has(cell))cells.set(cell,[]);
      cells.get(cell).push(item);
    }
    for(const [cell,items] of cells)result.push({surface,cell,items});
  }
  return result;
}
