/**
 * Public telemetry, grouped into readable subsystems.
 *
 * This is the editorial content of the application: which symbols are exposed, how they are named,
 * what they mean, and which part of the station they describe. Every identifier comes from the
 * official catalogue (src/data/pui-catalog.json); a check at load time flags any drift between
 * this file and the catalogue.
 *
 * Labels stay close to NASA's own wording. The published telemetry, its units and its designations
 * are English throughout, and a translation layer would only add a place for errors to hide.
 */
import { getSymbol } from '../data/catalog'
import type { PartId } from '../scene/parts'

export type SubsystemId = 'eps' | 'eclss' | 'tcs' | 'gnc' | 'comms' | 'cdh'

export interface Channel {
  pui: string
  /** Short label shown instead of the raw catalogue description. */
  label: string
  /** One sentence of explanation, shown in discovery mode and as a tooltip. */
  hint?: string
  /** Part of the 3D twin this channel describes. */
  part?: PartId
}

export interface Section {
  id: string
  label: string
  channels: Channel[]
}

export interface Subsystem {
  id: SubsystemId
  label: string
  /** One-sentence summary, shown at the top of the section. */
  tagline: string
  /** Mission control consoles that monitor these parameters. */
  disciplines: string[]
  sections: Section[]
}

export const SUBSYSTEMS: Subsystem[] = [
  {
    id: 'eps',
    label: 'Power',
    tagline:
      'Eight 34-metre solar wings provide 75 to 90 kW. Two joints keep them facing the Sun: the SARJ turns once per orbit, the BGA compensates for the seasonal tilt.',
    disciplines: ['SPARTAN', 'SPARTAN/VVO', 'VVO'],
    sections: [
      {
        id: 'sarj',
        label: 'Solar Alpha Rotary Joint',
        channels: [
          {
            pui: 'S0000004',
            label: 'Port SARJ angle',
            hint: 'Position of the left rotary joint. It completes one full turn every orbit, about 4° per minute.',
            part: 'sarj-port',
          },
          {
            pui: 'S0000003',
            label: 'Starboard SARJ angle',
            hint: 'Position of the right rotary joint. It reads as the mirror of the port one — the two sum to 360° — because each side counts its angle in its own direction. They can also be driven a quarter turn apart, which NASA has photographed.',
            part: 'sarj-stbd',
          },
          {
            pui: 'S0000005',
            label: 'Port commanded angle',
            hint: 'The angle commanded to the port SARJ. Subtract the actual position above and you have the tracking error, which normally runs a couple of tenths of a degree — the joint is where it was told to be, and a growing gap would be the first sign it is not.',
            part: 'sarj-port',
          },
          { pui: 'S0000008', label: 'Port SARJ mode', part: 'sarj-port' },
          { pui: 'S0000009', label: 'Starboard SARJ mode', part: 'sarj-stbd' },
        ],
      },
      {
        id: 'bga',
        label: 'Beta Gimbal Assembly',
        channels: [
          {
            pui: 'S4000007',
            label: 'BGA 1A',
            hint: 'Angle of the wing about its own mast, over a full 360° of travel. It cancels the beta angle below, so the two should match: each wing sits that many degrees from its own zero — 0° or 180°, depending which way it faces. Past about 40° of beta they off-point on purpose, so one wing does not shadow the next: beta-backtracking.',
            part: 'saw-1a',
          },
          { pui: 'S4000008', label: 'BGA 3A', part: 'saw-3a' },
          { pui: 'S6000008', label: 'BGA 1B', part: 'saw-1b' },
          { pui: 'S6000007', label: 'BGA 3B', part: 'saw-3b' },
          { pui: 'P4000007', label: 'BGA 2A', part: 'saw-2a' },
          { pui: 'P4000008', label: 'BGA 4A', part: 'saw-4a' },
          { pui: 'P6000008', label: 'BGA 2B', part: 'saw-2b' },
          { pui: 'P6000007', label: 'BGA 4B', part: 'saw-4b' },
          {
            pui: 'USLAB000040',
            label: 'Solar beta angle',
            hint: 'Angle between the orbital plane and the direction of the Sun. Beyond 70° the station stays in permanent sunlight, and heats up.',
          },
        ],
      },
      {
        id: 'production',
        // The catalogue calls these "PVCU - Solar Array - <channel> - Drive Voltage/Current",
        // not the channel's power output, and the labels follow it rather than improve on it.
        // The voltage is live and tracks the primary bus (151-161 V observed). The current is
        // not: every one of the eight channels sits at exactly zero, and stayed there through
        // five minutes of gimbal motion, so the public stream is not publishing it.
        label: 'Photovoltaic control units',
        channels: [
          { pui: 'S4000001', label: 'Array 1A drive voltage', part: 'saw-1a' },
          {
            pui: 'S4000002',
            label: 'Array 1A drive current',
            hint: 'Not published: all eight drive currents sit at exactly zero. NASA’s own ISS Mimic guide marks this reading "not working".',
            part: 'saw-1a',
          },
          // The 2011 catalogue labels this pair "3B", although the S4 segment carries channels
          // 1A and 3A. We keep the physical position, which can be checked on the structure.
          { pui: 'S4000004', label: 'Array 3A drive voltage', part: 'saw-3a' },
          { pui: 'S4000005', label: 'Array 3A drive current', part: 'saw-3a' },
          { pui: 'S6000004', label: 'Array 1B drive voltage', part: 'saw-1b' },
          { pui: 'S6000005', label: 'Array 1B drive current', part: 'saw-1b' },
          { pui: 'S6000001', label: 'Array 3B drive voltage', part: 'saw-3b' },
          { pui: 'S6000002', label: 'Array 3B drive current', part: 'saw-3b' },
          { pui: 'P4000001', label: 'Array 2A drive voltage', part: 'saw-2a' },
          { pui: 'P4000002', label: 'Array 2A drive current', part: 'saw-2a' },
          { pui: 'P4000004', label: 'Array 4A drive voltage', part: 'saw-4a' },
          { pui: 'P4000005', label: 'Array 4A drive current', part: 'saw-4a' },
          { pui: 'P6000004', label: 'Array 2B drive voltage', part: 'saw-2b' },
          { pui: 'P6000005', label: 'Array 2B drive current', part: 'saw-2b' },
          { pui: 'P6000001', label: 'Array 4B drive voltage', part: 'saw-4b' },
          { pui: 'P6000002', label: 'Array 4B drive current', part: 'saw-4b' },
        ],
      },
    ],
  },

  {
    id: 'eclss',
    label: 'Life support',
    tagline:
      'The ISS makes its own air and recycles its water. Oxygen is produced by electrolysis, carbon dioxide is scrubbed out, and 98 % of the water is reused — a figure reached in 2023, when the brine processor took it up from 93–94 %.',
    disciplines: ['ETHOS'],
    sections: [
      {
        id: 'atmosphere',
        label: 'Atmosphere',
        channels: [
          {
            pui: 'USLAB000058',
            label: 'Cabin pressure',
            hint: 'The station is held at sea-level pressure — 14.7 psi with 21 % oxygen, the same 760 mmHg you are breathing — so daily life needs no acclimatisation. Spacewalks still do: the suit runs at 4.3 psi, and that drop has to be paid for with a prebreathe protocol before the hatch opens.',
            part: 'destiny',
          },
          { pui: 'USLAB000059', label: 'Cabin temperature', part: 'destiny' },
          {
            pui: 'USLAB000053',
            label: 'Destiny ppO₂',
            hint: 'Partial pressure of oxygen: this, not the percentage, decides whether air is breathable — about 160 mmHg at sea level, and held between 146 and 178 aboard. The atmosphere sensors report rarely, so read the age beside the value before comparing two of them.',
            part: 'destiny',
          },
          { pui: 'USLAB000054', label: 'Destiny ppN₂', part: 'destiny' },
          {
            pui: 'USLAB000055',
            label: 'Destiny ppCO₂',
            hint: 'Carbon dioxide builds up in a sealed volume, and the threshold that matters is lower than most people expect. NASA-STD-3001 caps the 1-hour average at 3 mmHg, down from an earlier 3.8–7.5 mmHg range: crews reported headaches from 2.8 mmHg upward, and 19 of 49 astronauts studied had them. Below 2.5 mmHg the risk falls under 1 %.',
            part: 'destiny',
          },
          { pui: 'NODE3000001', label: 'Tranquility ppO₂', part: 'tranquility' },
          { pui: 'NODE3000002', label: 'Tranquility ppN₂', part: 'tranquility' },
          { pui: 'NODE3000003', label: 'Tranquility ppCO₂', part: 'tranquility' },
        ],
      },
      {
        id: 'water',
        label: 'Water and oxygen',
        channels: [
          {
            pui: 'NODE3000009',
            label: 'Potable water tank',
            hint: 'Filled by recycling: distilled urine and condensate from the cabin air become drinking water again.',
            part: 'tranquility',
          },
          { pui: 'NODE3000005', label: 'Urine tank', part: 'tranquility' },
          { pui: 'NODE3000008', label: 'Waste water tank', part: 'tranquility' },
          { pui: 'NODE3000004', label: 'Urine processor state', part: 'tranquility' },
          { pui: 'NODE3000006', label: 'Water processor state', part: 'tranquility' },
          { pui: 'NODE3000007', label: 'Water processor step', part: 'tranquility' },
          {
            pui: 'NODE3000010',
            label: 'Oxygen generator state',
            hint: 'Electrolysis splits the water molecule: oxygen goes into the cabin, hydrogen is vented or recombined with CO₂.',
            part: 'tranquility',
          },
          {
            pui: 'NODE3000011',
            label: 'Oxygen production rate',
            // The station's own timestamp puts this reading 28 days in the past, and 59 lb/day is
            // about five times what an OGA can produce. The sensor stopped reporting; the stream
            // keeps re-sending its last number.
            hint: 'The sensor stopped reporting weeks ago — the stream keeps re-sending its last value. Its magnitude does not match what the generator can produce either.',
            part: 'tranquility',
          },
        ],
      },
      {
        id: 'air-conditioning',
        label: 'Air conditioning',
        channels: [
          { pui: 'USLAB000064', label: 'Destiny port air conditioner', part: 'destiny' },
          { pui: 'USLAB000065', label: 'Destiny starboard air conditioner', part: 'destiny' },
          { pui: 'NODE2000003', label: 'Harmony air conditioner', part: 'harmony' },
          { pui: 'NODE3000018', label: 'Tranquility air conditioner', part: 'tranquility' },
          {
            pui: 'USLAB000061',
            label: 'Destiny air coolant temp',
            hint: 'In weightlessness warm air does not rise: without forced ventilation, a bubble of carbon dioxide would form around each astronaut.',
            part: 'destiny',
          },
          { pui: 'USLAB000060', label: 'Destiny avionics coolant temp', part: 'destiny' },
          { pui: 'NODE2000006', label: 'Harmony air coolant temp', part: 'harmony' },
          { pui: 'NODE2000007', label: 'Harmony avionics coolant temp', part: 'harmony' },
          { pui: 'NODE3000013', label: 'Tranquility air coolant temp', part: 'tranquility' },
          { pui: 'NODE3000012', label: 'Tranquility avionics coolant temp', part: 'tranquility' },
        ],
      },
      {
        id: 'airlock',
        label: 'Airlock',
        channels: [
          {
            pui: 'AIRLOCK000054',
            label: 'Airlock pressure',
            hint: 'Quest has two compartments: the equipment lock, where the suits are stored and serviced, and the crew lock, which is the one actually emptied to vacuum.',
            part: 'quest',
          },
          {
            pui: 'AIRLOCK000049',
            label: 'Crewlock pressure',
            hint: 'This is the one to watch during a spacewalk: it falls from cabin pressure towards vacuum, pausing at 5 psi for a five-minute leak check before the hatch can open.',
            part: 'quest',
          },
          { pui: 'AIRLOCK000050', label: 'High-pressure O₂ valve', part: 'quest' },
          { pui: 'AIRLOCK000051', label: 'Low-pressure O₂ valve', part: 'quest' },
          { pui: 'AIRLOCK000052', label: 'Nitrogen supply valve', part: 'quest' },
          { pui: 'AIRLOCK000053', label: 'Airlock air conditioner', part: 'quest' },
        ],
      },
    ],
  },

  {
    id: 'tcs',
    label: 'Thermal',
    tagline:
      'Surfaces outside cycle between −120 °C and +120 °C, sixteen times a day. Two ammonia loops carry equipment heat out to large steerable radiators.',
    disciplines: ['SPARTAN', 'VVO'],
    sections: [
      {
        id: 'loop-a',
        label: 'External loop A',
        channels: [
          {
            pui: 'S1000001',
            label: 'Loop A flow rate',
            hint: 'Ammonia circulates between the heat exchangers and the radiators — nominally 3,700 kg per hour on this loop and 4,000 on loop B, the difference being the hydraulic resistance of two differently shaped plumbing runs rather than a fault. Between them the two loops reject up to 70 kW.',
            part: 'radiator-stbd',
          },
          { pui: 'S1000002', label: 'Loop A pump outlet pressure', part: 'radiator-stbd' },
          { pui: 'S1000003', label: 'Loop A pump outlet temp', part: 'radiator-stbd' },
        ],
      },
      {
        id: 'loop-b',
        label: 'External loop B',
        channels: [
          { pui: 'P1000001', label: 'Loop B flow rate', part: 'radiator-port' },
          { pui: 'P1000002', label: 'Loop B pump outlet pressure', part: 'radiator-port' },
          { pui: 'P1000003', label: 'Loop B pump outlet temp', part: 'radiator-port' },
        ],
      },
      {
        id: 'radiators',
        label: 'Radiators',
        channels: [
          {
            pui: 'S0000001',
            label: 'Starboard TRRJ position',
            hint: 'The radiator beam is turned twice an orbit, edge-on to the Sun while the station is lit and face to the Earth during eclipse. It is not simply chasing the coldest sky: the goal is −40 °C at the radiator outlet, cold enough to reject the heat and warm enough that the ammonia does not freeze in the manifolds.',
            part: 'trrj-stbd',
          },
          { pui: 'S0000002', label: 'Port TRRJ position', part: 'trrj-port' },
          {
            pui: 'S0000007',
            label: 'Loop A TRRJ mode',
            hint: 'Directed position means the joint is holding still; autotrack means it is chasing the best angle for rejecting heat; shutdown means the motor is disabled.',
            part: 'trrj-stbd',
          },
          { pui: 'S0000006', label: 'Loop B TRRJ mode', part: 'trrj-port' },
        ],
      },
      {
        id: 'internal-water',
        label: 'Internal water loops',
        channels: [
          {
            pui: 'USLAB000056',
            label: 'Destiny low-temp coolant',
            hint: 'The low-temperature loop cools the delicate hardware — science racks and payloads. Water is used inside the modules rather than ammonia: it will not poison the cabin if a line leaks.',
            part: 'destiny',
          },
          {
            pui: 'USLAB000057',
            label: 'Destiny moderate-temp coolant',
            hint: 'The moderate-temperature loop takes the hotter, hardier equipment: avionics and power electronics. Both loops hand their heat to the external ammonia loops through an interface heat exchanger.',
            part: 'destiny',
          },
          { pui: 'NODE2000002', label: 'Harmony low-temp coolant', part: 'harmony' },
          { pui: 'NODE2000001', label: 'Harmony moderate-temp coolant', part: 'harmony' },
          { pui: 'NODE3000017', label: 'Tranquility coolant 1', part: 'tranquility' },
          { pui: 'NODE3000019', label: 'Tranquility coolant 2', part: 'tranquility' },
        ],
      },
    ],
  },

  {
    id: 'gnc',
    label: 'Attitude & orbit',
    tagline:
      'The station holds its orientation with four 100 kg gyroscopes spinning at 6,600 rpm. They absorb disturbing torques without burning any propellant.',
    disciplines: ['ADCO', 'ADCO/VVO', 'ADCO/TOPO'],
    sections: [
      {
        id: 'cmg',
        // The four gyroscopes live inside the Z1 truss and are not visible from outside, so their
        // channels attach to Z1 rather than to parts of their own.
        label: 'Control moment gyroscopes',
        channels: [
          { pui: 'USLAB000005', label: 'CMGs online', part: 'truss-z1' },
          { pui: 'USLAB000001', label: 'CMG-1 online', part: 'truss-z1' },
          { pui: 'USLAB000002', label: 'CMG-2 online', part: 'truss-z1' },
          { pui: 'USLAB000003', label: 'CMG-3 online', part: 'truss-z1' },
          { pui: 'USLAB000004', label: 'CMG-4 online', part: 'truss-z1' },
          {
            pui: 'Z1000009',
            label: 'CMG-1 wheel speed',
            hint: 'The flywheel spins continuously at about 6,600 rpm; it is the tilt of its axis, not its speed, that steers the station.',
            part: 'truss-z1',
          },
          { pui: 'Z1000010', label: 'CMG-2 wheel speed', part: 'truss-z1' },
          { pui: 'Z1000011', label: 'CMG-3 wheel speed', part: 'truss-z1' },
          { pui: 'Z1000012', label: 'CMG-4 wheel speed', part: 'truss-z1' },
          { pui: 'Z1000001', label: 'CMG-1 vibration', part: 'truss-z1' },
          { pui: 'Z1000002', label: 'CMG-2 vibration', part: 'truss-z1' },
          { pui: 'Z1000003', label: 'CMG-3 vibration', part: 'truss-z1' },
          { pui: 'Z1000004', label: 'CMG-4 vibration', part: 'truss-z1' },
          { pui: 'USLAB000045', label: 'CMG-1 spin motor temp', part: 'truss-z1' },
          { pui: 'USLAB000046', label: 'CMG-2 spin motor temp', part: 'truss-z1' },
          { pui: 'USLAB000047', label: 'CMG-3 spin motor temp', part: 'truss-z1' },
          { pui: 'USLAB000048', label: 'CMG-4 spin motor temp', part: 'truss-z1' },
        ],
      },
      {
        id: 'momentum',
        label: 'Momentum',
        channels: [
          {
            pui: 'USLAB000010',
            label: 'CMG momentum saturation',
            hint: 'As the gyroscopes approach saturation, the station must desaturate them using the Russian thrusters.',
          },
          { pui: 'USLAB000009', label: 'Active CMG momentum' },
          { pui: 'USLAB000038', label: 'CMG momentum capacity' },
          { pui: 'USLAB000011', label: 'Desaturation request' },
          { pui: 'USLAB000006', label: 'Control torque — roll' },
          { pui: 'USLAB000007', label: 'Control torque — pitch' },
          { pui: 'USLAB000008', label: 'Control torque — yaw' },
        ],
      },
      {
        id: 'attitude',
        label: 'Orientation',
        channels: [
          {
            pui: 'USLAB000012',
            label: 'GNC mode',
            hint: 'The station flies in a local frame: its belly stays towards Earth, its nose towards the direction of travel.',
          },
          { pui: 'USLAB000016', label: 'Attitude controller type' },
          { pui: 'USLAB000017', label: 'Attitude reference frame' },
          { pui: 'USLAB000081', label: 'Attitude manoeuvre in progress' },
          {
            pui: 'USLAB000022',
            label: 'Roll error',
            hint: 'Zero on all three axes means the station is flying exactly along its velocity vector. It normally holds an attitude that minimises natural torques, so the gyroscopes have little to fight.',
          },
          { pui: 'USLAB000023', label: 'Pitch error' },
          { pui: 'USLAB000024', label: 'Yaw error' },
          { pui: 'USLAB000025', label: 'Inertial rate X' },
          { pui: 'USLAB000026', label: 'Inertial rate Y' },
          { pui: 'USLAB000027', label: 'Inertial rate Z' },
          { pui: 'USLAB000018', label: 'LVLH quaternion q0' },
          { pui: 'USLAB000019', label: 'LVLH quaternion q1' },
          { pui: 'USLAB000020', label: 'LVLH quaternion q2' },
          { pui: 'USLAB000021', label: 'LVLH quaternion q3' },
        ],
      },
      {
        id: 'state-vector',
        label: 'State vector and mass',
        channels: [
          {
            pui: 'USLAB000039',
            label: 'Total station mass',
            hint: 'The station itself is about 420 tonnes; the published figure includes every docked vehicle and its propellant, so it runs higher. It has to stay accurate — the thrusters need it to control the station’s orientation. Check its age: this one is updated only occasionally.',
          },
          { pui: 'USLAB000032', label: 'J2000 position X' },
          { pui: 'USLAB000033', label: 'J2000 position Y' },
          { pui: 'USLAB000034', label: 'J2000 position Z' },
          { pui: 'USLAB000035', label: 'J2000 velocity X' },
          { pui: 'USLAB000036', label: 'J2000 velocity Y' },
          { pui: 'USLAB000037', label: 'J2000 velocity Z' },
          { pui: 'USLAB000043', label: 'GPS 1 status' },
          { pui: 'USLAB000044', label: 'GPS 2 status' },
        ],
      },
      {
        id: 'alarms',
        label: 'Alarms',
        channels: [
          { pui: 'USLAB000041', label: 'Loss of CMG attitude control' },
          { pui: 'USLAB000042', label: 'Loss of ISS attitude control' },
        ],
      },
    ],
  },

  {
    id: 'comms',
    label: 'Communications',
    tagline:
      'The station does not talk to the ground directly: it aims at TDRS relay satellites 35,800 km up. Between two relays, contact drops for a few minutes.',
    disciplines: ['CATO', 'CATO/VVO'],
    sections: [
      {
        id: 'sband',
        label: 'S-band — voice and commands',
        // Which radio frequency group drives which antenna assembly, settled in two steps.
        // The ISS Mimic C&T chapter states RFG1 sits on the S1 truss (starboard) and RFG2 on
        // P1 (port) — which the symbol names already imply, S1000004 against P1000004. Then
        // the model: composing full node transforms puts Truss_S1 at z=+1.5 and Truss_P1 at
        // z=-1.5, so positive z is starboard; Payload_SASA2 sits at z=+0.7 and SASA3 at
        // z=-2.5. Starboard SASA2 therefore carries RFG1, port SASA3 carries RFG2.
        //
        // The side is unambiguous; the exact placement is not, since SASA3 sits further
        // outboard than P1 itself. The attachment rests on which side of the truss each
        // antenna is on, which is all it needs.
        channels: [
          {
            pui: 'S1000004',
            label: 'RFG 1 azimuth',
            hint: 'S-band carries voice, commands and telemetry — NASA works 2,025–2,110 MHz up to the station and 2,200–2,300 MHz back down. Two groups are kept, one per side, so the station stays in contact when its own structure blocks one of them.',
            part: 'antenna-sasa-2',
          },
          { pui: 'S1000005', label: 'RFG 1 elevation', part: 'antenna-sasa-2' },
          { pui: 'S1000009', label: 'RFG 1 power', part: 'antenna-sasa-2' },
          { pui: 'P1000004', label: 'RFG 2 azimuth', part: 'antenna-sasa-3' },
          { pui: 'P1000005', label: 'RFG 2 elevation', part: 'antenna-sasa-3' },
          { pui: 'P1000007', label: 'RFG 2 power', part: 'antenna-sasa-3' },
          { pui: 'USLAB000092', label: 'Active S-band string' },
        ],
      },
      {
        id: 'kuband',
        label: 'Ku-band — video and data',
        channels: [
          {
            pui: 'Z1000013',
            label: 'Ku-band transmit',
            hint: 'Ku-band carries the heavy traffic: high-definition video, experiment data, file transfer. NASA holds 13.4–14.3 GHz and 14.5–15.2 GHz for the relay satellites, and this dish aims at one of them 35,800 km up rather than at the ground.',
            part: 'antenna-ku',
          },
          {
            pui: 'Z1000014',
            label: 'SGANT elevation',
            hint: 'Zero points straight up, −90° towards the back of the station, +90° straight ahead. Near the extremes the dish must reset to catch the next relay satellite, and the link drops.',
            part: 'antenna-ku',
          },
          { pui: 'Z1000015', label: 'SGANT cross-elevation', part: 'antenna-ku' },
          { pui: 'USLAB000088', label: 'Video downlink 1' },
          { pui: 'USLAB000089', label: 'Video downlink 2' },
          { pui: 'USLAB000090', label: 'Video downlink 3' },
          { pui: 'USLAB000091', label: 'Video downlink 4' },
        ],
      },
      {
        id: 'uhf',
        label: 'UHF and audio',
        channels: [
          {
            pui: 'USLAB000099',
            label: 'UHF radio 1',
            hint: 'Around 400 MHz — the short-range link to spacewalking astronauts and to vehicles on final approach. It also carries each suit’s own telemetry. Both radios on at once very likely means a spacewalk is under way.',
          },
          { pui: 'USLAB000100', label: 'UHF radio 2' },
          {
            pui: 'USLAB000101',
            label: 'UHF frame sync lock',
            hint: 'Locked when receiver and transmitter are talking to each other properly.',
          },
          { pui: 'USLAB000093', label: 'Internal audio controller 1' },
          { pui: 'USLAB000094', label: 'Internal audio controller 2' },
        ],
      },
    ],
  },

  {
    id: 'cdh',
    label: 'Command & data',
    tagline:
      'Around fifty redundant computers run the station, in three tiers. The top tier is two-fault tolerant: three identical command-and-control machines, one hot, one warm backup processing data without commanding, and one cold.',
    disciplines: ['ODIN', 'ODIN/VVO', 'CDH', 'N/A'],
    sections: [
      {
        id: 'station',
        label: 'Station status',
        channels: [
          {
            pui: 'USLAB000086',
            label: 'Station mode',
            hint: 'Standard most of the time. It switches to proximity operations while a spacecraft docks, to external operations during a spacewalk, and to reboost when the thrusters fire to raise the orbit.',
          },
          { pui: 'USLAB000087', label: 'Crew laptops connected' },
          { pui: 'USLAB000082', label: 'Standard commands received' },
          { pui: 'USLAB000083', label: 'Data load commands received' },
          { pui: 'USLAB000084', label: 'Onboard time (coarse)' },
          { pui: 'USLAB000085', label: 'Onboard time (fine)' },
        ],
      },
      {
        id: 'time',
        label: 'Time',
        channels: [
          {
            pui: 'TIME_000001',
            label: 'Onboard GMT',
            hint: 'The station runs on Greenwich time — the compromise between Houston and Moscow.',
          },
          { pui: 'TIME_000002', label: 'Year' },
        ],
      },
      {
        id: 'computers',
        label: 'Computers',
        channels: [
          { pui: 'USLAB000066', label: 'C&C MDM 1', part: 'destiny' },
          { pui: 'USLAB000067', label: 'C&C MDM 2', part: 'destiny' },
          { pui: 'USLAB000068', label: 'C&C MDM 3', part: 'destiny' },
          { pui: 'USLAB000073', label: 'GNC MDM 1', part: 'destiny' },
          { pui: 'USLAB000074', label: 'GNC MDM 2', part: 'destiny' },
          { pui: 'USLAB000069', label: 'Internal control zone 1', part: 'destiny' },
          { pui: 'USLAB000070', label: 'Internal control zone 2', part: 'destiny' },
          { pui: 'S0000010', label: 'External control zone 1', part: 'truss-s0' },
          { pui: 'S0000012', label: 'External control zone 2', part: 'truss-s0' },
        ],
      },
    ],
  },
]

