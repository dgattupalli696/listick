// A streaming service's own name without its plan or store front ("Netflix Standard with Ads", "Apple TV Store", "Disney Plus");
// null for a channel sold inside another. Used by the list builder and Where to watch
const ADDON = /(amazon|apple tv|roku premium) channel$/i, PLAN = /\s+(standard with ads|with ads|premium plus|premium|essential|basic|kids|free|store)$/i;
export const serviceName = (name: string) => (ADDON.test(name) ? null : name.replace(PLAN, '').replace(PLAN, '').replace(/\s+Plus$/, '+'));
