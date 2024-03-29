import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill"
import { NodeModulesPolyfillPlugin } from '@esbuild-plugins/node-modules-polyfill'
import rollupNodePolyFill from 'rollup-plugin-polyfill-node'; // "rollup-plugin-polyfill-node": "^0.10.2"


// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    // define: {
    //     'process.env': {}
    // },
    // optimizeDeps: { // https://issuehint.com/issue/vitejs/vite/9462
    //     esbuildOptions: {
    //         target: 'esnext',
    //     },
    // },
    // define: {
    //     // By default, Vite doesn't include shims for NodeJS/
    //     // necessary for segment analytics lib to work
    //     global: {},
    // },
    // resolve: {
    //     alias: {
    //         // This Rollup aliases are extracted from @esbuild-plugins/node-modules-polyfill, 
    //         // see https://github.com/remorses/esbuild-plugins/blob/master/node-modules-polyfill/src/polyfills.ts
    //         // process and buffer are excluded because already managed
    //         // by node-globals-polyfill
    //         util: 'rollup-plugin-node-polyfills/polyfills/util',
    //         sys: 'util',
    //         events: 'rollup-plugin-node-polyfills/polyfills/events',
    //         stream: 'rollup-plugin-node-polyfills/polyfills/stream',
    //         path: 'rollup-plugin-node-polyfills/polyfills/path',
    //         querystring: 'rollup-plugin-node-polyfills/polyfills/qs',
    //         punycode: 'rollup-plugin-node-polyfills/polyfills/punycode',
    //         url: 'rollup-plugin-node-polyfills/polyfills/url',
    //         // string_decoder:
    //         //     'rollup-plugin-node-polyfills/polyfills/string-decoder',
    //         http: 'rollup-plugin-node-polyfills/polyfills/http',
    //         https: 'rollup-plugin-node-polyfills/polyfills/http',
    //         os: 'rollup-plugin-node-polyfills/polyfills/os',
    //         assert: 'rollup-plugin-node-polyfills/polyfills/assert',
    //         constants: 'rollup-plugin-node-polyfills/polyfills/constants',
    //         _stream_duplex:
    //             'rollup-plugin-node-polyfills/polyfills/readable-stream/duplex',
    //         _stream_passthrough:
    //             'rollup-plugin-node-polyfills/polyfills/readable-stream/passthrough',
    //         _stream_readable:
    //             'rollup-plugin-node-polyfills/polyfills/readable-stream/readable',
    //         _stream_writable:
    //             'rollup-plugin-node-polyfills/polyfills/readable-stream/writable',
    //         _stream_transform:
    //             'rollup-plugin-node-polyfills/polyfills/readable-stream/transform',
    //         timers: 'rollup-plugin-node-polyfills/polyfills/timers',
    //         console: 'rollup-plugin-node-polyfills/polyfills/console',
    //         vm: 'rollup-plugin-node-polyfills/polyfills/vm',
    //         zlib: 'rollup-plugin-node-polyfills/polyfills/zlib',
    //         tty: 'rollup-plugin-node-polyfills/polyfills/tty',
    //         domain: 'rollup-plugin-node-polyfills/polyfills/domain',
    //         // buffer: 'rollup-plugin-node-polyfills/polyfills/buffer-es6',
    //         // process: 'rollup-plugin-node-polyfills/polyfills/process-es6',
    //     }
    // },
    resolve: {
        alias: {
            "@web3auth/web3auth": '@web3auth/web3auth/dist/web3auth.umd.min.js', // for Web3Auth Plug&Play to work // https://github.com/Web3Auth/Web3Auth/discussions/558
        }
    },
    optimizeDeps: {
        esbuildOptions: {
            // Node.js global to browser globalThis
            define: {
                global: 'globalThis'
            },
            // Enable esbuild polyfill plugins
            plugins: [
                NodeGlobalsPolyfillPlugin({
                    buffer: true,
                    process: true,
                }),
                NodeModulesPolyfillPlugin()
            ],
            target: 'esnext',
        }
    },
    build: {
        rollupOptions: {
            plugins: [
                // Enable rollup polyfills plugin
                // used during production bundling
                rollupNodePolyFill()
            ],
        },
        target: 'es2020',
    }
})
