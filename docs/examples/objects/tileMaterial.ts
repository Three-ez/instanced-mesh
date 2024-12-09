import { ShaderMaterial, ShaderMaterialParameters, Texture, Vector2 } from 'three';
import { createTexture_vec2 } from '@three.ez/instanced-mesh';

export class TileMaterial extends ShaderMaterial {
  public override vertexShader = `
    #include <get_from_texture>
    #include <instanced_pars_vertex>

    varying vec2 vUv;
    flat varying uint vInstanceIndex;

    void main() {
      
      #include <instanced_vertex>

      vUv = uv;
      vInstanceIndex = instanceIndex;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }`;

  public override fragmentShader = `
    #include <get_from_texture>

    uniform highp sampler2D offsetTexture;
    uniform sampler2D map;
    uniform vec2 tileSize;
    varying vec2 vUv;
    flat varying uint vInstanceIndex;

    void main() {
      vec2 offset = getVec2FromTexture( offsetTexture, vInstanceIndex );
      vec4 color = texture2D(map, vUv * tileSize + offset * tileSize);
      if (color.w < .9) discard;
      gl_FragColor = color;
    }`;

  constructor(count: number, tilemap: Texture, tileSizeX: number, tileSizeY: number, parameters?: ShaderMaterialParameters) {
    super(parameters);
    this.uniforms.offsetTexture = { value: createTexture_vec2(count) };
    this.uniforms.map = { value: tilemap };
    this.uniforms.tileSize = { value: new Vector2(tileSizeX / tilemap.image.width, tileSizeY / tilemap.image.height) };
  }
}
