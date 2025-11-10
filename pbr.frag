#ifdef GL_ES
precision mediump float;
#endif

uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;

// ======= Noise =========
float hash(vec2 p){
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f*f*(3.0 - 2.0*f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
    float s = 0.0;
    float a = 1.0;
    float f = 1.0;
    for(int i=0;i<6;i++){
        s += noise(p*f)*a;
        a *= 0.5;
        f *= 2.0;
    }
    return s;
}

// ======= PBR helper =======
vec3 fresnelSchlick(float c, vec3 F0){
    return F0 + (1.0 - F0)*pow(clamp(1.0 - c, 0.0, 1.0), 5.0);
}
float distributionGGX(float NdotH,float r){
    float a=r*r;
    float a2=a*a;
    float N2=NdotH*NdotH;
    float d=N2*(a2-1.0)+1.0;
    return a2/(3.14159*d*d);
}
float geometrySchlickGGX(float NdotV,float r){
    float k=pow(r+1.0,2.0)/8.0;
    return NdotV/(NdotV*(1.0-k)+k);
}
float geometrySmith(float NdotV,float NdotL,float r){
    return geometrySchlickGGX(NdotV,r)*geometrySchlickGGX(NdotL,r);
}

void main(){
    // normalized coordinates
    vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
    uv.x *= u_resolution.x / u_resolution.y;

    // normalized mouse
    vec2 mouse = (u_mouse / u_resolution.xy) * 2.0 - 1.0;
    mouse.x *= u_resolution.x / u_resolution.y;

    // lens parameters
    float LENS_RADIUS  = 0.35;
    float LENS_FEATHER = 0.20;
    float LENS_ZOOM    = 1.5;

    // lens mask
    float d = length(uv - mouse);
    float mask = 1.0 - smoothstep(LENS_RADIUS - LENS_FEATHER, LENS_RADIUS, d);

    // lens UV
    vec2 lensUV = mouse + (uv - mouse) / LENS_ZOOM; // basic zoom
    float t = clamp(d / LENS_RADIUS, 0.0, 1.0); // distance factor
    float barrel = 1.0 + 0.12 * t * t * (1.0 - t); // barrel distortion
    lensUV = mouse + (uv - mouse) / (LENS_ZOOM * barrel);

    // mix with original UV
    vec2 pUV = mix(uv, lensUV, mask);

    // drift
    float FLOW_SPEED = 0.10;
    float FLOW_ANGLE = 0.37;
    vec2 flow = vec2(cos(FLOW_ANGLE), sin(FLOW_ANGLE)) * (u_time * FLOW_SPEED);

    // albedo + texture drift
    float pat = fbm(pUV * 3.0 + flow + vec2(123.45,234.56));
    vec3 albedo = mix(vec3(0.1,0.2,0.4), vec3(0.7,0.8,1.0), pat);
    albedo *= 0.8 + 0.4 * fbm(pUV * 2.0 + vec2(u_time*0.2,0.0) + flow*0.6);

    // noramal
    float h  = fbm(pUV * 10.0 + flow * 1.8);
    float hx = fbm(pUV * 10.0 + flow * 1.8 + vec2(0.01,0.0));
    float hy = fbm(pUV * 10.0 + flow * 1.8 + vec2(0.0,0.01));
    vec3 N = normalize(vec3(h - hx, h - hy, 0.05));

    vec3 V = normalize(vec3(0.0,0.0,1.0));
    vec3 L = normalize(vec3(0.5,0.5,0.5));
    vec3 H = normalize(V + L);

    float NdotL = max(dot(N,L),0.0);
    float NdotV = max(dot(N,V),0.0);
    float NdotH = max(dot(N,H),0.0);
    float HdotV = max(dot(H,V),0.0);

    // texture parameters
    float metallic  = 0.3;
    float roughness = clamp(0.40 + 0.10 * (pat - 0.5), 0.35, 0.45);
    float ao        = 0.8;

    // PBR lighting
    vec3 F0 = mix(vec3(0.04), albedo, metallic);
    vec3 F = fresnelSchlick(HdotV, F0);
    float D = distributionGGX(NdotH, roughness);
    float G = geometrySmith(NdotV, NdotL, roughness);
    vec3 spec = (F * D * G) / (4.0 * NdotV * NdotL + 0.001);
    vec3 kS = F;
    vec3 kD = (1.0 - kS)*(1.0 - metallic);
    vec3 light = vec3(1.0,0.9,0.8)*2.0;
    vec3 radiance = light*NdotL;
    vec3 color = (kD*albedo/3.14159 + spec)*radiance;
    color += vec3(0.03)*albedo*ao;

    // lens rim light
    float inner = smoothstep(LENS_RADIUS - 0.04, LENS_RADIUS - 0.04 * 2.0, d);
    float outer = smoothstep(LENS_RADIUS, LENS_RADIUS - 0.04, d);
    float rim = outer - inner;
    vec3 rimColor = vec3(0.8, 0.96, 1.0); 
    color += rim * rimColor * 0.025;

    // Tone map + gamma
    color = color / (color + vec3(1.0));
    color = pow(color, vec3(1.0/2.2));

    gl_FragColor = vec4(color,1.0);
}
