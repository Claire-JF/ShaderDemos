#ifdef GL_ES
precision highp float;
#endif

//==============================================
// Frosted Jelly Shader
// Features:
// - Smooth SDF jelly shape
// - Frosted glass surface (micro-normal perturbation + refractive blur)
// - Depth of field (DOF) responsive to mouse focus
// - Global color gradient
// - Breathing pulse brightness variation
//==============================================

// ---------- Uniforms ----------
uniform float u_time;
uniform vec2  u_mouse_ext;
uniform vec2  u_resolution;

// ---------- Constants ----------
#define MAX_STEPS 50
#define MAX_DIST  100.0
#define SURF_DIST 0.001
#define PI 3.14159265359

// ---------- Globals ----------
float g_mouseInfluence = 0.0;
vec2  g_aspect = vec2(1.0);

//============================================================
// Utility Functions
//============================================================
mat2 rot2D(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) +
           (c - a) * u.y * (1.0 - u.x) +
           (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 5; i++) {
        sum += amp * noise(p * freq);
        amp *= 0.5;
        freq *= 2.0;
    }
    return sum;
}

//============================================================
// Background Gradient + Cloud Layer
//============================================================
vec3 bgColorAt(vec2 uv01) {
    vec2 p = uv01 - 0.5;
    float r = length(p);

    vec3 a = vec3(0.15, 0.16, 0.18);
    vec3 b = vec3(0.28, 0.19, 0.20);
    vec3 base = mix(a, b, smoothstep(0.0, 0.7, r));

    float cloud = fbm(uv01 * 2.5 + u_time * 0.02);
    return base + 0.05 * vec3(cloud);
}

//============================================================
// Basic SDF Geometry Primitives
//============================================================
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdTorus(vec3 p, vec2 t)  { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float sdBox(vec3 p, vec3 b)    { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }

//============================================================
// Jelly Color Palette: pink â†?orange â†?violet-blue â†?mint green
//============================================================
vec3 softPalette(float t) {
    t = fract(t);
    if (t < 0.25) {
        float f = smoothstep(0.0, 0.25, t);
        return mix(vec3(1.0, 0.1, 0.5), vec3(1.0, 0.45, 0.0), f);
    }
    else if (t < 0.5) {
        float f = smoothstep(0.25, 0.5, t);
        return mix(vec3(1.0, 0.45, 0.0), vec3(0.67, 0.54, 0.90), f);
    }
    else if (t < 0.75) {
        float f = smoothstep(0.5, 0.75, t);
        return mix(vec3(0.67, 0.54, 0.90), vec3(0.0, 1.0, 0.6), f);
    }
    else {
        float f = smoothstep(0.75, 1.0, t);
        return mix(vec3(0.0, 1.0, 0.6), vec3(1.0, 0.1, 0.5), f);
    }
}

//============================================================
// Scene Geometry: SDF structure of the jelly form
//============================================================
float map(vec3 p) {
    vec3 q = p;
    q.xy *= rot2D(u_time * 0.2 + g_mouseInfluence * 0.5);
    q.yz *= rot2D(u_time * 0.15);

    float disp = fbm(q.xy * 0.6 + u_time * 0.05) * 0.15;
    float torus1 = sdTorus(q, vec2(1.5 + g_mouseInfluence * 0.5, 0.5)) + disp * 0.1;

    vec3 q2 = p;
    q2.xz *= rot2D(PI * 0.5 + u_time * 0.3);
    q2.yz *= rot2D(u_time * 0.25);
    float torus2 = sdTorus(q2, vec2(1.8, 0.4)) + disp * 0.08;

    float sphere = sdSphere(p, 0.7 + sin(u_time) * 0.2 + g_mouseInfluence * 0.3);

    vec3 q3 = p;
    q3.xy *= rot2D(u_time * 0.4);
    q3.xz *= rot2D(u_time * 0.3);
    float box = sdBox(q3, vec3(0.15 + g_mouseInfluence * 0.3));

    float d = smin(torus1, torus2, 0.8);
    d = smin(d, sphere, 0.5 + sin(u_time * 0.5) * 0.3);
    d = smin(d, box, 0.7);
    return d;
}

//============================================================
// Normal Estimation and Ray Marching
//============================================================
vec3 getNormal(vec3 p) {
    float d = map(p);
    vec2 e = vec2(0.001, 0.0);
    vec3 n = d - vec3(map(p - e.xyy), map(p - e.yxy), map(p - e.yyx));
    return normalize(n);
}

float rayMarch(vec3 ro, vec3 rd) {
    float dO = 0.0;
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * dO;
        float dS = map(p);
        dO += dS;
        if (dS < SURF_DIST || dO > MAX_DIST) break;
    }
    return dO;
}

