/**
 * Which channels are worth a time plot.
 *
 * Not every parameter deserves one, and offering all 163 would be worse than offering none: the
 * list would be unreadable, and most of it would draw a flat line. Three things disqualify a
 * channel, and all three were **measured** rather than assumed — `npm run verify:plottable` opens
 * a real session, watches every channel for five minutes and counts how many distinct values each
 * one produced.
 *
 *  1. **Enumerated states.** A mode or an on/off flag is a step function; the value display already
 *     says what it is, and a plot of it says nothing more.
 *  2. **Channels that never move.** Twenty-seven numeric channels produced a single value in five
 *     minutes. Some are genuinely constant, but most are stalled sensors re-sending an old
 *     reading: the eight array drive currents sit at exactly zero and carry no timestamp at all,
 *     and the partial pressures, cabin pressure and station mass are weeks stale. Plotting them
 *     would draw a confident horizontal line through data nobody is producing.
 *  3. **Clocks.** `TIME_000001` and the onboard time counters change constantly and mean nothing
 *     as a curve.
 *
 * What is left is what an operator would actually put on a strip chart. Command & data handling
 * ends up with nothing at all, which is the honest answer for a subsystem whose only moving
 * numbers are a clock and two command counters that did not move.
 *
 * The counts in the comments below are distinct values seen in one five-minute capture on
 * 30/07/2026. They are evidence for the choice, not a contract — the check script re-measures.
 */
import type { SubsystemId } from './subsystems'

export const PLOTTABLE: Record<SubsystemId, string[]> = {
  /**
   * The joints tell the story here. Both SARJs turn a full revolution per orbit and update every
   * two seconds (151 distinct values), so an hour of history draws the sawtooth directly. Array
   * voltage is the one production channel that survives: it moves about 5 % as the station passes
   * in and out of eclipse, while every drive *current* is frozen at zero.
   *
   * The **eight BGA angles** move too, and are still left out: eight near-identical entries would
   * be most of this menu, they tell the same Sun-tracking story the SARJ tells in one trace, and
   * the Station view already animates them from the same data. The **commanded** port SARJ angle
   * is out for a related reason — it tracks the measured one so closely that the two draw as a
   * single line.
   */
  eps: [
    'S0000003', // Starboard SARJ angle — 151 distinct
    'S0000004', // Port SARJ angle — 151
    'S4000001', // Array 1A drive voltage — 7, 5.0 % spread
    'P4000001', // Array 2A drive voltage — 8, 5.4 %
    'USLAB000040', // Solar beta angle — slow, but it is the number that governs power and heat
  ],

  /**
   * Thin, and honestly so. The atmosphere sensors are exactly what one would want to plot, and
   * every one of them is stalled — the Destiny and Tranquility partial pressures have not produced
   * a new reading in weeks. What is left moves slowly but is real: tank levels and cabin
   * temperatures step a few times an hour.
   */
  eclss: [
    'NODE3000009', // Potable water tank — 3 distinct
    'NODE3000008', // Waste water tank — 6
    'USLAB000059', // Cabin temperature — 2
    'USLAB000061', // Destiny air coolant temp — 2
    'NODE2000006', // Harmony air coolant temp — 7
  ],

  /** Both external loops, in the three quantities that describe a pump: temperature, flow, pressure. */
  tcs: [
    'S1000003', // Loop A pump outlet temp — 3 distinct
    'P1000003', // Loop B pump outlet temp — 4
    'S1000001', // Loop A flow rate — 4
    'P1000001', // Loop B flow rate — 2
    'S1000002', // Loop A pump outlet pressure — 3
    'P1000002', // Loop B pump outlet pressure — 6
  ],

  /**
   * The richest subsystem by far: everything here updates every two seconds. Momentum saturation
   * is the classic one — it climbs as the CMGs absorb torque and drops when they are desaturated.
   *
   * Left out although they move just as much: the four **LVLH quaternion** components, which are
   * four numbers that mean nothing apart and an attitude when taken together; and the six
   * **J2000 state vector** components, which the orbit panel already presents as a position and a
   * speed.
   */
  gnc: [
    'USLAB000010', // CMG momentum saturation — 151 distinct
    'USLAB000009', // Active CMG momentum — 151
    'USLAB000022', // Roll error — 151
    'USLAB000023', // Pitch error — 151
    'USLAB000024', // Yaw error — 151
    'USLAB000025', // Inertial rate X — 151
    'USLAB000026', // Inertial rate Y — 151
    'USLAB000027', // Inertial rate Z — 151
    'USLAB000006', // Control torque, roll — 151
    'USLAB000007', // Control torque, pitch — 151
    'USLAB000008', // Control torque, yaw — 151
  ],

  /**
   * Antenna pointing, which is the one thing in comms that is continuous. The Ku-band dish sweeps
   * to follow a relay satellite and back again — 150 distinct elevations in five minutes, a 45 %
   * swing — and the two S-band gimbals do the same more slowly.
   */
  comms: [
    'Z1000014', // SGANT elevation — 150 distinct, 45 % swing
    'Z1000015', // SGANT cross-elevation — 69
    'S1000004', // RFG 1 azimuth — 46
    'S1000005', // RFG 1 elevation — 91
    'P1000004', // RFG 2 azimuth — 48
    'P1000005', // RFG 2 elevation — 91
  ],

  /**
   * Nothing. Every channel here is either an enumerated state, a clock, or a command counter that
   * has not moved. An empty plot with an explanation is more use than a plot of the time.
   */
  cdh: [],
}

/** The channel plotted first when a subsystem is opened. */
export function defaultPlot(subsystem: SubsystemId): string | null {
  return PLOTTABLE[subsystem][0] ?? null
}
