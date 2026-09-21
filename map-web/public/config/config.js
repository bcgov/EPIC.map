// Placeholder for local development: the deployed image has this path replaced
// by the map-web ConfigMap. Leaving the values unset makes config.ts fall back
// to import.meta.env, which is what .env provides when running vite - including
// VITE_MAP_WIDGET_URL, the origin the federated map remote is loaded from.
window._env_ = {};
