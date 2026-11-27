import { z } from "zod";

// Zod 4 probes `new Function("")` once to decide whether it may compile faster parsers. A strict Content-Security-Policy
// reports that caught probe as a `script-src 'eval'` violation (seen on /admin/import, #862). Form and API schemas here are
// small, so run Zod without the JIT and never touch eval.
//
// Every module that creates a schema imports `z` from here, not from "zod" (#918). The import is what orders the setting
// before the schema in the production build: chunks can run before the first import of main.tsx has had its turn.
z.config({ jitless: true });

export { z };
