// Resolve from the application directory, including GitHub Pages repository prefixes.
const base = new URL('../', import.meta.url);
export const appURL = resource => { const p=String(resource).replace(/^\/+/, ''); return new URL(/^(models|vendor)\//.test(p)?'../../shared/mediapipe/'+p:p,base).href; };
