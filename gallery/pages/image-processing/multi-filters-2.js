import { Beam, ResourceTypes, Offscreen2DCommand } from '../../../src/index.js'
import {
  Bilateral, BlackPoint
} from '../../plugins/image-filter-plugins.js'
import { createRect } from '../../utils/graphics-utils.js'
import { loadImages } from '../../utils/image-loader.js'
const {
  DataBuffers, IndexBuffer, Textures, Uniforms, OffscreenTarget
} = ResourceTypes

const canvas = document.querySelector('canvas')
const beam = new Beam(canvas)
beam.define(Offscreen2DCommand)

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
  canvas.height = 400
  canvas.width = 400 * aspectRatio
})

const bilateral = beam.plugin(Bilateral)
const bilateralTextures = beam.resource(Textures)
const bilateralTarget = beam.resource(OffscreenTarget, { size: 128 })

const blackPoint = beam.plugin(BlackPoint)
const blackPointTextures = beam.resource(Textures)

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
  bilateralTextures.set('inputSrc', { image, flip: true })

  beam.offscreen2D(bilateralTarget, () => {
    beam.draw(bilateral, ...quadBuffers, uniforms, bilateralTextures)
  })

  blackPointTextures
    .set('inputFilter', bilateralTarget)
    .set('inputSrc', { image, flip: true })
}

const render = () => {
  console.time('render')

  if (!isFilterComputed) {
    isFilterComputed = true
    computeFilter()
  }

  beam.clear()
  beam.draw(blackPoint, ...quadBuffers, uniforms, blackPointTextures)

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

const $alpha = document.getElementById('alpha')
$alpha.addEventListener('input', () => {
  uniforms.set('alpha', $alpha.value)
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
