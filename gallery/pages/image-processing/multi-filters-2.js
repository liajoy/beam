import { Beam, ResourceTypes, Offscreen2DCommand } from '../../../src/index.js'
import {
  Bilateral, BrightnessContrast
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
const bilateralTarget = beam.resource(OffscreenTarget)

const bc = beam.plugin(BrightnessContrast)
const bcTextures = beam.resource(Textures)

const render = () => {
  console.time('render')
  beam.clear()

  uniforms
    .set('width', image.width)
    .set('height', image.height)

  bilateralTextures.set('input1', { image, flip: true })

  beam.offscreen2D(bilateralTarget, () => {
    beam.draw(bilateral, ...quadBuffers, uniforms, bilateralTextures)
  })

  bcTextures
    .set('input1', bilateralTarget)
    .set('input2', { image, flip: true })
  beam.draw(bc, ...quadBuffers, uniforms, bcTextures)

  console.timeEnd('render')
}

updateImage('ivan.jpg')
// .then(render)

window.render = render

const $imageSelect = document.getElementById('image-select')
$imageSelect.addEventListener('change', () => {
  updateImage($imageSelect.value).then(render)
})

const fields = ['brightness', 'contrast', 'hue', 'saturation', 'vignette']
fields.forEach(field => {
  const $field = document.getElementById(field)
  $field.addEventListener('input', () => {
    uniforms.set(field, $field.value)
    render()
  })
})
