#version 300 es
precision highp float;

uniform float u_time;
uniform vec2  u_mouse;
uniform vec2  u_resolution;

out vec4 fragColor;

//================== CONSTANTS ==================
#define MAX_STEPS 100
#define MAX_DIST  100.0
#define SURF_DIST 0.001
#define PI 3.14159265359

//================== GLOBALS ==================
float g_mouseInfluence = 0.0;
vec2  g_aspect        = vec2(1.0);

//================== UTILITY FUNCTIONS ==================
mat2 rot2D(float a){
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}
float smin(float a, float b, float k){
    float h = clamp(0.5 + 0.5*(b - a)/k, 0.0, 1.0);
    return mix(b, a, h) - k*h*(1.0 - h);
}
float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));

    vec2 u = f*f*(3.0 - 2.0*f);
    return mix(a, b, u.x) + (c - a)*u.y*(1.0 - u.x) + (d - b)*u.x*u.y;
}
float fbm(vec2 p){
    float sum = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for(int i=0;i<5;i++){
        sum  += amp * noise(p * freq);
        amp  *= 0.5;
        freq *= 2.0;
    }
    return sum;
}
vec2 warp(vec2 p){
    float w1 = noise(p * 0.75);
    float w2 = noise(p.yx * 0.75 + 12.345);
    return p + vec2(w1, w2) * 0.35;
}

//================== BACKGROUND (FUNCTIONAL ENVIRONMENT) ==================
vec3 bgColorAt(vec2 uv01) {
    vec2 p = uv01 - 0.5;
    float r = length(p);

    vec3 a = vec3(0.15, 0.16, 0.18);
    vec3 b = vec3(0.30, 0.30, 1.00);
    vec3 base = mix(a, b, smoothstep(0.0, 0.7, r));

    float cloud = fbm(uv01 * 2.5 + u_time * 0.02);
    return base + 0.05 * vec3(cloud);
}

