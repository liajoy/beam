import { SchemaTypes } from '../../src/index.js'

const defaultVS = `
attribute vec4 position;
attribute vec2 texCoord;

varying highp vec2 vTexCoord;

void main() {
  gl_Position = position;
  vTexCoord = texCoord;
}
`

const defaultFS = `
precision highp float;
uniform sampler2D img;

varying highp vec2 vTexCoord;

void main() {
  vec4 texColor = texture2D(img, vTexCoord);
  gl_FragColor = texColor;
}
`

const { vec2, vec4, float, tex2D } = SchemaTypes

export const BasicImage = {
  vs: defaultVS,
  fs: defaultFS,
  buffers: {
    position: { type: vec4, n: 3 },
    texCoord: { type: vec2 }
  },
  textures: {
    img: { type: tex2D }
  }
}

const brighnessContrastFS = `
precision highp float;
uniform sampler2D input1;
uniform sampler2D input2;
uniform float brightness;
uniform float contrast;

varying highp vec2 vTexCoord;

void main() {
  vec4 color1 = texture2D(input1, vTexCoord);

  vec4 color2 = texture2D(input2, vTexCoord);
  color2.rgb += brightness;
  if (contrast > 0.0) {
    color2.rgb = (color2.rgb - 0.5) / (1.0 - contrast) + 0.5;
  } else {
    color2.rgb = (color2.rgb - 0.5) * (1.0 + contrast) + 0.5;
  }

  gl_FragColor = vec4(color1.r, color2.gb, 1);
}
`

export const BrightnessContrast = {
  vs: defaultVS,
  fs: brighnessContrastFS,
  buffers: {
    position: { type: vec4, n: 3 },
    texCoord: { type: vec2 }
  },
  textures: {
    input1: { type: tex2D },
    input2: { type: tex2D }
  },
  uniforms: {
    brightness: { type: float, default: 0 },
    contrast: { type: float, default: 0 }
  }
}

export const hueSaturationFS = `
precision highp float;
uniform sampler2D img;
uniform float hue;
uniform float saturation;

varying vec2 vTexCoord;

void main() {
  vec4 color = texture2D(img, vTexCoord);

  /* hue adjustment, wolfram alpha: RotationTransform[angle, {1, 1, 1}][{x, y, z}] */
  float angle = hue * 3.14159265;
  float s = sin(angle), c = cos(angle);
  vec3 weights = (vec3(2.0 * c, -sqrt(3.0) * s - c, sqrt(3.0) * s - c) + 1.0) / 3.0;
  float len = length(color.rgb);
  color.rgb = vec3(
    dot(color.rgb, weights.xyz),
    dot(color.rgb, weights.zxy),
    dot(color.rgb, weights.yzx)
  );

  /* saturation adjustment */
  float average = (color.r + color.g + color.b) / 3.0;
  if (saturation > 0.0) {
    color.rgb += (average - color.rgb) * (1.0 - 1.0 / (1.001 - saturation));
  } else {
    color.rgb += (average - color.rgb) * (-saturation);
  }
  gl_FragColor = color;
}
`

export const HueSaturation = {
  ...BasicImage,
  fs: hueSaturationFS,
  uniforms: {
    hue: { type: float, default: 0 },
    saturation: { type: float, default: 0 }
  }
}

const vignetteFS = `
precision highp float;
uniform sampler2D img;
uniform float vignette;

varying vec2 vTexCoord;

void main() {
  float innerVig = 1.0 - vignette;
  float outerVig = 1.0001; // Position for the outer vignette
  // float innerVig = 0.4; // Position for the inner vignette ring

  vec3 color = texture2D(img, vTexCoord).rgb;
  vec2 center = vec2(0.5, 0.5); // center of screen
  // Distance between center and the current uv. Multiplyed by 1.414213 to fit in the range of 0.0 to 1.0.
  float dist = distance(center, vTexCoord) * 1.414213;
  // Generate the vignette with clamp which go from outer ring to inner ring with smooth steps.
  float vig = clamp((outerVig - dist) / (outerVig - innerVig), 0.0, 1.0);
  color *= vig; // Multiply the vignette with the texture color
  gl_FragColor = vec4(color, 1.0);
}
`

export const Vignette = {
  ...BasicImage,
  fs: vignetteFS,
  uniforms: {
    vignette: { type: float, default: 0 }
  }
}

