import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: {
    // satellite.js embeds a WebAssembly module whose worker uses top-level `await`. The default
    // iife format cannot compile that; the ES format can.
    format: 'es',
  },
  build: {
    /*
     * The default 500 kB warning is raised rather than obeyed.
     *
     * It fires on the Station view's chunk, which is 595 kB and cannot honestly be made smaller:
     * see the note below for the measurements. A warning nobody can act on is noise that hides the
     * ones that matter, so the threshold sits just above the chunk it was flagging — and will fire
     * again if that chunk grows by another sixth.
     */
    chunkSizeWarningLimit: 620,
    rolldownOptions: {
      output: {
        // Split the dependencies away from the application code.
        //
        // This does not make the first load smaller — both views need three.js, so there is no
        // honest way to defer it. What it changes is every load after a deploy: the application
        // code is a few tens of kilobytes and changes constantly, while three, React and the
        // Lightstreamer client are megabytes and change almost never. In one chunk, editing a
        // label invalidated all of it. Split, the vendor chunks keep their content hash and stay
        // in cache, which is what makes the `immutable` header on /assets/* worth setting.
        // three and @react-three are absent from this list, and naming them would not help.
        //
        // Measured, not assumed: a group named for `node_modules/three` emits **no chunk at all**.
        // `advancedChunks` only reaches modules in the static graph, and three is reachable solely
        // through the Station view's dynamic import, so the rule matches nothing. Tried with
        // `minSize: 0` and `minShareCount: 1`, and under an unmistakable name to be sure the output
        // was not being confused with `three.core`, which is three's own module split and not a
        // chunk this file creates.
        //
        // Which is the right outcome anyway. The 595 kB Station chunk is 39 % three and 38 %
        // react-three/fiber, attributed from its source map, and the view cannot draw a frame
        // without either. Nothing in it is deferrable; it is already deferred as a whole, and the
        // map view never fetches it — confirmed in the emitted `index.html`, whose modulepreloads
        // are react, lightstreamer, orbit, selection and atlas, with no three and no Station view.
        //
        // The same trap caught the glTF and Draco loaders earlier, where a `three` rule matching
        // `three/examples` reduced the emitted loader chunk to a 0.06 kB stub.
        // `advancedChunks` until rolldown renamed it; the schema is unchanged, and the emitted
        // chunks were compared name by name across the rename to be sure of that.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'lightstreamer', test: /node_modules[\\/]lightstreamer-client-web[\\/]/ },
            { name: 'orbit', test: /node_modules[\\/]satellite\.js[\\/]/ },
            // Coastlines and country outlines: 160 kB of JSON compiled into the bundle, cacheable
            // independently of everything else since they never change.
            { name: 'atlas', test: /node_modules[\\/](world-atlas|topojson-client)[\\/]/ },
          ],
        },
      },
    },
  },
})
