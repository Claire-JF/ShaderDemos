#ifdef GL_ES
#extension GL_OES_standard_derivatives : enable
precision mediump float;
#endif

uniform float u_time;        
uniform vec2  u_mouse;       
uniform vec2  u_resolution;  

vec2 rotate2D(vec2 p, float a){
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c) * p;
}

float gridPattern(vec2 p){
    vec2 fw = max(fwidth(p), vec2(1e-5)); 
    // translate into screen space，ensure gridline's thickness is consistent in any resolution
    vec2 g = abs(fract(p - 0.5) - 0.5) / fw; 
    return min(g.x, g.y); 
}

float isoGrid(vec2 p){
    p = rotate2D(p, 3.14159265 / 4.0);
    vec2 g1 = p;
    vec2 g2 = rotate2D(p, 3.14159265 / 3.0);
    return min(gridPattern(g1 * 8.0), gridPattern(g2 * 80.0));
}

void main(){
    //normalized coordinates
    float minRes = min(u_resolution.x, u_resolution.y);
    vec2 uvN = (gl_FragCoord.xy - 0.5 * u_resolution) / minRes; 
    vec2 mouseN = (u_mouse - 0.5 * u_resolution) / minRes; 
    vec2 mouseInfluence = mouseN - uvN;
    float mouseDist = length(mouseInfluence);

    // falloff with distance => 1 - smoothstep(near, far, d)
    float distortionAmount = (1.0 - smoothstep(0.0, 0.3, mouseDist)) * 0.2;

    vec2 direction = mouseDist > 1e-6 ? mouseInfluence / mouseDist : vec2(0.0);
    vec2 distortedN = uvN + direction * distortionAmount;

    float grid = isoGrid(distortedN + u_time * 0.1);

    vec3 color1 = vec3(0.2, 0.4, 0.8);
    vec3 color2 = vec3(0.9, 0.3, 0.5);
    vec3 bgColor = vec3(0.83, 0.83, 0.91);

    float gridLines = 1.0 - smoothstep(0.1, 0.6, grid);
    vec3 finalColor = mix(bgColor, mix(color1, color2, sin(u_time) * 0.5 + 0.5), gridLines);
    gl_FragColor = vec4(finalColor, 1.0);
}
