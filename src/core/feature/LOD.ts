import { BufferGeometry, Material } from "three";
import { InstancedMesh2, LODLevel } from "../InstancedMesh2.js";

declare module '../InstancedMesh2.js' {
	interface InstancedMesh2 {
		getObjectLODIndexForDistance(levels: LODLevel[], distance: number): number;
		setFirstLODDistance(distance?: number, hysteresis?: number): this;
		addLOD(geometry: BufferGeometry, material: Material, distance?: number, hysteresis?: number): this;
		addShadowLOD(geometry: BufferGeometry, material: Material, distance?: number, hysteresis?: number): this;
	}
}

InstancedMesh2.prototype.getObjectLODIndexForDistance = function (levels: LODLevel[], distance: number): number {
	for (let i = levels.length - 1; i > 0; i--) {
		const level = levels[i];
		const levelDistance = level.distance - (level.distance * level.hysteresis);
		if (distance >= levelDistance) return i;
	}

	return 0;
}

InstancedMesh2.prototype.setFirstLODDistance = function (distance = 0, hysteresis = 0): InstancedMesh2 {
	if (this._LOD) {
		console.error("Cannot create LOD for this InstancedMesh2.");
		return;
	}

	if (!this.levels) {
		this.levels = [{ distance, hysteresis, object: this }];
		this._countIndexes = [0];
		this._indexes = [this._indexArray];
	}

	return this;
}

InstancedMesh2.prototype.addLOD = function (geometry: BufferGeometry, material: Material, distance = 0, hysteresis = 0): InstancedMesh2 {
	if (this._LOD) {
		console.error("Cannot create LOD for this InstancedMesh2.");
		return;
	}

	if (!this.levels && distance === 0) {
		console.error("Cannot set distance to 0 for the first LOD. Use 'setFirstLODDistance' before use 'addLOD'.");
		return;
	} else {
		this.setFirstLODDistance(0, hysteresis);
	}

	const levels = this.levels;
	const object = new InstancedMesh2(undefined, this._maxCount, geometry, material, this); // TODO fix renderer param
	let index;
	distance = distance ** 2; // to avoid to use Math.sqrt every time

	for (index = 0; index < levels.length; index++) {
		if (distance < levels[index].distance) break;
	}

	levels.splice(index, 0, { distance, hysteresis, object });
	this._countIndexes.push(0);
	this._indexes.splice(index, 0, object._indexArray);

	this.add(object); // TODO handle render order?
	return this;
}

InstancedMesh2.prototype.addShadowLOD = function (geometry: BufferGeometry, material: Material, distance = 0, hysteresis = 0): InstancedMesh2 {
	// if (this._LOD) {
	// 	console.error("Cannot create LOD for this InstancedMesh2.");
	// 	return;
	// }

	// if (!this.levels && distance === 0) {
	// 	console.error("Cannot set distance to 0 for the first LOD. Use 'setFirstLODDistance' before use 'addLOD'.");
	// 	return;
	// } else {
	// 	this.setFirstLODDistance(0, hysteresis);
	// }

	// const levels = this.levels;
	// const object = new InstancedMesh2(undefined, this._maxCount, geometry, material, this); // TODO fix renderer param
	// let index;
	// distance = distance ** 2; // to avoid to use Math.sqrt every time

	// for (index = 0; index < levels.length; index++) {
	// 	if (distance < levels[index].distance) break;
	// }

	// levels.splice(index, 0, { distance, hysteresis, object });
	// this._countIndexes.push(0);
	// this._indexes.splice(index, 0, object._indexArray);

	// this.add(object); // TODO handle render order?
	return this;
}
