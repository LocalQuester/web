const canvas = document.querySelector("#xr-canvas");
const app = document.querySelector("#app");
const statusText = document.querySelector("#ar-status");
const gestureSurface = document.querySelector("#gesture-surface");
const cameraPreview = document.querySelector("#camera-preview");
const closeButton = document.querySelector("#close-button");
const modeToggle = document.querySelector(".mode-toggle");
const shutterButton = document.querySelector("#shutter-button");
const galleryButton = document.querySelector("#gallery-button");
const galleryInput = document.querySelector("#gallery-input");
const captureSheet = document.querySelector("#capture-sheet");
const capturePreview = document.querySelector("#capture-preview");
const captureCloseButton = document.querySelector("#capture-close");
const captureShareButton = document.querySelector("#capture-share");
const captureSaveButton = document.querySelector("#capture-save");
const cutoutSheet = document.querySelector("#cutout-sheet");
const cutoutCanvas = document.querySelector("#cutout-canvas");
const cutoutCancelButton = document.querySelector("#cutout-cancel");
const cutoutResetButton = document.querySelector("#cutout-reset");
const cutoutShapeButton = document.querySelector("#cutout-shape");
const cutoutRemoveButton = document.querySelector("#cutout-remove");
const processingOverlay = document.querySelector("#processing-overlay");
const processingText = document.querySelector("#processing-text");

// 기기에서 저장된 사진/영상의 카메라 배경이 위아래로 뒤집혀 있으면 true로 바꿉니다.
const CAMERA_TEXTURE_FLIP_Y = false;
const VIDEO_MAX_WIDTH = 720;
const HIT_TEST_ENTITY_TYPES = ["plane", "point"];
const FINDING_FLOOR_MESSAGE = "바닥을 찾고 있어요. 휴대폰을 천천히 좌우로 움직여 주세요.";

const characters = [{ name: "기본 캐릭터", src: "./assets/character.png" }];
let characterImage = loadImage(characters[0].src);

let xrSession = null;
let gl = null;
let program = null;
let vertexBuffer = null;
let texture = null;
let hitTestSource = null;
let transientHitTestSource = null;
let lastHitMatrix = null;
let placedCharacter = null;
let imageAspect = 0.7;
let extrusionSideVertices = [];
let characterScale = 1;
let manualRotation = 0;
let transientHitMatrices = new WeakMap();
const activePointers = new Map();
let pinchGesture = null;
let suppressSelectUntil = 0;
let frameData = null;
let referenceSpace = null;
let latestCameraPosition = { x: 0, y: 0, z: 0 };

// 촬영: WebXR Raw Camera Access(camera-access)로 카메라 이미지를 받아 직접 합성합니다.
let glBinding = null;
let cameraProgram = null;
let cameraQuadBuffer = null;
let cameraFrameData = null;
let captureTarget = null;
let latestCameraSize = null;
let captureMode = "photo";
let pendingPhoto = false;
let recorder = null;
let recordCanvas = null;
let recordChunks = [];
let lastCapture = null;
const frameCanvas = document.createElement("canvas");

const vertexShaderSource = `
attribute vec3 a_position;
attribute vec2 a_uv;
uniform mat4 u_mvp;
varying vec2 v_uv;
void main() {
  gl_Position = u_mvp * vec4(a_position, 1.0);
  v_uv = a_uv;
}`;

