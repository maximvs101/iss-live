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
        // three and @react-three are deliberately absent from this list.
        //
        // They belong only to the Station view, which is imported dynamically, and naming them
        // here defeats that entirely: a named group becomes a static chunk, Vite adds a
        // `modulepreload` for it, and the browser fetches 257 kB of 3D engine before the map —
        // which has no use for any of it — has finished drawing. Left unnamed, they land inside
        // the Station view's own dynamic chunk and are fetched when it is opened.
        //
        // The same trap caught the glTF and Draco loaders earlier, where a `three` rule matching
        // `three/examples` reduced the emitted loader chunk to a 0.06 kB stub.
        advancedChunks: {
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
