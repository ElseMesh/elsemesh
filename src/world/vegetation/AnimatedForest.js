import { Box3, BufferAttribute, Group, Matrix3, Matrix4, Mesh, Object3D, Sphere, Vector3, mergeGeometries } from '../../engine/index.js';
import { StorageBuffer } from '../../engine/gpu/Texture.js';
import { FOREST_WIND_X_AMPLITUDE, FOREST_WIND_Z_AMPLITUDE } from './DistantForest.js';

class AnimatedTreeRoot extends Group {
  updateMatrixWorld(force) {
    // The disabled comparison does not walk the extra, dormant batch meshes.
    if (this.visible) super.updateMatrixWorld(force);
  }
}

const jointVertex = count => /* wgsl */`
  v.model = draw.model * forestJoints[v.forestJoint];
  v.prevModel = draw.prevModel * forestJoints[v.forestJoint + ${count}u];
`;

function materialFor(source, buffer, count) {
  const material = source.clone();
  material.name = source.name + ' · animated forest';
  // Retain live uniform values and texture resolvers, with a distinct pipeline
  // for the additional vertex attribute/storage binding.
  material.uniformBlock = source.uniformBlock;
  material.uniforms = source.uniforms;
  material.attributes = { ...source.attributes, forestJoint: 'u32' };
  material.bindings.forestJoints = { storage: buffer, access: 'read' };
  material.vertex = jointVertex(count);
  return material;
}

function validateSource(source, joints) {
  if (!joints.includes(source.parent) || Array.isArray(source.material) || source.material.transparent ||
      source.material.vertex || source.isInstancedMesh || source.children.length ||
      source.onBeforeRender !== Object3D.prototype.onBeforeRender || !source.visible ||
      source.geometry.drawRange.start !== 0 || source.geometry.drawRange.count !== Infinity ||
      source.drawParams || source.staticVelocity ||
      !source.geometry.attributes.position || !source.geometry.attributes.normal) {
    throw new Error('Animated forest requires rigid, callback-free base meshes directly attached to wind joints');
  }
}

// This is deliberately forest-specific: base mesh geometry/local transforms,
// joint translations/scales and the wind envelope are immutable after build.
// Tree-root and forest-parent movement remain supported. Wildlife is separate.
export class AnimatedForest {
  constructor(trees, parent) {
    this.parent = parent;
    this.enabled = false;
    this.jointCount = trees.reduce((n, tree) => n + tree.joints.length, 0);
    this.data = new Float32Array(Math.max(1, this.jointCount * 2) * 16);
    const identity = new Matrix4();
    for (let i = 0; i < Math.max(1, this.jointCount * 2); i++) identity.toArray(this.data, i * 16);
    this.buffer = new StorageBuffer({ label: 'animated forest joints', count: Math.max(1, this.jointCount * 2),
      type: 'mat4x4f', data: this.data });
    this.materials = new Map();
    this.records = [];
    this.local = new Matrix4();
    this.stats = { activeTrees: 0, sourceMeshesReplaced: 0, batchMeshes: 0, jointMatrices: 0,
      paletteBytes: this.data.byteLength, uploadedBytes: 0, geometryBytes: 0 };
    let offset = 0;
    for (const tree of trees) {
      this.records.push(this._buildTree(tree, offset));
      offset += tree.joints.length;
    }
  }