//================== SDF PRIMITIVES ==================
float sdSphere(vec3 p, float r){ return length(p) - r; }
float sdTorus(vec3 p, vec2 t){
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    return length(q) - t.y;
}
float sdBox(vec3 p, vec3 b){
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

//================== SCENE SDF ==================
float map(vec3 p){
    vec3 q = p;
    q.xy *= rot2D(u_time * 0.2 + g_mouseInfluence * 0.5);
    q.yz *= rot2D(u_time * 0.15);

    // Subtle displacement: soft jelly undulation
    float displacement = fbm(q.xy * 0.6 + u_time * 0.05) * 0.15;

    float torus1 = sdTorus(q, vec2(1.5 + g_mouseInfluence * 0.5, 0.5));
    torus1 += displacement * 0.1;

    vec3 q2 = p;
    q2.xz *= rot2D(PI * 0.5 + u_time * 0.3);
    q2.yz *= rot2D(u_time * 0.25);
    float torus2 = sdTorus(q2, vec2(1.8, 0.4));
    torus2 += displacement * 0.1;

    float sphere = sdSphere(p, 0.7 + sin(u_time) * 0.2 + g_mouseInfluence * 0.3);

    vec3 q3 = p;
    q3.xy *= rot2D(u_time * 0.4);
    q3.xz *= rot2D(u_time * 0.3);
    float box = sdBox(q3, vec3(0.25 + g_mouseInfluence * 0.3));

    float d = smin(torus1, torus2, 0.8);
    d = smin(d, sphere, 0.5 + sin(u_time * 0.5) * 0.3);
    d = smin(d, box, 0.7);
    return d;
}

//================== NORMAL ==================
vec3 getNormal(vec3 p){
    float d = map(p);
    vec2 e = vec2(0.001, 0.0);
    vec3 n = d - vec3(
        map(p - e.xyy),
        map(p - e.yxy),
        map(p - e.yyx)
    );
    return normalize(n);
}

//================== RAY MARCH ==================
float rayMarch(vec3 ro, vec3 rd){
    float dO = 0.0;
    for(int i=0;i<MAX_STEPS;i++){
        vec3 p = ro + rd * dO;
        float dS = map(p);
        dO += dS;
        if(dS < SURF_DIST || dO > MAX_DIST) break;
    }
    return dO;
}

//================== PINK-WHITE-BLUE LOOPING GRADIENT ==================
vec3 softPalette(float t){
    t = fract(t);
    if(t < 0.3333){
        float f = smoothstep(0.0, 0.3333, t);
        return mix(vec3(0.96, 0.4, 0.67), vec3(0.90, 0.70, 0.35), f); // pink -> white
    } else if(t < 0.6666){
        float f = smoothstep(0.3333, 0.6666, t);
        return mix(vec3(0.90, 0.70, 0.35), vec3(0.95, 0.33, 0.11), f);  // white -> blue
    } else {
        float f = smoothstep(0.6666, 1.0, t);
        return mix(vec3(0.95, 0.33, 0.11), vec3(0.96, 0.4, 0.67), f); // blue -> pink (loop)
    }
}

//================== MAIN ==================
void main(){
    vec2 uv01 = gl_FragCoord.xy / u_resolution.xy;
    vec2 uv   = uv01 - 0.5;
    g_aspect  = vec2(u_resolution.x / u_resolution.y, 1.0);
    uv.x *= g_aspect.x;

    bool mouseIsPixel = (u_mouse.x > 2.0 || u_mouse.y > 2.0);
    vec2 mouse01 = mouseIsPixel ? (u_mouse / u_resolution) : u_mouse;
    if(u_mouse.x == 0.0 && u_mouse.y == 0.0) mouse01 = vec2(0.5);

    vec2 m = (mouse01 - 0.5) * g_aspect.x;
    float mouseDistance = length(vec2(uv.x - m.x, uv.y - (mouse01.y - 0.5)));
    g_mouseInfluence = smoothstep(0.5, 0.0, mouseDistance);

    // Camera
    vec3 ro = vec3(0.0, 0.0, 4.0 - g_mouseInfluence * 1.0);
    vec3 rd = normalize(vec3(uv, -1.0));

    // Raymarch
    float d = rayMarch(ro, rd);

    // Background (base & blurred)
    vec3  bgColBase = bgColorAt(uv01);

    // Lens DOF (COC approximation) parameters
    float focusDist = 3.5;     // Focus distance (relative to camera position)
    float aperture  = 1.6;     // Larger aperture -> more blur when out of focus
    float coc       = 0.0;     // Circle of confusion (out-of-focus blur factor)

    if(d < MAX_DIST){
        // When the ray hits the object, use object depth as DOF reference
        float depth = d; // Approximate depth from ro to hit point
        coc = clamp(abs(depth - focusDist) / focusDist * aperture, 0.0, 1.0);
    } else {
        // When the ray misses, approximate DOF using a virtual background depth
        float bgDepth = 8.0; // Far background distance
        coc = clamp(abs(bgDepth - focusDist) / focusDist * 0.7 * aperture, 0.0, 1.0);
    }

    // Background DOF blur (screen-space multi-sampling)
    float baseBlur = 0.0005;          // Tiny base blur
    float dofBlur  = mix(baseBlur, 0.01, coc); // Stronger blur when more out of focus
    vec2  taps[8];
    taps[0]=vec2(-1.0,-1.0); taps[1]=vec2( 1.0,-1.0);
    taps[2]=vec2(-1.0, 1.0); taps[3]=vec2( 1.0, 1.0);
    taps[4]=vec2(-1.0, 0.0); taps[5]=vec2( 1.0, 0.0);
    taps[6]=vec2( 0.0,-1.0); taps[7]=vec2( 0.0, 1.0);

    vec3 bgColBlur = vec3(0.0);
    for(int i=0;i<8;i++){
        bgColBlur += bgColorAt(clamp(uv01 + taps[i]*dofBlur, 0.0, 1.0));
    }
    bgColBlur /= 8.0;

    // Mix base and blurred background based on DOF
    vec3 bgCol = mix(bgColBase, bgColBlur, 0.85 * coc);
    vec3 col   = bgCol;

    if(d < MAX_DIST){
        vec3 p = ro + rd * d;
        vec3 n = getNormal(p);

        // Frosted surface: micro normal perturbation
        float nAmp = 0.25; // Larger value -> stronger frosted look
        vec3 nJit = vec3(
            noise(warp(p.xy * 3.0) + u_time * 0.05),
            noise(warp(p.yz * 3.0) + u_time * 0.05 + 10.0),
            noise(warp(p.zx * 3.0) + u_time * 0.05 + 20.0)
        );
        n = normalize(n + nAmp * (nJit - 0.5));

        // ---------- Inner light flow (soft internal light) ----------
        // Choose a flow direction for the internal light
        vec3 flowDir = normalize(vec3(0.4, 1.0, -0.25));
        // Project 3D point onto two planes for fbm (avoid full 3D noise cost)
        float flowA = fbm(p.xy * 1.2 + u_time * 0.25);
        float flowB = fbm(p.yz * 1.2 + u_time * 0.25 + 5.0);
        float flow  = 0.5*flowA + 0.5*flowB;
        // Comb effect along the flow direction (gives streaks a direction)
        float comb = dot(normalize(p), flowDir);
        float flowMask = smoothstep(0.2, 0.8, 0.55 + 0.45 * flow + 0.15 * comb);

        // Lighting
        vec3 lightDir = normalize(vec3(1.0, 1.1, 0.9));
        float diff = max(dot(n, lightDir), 0.0);
        float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 6.0);
        float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

        // Object base color (pink -> white -> blue, following previous palette)
        float t = fbm(p.xy * 0.5 + p.yz * 0.5 + u_time * 0.08) * 0.5 + 0.5;
        t += length(p) * 0.1;
        t += u_time * 0.05;
        vec3 objCol = softPalette(t);

        // Surface composition (soft diffuse + colored soft specular + rim transmission)
        vec3 surf = objCol * (diff * 0.55 + 0.45) + objCol * spec * 0.6;
        surf += fres * vec3(0.96, 0.98, 1.0) * 0.25;

        // ---------- Perspective: frosted refraction/scattering sampling (affected by DOF) ----------
        float frostedBlur = 0.0035;
        frostedBlur *= mix(0.8, 1.4, fres); // Stronger blur near the edges
        // Combine with lens DOF (more defocus -> more blur)
        frostedBlur = mix(frostedBlur, frostedBlur * 1.8, coc);

        // Approximate refraction by pushing screen sampling along the normal
        vec2 refrPush = vec2(n.x, n.y) * 0.02;

        vec3 transCol = vec3(0.0);
        for(int i=0;i<8;i++){
            vec2 ofs = (taps[i] + refrPush) * frostedBlur;
            vec2 sampleUv = warp(uv01 + ofs);
            transCol += bgColorAt(clamp(sampleUv, 0.0, 1.0));
        }
        transCol /= 8.0;

        // Internal flow tint as subtle volumetric glow/transmission
        vec3 flowTint = mix(vec3(1.0, 0.7, 0.85), vec3(0.7, 0.85, 1.0), 0.5);
        transCol += flowTint * (0.15 * flowMask);

        // Semi-transparent mix (frosted glass feeling)
        float transmit = 0.40;
        col = mix(surf, transCol, transmit);

        // Distance fog
        col = mix(col, bgCol, smoothstep(0.0, MAX_DIST * 0.6, d));
    }

    // Vignette
    float vignette = smoothstep(1.2, 0.5, length(uv01 - 0.5) * 1.5);
    col *= vignette;

    // Mouse adds a subtle cool tint
    col += vec3(0.2, 0.4, 0.6) * g_mouseInfluence * 0.2;

    // Gamma
    col = pow(col, vec3(0.4545));
    fragColor = vec4(col, 1.0);
}



