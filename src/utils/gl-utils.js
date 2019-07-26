import { SchemaTypes, GLTypes } from '../consts.js'
import * as miscUtils from './misc-utils.js'

export const getWebGLInstance = canvas => {
  return canvas.getContext('webgl')
}

export const getExtensions = (gl, config) => {
  const extensions = {}
  config.extensions.forEach(name => {
    extensions[name] = gl.getExtension(name)
  })
  return extensions
}

const compileShader = (gl, type, source) => {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Error compiling shaders', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

const initShader = (gl, defines, vs, fs) => {
  const defineStr = Object.keys(defines).reduce((str, key) => (
    str + `#define ${key} ${defines[key]}\n`
  ), '')

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, defineStr + vs)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, defineStr + fs)

  const shaderProgram = gl.createProgram()
  gl.attachShader(shaderProgram, vertexShader)
  gl.attachShader(shaderProgram, fragmentShader)
  gl.linkProgram(shaderProgram)

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.error('Error initing program', gl.getProgramInfoLog(shaderProgram))
    return null
  }

  return shaderProgram
}

export const initShaderRefs = (gl, defines, schema, vs, fs) => {
  const program = initShader(gl, defines, vs, fs)
  // map to { pos: { type, location } }
  const attributes = miscUtils.mapValue(schema.buffers, (attributes, key) => ({
    type: attributes[key].type,
    location: gl.getAttribLocation(program, key)
  }))
  const uniforms = miscUtils.mapValue({
    ...schema.uniforms, ...schema.textures
  }, (uniforms, key) => ({
    type: uniforms[key].type,
    location: gl.getUniformLocation(program, key)
  }))

  return { program, attributes, uniforms }
}

export const clear = (gl, color) => {
  const [r, g, b, a] = color
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
  gl.clearColor(r, g, b, a)
  gl.clearDepth(1)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.enable(gl.DEPTH_TEST)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
}

export const initDataBuffers = (gl, state) => {
  const buffers = {}
  const bufferKeys = Object.keys(state)
  bufferKeys.forEach(key => {
    const buffer = gl.createBuffer()
    const data = state[key] instanceof Float32Array
      ? state[key] : new Float32Array(state[key])
    buffers[key] = buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
  })
  return buffers
}

export const initIndexBuffer = (gl, state) => {
  const { array } = state
  const buffer = gl.createBuffer()
  const data = array instanceof Uint32Array
    ? array : new Uint32Array(array)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, gl.STATIC_DRAW)
  return buffer
}

export const initTextures = (gl, state) => {
  const textures = {}
  Object.keys(state).forEach(key => {
    const texture = gl.createTexture()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    const space = gl.RGBA

    const { flip, image, repeat } = state[key]
    if (flip) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, space, space, gl.UNSIGNED_BYTE, image)

    const { isPowerOf2 } = miscUtils
    if (
      image && isPowerOf2(image.width) && isPowerOf2(image.height) &&
      image.nodeName !== 'VIDEO'
    ) {
      gl.generateMipmap(gl.TEXTURE_2D)
      if (!repeat) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
      }
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    }
    textures[key] = texture
  })
  return textures
}

const padDefault = (schema, key, val) => {
  return val !== undefined ? val : schema.uniforms[key].default
}

export const draw = (
  gl, plugin, dataBuffers, indexResource, uniforms, textures
) => {
  const { schema, shaderRefs } = plugin
  gl.useProgram(shaderRefs.program)
  Object.keys(shaderRefs.attributes).forEach(key => {
    if (
      !schema.buffers[key] || schema.buffers[key].type === SchemaTypes.index
    ) return
    const { location } = shaderRefs.attributes[key]
    const { n, type } = schema.buffers[key]
    const numComponents = n || miscUtils.getNumComponents(type)

    gl.bindBuffer(gl.ARRAY_BUFFER, dataBuffers[key])
    gl.vertexAttribPointer(location, numComponents, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(location)
  })
  const { buffer, count, offset } = indexResource
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer)

  let unit = -1
  Object.keys(shaderRefs.uniforms).forEach(key => {
    const { type, location } = shaderRefs.uniforms[key]
    let val
    const isTexure = type === SchemaTypes.tex2D || type === SchemaTypes.texCube
    if (!isTexure) {
      val = padDefault(schema, key, uniforms[key])
    }

    const uniformSetterMapping = {
      [SchemaTypes.vec4]: () => gl.uniform4fv(location, val),
      [SchemaTypes.vec3]: () => gl.uniform3fv(location, val),
      [SchemaTypes.vec2]: () => gl.uniform2fv(location, val),
      [SchemaTypes.int]: () => {
        !val || typeof val === 'number' || typeof val === 'string'
          ? gl.uniform1i(location, val)
          : gl.uniform1iv(location, val)
      },
      [SchemaTypes.float]: () => {
        !val || typeof val === 'number' || typeof val === 'string'
          ? gl.uniform1f(location, val)
          : gl.uniform1fv(location, val)
      },
      [SchemaTypes.mat4]: () => gl.uniformMatrix4fv(location, false, val),
      [SchemaTypes.mat3]: () => gl.uniformMatrix3fv(location, false, val),
      [SchemaTypes.mat2]: () => gl.uniformMatrix2fv(location, false, val),
      [SchemaTypes.tex2D]: () => {
        unit++
        const texture = textures[key]
        if (!texture) console.warn(`Missing texture ${key} at unit ${unit}`)
        gl.uniform1i(location, unit)
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, texture)
      },
      [SchemaTypes.texCube]: () => {
        unit++
        const texture = null // TOOD
        if (!texture) console.warn(`Missing texture ${key} at unit ${unit}`)
        gl.uniform1i(location, unit)
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture)
      }
    }
    // FIXME uniform keys padded by default are always re-uploaded.
    if (val !== undefined || isTexure) uniformSetterMapping[type]()
  })

  const drawMode = schema.mode === GLTypes.triangles ? gl.TRIANGLES : gl.LINES
  gl.drawElements(drawMode, count, gl.UNSIGNED_INT, offset * 4)
}
