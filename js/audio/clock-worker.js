// Horloge dans un worker : ses minuteries ne sont pas freinées quand la page est occupée à dessiner.
let timer = null;
self.onmessage = (event) => {
  clearInterval(timer);
  timer = event.data?.interval ? setInterval(() => self.postMessage('tick'), event.data.interval) : null;
};
