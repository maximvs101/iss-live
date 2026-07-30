/**
 * Inventory of the station parts represented in the 3D twin.
 *
 * The breakdown follows NASA's own assembly-element nomenclature
 * (nasa.gov/international-space-station/international-space-station-assembly-elements) and the
 * 2023 blowout diagram: every pressurised module, truss segment, stowage platform, mating adapter
 * and robotic element is its own part, rather than being folded into a neighbour.
 *
 * This inventory is the hinge between geometry and telemetry: every clickable mesh carries a
 * `partId`, and every telemetry channel declares the part it describes (see
 * telemetry/subsystems.ts). Selecting a part in the scene therefore amounts to filtering the
 * symbols that concern it.
 */

export type PartId =
  // Truss segments, inboard to outboard
  | 'truss-z1'
  | 'truss-s0'
  | 'truss-s1'
  | 'truss-s3'
  | 'truss-s4'
  | 'truss-s5'
  | 'truss-s6'
  | 'truss-p1'
  | 'truss-p3'
  | 'truss-p4'
  | 'truss-p5'
  | 'truss-p6'
  // Rotary joints
  | 'sarj-port'
  | 'sarj-stbd'
  | 'trrj-port'
  | 'trrj-stbd'
  // Solar array wings, named after their power channel
  | 'saw-1a'
  | 'saw-1b'
  | 'saw-2a'
  | 'saw-2b'
  | 'saw-3a'
  | 'saw-3b'
  | 'saw-4a'
  | 'saw-4b'
  // Radiators
  | 'radiator-port'
  | 'radiator-stbd'
  // Pressurised modules — US orbital segment and partners
  | 'destiny'
  | 'unity'
  | 'harmony'
  | 'tranquility'
  | 'cupola'
  | 'columbus'
  | 'kibo-pm'
  | 'kibo-ef'
  | 'kibo-elm'
  | 'quest'
  | 'leonardo'
  | 'beam'
  | 'bishop'
  // Mating adapters
  | 'pma-1'
  | 'pma-2'
  | 'pma-3'
  // Russian orbital segment
  | 'zarya'
  | 'zvezda'
  | 'poisk'
  | 'rassvet'
  | 'nauka'
  | 'prichal'
  // External platforms
  | 'esp-1'
  | 'esp-2'
  | 'esp-3'
  | 'elc-1'
  | 'elc-2'
  | 'elc-3'
  | 'elc-4'
  // Robotics
  | 'canadarm'
  | 'dextre'
  | 'mobile-transporter'
  // Science
  | 'ams'
  // Antennas
  | 'antenna-ku'
  | 'antenna-sasa-2'
  | 'antenna-sasa-3'

export type PartCategory =
  | 'module'
  | 'truss'
  | 'power'
  | 'thermal'
  | 'robotics'
  | 'platform'
  | 'science'
  | 'comms'

export interface PartInfo {
  id: PartId
  /** Common name, the one a visitor recognises. */
  name: string
  /** Technical designation, as NASA labels it. */
  designation?: string
  category: PartCategory
  /** One sentence for discovery mode. */
  summary: string
}

function trussSegment(id: PartId, label: string, note: string): PartInfo {
  return {
    id,
    name: `${label} Truss`,
    designation: `${label} Integrated Truss Segment`,
    category: 'truss',
    summary: note,
  }
}

function arrayWing(id: PartId, channel: string, segment: string): PartInfo {
  return {
    id,
    name: `Solar Array ${channel}`,
    designation: `Solar Array Wing ${channel} (${segment})`,
    category: 'power',
    summary:
      'A solar wing spanning 34 metres. Its orientation combines the SARJ rotation, which tracks the Sun around the orbit, with the BGA rotation, which compensates for the seasonal tilt.',
  }
}

function stowagePlatform(id: PartId, label: string, designation: string, note: string): PartInfo {
  return { id, name: label, designation, category: 'platform', summary: note }
}

