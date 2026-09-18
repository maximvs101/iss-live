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
  /**
   * Subscribed, but not given a row of its own.
   *
   * For a symbol another reading needs and no one wants to read on its own line. The
   * subscription list is built from these channels, so deleting the entry would stop the value
   * arriving at all — which is the trap this flag exists to avoid.
   */
  hidden?: boolean
  /**
   * Zero is not a reading this channel can take, so a zero is the broadcast, not the station.
   *
   * Measured on the collector's record: on 11 August 2026 at 16:44 UTC, and again on 19 August at
   * 00:31, twenty-two symbols read exactly 0 for one minute and came back to their previous value
   * the minute after — cabin pressure, station mass and the partial pressures among them. Twice in
   * twenty-two days, so rare; and unmissable when it happens, because a page saying the cabin is
   * at 0 mmHg is saying something about the crew that is not true.
   *
   * Only where zero is physically impossible, which is a narrower set than it looks. The crewlock
   * reads zero every time it is pumped down for a spacewalk, the oxygen generator reads zero when
   * it is idle, an array reads zero when it is offline, and a cabin temperature in Celsius reads
   * zero at freezing. Those are readings, and they stay.
   */
  neverZero?: boolean
  /**
   * The timestamp dates the last *change*, not the last measurement.
   *
   * A count, an identifier or a year holds until the thing it names moves, so an old timestamp on
   * one is good news: four CMGs online for eight days is four CMGs that have not failed. The
   * catalogue already marks this for symbols with enumerated states, and the freshness rule reads
   * that flag — but it says nothing about a symbol whose value is simply a number that means a
   * state. Six of those were being counted as stalled sensors: the year, the CMG count, the crew
   * laptop count, the active S-band string and the two command counters.
   *
   * Not for a measurement that happens to be slow. A partial pressure eight days old is a sensor
   * that stopped, and it stays `stopped`.
   */
  holds?: boolean
}