const bilateralFS = `
/**************************************************************************
* 函数名称： bilateral
* 功能描述： 双边滤波
* 输入参数： input1：图像数据
* 输入参数： width：图像的宽度 
* 输入参数： height：图像的高度 
* 输出参数： gl_FragColor：图像数据
* 其它说明： 
* 特别说明：
* 修改日期：2019-05-17  修改人： bohu
* -----------------------------------------------
* 17/5/19  V20190725
**************************************************************************/
precision highp float;
varying vec2 vTexCoord;

// 基础图层
uniform sampler2D input1;  

// 图像宽度
uniform float width;
// 图像高度
uniform float height;

float X_D65 = 0.950467;
float Y_D65 = 1.0000;
float Z_D65 = 1.088969;
float CIE_EPSILON = 0.008856;
float CIE_KAPPA = 903.3;
float CIE_KAPPA_EPSILON = 7.9996248;

#define mixCoord 0.00001
#define maxCoord 0.99999

vec4 rgbToXYZ(vec4 rgbNom)
{
  vec4 xyz;
  //vec4 rgbNom = rgb;
  vec4 stepVal = 1.0 - step(0.04045, rgbNom);
  //vec4 powVal = vec4(pow((rgbNom[0] + 0.055) / 1.055, 2.4), pow((rgbNom[1] + 0.055) / 1.055, 2.4), pow((rgbNom[2] + 0.055) / 1.055, 2.4), 1.0);
  vec4 powVal = pow((rgbNom + 0.055) / 1.055, vec4(2.4));
  vec4 linearVal = mix(powVal, rgbNom / 12.92, stepVal);

  mat3 fmat0 = mat3(0.4124, 0.3576, 0.1805,
    0.2126, 0.7152, 0.0722,
    0.0193, 0.1192, 0.9505);

  mat3 fmat1 = mat3(linearVal[0], linearVal[1], linearVal[2],
    linearVal[0], linearVal[1], linearVal[2],
    linearVal[0], linearVal[1], linearVal[2]);

  mat3 mult = matrixCompMult(fmat0, fmat1);
  vec3 x = mult[0];
  vec3 y = mult[1];
  vec3 z = mult[2];

  xyz[0] = x[0] + x[1] + x[2];
  xyz[1] = y[0] + y[1] + y[2];
  xyz[2] = z[0] + z[1] + z[2];
  xyz[3] = 1.0;
  return xyz;
}

vec4 xyzToLab(vec4 xyz)
{
  vec4 lab;
  vec3 xr = vec3(xyz[0], xyz[1], xyz[2]) / vec3(X_D65, Y_D65, Z_D65);
  vec3 stepVal = 1.0 - step(CIE_EPSILON, xr);
  //vec3 powVal = vec3(pow(xr[0], 1.0 / 3.0), pow(xr[1], 1.0 / 3.0), pow(xr[2], 1.0 / 3.0));
  vec3 powVal = pow(xr, vec3(1.0 / 3.0));
  vec3 fx = mix(powVal, (CIE_KAPPA * xr + 16.0) / 116.0, stepVal);

  lab[0] = (116.0 * fx[1] - 16.0);
  lab[1] = (500.0 * (fx[0] - fx[1]));
  lab[2] = (200.0 * (fx[1] - fx[2]));
  lab[3] = 255.0;
  return lab;
}

vec4 colorToLab(vec4 rgb)
{
  vec4 xyz;
  vec4 lab;
  xyz = rgbToXYZ(rgb);
  lab = xyzToLab(xyz);
  return lab;
}

vec4 gaussianBlur(sampler2D tex, float  kernelRadius, float sigma, float sigmaColor, vec4 srgb)
{
  const float Maxkernel_size = 201.0;
  float kernel_size = kernelRadius * 2.0 + 1.0;
  float sigmaX = sigma > 0.0 ? sigma : ((kernel_size - 1.0)*0.5 - 1.0)*0.3 + 0.8;//当sigma小于0时，采用公式得到sigma(只与n有关)
  float scale2X = -0.5 / (sigmaX*sigmaX);//高斯表达式后面要用到

  vec4 rgb = vec4(0.0);
  float gaussian_kernel_sum = 0.0;
  vec2 vecSize = vec2(width,height);
  vec2 iuv = vec2(vTexCoord * vecSize);
  vec2 invWidthHeight = 1.0 / vec2(width, height);//必须高精度
  // 根据分辨率自适应调整最大步长
  float minv = min(width, height);
  float maxStepV = clamp(minv / 200.0, 3.0, 10.0);
  //float maxStepV = 12.0;//clamp(6.0 * width / 960.0, .0, 10.0);
  // 自适应调整采样间距
  float stepV = clamp(kernelRadius / 8.0, 1.0, maxStepV);//6.0
    stepV = 5.0;
  float minV = 0.0;
  if(width > height)
  {
    minV = height;
  }
  else
  {
        minV = width;
  }
    
  if(minV <= 300.0)
  {
      stepV = 1.0;  
  }
  else if(minV <= 600.0)
  {
    stepV = 2.0;
  }
  else if(minV <= 1000.0)
  {
      stepV = 3.0;
  }
  else if(minV <= 1500.0)
  {
      stepV = 4.0;
  }
  else if(minV <= 2000.0)
  {
      stepV = 5.0;
  }
  // 当前像素值
  vec4 slab = colorToLab(srgb);
  slab[0] *= 2.55;

  for (float x = 0.0; x < Maxkernel_size; x ++)
  {
    if (x * stepV >= kernel_size)
    {
      break;
    }
    for (float y = 0.0; y < Maxkernel_size; y ++)
    {
      if (y * stepV >= kernel_size)
      {
        break;
      }
      vec2 newxy = (iuv - vec2(kernelRadius) + vec2(x * stepV, y * stepV)) * invWidthHeight ;
      vec4 src = texture2D(tex, newxy); //TvTexelFetch(tex, vecSize, vec2(new_x, new_y)).rgba;
      vec4 lab = colorToLab(src);
      lab[0] *= 2.55;
      vec2 mn = vec2(x * stepV, y * stepV) - vec2((kernel_size - 1.0) * 0.5);
      mn *= mn;
      vec2 weightxy = exp(scale2X * mn);
      float mod = dot(slab.rgb - lab.rgb, slab.rgb - lab.rgb);
      float res = exp(-mod / (2.0 * sigmaColor * sigmaColor));
      float weight = weightxy.x * weightxy.y * res;

      // 注意边界数值
      float bAdd = step(mixCoord, newxy.x) * step(newxy.x, maxCoord) * step(mixCoord, newxy.y) * step(newxy.y, maxCoord);
      rgb += lab * weight * bAdd;
      gaussian_kernel_sum += weight * bAdd;
    }
  }

  rgb /= gaussian_kernel_sum;

  return rgb/255.0;
}

void main()
{
  vec4 src = texture2D(input1, vTexCoord);

  float minV = 0.0;
  float radius = 100.0;
  //float sigma= 150.0;
  // hightlight
  //float sigmaS= 30.0;
  //float sigmaC= 30.0;
  // shadow
  float sigmaS= 80.0;
  float sigmaC= 80.0;

  if(width > height)
  {
    minV = height;
  }
  else
  {
    minV = width;
  }
  if(minV <= 300.0)
  {
      radius = 20.0;
    // sigmaS = 10.0;
    // sigmaC = 80.0;
  }
  else if(minV <= 600.0)
  {
      radius = 30.0;
    // sigmaS = 10.0;
    // sigmaC = 80.0;
  }
  else if(minV <= 1000.0)
  {
      radius = 50.0;
    // sigmaS = 10.0;
    // sigmaC = 80.0;
  }
  else if(minV <= 1500.0)
  {
      radius = 60.0;
    // sigmaS = 10.0;
    // sigmaC = 80.0;
  }
  else if(minV <= 2000.0)
  {
      radius = 80.0;
    // sigmaS = 10.0;
    // sigmaC = 80.0;
  }
  gl_FragColor = vec4(gaussianBlur(input1, radius, sigmaS, sigmaC, src).rrr, 1); 
}
`

export const Bilateral = {
  vs: defaultVS,
  fs: bilateralFS,
  buffers: {
    position: { type: vec4, n: 3 },
    texCoord: { type: vec2 }
  },
  textures: {
    input1: { type: tex2D }
  },
  uniforms: {
    width: { type: float },
    height: { type: float }
  }
}
