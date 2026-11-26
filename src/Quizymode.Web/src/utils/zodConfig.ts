import { z } from "zod";

// Zod 4 probes `new Function("")` once to decide whether it may compile faster parsers. A strict Content-Security-Policy
// reports that caught probe as a `script-src 'eval'` violation (seen on /admin/import, #862). Form and API schemas here are
// small, so run Zod without the JIT and never touch eval. Import this module before any schema is created.
z.config({ jitless: true });