const fragmentShaderSource = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec4 u_color;
uniform float u_textured;
uniform float u_sideShade;
varying vec2 v_uv;
void main() {
  // 캐릭터 텍스처는 premultiplied alpha로 올려서 가장자리 필터링 때 검은 테두리가 생기지 않게 합니다.
  vec4 texel = texture2D(u_texture, v_uv);
  if (u_sideShade > 0.0) {
    // 두께 옆면: 실루엣 바로 안쪽 색을 불투명하게, 조금 어둡게 칠합니다.
    gl_FragColor = vec4(texel.rgb / max(texel.a, 0.001) * u_sideShade, 1.0);
    return;
  }
  vec4 outputColor = mix(vec4(u_color.rgb * u_color.a, u_color.a), texel, u_textured);
  if (outputColor.a < 0.01) discard;
  gl_FragColor = outputColor;
}`;

const cameraVertexShaderSource = `
attribute vec2 a_position;
uniform float u_flipY;
varying vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_position * 0.5 + 0.5;
  if (u_flipY > 0.5) v_uv.y = 1.0 - v_uv.y;
}`;

const cameraFragmentShaderSource = `
precision mediump float;
uniform sampler2D u_camera;
varying vec2 v_uv;
void main() {
  gl_FragColor = vec4(texture2D(u_camera, v_uv).rgb, 1.0);
}`;

// 사용 방법 안내 문구는 띄우지 않고(추후 ? 버튼에서 안내), 오류·누끼 진행 상황만 잠깐 보여 줍니다.
let statusTimer = 0;
function setStatus(message, { persist = false } = {}) {
  statusText.textContent = message;
  clearTimeout(statusTimer);
  if (!persist) statusTimer = setTimeout(() => { statusText.textContent = ""; }, 3500);
}

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}

// 처음 한 번 AR 지원 여부를 확인해 둡니다. 지원하지 않으면(iPhone 등) 첫 터치에서 자이로 모드로 시작합니다.
async function checkSupport() {
  if (!window.isSecureContext) {
    setStatus("보안 연결이 필요해요. HTTPS 주소로 접속해 주세요.", { persist: true });
    arSupported = false;
    return false;
  }
  arSupported = await detectARSupport();
  return arSupported;
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(vertexSource, fragmentSource) {
  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, compileShader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(shaderProgram, compileShader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(shaderProgram);
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(shaderProgram));
  return shaderProgram;
}

function initializeRenderer() {
  if (gl) return;
  gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    xrCompatible: true,
    preserveDrawingBuffer: false
  });
  if (!gl) throw new Error("WebGL을 시작하지 못했어요.");

  program = createProgram(vertexShaderSource, fragmentShaderSource);
  cameraProgram = createProgram(cameraVertexShaderSource, cameraFragmentShaderSource);

  vertexBuffer = gl.createBuffer();
  cameraQuadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cameraQuadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  if (characterImage.complete && characterImage.naturalWidth > 0) uploadCharacterTexture();
  else characterImage.addEventListener("load", uploadCharacterTexture, { once: true });

  frameData = {
    position: gl.getAttribLocation(program, "a_position"),
    uv: gl.getAttribLocation(program, "a_uv"),
    mvp: gl.getUniformLocation(program, "u_mvp"),
    color: gl.getUniformLocation(program, "u_color"),
    textured: gl.getUniformLocation(program, "u_textured"),
    sideShade: gl.getUniformLocation(program, "u_sideShade"),
    sampler: gl.getUniformLocation(program, "u_texture")
  };
  cameraFrameData = {
    position: gl.getAttribLocation(cameraProgram, "a_position"),
    flipY: gl.getUniformLocation(cameraProgram, "u_flipY"),
    sampler: gl.getUniformLocation(cameraProgram, "u_camera")
  };
}

function uploadCharacterTexture() {
  if (!gl || !texture || !characterImage.naturalWidth) return;
  imageAspect = characterImage.naturalWidth / characterImage.naturalHeight;
  // WebGL1은 2의 거듭제곱 크기여야 mipmap을 만들 수 있어서, 멀리서 볼 때 지글거리지 않도록 맞춰서 올립니다.
  const toPowerOfTwo = (size) => Math.min(1024, 2 ** Math.ceil(Math.log2(Math.max(1, size))));
  const potCanvas = document.createElement("canvas");
  potCanvas.width = toPowerOfTwo(characterImage.naturalWidth);
  potCanvas.height = toPowerOfTwo(characterImage.naturalHeight);
  const potContext = potCanvas.getContext("2d");
  potContext.imageSmoothingQuality = "high";
  potContext.drawImage(characterImage, 0, 0, potCanvas.width, potCanvas.height);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, potCanvas);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  extrusionSideVertices = buildExtrusionSides();
}

function setCharacter(index) {
  const character = characters[index];
  const image = loadImage(character.src);
  image.addEventListener("load", () => {
    characterImage = image;
    uploadCharacterTexture();
  }, { once: true });
  image.addEventListener("error", () => setStatus("캐릭터 이미지를 불러오지 못했어요."), { once: true });
}

// 알파 윤곽선을 marching squares로 따라가 두께 옆면을 만듭니다. 칸 단위 계단 대신 칸 사이를 보간해서
// 대각선·곡선 테두리가 매끄럽고, 옆면 색은 실루엣 바로 안쪽 픽셀에서 가져옵니다.
function buildExtrusionSides(height = 0.46, depth = 0.02) {
  const gridWidth = 192;
  const gridHeight = Math.max(1, Math.round(gridWidth / imageAspect));
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = gridWidth;
  maskCanvas.height = gridHeight;
  const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
  if (!maskContext) return [];
  try {
    maskContext.imageSmoothingQuality = "high";
    maskContext.drawImage(characterImage, 0, 0, gridWidth, gridHeight);
    const pixels = maskContext.getImageData(0, 0, gridWidth, gridHeight).data;
    const iso = 0.5;
    const alphaAt = (x, y) => x < 0 || y < 0 || x >= gridWidth || y >= gridHeight
      ? 0 : pixels[(y * gridWidth + x) * 4 + 3] / 255;
    const sampleAlpha = (x, y) => {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const top = alphaAt(x0, y0) * (1 - fx) + alphaAt(x0 + 1, y0) * fx;
      const bottom = alphaAt(x0, y0 + 1) * (1 - fx) + alphaAt(x0 + 1, y0 + 1) * fx;
      return top * (1 - fy) + bottom * fy;
    };
    const width = height * imageAspect;
    const halfDepth = depth / 2;
    const toLocal = ([x, y]) => [((x + 0.5) / gridWidth - 0.5) * width, height * (1 - (y + 0.5) / gridHeight)];
    const toUv = ([x, y]) => [
      Math.max(0, Math.min(1, (x + 0.5) / gridWidth)),
      Math.max(0, Math.min(1, 1 - (y + 0.5) / gridHeight))
    ];
    const vertices = [];
    const addWall = (p1, p2) => {
      // 기울기 방향(알파가 커지는 쪽 = 캐릭터 안쪽)으로 1.5칸 들어간 곳의 색을 씁니다.
      const mx = (p1[0] + p2[0]) / 2;
      const my = (p1[1] + p2[1]) / 2;
      const gx = sampleAlpha(mx + 0.5, my) - sampleAlpha(mx - 0.5, my);
      const gy = sampleAlpha(mx, my + 0.5) - sampleAlpha(mx, my - 0.5);
      const length = Math.hypot(gx, gy) || 1;
      const inward = [gx / length * 1.5, gy / length * 1.5];
      const [x1, y1] = toLocal(p1);
      const [x2, y2] = toLocal(p2);
      const [u1, v1] = toUv([p1[0] + inward[0], p1[1] + inward[1]]);
      const [u2, v2] = toUv([p2[0] + inward[0], p2[1] + inward[1]]);
      vertices.push(
        x1, y1, halfDepth, u1, v1, x2, y2, halfDepth, u2, v2, x2, y2, -halfDepth, u2, v2,
        x1, y1, halfDepth, u1, v1, x2, y2, -halfDepth, u2, v2, x1, y1, -halfDepth, u1, v1
      );
    };
    const crossing = (a, b) => (iso - a) / (b - a);

    // 바깥 한 칸(알파 0)까지 돌아서 이미지 가장자리에 닿은 캐릭터도 윤곽이 닫히게 합니다.
    for (let y = -1; y < gridHeight; y++) {
      for (let x = -1; x < gridWidth; x++) {
        const tl = alphaAt(x, y);
        const tr = alphaAt(x + 1, y);
        const br = alphaAt(x + 1, y + 1);
        const bl = alphaAt(x, y + 1);
        const index = (tl >= iso ? 8 : 0) | (tr >= iso ? 4 : 0) | (br >= iso ? 2 : 0) | (bl >= iso ? 1 : 0);
        if (index === 0 || index === 15) continue;
        const T = () => [x + crossing(tl, tr), y];
        const R = () => [x + 1, y + crossing(tr, br)];
        const B = () => [x + crossing(bl, br), y + 1];
        const L = () => [x, y + crossing(tl, bl)];
        const centerSolid = (tl + tr + br + bl) / 4 >= iso;
        switch (index) {
          case 1: case 14: addWall(L(), B()); break;
          case 2: case 13: addWall(B(), R()); break;
          case 3: case 12: addWall(L(), R()); break;
          case 4: case 11: addWall(T(), R()); break;
          case 6: case 9: addWall(T(), B()); break;
          case 7: case 8: addWall(T(), L()); break;
          case 5:
            if (centerSolid) { addWall(T(), L()); addWall(B(), R()); }
            else { addWall(T(), R()); addWall(L(), B()); }
            break;
          case 10:
            if (centerSolid) { addWall(T(), R()); addWall(L(), B()); }
            else { addWall(T(), L()); addWall(B(), R()); }
            break;
        }
      }
    }
    return new Float32Array(vertices);
  } catch (error) {
    console.warn("캐릭터 두께 메시를 만들지 못했어요.", error);
    return [];
  }
}

function multiplyMatrices(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      out[column * 4 + row] =
        a[0 * 4 + row] * b[column * 4 + 0] +
        a[1 * 4 + row] * b[column * 4 + 1] +
        a[2 * 4 + row] * b[column * 4 + 2] +
        a[3 * 4 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function smooth01(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function landingSquash(progress) {
  const takeoff = Math.max(0, Math.min(1, 1 - progress * 7));
  const landing = Math.max(0, Math.min(1, (progress - 0.86) * 7));
  return (takeoff - landing) * 0.055;
}

function getCharacterMotion(character, timeMs) {
  const phase = Math.max(0, timeMs * 0.001 - character.cycleStartedAt) % 7.2;
  const width = 0.46 * imageAspect;
  const travelDistance = Math.max(0.045, Math.min(0.16, width * 0.18));
  const jumpHeight = Math.max(0.03, Math.min(0.10, 0.46 * 0.075));
  const stepHeight = jumpHeight * 0.25;
  const aspect = 0.46 / Math.max(width, 0.0001);
  const wobbleAngle = 2.5 + Math.max(0, Math.min(1, (aspect - 0.5) / 1.5)) * 2.5;
  let horizontal = 0;
  let vertical = 0;
  let yaw = 0;
  let wobble = 0;
  let squash = 0;

  if (phase < 0.65) {
    wobble = Math.sin(phase * 4) * 1.2;
  } else if (phase < 1.85) {
    const t = smooth01((phase - 0.65) / 1.2);
    horizontal = -travelDistance * t;
    vertical = Math.abs(Math.sin(t * Math.PI * 2)) * stepHeight;
    wobble = Math.sin(t * Math.PI * 4) * wobbleAngle;
  } else if (phase < 2.75) {
    const t = (phase - 1.85) / 0.9;
    horizontal = -travelDistance + travelDistance * 0.65 * smooth01(t);
    vertical = Math.sin(t * Math.PI) * jumpHeight;
    yaw = t * Math.PI * 2;
    squash = landingSquash(t);
  } else if (phase < 4.35) {
    const t = smooth01((phase - 2.75) / 1.6);
    horizontal = -travelDistance * 0.35 + travelDistance * 1.35 * t;
    vertical = Math.abs(Math.sin(t * Math.PI * 3)) * stepHeight;
    wobble = -Math.sin(t * Math.PI * 6) * wobbleAngle;
  } else if (phase < 5.2) {
    const t = (phase - 4.35) / 0.85;
    horizontal = travelDistance;
    vertical = Math.sin(t * Math.PI) * jumpHeight * 0.9;
    yaw = -t * Math.PI * 2;
    squash = landingSquash(t);
  } else if (phase < 6.25) {
    const t = smooth01((phase - 5.2) / 1.05);
    horizontal = travelDistance * (1 - t);
    vertical = Math.abs(Math.sin(t * Math.PI * 2)) * stepHeight;
    wobble = Math.sin(t * Math.PI * 4) * wobbleAngle;
  } else {
    wobble = Math.sin((phase - 6.25) * 3) * 1.4;
  }
  return { horizontal, vertical, yaw, wobble: wobble * Math.PI / 180, squash };
}

function makeCharacterMatrix(character, time) {
  const hitMatrix = character.matrix;
  const motion = getCharacterMotion(character, time);
  const rootYaw = character.yaw + manualRotation;
  const yaw = rootYaw + motion.yaw;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const wc = Math.cos(motion.wobble);
  const ws = Math.sin(motion.wobble);
  const scaleX = characterScale * (1 + motion.squash);
  const scaleY = characterScale * (1 - motion.squash);
  const x = hitMatrix[12] + Math.cos(rootYaw) * motion.horizontal;
  const y = hitMatrix[13] + 0.006 + motion.vertical;
  const z = hitMatrix[14] + Math.sin(rootYaw) * motion.horizontal;
  return new Float32Array([
    c * wc * scaleX, ws * scaleX, s * wc * scaleX, 0,
    -c * ws * scaleY, wc * scaleY, -s * ws * scaleY, 0,
    -s * characterScale, 0, c * characterScale, 0,
    x, y, z, 1
  ]);
}

function bindVertexData(vertices) {
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(frameData.position);
  gl.vertexAttribPointer(frameData.position, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(frameData.uv);
  gl.vertexAttribPointer(frameData.uv, 2, gl.FLOAT, false, 20, 12);
}

function drawGeometry(vertices, mode, count, viewProjection, modelMatrix, color, textured, sideShade = 0) {
  const model = modelMatrix || identityMatrix();
  const mvp = multiplyMatrices(viewProjection, model);
  bindVertexData(vertices);
  gl.uniformMatrix4fv(frameData.mvp, false, mvp);
  gl.uniform4fv(frameData.color, color);
  gl.uniform1f(frameData.textured, textured ? 1 : 0);
  gl.uniform1f(frameData.sideShade, sideShade);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(frameData.sampler, 0);
  gl.drawArrays(mode, 0, count);
}

function identityMatrix() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function makeCharacterVertices(height = 0.46, z = 0.01) {
  const width = height * imageAspect;
  return [
    -width / 2, 0, z, 0, 0,
     width / 2, 0, z, 1, 0,
    -width / 2, height, z, 0, 1,
     width / 2, height, z, 1, 1
  ];
}

function makeReticleVertices(hitMatrix, radius = 0.11) {
  const result = [];
  const count = 48;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const local = [Math.cos(angle) * radius, 0.003, Math.sin(angle) * radius, 1];
    const world = new Float32Array(4);
    for (let row = 0; row < 4; row++)
      world[row] = hitMatrix[row] * local[0] + hitMatrix[4 + row] * local[1] +
        hitMatrix[8 + row] * local[2] + hitMatrix[12 + row] * local[3];
    result.push(world[0], world[1], world[2], 0, 0);
  }
  return result;
}

function getViewProjection(view) {
  return multiplyMatrices(view.projectionMatrix, view.transform.inverse.matrix);
}

function drawScene(viewProjection, time, includeReticle) {
  gl.useProgram(program);
  if (includeReticle && lastHitMatrix) {
    drawGeometry(makeReticleVertices(lastHitMatrix), gl.LINE_LOOP, 48, viewProjection,
      null, new Float32Array([0.3, 0.95, 0.55, 0.95]), false);
  }
  if (placedCharacter && texture) {
    const model = makeCharacterMatrix(placedCharacter, time);
    // 옆면을 먼저 그려야 앞·뒷면의 반투명 가장자리 픽셀이 깊이 버퍼로 옆면을 가리지 않습니다.
    if (extrusionSideVertices.length) {
      drawGeometry(extrusionSideVertices, gl.TRIANGLES, extrusionSideVertices.length / 5, viewProjection,
        model, new Float32Array([1, 1, 1, 1]), true, 0.78);
    }
    drawGeometry(makeCharacterVertices(0.46, 0.01), gl.TRIANGLE_STRIP, 4, viewProjection,
      model, new Float32Array([1, 1, 1, 1]), true);
    drawGeometry(makeCharacterVertices(0.46, -0.01), gl.TRIANGLE_STRIP, 4, viewProjection,
      model, new Float32Array([1, 1, 1, 1]), true);
  }
}

function renderFrame(time, frame) {
  const session = frame.session;
  const pose = frame.getViewerPose(referenceSpace);
  if (!pose) {
    session.requestAnimationFrame(renderFrame);
    return;
  }

  const hitResults = hitTestSource ? frame.getHitTestResults(hitTestSource) : [];
  lastHitMatrix = hitResults.length ? hitResults[0].getPose(referenceSpace)?.transform.matrix : null;
  if (transientHitTestSource && typeof frame.getHitTestResultsForTransientInput === "function") {
    for (const inputResult of frame.getHitTestResultsForTransientInput(transientHitTestSource)) {
      const hitPose = inputResult.results[0]?.getPose(referenceSpace);
      if (hitPose) transientHitMatrices.set(inputResult.inputSource, new Float32Array(hitPose.transform.matrix));
    }
  }
  // 시작 버튼 없이 바로 쓰도록, 처음 바닥을 찾으면 화면 가운데 위치에 캐릭터를 자동으로 놓습니다.
  if (lastHitMatrix && !placedCharacter) {
    placeCharacter(lastHitMatrix);
    if (statusText.textContent === FINDING_FLOOR_MESSAGE) setStatus("");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, session.renderState.baseLayer.framebuffer);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  latestCameraPosition = pose.views[0].transform.position;
  const camera = pose.views[0].camera;
  if (camera) latestCameraSize = { width: camera.width, height: camera.height };
  for (const view of pose.views) {
    const viewport = session.renderState.baseLayer.getViewport(view);
    gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    drawScene(getViewProjection(view), time, true);
  }

  if (pendingPhoto || recorder) captureFrame(pose.views[0], time);

  session.requestAnimationFrame(renderFrame);
}

// ---------- 촬영 ----------

function ensureCaptureTarget(width, height) {
  if (captureTarget && captureTarget.width === width && captureTarget.height === height) return;
  if (captureTarget) {
    gl.deleteFramebuffer(captureTarget.framebuffer);
    gl.deleteTexture(captureTarget.texture);
    gl.deleteRenderbuffer(captureTarget.depth);
  }
  const colorTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, colorTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  captureTarget = { framebuffer, texture: colorTexture, depth, width, height };
}

function drawCameraBackground(cameraTexture) {
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.useProgram(cameraProgram);
  gl.disableVertexAttribArray(frameData.position);
  gl.disableVertexAttribArray(frameData.uv);
  gl.bindBuffer(gl.ARRAY_BUFFER, cameraQuadBuffer);
  gl.enableVertexAttribArray(cameraFrameData.position);
  gl.vertexAttribPointer(cameraFrameData.position, 2, gl.FLOAT, false, 8, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, cameraTexture);
  gl.uniform1i(cameraFrameData.sampler, 0);
  gl.uniform1f(cameraFrameData.flipY, CAMERA_TEXTURE_FLIP_Y ? 1 : 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disableVertexAttribArray(cameraFrameData.position);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
}

// 전체 화면 카메라라서 프레임 전체를 씁니다. 영상 인코더를 위해 짝수 크기로 맞춥니다.
function getCropRect(width, height) {
  return { x: 0, y: 0, width: width & ~1, height: height & ~1 };
}

function getCaptureSize(camera, forVideo) {
  const scale = forVideo ? Math.min(1, VIDEO_MAX_WIDTH / camera.width) : 1;
  return { width: Math.round(camera.width * scale), height: Math.round(camera.height * scale) };
}

function captureFrame(view, time) {
  const camera = view.camera;
  if (!glBinding || !camera) {
    if (pendingPhoto) setStatus("이 기기에서는 카메라 합성 촬영(camera-access)을 지원하지 않아요.");
    pendingPhoto = false;
    if (recorder) stopRecording();
    return;
  }

  const forVideo = Boolean(recorder) && !pendingPhoto;
  const { width, height } = getCaptureSize(camera, forVideo);
  const cameraTexture = glBinding.getCameraImage(camera);
  ensureCaptureTarget(width, height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, captureTarget.framebuffer);
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  drawCameraBackground(cameraTexture);
  drawScene(getViewProjection(view), time, false);

  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // readPixels는 아래쪽 행부터 반환하므로 뒤집어서 옮깁니다.
  const imageData = new ImageData(width, height);
  const rowBytes = width * 4;
  for (let row = 0; row < height; row++)
    imageData.data.set(pixels.subarray((height - 1 - row) * rowBytes, (height - row) * rowBytes), row * rowBytes);
  frameCanvas.width = width;
  frameCanvas.height = height;
  frameCanvas.getContext("2d").putImageData(imageData, 0, 0);
  const crop = getCropRect(width, height);

  if (pendingPhoto) {
    pendingPhoto = false;
    const output = document.createElement("canvas");
    output.width = crop.width;
    output.height = crop.height;
    output.getContext("2d").drawImage(frameCanvas, crop.x, crop.y, crop.width, crop.height,
      0, 0, crop.width, crop.height);
    output.toBlob((blob) => {
      if (blob) showCapture(blob, "image/jpeg");
      else setStatus("사진을 만들지 못했어요.");
    }, "image/jpeg", 0.92);
  } else if (recordCanvas) {
    recordCanvas.getContext("2d").drawImage(frameCanvas, crop.x, crop.y, crop.width, crop.height,
      0, 0, recordCanvas.width, recordCanvas.height);
  }
}

function pickVideoMimeType() {
  return ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"]
    .find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function startRecording() {
  if (gyroActive) {
    startGyroRecording();
    return;
  }
  if (!glBinding || !latestCameraSize) {
    setStatus("이 기기에서는 카메라 합성 촬영(camera-access)을 지원하지 않아요.");
    return;
  }
  if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
    setStatus("이 브라우저는 영상 녹화를 지원하지 않아요.");
    return;
  }
  const { width, height } = getCaptureSize(latestCameraSize, true);
  const crop = getCropRect(width, height);
  beginRecording(crop.width, crop.height);
}

function beginRecording(width, height) {
  recordCanvas = document.createElement("canvas");
  recordCanvas.width = width;
  recordCanvas.height = height;
  const mimeType = pickVideoMimeType();
  recordChunks = [];
  recorder = new MediaRecorder(recordCanvas.captureStream(30), mimeType ? { mimeType } : undefined);
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) recordChunks.push(event.data);
  });
  recorder.addEventListener("stop", () => {
    const type = recorder?.mimeType || mimeType || "video/webm";
    recorder = null;
    recordCanvas = null;
    app.classList.remove("recording");
    if (recordChunks.length) showCapture(new Blob(recordChunks, { type }), type);
  }, { once: true });
  recorder.start(1000);
  app.classList.add("recording");
}

function stopRecording() {
  if (recorder && recorder.state !== "inactive") recorder.stop();
}

function makeFileName(mimeType) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const extension = mimeType.startsWith("image/") ? "jpg" : mimeType.includes("mp4") ? "mp4" : "webm";
  return `localquester-${stamp}.${extension}`;
}

function showCapture(blob, mimeType) {
  if (lastCapture) URL.revokeObjectURL(lastCapture.url);
  const url = URL.createObjectURL(blob);
  lastCapture = { url, file: new File([blob], makeFileName(mimeType), { type: blob.type || mimeType }) };
  const media = mimeType.startsWith("image/") ? document.createElement("img") : document.createElement("video");
  media.src = url;
  if (media instanceof HTMLVideoElement) {
    media.controls = true;
    media.playsInline = true;
    media.loop = true;
    media.autoplay = true;
    media.muted = true;
  } else {
    media.alt = "촬영한 사진";
  }
  capturePreview.replaceChildren(media);
  captureShareButton.hidden = !(navigator.canShare && navigator.canShare({ files: [lastCapture.file] }));
  captureSheet.hidden = false;
}

function closeCapture() {
  captureSheet.hidden = true;
  capturePreview.replaceChildren();
}

function saveCapture() {
  if (!lastCapture) return;
  const link = document.createElement("a");
  link.href = lastCapture.url;
  link.download = lastCapture.file.name;
  document.body.append(link);
  link.click();
  link.remove();
}

async function shareCapture() {
  if (!lastCapture) return;
  try {
    await navigator.share({ files: [lastCapture.file], title: "로컬 퀘스터 AR" });
  } catch (error) {
    if (error.name !== "AbortError") setStatus(`공유하지 못했어요: ${error.message}`);
  }
}

function onShutter() {
  if (preparingCharacter) return;
  if (!isCameraRunning()) {
    startCamera();
    return;
  }
  if (captureMode === "photo") {
    pendingPhoto = true;
  } else if (recorder) {
    stopRecording();
  } else {
    startRecording();
  }
}

function setCaptureMode(mode) {
  if (recorder) return;
  captureMode = mode;
  modeToggle.dataset.mode = mode;
  app.classList.toggle("mode-video", mode === "video");
  for (const button of modeToggle.querySelectorAll("button"))
    button.setAttribute("aria-checked", String(button.dataset.mode === mode));
}

// ---------- 카메라 미리보기 ----------

// WebXR AR 세션은 사용자가 화면을 한 번 터치해야 시작할 수 있어서(브라우저 보안 규칙),
// 그 전까지는 일반 카메라(getUserMedia)를 바로 띄워 둡니다. 첫 터치에서 AR로 넘어갑니다.
let previewStream = null;
let startingAR = false;
let closeRequested = false;

async function startPreview() {
  if (previewStream || xrSession || startingAR || !navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    // 권한을 기다리는 사이 AR이 시작됐으면 카메라를 바로 놓아 줍니다(ARCore가 카메라를 써야 함).
    if (xrSession || startingAR) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    previewStream = stream;
    cameraPreview.srcObject = stream;
  } catch (error) {
    console.warn("카메라 미리보기를 시작하지 못했어요.", error);
    setStatus("카메라를 켜지 못했어요. 카메라 권한을 확인해 주세요.");
  }
}

function stopPreview() {
  previewStream?.getTracks().forEach((track) => track.stop());
  previewStream = null;
  cameraPreview.srcObject = null;
}

// ---------- AR 세션 ----------

function placeCharacter(hitMatrix) {
  if (placedCharacter) {
    // Moving the placed character must not reset its chosen facing, scale, or animation phase.
    placedCharacter.matrix = new Float32Array(hitMatrix);
    return;
  }
  const viewerPosition = latestCameraPosition;
  const yaw = Math.atan2(viewerPosition.x - hitMatrix[12], viewerPosition.z - hitMatrix[14]);
  placedCharacter = {
    matrix: new Float32Array(hitMatrix),
    yaw,
    cycleStartedAt: performance.now() * 0.001 + Math.random() * 0.35
  };
}

async function startAR() {
  if (xrSession || startingAR) return;
  startingAR = true;
  try {
    const supported = await checkSupport();
    if (!supported) {
      // 지원 여부를 확인하기 전에 터치한 경우입니다. iPhone은 이때 권한 창이 안 뜰 수 있어, 거부되면 화면 고정으로 동작해요.
      startingAR = false;
      startGyroMode();
      return;
    }
    stopPreview();

    initializeRenderer();
    await gl.makeXRCompatible();
    const session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay", "local-floor", "camera-access"],
      domOverlay: { root: app }
    });
    xrSession = session;
    session.addEventListener("end", onSessionEnded, { once: true });
    session.addEventListener("select", (event) => {
      if (pinchGesture || performance.now() < suppressSelectUntil) return;
      // select 이벤트의 event.frame에서는 getViewerPose·hit-test 결과를 읽을 수 없어서(InvalidStateError),
      // renderFrame이 저장해 둔 터치 위치(없으면 가운데 조준점)와 카메라 위치를 씁니다.
      const selectedHitMatrix = transientHitMatrices.get(event.inputSource) || lastHitMatrix;
      if (selectedHitMatrix) placeCharacter(selectedHitMatrix);
    });

    session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl, { alpha: true, antialias: true }) });
    const cameraAccessEnabled = !session.enabledFeatures || session.enabledFeatures.includes("camera-access");
    glBinding = cameraAccessEnabled && typeof XRWebGLBinding === "function" ? new XRWebGLBinding(session, gl) : null;
    referenceSpace = await session.requestReferenceSpace("local");
    const viewerSpace = await session.requestReferenceSpace("viewer");
    // 평면(plane)이 완성되기 전에도 특징점(point)으로 바닥 위치를 잡아서 첫 배치를 빠르게 합니다.
    // entityTypes를 지원하지 않는 브라우저에서는 기본값(plane)으로 다시 요청합니다.
    try {
      hitTestSource = await session.requestHitTestSource({ space: viewerSpace, entityTypes: HIT_TEST_ENTITY_TYPES });
    } catch {
      hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
    }
    if (typeof session.requestHitTestSourceForTransientInput === "function") {
      try {
        transientHitTestSource = await session.requestHitTestSourceForTransientInput({
          profile: "generic-touchscreen",
          entityTypes: HIT_TEST_ENTITY_TYPES
        }).catch(() => session.requestHitTestSourceForTransientInput({ profile: "generic-touchscreen" }));
      } catch (error) {
        console.warn("화면 터치 위치 hit-test를 사용할 수 없어 중앙 조준점 모드로 동작합니다.", error);
        transientHitTestSource = null;
      }
    }
    transientHitMatrices = new WeakMap();
    document.body.classList.add("in-ar");
    // 바닥을 찾는 동안에만 안내를 띄우고, 캐릭터가 놓이면 지웁니다.
    setStatus(FINDING_FLOOR_MESSAGE, { persist: true });
    session.requestAnimationFrame(renderFrame);
  } catch (error) {
    setStatus(`AR 시작 실패: ${error.message || error}`);
    if (xrSession) {
      try { await xrSession.end(); } catch { /* session may already be ended */ }
    }
    document.body.classList.remove("in-ar");
  } finally {
    startingAR = false;
    if (!xrSession) startPreview();
  }
}

function onSessionEnded() {
  stopRecording();
  xrSession = null;
  glBinding = null;
  hitTestSource = null;
  transientHitTestSource = null;
  referenceSpace = null;
  lastHitMatrix = null;
  placedCharacter = null;
  pendingPhoto = false;
  characterScale = 1;
  manualRotation = 0;
  document.body.classList.remove("in-ar");
  if (statusText.textContent === FINDING_FLOOR_MESSAGE) setStatus("");
  // 닫기(X)로 끝냈으면 이전 화면(웹앱에서는 네비바가 있는 화면)으로 돌아가고, 그 외에는 카메라 미리보기로 돌아옵니다.
  if (closeRequested && history.length > 1) history.back();
  else startPreview();
  closeRequested = false;
}

// ---------- 자이로 모드(AR 미지원 기기, iPhone 등) ----------

// 웹 AR(WebXR)을 쓸 수 없는 기기에서는 카메라 미리보기 위에 캐릭터를 그리고, 기울기 센서로 카메라 방향을 따라가서
// 캐릭터가 공간의 한 자리에 머무는 것처럼 보이게 합니다(위치 이동은 추적하지 않는 3DoF).
// 바닥은 눈높이 아래의 가상 평면으로 두고, 화면을 터치한 방향과 그 평면이 만나는 곳에 캐릭터를 놓습니다.
// 안드로이드에서 시험하려면 주소 뒤에 ?mode=gyro 를 붙입니다.
const FORCE_GYRO_MODE = new URLSearchParams(location.search).get("mode") === "gyro";
const GYRO_EYE_HEIGHT = 1.3; // m, 가상 바닥까지의 높이
const GYRO_MAX_DISTANCE = 4; // m, 이보다 멀거나 하늘을 가리키면 이 거리의 바닥에 놓음
const GYRO_VERTICAL_FOV = 63 * Math.PI / 180; // 세로 화면 기준 후면 카메라 화각(대략값)
let gyroActive = false;
let gyroFrameId = 0;
let gyroOrientation = null; // { alpha, beta, gamma } (도)
let gyroCameraMatrix = null; // 카메라 → 월드 회전(열 우선 4×4)
let gyroProjection = null;
let gyroCanvasHome = null;
let arSupported = null; // null: 아직 모름

async function detectARSupport() {
  if (FORCE_GYRO_MODE || !window.isSecureContext || !navigator.xr) return false;
  try {
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

function onDeviceOrientation(event) {
  if (event.alpha === null && event.beta === null) return;
  gyroOrientation = { alpha: event.alpha || 0, beta: event.beta || 0, gamma: event.gamma || 0 };
}

// iPhone은 기울기 센서를 쓰려면 사용자 터치 안에서 권한을 받아야 합니다. 터치 핸들러에서 await 없이 먼저 부릅니다.
function requestOrientationPermission() {
  const request = window.DeviceOrientationEvent?.requestPermission;
  if (typeof request !== "function") return Promise.resolve("granted");
  return request.call(DeviceOrientationEvent).catch(() => "denied");
}

// deviceorientation(지구 좌표: X 동, Y 북, Z 위)을 WebGL 월드 좌표(Y 위, -Z 북)의 카메라 회전으로 바꿉니다.
function makeGyroCameraMatrix(orientation) {
  const toRad = Math.PI / 180;
  const a = orientation.alpha * toRad;
  const b = orientation.beta * toRad;
  const g = orientation.gamma * toRad;
  const screenAngle = (screen.orientation?.angle ?? window.orientation ?? 0) * toRad;
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  const cg = Math.cos(g), sg = Math.sin(g);
  // R = Rz(alpha) · Rx(beta) · Ry(gamma): 기기 좌표 → 지구 좌표 (행 우선)
  const r = [
    ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg,
    sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg,
    -cb * sg, sb, cb * cg
  ];
  // 화면이 돌아간 만큼 되돌립니다: R · Rz(-screenAngle)
  const cs = Math.cos(-screenAngle), ss = Math.sin(-screenAngle);
  const m = [
    r[0] * cs + r[1] * ss, -r[0] * ss + r[1] * cs, r[2],
    r[3] * cs + r[4] * ss, -r[3] * ss + r[4] * cs, r[5],
    r[6] * cs + r[7] * ss, -r[6] * ss + r[7] * cs, r[8]
  ];
  // 지구 좌표 → 월드 좌표: x = 동, y = 위(지구 Z), z = 남(-지구 Y)
  const row = (i) => [m[i * 3], m[i * 3 + 1], m[i * 3 + 2]];
  const [ex, ey, ez] = [row(0), row(1), row(2)];
  const wx = ex, wy = ez, wz = ey.map((value) => -value);
  return new Float32Array([
    wx[0], wy[0], wz[0], 0,
    wx[1], wy[1], wz[1], 0,
    wx[2], wy[2], wz[2], 0,
    0, 0, 0, 1
  ]);
}

function makePerspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0
  ]);
}

// 화면 좌표(px)에서 나간 시선이 가상 바닥과 만나는 지점을 캐릭터 위치(평행이동 행렬)로 돌려줍니다.
function gyroFloorHit(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
  const tanY = Math.tan(GYRO_VERTICAL_FOV / 2);
  const local = [ndcX * tanY * (rect.width / rect.height), ndcY * tanY, -1];
  const m = gyroCameraMatrix;
  const dir = [
    m[0] * local[0] + m[4] * local[1] + m[8] * local[2],
    m[1] * local[0] + m[5] * local[1] + m[9] * local[2],
    m[2] * local[0] + m[6] * local[1] + m[10] * local[2]
  ];
  let x, z;
  const horizontal = Math.hypot(dir[0], dir[2]) || 1;
  if (dir[1] < -0.05 && GYRO_EYE_HEIGHT / -dir[1] * horizontal <= GYRO_MAX_DISTANCE) {
    const t = GYRO_EYE_HEIGHT / -dir[1];
    x = dir[0] * t;
    z = dir[2] * t;
  } else {
    x = dir[0] / horizontal * GYRO_MAX_DISTANCE * 0.5;
    z = dir[2] / horizontal * GYRO_MAX_DISTANCE * 0.5;
  }
  const matrix = identityMatrix();
  matrix[12] = x;
  matrix[13] = -GYRO_EYE_HEIGHT;
  matrix[14] = z;
  return matrix;
}

function resizeGyroCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gyroProjection = makePerspective(GYRO_VERTICAL_FOV, width / height, 0.05, 50);
}

function renderGyroFrame(time) {
  if (!gyroActive) return;
  resizeGyroCanvas();
  // 센서 값이 아직 없으면(권한 거부·센서 없음) 정면 아래를 보는 자세로 고정합니다.
  gyroCameraMatrix = makeGyroCameraMatrix(gyroOrientation || { alpha: 0, beta: 70, gamma: 0 });
  if (!placedCharacter && cameraPreview.videoWidth) {
    const rect = canvas.getBoundingClientRect();
    placeCharacter(gyroFloorHit(rect.left + rect.width / 2, rect.top + rect.height * 0.6));
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // 카메라는 원점에 있고 회전만 하므로 view = 회전의 역행렬(전치)입니다.
  const m = gyroCameraMatrix;
  const view = new Float32Array([
    m[0], m[4], m[8], 0,
    m[1], m[5], m[9], 0,
    m[2], m[6], m[10], 0,
    0, 0, 0, 1
  ]);
  drawScene(multiplyMatrices(gyroProjection, view), time, false);
  // WebGL 캔버스는 이 프레임이 끝나면 지워지므로, 촬영은 그리기 직후 같은 프레임에서 합성합니다.
  if (pendingPhoto || recorder) captureGyroFrame();
  gyroFrameId = requestAnimationFrame(renderGyroFrame);
}

// 카메라 영상(화면처럼 꽉 차게 자른 것) 위에 캐릭터 캔버스를 겹쳐 그립니다.
function composeGyroFrame(target) {
  const context = target.getContext("2d");
  const videoWidth = cameraPreview.videoWidth;
  const videoHeight = cameraPreview.videoHeight;
  const scale = Math.max(target.width / videoWidth, target.height / videoHeight);
  const drawWidth = videoWidth * scale;
  const drawHeight = videoHeight * scale;
  context.drawImage(cameraPreview, (target.width - drawWidth) / 2, (target.height - drawHeight) / 2, drawWidth, drawHeight);
  context.drawImage(canvas, 0, 0, target.width, target.height);
}

function captureGyroFrame() {
  if (!cameraPreview.videoWidth) return;
  if (pendingPhoto) {
    pendingPhoto = false;
    const output = document.createElement("canvas");
    output.width = canvas.width & ~1;
    output.height = canvas.height & ~1;
    composeGyroFrame(output);
    output.toBlob((blob) => {
      if (blob) showCapture(blob, "image/jpeg");
      else setStatus("사진을 만들지 못했어요.");
    }, "image/jpeg", 0.92);
  } else if (recordCanvas) {
    composeGyroFrame(recordCanvas);
  }
}

function startGyroRecording() {
  if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
    setStatus("이 브라우저는 영상 녹화를 지원하지 않아요.");
    return;
  }
  const scale = Math.min(1, VIDEO_MAX_WIDTH / canvas.width);
  beginRecording(Math.round(canvas.width * scale) & ~1, Math.round(canvas.height * scale) & ~1);
}

// 터치(권한 요청)와 같은 호출 안에서 시작해야 해서 async 없이 시작합니다.
function startGyroMode() {
  if (gyroActive) return;
  const permission = requestOrientationPermission();
  gyroActive = true;
  latestCameraPosition = { x: 0, y: 0, z: 0 };
  initializeRenderer();
  // 캐릭터 캔버스를 카메라 미리보기 바로 위(버튼·제스처 영역 아래)로 옮깁니다.
  gyroCanvasHome = { parent: canvas.parentNode, next: canvas.nextSibling };
  cameraPreview.after(canvas);
  document.body.classList.add("in-gyro");
  window.addEventListener("deviceorientation", onDeviceOrientation);
  permission.then((state) => {
    if (state !== "granted") setStatus("동작 및 방향 권한이 없어 캐릭터가 화면에 고정돼요.");
  });
  startPreview();
  gyroFrameId = requestAnimationFrame(renderGyroFrame);
}

function stopGyroMode() {
  if (!gyroActive) return;
  gyroActive = false;
  cancelAnimationFrame(gyroFrameId);
  stopRecording();
  window.removeEventListener("deviceorientation", onDeviceOrientation);
  if (gyroCanvasHome) gyroCanvasHome.parent.insertBefore(canvas, gyroCanvasHome.next);
  document.body.classList.remove("in-gyro");
  placedCharacter = null;
  pendingPhoto = false;
  characterScale = 1;
  manualRotation = 0;
}

// 화면 첫 터치·셔터에서 부릅니다. AR을 지원하면 WebXR, 아니면 자이로 모드로 시작합니다.
function startCamera() {
  if (arSupported === false) startGyroMode();
  else startAR();
}

function isCameraRunning() {
  return Boolean(xrSession) || gyroActive;
}

// ---------- 캐릭터 누끼(배경 제거) ----------

// @imgly/background-removal: 브라우저 안에서 ONNX 모델로 배경을 지웁니다. AGPL-3.0 라이선스라 배포 전 확인이 필요해요.
const BACKGROUND_REMOVAL_MODULE = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm";
const CHARACTER_MAX_SIZE = 1024;
const GALLERY_MAX_BYTES = 20 * 1024 * 1024;
const GALLERY_MAX_PIXELS = 50_000_000; // 약 8000×6000
const GALLERY_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/avif"]);
let backgroundRemovalModule = null;
let preparingCharacter = false;

function canvasToBlob(sourceCanvas) {
  return new Promise((resolve, reject) => sourceCanvas.toBlob(
    (blob) => (blob ? resolve(blob) : reject(new Error("이미지를 PNG로 만들지 못했어요."))), "image/png"));
}

// 갤러리 파일 검사: 이미지가 아니거나 너무 크면 거절 이유를 돌려줍니다(accept="image/*"는 힌트일 뿐이라 다시 확인).
function checkGalleryFile(file) {
  // 일부 안드로이드 갤러리는 형식을 비워서 주므로, 빈 값은 통과시키고 실제 디코딩에서 걸러냅니다.
  if (file.type && !GALLERY_IMAGE_TYPES.has(file.type)) return "JPG, PNG, WEBP, GIF, HEIC 이미지만 불러올 수 있어요.";
  if (file.size > GALLERY_MAX_BYTES) return `${GALLERY_MAX_BYTES / 1024 / 1024}MB보다 작은 이미지를 골라 주세요.`;
  return "";
}

// 전체를 디코딩하기 전에 이미지 크기만 읽습니다(<img>는 화면에 그리기 전까지 픽셀을 풀지 않음).
function readImageSize(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 읽지 못했어요. 다른 사진을 골라 주세요.")); };
    image.src = url;
  });
}

async function drawToCanvas(source, maxSize = CHARACTER_MAX_SIZE) {
  // 아주 큰 사진을 원본 크기로 풀면 폰 메모리가 부족해 앱이 꺼질 수 있어서,
  // 화소 수를 먼저 확인하고 디코딩할 때부터 필요한 크기로 줄여서 풉니다.
  const size = await readImageSize(source);
  if (!size.width || !size.height) throw new Error("이미지를 읽지 못했어요. 다른 사진을 골라 주세요.");
  if (size.width * size.height > GALLERY_MAX_PIXELS)
    throw new Error("해상도가 너무 큰 이미지예요. 더 작은 사진을 골라 주세요.");
  const scale = Math.min(1, maxSize / Math.max(size.width, size.height));
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = Math.max(1, Math.round(size.width * scale));
  outputCanvas.height = Math.max(1, Math.round(size.height * scale));
  const bitmap = await createImageBitmap(source, {
    resizeWidth: outputCanvas.width,
    resizeHeight: outputCanvas.height,
    resizeQuality: "high"
  });
  const context = outputCanvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, outputCanvas.width, outputCanvas.height);
  bitmap.close();
  return { canvas: outputCanvas, context };
}

// 이미 투명 배경 PNG면(테두리 픽셀 대부분이 투명) 모델을 돌리지 않습니다.
function hasTransparentBackground(context, width, height) {
  const data = context.getImageData(0, 0, width, height).data;
  let border = 0;
  let transparent = 0;
  const check = (x, y) => {
    border++;
    if (data[(y * width + x) * 4 + 3] < 16) transparent++;
  };
  for (let x = 0; x < width; x++) { check(x, 0); check(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { check(0, y); check(width - 1, y); }
  return transparent / border > 0.6;
}

// 투명한 여백을 잘라내서 캐릭터 발이 바닥(이미지 아래쪽)에 닿게 합니다.
async function trimTransparentEdges(sourceCanvas, context) {
  const { width, height } = sourceCanvas;
  const data = context.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 24) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error("캐릭터를 찾지 못했어요. 대상이 잘 보이는 사진을 골라 주세요.");
  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const trimmed = document.createElement("canvas");
  trimmed.width = maxX - minX + 1;
  trimmed.height = maxY - minY + 1;
  trimmed.getContext("2d").drawImage(sourceCanvas, minX, minY, trimmed.width, trimmed.height,
    0, 0, trimmed.width, trimmed.height);
  return canvasToBlob(trimmed);
}

function createProgressReporter() {
  let lastPercent = -1;
  return (key, current, total) => {
    if (key === "compute:decode") showProcessing("배경을 지우고 있어요…");
    if (!key.startsWith("fetch:") || !total) return;
    const percent = Math.floor(current / total * 100);
    if (percent === lastPercent) return;
    lastPercent = percent;
    showProcessing(`배경 제거 모델 내려받는 중… ${percent}%\n(처음 한 번만 받아요)`);
  };
}

// 배경 제거는 background-worker.js(Web Worker)에서 돌립니다. 워커를 쓸 수 없는 브라우저에서만 메인 스레드로 대신합니다.
let backgroundWorker = null;
let backgroundWorkerFailed = false;
let backgroundJobId = 0;

function removeBackgroundInWorker(blob) {
  return new Promise((resolve, reject) => {
    if (!backgroundWorker) backgroundWorker = new Worker("./background-worker.js", { type: "module" });
    const worker = backgroundWorker;
    const id = ++backgroundJobId;
    const report = createProgressReporter();
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
    const onMessage = ({ data }) => {
      if (data.id !== id) return;
      if (data.type === "progress") {
        report(data.key, data.current, data.total);
        return;
      }
      cleanup();
      if (data.type === "done") resolve(data.blob);
      else reject(new Error(data.message));
    };
    // 모듈을 불러오지 못하는 등 워커 자체가 실패한 경우
    const onError = (event) => {
      cleanup();
      worker.terminate();
      backgroundWorker = null;
      reject(new Error(event.message || "배경 제거 워커를 시작하지 못했어요."));
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({ id, blob });
  });
}

async function removeImageBackground(blob) {
  if (!backgroundWorkerFailed && typeof Worker === "function") {
    try {
      return await removeBackgroundInWorker(blob);
    } catch (error) {
      console.warn("워커에서 배경을 지우지 못해 메인 스레드로 다시 시도합니다.", error);
      backgroundWorkerFailed = true;
    }
  }
  // 메인 스레드에서 계산하면 그동안 AR 화면이 멈춰서, 켜져 있으면 먼저 끕니다(끝나면 한 번 터치해서 다시 시작).
  if (xrSession) await xrSession.end().catch(() => {});
  if (!backgroundRemovalModule) {
    showProcessing("배경 제거 도구를 불러오고 있어요…");
    backgroundRemovalModule = await import(BACKGROUND_REMOVAL_MODULE);
  }
  return backgroundRemovalModule.removeBackground(blob, {
    model: "isnet_quint8",
    output: { format: "image/png" },
    progress: createProgressReporter()
  });
}

// 테두리 픽셀 대부분이 한 가지 색이면(흰 배경 일러스트 등) 그 색을 배경색으로 봅니다.
function findUniformBackgroundColor(context, width, height) {
  const data = context.getImageData(0, 0, width, height).data;
  const samples = [];
  const step = Math.max(1, Math.floor((width + height) / 400));
  const sample = (x, y) => {
    const i = (y * width + x) * 4;
    samples.push([data[i], data[i + 1], data[i + 2]]);
  };
  for (let x = 0; x < width; x += step) { sample(x, 0); sample(x, height - 1); }
  for (let y = 0; y < height; y += step) { sample(0, y); sample(width - 1, y); }
  const median = [0, 1, 2].map((channel) => samples.map((rgb) => rgb[channel]).sort((a, b) => a - b)[samples.length >> 1]);
  const close = samples.filter((rgb) => colorDistance(rgb, median) < 40).length;
  return close / samples.length >= 0.85 ? median : null;
}

function colorDistance([r1, g1, b1], [r2, g2, b2]) {
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

// 단순 배경: 이미지 테두리에서 이어진 배경색 영역만 지웁니다. 선으로 둘러싸인 캐릭터 안쪽은
// 배경과 색이 같아도 이어져 있지 않아서 남습니다(AI 모델이 선만 남기던 문제 해결).
function removeUniformBackground(sourceCanvas, context, background) {
  const { width, height } = sourceCanvas;
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const isBackground = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const tolerance = 48;
  const visit = (index) => {
    if (isBackground[index]) return;
    const i = index * 4;
    if (colorDistance([data[i], data[i + 1], data[i + 2]], background) >= tolerance) return;
    isBackground[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    if (x > 0) visit(index - 1);
    if (x < width - 1) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index < width * (height - 1)) visit(index + width);
  }
  for (let index = 0; index < width * height; index++) {
    const i = index * 4;
    if (isBackground[index]) {
      data[i + 3] = 0;
      continue;
    }
    // 배경과 맞닿은 가장자리 픽셀은 배경색에 가까운 만큼 반투명하게 해서 흰 테두리를 줄입니다.
    const x = index % width;
    const touchesBackground = (x > 0 && isBackground[index - 1]) || (x < width - 1 && isBackground[index + 1]) ||
      (index >= width && isBackground[index - width]) || (index < width * (height - 1) && isBackground[index + width]);
    if (touchesBackground) {
      const distance = colorDistance([data[i], data[i + 1], data[i + 2]], background);
      data[i + 3] = Math.round(data[i + 3] * Math.min(1, distance / (tolerance * 2)));
    }
  }
  context.putImageData(imageData, 0, 0);
}

// AI 결과에서 캐릭터가 반투명하게 남는 것을 줄이려고 알파 대비를 높입니다(0.25 이하 투명, 0.75 이상 불투명).
function sharpenAlpha(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    const alpha = Math.max(0, Math.min(1, (data[i] / 255 - 0.25) / 0.5));
    data[i] = Math.round(alpha * 255);
    if (alpha > 0.5) opaque++;
  }
  context.putImageData(imageData, 0, 0);
  return opaque / (width * height);
}

function showProcessing(message) {
  processingText.textContent = message;
  processingText.style.whiteSpace = "pre-line";
  processingOverlay.hidden = false;
}

function hideProcessing() {
  processingOverlay.hidden = true;
}

// 화면이 실제로 그려질 때까지 기다립니다(무거운 계산 전에 처리 중 화면이 먼저 보이도록).
function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

// 갤러리 이미지를 보여 주고 사용자가 손가락으로 캐릭터 범위를 그리게 합니다.
// 결과: { mode: "remove" | "shape", polygon: [[x, y], ...] | null } (이미지 좌표), 취소하면 null.
function openCutoutEditor(sourceCanvas) {
  return new Promise((resolve) => {
    const context = cutoutCanvas.getContext("2d");
    let polygon = [];
    let drawing = false;
    let fit = { scale: 1, x: 0, y: 0 };

    const toCanvas = ([x, y]) => [fit.x + x * fit.scale, fit.y + y * fit.scale];
    const addPolygonPath = () => {
      polygon.forEach((point, index) => {
        const [x, y] = toCanvas(point);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
    };
    const render = () => {
      context.clearRect(0, 0, cutoutCanvas.width, cutoutCanvas.height);
      context.drawImage(sourceCanvas, fit.x, fit.y, sourceCanvas.width * fit.scale, sourceCanvas.height * fit.scale);
      if (polygon.length < 2) return;
      if (!drawing && polygon.length >= 3) {
        // 그린 범위 바깥을 어둡게 해서 어떤 부분이 쓰일지 보여 줍니다.
        context.beginPath();
        context.rect(0, 0, cutoutCanvas.width, cutoutCanvas.height);
        addPolygonPath();
        context.closePath();
        context.fillStyle = "rgba(0, 0, 0, .55)";
        context.fill("evenodd");
      }
      context.beginPath();
      addPolygonPath();
      if (!drawing) context.closePath();
      context.lineWidth = 3 * (window.devicePixelRatio || 1);
      context.lineJoin = "round";
      context.strokeStyle = "#5fd08b";
      context.stroke();
    };
    const layout = () => {
      const rect = cutoutCanvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      cutoutCanvas.width = Math.max(1, Math.round(rect.width * ratio));
      cutoutCanvas.height = Math.max(1, Math.round(rect.height * ratio));
      const scale = Math.min(cutoutCanvas.width / sourceCanvas.width, cutoutCanvas.height / sourceCanvas.height);
      fit = {
        scale,
        x: (cutoutCanvas.width - sourceCanvas.width * scale) / 2,
        y: (cutoutCanvas.height - sourceCanvas.height * scale) / 2
      };
      render();
    };
    const toImage = (event) => {
      const rect = cutoutCanvas.getBoundingClientRect();
      const ratio = cutoutCanvas.width / rect.width;
      const x = ((event.clientX - rect.left) * ratio - fit.x) / fit.scale;
      const y = ((event.clientY - rect.top) * ratio - fit.y) / fit.scale;
      return [Math.max(0, Math.min(sourceCanvas.width, x)), Math.max(0, Math.min(sourceCanvas.height, y))];
    };
    const onDown = (event) => {
      drawing = true;
      polygon = [toImage(event)];
      try { cutoutCanvas.setPointerCapture(event.pointerId); } catch { /* ignore */ }
      render();
    };
    const onMove = (event) => {
      if (!drawing) return;
      const point = toImage(event);
      const last = polygon[polygon.length - 1];
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) * fit.scale < 3) return;
      polygon.push(point);
      render();
    };
    const onUp = () => {
      if (!drawing) return;
      drawing = false;
      if (polygon.length < 3) polygon = [];
      render();
    };
    const finish = (result) => {
      cutoutSheet.hidden = true;
      window.removeEventListener("resize", layout);
      cutoutCanvas.removeEventListener("pointerdown", onDown);
      cutoutCanvas.removeEventListener("pointermove", onMove);
      cutoutCanvas.removeEventListener("pointerup", onUp);
      cutoutCanvas.removeEventListener("pointercancel", onUp);
      cutoutCancelButton.onclick = null;
      cutoutResetButton.onclick = null;
      cutoutShapeButton.onclick = null;
      cutoutRemoveButton.onclick = null;
      resolve(result);
    };

    cutoutCanvas.addEventListener("pointerdown", onDown);
    cutoutCanvas.addEventListener("pointermove", onMove);
    cutoutCanvas.addEventListener("pointerup", onUp);
    cutoutCanvas.addEventListener("pointercancel", onUp);
    window.addEventListener("resize", layout);
    cutoutCancelButton.onclick = () => finish(null);
    cutoutResetButton.onclick = () => { polygon = []; render(); };
    cutoutShapeButton.onclick = () => {
      if (polygon.length < 3) {
        setStatus("그린 모양대로 쓰려면 먼저 캐릭터를 둘러 그려 주세요.");
        return;
      }
      finish({ mode: "shape", polygon });
    };
    cutoutRemoveButton.onclick = () => finish({ mode: "remove", polygon: polygon.length >= 3 ? polygon : null });
    cutoutSheet.hidden = false;
    requestAnimationFrame(layout);
  });
}

// 그린 범위를 감싸는 사각형만큼 잘라 새 캔버스로 만듭니다. polygon은 잘린 캔버스 좌표로 옮깁니다.
function cropToPolygon(sourceCanvas, polygon) {
  const pad = 4;
  const xs = polygon.map(([x]) => x);
  const ys = polygon.map(([, y]) => y);
  const left = Math.max(0, Math.floor(Math.min(...xs)) - pad);
  const top = Math.max(0, Math.floor(Math.min(...ys)) - pad);
  const right = Math.min(sourceCanvas.width, Math.ceil(Math.max(...xs)) + pad);
  const bottom = Math.min(sourceCanvas.height, Math.ceil(Math.max(...ys)) + pad);
  const cropped = document.createElement("canvas");
  cropped.width = Math.max(1, right - left);
  cropped.height = Math.max(1, bottom - top);
  const context = cropped.getContext("2d", { willReadFrequently: true });
  context.drawImage(sourceCanvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  return { canvas: cropped, context, polygon: polygon.map(([x, y]) => [x - left, y - top]) };
}

// 그린 범위 바깥을 투명하게 합니다.
function applyPolygonMask(context, polygon) {
  context.save();
  context.globalCompositeOperation = "destination-in";
  context.beginPath();
  polygon.forEach(([x, y], index) => (index === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
  context.closePath();
  context.fillStyle = "#000";
  context.fill();
  context.restore();
}

// AI가 캐릭터 안쪽을 구멍처럼 투명하게 만든 부분을 원래 색으로 메웁니다.
// 바깥과 이어지지 않은 투명 영역 중 캐릭터 면적의 25%보다 작은 것만 메웁니다(팔과 몸 사이 같은 큰 틈은 유지).
function fillEnclosedHoles(context, width, height, sourceContext) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const source = sourceContext.getImageData(0, 0, width, height).data;
  const total = width * height;
  const transparent = (index) => data[index * 4 + 3] < 128;
  const label = new Int32Array(total);
  const queue = new Int32Array(total);
  let opaqueCount = 0;
  for (let index = 0; index < total; index++) if (!transparent(index)) opaqueCount++;

  // startIndex에서 이어진 투명 픽셀에 mark를 붙이고, 붙인 픽셀 수를 돌려줍니다(queue 앞쪽에 위치가 남음).
  const flood = (startIndex, mark) => {
    let head = 0;
    let tail = 0;
    label[startIndex] = mark;
    queue[tail++] = startIndex;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      if (x > 0) visit(index - 1);
      if (x < width - 1) visit(index + 1);
      if (index >= width) visit(index - width);
      if (index < total - width) visit(index + width);
    }
    return tail;
    function visit(next) {
      if (label[next] || !transparent(next)) return;
      label[next] = mark;
      queue[tail++] = next;
    }
  };
  // 1: 이미지 테두리와 이어진 진짜 배경
  const floodBorder = (index) => {
    if (transparent(index) && !label[index]) flood(index, 1);
  };
  for (let x = 0; x < width; x++) { floodBorder(x); floodBorder((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { floodBorder(y * width); floodBorder(y * width + width - 1); }
  // 2 이상: 캐릭터 안에 갇힌 구멍. 작은 구멍만 원래 색으로 메웁니다.
  let mark = 2;
  for (let index = 0; index < total; index++) {
    if (!transparent(index) || label[index]) continue;
    const size = flood(index, mark++);
    if (size >= opaqueCount * 0.25) continue;
    for (let k = 0; k < size; k++) {
      const p = queue[k] * 4;
      data[p] = source[p];
      data[p + 1] = source[p + 1];
      data[p + 2] = source[p + 2];
      data[p + 3] = 255;
    }
  }
  context.putImageData(imageData, 0, 0);
}

function opaqueFraction(context, width, height) {
  const data = context.getImageData(0, 0, width, height).data;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 128) opaque++;
  return opaque / (width * height);
}

// 결과: 캐릭터 PNG Blob, 사용자가 취소하면 null
async function prepareCharacterImage(file) {
  const original = await drawToCanvas(file);
  const choice = await openCutoutEditor(original.canvas);
  // 편집 화면 버튼을 누른 터치가 유효한 지금 AR을 켭니다. 배경 제거는 워커에서 돌아서 AR과 함께 진행돼요.
  // 워커를 쓸 수 없어 AI를 메인 스레드에서 돌려야 하면, 화면이 멈추지 않게 AR은 처리 후에 켭니다.
  const needsMainThreadAI = backgroundWorkerFailed && choice?.mode === "remove";
  if ((choice || resumeARAfterGallery) && !needsMainThreadAI) {
    resumeARAfterGallery = false;
    startAR();
  }
  if (!choice) return null;

  showProcessing("캐릭터를 만들고 있어요…");
  await nextPaint();
  const work = choice.polygon ? cropToPolygon(original.canvas, choice.polygon) : { ...original, polygon: null };
  let resultCanvas = work.canvas;
  let resultContext = work.context;

  if (choice.mode === "remove" && !hasTransparentBackground(resultContext, resultCanvas.width, resultCanvas.height)) {
    const background = findUniformBackgroundColor(resultContext, resultCanvas.width, resultCanvas.height);
    if (background) {
      removeUniformBackground(resultCanvas, resultContext, background);
    } else {
      const cutout = await removeImageBackground(await canvasToBlob(resultCanvas));
      showProcessing("캐릭터를 다듬고 있어요…");
      await nextPaint();
      const result = await drawToCanvas(cutout, Math.max(resultCanvas.width, resultCanvas.height));
      sharpenAlpha(result.context, result.canvas.width, result.canvas.height);
      fillEnclosedHoles(result.context, result.canvas.width, result.canvas.height, work.context);
      resultCanvas = result.canvas;
      resultContext = result.context;
    }
  }
  if (work.polygon) applyPolygonMask(resultContext, work.polygon);
  if (opaqueFraction(resultContext, resultCanvas.width, resultCanvas.height) < 0.02)
    throw new Error("캐릭터를 찾지 못했어요. 범위를 다시 그리거나 '그린 모양 그대로'를 써 보세요.");
  return trimTransparentEdges(resultCanvas, resultContext);
}

// ---------- UI 이벤트 ----------

shutterButton.addEventListener("click", onShutter);
closeButton.addEventListener("click", () => {
  if (xrSession) {
    closeRequested = true;
    xrSession.end();
    return;
  }
  stopGyroMode();
  if (history.length > 1) history.back();
});
// 미리보기 화면 아무 곳이나 처음 터치하면 AR(지원하지 않으면 자이로 모드)을 시작합니다(버튼·토글·촬영 결과 시트는 제외).
app.addEventListener("click", (event) => {
  // 캐릭터를 준비하는 동안(범위 그리기·배경 제거)에는 AR을 시작하지 않습니다. 동시에 시작하면 화면이 멈췄습니다.
  if (isCameraRunning() || startingAR || preparingCharacter) return;
  if (event.target.closest("button, input, .capture-sheet, .cutout-sheet, .processing-overlay")) return;
  resumeARAfterGallery = false;
  startCamera();
});
modeToggle.addEventListener("click", (event) => {
  const mode = event.target.closest("button")?.dataset.mode;
  if (mode) setCaptureMode(mode);
});

// 갤러리 화면이 열리면 크롬이 AR 세션을 끝냅니다. 돌아왔을 때 브라우저가 허용하면(최근 터치가 아직 유효하면)
// AR을 자동으로 다시 시작하고, 허용하지 않으면 화면을 한 번 터치해야 다시 시작됩니다.
let resumeARAfterGallery = false;
function resumeARIfAllowed() {
  if (!resumeARAfterGallery || xrSession || startingAR || preparingCharacter) return;
  if (!navigator.userActivation?.isActive) return;
  resumeARAfterGallery = false;
  startAR();
}
galleryButton.addEventListener("click", () => {
  if (preparingCharacter) return;
  resumeARAfterGallery = Boolean(xrSession);
  galleryInput.click();
});
galleryInput.addEventListener("cancel", resumeARIfAllowed);
galleryInput.addEventListener("change", async () => {
  const file = galleryInput.files?.[0];
  galleryInput.value = "";
  if (!file || preparingCharacter) return;
  const rejection = checkGalleryFile(file);
  if (rejection) {
    setStatus(rejection);
    resumeARIfAllowed();
    return;
  }
  preparingCharacter = true;
  galleryButton.disabled = true;
  try {
    const blob = await prepareCharacterImage(file);
    if (blob) {
      // 불러온 캐릭터는 한 개만 유지하고, 이전 이미지의 blob URL은 해제해서 메모리가 쌓이지 않게 합니다.
      // (이미 화면에 쓰고 있는 이미지는 디코딩이 끝난 상태라 URL을 해제해도 그대로 보입니다.)
      const previous = characters[1];
      characters[1] = { name: file.name.replace(/\.[^.]+$/, "") || "내 캐릭터", src: URL.createObjectURL(blob) };
      setCharacter(1);
      if (previous) URL.revokeObjectURL(previous.src);
    }
  } catch (error) {
    console.error(error);
    setStatus(`캐릭터 이미지를 준비하지 못했어요: ${error.message || error}`);
  } finally {
    hideProcessing();
    preparingCharacter = false;
    galleryButton.disabled = false;
  }
  // 편집 화면의 버튼 터치가 아직 유효하면(배경 제거가 빨리 끝난 경우) AR을 바로 다시 시작합니다.
  resumeARIfAllowed();
});

captureCloseButton.addEventListener("click", closeCapture);
captureSaveButton.addEventListener("click", saveCapture);
captureShareButton.addEventListener("click", shareCapture);

// 자이로 모드에서는 WebXR select 이벤트가 없어서, 한 손가락 터치·드래그로 캐릭터를 그 위치의 바닥으로 옮깁니다.
function moveGyroCharacter(event) {
  if (!gyroActive || pinchGesture || activePointers.size !== 1 || !gyroCameraMatrix) return;
  if (performance.now() < suppressSelectUntil) return;
  placeCharacter(gyroFloorHit(event.clientX, event.clientY));
}

gestureSurface.addEventListener("pointerdown", (event) => {
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  try { gestureSurface.setPointerCapture(event.pointerId); } catch { /* XR overlay may not support capture */ }
  moveGyroCharacter(event);
  if (activePointers.size >= 2 && placedCharacter) {
    const points = [...activePointers.values()];
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    pinchGesture = {
      distance: Math.max(1, Math.hypot(dx, dy)),
      angle: Math.atan2(dy, dx),
      scale: characterScale,
      rotation: manualRotation
    };
    suppressSelectUntil = performance.now() + 450;
  }
});

gestureSurface.addEventListener("pointermove", (event) => {
  if (!activePointers.has(event.pointerId)) return;
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  moveGyroCharacter(event);
  if (!pinchGesture || activePointers.size < 2 || !placedCharacter) return;

  const points = [...activePointers.values()];
  const dx = points[1].x - points[0].x;
  const dy = points[1].y - points[0].y;
  characterScale = Math.max(0.5, Math.min(2, pinchGesture.scale * Math.hypot(dx, dy) / pinchGesture.distance));
  manualRotation = pinchGesture.rotation - (Math.atan2(dy, dx) - pinchGesture.angle);
  suppressSelectUntil = performance.now() + 450;
});

function finishPointerGesture(event) {
  if (pinchGesture) suppressSelectUntil = performance.now() + 500;
  activePointers.delete(event.pointerId);
  if (activePointers.size < 2) pinchGesture = null;
}

gestureSurface.addEventListener("pointerup", finishPointerGesture);
gestureSurface.addEventListener("pointercancel", finishPointerGesture);
// 버튼·토글을 누를 때는 캐릭터 배치(select)가 일어나지 않게 막습니다.
app.addEventListener("beforexrselect", (event) => {
  if (!gestureSurface.contains(event.target) || pinchGesture || performance.now() < suppressSelectUntil)
    event.preventDefault();
});
characterImage.addEventListener("error", () => setStatus("캐릭터 PNG를 불러오지 못했어요."));

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}

setCaptureMode("photo");
startPreview();
checkSupport();
