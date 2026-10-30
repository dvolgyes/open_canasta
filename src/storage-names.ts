/**
 * The prefix of every name that the app stores in the browser: localStorage and sessionStorage keys, the
 * IndexedDB database and the Web Locks. All projects on dvolgyes.github.io share one origin, and so this storage.
 */
export const STORAGE_PREFIX = "dvolgyes-open_canasta.";
export const FREQUENT_NETWORK_CHECKS_KEY = `${STORAGE_PREFIX}settings.frequent-network-checks`;
