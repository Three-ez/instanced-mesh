import { AttachedBindMode, BindMode, Box3, BufferAttribute, BufferGeometry, Camera, Color, ColorManagement, ColorRepresentation, DataTexture, DetachedBindMode, InstancedBufferAttribute, Material, Matrix4, Mesh, Object3D, Object3DEventMap, Scene, Skeleton, SkinnedMesh, Sphere, Vector3, WebGLProgramParametersWithUniforms, WebGLProperties, WebGLRenderer, WebGLState } from 'three';
import { CustomSortCallback, OnFrustumEnterCallback } from './feature/FrustumCulling.js';
import { Entity } from './feature/Instances.js';
import { LODInfo } from './feature/LOD.js';
import { InstancedEntity } from './InstancedEntity.js';
import { BVHParams, InstancedMeshBVH } from './InstancedMeshBVH.js';
import { GLInstancedBufferAttribute } from './utils/GLInstancedBufferAttribute.js';
import { SquareDataTexture } from './utils/SquareDataTexture.js';

// TODO: Add check to not update partial texture if needsuupdate already true
// TODO: if bvh present, can override?
// TODO: Use BVH only for raycasting
// TODO LOD: instancedMeshLOD rendering first nearest levels, look out to transparent
// TODO LOD: shared customDepthMaterial and customDistanceMaterial?
// TODO LOD: BVH and handle raycastOnlyFrustum?;

/**
 * Parameters for configuring an `InstancedMesh2` instance.
 */
export interface InstancedMesh2Params {
  /**
   * Determines the maximum number of instances that buffers can hold.
   * The buffers will be expanded automatically if necessary.
   * @default 1000
   */
  capacity?: number;
  /**
   * Determines whether to create an array of `InstancedEntity` to easily manipulate instances at the cost of more memory.
   * @default false
   */
  createEntities?: boolean;
  /**
   * Determines whether `InstancedEntity` can use the `rotation` property.
   * If `true` `quaternion` and `rotation` will be synchronized, affecting performance.
   * @default false
   */
  allowsEuler?: boolean;
  /**
   * WebGL renderer instance.
   * If not provided, buffers will be initialized during the first render, resulting in no instances being rendered initially.
   * @default null
   */
  renderer?: WebGLRenderer;
}

/**
 * Alternative `InstancedMesh` class to support additional features like frustum culling, fast raycasting, LOD and more.
 * @template TData Type for additional instance data.
 * @template TGeometry Type extending `BufferGeometry`.
 * @template TMaterial Type extending `Material` or an array of `Material`.
 * @template TEventMap Type extending `Object3DEventMap`.
 */
export class InstancedMesh2<
  TData = {},
  TGeometry extends BufferGeometry = BufferGeometry,
  TMaterial extends Material | Material[] = Material | Material[],
  TEventMap extends Object3DEventMap = Object3DEventMap