interface Section {
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
          {
            pui: 'S0000008',
            label: 'Port SARJ mode',
            hint: 'Autotrack is the normal state — the joint follows the Sun at orbital rate, and both SARJs report it live. The other names are ones Mimic glosses for the thermal joints: directed position holding a commanded angle, shutdown the motor disabled. It carries two fully redundant drive strings, each with its own motor controller and drive-lock assembly, so a failure in one need not stop the wings.',
            part: 'sarj-port',
          },
          {
            pui: 'S0000009',
            label: 'Starboard SARJ mode',
            hint: 'Same states as the port joint, and normally autotrack too. This is the joint that failed: eleven weeks after it was switched on in June 2007 its drag began climbing, and a spacewalker lifting a thermal cover found fine metal shavings across the race ring. Operation was halted; on STS-126 the crew scraped and greased the ring and replaced eleven of the twelve trundle bearings — the twelfth had come off a year earlier, for examination on the ground.',
            part: 'sarj-stbd',
          },
        ],
      },
      {
        id: 'bga',
        label: 'Beta Gimbal Assembly',
        channels: [
          {
            pui: 'S4000007',
            label: 'BGA 1A',
            hint: 'Angle of the wing about its own mast, over a full 360° of travel, from the position where its cells face inboard along the truss. Facing the Sun would read 90° minus beta — or 90° plus, 270° minus, 270° plus, as each wing counts its own way — but the station flies them about 45° short of that on purpose, the "sun slicer" drag-reduction bias, and past about 48° of beta parks most of them at 0° or 180° instead.',
            part: 'saw-1a',
          },
          {
            pui: 'S4000008',
            label: 'BGA 3A',
            hint: 'Same convention as 1A: 0° puts the cells inboard along the truss, and the wing is flown about 45° short of the Sun on purpose. 3A shares the S4 segment with 1A, so the two ride the same rotary joint and see the same beta; only their own gimbals differ. Its roll-out array was added in 2022, in the same pair as 4A.',
            part: 'saw-3a',
          },
          {
            pui: 'S6000008',
            label: 'BGA 1B',
            hint: 'Same convention as 1A, on the outermost starboard segment, S6. A roll-out array was laid over this wing in 2023, in the same pair as 1A. Past about 48° of beta six of the eight wings stop tracking and sit at exactly 0° or 180°, parked where the bias would have carried them through zero.',
            part: 'saw-1b',
          },
          {
            pui: 'S6000007',
            label: 'BGA 3B',
            hint: 'Same convention as 1A, on the S6 segment beside 1B. The gimbal exists to follow the seasonal drift of beta, about 4° a day, yet over thirteen minutes in which beta moved 0.05° every BGA moved 1.2° to 1.7° — a small orbital-rate term riding on the seasonal one, below the resolution of anything else published here.',
            part: 'saw-3b',
          },
          {
            pui: 'P4000007',
            label: 'BGA 2A',
            hint: 'Same convention as 1A, on the port side: even channels are port, odd starboard. The gimbal can be commanded to an angle, to a rate, latched in place or left to be turned by hand from the truss side — but none of that is public. The stream carries a mode and a commanded angle for the SARJ only, so a deliberate bias on the wings cannot be read from here, only measured.',
            part: 'saw-2a',
          },
          {
            pui: 'P4000008',
            label: 'BGA 4A',
            hint: 'Same convention as 1A, on the P4 segment beside 2A. The wing’s power crosses this joint through roll rings, a rolling electrical contact that works over the full 360° of travel. A roll-out array went on in 2022, in the same pair as 3A.',
            part: 'saw-4a',
          },
          {
            pui: 'P6000008',
            label: 'BGA 2B',
            hint: 'Same convention as 1A, at the port end of the truss. 2B and 4B are the P6 pair, and P6 spent its first years mounted on top of the Z1 truss, feeding the laboratory directly, before the segment went out to the port end its symbol now names. It received the first of the roll-out arrays, in 2021.',
            part: 'saw-2b',
          },
          {
            pui: 'P6000007',
            label: 'BGA 4B',
            hint: 'Same convention as 1A, on the P6 segment beside 2B. This is the wing that had to be rolled back into its blanket boxes in December 2006: once P4’s arrays began turning on the new rotary joint they would have struck it where it then stood. A roll-out array was added over it in 2021, with 2B.',
            part: 'saw-4b',
          },
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
        //
        // The two levels the hint describes are measured, not textbook. Across five days of
        // collected readings, all 141 taken in Earth's shadow are below 155 V without a single
        // exception, averaging 151.2 V over a range of 0.7 V; of 298 taken in sunlight only 53 %
        // are, spread from 151.4 to 160.6 V. The shadow comes from the orbital elements, so
        // nothing links the two sides of that. The asymmetry is the substance of it: shadow
        // forces the low state, sunlight only permits the high one.
        //
        // The eight channels also do not cross between the levels together — 3A arrives last in
        // 13 of the 15 readings that caught them apart, up to 9.28 V behind. That transient is
        // why the wings appear to disagree, and it is not a pointing difference.
        label: 'Photovoltaic control units',
        channels: [
          {
            pui: 'S4000001',
            label: 'Array 1A drive voltage',
            hint: 'This sits at one of two levels, and which one says whether the station is in daylight. In Earth’s shadow it is always about 151 V — the batteries are carrying the station and there is nothing the arrays can do. In sunlight it rises to about 160 V while they charge, and drops back to 151 V once they are full and the surplus is shunted away. So a low reading in daylight is normal: it means the batteries are already topped up.',
            part: 'saw-1a',
          },
          {
            pui: 'S4000002',
            label: 'Array 1A drive current',
            hint: 'Not published: all eight drive currents sit at exactly zero. NASA’s own ISS Mimic guide marks this reading "not working".',
            part: 'saw-1a',
          },
          // The 2011 catalogue labels this pair "3B", although the S4 segment carries channels
          // 1A and 3A. We keep the physical position, which can be checked on the structure.
          {
            pui: 'S4000004',
            label: 'Array 3A drive voltage',
            hint: 'Same two levels as 1A, about 151 V in shadow and up to about 160 V while the batteries charge. This is the channel that changes last: when the eight were caught apart, 3A was the straggler in 13 of 15 readings, up to 9 V behind — a transient, not a pointing difference. The 2011 catalogue labels it 3B; the S4 segment carries 1A and 3A.',
            part: 'saw-3a',
          },
          {
            pui: 'S4000005',
            label: 'Array 3A drive current',
            hint: 'Not published: this reads exactly zero like the other seven drive currents, and carries no timestamp at all — never measured, which is what the reading NASA’s Mimic guide marks ‘not working’ looks like from here. The catalogue labels this pair 3B, though the S4 segment carries 1A and 3A.',
            part: 'saw-3a',
          },
          {
            pui: 'S6000004',
            label: 'Array 1B drive voltage',
            hint: 'Same two levels as 1A. The unit that sets them, the sequential shunt unit, sits on this wing’s own gimbal platform at the foot of the mast: it switches whole strings of cells in and out to hold the bus near 160 V, and in shadow the batteries hold it near 151 V instead. 1B is the outermost starboard channel, on S6.',
            part: 'saw-1b',
          },
          {
            pui: 'S6000005',
            label: 'Array 1B drive current',
            hint: 'Not published: exactly zero on all eight channels, with no timestamp behind it. The name of the symbol says what it would be — the integrated current through relay 6 of the 1B switching unit, the box that routes this wing’s power to the batteries and the main bus.',
            part: 'saw-1b',
          },
          {
            pui: 'S6000001',
            label: 'Array 3B drive voltage',
            hint: 'Same two levels as 1A. The digit is the power domain the channel feeds: 3B belongs to the 2/3 domain with 2A, 2B and 3A, the 1/4 domain taking the other four, and each domain has its own cooling loop. The letter only says which of the two wings on the S6 module this is.',
            part: 'saw-3b',
          },
          {
            pui: 'S6000002',
            label: 'Array 3B drive current',
            hint: 'Not published: it sits at exactly zero, as all eight drive currents do, and publishes no timestamp. The Mimic guide marks the same readout ‘not working’; the voltage beside it is the live half of this pair.',
            part: 'saw-3b',
          },
          {
            pui: 'P4000001',
            label: 'Array 2A drive voltage',
            hint: 'Same two levels as 1A. Sunlight only permits the high one: across five days every reading taken in Earth’s shadow was below 155 V, without exception, while only about half of those taken in sunlight were — the other half had batteries already full. 2A is on P4, the inner port segment.',
            part: 'saw-2a',
          },
          {
            pui: 'P4000002',
            label: 'Array 2A drive current',
            hint: 'Not published: exactly zero, with no timestamp, like every other drive current. It stayed at zero through five minutes in which the SARJ turned 19° and the gimbals moved over a degree, so it is not a quiet channel — it is an empty one.',
            part: 'saw-2a',
          },
          {
            pui: 'P4000004',
            label: 'Array 4A drive voltage',
            hint: 'Same two levels as 1A. What this wing sends inboard is primary power; it is only downstream, in converter units, that it is stepped down to the 124 V every load aboard is built for. 4A is the second wing on P4 and has carried a roll-out array since 2022.',
            part: 'saw-4a',
          },
          {
            pui: 'P4000005',
            label: 'Array 4A drive current',
            hint: 'Not published: exactly zero and without a timestamp, on this channel as on the other seven. An earlier version of this site promised that a negative reading meant the channel was delivering; no such reading has ever been seen, and the line was removed.',
            part: 'saw-4a',
          },
          {
            pui: 'P6000004',
            label: 'Array 2B drive voltage',
            hint: 'Same two levels as 1A. When the eight split, they do so in groups about 9 V apart, some near 160 V and some near 151 V, and eclipse has only ever been seen with all of them converged. 2B is on P6, at the far port end, one of the pair that fed the laboratory on its own before P4 came on line.',
            part: 'saw-2b',
          },
          {
            pui: 'P6000005',
            label: 'Array 2B drive current',
            hint: 'Not published: exactly zero, with no timestamp, like the other seven. Nothing here is wrong with the wing — the voltage beside it is live — the stream simply does not carry this measurement.',
            part: 'saw-2b',
          },
          {
            pui: 'P6000001',
            label: 'Array 4B drive voltage',
            hint: 'Same two levels as 1A. The batteries this bus falls back on are on the same P6 segment as the wing, six charge-discharge units per module, each able to put 8.4 kW into its battery and take 6.6 kW back out. 4B, with 2B, was the first pair to receive a roll-out array, in 2021.',
            part: 'saw-4b',
          },
          {
            pui: 'P6000002',
            label: 'Array 4B drive current',
            hint: 'Not published: exactly zero, with no timestamp, on all eight drive currents alike. Mimic’s own deck marks the middle line of each wing, the current, ‘not working’, and keeps the angle above it and the voltage below.',
            part: 'saw-4b',
          },
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
            neverZero: true,
            hint: 'The station is held at sea-level pressure — 14.7 psi with 21 % oxygen, the same 760 mmHg you are breathing — so daily life needs no acclimatisation. Spacewalks still do: the suit runs at 4.3 psi, and that drop has to be paid for with a prebreathe protocol before the hatch opens.',
            part: 'destiny',
          },
          {
            pui: 'USLAB000059',
            label: 'Cabin temperature',
            hint: 'Measured at the inlet of Destiny’s port air conditioner, so this is the air coming back from the cabin rather than the chilled air leaving it. The station is kept at ordinary room temperature; the air conditioners hold both temperature and humidity, and the water they wring out of the air ends up in the drinking supply.',
            part: 'destiny',
          },
          {
            pui: 'USLAB000053',
            label: 'Destiny ppO₂',
            neverZero: true,
            hint: 'Partial pressure of oxygen: this, not the percentage, decides whether air is breathable — about 160 mmHg at sea level, and held between 146 and 178 aboard. The atmosphere sensors report rarely, so read the age beside the value before comparing two of them.',
            part: 'destiny',
          },
          {
            pui: 'USLAB000054',
            label: 'Destiny ppN₂',
            hint: 'Nitrogen does nothing for breathing. It is the diluent: NASA-STD-3001 requires at least 30 % of the cabin gas to be inert, to hold down the fire risk and the oxygen the lungs absorb over a long stay, and aboard the mix is kept close to sea-level air. It is also the gas a spacewalker has to flush out of the blood before an EVA, which is what the prebreathe is for.',
            part: 'destiny',
            neverZero: true,
          },
          {
            pui: 'USLAB000055',
            label: 'Destiny ppCO₂',
            neverZero: true,
            hint: 'Carbon dioxide builds up in a sealed volume, and the threshold that matters is lower than most people expect. NASA-STD-3001 caps the 1-hour average at 3 mmHg, down from an earlier 3.8–7.5 mmHg range: crews reported headaches from 2.8 mmHg upward, and 19 of 49 astronauts studied had them. Below 2.5 mmHg the risk falls under 1 %.',
            part: 'destiny',
          },
          {
            pui: 'NODE3000001',
            label: 'Tranquility ppO₂',
            hint: 'The second oxygen analyser, in the module that houses the oxygen generator. It once read 17.7 mmHg apart from Destiny’s, which turned out to be eight days between the two measurements rather than a difference between modules — both sensors have been re-sending old readings for weeks.',
            part: 'tranquility',
            neverZero: true,
          },
          {
            pui: 'NODE3000002',
            label: 'Tranquility ppN₂',
            hint: 'Tranquility’s reading of the diluent. Ventilation moves cabin air between the modules, so the two nitrogen readings should agree once their timestamps do; both partial-pressure analysers report rarely and have stalled for weeks, so check the age before reading a gap between them as a gradient.',
            part: 'tranquility',
            neverZero: true,
          },
          {
            pui: 'NODE3000003',
            label: 'Tranquility ppCO₂',
            hint: 'The reading from the module where the scrubbing is done: Tranquility houses the carbon dioxide removal assembly, along with the oxygen generator, the water recovery racks, the toilet and the treadmill. The 3 mmHg one-hour limit applies here as it does in Destiny; this sensor, like the others, has re-sent the same value for weeks.',
            part: 'tranquility',
            neverZero: true,
          },
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
          {
            pui: 'NODE3000005',
            label: 'Urine tank',
            hint: 'The toilet in Tranquility’s hygiene compartment collects urine into this tank, and the urine processor draws it down by vacuum distillation. What distillation cannot recover is left as brine, and the brine processor now takes water out of that too — the step that lifted total recovery from 93–94 % to the 98 % NASA reported in 2023.',
            part: 'tranquility',
          },
          {
            pui: 'NODE3000008',
            label: 'Waste water tank',
            hint: 'Not sewage: this is the water processor’s feed tank, holding the distillate from the urine processor and the humidity the air conditioners condense out of the crew’s breath and sweat. From here the water goes through filters and a catalytic reactor, gets a dose of iodine against microbes, and fills the potable tank.',
            part: 'tranquility',
          },
          {
            pui: 'NODE3000004',
            label: 'Urine processor state',
            hint: 'NORMAL is the working state, and the usual one: the assembly distils urine under vacuum and leaves a brine behind. STANDBY and IDLE are the machine waiting, MAINTENANCE and SHUTDOWN are it being serviced or brought down, and SYSTEM INITIALIZED is the state just after power-up, before it has been told what to do.',
            part: 'tranquility',
          },
          {
            pui: 'NODE3000006',
            label: 'Water processor state',
            hint: 'PROCESS means wastewater is being turned into drinking water: a series of filters, then a catalytic reactor that breaks down trace contaminants, then iodine to stop anything growing in it. STANDBY is the pause between runs; HOT SERVICE and FLUSH are servicing states rather than faults, and STOP, SHUTDOWN and WARM SHUTDOWN are the halts.',
            part: 'tranquility',
          },
          {
            pui: 'NODE3000007',
            label: 'Water processor step',
            hint: 'The finer phase within the state above: a run does not begin at FLOW, the machine vents, heats up and purges first, and the TEST steps are self-checks. NONE is what it reports whenever no sequence is running. Enumerations like this change rarely, and an old timestamp here dates the last transition, not a dead sensor.',
            part: 'tranquility',
          },
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
          {
            pui: 'USLAB000064',
            label: 'Destiny port air conditioner',
            hint: 'ON is the working state: cabin air is drawn through a heat exchanger chilled by the low-temperature water loop, which cools it and condenses the humidity out, and that condensate goes to the water processor. DRAIN and DRYOUT are what is done to the wet heat exchanger when the unit comes out of service. Destiny has two, port and starboard; the cabin temperature is measured at this one’s inlet.',
            part: 'destiny',
          },
          {
            pui: 'USLAB000065',
            label: 'Destiny starboard air conditioner',
            hint: 'Destiny’s second air conditioner, in the starboard rack bay opposite the port unit. The same states: ON is cooling and dehumidifying the lab’s air over a heat exchanger fed by the low-temperature loop, DRAIN and DRYOUT are the servicing of that heat exchanger.',
            part: 'destiny',
          },
          {
            pui: 'NODE2000003',
            label: 'Harmony air conditioner',
            hint: 'Harmony has an air conditioner of its own. Besides being the junction the laboratories hang off, the module holds four of the crew’s sleeping quarters, so this is the unit that conditions the air the crew sleep in. ON is cooling and drying; DRAIN and DRYOUT are servicing states.',
            part: 'harmony',
          },
          {
            pui: 'NODE3000018',
            label: 'Tranquility air conditioner',
            hint: 'Tranquility’s unit serves the module that holds the toilet, the treadmill and the weight-lifting device, and its condensate has the shortest journey of any: the water recovery racks that turn it back into drinking water are in the same module. ON is the working state; DRAIN and DRYOUT are servicing of the heat exchanger.',
            part: 'tranquility',
          },
          {
            pui: 'USLAB000061',
            label: 'Destiny air coolant temp',
            hint: 'In weightlessness warm air does not rise: without forced ventilation, a bubble of carbon dioxide would form around each astronaut.',
            part: 'destiny',
          },
          {
            pui: 'USLAB000060',
            label: 'Destiny avionics coolant temp',
            hint: 'The temperature of Destiny’s moderate-temperature water loop, which nominally runs at 17 °C and takes most of the systems heat — the avionics and the payload racks. Water rather than ammonia, because a leak inside a habitable module must be harmless. This sensor is slow rather than dead: it sat still through a one-minute capture and resumed changing over five.',
            part: 'destiny',
          },
          {
            pui: 'NODE2000006',
            label: 'Harmony air coolant temp',
            hint: 'Harmony’s low-temperature water loop, designed like Destiny’s to run at 4 °C — cold enough that the air conditioner’s heat exchanger, which this loop feeds, condenses humidity out of the cabin air. Destiny, Harmony and Tranquility each have such a pair of loops, and a pair can be joined and run as one to spare a pump or ride out a failure.',
            part: 'harmony',
          },
          {
            pui: 'NODE2000007',
            label: 'Harmony avionics coolant temp',
            hint: 'Harmony’s moderate-temperature loop, the one Destiny runs at 17 °C. Harmony’s job includes converting and handing on power and cooling from the truss to the elements attached to it, and this loop’s heat goes the same way — through an interface heat exchanger into the external ammonia, and out through the radiators.',
            part: 'harmony',
          },
          {
            pui: 'NODE3000013',
            label: 'Tranquility air coolant temp',
            hint: 'Tranquility’s low-temperature loop, the cold one — designed for 4 °C in Destiny — so that the air conditioner it feeds can condense water out of the air. In Tranquility that condensate has only to cross the module to reach the water processor that turns it back into drinking water.',
            part: 'tranquility',
          },
          {
            pui: 'NODE3000012',
            label: 'Tranquility avionics coolant temp',
            hint: 'Tranquility’s moderate-temperature loop, the kind that nominally runs at 17 °C in Destiny. Two loops at two temperatures rather than one: NASA’s thermal overview gives the reasons as keeping the heat loads apart, simpler management, and redundancy when a pump fails — in which case the pair can be run as a single loop.',
            part: 'tranquility',
          },
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
          {
            pui: 'AIRLOCK000050',
            label: 'High-pressure O₂ valve',
            hint: 'Quest carries the station’s high-pressure oxygen and nitrogen in tanks mounted on its outside, and this valve is on the high-pressure oxygen line. The tanks are refilled from visiting cargo vehicles through the Nitrogen/Oxygen Recharge System. IN-TRANSIT is the valve caught between positions; FAILED means it did not reach the one commanded.',
            part: 'quest',
          },
          {
            pui: 'AIRLOCK000051',
            label: 'Low-pressure O₂ valve',
            hint: 'The second oxygen line out of Quest’s tanks, at a lower pressure than the first. Oxygen and nitrogen are the two gases the life-support system meters into the cabin to hold the partial pressures and the total pressure where they belong — O₂/N₂ control is one of its listed functions. The same four positions as the other valves.',
            part: 'quest',
          },
          {
            pui: 'AIRLOCK000052',
            label: 'Nitrogen supply valve',
            hint: 'Oxygen the station makes from water; nitrogen it cannot make, so the diluent comes up from Earth, is stored in the tanks on Quest’s hull and topped up from cargo vehicles through the recharge system. This valve is open when nitrogen is being let into the cabin to hold up the total pressure.',
            part: 'quest',
          },
          {
            pui: 'AIRLOCK000053',
            label: 'Airlock air conditioner',
            hint: 'Quest has an air conditioner of its own because it is a habitable module in its own right: the equipment lock stays at cabin conditions while the crew lock beyond the hatch is pumped down. The same states as the other units — ON is cooling and drying the air, DRAIN and DRYOUT are servicing of the heat exchanger.',
            part: 'quest',
          },
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
          {
            pui: 'S1000002',
            label: 'Loop A pump outlet pressure',
            hint: 'The pump module keeps the ammonia pressurised well above its vapour pressure so it stays liquid all the way round the loop; a bellows accumulator backed by nitrogen gas takes up its expansion and contraction as the heat load changes. Software stops the pump if this outlet pressure climbs too high.',
            part: 'radiator-stbd',
          },
          {
            pui: 'S1000003',
            label: 'Loop A pump outlet temp',
            hint: 'The pump’s control valve blends cold ammonia returning from the radiators with warm ammonia that bypassed them, holding the supply at a set point of 2.8 °C — just above the freezing point of the water it meets in the heat exchangers. An over-temperature at this sensor, about 18 °C, stops the pump.',
            part: 'radiator-stbd',
          },
        ],
      },
      {
        id: 'loop-b',
        label: 'External loop B',
        channels: [
          {
            pui: 'P1000001',
            label: 'Loop B flow rate',
            hint: 'The port loop. Its pump turns a little faster than loop A’s — 14,700 rpm against 14,000 — and moves about 4,000 kg of ammonia an hour. Each loop is rated to reject 35 kW, so if one fails the station carries on cooling at reduced capacity rather than none.',
            part: 'radiator-port',
          },
          {
            pui: 'P1000002',
            label: 'Loop B pump outlet pressure',
            hint: 'Same arrangement as loop A, on the port side: the pump module holds the ammonia under enough pressure to keep it liquid, and its accumulator works with the ammonia tank on the P1 truss to absorb volume changes and make up small losses. The two loops are routed apart so that one piece of debris cannot cut both.',
            part: 'radiator-port',
          },
          {
            pui: 'P1000003',
            label: 'Loop B pump outlet temp',
            hint: 'Held to the same 2.8 °C set point as loop A by mixing radiator return with bypass flow; when the loop is carrying too little heat to reach it, heaters on the bypass line make up the difference. Each loop serves up to five heat exchangers, spread across Destiny, Harmony and Tranquility.',
            part: 'radiator-port',
          },
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
          {
            pui: 'S0000002',
            label: 'Port TRRJ position',
            hint: 'The port radiator beam, on loop B. Unlike the solar alpha joints this one never goes round: ammonia crosses it through flexible hoses, so it swings within about ±105° of neutral at up to 45° a minute — edge-on to the Sun in daylight, face to the Earth in eclipse.',
            part: 'trrj-port',
          },
          {
            pui: 'S0000007',
            label: 'Loop A TRRJ mode',
            hint: 'Directed position means the joint is holding still; autotrack means it is chasing the best angle for rejecting heat; shutdown means the motor is disabled.',
            part: 'trrj-stbd',
          },
          {
            pui: 'S0000006',
            label: 'Loop B TRRJ mode',
            hint: 'The same vocabulary as loop A — directed position is holding still, autotrack is following the computed goal angle, shutdown is the motor off; standby, checkout, restart, blind and switchover are the remaining states the software can report. The two loops are independent by design, so this mode need not match the starboard one.',
            part: 'trrj-port',
          },
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
          {
            pui: 'NODE2000002',
            label: 'Harmony low-temp coolant',
            hint: 'Harmony’s heat exchangers cool more than Harmony: the node was launched with six of them so that Columbus and Kibo, berthed on its sides, could reject their heat through it. The figure is how full the loop’s accumulator is, as a percentage of its capacity.',
            part: 'harmony',
          },
          {
            pui: 'NODE2000001',
            label: 'Harmony moderate-temp coolant',
            hint: 'The moderate loop takes the avionics. In Destiny the low and moderate loops can be valved together and run as one — to spare a pump, to save its power, or to cover for one that has failed. The figure is the accumulator fill, as a percentage of its capacity.',
            part: 'harmony',
          },
          {
            pui: 'NODE3000017',
            label: 'Tranquility coolant 1',
            hint: 'Coolant 1 is Tranquility’s moderate-temperature loop. Node 3 houses the life-support racks — water recovery, oxygen generation, the toilet, the exercise machines — and its heat exchangers were connected to the external ammonia loops when the node arrived. The figure is the accumulator fill, in percent of capacity.',
            part: 'tranquility',
          },
          {
            pui: 'NODE3000019',
            label: 'Tranquility coolant 2',
            hint: 'Coolant 2 is Tranquility’s low-temperature loop, the colder of the two: in Destiny the equivalent loop is designed to run at 4 °C and cools the cabin air conditioner among other things. The figure is the accumulator fill, as a percentage of its capacity.',
            part: 'tranquility',
          },
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
          {
            pui: 'USLAB000005',
            label: 'CMGs online',
            hint: 'Four gyroscopes are fitted, all in the Z1 truss, and this count is the sum of the four flags below: when the stream was checked both read 4. The momentum capacity further down is that of the active set, so it falls when a gyroscope drops out.',
            part: 'truss-z1',
            holds: true,
          },
          {
            pui: 'USLAB000001',
            label: 'CMG-1 online',
            hint: 'IN USE means this gyroscope’s stored momentum is part of the set the controller steers with. A wheel in use must be spinning, so the verification run pairs each flag with the wheel speed below it and warns when they disagree.',
            part: 'truss-z1',
          },
          {
            pui: 'USLAB000002',
            label: 'CMG-2 online',
            hint: 'The second of four. Each carries a 98 kg flywheel at 6,600 rpm, and NOT IN USE removes it from the set the controller steers with; the verification expects that flag to go with a stopped wheel, and IN USE with one at speed.',
            part: 'truss-z1',
          },
          {
            pui: 'USLAB000003',
            label: 'CMG-3 online',
            hint: 'The third of four. The Reference Guide calls the gyroscopes the preferred method of attitude control because they run on electricity from the arrays; when too few are in use to provide the momentum needed, the Russian segment’s thrusters take over.',
            part: 'truss-z1',
          },
          {
            pui: 'USLAB000004',
            label: 'CMG-4 online',
            hint: 'The fourth of four. The operational gyroscopes sit inside the Z1 truss and are not visible from outside, which is why these channels attach to Z1 in the twin; the two CMGs modelled on the ELC platforms are stowed spares, not this one.',
            part: 'truss-z1',
          },
          {
            pui: 'Z1000009',
            label: 'CMG-1 wheel speed',
            hint: 'The flywheel spins continuously at about 6,600 rpm; it is the tilt of its axis, not its speed, that steers the station.',
            part: 'truss-z1',
          },
          {
            pui: 'Z1000010',
            label: 'CMG-2 wheel speed',
            hint: 'All four wheels read 6,600 to 6,601 rpm when the stream was verified, their documented nominal speed. A wheel that is online must be spinning, so this reading is checked against the CMG-2 online flag above.',
            part: 'truss-z1',
          },
          {
            pui: 'Z1000011',
            label: 'CMG-3 wheel speed',
            hint: 'The 98 kg flywheel stores its angular momentum by spinning fast, and the speed is held constant: steering comes from the gimbals that tilt the wheel’s axis, not from speeding it up or slowing it down.',
            part: 'truss-z1',
          },
          {
            pui: 'Z1000012',
            label: 'CMG-4 wheel speed',
            hint: 'Because the speed is meant to be constant, a wheel far below 6,600 rpm is spinning down and out of service, not steering harder. The verification treats anything under 6,000 rpm as a stopped wheel and expects its online flag to say NOT IN USE.',
            part: 'truss-z1',
          },
          {
            pui: 'Z1000001',
            label: 'CMG-1 vibration',
            hint: 'Read in g, fractions of Earth’s gravity. A 98 kg flywheel turning at 6,600 rpm would be felt through the Z1 truss if it ran rough, and the Reference Guide counts smooth control among the reasons the gyroscopes are preferred to thrusters on a station kept for microgravity.',
            part: 'truss-z1',
          },
          {
            pui: 'Z1000002',
            label: 'CMG-2 vibration',
            hint: 'The four vibration sensors are alike, so compare this one with its three neighbours rather than against a limit: none of the documents this site cites publishes a vibration threshold for a CMG.',
            part: 'truss-z1',
          },
          {
            pui: 'Z1000003',
            label: 'CMG-3 vibration',
            hint: 'Vibration is health telemetry for the ground; a gyroscope is taken out of the control set through its online flag, not by this reading. Should one need replacing, two spare CMGs are stowed outside on the ELC platforms.',
            part: 'truss-z1',
          },
          {
            pui: 'Z1000004',
            label: 'CMG-4 vibration',
            hint: 'Each of the four is a separate unit with its own vibration sensor, mounted together in the Z1 truss. The Mimic telemetry guide describes readings like this one as the detailed health status of each of the four CMGs, which is why they are published at all.',
            part: 'truss-z1',
          },
          {
            pui: 'USLAB000045',
            label: 'CMG-1 spin motor temp',
            hint: 'The bearing the 98 kg flywheel turns on, at 6,600 rpm without pause while the gyroscope is in use. The catalogue files the unit as Fahrenheit, but its own description says degrees Celsius, and Celsius is what is shown.',
            part: 'truss-z1',
          },
          {
            pui: 'USLAB000046',
            label: 'CMG-2 spin motor temp',
            hint: 'The second gyroscope’s spin bearing. The spin motor it names is what the arrays’ electricity feeds, which is the Reference Guide’s point about the CMGs: they hold the station’s attitude on power the station makes, not on propellant it must have delivered.',
            part: 'truss-z1',
          },
          {
            pui: 'USLAB000047',
            label: 'CMG-3 spin motor temp',
            hint: 'The third gyroscope’s spin bearing. Temp1 in its name is the motor end: the catalogue lists a second bearing temperature per CMG, at the Hall resolver end, which this site does not subscribe to. With the online flag, wheel speed and vibration beside it, it is the detailed health status the Mimic guide describes.',
            part: 'truss-z1',
          },
          {
            pui: 'USLAB000048',
            label: 'CMG-4 spin motor temp',
            hint: 'The fourth gyroscope’s spin bearing. It is a temperature in degrees Celsius despite the catalogue’s Fahrenheit tag, like the other three; the value is never converted here, only its label corrected.',
            part: 'truss-z1',
          },
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
          {
            pui: 'USLAB000009',
            label: 'Active CMG momentum',
            hint: 'The momentum the active gyroscope set is holding at this moment, in newton-metre-seconds. Divided by the capacity below, it gives the saturation percentage: when the stream was checked, 14.36 % published against 14.36 % computed. The catalogue’s ft·lb·s tag is wrong; the description says N·m·s.',
          },
          {
            pui: 'USLAB000038',
            label: 'CMG momentum capacity',
            hint: 'The ceiling the saturation percentage is measured against. The Reference Guide notes the gyroscopes are limited in the momentum they can hold; when they can no longer provide what is needed, the Russian thrusters take over. It is the capacity of the active set, so it depends on how many are online.',
          },
          {
            pui: 'USLAB000011',
            label: 'Desaturation request',
            hint: 'Whether the US controller may ask for a thruster firing to unload the gyroscopes. ENABLED lets the request go out when the stored momentum needs resetting; INHIBITED blocks it, and the gyroscopes are left to hold what they have accumulated.',
          },
          {
            pui: 'USLAB000006',
            label: 'Control torque — roll',
            hint: 'The torque the controller asks the gyroscopes to apply about the station’s long axis, the body X axis that in normal flight lies along the direction of travel. It is produced by tilting the flywheels, not by changing their speed. The catalogue labels it ft·lb; the description says N·m.',
          },
          {
            pui: 'USLAB000007',
            label: 'Control torque — pitch',
            hint: 'The torque asked for about the body Y axis, which runs along the truss. It stays small when the station sits at the attitude where the natural torques balance, which is why the gyroscopes have little to fight. It updates every two seconds, like the rest of this section.',
          },
          {
            pui: 'USLAB000008',
            label: 'Control torque — yaw',
            hint: 'The torque asked for about the body Z axis, the one that points at the ground in the usual XVV ZNADIR attitude. Roll, pitch and yaw here are the three body axes in turn; the ops name says so, InBody X, Y and Z.',
          },
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
          {
            pui: 'USLAB000016',
            label: 'Attitude controller type',
            hint: 'ATTITUDE HOLD keeps a commanded orientation whatever it costs the gyroscopes. TEA, the torque equilibrium attitude, lets the station settle where the natural torques balance, so the gyroscopes have less to fight and store momentum more slowly.',
          },
          {
            pui: 'USLAB000017',
            label: 'Attitude reference frame',
            hint: 'LVLH is the frame that turns with the orbit, belly to Earth and nose forward, and the errors below are measured in it. Inertial holds the station fixed against the stars instead. XPOP keeps the long axis perpendicular to the orbit plane, an attitude flown in the early years because it kept the P6 arrays facing the Sun all the way round.',
          },
          {
            pui: 'USLAB000081',
            label: 'Attitude manoeuvre in progress',
            hint: 'TRUE while the station is being turned from one attitude to another rather than holding one. The Reference Guide gives the docking of visiting vehicles and debris avoidance as reasons for a manoeuvre; the errors and control torques above move while it is set.',
          },
          {
            pui: 'USLAB000022',
            label: 'Roll error',
            hint: 'Zero on all three axes means the station is flying exactly along its velocity vector. It normally holds an attitude that minimises natural torques, so the gyroscopes have little to fight.',
          },
          {
            pui: 'USLAB000023',
            label: 'Pitch error',
            hint: 'The angle about the truss axis between where the station points and where the controller wants it: nose up or down of the target. The catalogue files it in radians, but the description says degrees, and degrees is what is shown.',
          },
          {
            pui: 'USLAB000024',
            label: 'Yaw error',
            hint: 'The angle about the vertical axis between the attitude held and the one commanded: nose left or right of the target. The three errors are what the three control torques above answer, and all of them update every two seconds.',
          },
          {
            pui: 'USLAB000025',
            label: 'Inertial rate X',
            hint: 'How fast the station is turning about its long axis against the stars, measured by the rate gyros on the S0 truss. In the usual Earth-facing attitude this one should sit near zero: only the pitch axis carries the once-per-orbit turn.',
          },
          {
            pui: 'USLAB000026',
            label: 'Inertial rate Y',
            hint: 'The rate about the truss axis, and the one that is not zero: a station that keeps its belly to Earth turns once per orbit against the stars, 360° in about 93 minutes, which is 3.87° a minute or about 0.065°/s in the unit shown.',
          },
          {
            pui: 'USLAB000027',
            label: 'Inertial rate Z',
            hint: 'The rate about the vertical axis. The catalogue tags all three rates rad/s, but the description says degrees per second, which is what is shown; like the errors above, the three rates update every two seconds.',
          },
          {
            pui: 'USLAB000018',
            label: 'LVLH quaternion q0',
            hint: 'Four numbers that describe one rotation, from the orbit-following LVLH frame to the station’s body axes, and mean nothing apart. Their squares must sum to one, which tests four sensors at once: on the live stream the norm came to 1.000000.',
          },
          {
            pui: 'USLAB000019',
            label: 'LVLH quaternion q1',
            hint: 'The second component. The site does not plot the quaternion, on purpose: one component alone is not a curve anyone can read, and together the four are an attitude, which the roll, pitch and yaw errors already show in degrees.',
          },
          {
            pui: 'USLAB000020',
            label: 'LVLH quaternion q2',
            hint: 'The third component. LVLH is the frame in which the belly points at Earth and the nose along the direction of travel, so the quaternion says how far the body axes are turned from that ideal, and normally not far.',
          },
          {
            pui: 'USLAB000021',
            label: 'LVLH quaternion q3',
            hint: 'The last of the four. Read with the other three it fixes the station’s orientation in the frame that turns with the orbit; it is refreshed with the rest of the attitude data, every two seconds.',
          },
        ],
      },
      {
        id: 'state-vector',
        label: 'State vector and mass',
        channels: [
          {
            pui: 'USLAB000039',
            label: 'Total station mass',
            neverZero: true,
            hint: 'The station itself is about 420 tonnes; the published figure includes every docked vehicle and its propellant, so it runs higher. It has to stay accurate — the thrusters need it to control the station’s orientation. Check its age: this one is updated only occasionally.',
          },
          {
            pui: 'USLAB000032',
            label: 'J2000 position X',
            hint: 'One of three coordinates in J2000, an inertial frame pinned to the stars at the start of the year 2000. The three together give the distance from Earth’s centre: 6,790.5 km when the stream was checked, 0.07 km from what Celestrak’s orbital elements gave for the same moment.',
          },
          {
            pui: 'USLAB000033',
            label: 'J2000 position Y',
            hint: 'The second coordinate. The catalogue lists the unit as feet, but the description says kilometres and the values are kilometres: a radius near 6,790 km is the station’s orbit, and the same numbers in feet would put it inside the Earth.',
          },
          {
            pui: 'USLAB000034',
            label: 'J2000 position Z',
            hint: 'The third coordinate, along Earth’s polar axis as it stood in 2000. It swings between north and south every orbit, and because the orbit is inclined 51.6° it never reaches the full radius: the station never flies over the poles.',
          },
          {
            pui: 'USLAB000035',
            label: 'J2000 velocity X',
            hint: 'One of three components of the station’s velocity in the J2000 frame. Together they came to 7,662.2 m/s when checked, within 0.07 m/s of an independent propagation from Celestrak, and the speed and radius satisfy the vis-viva equation to 3.3 m/s.',
          },
          {
            pui: 'USLAB000036',
            label: 'J2000 velocity Y',
            hint: 'The second velocity component. The catalogue tags it feet per second; the description says metres per second, which is what is shown. The Reference Guide gives the same speed as 28,000 kilometres per hour.',
          },
          {
            pui: 'USLAB000037',
            label: 'J2000 velocity Z',
            hint: 'The third velocity component, along the polar axis. Position and velocity together are the state vector, which the station propagates itself; the site does not plot the six components because the orbit panel already presents them as a position and a speed.',
          },
          {
            pui: 'USLAB000043',
            label: 'GPS 1 status',
            hint: 'DOING POSITION FIXES is the healthy state: the receiver, in the US Lab with its antennas on the S0 truss, is fixing the station’s position. The other states are degradations, from timing-only modes to too few usable satellites (SV) to a fix the receiver will not trust.',
          },
          {
            pui: 'USLAB000044',
            label: 'GPS 2 status',
            hint: 'The second receiver; the Reference Guide lists GPS receivers, plural, in the US Lab. SV in several states is a GPS space vehicle, and the ONLY 1, 2 or 3 USABLE SVs states say how many the receiver can hear, fewer than a position fix needs.',
          },
        ],
      },
      {
        id: 'alarms',
        label: 'Alarms',
        channels: [
          {
            pui: 'USLAB000041',
            label: 'Loss of CMG attitude control',
            hint: 'TRUE means the gyroscopes have stopped holding the attitude, and control passes to the Russian thrusters, the fallback the Reference Guide describes for when the CMGs can no longer provide what is needed. It is filed as a caution where the alarm beside it is a warning, and latched: it stays raised until cleared.',
          },
          {
            pui: 'USLAB000042',
            label: 'Loss of ISS attitude control',
            hint: 'The graver of the two: the station as a whole, not just the gyroscope set, is no longer holding its orientation. The catalogue’s own name for it ends in Warning where the CMG alarm is a Caution. FALSE is the normal state, and it decoded to a known state when the stream was verified.',
          },
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
          {
            pui: 'S1000005',
            label: 'RFG 1 elevation',
            hint: 'Up and down, where azimuth is left and right; between them the two gimbals hold the starboard dish on whichever relay satellite is in view. This link outranks Ku-band: it carries the critical commands and telemetry, while the Ku dish carries the non-critical data and the video.',
            part: 'antenna-sasa-2',
          },
          {
            pui: 'S1000009',
            label: 'RFG 1 power',
            hint: 'Read at the remote power controller that feeds the group, not from the radio itself: Off-Ok means the switch is open, Not-Off Ok that it is closed and healthy, Not-Off Failed that it is closed but reporting a fault. Two groups exist and typically only one is active at a time.',
            part: 'antenna-sasa-2',
          },
          {
            pui: 'P1000004',
            label: 'RFG 2 azimuth',
            hint: 'Left and right for the port group, on the P1 truss. The catalogue never says which antenna each group drives; the side was settled from the symbol names, S1 against P1, and from where the two antennas sit in NASA’s own model of the station.',
            part: 'antenna-sasa-3',
          },
          {
            pui: 'P1000005',
            label: 'RFG 2 elevation',
            hint: 'Up and down for the port dish, the twin of the starboard reading. Typically only one of the two groups is carrying the traffic at a time and the other is the spare; the angles alone do not say which, so read them alongside the active S-band string below.',
            part: 'antenna-sasa-3',
          },
          {
            pui: 'P1000007',
            label: 'RFG 2 power',
            hint: 'The same switch reading for the port group, from a power controller on the P1 truss — the symbol name carries the segment. An old timestamp on it dates the last time the state changed, not the last time it was checked: a group reading Not-Off Ok for weeks is a group that has stayed on.',
            part: 'antenna-sasa-3',
          },
          {
            pui: 'USLAB000092',
            label: 'Active S-band string',
            hint: 'The station keeps two complete S-band chains — baseband signal processor, transponder, radio frequency group — and this names the one carrying the traffic. It is an identifier, not a measurement: the timestamp dates the last swap, and an old one means the string has not had to change.',
            holds: true,
          },
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
          {
            pui: 'Z1000015',
            label: 'SGANT cross-elevation',
            hint: 'The dish’s second axis, swung across the line of elevation; the two together keep it on a relay satellite. The catalogue leaves the unit blank, so the application shows degrees because the elevation axis of the same dish is published in degrees.',
            part: 'antenna-ku',
          },
          {
            pui: 'USLAB000088',
            label: 'Video downlink 1',
            hint: 'Ku-band carries several video channels to the ground at once, and this is the first of the four the station reports. Active means a picture is going down it now — a camera view, an experiment feed or video from a crew member outside on a spacewalk — and Inactive that the channel is idle.',
          },
          {
            pui: 'USLAB000089',
            label: 'Video downlink 2',
            hint: 'The second of four. Each channel reports its own activity, so several can be Active at once — one carrying a live event, another an experiment’s camera — and the count of busy channels is a rough measure of how much picture is leaving the station.',
          },
          {
            pui: 'USLAB000090',
            label: 'Video downlink 3',
            hint: 'The third of four. Mission Control and NASA TV are at the far end: the live views of Earth and of the crew that the public sees come down these channels, through the relay satellite the Ku dish is aimed at rather than straight to the ground.',
          },
          {
            pui: 'USLAB000091',
            label: 'Video downlink 4',
            hint: 'The last of the four. The same Ku-band link also carries the crew’s internet access and file exchange, and the experiments’ own data, so a channel reading Active is only one part of what is passing through the dish.',
          },
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
          {
            pui: 'USLAB000100',
            label: 'UHF radio 2',
            hint: 'The second space-to-space radio. The two are fed from different power controllers — LA1B against LAD52B in the symbol names — so the pair does not hang on one switch, and the reading here is that switch’s, not the radio’s: Off-Ok is the switch open, Not-Off Ok closed and healthy, Not-Off Failed closed but reporting a fault.',
          },
          {
            pui: 'USLAB000101',
            label: 'UHF frame sync lock',
            hint: 'Locked when receiver and transmitter are talking to each other properly.',
          },
          {
            pui: 'USLAB000093',
            label: 'Internal audio controller 1',
            hint: 'The station’s voice switchboard: it routes audio between the crew, the S-band link to the ground and the UHF link to a spacewalker, which is how Mission Control hears a crew member outside. Two controllers are kept; one is Active and the other stands by as Backup, and a swap between them shows here.',
          },
          {
            pui: 'USLAB000094',
            label: 'Internal audio controller 2',
            hint: 'The second audio controller, the twin of the first. Read it against controller 1: the two are a pair, and whichever is not Active is the Backup. Like every enumerated state its timestamp dates the last change, so an old one means the roles have not swapped for that long.',
          },
        ],
      },
    ],
  },

  {
    id: 'cdh',
    label: 'Command & data',
    tagline:
      'Around fifty redundant computers run the station, in three tiers. The top tier is two-fault tolerant: three identical command-and-control machines, one hot, one warm backup processing data without commanding, and one cold.',
    // The catalogue's 'N/A' is left out: it is the placeholder its filter list ends with, not a
    // console, and it was being printed as one — "monitored by the ODIN, ODIN/VVO, CDH, N/A
    // consoles" — on the page and in the rail alike.
    disciplines: ['ODIN', 'ODIN/VVO', 'CDH'],
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
          {
            pui: 'USLAB000087',
            label: 'Crew laptops connected',
            hint: 'The Portable Computer System laptops are how the crew command the station: each plugs into a data bus through a receptacle and talks to the command-and-control computer directly, at most one command a second. The architecture paper allows up to eight of them on the control buses under that computer.',
            holds: true,
          },
          {
            pui: 'USLAB000082',
            label: 'Standard commands received',
            hint: 'Every command the command-and-control computer accepts adds one, whether it came from a crew laptop or from Houston over S-band. The count changes only when a command arrives, so an old timestamp here dates the last command, not a stalled sensor; it sat still through a five-minute capture.',
            holds: true,
          },
          {
            pui: 'USLAB000083',
            label: 'Data load commands received',
            hint: 'A second tally, kept apart from the standard commands. The architecture paper lists a data load as a transaction of its own, distinct from a standard command, and describes what the ground uploads to this computer besides commands: files that reconfigure its telemetry tables, sent over S-band. Like the other count, it moves only when one arrives.',
            holds: true,
          },
          {
            pui: 'USLAB000084',
            label: 'Onboard time (coarse)',
            hint: 'The station’s own clock as the command-and-control computer keeps it. Every reading on this site is dated by the station’s clock rather than by when the packet arrived: the age beside a value is the station’s, so a sensor that stopped weeks ago reads as stopped however recently the stream re-sent it.',
          },
          {
            pui: 'USLAB000085',
            label: 'Onboard time (fine)',
            hint: 'Read with the coarse count above, it gives the computer’s time. On each data bus one computer is the controller and broadcasts a time-synchronisation message at the start of every 100 ms processing frame; the others set their clocks to it and correct for the message’s travel time down the bus.',
          },
        ],
      },
      {
        id: 'time',
        label: 'Time',
        channels: [
          {
            pui: 'TIME_000001',
            // Three letters because the value beside it is the widest in this subsystem: the day
            // of the year, the date and the clock. `Onboard GMT` cost 57 px the date needed.
            label: 'GMT',
            hint: 'The station runs on Greenwich time — the compromise between Houston and Moscow. It counts days from 1 January, so day 243 is 31 August; the year comes from a second reading, TIME_000002.',
          },
          /*
           * The year is read and not shown.
           *
           * It had a row of its own, and in thirty seconds of listening it sent exactly one
           * update — the subscription snapshot. A constant does not earn a line in a strip where
           * the line is the scarce thing. But the clock beside it names a day of the year, which
           * is ambiguous without it, so the value is still subscribed and now reads inside that
           * clock: `Day 243 · 31 Aug 2026 · 13:41`.
           */
          { pui: 'TIME_000002', label: 'Year', hidden: true, holds: true },
        ],
      },
      {
        id: 'computers',
        label: 'Computers',
        channels: [
          {
            pui: 'USLAB000066',
            label: 'C&C MDM 1',
            hint: 'One of three identical command-and-control computers in Destiny: the hot one commands, the warm one processes the same data without placing commands on the bus, and the third is powered off. The status is read at the remote power controller feeding the machine, so Off-Ok is the cold spare, not a failure; only Not-Off Failed reports a fault.',
            part: 'destiny',
          },
          {
            pui: 'USLAB000067',
            label: 'C&C MDM 2',
            hint: 'The second of the trio. A 2002 architecture paper gives these computers an Intel 386SX at 32 MHz with 8 MB of RAM, and remarks that the next crew laptops would be far more capable than the machines they command; some have since had the EPIC processor upgrade the 2015 reference guide describes.',
            part: 'destiny',
          },
          {
            pui: 'USLAB000068',
            label: 'C&C MDM 3',
            hint: 'The third of the trio, which is what makes the top tier two-fault tolerant: two of the three can fail before the station loses command. The tiers below generally settle for a pair, one hot and one powered off.',
            part: 'destiny',
          },
          {
            pui: 'USLAB000073',
            label: 'GNC MDM 1',
            hint: 'One of the two local-tier computers that host the guidance, navigation and control software. Commands from the command-and-control computer pass through it on the way down to the gyroscopes and sensors, and their telemetry climbs back the same way.',
            part: 'destiny',
          },
          {
            pui: 'USLAB000074',
            label: 'GNC MDM 2',
            hint: 'The other half of the GNC pair, one-fault tolerant rather than two: in the local tier one machine is hot and the other is powered off, so a healthy pair reads one Not-Off Ok and one Off-Ok.',
            part: 'destiny',
          },
          {
            pui: 'USLAB000069',
            label: 'Internal control zone 1',
            hint: 'One of the two computers of the local tier that the catalogue names the internal control zone, as against the external one on the truss. Its status is the state of the remote power controller feeding it, the switch named in its nomenclature, rather than a word from the computer itself.',
            part: 'destiny',
          },
          {
            pui: 'USLAB000070',
            label: 'Internal control zone 2',
            hint: 'The other internal control zone computer, normally the reverse of its twin above: whichever is hot reads Not-Off Ok and the powered-off spare Off-Ok. Being a state rather than a measurement, its timestamp dates the last time that changed.',
            part: 'destiny',
          },
          {
            pui: 'S0000010',
            label: 'External control zone 1',
            hint: 'One of the two external control zone computers, mounted outside on the S0 truss rather than inside Destiny. The architecture paper notes that a computer outside is exposed to micrometeoroid strikes and slightly more prone to radiation-induced upsets than one in a module; one of the pair is hot, the other powered off.',
            part: 'truss-s0',
          },
          {
            pui: 'S0000012',
            label: 'External control zone 2',
            hint: 'The other external computer on S0. Like every entry in this list its status is read at the remote power controller feeding it: Off-Ok is a switch open on a healthy spare, Not-Off Ok a powered machine, Not-Off Failed a powered one reporting a fault.',
            part: 'truss-s0',
          },
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

/** Symbols where a zero is the broadcast dropping out. See `Channel.neverZero`. */
export const NEVER_ZERO_PUIS: ReadonlySet<string> = new Set(
  ALL_CHANNELS.filter((channel) => channel.neverZero).map((channel) => channel.pui),
)

/**
 * True where this reading is the dropout rather than a value.
 *
 * Read at the door, in telemetry/client, so a dropout reaches neither the panel nor the plot: a
 * zero in the history would draw a spike through a chart of cabin pressure and stay there. What
 * the reader sees instead is the previous value going on ageing, which is exactly what happened.
 */
export function isZeroDropout(pui: string, value: string | null): boolean {
  return NEVER_ZERO_PUIS.has(pui) && Number.parseFloat(value ?? '') === 0
}

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
