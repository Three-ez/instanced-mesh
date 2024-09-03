import { box3ToArray, BVH, BVHNode, FloatArray, HybridBuilder, onFrustumIntersectionCallback, onIntersectionCallback, onIntersectionRayCallback, vec3ToArray, WebGLCoordinateSystem } from 'bvh.js';
import { Box3, Matrix4, Raycaster } from 'three';
import { InstancedMesh2 } from './InstancedMesh2.js';

export class InstancedMeshBVH {
    public target: InstancedMesh2;
    public geoBoundingBox: Box3;
    public bvh: BVH<{}, number>;
    public map = new Map<number, BVHNode<{}, number>>();
    protected _arrayType: typeof Float32Array | typeof Float64Array;
    protected _margin: number;
    protected _origin: FloatArray;
    protected _dir: FloatArray;
    protected _boxArray: FloatArray;

    constructor(target: InstancedMesh2, margin = 0, highPrecision = false) {
        this._margin = margin;
        this.target = target;
        if (!target.geometry.boundingBox) target.geometry.computeBoundingBox();
        this.geoBoundingBox = target.geometry.boundingBox;
        this._arrayType = highPrecision ? Float64Array : Float32Array;
        this.bvh = new BVH(new HybridBuilder(highPrecision), WebGLCoordinateSystem);
        this._origin = new this._arrayType(3);
        this._dir = new this._arrayType(3);
    }

    public create(): void {
        const count = this.target.instancesCount;
        const boxes: FloatArray[] = new Array(count);
        const objects: Uint32Array = new Uint32Array(count); // TODO could be opt if instances are less than 65k

        this.clear();

        for (let i = 0; i < count; i++) {
            boxes[i] = this.getBox(i, new this._arrayType(6));
            objects[i] = i;
        }

        this.bvh.createFromArray(objects as unknown as number[], boxes, (node) => {
            this.map.set(node.object, node);
        });
    }

    public insert(id: number): void {
        const node = this.bvh.insert(id, this.getBox(id, new this._arrayType(6)), this._margin);
        this.map.set(id, node);
    }

    public insertRange(ids: number[]): void {
        const count = ids.length;
        const boxes: FloatArray[] = new Array(count);

        for (let i = 0; i < count; i++) {
            boxes[i] = this.getBox(ids[i], new this._arrayType(6));
        }

        this.bvh.insertRange(ids, boxes, this._margin, (node) => {
            this.map.set(node.object, node);
        });
    }

    public move(id: number): void {
        const node = this.map.get(id);
        if (!node) return;
        this.getBox(id, node.box); // this also updates box
        this.bvh.move(node, this._margin);
    }

    public delete(id: number): void {
        const node = this.map.get(id);
        if (!node) return;
        this.bvh.delete(node);
        this.map.delete(id);
    }

    public clear(): void {
        this.bvh.clear();
        this.map = new Map();
    }

    public frustumCulling(projScreenMatrix: Matrix4, onFrustumIntersection: onFrustumIntersectionCallback<{}, number>): void {
        if (this._margin > 0) {

            this.bvh.frustumCulling(projScreenMatrix.elements, (node, frustum, mask) => {
                if (frustum.isIntersectedMargin(node.box, mask, this._margin)) {
                    onFrustumIntersection(node);
                }
            });

        } else {

            this.bvh.frustumCulling(projScreenMatrix.elements, onFrustumIntersection);

        }
    }

    public raycast(raycaster: Raycaster, onIntersection: onIntersectionRayCallback<number>): void {
        const ray = raycaster.ray;
        const origin = this._origin;
        const dir = this._dir;

        vec3ToArray(ray.origin, origin);
        vec3ToArray(ray.direction, dir);

        this.bvh.rayIntersections(dir, origin, onIntersection, raycaster.near, raycaster.far);
    }

    public intersectBox(target: Box3, onIntersection: onIntersectionCallback<number>): boolean {
        if (!this._boxArray) this._boxArray = new this._arrayType(6);
        const array = this._boxArray;
        box3ToArray(target, array);
        return this.bvh.intersectsBox(array, onIntersection);
    }

    protected getBox(id: number, array: FloatArray): FloatArray {
        _box3.copy(this.geoBoundingBox).applyMatrix4(this.target.getMatrixAt(id));
        box3ToArray(_box3, array);
        return array;
    }
}

const _box3 = new Box3();
