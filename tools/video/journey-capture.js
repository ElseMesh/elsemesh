(async () => {
  const app = window.__app;
  if (!app || window.__journey?.status === 'recording') return;
  const originalFrame = app.frame.bind(app);
  const boat = app.boatCtl;
  const avatar = app.avatar;
  const up = app.camera.up;
  const source = app.engine.domElement;
  const captureCanvas = document.createElement('canvas');
  captureCanvas.width = 960;
  captureCanvas.height = 540;
  const captureContext = captureCanvas.getContext('2d');
  let drawing = true;
  const mirror = () => {
    if (!drawing) return;
    captureContext.drawImage(source, 0, 0, 960, 540);
    requestAnimationFrame(mirror);
  };
  requestAnimationFrame(mirror);
  const stream = captureCanvas.captureStream(12);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 3000000 });
  const chunks = [];
  const duration = 95;
  const started = performance.now();
  const lerp = (a, b, u) => a + (b - a) * Math.max(0, Math.min(1, u));
  const { boatAt } = await import('/tools/video/journey-route.mjs');
  // FlyCamera faces local -Z. The boat-side camera stays inside the open
  // water channel, clear of the ramp's stone geometry.
  const pose = (x, y, z, yaw, pitch = 0) => app.fly.setPose(app.camera.position.set(x, y, z), yaw, pitch);
  const vessel = (x, z, heading, velocity = null) => {
    // Keep the controller's vertical buoyancy and angular response. Only the
    // time-lapse guide sets the horizontal course and target heading.
    boat.position.set(x, boat.position.y, z);
    boat.quaternion.setFromAxisAngle(up, heading);
    if (velocity) {
      const speed = Math.hypot(velocity.x, velocity.z);
      const physical = Math.min(8, speed) / Math.max(speed, 0.001);
      boat.velocity.x = velocity.x * physical;
      boat.velocity.z = velocity.z * physical;
      boat.angular.y = Math.max(-0.35, Math.min(0.35, velocity.turnRate));
      boat.driven = true;
      boat.moored = false;
      boat.setInput(0.72, Math.max(-1, Math.min(1, -velocity.turnRate * 3)), 1 / 60);
    } else {
      boat.velocity.x = boat.velocity.z = 0;
      boat.angular.y = 0;
      boat.driven = false;
      boat.moored = true;
      boat.mooring.anchor.set(x, 0, z);
      boat.mooring.heading = heading;
    }
    boat.apply();
  };
  let activated = false;
  let splashed = false;
  const update = (elapsed) => {
    if (elapsed < 7) {
      const p = app.kaiju.pose;
      app.settings.clockMode = 'manual';
      app.settings.timeSpeed = 0;
      app.settings.timeOfDay = 16;
      app.fly.velocity.set(0, 0, 0);
      pose(p.x, 6, p.z - 58, Math.PI, 0.085);
      return;
    }
    const t = elapsed - 7;
    app.settings.clockMode = 'manual';
    app.settings.timeSpeed = 0;
    app.settings.exposure = t >= 80 ? 1.15 : 0.67;
    app.fly.velocity.set(0, 0, 0);
    if (t < 33) {
      const b = boatAt(t);
      app.settings.timeOfDay = lerp(16.0, 16.7, t / 33);
      vessel(b.x, b.z, b.heading, b);
      avatar.cinematic = { mode: 'helm', x: -0.55, y: boat.model.lines.deckY,
        z: 0.22, yaw: 0, seated: true, walk: false };
      const trail = t < 24 ? 10 : 12;
      pose(b.x - Math.sin(b.heading) * trail,
        t < 24 ? 4.5 : 4.8,
        b.z - Math.cos(b.heading) * trail,
        b.heading + Math.PI, 0.08);
    } else if (t < 40) {
      app.settings.timeOfDay = 16.72;
      vessel(-323, 84.5, Math.PI / 2);
      if (t < 37.4) {
        const u = Math.max(0, (t - 33) / 4.4);
        avatar.cinematic = { mode: 'boat', x: lerp(-0.55, 1.4, u), y: boat.model.lines.deckY,
          z: lerp(0.22, -1.2, u), yaw: 0, walk: true };
      } else {
        const u = (t - 37.4) / 2.6;
        avatar.cinematic = { mode: 'shore', x: -323, y: lerp(boat.model.lines.deckY + 0.4,
          -0.8, u) + Math.sin(u * Math.PI) * 0.75,
          z: lerp(82.8, 82.3, u), yaw: 2.2, jump: true, walk: false };
        if (u > 0.68 && !splashed) {
          splashed = true;
          app.spray.emit(app.camera.position.clone().set(-323, 0.1, 82.3),
            app.camera.position.clone().set(0, 4.2, 0), 180, 0.19, 3,
            { jitter: 1.1, spread: 1.8, life: 1.1 });
        }
      }
      pose(-335, 2.3, 80, -1.83, 0.01);
    } else if (t < 42) {
      const u = (t - 40) / 2;
      app.settings.timeOfDay = lerp(16.72, 16.85, u);
      avatar.cinematic = { mode: 'shore', x: lerp(-323, -306, u), y: lerp(-0.8, 1.2, u),
        z: lerp(82.3, 77.5, u), yaw: 2.5, walk: true };
      pose(-335, 2.3, 80, -1.83, 0.01);
    } else if (t < 45) {
      const u = (t - 42) / 3;
      app.settings.timeOfDay = 16.9;
      pose(lerp(-245, -220, u), lerp(5.1, 3.4, u), lerp(45, 0, u), lerp(-0.65, 0, u), 0);
    } else if (t < 50) {
      app.settings.timeOfDay = 17.0;
      if (!activated) { app.caves.activateFinalDoor(); activated = true; }
      pose(-219.2, 3.5, -3, 0, 0);
    } else if (t < 55) {
      const u = (t - 50) / 5;
      app.settings.timeOfDay = 17.05;
      pose(-219, 3.4, lerp(-12, -22, u), 0, 0);
    } else if (t < 59) {
      const u = (t - 55) / 4;
      app.settings.timeOfDay = 17.1;
      app.monorail.car.position.x = -255;
      pose(lerp(-233, -249, u), -14.4, -24, 1.48, 0);
    } else if (t < 69) {
      const u = (t - 59) / 10, x = lerp(-255, -695, u);
      app.settings.timeOfDay = lerp(17.1, 17.55, u);
      app.monorail.car.position.x = x;
      pose(x, -14.45, -30, lerp(1.72, 1.98, u), 0);
    } else if (t < 73) {
      const u = (t - 69) / 4;
      app.settings.timeOfDay = lerp(17.55, 19.0, u);
      app.monorail.car.position.x = lerp(-695, -815, u);
      pose(-700, 4.2, 65, 1.52, -0.03);
    } else if (t < 79) {
      const u = (t - 73) / 6, x = lerp(-815, -1135, u);
      app.settings.timeOfDay = lerp(19.0, 20.7, u);
      app.monorail.car.position.x = x;
      pose(x, -14.45, -30, lerp(1.95, 1.65, u), 0);
    } else if (t < 82) {
      const u = (t - 79) / 3;
      app.settings.timeOfDay = lerp(20.7, 21.1, u);
      app.monorail.car.position.x = -1135;
      pose(lerp(-1118, -1133, u), -14.4, -24, 1.6, 0);
    } else {
      const u = (t - 82) / 6;
      app.settings.timeOfDay = lerp(20.7, 21.0, u);
      pose(lerp(-1162, -1190, u), lerp(38, 46, u), lerp(-30, -45, u), lerp(0.98, 0.82, u), -0.04);
    }
  };
  app.freeCam = true;
  app.fly.enabled = false;
  app.kaiju.elapsed = 18;
  app.kaiju.update(0);
  app.frame = function (dt) {
    const t = Math.min(duration, (performance.now() - started) / 1000);
    update(t);
    return originalFrame(dt);
  };
  update(0);
  window.__journey = { status: 'recording', started, duration, chunks: 0 };
  recorder.ondataavailable = e => {
    if (e.data.size) chunks.push(e.data);
    window.__journey.chunks = chunks.length;
  };
  recorder.onerror = e => { window.__journey.status = 'error'; window.__journey.error = String(e.error || e); };
  recorder.onstop = async () => {
    drawing = false;
    app.frame = originalFrame;
    avatar.cinematic = null;
    stream.getTracks().forEach(track => track.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType });
    window.__journey.status = 'uploading';
    window.__journey.bytes = blob.size;
    try {
      const response = await fetch('http://127.0.0.1:5190/capture', { method: 'POST', body: blob });
      window.__journey.upload = await response.json();
      window.__journey.status = response.ok ? 'saved' : 'error';
    } catch (error) {
      window.__journey.status = 'error';
      window.__journey.error = String(error);
    }
  };
  recorder.start(1000);
  setTimeout(() => recorder.state === 'recording' && recorder.stop(), duration * 1000);
})();