//============================================================
// Main Rendering
//============================================================
void main() {
    // --- Coordinates and Mouse Input ---
    vec2 res = u_resolution.xy;
    float minRes = min(res.x, res.y);
    vec2 uv01 = gl_FragCoord.xy / res;
    vec2 uv = (gl_FragCoord.xy - 0.5 * res) / minRes;  // keep proportions consistent
    g_aspect = vec2(res.x / res.y, 1.0);

    // Mouse normalization
    bool mouseIsPixel = (u_mouse_ext.x > 2.0 || u_mouse_ext.y > 2.0);
    vec2 mouse01 = mouseIsPixel ? (u_mouse_ext / res) : u_mouse_ext;
    if (u_mouse_ext.x == 0.0 && u_mouse_ext.y == 0.0) mouse01 = vec2(0.5);

    // Aspect-correct mouse vector
    vec2 m = (u_mouse_ext - 0.5 * res) / minRes;
    float mouseDist = length(uv - m);
    g_mouseInfluence = smoothstep(0.5, 0.0, mouseDist);

    // --- Camera Setup ---
    vec3 ro = vec3(0.0, 0.0, 4.0 - g_mouseInfluence * 1.0);
    vec3 rd = normalize(vec3(uv, -1.0));

    float d = rayMarch(ro, rd);
    vec3 bgBase = bgColorAt(uv01);
    vec3 col = bgBase;

    // --- Depth of Field Parameters ---
    float focusDist = mix(2.0, 5.5, mouse01.y);
    float aperture  = 1.4;
    float coc = 0.0;
    if (d < MAX_DIST) coc = clamp(abs(d - focusDist) / focusDist * aperture, 0.0, 1.0);

    // --- Background DOF Blur ---
    float dofBlur = mix(0.0005, 0.01, coc);
    vec2 taps[8];
    taps[0]=vec2(-1,-1);taps[1]=vec2(1,-1);taps[2]=vec2(-1,1);taps[3]=vec2(1,1);
    taps[4]=vec2(-1,0);taps[5]=vec2(1,0);taps[6]=vec2(0,-1);taps[7]=vec2(0,1);
    vec3 bgCol = vec3(0.0);
    for (int i = 0; i < 8; i++) bgCol += bgColorAt(clamp(uv01 + taps[i] * dofBlur, 0.0, 1.0));
    bgCol /= 8.0;

    // --- Render Jelly Object ---
    if (d < MAX_DIST) {
        vec3 p = ro + rd * d;
        vec3 n = getNormal(p);

        // Frosted surface micro-normal jitter
        float nAmp = 0.25;
        vec3 nJit = vec3(
            noise(p.xy * 3.0 + u_time * 0.05),
            noise(p.yz * 3.0 + u_time * 0.05 + 10.0),
            noise(p.zx * 3.0 + u_time * 0.05 + 20.0)
        );
        n = normalize(n + nAmp * (nJit - 0.5));

        // Lighting
        vec3 lightDir = normalize(vec3(1.0, 1.1, 0.9));
        float diff  = max(dot(n, lightDir), 0.0);
        float spec  = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 6.0);
        float fres  = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

        // Global color gradient (time-based, not spatial)
        float t = fract(u_time * 0.08 + g_mouseInfluence * 0.3);
        vec3 objCol = softPalette(t);
        objCol = pow(objCol, vec3(1.1));

        // Breathing pulse brightness modulation
        float pulse = 0.05 * sin(u_time * 2.0);
        objCol = mix(objCol, vec3(1.0), pulse + 0.05);

        // Surface reflection + Fresnel
        vec3 surf = objCol * (diff * 0.55 + 0.45) + objCol * spec * 0.6;
        surf += fres * vec3(0.96, 0.98, 1.0) * 0.25;

        // Frosted refraction blur
        float frostedBlur = 0.0035 * mix(0.8, 1.4, fres);
        frostedBlur = mix(frostedBlur, frostedBlur * 1.8, coc);
        vec2 refrPush = vec2(n.x, n.y) * 0.02;
        vec3 transCol = vec3(0.0);
        for (int i = 0; i < 8; i++) {
            vec2 ofs = (taps[i] + refrPush) * frostedBlur;
            transCol += bgColorAt(clamp(uv01 + ofs, 0.0, 1.0));
        }
        transCol /= 8.0;

        // Semi-transparent blending
        float transmit = 0.28;
        col = mix(surf, transCol, transmit);
        col = mix(col, bgCol, smoothstep(0.0, MAX_DIST * 0.6, d));
    }

    // Vignette, mouse cool tone, and gamma correction
    float vignette = smoothstep(1.2, 0.5, length(uv01 - 0.5));
    col *= vignette;
    col += vec3(0.2, 0.4, 0.6) * g_mouseInfluence * 0.2;
    col = pow(col, vec3(0.4545));

    // âœ?Final output
    gl_FragColor = vec4(col, 1.0);
}