  _buildTree(tree, offset) {
    const group = new AnimatedTreeRoot();
    group.name = 'Animated forest tree material batches';
    group.visible = false; group.matrixAutoUpdate = false;
    const joints = tree.joints, parents = [], rest = [], angles = [], displacement = [];
    for (let i = 0; i < joints.length; i++) {
      const joint = joints[i], parentIndex = joints.indexOf(joint.parent);
      if (joints.length < 2 || (joint.parent !== tree.root && (parentIndex < 0 || parentIndex >= i)) ||
          joint.scale.x !== 1 || joint.scale.y !== 1 || joint.scale.z !== 1 ||
          joint.rotation.x !== 0 || joint.rotation.y !== 0 || joint.rotation.z !== 0 || joint.rotation.order !== 'XYZ') {
        throw new Error('Animated forest requires parent-first, unscaled wind joints in their rest pose');
      }
      parents.push(parentIndex);
      const local = new Matrix4().compose(joint.position, joint.quaternion, joint.scale);
      rest.push(parentIndex < 0 ? local : new Matrix4().multiplyMatrices(rest[parentIndex], local));
      const parentAngle = parentIndex < 0 ? 0 : angles[parentIndex];
      // |Rx| + |Rz| bounds the joint rotation angle. A rotated vector of length
      // r moves at most 2*r*sin(angle/2); sum this along the rigid chain.
      angles.push(parentAngle + (FOREST_WIND_X_AMPLITUDE + FOREST_WIND_Z_AMPLITUDE) * i / (joints.length - 1));
      displacement.push((parentIndex < 0 ? 0 : displacement[parentIndex]) +
        2 * joint.position.length() * Math.sin(Math.min(Math.PI, parentAngle) / 2));
    }
    const byMaterial = new Map(), normal = new Matrix3(), point = new Vector3();
    for (const source of tree.meshes) {
      validateSource(source, joints);
      let states = byMaterial.get(source.material);
      if (!states) byMaterial.set(source.material, states = new Map());
      const key = `${source.castShadow}:${source.receiveShadow}:${source.layers.mask}:${source.renderOrder}`;
      let batch = states.get(key);
      if (!batch) states.set(key, batch = { source, sources: [], parts: [], bound: new Box3(), vertices: 0 });
      const index = joints.indexOf(source.parent), geometry = source.geometry.clone();
      if (source.matrixAutoUpdate) source.updateMatrix();
      const determinant = source.matrix.determinant();
      if (!Number.isFinite(determinant) || determinant <= 0) throw new Error('Animated forest requires nonsingular, positive local transforms');
      // Keep source UVs/triangles exactly. Cofactor normals are NOT normalized:
      // the original shader interpolates these lengths under nonuniform scale.
      const position = geometry.attributes.position, normals = geometry.attributes.normal;
      position.applyMatrix4(source.matrix);
      normal.getNormalMatrix(source.matrix).multiplyScalar(determinant);
      for (let i = 0; i < normals.count; i++) {
        point.fromBufferAttribute(normals, i).applyMatrix3(normal);
        normals.setXYZ(i, point.x, point.y, point.z);
      }
      geometry.setAttribute('forestJoint', new BufferAttribute(new Uint32Array(position.count).fill(offset + index), 1));
      geometry.computeBoundingBox();
      let radius = 0;
      for (let i = 0; i < position.count; i++) radius = Math.max(radius, point.fromBufferAttribute(position, i).length());
      const travel = displacement[index] + 2 * radius * Math.sin(Math.min(Math.PI, angles[index]) / 2);
      const bounds = geometry.boundingBox.clone().applyMatrix4(rest[index]);
      bounds.expandByScalar(travel + 1e-4 * (1 + radius + rest[index].elements[13]));
      batch.bound.union(bounds);
      batch.sources.push({ source, joint: index, vertexStart: batch.vertices });
      batch.vertices += position.count;
      batch.parts.push(geometry);
    }
    const batches = [];
    for (const states of byMaterial.values()) for (const batch of states.values()) {
      const geometry = mergeGeometries(batch.parts);
      if (!geometry) throw new Error('Animated forest geometry attributes do not match');
      // Valid for every wind pose: RefractionPass caches the local box, and all
      // shadow/main cameras need conservative bounds even before a first draw.
      geometry.boundingBox = batch.bound;
      geometry.boundingSphere = batch.bound.getBoundingSphere(new Sphere());
      let material = this.materials.get(batch.source.material);
      if (!material) {
        material = materialFor(batch.source.material, this.buffer, this.jointCount);
        this.materials.set(batch.source.material, material);
      }
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = batch.source.castShadow; mesh.receiveShadow = batch.source.receiveShadow;
      mesh.layers.mask = batch.source.layers.mask; mesh.renderOrder = batch.source.renderOrder;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix(); group.add(mesh);
      batches.push({ mesh, sources: batch.sources });
      this.stats.geometryBytes += geometry.index.array.byteLength;
      for (const attribute of Object.values(geometry.attributes)) this.stats.geometryBytes += attribute.array.byteLength;
      for (const part of batch.parts) part.dispose();
    }
    group.matrix.compose(tree.root.position, tree.root.quaternion, tree.root.scale);
    this.parent.add(group);
    return { tree, group, offset, parents, matrices: joints.map(() => new Matrix4()), batches, active: false };
  }

  update(enabled) {
    const stats = this.stats;
    stats.activeTrees = stats.sourceMeshesReplaced = stats.batchMeshes = stats.jointMatrices = stats.uploadedBytes = 0;
    if (!enabled && !this.enabled) return;
    this.enabled = enabled;
    let changed = false;
    for (const record of this.records) {
      const { tree, group, offset, matrices, parents, batches } = record;
      const active = enabled && tree.root.visible && !tree.root.frozenForestPose;
      if (!active) {
        if (record.active) {
          group.visible = false;
          for (const source of tree.meshes) { source.visible = true; source.resetVelocity = true; }
          record.active = false;
        }
        continue;
      }
      const reset = !record.active;
      for (let i = 0; i < tree.joints.length; i++) {
        const joint = tree.joints[i], matrix = matrices[i], index = (offset + i) * 16;
        const previous = (this.jointCount + offset + i) * 16;
        if (!reset) this.data.copyWithin(previous, index, index + 16);
        this.local.compose(joint.position, joint.quaternion, joint.scale);
        if (parents[i] < 0) matrix.copy(this.local);
        else matrix.multiplyMatrices(matrices[parents[i]], this.local);
        matrix.toArray(this.data, index);
        if (reset) this.data.copyWithin(previous, index, index + 16);
      }
      group.matrix.compose(tree.root.position, tree.root.quaternion, tree.root.scale);
      group.matrixWorldNeedsUpdate = true;
      if (reset) {
        for (const source of tree.meshes) source.visible = false;
        for (const { mesh } of batches) mesh.resetVelocity = true;
        group.visible = true; record.active = true;
      }
      stats.activeTrees++; stats.sourceMeshesReplaced += tree.meshes.length;
      stats.batchMeshes += batches.length; stats.jointMatrices += tree.joints.length;
      changed = true;
    }
    if (changed) {
      // Stage CPU data until the first draw/precompile creates the GPU buffer.
      // There is no GPU work in construction or in a never-enabled baseline.
      if (this.buffer.gpu) { this.buffer.write(this.data); stats.uploadedBytes = this.data.byteLength; }
      else this.buffer.pendingData = this.data;
    }
  }
}
