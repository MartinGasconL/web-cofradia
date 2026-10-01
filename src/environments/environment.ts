export const environment = {
  production: false,
  // Vacío = mismo origen. En dev, `ng serve` redirige /api al backend (proxy.conf.json),
  // así funciona también desde el móvil en la misma red sin líos de CORS.
  apiBaseUrl: '',
};
