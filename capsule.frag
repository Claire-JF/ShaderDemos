#ifdef GL_ES
precision highp float;
#endif
/*  This shader is recreated from @XorDev's X post 
    for learning purposes, which I break down & rebuilt upon.
    Original Source: https://x.com/XorDev/status/1958925058694586688
*/

uniform float u_time;
uniform vec2  u_resolution;

// wrap shading logic into a function for SSAA
vec3 shadeAt(vec2 p, float t) {
    // Define a rectangular boundary box
    // b.x → half-width; b.y → signed distance from the shape edge
    vec2 b;
    b.x = 0.6;

    // Clamp the point inside the box region
    // Compute distance from the clamped point to current position
    vec2 clamped = clamp(p, -b, b);
    b.y = length(p - clamped) - 0.5;

    // Oscillating angular wave used to modulate the glow
    float angularWave = abs(cos(b.y - p.x * 0.1 - t * 1.5));

    // Pulse falloff based on exponential decay
    float pulse = 0.3 / exp(angularWave / 0.1);

    // Combine geometric distance with the pulse field
    float base = max(b.y + pulse, b.y * b.y);

    // Compute a smoothly cycling color pattern
    // The vector inside cos() offsets each RGB channel
    vec4 color = cos(
        p.x / (abs(b.y) + 0.4) + t * 2.0 + vec4(6.0, 1.0, 2.0, 3.0)
    ) + 1.2;

    // Approximation of tanh() since GLSL ES 1.0 lacks it
    float x = 0.008 / max(base, 1e-5);
    float e2x = exp(2.0 * x);
    float tanh_x = (e2x - 1.0) / (e2x + 1.0);
    tanh_x = clamp(tanh_x, 0.0, 1.0); // Prevent small negative values

    // Glow intensity derived from tanh-shaped falloff
    float glow = sqrt(tanh_x) * 0.5;

    // Final RGB color multiplied by glow strength
    return glow * color.rgb;
}


void main() {
    // Current fragment coordinate and resolution
    vec2 FC = gl_FragCoord.xy;
    vec2 r  = u_resolution;
    float s = min(r.x, r.y);
    float t = u_time;

    // Normalize coordinates using minimal side for consistent scale
    // Keeps proportions consistent across screen sizes
    vec2 p = (FC * 2.0 - r) / s;

    // Half-pixel step size in normalized space
    vec2 dp = vec2(1.0 / s);

    // 2x2 subpixel sampling pattern for smoother anti-aliasing
    vec2 J[4];
    J[0] = vec2(-0.5, -0.5);
    J[1] = vec2( 0.5, -0.5);
    J[2] = vec2(-0.5,  0.5);
    J[3] = vec2( 0.5,  0.5);

    // Accumulate colors from 4 subpixel samples
    vec3 col = vec3(0.0);
    for (int i = 0; i < 4; i++) {
        col += shadeAt(p + J[i] * dp, t);
    }

    // Average the sampled colors (SSAA result)
    col *= 0.25;

    // Output final fragment color
    gl_FragColor = vec4(col, 1.0);
}