export const PARTS: Record<PartId, PartInfo> = {
  'truss-z1': {
    id: 'truss-z1',
    name: 'Z1 Truss',
    designation: 'Z1 Integrated Truss Segment',
    category: 'truss',
    summary:
      'The first truss piece launched, mounted above Unity. It carries the four control moment gyroscopes that point the station, and the Ku-band antenna.',
  },
  'truss-s0': trussSegment(
    'truss-s0',
    'S0',
    'The centre segment, bolted to the Destiny laboratory. Everything else on the truss extends from here.',
  ),
  'truss-s1': trussSegment(
    'truss-s1',
    'S1',
    'Carries the starboard heat-rejection radiator and the S-band antenna group.',
  ),
  'truss-s3': trussSegment(
    'truss-s3',
    'S3',
    'Holds the starboard rotary joint and the attachment sites for two logistics carriers.',
  ),
  'truss-s4': trussSegment(
    'truss-s4',
    'S4',
    'The starboard inboard photovoltaic module: power channels 1A and 3A, with their batteries.',
  ),
  'truss-s5': trussSegment('truss-s5', 'S5', 'A short spacer linking S4 to the outboard S6 segment.'),
  'truss-s6': trussSegment(
    'truss-s6',
    'S6',
    'The starboard outboard photovoltaic module, at the far end of the truss: channels 1B and 3B.',
  ),
  'truss-p1': trussSegment(
    'truss-p1',
    'P1',
    'Carries the port heat-rejection radiator and the second S-band antenna group.',
  ),
  'truss-p3': trussSegment(
    'truss-p3',
    'P3',
    'Holds the port rotary joint and the attachment sites for two logistics carriers.',
  ),
  'truss-p4': trussSegment(
    'truss-p4',
    'P4',
    'The port inboard photovoltaic module: power channels 2A and 4A, with their batteries.',
  ),
  'truss-p5': trussSegment('truss-p5', 'P5', 'A short spacer linking P4 to the outboard P6 segment.'),
  'truss-p6': trussSegment(
    'truss-p6',
    'P6',
    'The port outboard photovoltaic module, at the far end of the truss: channels 2B and 4B.',
  ),

  'sarj-port': {
    id: 'sarj-port',
    name: 'Port SARJ',
    designation: 'Solar Alpha Rotary Joint',
    category: 'power',
    summary:
      'A 3-metre rotary joint that turns the entire port outboard truss to track the Sun — one full revolution every orbit.',
  },
  'sarj-stbd': {
    id: 'sarj-stbd',
    name: 'Starboard SARJ',
    designation: 'Solar Alpha Rotary Joint',
    category: 'power',
    summary: 'Same role as its port counterpart, for the starboard side.',
  },
  'trrj-port': {
    id: 'trrj-port',
    name: 'Port TRRJ',
    designation: 'Thermal Radiator Rotating Joint',
    category: 'thermal',
    summary: 'Rotates the port radiator to keep it edge-on to the Sun.',
  },
  'trrj-stbd': {
    id: 'trrj-stbd',
    name: 'Starboard TRRJ',
    designation: 'Thermal Radiator Rotating Joint',
    category: 'thermal',
    summary: 'Rotates the starboard radiator for the same reason.',
  },

  'saw-1a': arrayWing('saw-1a', '1A', 'S4'),
  'saw-3a': arrayWing('saw-3a', '3A', 'S4'),
  'saw-1b': arrayWing('saw-1b', '1B', 'S6'),
  'saw-3b': arrayWing('saw-3b', '3B', 'S6'),
  'saw-2a': arrayWing('saw-2a', '2A', 'P4'),
  'saw-4a': arrayWing('saw-4a', '4A', 'P4'),
  'saw-2b': arrayWing('saw-2b', '2B', 'P6'),
  'saw-4b': arrayWing('saw-4b', '4B', 'P6'),

  'radiator-port': {
    id: 'radiator-port',
    name: 'Port Radiator',
    designation: 'Port Heat Rejection Subsystem Radiator',
    category: 'thermal',
    summary:
      'Three white panels that dump waste heat into space — around 70 kW for the station as a whole.',
  },
  'radiator-stbd': {
    id: 'radiator-stbd',
    name: 'Starboard Radiator',
    designation: 'Starboard Heat Rejection Subsystem Radiator',
    category: 'thermal',
    summary: 'The mirror-image radiator, fed by the second ammonia loop.',
  },

  destiny: {
    id: 'destiny',
    name: 'Destiny',
    designation: 'U.S. Laboratory',
    category: 'module',
    summary:
      'The American laboratory and nerve centre of the US segment: the station is commanded from here, and most experiments run here.',
  },
  unity: {
    id: 'unity',
    name: 'Unity',
    designation: 'Node 1',
    category: 'module',
    summary: 'The first American connecting node, the crossroads between the Russian segment and Destiny.',
  },
  harmony: {
    id: 'harmony',
    name: 'Harmony',
    designation: 'Node 2',
    category: 'module',
    summary:
      'The forward node: it connects the European and Japanese laboratories and receives vehicles docking at the front.',
  },
  tranquility: {
    id: 'tranquility',
    name: 'Tranquility',
    designation: 'Node 3',
    category: 'module',
    summary:
      'The node housing the life-support systems: water recycling, oxygen generation, toilet and exercise equipment.',
  },
  cupola: {
    id: 'cupola',
    name: 'Cupola',
    designation: 'Observation module',
    category: 'module',
    summary:
      'Seven windows facing Earth. It doubles as the robotic-arm control station and is the crews’ favourite spot.',
  },
  columbus: {
    id: 'columbus',
    name: 'Columbus',
    designation: 'Columbus Orbital Facility',
    category: 'module',
    summary:
      'The European Space Agency laboratory, berthed on the starboard side of Harmony, with the Bartolomeo platform on its end cone.',
  },
  'kibo-pm': {
    id: 'kibo-pm',
    name: 'Kibo',
    designation: 'Japanese Experiment Module — Pressurized Module',
    category: 'module',
    summary: 'The largest module on the station, and the main pressurised volume of the Japanese laboratory.',
  },
  'kibo-ef': {
    id: 'kibo-ef',
    name: 'Kibo Exposed Facility',
    designation: 'JEM Exposed Facility',
    category: 'platform',
    summary:
      'The terrace outside Kibo where experiments sit directly in vacuum, served by the module’s own robotic arm.',
  },
  'kibo-elm': {
    id: 'kibo-elm',
    name: 'Kibo Logistics Module',
    designation: 'JEM Experimental Logistics Module — Pressurized Section',
    category: 'module',
    summary: 'The storage attic mounted on top of Kibo, holding experiment racks and supplies.',
  },
  quest: {
    id: 'quest',
    name: 'Quest',
    designation: 'Joint Airlock',
    category: 'module',
    summary:
      'The American airlock: astronauts spend the night inside at reduced pressure before a spacewalk.',
  },
  leonardo: {
    id: 'leonardo',
    name: 'Leonardo',
    designation: 'Permanent Multipurpose Module',
    category: 'module',
    summary: 'A former Italian cargo carrier, now the station’s permanent storeroom.',
  },
  beam: {
    id: 'beam',
    name: 'BEAM',
    designation: 'Bigelow Expandable Activity Module',
    category: 'module',
    summary:
      'An experimental inflatable module: launched folded, expanded in orbit. It now serves as storage and as a testbed for soft habitats.',
  },
  bishop: {
    id: 'bishop',
    name: 'Bishop Airlock',
    designation: 'NanoRacks Bishop Airlock',
    category: 'module',
    summary:
      'A commercial airlock used to deploy small satellites and jettison waste, without tying up the crew airlock.',
  },

  'pma-1': {
    id: 'pma-1',
    name: 'PMA-1',
    designation: 'Pressurized Mating Adapter 1',
    category: 'module',
    summary: 'The pressurised joint between Unity and Zarya — the seam between the American and Russian segments.',
  },
  'pma-2': {
    id: 'pma-2',
    name: 'PMA-2',
    designation: 'Pressurized Mating Adapter 2 · IDA-2',
    category: 'module',
    summary:
      'The forward docking port on Harmony. Its International Docking Adapter lets crew vehicles dock automatically.',
  },
  'pma-3': {
    id: 'pma-3',
    name: 'PMA-3',
    designation: 'Pressurized Mating Adapter 3 · IDA-3',
    category: 'module',
    summary: 'The second automatic docking port, mounted on the zenith side of Harmony.',
  },

  zarya: {
    id: 'zarya',
    name: 'Zarya',
    designation: 'Functional Cargo Block (FGB)',
    category: 'module',
    summary: 'The first element launched, in 1998. It provided power and propulsion in the early days.',
  },
  zvezda: {
    id: 'zvezda',
    name: 'Zvezda',
    designation: 'Service Module (SM)',
    category: 'module',
    summary:
      'The Russian service module: crew quarters, thruster-based attitude control and docking port for Progress vehicles.',
  },
  poisk: {
    id: 'poisk',
    name: 'Poisk',
    designation: 'Mini-Research Module 2 (MRM-2)',
    category: 'module',
    summary: 'A small Russian module serving as both airlock and docking port, on the zenith side of Zvezda.',
  },
  rassvet: {
    id: 'rassvet',
    name: 'Rassvet',
    designation: 'Mini-Research Module 1 (MRM-1)',
    category: 'module',
    summary: 'A Russian storage module and docking port, attached beneath Zarya.',
  },
  nauka: {
    id: 'nauka',
    name: 'Nauka',
    designation: 'Multipurpose Laboratory Module (MLM)',
    category: 'module',
    summary: 'The Russian laboratory that arrived in 2021, fitted with the European ERA arm.',
  },
  prichal: {
    id: 'prichal',
    name: 'Prichal',
    designation: 'Russian Node Module',
    category: 'module',
    summary:
      'A small Russian sphere docked below Nauka, with six ports that multiply the berths available to Soyuz and Progress craft.',
  },

  'esp-1': stowagePlatform(
    'esp-1',
    'ESP-1',
    'External Stowage Platform 1',
    'A spare-parts pallet mounted on the Destiny laboratory.',
  ),
  'esp-2': stowagePlatform(
    'esp-2',
    'ESP-2',
    'External Stowage Platform 2',
    'A spare-parts pallet mounted beside the Quest airlock.',
  ),
  'esp-3': stowagePlatform(
    'esp-3',
    'ESP-3',
    'External Stowage Platform 3',
    'A spare-parts pallet on the starboard truss.',
  ),
  'elc-1': stowagePlatform(
    'elc-1',
    'ELC-1',
    'ExPRESS Logistics Carrier 1',
    'An external rack holding spare units and experiments, reachable by the robotic arm.',
  ),
  'elc-2': stowagePlatform(
    'elc-2',
    'ELC-2',
    'ExPRESS Logistics Carrier 2',
    'An external rack on the starboard truss, carrying spares and payloads.',
  ),
  'elc-3': stowagePlatform(
    'elc-3',
    'ELC-3',
    'ExPRESS Logistics Carrier 3',
    'An external rack on the port truss, carrying spares and payloads.',
  ),
  'elc-4': stowagePlatform(
    'elc-4',
    'ELC-4',
    'ExPRESS Logistics Carrier 4',
    'An external rack on the starboard truss, carrying spares and payloads.',
  ),

  canadarm: {
    id: 'canadarm',
    name: 'Canadarm2',
    designation: 'Space Station Remote Manipulator System',
    category: 'robotics',
    summary:
      'A 17-metre robotic arm that catches free-flying cargo ships and serves as a crane for spacewalkers.',
  },
  dextre: {
    id: 'dextre',
    name: 'Dextre',
    designation: 'Special Purpose Dexterous Manipulator',
    category: 'robotics',
    summary:
      'The two-armed robot fitted to the end of Canadarm2, able to swap external units without a spacewalk.',
  },
  'mobile-transporter': {
    id: 'mobile-transporter',
    name: 'Mobile Transporter',
    designation: 'Mobile Base System',
    category: 'robotics',
    summary:
      'The flatcar that rides rails along the truss, carrying Canadarm2 to wherever it is needed.',
  },

  ams: {
    id: 'ams',
    name: 'AMS-02',
    designation: 'Alpha Magnetic Spectrometer',
    category: 'science',
    summary:
      'A seven-tonne particle detector bolted to the truss. It hunts antimatter and dark matter by analysing cosmic rays above the atmosphere that would otherwise stop them.',
  },

  'antenna-ku': {
    id: 'antenna-ku',
    name: 'Ku-band Antenna',
    designation: 'Space-to-Ground Antenna (SGANT)',
    category: 'comms',
    summary: 'The large dish that sends video and high-rate data up to the TDRS relay satellites.',
  },
  'antenna-sasa-2': {
    id: 'antenna-sasa-2',
    name: 'S-band Antenna SASA-2',
    designation: 'S-Band Antenna Support Assembly 2',
    category: 'comms',
    summary: 'One of the two low-rate links carrying voice and commands to the ground.',
  },
  'antenna-sasa-3': {
    id: 'antenna-sasa-3',
    name: 'S-band Antenna SASA-3',
    designation: 'S-Band Antenna Support Assembly 3',
    category: 'comms',
    summary: 'The second S-band assembly, redundant with the first.',
  },
}

export const PART_IDS = Object.keys(PARTS) as PartId[]
