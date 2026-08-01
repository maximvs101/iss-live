/**
 * How bright the air on the horizon is, and what colour.
 *
 * Separated from the component that draws it for two reasons. The lint rule about fast refresh is
 * the small one. The real one is that this is the part worth asserting about: the shader is built
 * from these constants by string interpolation, so a test that pins them pins what the GPU does,
 * and the interesting case — the orange band at the terminator — is nearly impossible to catch on
 * screen, because it needs the station to be near the terminator to exist at all.
 */
/**
 * The scattering law, as numbers rather than as taste.
 *
 * These live in TypeScript and are injected into the shader below, so the test suite and the GPU
 * cannot end up disagreeing about them. That is not fussiness: the sunset colour only has geometry
 * to appear on twice an orbit, when the station is near the terminator, so a wrong threshold here
 * would sit unnoticed for most of the day and then produce a blue sunrise.
 */
const SCATTERING = {
  /** Rayleigh takes the blue out of a long path first; these are the two ends of that. */
  day: [0.36, 0.63, 0.96] as const,
  sunset: [1.0, 0.46, 0.16] as const,
  /** Sun elevation at the air in question: below the first it is unlit, above the second full day. */
  litFrom: -0.35,
  litTo: 0.1,
  /** Reddening runs the other way — it wants the Sun *low*, which is what makes the light red. */
  lowSunFrom: 0.3,
  lowSunTo: -0.05,
  /** And it needs a long path as well, or the colour would bleed into thin air high on the limb. */
  deepFrom: 0.25,
  deepTo: 0.95,
  /** Brightness falls faster than the path shortens; this is the exponent that shapes the band. */
  falloff: 1.7,
  strength: 1.15,
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * What the limb looks like for one ray, given how much air it crosses and how high the Sun stands
 * over that air. `depth` is 1 for a ray grazing the ground and 0 at the top of the band.
 *
 * The same arithmetic the fragment shader runs, in a form that can be asserted about.
 */
export function limbShading(depth: number, sunElevation: number) {
  const lit = smoothstep(SCATTERING.litFrom, SCATTERING.litTo, sunElevation)
  const lowSun = smoothstep(SCATTERING.lowSunFrom, SCATTERING.lowSunTo, sunElevation)
  const reddening = lowSun * smoothstep(SCATTERING.deepFrom, SCATTERING.deepTo, depth)
  const colour = SCATTERING.day.map(
    (channel, i) => channel + (SCATTERING.sunset[i] - channel) * reddening,
  ) as [number, number, number]
  return { colour, reddening, intensity: depth ** SCATTERING.falloff * lit * SCATTERING.strength }
}

/** GLSL has no integer-to-float promotion in literals, so every number needs a decimal point. */
const f = (value: number) => (Number.isInteger(value) ? value.toFixed(1) : String(value))

export const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const fragmentShader = `
  uniform vec3 uEarthCentre;
  uniform vec3 uSunDirection;
  uniform float uAtmosphereRadius;
  uniform float uLimbChord;

  varying vec3 vWorldPosition;

  const vec3 DAY = vec3(${SCATTERING.day.map(f).join(', ')});
  const vec3 SUNSET = vec3(${SCATTERING.sunset.map(f).join(', ')});

  void main() {
    vec3 origin = cameraPosition;
    vec3 ray = normalize(vWorldPosition - origin);

    // How close this ray passes to the centre of the planet — the one number everything else needs.
    vec3 toCentre = uEarthCentre - origin;
    float along = dot(toCentre, ray);
    float impact2 = dot(toCentre, toCentre) - along * along;

    float outer2 = uAtmosphereRadius * uAtmosphereRadius;
    if (impact2 >= outer2) discard;

    // Length of air on the ray. The surface never enters this: a pixel whose ray reaches the
    // ground has already failed the depth test against the planet.
    float chord = 2.0 * sqrt(outer2 - impact2);
    float depth = clamp(chord / uLimbChord, 0.0, 1.0);

    // Lit or not is a question about the air at closest approach, not about the shell.
    vec3 tangent = origin + ray * along;
    vec3 up = normalize(tangent - uEarthCentre);
    float sunElevation = dot(up, uSunDirection);

    float lit = smoothstep(${f(SCATTERING.litFrom)}, ${f(SCATTERING.litTo)}, sunElevation);
    float lowSun = smoothstep(${f(SCATTERING.lowSunFrom)}, ${f(SCATTERING.lowSunTo)}, sunElevation);
    float deep = smoothstep(${f(SCATTERING.deepFrom)}, ${f(SCATTERING.deepTo)}, depth);

    vec3 colour = mix(DAY, SUNSET, lowSun * deep);
    float intensity = pow(depth, ${f(SCATTERING.falloff)}) * lit * ${f(SCATTERING.strength)};

    gl_FragColor = vec4(colour * intensity, intensity);
  }
`

