---
editUrl: false
next: false
prev: false
title: "InstancedRenderList"
---

A class that creates and manages a list of render items, used to determine the rendering order based on depth.

## Constructors

### new InstancedRenderList()

> **new InstancedRenderList**(): [`InstancedRenderList`](/api/classes/instancedrenderlist/)

#### Returns

[`InstancedRenderList`](/api/classes/instancedrenderlist/)

## Properties

### array

> **array**: [`InstancedRenderItem`](/api/type-aliases/instancedrenderitem/)[] = `[]`

The main array that holds the list of render items for instanced rendering.

#### Defined in

[src/core/utils/InstancedRenderList.ts:10](https://github.com/three-ez/instanced-mesh/blob/85018850a35ef66e53e9b7df12c8fcc2c395066b/src/core/utils/InstancedRenderList.ts#L10)

## Methods

### push()

> **push**(`depth`, `index`): `void`

Adds a new render item to the list.

#### Parameters

• **depth**: `number`

The depth value used for sorting or determining the rendering order.

• **index**: `number`

The unique instance id of the render item.

#### Returns

`void`

#### Defined in

[src/core/utils/InstancedRenderList.ts:18](https://github.com/three-ez/instanced-mesh/blob/85018850a35ef66e53e9b7df12c8fcc2c395066b/src/core/utils/InstancedRenderList.ts#L18)

***

### reset()

> **reset**(): `void`

Resets the render list by clearing the array.

#### Returns

`void`

#### Defined in

[src/core/utils/InstancedRenderList.ts:37](https://github.com/three-ez/instanced-mesh/blob/85018850a35ef66e53e9b7df12c8fcc2c395066b/src/core/utils/InstancedRenderList.ts#L37)
