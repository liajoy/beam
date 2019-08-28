import { Beam, ResourceTypes, Offscreen2DCommand } from '../../../src/index.js'
import {
  Bilateral, BlackPoint, Shadow
} from '../../plugins/image-filter-plugins.js'
import { createRect } from '../../utils/graphics-utils.js'
import { loadImages } from '../../utils/image-loader.js'
const {
  DataBuffers, IndexBuffer, Textures, Uniforms, OffscreenTarget
} = ResourceTypes

const canvas = document.querySelector('canvas')
const beam = new Beam(canvas)

// Fill screen with unit quad
const quad = createRect()
const quadBuffers = [
  beam.resource(DataBuffers, quad.data),
  beam.resource(IndexBuffer, quad.index)
]
const uniforms = beam.resource(Uniforms)

let image

const base = '../../assets/images/'
const updateImage = name => loadImages(base + name).then(([_image]) => {
  image = _image
  const aspectRatio = image.naturalWidth / image.naturalHeight
  canvas.height = 800
  canvas.width = 800 * aspectRatio
})

const bilateral = beam.plugin(Bilateral)
const srcTextures = beam.resource(Textures)
const bilateralTarget = beam.resource(OffscreenTarget, { size: 512 })

const blackPoint = beam.plugin(BlackPoint)
const filterTextures = beam.resource(Textures)

const tmpTarget = beam.resource(OffscreenTarget)
const tmpTextures = beam.resource(Textures)
const shadow = beam.plugin(Shadow)

const MagFilterCommand = {
  name: 'setMagFilter',
  onBefore (gl) {
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, bilateralTarget.colorTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  }
}
beam.define(Offscreen2DCommand)
beam.define(MagFilterCommand)

uniforms
  .set('shadowThre', 0.91)
  .set('shadowOffset', 0.8196)
  .set('alpha', 0)

let isFilterComputed = false

const computeFilter = () => {
  beam.clear()
  uniforms
    .set('width', image.width)
    .set('height', image.height)
  srcTextures.set('inputSrc', { image, flip: true })

  beam.offscreen2D(bilateralTarget, () => {
    beam.draw(bilateral, ...quadBuffers, uniforms, srcTextures)
  })

  filterTextures.set('inputFilter', bilateralTarget)
  beam.setMagFilter()
}

const render = () => {
  console.time('render')
  if (!isFilterComputed) {
    isFilterComputed = true
    computeFilter()
  }

  // for drawing standalone black point
  /*
  uniforms.set('alpha', $shadowAlpha.value)
  beam
    .clear()
    .draw(shadow, ...quadBuffers, uniforms, srcTextures, filterTextures)
  */

  uniforms.set('alpha', $blackPointAlpha.value)
  beam.offscreen2D(tmpTarget, () => {
    beam
      .clear()
      .draw(blackPoint, ...quadBuffers, uniforms, srcTextures, filterTextures)
  })
  tmpTextures.set('inputSrc', tmpTarget)

  uniforms.set('alpha', $shadowAlpha.value)
  // const { gl } = beam
  // gl.viewport(0, 0, 2048, 2048)

  beam.draw(shadow, ...quadBuffers, uniforms, tmpTextures, filterTextures)

  console.timeEnd('render')
}

updateImage('ivan.jpg')

const $imageSelect = document.getElementById('image-select')
$imageSelect.addEventListener('change', () => {
  updateImage($imageSelect.value).then(() => {
    computeFilter()
    render()
  })
})

const $blackPointAlpha = document.getElementById('black-point-alpha')
$blackPointAlpha.addEventListener('input', () => {
  render()
})

const $shadowAlpha = document.getElementById('shadow-alpha')
$shadowAlpha.addEventListener('input', () => {
  render()
})

const $shadowThre = document.getElementById('shadow-thre')
$shadowThre.addEventListener('input', () => {
  uniforms.set('shadowThre', $shadowThre.value)
  render()
})

const $shadowOffset = document.getElementById('shadow-offset')
$shadowOffset.addEventListener('input', () => {
  uniforms.set('shadowOffset', $shadowOffset.value)
  render()
})

const $init = document.getElementById('init')
$init.onclick = render