> extends Mesh<TGeometry, TMaterial, TEventMap> {
  /**
   * @defaultValue `InstancedMesh2`
   */
  public override readonly type = 'InstancedMesh2';
  /**
   * Indicates if this is an `InstancedMesh2`.
   */
  public readonly isInstancedMesh2 = true;
  /**
   * An array of `Entity` representing individual instances.
   * This array is only initialized if `createEntities` is set to `true` in the constructor parameters.
   */
  public instances: Entity<TData>[] = null;
  /**
   * Attribute storing indices of the instances to be rendered.
   */
  public instanceIndex: GLInstancedBufferAttribute;
  /**
   * Texture storing matrices for instances.
   */
  public matricesTexture: SquareDataTexture;
  /**
   * Texture storing colors for instances.
   */
  public colorsTexture: SquareDataTexture = null;
  /**
   * Texture storing morph target influences for instances.
   */
  public morphTexture: DataTexture = null;
  /**
   * Texture storing bones for instances.
   */
  public boneTexture: SquareDataTexture = null;
  /**
   * Texture storing custom uniforms per instance.
   */
  public uniformsTexture: SquareDataTexture = null;
  /**
   * This bounding box encloses all instances, which can be calculated with `computeBoundingBox` method.
   * Bounding box isn't computed by default. It needs to be explicitly computed, otherwise it's `null`.
   */
  public boundingBox: Box3 = null;
  /**
   * This bounding sphere encloses all instances, which can be calculated with `computeBoundingSphere` method.
   * Bounding sphere is computed during its first render. You may need to recompute it if an instance is transformed.
   */
  public boundingSphere: Sphere = null;
  /**
   * BVH structure for optimized culling and intersection testing.
   * It's possible to create the BVH using the `computeBVH` method. Once created it will be updated automatically.
   */
  public bvh: InstancedMeshBVH = null;
  /**
   * Custom sort function for instances.
   * It's possible to create the radix sort using the `createRadixSort` method.
   * @default null
  */
  public customSort: CustomSortCallback = null;
  /**
   * Flag indicating if raycasting should only consider the last frame frustum culled instances.
   * This is ignored if the bvh has been created.
   * @default false
   */
  public raycastOnlyFrustum = false;
  /**
   * Array storing visibility for instances.
   */
  public visibilityArray: boolean[];
  /**
   * Contains data for managing LOD, allowing different levels of detail for rendering and shadow casting.
   */
  public LODinfo: LODInfo<TData> = null;
  /**
   * Flag indicating whether to automatically perform frustum culling before rendering.
   * @default true
   */
  public autoUpdate = true;
  /**
   * Either `AttachedBindMode` or `DetachedBindMode`. `AttachedBindMode` means the skinned mesh shares the same world space as the skeleton.
   * This is not true when using `DetachedBindMode` which is useful when sharing a skeleton across multiple skinned meshes.
   * @default `AttachedBindMode`
   */
  public bindMode: BindMode = AttachedBindMode;
  /**
   * The base matrix that is used for the bound bone transforms.
   */
  public bindMatrix: Matrix4 = null;
  /**
   * The base matrix that is used for resetting the bound bone transforms.
   */
  public bindMatrixInverse: Matrix4 = null;
  /**
   * Skeleton representing the bone hierarchy of the skinned mesh.
   */
  public skeleton: Skeleton = null;
  /**
   * Callback function called if an instance is inside the frustum.
   */
  public onFrustumEnter: OnFrustumEnterCallback = null;
  /** @internal */ _renderer: WebGLRenderer = null;
  /** @internal */ _instancesCount = 0;
  /** @internal */ _count = 0;
  /** @internal */ _perObjectFrustumCulled = true;
  /** @internal */ _sortObjects = false;
  /** @internal */ _capacity: number;
  /** @internal */ _indexArrayNeedsUpdate = false;
  /** @internal */ _geometry: TGeometry;
  /** @internal */ _parentLOD: InstancedMesh2;
  protected readonly _allowsEuler: boolean;
  protected readonly _tempInstance: InstancedEntity;
  protected _useOpacity = false;
  protected _customProgramCacheKeyBase: () => string = null;
  protected _onBeforeCompileBase: (parameters: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => void = null;

  // HACK TO MAKE IT WORK WITHOUT UPDATE CORE
  /** @internal */ isInstancedMesh = true; // must be set to use instancing rendering
  /** @internal */ instanceMatrix = new InstancedBufferAttribute(new Float32Array(0), 16); // must be init to avoid exception
  /** @internal */ instanceColor = null; // must be null to avoid exception

  /**
   * The capacity of the instance buffers.
   */
  public get capacity(): number { return this._capacity; }

  /**
   * The number of instances rendered in the last frame.
   */
  public get count(): number { return this._count; }

  /**
   * The number of active instances.
   * If a number greater than the `capacity` is set, the `capacity` will be increased automatically.
   */
  public get instancesCount(): number { return this._instancesCount; }
  public set instancesCount(value: number) { this.setInstancesCount(value); }

  /**
   * Determines if per-instance frustum culling is enabled.
   * @default true
   */
  public get perObjectFrustumCulled(): boolean { return this._perObjectFrustumCulled; }
  public set perObjectFrustumCulled(value: boolean) {
    this._perObjectFrustumCulled = value;
    this._indexArrayNeedsUpdate = true;
  }

  /**
   * Determines if objects should be sorted before rendering.
   * @default false
   */
  public get sortObjects(): boolean { return this._sortObjects; }
  public set sortObjects(value: boolean) {
    this._sortObjects = value;
    this._indexArrayNeedsUpdate = true;
  }

  /**
   * An instance of `BufferGeometry` (or derived classes), defining the object's structure.
   */
  // @ts-expect-error it's defined as a property, but is overridden as an accessor.
  public override get geometry(): TGeometry { return this._geometry; }
  public override set geometry(value: TGeometry) {
    this._geometry = value;
    this.patchGeometry(value);
  }

  /**
   * Create an `InstancedMesh2` instance from an existing `Mesh`.
   * @param mesh The mesh to create an `InstanceMesh2` from.
   * @param params  Optional configuration parameters object. See `InstancedMesh2Params` for details.
   * @returns The created `InstancedMesh2` instance.
   */
  public static createFrom<TData = {}>(mesh: Mesh, params: InstancedMesh2Params = {}): InstancedMesh2<TData> {
    const instancedMesh = new InstancedMesh2<TData>(mesh.geometry, mesh.material, params);

    if ((mesh as SkinnedMesh).isSkinnedMesh) {
      instancedMesh.initSkeleton((mesh as SkinnedMesh).skeleton);
    }

    // TODO add morph

    return instancedMesh;
  }

  /** @internal */
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  constructor(geometry: TGeometry, material: TMaterial, params?: InstancedMesh2Params, LOD?: InstancedMesh2);
  constructor(geometry: TGeometry, material: TMaterial, params?: InstancedMesh2Params);
  /**
   * @remarks Geometries and materials cannot be shared. If reused, they will be cloned.
   * @param geometry An instance of `BufferGeometry`.
   * @param material A single or an array of `Material`.
   * @param params Optional configuration parameters object. See `InstancedMesh2Params` for details.
   */
  constructor(geometry: TGeometry, material: TMaterial, params: InstancedMesh2Params = {}, LOD?: InstancedMesh2) {
    if (!geometry) throw new Error('"geometry" is mandatory.');
    if (!material) throw new Error('"material" is mandatory.');

    const { allowsEuler, renderer, createEntities } = params;

    super(geometry, null);

    const capacity = params.capacity > 0 ? params.capacity : _defaultCapacity;
    this._renderer = renderer;
    this._capacity = capacity;
    this._parentLOD = LOD;
    this._geometry = geometry;
    this.material = material;
    this._allowsEuler = allowsEuler ?? false;
    this._tempInstance = new InstancedEntity(this, -1, allowsEuler);
    this.visibilityArray = LOD?.visibilityArray ?? new Array(capacity).fill(true);

    this.initIndexAttribute();
    this.initMatricesTexture();

    if (createEntities) this.createEntities();
  }

  public override onBeforeShadow(renderer: WebGLRenderer, scene: Scene, camera: Camera, shadowCamera: Camera, geometry: BufferGeometry, depthMaterial: Material, group: any): void {
    this.patchMaterial(depthMaterial);

    if (!this.instanceIndex || (group && !this.isFirstGroup(group.materialIndex))) return;

    this.matricesTexture.update(renderer);
    this.colorsTexture?.update(renderer);
    this.uniformsTexture?.update(renderer);
    this.boneTexture?.update(renderer);
    // TODO convert also morph texture to squared texture?

    if (this.autoUpdate) {
      this.performFrustumCulling(shadowCamera, camera);
    }
  }

  public override onBeforeRender(renderer: WebGLRenderer, scene: Scene, camera: Camera, geometry: BufferGeometry, material: Material, group: any): void {
    this.patchMaterial(material);

    if (!this.instanceIndex) {
      this._renderer = renderer;
      return;
    }

    // if multi material we compute frustum culling and textures update once
    if (!group || this.isFirstGroup(group.materialIndex)) {
      // TODO convert also morph texture to squared texture?

      this.matricesTexture.update(renderer);
      this.colorsTexture?.update(renderer);
      this.uniformsTexture?.update(renderer);
      this.boneTexture?.update(renderer);

      if (this.autoUpdate) {
        this.performFrustumCulling(camera);
      }
    }

    const properties = renderer.properties;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const state = renderer.state;
    const maxTextures = this._renderer.capabilities.maxTextures;
    const materialProperties: any = properties.get(material);
    const program = materialProperties.currentProgram;
    const uniformsMap = program.getUniforms().map;

    let unit = maxTextures - 1;
    unit = this.bindTexture(gl, state, properties, uniformsMap, 'matricesTexture', unit);
    unit = this.bindTexture(gl, state, properties, uniformsMap, 'colorsTexture', unit);
    unit = this.bindTexture(gl, state, properties, uniformsMap, 'uniformsTexture', unit);
    this.bindTexture(gl, state, properties, uniformsMap, 'boneTexture', unit);

    // TODO add morph
  }

  protected bindTexture(gl: WebGL2RenderingContext, state: WebGLState, properties: WebGLProperties, uniformsMap: any, key: string, unit: number): number {
    if (!this[key]) return unit;

    if (unit === -1) {
      console.error(`Can't bind more textures.`); // TODO better message
      return unit;
    }

    const textureProperties: any = properties.get(this[key]);
    if (!textureProperties.__webglTexture) return unit;

    const uniform = uniformsMap[key];
    if (uniform === undefined) return unit;

    const cache = uniform.cache;
    if (cache[0] !== unit) {
      gl.uniform1i(uniform.addr, unit);
      cache[0] = unit;
    }

    (state.bindTexture as any)(gl.TEXTURE_2D, textureProperties.__webglTexture, gl.TEXTURE0 + unit); // TODO fix d.ts and check if it's correct put at the last

    return --unit;
  }

  public override onAfterShadow(renderer: WebGLRenderer, scene: Scene, camera: Camera, shadowCamera: Camera, geometry: BufferGeometry, depthMaterial: Material, group: any): void {
    this.unpatchMaterial(depthMaterial);
  }

  public override onAfterRender(renderer: WebGLRenderer, scene: Scene, camera: Camera, geometry: BufferGeometry, material: Material, group: any): void {
    // TODO fix group d.ts
    this.unpatchMaterial(material);
    if (this.instanceIndex || (group && !this.isLastGroup(group.materialIndex))) return;
    this.initIndexAttribute();
  }

  protected isFirstGroup(materialIndex: number): boolean {
    const materials = this.material as Material[];

    for (let i = 0; i <= materialIndex; i++) {
      if (materials[i].visible) {
        return i === materialIndex;
      }
    }
  }

  protected isLastGroup(materialIndex: number): boolean {
    const materials = this.material as Material[];
    for (let i = materials.length - 1; i >= materialIndex; i--) {
      if (materials[i].visible) {
        return i === materialIndex;
      }
    }
  }

  protected initIndexAttribute(): void {
    if (!this._renderer) {
      this._count = 0;
      return;
    }

    const gl = this._renderer.getContext() as WebGL2RenderingContext;
    const capacity = this._capacity;
    const array = new Uint32Array(capacity);

    for (let i = 0; i < capacity; i++) {
      array[i] = i;
    }

    this.instanceIndex = new GLInstancedBufferAttribute(gl, gl.UNSIGNED_INT, 1, 4, array);
    this._geometry.setAttribute('instanceIndex', this.instanceIndex as unknown as BufferAttribute);
  }

  protected initMatricesTexture(): void {
    if (!this._parentLOD) {
      this.matricesTexture = new SquareDataTexture(Float32Array, 4, 4, this._capacity);
    }
  }

  protected initColorsTexture(): void {
    if (!this._parentLOD) {
      this.colorsTexture = new SquareDataTexture(Float32Array, 4, 1, this._capacity);
      this.colorsTexture.colorSpace = ColorManagement.workingColorSpace;
      this.colorsTexture._data.fill(1);
    }
  }

  protected patchGeometry(geometry: TGeometry): void {
    const instanceIndex = geometry.getAttribute('instanceIndex') as unknown as GLInstancedBufferAttribute; // TODO fix d.ts

    if (instanceIndex) {
      if (instanceIndex === this.instanceIndex) return;

      console.warn('The geometry has been cloned because it was already used.');
      geometry = geometry.clone();
      geometry.deleteAttribute('instanceIndex'); // TODO rename it it ez_instancedIndex
    }

    if (this.instanceIndex) {
      geometry.setAttribute('instanceIndex', this.instanceIndex as unknown as BufferAttribute); // TODO fix d.ts
    }
  }

  protected patchMaterial(material: Material): void {
    this._customProgramCacheKeyBase = material.customProgramCacheKey.bind(material);
    this._onBeforeCompileBase = material.onBeforeCompile.bind(material);

    material.customProgramCacheKey = () => {
      return `ezInstancedMesh2_${this._customProgramCacheKeyBase()}`;
    };

    material.onBeforeCompile = (shader, renderer) => {
      if (this._onBeforeCompileBase) this._onBeforeCompileBase(shader, renderer);

      shader.instancing = false; // TODO CHECK IF REMOVE

      if (!shader.defines) shader.defines = {};
      shader.defines['USE_INSTANCING_INDIRECT'] = '';

      if (this.uniformsTexture) {
        const { vertex, fragment } = this.uniformsTexture.getUniformsGLSL('uniformsTexture', 'instanceIndex', 'uint');
        shader.vertexShader = shader.vertexShader.replace('void main() {', vertex);
        shader.fragmentShader = shader.fragmentShader.replace('void main() {', fragment);
      }

      if (this.colorsTexture && shader.fragmentShader.includes('#include <color_pars_fragment>')) {
        shader.defines['USE_INSTANCING_COLOR_INDIRECT'] = '';
        shader.vertexShader = shader.vertexShader.replace('<color_vertex>', '<instanced_color_vertex>');

        if (shader.vertexColors) {
          shader.defines['USE_VERTEX_COLOR'] = '';
        }

        if (this._useOpacity) {
          shader.defines['USE_COLOR_ALPHA'] = '';
        } else {
          shader.defines['USE_COLOR'] = '';
        }
      }

      if (this.boneTexture) {
        shader.defines['USE_SKINNING'] = '';
        shader.defines['USE_INSTANCING_SKINNING'] = '';
        shader.uniforms.bindMatrix = { value: this.bindMatrix };
        shader.uniforms.bindMatrixInverse = { value: this.bindMatrixInverse };
        shader.uniforms.bonesPerInstance = { value: this.skeleton.bones.length };
      }
    };
  }

  protected unpatchMaterial(material: Material): void {
    material.onBeforeCompile = this._onBeforeCompileBase;
    material.customProgramCacheKey = this._customProgramCacheKeyBase;
    this._onBeforeCompileBase = null;
    this._customProgramCacheKeyBase = null;
  }

  /**
   * Creates and computes the BVH (Bounding Volume Hierarchy) for the instances.
   * It's recommended to create it when all the instance matrices have been assigned.
   * Once created it will be updated automatically.
   * @param config Optional configuration parameters object. See `BVHParams` for details.
   */
  public computeBVH(config: BVHParams = {}): void {
    if (!this.bvh) this.bvh = new InstancedMeshBVH(this, config.margin, config.getBBoxFromBSphere, config.accurateCulling);
    this.bvh.clear();
    this.bvh.create();
  }

  /**
   * Disposes of the BVH structure.
   */
  public disposeBVH(): void {
    this.bvh = null;
  }

  /**
   * Sets the local transformation matrix for a specific instance.
   * @param id The index of the instance.
   * @param matrix A `Matrix4` representing the local transformation to apply to the instance.
   */
  public setMatrixAt(id: number, matrix: Matrix4): void {
    matrix.toArray(this.matricesTexture._data, id * 16);

    if (this.instances) {
      const instance = this.instances[id];
      matrix.decompose(instance.position, instance.quaternion, instance.scale);
    }

    this.matricesTexture.enqueueUpdate(id);
    this.bvh?.move(id);
  }

  /**
   * Gets the local transformation matrix of a specific instance.
   * @param id The index of the instance.
   * @param matrix Optional `Matrix4` to store the result.
   * @returns The transformation matrix of the instance.
   */
  public getMatrixAt(id: number, matrix = _tempMat4): Matrix4 {
    return matrix.fromArray(this.matricesTexture._data, id * 16);
  }

  /**
   * Retrieves the position of a specific instance.
   * @param index The index of the instance.
   * @param target Optional `Vector3` to store the result.
   * @returns The position of the instance as a `Vector3`.
   */
  public getPositionAt(index: number, target = _position): Vector3 {
    const offset = index * 16;
    const array = this.matricesTexture._data;

    target.x = array[offset + 12];
    target.y = array[offset + 13];
    target.z = array[offset + 14];

    return target;
  }

  /** @internal */
  public getPositionAndMaxScaleOnAxisAt(index: number, position: Vector3): number {
    const offset = index * 16;
    const array = this.matricesTexture._data;

    const te0 = array[offset + 0];
    const te1 = array[offset + 1];
    const te2 = array[offset + 2];
    const scaleXSq = te0 * te0 + te1 * te1 + te2 * te2;

    const te4 = array[offset + 4];
    const te5 = array[offset + 5];
    const te6 = array[offset + 6];
    const scaleYSq = te4 * te4 + te5 * te5 + te6 * te6;

    const te8 = array[offset + 8];
    const te9 = array[offset + 9];
    const te10 = array[offset + 10];
    const scaleZSq = te8 * te8 + te9 * te9 + te10 * te10;

    position.x = array[offset + 12];
    position.y = array[offset + 13];
    position.z = array[offset + 14];

    return Math.sqrt(Math.max(scaleXSq, scaleYSq, scaleZSq));
  }

  /** @internal */
  public applyMatrixAtToSphere(index: number, sphere: Sphere, center: Vector3, radius: number): void {
    const offset = index * 16;
    const array = this.matricesTexture._data;

    const te0 = array[offset + 0];
    const te1 = array[offset + 1];
    const te2 = array[offset + 2];
    const te3 = array[offset + 3];
    const te4 = array[offset + 4];
    const te5 = array[offset + 5];
    const te6 = array[offset + 6];
    const te7 = array[offset + 7];
    const te8 = array[offset + 8];
    const te9 = array[offset + 9];
    const te10 = array[offset + 10];
    const te11 = array[offset + 11];
    const te12 = array[offset + 12];
    const te13 = array[offset + 13];
    const te14 = array[offset + 14];
    const te15 = array[offset + 15];

    const position = sphere.center;
    const x = center.x;
    const y = center.y;
    const z = center.z;
    const w = 1 / (te3 * x + te7 * y + te11 * z + te15);

    position.x = (te0 * x + te4 * y + te8 * z + te12) * w;
    position.y = (te1 * x + te5 * y + te9 * z + te13) * w;
    position.z = (te2 * x + te6 * y + te10 * z + te14) * w;

    const scaleXSq = te0 * te0 + te1 * te1 + te2 * te2;
    const scaleYSq = te4 * te4 + te5 * te5 + te6 * te6;
    const scaleZSq = te8 * te8 + te9 * te9 + te10 * te10;

    sphere.radius = radius * Math.sqrt(Math.max(scaleXSq, scaleYSq, scaleZSq));
  }

  /**
   * Sets the visibility of a specific instance.
   * @param id The index of the instance.
   * @param visible Whether the instance should be visible.
   */
  public setVisibilityAt(id: number, visible: boolean): void {
    this.visibilityArray[id] = visible;
    this._indexArrayNeedsUpdate = true;
  }

  /**
   * Gets the visibility of a specific instance.
   * @param id The index of the instance.
   * @returns Whether the instance is visible.
   */
  public getVisibilityAt(id: number): boolean {
    return this.visibilityArray[id];
  }

  /**
   * Sets the color of a specific instance.
   * @param id The index of the instance.
   * @param color The color to assign to the instance.
   */
  public setColorAt(id: number, color: ColorRepresentation): void {
    if (this.colorsTexture === null) {
      this.initColorsTexture();
    }

    if ((color as Color).isColor) {
      (color as Color).toArray(this.colorsTexture._data, id * 4);
    } else {
      _tempCol.set(color).toArray(this.colorsTexture._data, id * 4);
    }

    this.colorsTexture.enqueueUpdate(id);
  }

  /**
   * Gets the color of a specific instance.
   * @param id The index of the instance.
   * @param color Optional `Color` to store the result.
   * @returns The color of the instance.
   */
  public getColorAt(id: number, color = _tempCol): Color {
    return color.fromArray(this.colorsTexture._data, id * 4);
  }

  /**
   * Sets the opacity of a specific instance.
   * @param id The index of the instance.
   * @param value The opacity value to assign.
   */
  public setOpacityAt(id: number, value: number): void {
    if (this.colorsTexture === null) {
      this.initColorsTexture();
    }

    this._useOpacity = true;
    this.colorsTexture._data[id * 4 + 3] = value;
    this.colorsTexture.enqueueUpdate(id);
  }

  /**
   * Gets the opacity of a specific instance.
   * @param id The index of the instance.
   * @returns The opacity of the instance.
   */
  public getOpacityAt(id: number): number {
    return this.colorsTexture._data[id * 4 + 3];
  }

  /**
   * Copies `position`, `quaternion`, and `scale` of a specific instance to the specified target `Object3D`.
   * @param id The index of the instance.
   * @param target The `Object3D` where to copy transformation data.
   */
  public copyTo(id: number, target: Object3D): void {
    this.getMatrixAt(id, target.matrix).decompose(target.position, target.quaternion, target.scale);
  }

  /**
   * Computes the bounding box that encloses all instances, and updates the `boundingBox` attribute.
   */
  public computeBoundingBox(): void {
    const geometry = this._geometry;
    const count = this._instancesCount;

    if (this.boundingBox === null) this.boundingBox = new Box3();
    if (geometry.boundingBox === null) geometry.computeBoundingBox();

    const geoBoundingBox = geometry.boundingBox;
    const boundingBox = this.boundingBox;

    boundingBox.makeEmpty();

    for (let i = 0; i < count; i++) {
      _box3.copy(geoBoundingBox).applyMatrix4(this.getMatrixAt(i));
      boundingBox.union(_box3);
    }
  }

  /**
   * Computes the bounding sphere that encloses all instances, and updates the `boundingSphere` attribute.
   */
  public computeBoundingSphere(): void {
    const geometry = this._geometry;
    const count = this._instancesCount;

    if (this.boundingSphere === null) this.boundingSphere = new Sphere();
    if (geometry.boundingSphere === null) geometry.computeBoundingSphere();

    const geoBoundingSphere = geometry.boundingSphere;
    const boundingSphere = this.boundingSphere;

    boundingSphere.makeEmpty();

    for (let i = 0; i < count; i++) {
      _sphere.copy(geoBoundingSphere).applyMatrix4(this.getMatrixAt(i));
      boundingSphere.union(_sphere);
    }
  }

  public override clone(recursive?: boolean): this { // wrong three d.ts
    const params: InstancedMesh2Params = {
      capacity: this._capacity,
      renderer: this._renderer,
      allowsEuler: this._allowsEuler,
      createEntities: !!this.instances
    };
    return new (this as any).constructor(this.geometry, this.material, params).copy(this, recursive);
  }

  public override copy(source: InstancedMesh2, recursive?: boolean): this {
    super.copy(source, recursive);

    this._instancesCount = source._instancesCount;
    this._count = source._capacity;
    this._capacity = source._capacity;

    if (source.boundingBox !== null) this.boundingBox = source.boundingBox.clone();
    if (source.boundingSphere !== null) this.boundingSphere = source.boundingSphere.clone();

    this.matricesTexture = source.matricesTexture.clone(); // TODO we can avoid cloning it because it already exists
    this.matricesTexture.image.data = this.matricesTexture.image.data.slice();

    if (source.colorsTexture !== null) {
      this.colorsTexture = source.colorsTexture.clone();
      this.colorsTexture.image.data = this.colorsTexture.image.data.slice();
    }

    if (source.uniformsTexture !== null) {
      this.uniformsTexture = source.uniformsTexture.clone();
      this.uniformsTexture.image.data = this.uniformsTexture.image.data.slice();
    }

    if (source.morphTexture !== null) {
      this.morphTexture = source.morphTexture.clone();
      this.morphTexture.image.data = this.morphTexture.image.data.slice();
    }

    if (source.boneTexture !== null) {
      this.boneTexture = source.boneTexture.clone();
      this.boneTexture.image.data = this.boneTexture.image.data.slice();
    }

    // TODO copies and handle LOD?

    return this;
  }

  /**
   * Frees the GPU-related resources allocated.
   */
  public dispose(): void {
    this.dispatchEvent<any>({ type: 'dispose' });

    this.matricesTexture.dispose();
    this.colorsTexture?.dispose();
    this.morphTexture?.dispose();
    this.boneTexture?.dispose();
    this.uniformsTexture?.dispose();
  }

  public override updateMatrixWorld(force?: boolean): void {
    super.updateMatrixWorld(force);

    if (!this.bindMatrixInverse) return;

    if (this.bindMode === AttachedBindMode) {
      this.bindMatrixInverse.copy(this.matrixWorld).invert();
    } else if (this.bindMode === DetachedBindMode) {
      this.bindMatrixInverse.copy(this.bindMatrix).invert();
    } else {
      console.warn('Unrecognized bindMode: ' + this.bindMode);
    }
  }
}

const _defaultCapacity = 1000;
const _box3 = new Box3();
const _sphere = new Sphere();
const _tempMat4 = new Matrix4();
const _tempCol = new Color();
const _position = new Vector3();