/** Every channel, flattened. */
export const ALL_CHANNELS: Channel[] = SUBSYSTEMS.flatMap((subsystem) =>
  subsystem.sections.flatMap((section) => section.channels),
)

/** Deduplicated list of symbols to subscribe to. */
export const SUBSCRIBED_PUIS: string[] = [...new Set(ALL_CHANNELS.map((channel) => channel.pui))]

const channelByPui = new Map<string, Channel>(ALL_CHANNELS.map((channel) => [channel.pui, channel]))

export function getChannel(pui: string): Channel | undefined {
  return channelByPui.get(pui)
}

/** Channels attached to a part of the 3D twin, in subsystem order. */
export function channelsForPart(part: PartId): Channel[] {
  return ALL_CHANNELS.filter((channel) => channel.part === part)
}

/** The subsystem a channel belongs to. */
export function subsystemOfPui(pui: string): Subsystem | undefined {
  return SUBSYSTEMS.find((subsystem) =>
    subsystem.sections.some((section) => section.channels.some((channel) => channel.pui === pui)),
  )
}

// In development, check that this file stays aligned with the official catalogue: a mistyped PUI
// would be subscribed and never receive anything, and the mistake would go unnoticed for as long
// as the stream stays silent.
if (import.meta.env.DEV) {
  const unknown = SUBSCRIBED_PUIS.filter((pui) => !getSymbol(pui))
  if (unknown.length > 0) {
    console.error(`[subsystems] ${unknown.length} symbol(s) missing from catalogue: ${unknown.join(', ')}`)
  }
}
