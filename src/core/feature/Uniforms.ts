import { InstancedMesh2 } from '../InstancedMesh2.js';
import { ChannelSize, SquareDataTexture, UniformMap, UniformMapType, UniformType, UniformValue, UniformValueObj } from '../utils/SquareDataTexture.js';

export type UniformSchema = { [x: string]: UniformType };

export interface UniformSchemaShader {
  vertex?: UniformSchema;
  fragment?: UniformSchema;
  singleTexture?: boolean;
};

interface UniformSchemaResult {
  channels: ChannelSize;
  pixelsPerInstance: number;
  uniformMap: UniformMap;
}

declare module '../InstancedMesh2.js' {
  interface InstancedMesh2 {
    /**
     * Retrieves a uniform value for a specific instance.
     * @param id The index of the instance.
     * @param name The name of the uniform.
     * @param target Optional target object to store the uniform value.
     * @returns The uniform value for the specified instance.
     */
    getUniformAt(id: number, name: string, target?: UniformValueObj): UniformValue;
    /**
     * Sets a uniform value for a specific instance.
     * @param id The index of the instance.
     * @param name The name of the uniform.
     * @param value The value to set for the uniform.
     */
    setUniformAt(id: number, name: string, value: UniformValue): void;
    /**
     * Initializes per-instance uniforms using a schema.
     * @param schema The schema defining the uniforms.
     */
    initUniformsPerInstance(schema: UniformSchemaShader): void;
    /** @internal */ getUniformSchemaSingleResult(schema: UniformSchemaShader): UniformSchemaResult;
    /** @internal */ getUniformOffset(size: number, tempOffset: number[]): number;
    /** @internal */ getUniformSize(type: UniformType): number;
  }
}

InstancedMesh2.prototype.getUniformAt = function (id: number, name: string, target?: UniformValueObj): UniformValue {
  if (!this.uniformsTexture) {
    throw new Error('Before get/set uniform, it\'s necessary to use "initUniformPerInstance".');
  }
  return this.uniformsTexture.getUniformAt(id, name, target);
};

InstancedMesh2.prototype.setUniformAt = function (id: number, name: string, value: UniformValue): void {
  if (!this.uniformsTexture) {
    throw new Error('Before get/set uniform, it\'s necessary to use "initUniformPerInstance".');
  }
  this.uniformsTexture.setUniformAt(id, name, value);
  this.uniformsTexture.enqueueUpdate(id);
};

InstancedMesh2.prototype.initUniformsPerInstance = function (schema: UniformSchemaShader): void {
  // if (schema.singleTexture) {
  const { channels, pixelsPerInstance, uniformMap } = this.getUniformSchemaSingleResult(schema);
  this.uniformsTexture = new SquareDataTexture(Float32Array, channels, pixelsPerInstance, this._capacity, uniformMap);
  // } else {
  //   // multi
  // }
};

InstancedMesh2.prototype.getUniformSchemaSingleResult = function (schema: UniformSchemaShader): UniformSchemaResult {
  let totalSize = 0;
  const uniformMap = new Map<string, UniformMapType>();
  const uniforms: { type: UniformType; name: string; size: number; usedInFragment: boolean }[] = [];
  const vertexSchema = schema.vertex ?? {};
  const fragmentSchema = schema.fragment ?? {};

  for (const name in fragmentSchema) {
    const type = fragmentSchema[name];
    const size = this.getUniformSize(type);
    totalSize += size;
    uniforms.push({ name, type, size, usedInFragment: true });
  }

  for (const name in vertexSchema) {
    if (!fragmentSchema[name]) {
      const type = vertexSchema[name];
      const size = this.getUniformSize(type);
      totalSize += size;
      uniforms.push({ name, type, size, usedInFragment: false });
    }
  }

  uniforms.sort((a, b) => b.size - a.size);

  const tempOffset = [];
  for (const { name, size, type, usedInFragment } of uniforms) {
    const offset = this.getUniformOffset(size, tempOffset);
    uniformMap.set(name, { offset, size, type, usedInFragment });
  }

  const pixelsPerInstance = Math.ceil(totalSize / 4);
  const channels = Math.min(totalSize, 4) as ChannelSize;

  return { channels, pixelsPerInstance, uniformMap };
};

InstancedMesh2.prototype.getUniformOffset = function (size: number, tempOffset: number[]): number {
  if (size < 4) {
    for (let i = 0; i < tempOffset.length; i++) {
      if (tempOffset[i] + size <= 4) {
        const offset = i * 4 + tempOffset[i];
        tempOffset[i] += size;
        return offset;
      }
    }
  }

  const offset = tempOffset.length * 4;
  for (; size > 0; size -= 4) {
    tempOffset.push(size);
  }

  return offset;
};

InstancedMesh2.prototype.getUniformSize = function (type: UniformType): number {
  switch (type) {
    case 'float': return 1;
    case 'vec2': return 2;
    case 'vec3': return 3;
    case 'vec4': return 4;
    case 'mat3': return 9;
    case 'mat4': return 16;
    default:
      throw new Error(`Invalid uniform type: ${type}`);
  }
};
